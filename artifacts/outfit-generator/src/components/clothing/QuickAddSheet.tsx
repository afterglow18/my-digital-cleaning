/**
 * QuickAddSheet
 *
 * Upload flow (single OR multi-file — same path):
 *   pick ──(files chosen)──► preview (Original | Cleaned ✨ comparison for each file)
 *                            ──(save)──► next file preview OR close
 *
 * For multi-file selections the queue advances automatically after each Save;
 * the user sees "Photo X of Y" in the header.
 */
import React, { useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Check } from "lucide-react";
import {
  useCreateClothingItem,
  getListClothingQueryKey,
  getWardrobeStatsQueryKey,
} from "@/hooks/useLocalDB";
import { useQueryClient } from "@tanstack/react-query";
import { encodeToPng, processClothingImage } from "@/lib/processImage";

// ── Types ──────────────────────────────────────────────────────────────────────

type Category = "outfits" | "beauty" | "toiletries" | "essentials";

const CATEGORY_LABELS: Record<Category, string> = {
  outfits:    "Outfits",
  beauty:     "Beauty",
  toiletries: "Toiletries",
  essentials: "Essentials",
};

type Phase =
  | "pick"       // two-button landing screen
  | "preview"    // side-by-side Original | Cleaned comparison
  | "uploading"; // saving current photo to DB

interface UploadProgress {
  current: number;
  total:   number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Compress to JPEG ≤ 800 px and return a data URL.
 * Used for originals (no transparency).
 */
async function blobToJpegDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      const scale  = Math.min(1, 800 / img.naturalWidth);
      canvas.width  = Math.round(img.naturalWidth  * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Read a Blob directly to a data URL (FileReader).
 * Preserves PNG transparency — used when storing the cleaned version.
 */
function blobToRawDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PHOTO_TIPS = [
  "Photograph individual products or bundle multiple items together.",
  "Lay everything flat on a plain background.",
  "Take the photo from directly above.",
  "Keep all items fully in frame.",
] as const;

const CATEGORY_EXAMPLES: Record<string, { emoji: string; items: string[] }> = {
  outfits:    { emoji: "👗", items: ["Tops", "Bottoms", "Shoes", "Swim", "Undergarments", "Dresses", "Accessories"] },
  beauty:     { emoji: "💄", items: ["Makeup", "Skincare", "Hair", "Jewelry", "Nail Polish"] },
  toiletries: { emoji: "🪥", items: ["Shower", "Dental", "Medicine", "Feminine Care", "First Aid"] },
  essentials: { emoji: "🧳", items: ["Travel Docs", "Tech", "Snacks", "Books", "Accessories"] },
};

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  category:      Category;
  existingCount: number;
  /** Called with the newly created item after a successful upload. */
  onCreated?:    (item: import("@/lib/db").ClothingItem) => void;
}

export function QuickAddSheet({ open, onOpenChange, category, existingCount, onCreated }: Props) {
  const [phase,    setPhase]    = useState<Phase>("pick");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);

  // ── Queue state (multi-file support) ──────────────────────────────────────
  /** All files selected in this session */
  const fileQueueRef   = useRef<File[]>([]);
  /** How many have already been saved */
  const savedCountRef  = useRef(0);
  /** Index of the file currently shown in the preview */
  const [queueIndex,   setQueueIndex]   = useState(0);
  const [queueTotal,   setQueueTotal]   = useState(1);

  // ── Comparison state ───────────────────────────────────────────────────────
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [originalUrl,  setOriginalUrl]  = useState<string | null>(null);
  const [cleanedBlob,  setCleanedBlob]  = useState<Blob | null>(null);
  const [cleanedUrl,   setCleanedUrl]   = useState<string | null>(null);
  const [bgProcessing, setBgProcessing] = useState(false);
  const [bgFailed,     setBgFailed]     = useState(false);
  const [selected,     setSelected]     = useState<"original" | "cleaned">("original");
  /**
   * Generation counter — prevents a stale bg-removal result from a previous
   * photo clobbering the current photo's state when two removals overlap.
   */
  const bgGenRef = useRef(0);

  // Two separate file inputs: one triggers camera, one opens gallery
  const cameraInputRef  = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const createItem  = useCreateClothingItem();
  const queryClient = useQueryClient();

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Revoke open object URLs and reset comparison state. Call before showing next photo. */
  const clearComparison = useCallback(() => {
    bgGenRef.current += 1;   // cancel any in-flight removal
    setBgProcessing(false);  // MUST reset — close can happen mid-removal
    setOriginalBlob(prev => { if (prev) URL.revokeObjectURL(URL.createObjectURL(prev)); return null; });
    setOriginalUrl(prev  => { if (prev) URL.revokeObjectURL(prev); return null; });
    setCleanedBlob(prev  => { if (prev) URL.revokeObjectURL(URL.createObjectURL(prev)); return null; });
    setCleanedUrl(prev   => { if (prev) URL.revokeObjectURL(prev); return null; });
    setBgFailed(false);
    setSelected("original");
  }, []);

  // ── Reset everything and close ─────────────────────────────────────────────
  const handleClose = useCallback(() => {
    bgGenRef.current += 1;
    setBgProcessing(false);
    setOriginalUrl(prev  => { if (prev) URL.revokeObjectURL(prev); return null; });
    setCleanedUrl(prev   => { if (prev) URL.revokeObjectURL(prev); return null; });
    setOriginalBlob(null);
    setCleanedBlob(null);
    setBgFailed(false);
    setSelected("original");
    fileQueueRef.current  = [];
    savedCountRef.current = 0;
    setQueueIndex(0);
    setQueueTotal(1);
    setPhase("pick");
    setErrorMsg(null);
    onOpenChange(false);
  }, [onOpenChange]);

  // ── Save a blob into the DB ────────────────────────────────────────────────
  const saveBlobItem = useCallback(async (
    blob:      Blob,
    itemIndex: number,   // existingCount + position in session
    asPng:     boolean,  // true → raw PNG (transparent); false → JPEG compress
  ): Promise<boolean> => {
    try {
      const dataUrl  = asPng
        ? await blobToRawDataUrl(blob)
        : await blobToJpegDataUrl(blob);
      const label    = CATEGORY_LABELS[category];
      const n        = itemIndex + 1;
      const autoName = n === 1 ? label : `${label} ${n}`;
      await new Promise<void>((resolve, reject) => {
        createItem.mutate(
          { data: { name: autoName, category, imageObjectPath: dataUrl } },
          {
            onSuccess: (createdItem) => {
              queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
              queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
              if (onCreated) onCreated(createdItem);
              resolve();
            },
            onError: reject,
          },
        );
      });
      return true;
    } catch (err) {
      console.error("Upload / create failed:", err);
      return false;
    }
  }, [category, createItem, queryClient, onCreated]);

  // ── Show comparison for a single file ─────────────────────────────────────
  const showComparison = useCallback(async (file: File) => {
    // 1. Encode to normalised PNG for display + fallback storage
    let png: Blob;
    try {
      png = await encodeToPng(file);
    } catch {
      setErrorMsg("Could not read photo. Please try again.");
      setPhase("pick");
      return;
    }

    // 2. Show original immediately and switch to preview
    const objUrl = URL.createObjectURL(png);
    setOriginalBlob(png);
    setOriginalUrl(objUrl);
    setCleanedBlob(null);
    setCleanedUrl(null);
    setBgFailed(false);
    setSelected("original");
    setPhase("preview");

    // 3. Background removal with generation guard
    const myGen = ++bgGenRef.current;
    setBgProcessing(true);
    try {
      const cleaned = await processClothingImage(file);  // bg removal + tight crop/square PNG
      if (bgGenRef.current !== myGen) return;
      const cleanedObjUrl = URL.createObjectURL(cleaned);
      if (bgGenRef.current !== myGen) { URL.revokeObjectURL(cleanedObjUrl); return; }
      setCleanedBlob(cleaned);
      setCleanedUrl(cleanedObjUrl);
      setSelected("cleaned"); // auto-select the cleaned version
    } catch (err) {
      if (bgGenRef.current !== myGen) return;
      console.warn("Background removal failed, keeping original:", err);
      setBgFailed(true);
    } finally {
      if (bgGenRef.current === myGen) setBgProcessing(false);
    }
  }, []);

  // ── Save current comparison, then advance queue ────────────────────────────
  const handleSave = useCallback(async (
    curOriginalBlob: Blob | null,
    curCleanedBlob:  Blob | null,
    curSelected:     "original" | "cleaned",
    curOriginalUrl:  string | null,
    curCleanedUrl:   string | null,
    curQueueIndex:   number,
  ) => {
    const useClean = curSelected === "cleaned" && curCleanedBlob != null;
    const blob     = useClean ? curCleanedBlob! : curOriginalBlob!;

    setPhase("uploading");
    setProgress({ current: curQueueIndex + 1, total: fileQueueRef.current.length });

    const ok = await saveBlobItem(blob, existingCount + savedCountRef.current, useClean);

    if (ok) {
      savedCountRef.current += 1;

      // Revoke current comparison URLs
      if (curOriginalUrl) URL.revokeObjectURL(curOriginalUrl);
      if (curCleanedUrl)  URL.revokeObjectURL(curCleanedUrl);
      setOriginalBlob(null);
      setOriginalUrl(null);
      setCleanedBlob(null);
      setCleanedUrl(null);
      setBgFailed(false);
      setSelected("original");

      const nextIndex = curQueueIndex + 1;
      if (nextIndex < fileQueueRef.current.length) {
        // More photos to review — advance queue
        setQueueIndex(nextIndex);
        setProgress(null);
        showComparison(fileQueueRef.current[nextIndex]);
      } else {
        // All done
        setProgress(null);
        fileQueueRef.current  = [];
        savedCountRef.current = 0;
        setQueueIndex(0);
        setQueueTotal(1);
        setPhase("pick");
        setErrorMsg(null);
        onOpenChange(false);
      }
    } else {
      setProgress(null);
      setErrorMsg("Could not save photo. Please try again.");
      setPhase("preview");
    }
  }, [saveBlobItem, existingCount, showComparison, onOpenChange]);

  // ── File input change ──────────────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // reset so the same file can be picked again
    if (!files.length) return;

    // Reset queue for this session
    bgGenRef.current += 1;
    setBgProcessing(false);
    setOriginalUrl(prev  => { if (prev) URL.revokeObjectURL(prev); return null; });
    setCleanedUrl(prev   => { if (prev) URL.revokeObjectURL(prev); return null; });
    setOriginalBlob(null);
    setCleanedBlob(null);
    setBgFailed(false);
    setSelected("original");

    fileQueueRef.current  = files;
    savedCountRef.current = 0;
    setQueueIndex(0);
    setQueueTotal(files.length);
    setErrorMsg(null);

    showComparison(files[0]);
  };

  if (!open) return null;

  const label       = CATEGORY_LABELS[category];
  const isMulti     = queueTotal > 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[70] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 bg-white border-b-2 border-black flex-shrink-0"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "0.75rem" }}
      >
        <div className="flex flex-col">
          <h2 className="font-display font-bold text-xl uppercase tracking-tight leading-tight">
            {phase === "preview" ? "Choose Version" : `Add ${label}`}
          </h2>
          {phase === "preview" && isMulti && (
            <span className="text-xs text-black/45 font-medium">
              Photo {queueIndex + 1} of {queueTotal}
            </span>
          )}
        </div>
        {(phase === "pick" || phase === "preview") && (
          <button
            onClick={handleClose}
            className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                       bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                       active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        <AnimatePresence mode="wait">

          {/* ── PICK ── */}
          {phase === "pick" && (
            <motion.div
              key="pick"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col p-5 gap-5"
            >
              {errorMsg && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
                  {errorMsg}
                </p>
              )}

              {/* Two big action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex-1 flex flex-col items-center justify-center gap-3 py-8
                             border-4 border-black rounded-2xl bg-primary
                             shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]
                             active:translate-x-1 active:translate-y-1 active:shadow-none transition-all"
                >
                  <span className="text-4xl leading-none">📷</span>
                  <span className="font-display font-bold text-base uppercase tracking-tight text-center leading-tight">
                    Take<br />Photo
                  </span>
                </button>

                <button
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex-1 flex flex-col items-center justify-center gap-3 py-8
                             border-4 border-black rounded-2xl bg-white
                             shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]
                             active:translate-x-1 active:translate-y-1 active:shadow-none transition-all"
                >
                  <span className="text-4xl leading-none">🖼️</span>
                  <span className="font-display font-bold text-base uppercase tracking-tight text-center leading-tight">
                    Upload<br />Photos
                  </span>
                </button>
              </div>

              {/* Photo tips */}
              <div className="border-2 border-black rounded-2xl bg-white p-4
                              shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                <p className="font-display font-bold text-sm uppercase tracking-tight mb-3 flex items-center gap-2">
                  <span>📸</span> PHOTO TIPS
                </p>
                <ul className="flex flex-col gap-2">
                  {PHOTO_TIPS.map((tip) => (
                    <li key={tip} className="flex items-start gap-2 text-sm text-black/70 leading-snug">
                      <span className="mt-0.5 w-4 h-4 border-2 border-black rounded-sm bg-primary
                                       flex items-center justify-center flex-shrink-0">
                        <Check className="w-2.5 h-2.5" strokeWidth={3} />
                      </span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}

          {/* ── PREVIEW (comparison) ── */}
          {phase === "preview" && (
            <motion.div
              key="preview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col p-5 gap-4"
            >
              {/* Subtitle */}
              <p className="text-center text-sm font-medium text-black/55">
                {bgProcessing
                  ? "Removing background… this may take a moment."
                  : bgFailed
                  ? "Background removal failed — original will be saved."
                  : "Tap a version to select it, then save."}
              </p>

              {/* Side-by-side cards */}
              <div className="flex gap-3">

                {/* Original card */}
                <button
                  onClick={() => setSelected("original")}
                  className={`flex-1 flex flex-col overflow-hidden rounded-2xl border-4 transition-all
                    ${selected === "original"
                      ? "border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] scale-[1.02]"
                      : "border-black/25 opacity-55"}`}
                >
                  <div className="w-full aspect-square bg-white overflow-hidden">
                    {originalUrl && (
                      <img
                        src={originalUrl}
                        alt="Original"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="bg-white px-2 py-2 text-center border-t-2 border-inherit">
                    <span className="font-display font-bold text-xs uppercase tracking-tight">
                      Original
                    </span>
                  </div>
                </button>

                {/* Cleaned card */}
                <button
                  onClick={() => cleanedUrl && setSelected("cleaned")}
                  disabled={!cleanedUrl}
                  className={`flex-1 flex flex-col overflow-hidden rounded-2xl border-4 transition-all
                    ${selected === "cleaned" && cleanedUrl
                      ? "border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] scale-[1.02]"
                      : "border-black/25 opacity-55"}`}
                >
                  {/* Checkerboard shows transparency */}
                  <div
                    className="w-full aspect-square overflow-hidden"
                    style={{
                      background:
                        "repeating-conic-gradient(#d1d5db 0% 25%, white 0% 50%) 0 0 / 16px 16px",
                    }}
                  >
                    {bgProcessing ? (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-white/50">
                        <Loader2 className="w-8 h-8 animate-spin text-black/40" strokeWidth={1.5} />
                        <span className="text-[11px] text-black/40 font-medium">Processing…</span>
                      </div>
                    ) : cleanedUrl ? (
                      <img
                        src={cleanedUrl}
                        alt="Cleaned"
                        className="w-full h-full object-contain"
                      />
                    ) : bgFailed ? (
                      <div className="w-full h-full flex items-center justify-center bg-white/50">
                        <span className="text-[11px] text-black/40 font-medium text-center px-3">
                          Could not remove background
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div className="bg-white px-2 py-2 text-center border-t-2 border-inherit">
                    <span className="font-display font-bold text-xs uppercase tracking-tight">
                      Cleaned ✨
                    </span>
                  </div>
                </button>

              </div>

              {/* Save button */}
              <button
                onClick={() =>
                  handleSave(
                    originalBlob, cleanedBlob, selected,
                    originalUrl, cleanedUrl, queueIndex,
                  )
                }
                disabled={bgProcessing}
                className={`w-full py-4 border-4 border-black rounded-2xl font-display font-bold
                  text-base uppercase tracking-tight transition-all
                  ${bgProcessing
                    ? "bg-gray-200 text-black/40 cursor-not-allowed shadow-none"
                    : "bg-primary shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none"}`}
              >
                {bgProcessing
                  ? "Processing…"
                  : isMulti && queueIndex + 1 < queueTotal
                  ? `Save & Next →`
                  : "Save"}
              </button>

              {/* Back / retake link */}
              <button
                onClick={() => {
                  bgGenRef.current += 1;
                  setBgProcessing(false);
                  setOriginalUrl(prev  => { if (prev) URL.revokeObjectURL(prev); return null; });
                  setCleanedUrl(prev   => { if (prev) URL.revokeObjectURL(prev); return null; });
                  setOriginalBlob(null);
                  setCleanedBlob(null);
                  setBgFailed(false);
                  setSelected("original");
                  fileQueueRef.current  = [];
                  savedCountRef.current = 0;
                  setQueueIndex(0);
                  setQueueTotal(1);
                  setPhase("pick");
                }}
                className="text-center text-sm text-black/45 underline underline-offset-2 py-1"
              >
                ← Take a different photo
              </button>
            </motion.div>
          )}

          {/* ── UPLOADING ── */}
          {phase === "uploading" && (
            <motion.div
              key="uploading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center gap-5 p-6"
            >
              <div className="w-28 h-28 border-4 border-black rounded-3xl bg-white
                              flex items-center justify-center
                              shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <Loader2 className="w-12 h-12 animate-spin" strokeWidth={1.5} />
              </div>
              <div className="text-center">
                <p className="font-display font-bold text-2xl uppercase tracking-tight">Saving…</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {progress && progress.total > 1
                    ? `Photo ${progress.current} of ${progress.total}`
                    : "Adding to your cleaning bag."}
                </p>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Hidden file inputs */}
      {/* Camera — opens native camera on mobile (single file only) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />
      {/* Gallery — opens photo library; multiple selection enabled */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleInputChange}
      />
    </motion.div>
  );
}
