/**
 * Vision indexer — extracts searchable labels from item photos.
 *
 * Web path:    48×48 canvas → dominant color names (background-excluded)
 * Native iOS:  canvas color extraction  +  Capacitor VisionPlugin
 *              (VNClassifyImageRequest + VNRecognizeTextRequest) — merged.
 *
 * Version scheme stored on each item (visionVersion):
 *   0  — unanalysed
 *   1  — iOS Vision only, no canvas colors (stale — re-index)
 *   2  — iOS Vision + canvas colors (current native)
 *   4  — web canvas (current algorithm)
 *   5  — web analysed, no labels found (skip re-run)
 *
 * Re-processes anything < 4 on web; anything < 2 on native.
 */

import { Capacitor } from "@capacitor/core";
import { VisionPlugin } from "./visionPlugin";
import { getDB } from "./db";
import { setIndexing } from "./visionIndexSignal";

const NATIVE_VERSION  = 2; // canvas colors now merged on iOS
const WEB_VERSION     = 4;
const WEB_EMPTY_VER   = 5; // don't retry if labels were empty

// ── RGB utilities ─────────────────────────────────────────────────────────────

function rgbToBrightness(r: number, g: number, b: number) {
  return (r + g + b) / 3;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === rn)      h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else                 h = (rn - gn) / d + 4;
  return [((h * 60) + 360) % 360, s, l];
}

/** Map a single pixel to one of the spec color names. */
function classifyPixel(r: number, g: number, b: number): string {
  const brightness = rgbToBrightness(r, g, b);
  const [hue, sat] = rgbToHsl(r, g, b);

  // Grayscale thresholds from spec
  if (brightness < 80)                       return "black";
  if (brightness < 110)                      return "dark grey";
  if (brightness < 175 && sat < 0.20)        return "grey";
  if (brightness < 225 && sat < 0.15)        return "light grey";
  if (brightness >= 225 && sat < 0.12)       return "white";

  // Warm low-saturation tones → beige / tan / brown
  if (sat < 0.35 && hue >= 20 && hue <= 55) {
    if (brightness < 120) return "brown";
    if (brightness < 175) return "tan";
    return "beige";
  }

  // Chromatic by hue
  if (hue < 15 || hue >= 345) return "red";
  if (hue < 45)               return "orange";
  if (hue < 65)               return "yellow";
  if (hue < 150)              return "green";
  if (hue < 200)              return "teal";
  if (hue < 260)              return "blue";
  if (hue < 295)              return "purple";
  return "pink";
}

function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
}

/**
 * Extract dominant foreground color names from a data URL or object URL.
 * Returns color names that cover ≥10% of foreground pixels.
 */
async function extractWebColors(imageUrl: string): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 48;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve([]); return; }
        ctx.drawImage(img, 0, 0, 48, 48);
        const { data } = ctx.getImageData(0, 0, 48, 48);

        // ── Detect background from 4×4 corner patches ────────────────────────
        const cornerPixels: [number, number, number][] = [];
        const addCorner = (sx: number, sy: number) => {
          for (let y = sy; y < sy + 4; y++) {
            for (let x = sx; x < sx + 4; x++) {
              const idx = (y * 48 + x) * 4;
              cornerPixels.push([data[idx], data[idx + 1], data[idx + 2]]);
            }
          }
        };
        addCorner(0, 0); addCorner(44, 0); addCorner(0, 44); addCorner(44, 44);

        // Average corner colour → background estimate
        const total = cornerPixels.length;
        const [bgR, bgG, bgB] = cornerPixels
          .reduce(([ar, ag, ab], [r, g, b]) => [ar + r, ag + g, ab + b], [0, 0, 0])
          .map((v) => Math.round(v / total)) as [number, number, number];
        const BG_THRESHOLD = 40;

        // ── Count foreground pixels by colour name ────────────────────────────
        const counts: Record<string, number> = {};
        let fgTotal = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 128) continue;
          if (colorDist(r, g, b, bgR, bgG, bgB) < BG_THRESHOLD) continue;
          const name = classifyPixel(r, g, b);
          counts[name] = (counts[name] ?? 0) + 1;
          fgTotal++;
        }

        if (fgTotal === 0) { resolve([]); return; }

        const result = Object.entries(counts)
          .filter(([, n]) => n / fgTotal >= 0.10)
          .sort(([, a], [, b]) => b - a)
          .map(([name]) => name);

        resolve(result);
      } catch {
        resolve([]);
      }
    };
    img.onerror = () => resolve([]);
    img.src = imageUrl;
  });
}

// ── Analyse a single item ─────────────────────────────────────────────────────

export async function analyzeItem(id: number, imageUrl: string): Promise<void> {
  const db = await getDB();

  if (Capacitor.isNativePlatform()) {
    try {
      // Fetch image once → reuse blob for both paths
      const res  = await fetch(imageUrl);
      const blob = await res.blob();

      // Run canvas color extraction and Swift Vision in parallel
      const blobUrl = URL.createObjectURL(blob);
      const base64Promise = new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.readAsDataURL(blob);
      });

      const [canvasColors, base64] = await Promise.all([
        extractWebColors(blobUrl),
        base64Promise,
      ]);
      URL.revokeObjectURL(blobUrl);

      const { labels: visionLabels, text } = await VisionPlugin.analyzeImage({ imageData: base64 });

      // Merge: canvas colors first (more reliable for color), then Vision object labels
      const merged = Array.from(new Set([...canvasColors, ...visionLabels]));

      const item = await db.get("clothing_items", id) as any;
      if (item) {
        await db.put("clothing_items", {
          ...item, id,
          visionLabels:  merged,
          visionText:    text,
          visionVersion: NATIVE_VERSION,
        });
      }
    } catch {
      // Fall through silently — text search still works without vision data
    }
  } else {
    // Web — canvas colour extraction
    try {
      const colors = await extractWebColors(imageUrl);
      const item   = await db.get("clothing_items", id) as any;
      if (item) {
        await db.put("clothing_items", {
          ...item, id,
          visionLabels:  colors,
          visionText:    [],
          visionVersion: colors.length > 0 ? WEB_VERSION : WEB_EMPTY_VER,
        });
      }
    } catch {
      // Fall through silently
    }
  }
}

/**
 * Queue a single item for immediate analysis (e.g. after a photo is added or
 * updated). Shows the "Preparing photo search…" toast while work is in progress.
 */
export function queueItemForAnalysis(id: number, imageUrl: string): void {
  setIndexing(true);
  setTimeout(async () => {
    try {
      await analyzeItem(id, imageUrl);
    } finally {
      setIndexing(false);
    }
  }, 0);
}

// ── Background indexer ────────────────────────────────────────────────────────

/**
 * Called once at app startup (from main.tsx).
 * Finds all items that need (re-)indexing and processes them one at a time
 * with a 350ms gap so the UI stays responsive.
 * Shows the "Preparing photo search…" toast while work is in progress.
 */
export function startBackgroundIndexer(): void {
  void (async () => {
    try {
      const db     = await getDB();
      const all    = (await db.getAll("clothing_items")) as any[];
      const native = Capacitor.isNativePlatform();

      const needsIndex = all.filter((item) => {
        if (!item.imageObjectPath) return false;
        const v = item.visionVersion ?? 0;
        if (native) return v < NATIVE_VERSION;
        // On web: re-run anything below WEB_VERSION (threshold improvements)
        // but skip WEB_EMPTY_VER (5) — no labels found, don't retry
        return v > 0 ? v < WEB_VERSION : v === 0;
      });

      if (needsIndex.length === 0) return;

      setIndexing(true);

      for (const item of needsIndex) {
        await analyzeItem(item.id as number, item.imageObjectPath as string);
        await new Promise<void>((r) => setTimeout(r, 350));
      }
    } catch {
      // Non-fatal — search still works on text fields
    } finally {
      setIndexing(false);
    }
  })();
}
