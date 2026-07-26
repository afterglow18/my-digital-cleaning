/**
 * Image Processing Pipeline
 *
 * This module is the designated seam for clothing photo processing.
 *
 * Current behaviour (v1):
 *   encodeToPng(file) — re-encodes any camera JPEG or image file to a
 *   normalised PNG.  This is the only function called by the upload flow.
 *
 * To re-enable AI background removal in a future update:
 *   1. In QuickAddSheet.tsx → handleFile, replace:
 *        const png = await encodeToPng(file);
 *      with:
 *        const png = await processClothingImage(file);
 *      (pass an onProgress callback as the second arg when you restore
 *       the progress UI)
 *   2. Restore the "bg-removing" and "bg-failed" phases in QuickAddSheet.
 *   3. The full pipeline below (removeBackground → cropAndCenterPng) is
 *      already implemented and ready to use — no changes needed here.
 *
 * Background removal uses @imgly/background-removal (browser-side, no API
 * key).  Model files (~5 MB, isnet_quint8) stream from jsDelivr on first
 * call and are cached by the browser thereafter.
 *
 * NOTE: The library's resources.json ships empty, so the built-in progress
 * callback never fires with total > 0.  Callers should drive their own
 * progress UI (e.g. a decelerating ramp) independently.
 *
 * THREADING FIX (iOS / WKWebView):
 *   @imgly/background-removal forces ort.env.wasm.proxy = false internally,
 *   which keeps ONNX inference on the main JS thread and freezes the UI.
 *   We lock the property via Object.defineProperty so imgly's write is
 *   silently ignored and inference runs in a sub-worker instead.
 *   numThreads = 1 avoids the SharedArrayBuffer crash on iOS Safari.
 *   onnxruntime-web is imported dynamically (not at module parse time) to
 *   prevent Vite pre-bundling from triggering a full page reload mid-session.
 */
import { removeBackground } from "@imgly/background-removal";

const CDN_VERSION = "1.7.0";
const PUBLIC_PATH = `https://cdn.jsdelivr.net/npm/@imgly/background-removal@${CDN_VERSION}/dist/web/`;

// ── ONNX Runtime Web worker-proxy fix ────────────────────────────────────────
// @imgly/background-removal internally does `ort.env.wasm.proxy = false` right
// before creating its inference session (it only enables the proxy when WebGPU
// is available, which WKWebView on iOS doesn't support).  That assignment keeps
// inference on the main thread and freezes the UI for 5–30 s.
//
// Fix: use Object.defineProperty with a no-op setter so imgly's write is
// silently ignored and the value stays true → inference runs in a sub-worker.
// numThreads = 1 avoids the SharedArrayBuffer WASM-threading crash on iOS.
//
// onnxruntime-web is imported dynamically (not at module parse time) to
// prevent Vite from pre-bundling it, which caused a full page reload that
// corrupted React's internal dispatcher on first use.

let _ortReady: Promise<void> | null = null;

function ensureOrtConfigured(): Promise<void> {
  if (!_ortReady) {
    _ortReady = (async () => {
      // @ts-ignore — types.d.ts exists but isn't wired through package.json "exports"
      const ort = await import("onnxruntime-web");
      Object.defineProperty(ort.env.wasm, "proxy", {
        get: () => true,
        set: () => {},        // blocks imgly from setting it back to false
        configurable: true,  // allows re-definition if ort is reloaded
      });
      ort.env.wasm.numThreads = 1; // iOS Safari has no SharedArrayBuffer
    })();
  }
  return _ortReady;
}

export type ProgressCallback = (percent: number) => void;

/** Rejects with TimeoutError when bg removal exceeds the allowed duration. */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Background removal timed out after ${ms / 1000}s`);
    this.name = "TimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new TimeoutError(ms)), ms);
    promise.then(
      (v) => { clearTimeout(id); resolve(v); },
      (e) => { clearTimeout(id); reject(e); },
    );
  });
}

/**
 * Encode a File/Blob to PNG via canvas.
 *
 * Used by the v1 upload flow to normalise camera JPEGs before storing.
 * Preserves the original dimensions; does NOT remove the background.
 */
export async function encodeToPng(input: File | Blob): Promise<Blob> {
  const url = URL.createObjectURL(input);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = rej;
      img.src = url;
    });
    const cvs = document.createElement("canvas");
    cvs.width  = img.naturalWidth;
    cvs.height = img.naturalHeight;
    cvs.getContext("2d")!.drawImage(img, 0, 0);
    return await new Promise<Blob>((res, rej) =>
      cvs.toBlob(
        (b) => (b ? res(b) : rej(new Error("canvas.toBlob failed"))),
        "image/png",
      )
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Full pipeline: bg removal → tight crop → square transparent PNG.
 *
 * Not called by the v1 upload flow.  Ready to be wired back in —
 * see the module-level comment for instructions.
 *
 * Rejects with TimeoutError after `timeoutMs` milliseconds (default 90 s).
 */
export async function processClothingImage(
  input: File | Blob,
  onProgress?: ProgressCallback,
  timeoutMs = 90_000,
): Promise<Blob> {
  const run = async () => {
    // Ensure ONNX runtime is configured for worker-proxy mode before imgly
    // gets a chance to force proxy = false on the main thread.
    await ensureOrtConfigured();

    const bgFree = await removeBackground(input, {
      publicPath: PUBLIC_PATH,
      model: "isnet_quint8",
      output: { format: "image/png", quality: 1 },
      // total is always 0 due to empty resources.json — treat as a pulse only
      progress: (_key: string, current: number, total: number) => {
        if (onProgress) {
          onProgress(total > 0 ? Math.min(80, Math.round((current / total) * 80)) : -1);
        }
      },
    });

    onProgress?.(-1); // pulse: inference done, cropping next
    return cropAndCenterPng(bgFree);
  };

  return withTimeout(run(), timeoutMs);
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function cropAndCenterPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);

  const analysisCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = analysisCanvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  ctx.drawImage(bitmap, 0, 0);

  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const { data, width, height } = imageData;

  let minX = width, minY = height, maxX = 0, maxY = 0;
  let hasContent = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        hasContent = true;
      }
    }
  }

  if (!hasContent) return blob;

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const pad   = Math.round(Math.max(cropW, cropH) * 0.06);
  const size  = Math.max(cropW, cropH) + pad * 2;

  const out    = new OffscreenCanvas(size, size);
  const outCtx = out.getContext("2d") as OffscreenCanvasRenderingContext2D;

  outCtx.drawImage(
    analysisCanvas,
    minX, minY, cropW, cropH,
    Math.round((size - cropW) / 2),
    Math.round((size - cropH) / 2),
    cropW, cropH,
  );

  return out.convertToBlob({ type: "image/png", quality: 1 });
}
