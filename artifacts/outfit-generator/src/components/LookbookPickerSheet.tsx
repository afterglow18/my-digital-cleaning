/**
 * LookbookPickerSheet — lets the user add or remove the current item
 * from any saved group (lookbook).
 *
 * Shows every SavedOutfit with:
 *   - up to 3 item thumbnails
 *   - group name
 *   - filled checkmark when the item is already a member
 *
 * Tapping a group adds or removes the item.
 */
import React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, BookOpen } from "lucide-react";
import { BlobImg } from "@/components/BlobImg";
import {
  useListOutfits,
  useAddItemToOutfit,
  useRemoveItemFromOutfit,
  getListOutfitsQueryKey,
  type ClothingItem,
} from "@/hooks/useLocalDB";
import { useQueryClient } from "@tanstack/react-query";

interface LookbookPickerSheetProps {
  item:    ClothingItem;
  onClose: () => void;
}

export function LookbookPickerSheet({ item, onClose }: LookbookPickerSheetProps) {
  const { data: outfits, isLoading } = useListOutfits();
  const addItem    = useAddItemToOutfit();
  const removeItem = useRemoveItemFromOutfit();
  const qc         = useQueryClient();

  const invalidate = () => qc.invalidateQueries({ queryKey: getListOutfitsQueryKey() });

  const handleToggle = (outfitId: number, inGroup: boolean) => {
    if (inGroup) {
      removeItem.mutate({ id: outfitId, itemId: item.id }, { onSuccess: invalidate });
    } else {
      addItem.mutate({ id: outfitId, data: { itemId: item.id } }, { onSuccess: invalidate });
    }
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[80] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-4
                   bg-white border-b-2 border-black flex-shrink-0"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "0.75rem" }}
      >
        <div>
          <h2 className="font-display font-bold text-xl uppercase tracking-tight">Add to Lookbook</h2>
          <p className="text-xs text-black/40 font-medium mt-0.5">Tap a group to add or remove</p>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                     bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                     active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 bg-muted animate-pulse border-2 border-black rounded-xl" />
          ))
        ) : !outfits?.length ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
            <BookOpen className="w-10 h-10 text-black/20 mb-3" />
            <p className="font-display font-bold text-lg uppercase tracking-tight mb-1">No Lookbooks Yet</p>
            <p className="text-xs text-black/40 font-medium">Create one from the Generate screen first.</p>
          </div>
        ) : (
          outfits.map((outfit) => {
            const inGroup   = outfit.items?.some((i) => i.id === item.id) ?? false;
            const thumbs    = (outfit.items ?? []).slice(0, 3);
            const isPending = addItem.isPending || removeItem.isPending;

            return (
              <button
                key={outfit.id}
                onClick={() => handleToggle(outfit.id, inGroup)}
                disabled={isPending}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border-2 transition-all text-left
                  ${inGroup
                    ? "border-black bg-primary shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                    : "border-black/30 bg-white hover:border-black/60"}`}
              >
                {/* Thumbnails */}
                <div className="flex -space-x-2 shrink-0">
                  {thumbs.length > 0 ? (
                    thumbs.map((thumb, idx) => (
                      <div
                        key={thumb.id}
                        className="w-12 h-12 border-2 border-white rounded-lg overflow-hidden bg-[#F5EDD8] shadow-sm"
                        style={{ zIndex: thumbs.length - idx }}
                      >
                        {thumb.imageObjectPath ? (
                          <BlobImg
                            src={thumb.imageObjectPath}
                            alt={thumb.name}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-[8px] text-black/30 font-bold">—</span>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="w-12 h-12 border-2 border-black/20 rounded-lg bg-[#F5EDD8] flex items-center justify-center">
                      <span className="text-[8px] text-black/25 font-bold">—</span>
                    </div>
                  )}
                </div>

                {/* Name + count */}
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-base uppercase tracking-tight truncate">
                    {outfit.name}
                  </p>
                  <p className="text-[10px] text-black/40 font-medium">
                    {outfit.items?.length ?? 0} item{(outfit.items?.length ?? 0) !== 1 ? "s" : ""}
                  </p>
                </div>

                {/* Checkmark */}
                <div
                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-all
                    ${inGroup ? "border-black bg-black" : "border-black/30 bg-white"}`}
                >
                  {inGroup && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div
        className="flex-shrink-0 px-4 py-4 bg-white border-t-2 border-black"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl border-2 border-black bg-primary font-bold uppercase text-sm
                     tracking-wide shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                     active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
        >
          Done
        </button>
      </div>
    </motion.div>,
    document.body,
  );
}
