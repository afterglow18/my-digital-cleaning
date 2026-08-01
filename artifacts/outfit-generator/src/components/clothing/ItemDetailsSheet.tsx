/**
 * ItemDetailsSheet — full-screen overlay showing a clothing item's details.
 * Every field is optional and editable. A "Save" button appears only when
 * the form is dirty. Delete is always available.
 *
 * "Clean Up Photo" flow:
 *   1. User taps the button — bg removal runs on-device (WASM, no API key).
 *   2. When ready a compare overlay slides up: Original vs Cleaned side-by-side.
 *   3. User taps a card (pink ring + checkmark) then taps the matching save button.
 *   4. Chosen data URL is written to liveImagePath immediately (no flash), and
 *      the DB mutation fires in the background.
 */
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Converts a data URL to a blob: URL for display.
 * On iOS WKWebView, embedding large base64 strings directly in <img src>
 * can spike memory and kill the WebContent process (white screen).
 * A blob: URL keeps the bytes in memory as a Blob — much cheaper on the DOM.
 */
function useBlobUrl(dataUrl: string | null | undefined): string | null {
  const blobUrlRef = useRef<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    // Revoke any previous blob URL to avoid leaks
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    if (!dataUrl) { setBlobUrl(null); return; }

    // Non-data URLs (object-storage paths, https://) are fine as-is
    if (!dataUrl.startsWith("data:")) { setBlobUrl(dataUrl); return; }

    let cancelled = false;
    fetch(dataUrl)
      .then(r => r.blob())
      .then(blob => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setBlobUrl(url);
      })
      .catch(() => {
        if (!cancelled) setBlobUrl(dataUrl); // fall back to data URL on error
      });

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [dataUrl]);

  return blobUrl;
}
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Heart, Trash2, Save, ChevronDown, Sparkles, Loader2, Check,
} from "lucide-react";
import {
  type ClothingItem,
  type ClothingItemUpdateCategory,
  useUpdateClothingItem,
  useDeleteClothingItem,
  getListClothingQueryKey,
  getListOutfitsQueryKey,
  getWardrobeStatsQueryKey,
} from "@/hooks/useLocalDB";
import { useQueryClient } from "@tanstack/react-query";
import { getImageUrl } from "@/lib/utils";
import { processClothingImage, cancelBackgroundRemoval } from "@/lib/processImage";

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "outfits",    label: "Supplies" },
  { value: "beauty",     label: "Tools"    },
  { value: "essentials", label: "Areas"    },
];

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        className="w-full border-2 border-black rounded-lg px-3 py-2 text-sm font-medium
                   bg-white focus:outline-none focus:ring-2 focus:ring-primary
                   placeholder:font-normal placeholder:text-black/25"
      />
    </div>
  );
}

type SelectOption = string | { value: string; label: string };

function SelectField({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: SelectOption[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none border-2 border-black rounded-lg px-3 py-2 pr-8
                     text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary
                     cursor-pointer"
        >
          {options.map((o) => {
            const v = typeof o === "string" ? o : o.value;
            const l = typeof o === "string" ? (o || `— ${label} —`) : o.label;
            return <option key={v} value={v}>{l}</option>;
          })}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-black/40" />
      </div>
    </div>
  );
}

// ── Times Used editable field ─────────────────────────────────────────────────
function TimesUsedField({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const start = () => { setDraft(String(value)); setEditing(true); };
  const commit = () => {
    const n = parseInt(draft, 10);
    if (!isNaN(n) && n >= 0 && n !== value) onCommit(n);
    setEditing(false);
  };

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">Times Cleaned</span>
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          min={0}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          className="border-2 border-black rounded-lg px-3 py-2 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary w-full"
        />
      ) : (
        <button
          onClick={start}
          className="border-2 border-black/20 rounded-lg px-3 py-2 text-sm font-medium bg-white/50 text-left hover:border-black/40 transition-colors"
        >
          {value}
        </button>
      )}
    </div>
  );
}

// ── Compare Overlay ───────────────────────────────────────────────────────────

interface CompareOverlayProps {
  originalUrl: string;
  cleanedUrl:  string;
  onConfirm:   (choice: "original" | "cleaned") => void;
  onDismiss:   () => void;
}

function CompareOverlay({ originalUrl, cleanedUrl, onConfirm, onDismiss }: CompareOverlayProps) {
  const [selected, setSelected] = useState<"original" | "cleaned">("cleaned");

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[75] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 bg-white border-b-2 border-black flex-shrink-0"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "0.75rem" }}
      >
        <div>
          <h2 className="font-display font-bold text-xl uppercase tracking-tight leading-tight">
            Choose Photo
          </h2>
          <p className="text-xs text-black/45 font-medium mt-0.5">
            Tap to select, then save.
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                     bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                     active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Cards */}
      <div className="flex-1 flex flex-col justify-center px-5 gap-4">
        <div className="flex gap-3">

          {/* Original */}
          <button
            onClick={() => setSelected("original")}
            className={`flex-1 flex flex-col overflow-hidden rounded-2xl border-4 transition-all
              ${selected === "original"
                ? "border-[#E91E8C] shadow-[4px_4px_0px_0px_rgba(233,30,140,0.5)] scale-[1.02]"
                : "border-black/20 opacity-60"}`}
          >
            <div className="w-full aspect-square bg-white overflow-hidden relative">
              <img
                src={getImageUrl(originalUrl)!}
                alt="Original"
                className="w-full h-full object-cover"
              />
              {selected === "original" && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#E91E8C]
                                flex items-center justify-center shadow-md">
                  <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                </div>
              )}
            </div>
            <div className={`px-2 py-2 text-center border-t-4
              ${selected === "original" ? "border-[#E91E8C] bg-pink-50" : "border-black/20 bg-white"}`}>
              <span className="font-display font-bold text-xs uppercase tracking-tight">
                Original
              </span>
            </div>
          </button>

          {/* Cleaned */}
          <button
            onClick={() => setSelected("cleaned")}
            className={`flex-1 flex flex-col overflow-hidden rounded-2xl border-4 transition-all
              ${selected === "cleaned"
                ? "border-[#E91E8C] shadow-[4px_4px_0px_0px_rgba(233,30,140,0.5)] scale-[1.02]"
                : "border-black/20 opacity-60"}`}
          >
            {/* Checkerboard shows PNG transparency */}
            <div
              className="w-full aspect-square overflow-hidden relative"
              style={{
                background: "repeating-conic-gradient(#d1d5db 0% 25%, white 0% 50%) 0 0 / 16px 16px",
              }}
            >
              <img
                src={getImageUrl(cleanedUrl)!}
                alt="Cleaned"
                className="w-full h-full object-contain"
              />
              {selected === "cleaned" && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#E91E8C]
                                flex items-center justify-center shadow-md">
                  <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                </div>
              )}
            </div>
            <div className={`px-2 py-2 text-center border-t-4
              ${selected === "cleaned" ? "border-[#E91E8C] bg-pink-50" : "border-black/20 bg-white"}`}>
              <span className="font-display font-bold text-xs uppercase tracking-tight">
                Cleaned ✨
              </span>
            </div>
          </button>

        </div>
      </div>

      {/* Footer buttons */}
      <div
        className="flex-shrink-0 px-5 pb-6 flex flex-col gap-2 bg-[#f9f4ee]"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={() => onConfirm("cleaned")}
          className={`w-full py-4 border-4 rounded-2xl font-display font-bold text-sm uppercase
            tracking-tight transition-all
            ${selected === "cleaned"
              ? "border-black bg-primary shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none"
              : "border-black/25 bg-white text-black/40"}`}
        >
          Save Cleaned Version ✨
        </button>
        <button
          onClick={() => onConfirm("original")}
          className={`w-full py-3.5 border-4 rounded-2xl font-display font-bold text-sm uppercase
            tracking-tight transition-all
            ${selected === "original"
              ? "border-black bg-primary shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none"
              : "border-black/25 bg-white text-black/50"}`}
        >
          Keep Original
        </button>
      </div>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface ItemDetailsSheetProps {
  item:      ClothingItem | null;
  onClose:   () => void;
  onDeleted?: () => void;
}

interface FormState {
  name: string; brand: string; color: string; size: string;
  season: string; occasion: string; purchasePrice: string;
  purchaseDate: string; notes: string; isFavorite: boolean; category: string;
}

function toForm(item: ClothingItem): FormState {
  return {
    name:          item.name          ?? "",
    brand:         item.brand         ?? "",
    color:         item.color         ?? "",
    size:          item.size          ?? "",
    season:        item.season        ?? "",
    occasion:      item.occasion      ?? "",
    purchasePrice: item.purchasePrice ?? "",
    purchaseDate:  item.purchaseDate  ?? "",
    notes:         item.notes         ?? "",
    isFavorite:    item.isFavorite    ?? false,
    category:      item.category      ?? "",
  };
}

function isDirty(form: FormState, item: ClothingItem): boolean {
  return (
    form.name          !== (item.name          ?? "") ||
    form.brand         !== (item.brand         ?? "") ||
    form.color         !== (item.color         ?? "") ||
    form.size          !== (item.size          ?? "") ||
    form.season        !== (item.season        ?? "") ||
    form.occasion      !== (item.occasion      ?? "") ||
    form.purchasePrice !== (item.purchasePrice ?? "") ||
    form.purchaseDate  !== (item.purchaseDate  ?? "") ||
    form.notes         !== (item.notes         ?? "") ||
    form.isFavorite    !== (item.isFavorite    ?? false) ||
    form.category      !== (item.category      ?? "")
  );
}

export function ItemDetailsSheet({ item, onClose, onDeleted }: ItemDetailsSheetProps) {
  const [form,             setForm]             = useState<FormState | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // "Clean Up Photo" state
  const [bgProcessing,   setBgProcessing]   = useState(false);
  const [bgError,        setBgError]        = useState<string | null>(null);
  const [hasBeenCleaned, setHasBeenCleaned] = useState(() => !!item?.hasBeenCleaned);
  /** Set to true when the user taps "Keep Original" mid-processing — the WASM
   *  result is discarded when it eventually arrives. */
  const cancelledRef = useRef(false);
  /**
   * Slides up when bg removal finishes — holds both URLs for the compare UI.
   * Null while the overlay is closed.
   */
  const [compareData, setCompareData] = useState<{
    originalUrl: string;
    cleanedUrl:  string;
  } | null>(null);
  /**
   * Shadows item.imageObjectPath after the user confirms a choice.
   * Set optimistically so the photo updates instantly, before the DB write lands.
   */
  const [liveImagePath, setLiveImagePath] = useState<string | null>(null);

  const updateItem  = useUpdateClothingItem();
  const deleteItem  = useDeleteClothingItem();
  const queryClient = useQueryClient();

  // Reset everything when the viewed item changes
  useEffect(() => {
    if (item) setForm(toForm(item));
    setShowDeleteConfirm(false);
    setBgProcessing(false);
    setBgError(null);
    setCompareData(null);
    setLiveImagePath(null);
    setHasBeenCleaned(false);
    cancelledRef.current = false;
  }, [item?.id]);

  // ── "Clean Up Photo" — runs bg removal, then opens compare overlay ─────────
  const handleCleanUpPhoto = async () => {
    const srcPath = liveImagePath ?? item?.imageObjectPath;
    if (!srcPath || !item) return;
    cancelledRef.current = false;
    setBgProcessing(true);
    setBgError(null);
    try {
      // Convert existing data URL → Blob for processClothingImage
      const res  = await fetch(srcPath);
      const blob = await res.blob();
      // bg removal + tight centre crop (pure WASM, on-device)
      const cleaned = await processClothingImage(blob);
      // Read result as a data URL preserving PNG transparency
      const cleanedUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(cleaned);
      });
      // Discard result if user already chose to keep original mid-processing
      if (cancelledRef.current) return;
      // Open compare overlay
      setCompareData({ originalUrl: srcPath, cleanedUrl });
    } catch (err) {
      if (cancelledRef.current) return; // user cancelled — don't show error
      console.error("Background removal failed:", err);
      setBgError("Could not remove background. Please try again.");
    } finally {
      setBgProcessing(false);
    }
  };

  // ── User chose "Keep Original" while cleaning was still running ───────────
  const handleCancelCleaning = () => {
    cancelledRef.current = true;
    cancelBackgroundRemoval(); // terminates the worker immediately — no wasted CPU
    setBgProcessing(false);
    setBgError(null);
  };

  // ── User confirmed a choice in the compare overlay ────────────────────────
  const handleCompareConfirm = (choice: "original" | "cleaned") => {
    if (!compareData || !item) return;
    const chosen = choice === "cleaned" ? compareData.cleanedUrl : compareData.originalUrl;

    // 1. Optimistic update — photo changes on screen immediately, no flash
    setLiveImagePath(chosen);
    setCompareData(null);
    setHasBeenCleaned(true);

    // 2. DB write fires in the background — UI doesn't wait
    updateItem.mutate(
      { id: item.id, data: { imageObjectPath: chosen, hasBeenCleaned: true } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
        },
        onError: (err) => {
          // Silently log — liveImagePath is already updated so UX isn't disrupted
          console.error("Failed to persist image choice:", err);
        },
      },
    );
  };

  // ── Form field save ────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!item || !form) return;
    updateItem.mutate(
      {
        id: item.id,
        data: {
          name:          form.name.trim() || item.name,
          brand:         form.brand.trim(),
          color:         form.color.trim(),
          size:          form.size.trim(),
          season:        form.season,
          occasion:      form.occasion,
          purchasePrice: form.purchasePrice.trim(),
          purchaseDate:  form.purchaseDate.trim(),
          notes:         form.notes.trim(),
          isFavorite:    form.isFavorite,
          category:      (form.category || item.category) as ClothingItemUpdateCategory,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
          onClose();
        },
      },
    );
  };

  const handleDelete = () => {
    if (!item) return;
    deleteItem.mutate(
      { id: item.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
          onDeleted?.();
          onClose();
        },
      },
    );
  };

  const patch = (key: keyof FormState) => (value: string | boolean) =>
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);

  if (!item || !form) return null;

  const dirty         = isDirty(form, item);
  const displayImage  = liveImagePath ?? item.imageObjectPath;
  const imgSrc        = useBlobUrl(displayImage);

  return createPortal(
    <>
      <motion.div
        initial={{ opacity: 0, y: "100%" }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 240 }}
        className="fixed inset-0 z-[65] flex flex-col max-w-md mx-auto bg-[#f9f4ee] overflow-y-auto"
      >
        {/* ── Header ── */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-4
                     bg-white border-b-2 border-black flex-shrink-0"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "0.75rem" }}
        >
          <h2 className="font-display font-bold text-xl uppercase tracking-tight">
            Item Details
          </h2>
          <div className="flex items-center gap-2">
            {/* Favourite toggle */}
            <button
              onClick={() => {
                const next = !form.isFavorite;
                patch("isFavorite")(next);
                updateItem.mutate(
                  { id: item.id, data: { isFavorite: next } },
                  {
                    onSuccess: () => {
                      queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
                      queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
                      queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
                    },
                  },
                );
              }}
              className={`w-9 h-9 border-2 border-black rounded-full flex items-center justify-center transition-all
                          ${form.isFavorite
                            ? "bg-red-500 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                            : "bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"}`}
              title="Favourite"
            >
              <Heart
                className="w-4 h-4"
                fill={form.isFavorite ? "white" : "none"}
                stroke={form.isFavorite ? "white" : "currentColor"}
              />
            </button>
            {/* Close */}
            <button
              onClick={onClose}
              className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                         bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                         active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Photo ── */}
        {displayImage && (
          <>
            <div
              className="w-full h-52 flex-shrink-0 relative"
              style={{
                backgroundImage: "repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)",
                backgroundSize: "16px 16px",
              }}
            >
              <img
                src={imgSrc ?? undefined}
                alt={item.name}
                className="w-full h-full object-contain"
              />
              {/* Spinner overlay while bg removal is running */}
              {bgProcessing && (
                <div className="absolute inset-0 bg-white/70 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-9 h-9 animate-spin text-black/50" strokeWidth={1.5} />
                  <span className="text-xs font-medium text-black/50">Analysing photo…</span>
                  <button
                    onClick={handleCancelCleaning}
                    className="mt-1 px-3 py-1.5 rounded-lg border-2 border-black bg-white
                               text-xs font-bold uppercase tracking-tight
                               shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                               active:translate-x-0.5 active:translate-y-0.5 active:shadow-none
                               transition-all"
                  >
                    Keep Original
                  </button>
                </div>
              )}
            </div>

            {/* "Clean Up Photo" action row */}
            <div className="flex-shrink-0 border-b-2 border-black bg-white px-4 py-2.5 flex items-center gap-3">
              <button
                onClick={handleCleanUpPhoto}
                disabled={bgProcessing || hasBeenCleaned}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-black
                  text-xs font-bold uppercase tracking-tight transition-all
                  ${bgProcessing || hasBeenCleaned
                    ? "bg-gray-100 text-black/30 cursor-not-allowed"
                    : "bg-primary shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"}`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                {bgProcessing ? "Processing…" : hasBeenCleaned ? "Already Cleaned ✓" : "Clean Up Photo ✨"}
              </button>
              {bgError && (
                <span className="text-xs text-red-600 font-medium flex-1">{bgError}</span>
              )}
              {!bgError && liveImagePath && !bgProcessing && (
                <span className="text-xs text-green-700 font-medium">Photo updated ✓</span>
              )}
            </div>
          </>
        )}

        {/* ── Form ── */}
        <div className="flex-1 px-4 py-5 flex flex-col gap-4">

          <Field
            label="Item Name"
            value={form.name}
            onChange={patch("name") as (v: string) => void}
            placeholder="e.g. All-Purpose Cleaner"
          />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand" value={form.brand} onChange={patch("brand") as (v: string) => void} placeholder="Method, Mrs. Meyer's…" />
            <Field label="Color" value={form.color} onChange={patch("color") as (v: string) => void} placeholder="Blue, Clear…" />
          </div>

          <Field label="Size / Volume" value={form.size} onChange={patch("size") as (v: string) => void} placeholder="30ml, 500ml, Full Size…" />

          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Room / Location" value={form.season}   onChange={patch("season") as (v: string) => void}   options={LOCATION_OPTIONS} />
            <SelectField label="Frequency"        value={form.occasion} onChange={patch("occasion") as (v: string) => void} options={FREQUENCY_OPTIONS} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Purchase Price" value={form.purchasePrice} onChange={patch("purchasePrice") as (v: string) => void} placeholder="$9.99" />
            <Field label="Date"  value={form.purchaseDate}  onChange={patch("purchaseDate") as (v: string) => void}  type="date" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => patch("notes")(e.target.value)}
              placeholder="Dilution ratio, scent, restock reminder…"
              rows={3}
              className="w-full border-2 border-black rounded-lg px-3 py-2 text-sm font-medium
                         bg-white focus:outline-none focus:ring-2 focus:ring-primary resize-none
                         placeholder:font-normal placeholder:text-black/25"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Category"
              value={form.category}
              onChange={patch("category") as (v: string) => void}
              options={CATEGORY_OPTIONS}
            />
            <TimesUsedField
              value={item.timesWorn ?? 0}
              onCommit={(n) => updateItem.mutate(
                { id: item.id, data: { timesWorn: n } },
                { onSuccess: () => {
                    queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
                    queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
                }}
              )}
            />
          </div>

        </div>

        {/* ── Footer actions ── */}
        <div className="sticky bottom-0 px-4 py-4 bg-white border-t-2 border-black flex-shrink-0 flex flex-col gap-2">

          <AnimatePresence>
            {dirty && (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                onClick={handleSave}
                disabled={updateItem.isPending}
                className="w-full btn-brutalist py-3 rounded-xl flex items-center justify-center gap-2 text-sm"
              >
                <Save className="w-4 h-4" />
                {updateItem.isPending ? "Saving…" : "Save Changes"}
              </motion.button>
            )}
          </AnimatePresence>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm
                         font-bold uppercase border-2 border-black/20 text-black/35
                         hover:border-red-500 hover:text-red-600 transition-all"
            >
              <Trash2 className="w-4 h-4" />
              Delete from Cleaning Forever
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-3 rounded-xl text-sm font-bold uppercase border-2 border-black bg-white
                           shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                           active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteItem.isPending}
                className="flex-1 py-3 rounded-xl text-sm font-bold uppercase border-2 border-red-600
                           bg-red-500 text-white
                           shadow-[2px_2px_0px_0px_rgba(185,28,28,1)]
                           active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all
                           disabled:opacity-50"
              >
                {deleteItem.isPending ? "Deleting…" : "Yes, Delete Forever"}
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Compare Overlay (slides up above ItemDetailsSheet) ── */}
      <AnimatePresence>
        {compareData && (
          <CompareOverlay
            originalUrl={compareData.originalUrl}
            cleanedUrl={compareData.cleanedUrl}
            onConfirm={handleCompareConfirm}
            onDismiss={() => setCompareData(null)}
          />
        )}
      </AnimatePresence>
    </>,
    document.body,
  );
}
