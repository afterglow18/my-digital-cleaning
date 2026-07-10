import React, { useState } from "react";
import {
  useListOutfits,
  useDeleteOutfit,
  useAddItemToOutfit,
  getListOutfitsQueryKey,
  ClothingItem,
} from "@workspace/api-client-react";
import { Trash2, Bookmark, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getImageUrl } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useEntitlements } from "@/hooks/useEntitlements";
import { UpgradeSheet } from "@/components/paywall/UpgradeSheet";
import { FREE_OUTFIT_LIMIT } from "@/lib/entitlements";
import { QuickAddSheet } from "@/components/clothing/QuickAddSheet";
import { ItemDetailsSheet } from "@/components/clothing/ItemDetailsSheet";

const SLOT_ORDER = ["tops", "bottoms", "shoes", "dresses", "outerwear", "accessories"] as const;
type SlotKey = (typeof SLOT_ORDER)[number];

const SLOT_LABELS: Record<SlotKey, string> = {
  tops: "Top",
  bottoms: "Bottom",
  shoes: "Shoes",
  dresses: "Dress",
  outerwear: "Jacket",
  accessories: "Acc",
};

function ItemPhoto({ item, size = "md" }: { item: ClothingItem; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "lg" ? "h-32" : size === "md" ? "h-24" : "h-16";
  return (
    <div
      className={`w-full ${sizeClass} border-2 border-black overflow-hidden relative`}
      style={{ background: "#FDECEF" }}
    >
      {item.imageObjectPath ? (
        <img
          src={getImageUrl(item.imageObjectPath)!}
          alt={item.name}
          className="w-full h-full object-contain"
          style={{ objectFit: "contain", objectPosition: "center" }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center p-1">
          <span className="text-[9px] font-bold uppercase text-center leading-tight text-black/30">—</span>
        </div>
      )}
    </div>
  );
}

export default function SavedPage() {
  const { data: outfits, isLoading } = useListOutfits();
  const deleteOutfit = useDeleteOutfit();
  const addItemToOutfit = useAddItemToOutfit();
  const queryClient = useQueryClient();
  const { tier } = useEntitlements();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [addAccessoryToId, setAddAccessoryToId] = useState<number | null>(null);
  const [detailsItem, setDetailsItem] = useState<ClothingItem | null>(null);

  const isFree = tier === "free";
  const outfitCount = outfits?.length ?? 0;
  const atLimit = isFree && outfitCount >= FREE_OUTFIT_LIMIT;

  const handleDelete = (id: number) => {
    deleteOutfit.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
        },
      }
    );
  };

  const handleAccessoryCreated = (item: ClothingItem) => {
    if (addAccessoryToId == null) return;
    addItemToOutfit.mutate(
      { id: addAccessoryToId, itemId: item.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
        },
      }
    );
  };

  return (
    <div className="min-h-full flex flex-col pt-8 px-4 pb-8 bg-secondary/10 relative">
      <header className="mb-6">
        <h1 className="text-4xl font-display font-bold uppercase tracking-tighter mb-1">Lookbook</h1>
        <div className="flex items-center justify-between">
          <p className="font-medium text-muted-foreground text-sm">Hall of fame.</p>

          {/* Free tier outfit usage badge */}
          {isFree && outfitCount > 0 && (
            <button
              onClick={() => setShowUpgrade(true)}
              className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full
                          border-2 transition-colors
                          ${atLimit
                            ? "bg-black text-white border-black"
                            : outfitCount >= FREE_OUTFIT_LIMIT - 1
                            ? "bg-primary border-black text-black"
                            : "bg-white border-black/20 text-black/40 hover:border-black/40"
                          }`}
            >
              {outfitCount}/{FREE_OUTFIT_LIMIT} saved
            </button>
          )}
        </div>
      </header>

      {/* Upgrade nudge when at outfit limit */}
      {atLimit && !isLoading && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 border-2 border-black rounded-xl bg-primary p-4
                     shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
        >
          <p className="font-display font-bold text-sm uppercase tracking-tight">
            🔓 Lookbook is full
          </p>
          <p className="text-xs text-black/60 mt-1 mb-3 leading-snug">
            You've saved {FREE_OUTFIT_LIMIT} outfits — the free limit.
            Unlock Forever to save unlimited looks.
          </p>
          <button
            onClick={() => setShowUpgrade(true)}
            className="w-full py-2.5 rounded-lg border-2 border-black bg-black text-white
                       font-bold uppercase text-xs tracking-wide
                       shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]
                       active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
          >
            Unlock Forever – $4.99
          </button>
        </motion.div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-52 bg-muted animate-pulse border-2 border-black rounded-xl" />
          ))}
        </div>
      ) : outfits && outfits.length > 0 ? (
        <div className="flex flex-col gap-6">
          {outfits.map((outfit) => {
            // Group items by category for structured display
            const byCategory = (outfit.items ?? []).reduce<Partial<Record<SlotKey, ClothingItem>>>(
              (acc, item) => {
                const key = item.category as SlotKey;
                if (SLOT_ORDER.includes(key) && !acc[key]) acc[key] = item;
                return acc;
              },
              {}
            );

            // Primary slots: the "look" — tops/dresses as hero, bottoms, shoes
            const heroItem = byCategory["dresses"] ?? byCategory["tops"];
            const bottomItem = byCategory["bottoms"];
            const shoesItem = byCategory["shoes"];
            const outerwearItem = byCategory["outerwear"];

            // Secondary slots (any items not shown in the primary layout)
            const primaryShown = new Set([
              byCategory["tops"]?.id,
              byCategory["dresses"]?.id,
              byCategory["bottoms"]?.id,
              byCategory["shoes"]?.id,
            ]);
            const extras = (outfit.items ?? []).filter((i) => !primaryShown.has(i.id));

            return (
              <motion.div
                key={outfit.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-xl overflow-hidden"
                data-testid={`outfit-card-${outfit.id}`}
              >
                {/* Card header */}
                <div className="px-4 py-3 border-b-2 border-black flex justify-between items-center bg-primary">
                  <h3 className="font-display font-bold text-lg uppercase tracking-tight">{outfit.name}</h3>
                  <button
                    onClick={() => handleDelete(outfit.id)}
                    className="w-8 h-8 flex items-center justify-center bg-white border-2 border-black rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:translate-x-0.5 active:shadow-none hover:bg-destructive/10 transition-colors"
                    data-testid={`button-delete-outfit-${outfit.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Outfit grid */}
                <div className="p-3">
                  {/* Main 3-column look: top · bottom · shoes */}
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {/* Hero: top or dress */}
                    <div className="flex flex-col gap-1">
                      {heroItem ? (
                        <>
                          <ItemPhoto item={heroItem} size="lg" />
                          <span className="text-[9px] font-bold uppercase text-center text-muted-foreground">
                            {byCategory["dresses"] ? "Dress" : "Top"}
                          </span>
                        </>
                      ) : (
                        <div className="h-32 border-2 border-dashed border-black/20 rounded flex items-center justify-center">
                          <span className="text-[9px] font-bold uppercase text-black/20">—</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom */}
                    <div className="flex flex-col gap-1">
                      {bottomItem && !byCategory["dresses"] ? (
                        <>
                          <ItemPhoto item={bottomItem} size="lg" />
                          <span className="text-[9px] font-bold uppercase text-center text-muted-foreground">Bottom</span>
                        </>
                      ) : byCategory["dresses"] && outerwearItem ? (
                        <>
                          <ItemPhoto item={outerwearItem} size="lg" />
                          <span className="text-[9px] font-bold uppercase text-center text-muted-foreground">Jacket</span>
                        </>
                      ) : (
                        <div className="h-32 border-2 border-dashed border-black/20 rounded flex items-center justify-center">
                          <span className="text-[9px] font-bold uppercase text-black/20">—</span>
                        </div>
                      )}
                    </div>

                    {/* Shoes */}
                    <div className="flex flex-col gap-1">
                      {shoesItem ? (
                        <>
                          <ItemPhoto item={shoesItem} size="lg" />
                          <span className="text-[9px] font-bold uppercase text-center text-muted-foreground">Shoes</span>
                        </>
                      ) : (
                        <div className="h-32 border-2 border-dashed border-black/20 rounded flex items-center justify-center">
                          <span className="text-[9px] font-bold uppercase text-black/20">—</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Accessories — 5-slot grid, filled items + empty "+" slots */}
                  {(() => {
                    const MAX_SLOTS = 5;
                    const allAccItems = extras.filter((i) => i.category === "accessories");
                    const accItems = allAccItems.slice(0, MAX_SLOTS);
                    const otherExtras = extras.filter((i) => i.category !== "accessories");
                    const emptySlots = Math.max(0, MAX_SLOTS - accItems.length);
                    return (
                      <div className="pt-1 border-t border-black/10">
                        {/* Non-accessory extras (outerwear etc.) if any */}
                        {otherExtras.length > 0 && (
                          <div className="flex gap-2 overflow-x-auto no-scrollbar mb-2">
                            {otherExtras.map((item) => (
                              <div key={item.id} className="flex-none flex flex-col items-center gap-0.5">
                                <div className="w-14 h-14 border-2 border-black overflow-hidden" style={{ background: "#FDECEF" }}>
                                  {item.imageObjectPath ? (
                                    <img src={getImageUrl(item.imageObjectPath)!} alt={item.name} className="w-full h-full object-contain" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <span className="text-[8px] font-bold uppercase text-black/30">—</span>
                                    </div>
                                  )}
                                </div>
                                <span className="text-[8px] font-bold uppercase text-muted-foreground">
                                  {SLOT_LABELS[item.category as SlotKey] ?? item.category}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* 5-slot accessory row */}
                        <div className="grid grid-cols-5 gap-1.5">
                          {accItems.map((item) => (
                            <button key={item.id} onClick={() => setDetailsItem(item)} className="flex flex-col items-center gap-0.5 relative">
                              <div className="w-full aspect-square border-2 border-black overflow-hidden" style={{ background: "#FDECEF" }}>
                                {item.imageObjectPath ? (
                                  <img src={getImageUrl(item.imageObjectPath)!} alt={item.name} className="w-full h-full object-contain" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <span className="text-[8px] font-bold uppercase text-black/30">—</span>
                                  </div>
                                )}
                              </div>
                              <span className="text-[8px] font-bold uppercase text-muted-foreground truncate w-full text-center">Acc</span>
                              {item.isFavorite && <span className="absolute top-0 right-0 text-[9px] leading-none">⭐</span>}
                            </button>
                          ))}
                          {Array.from({ length: emptySlots }).map((_, i) => (
                            <button
                              key={`empty-${i}`}
                              onClick={() => setAddAccessoryToId(outfit.id)}
                              className="flex flex-col items-center gap-0.5"
                            >
                              <div
                                className="w-full aspect-square border-2 border-dashed border-black/25 rounded flex items-center justify-center"
                                style={{ background: "#FAFAFA" }}
                              >
                                <Plus className="w-3.5 h-3.5 text-black/25" />
                              </div>
                              {i === 0 ? (
                                <span className="text-[8px] font-bold uppercase text-black/25 whitespace-nowrap">+ ACCESSORIES</span>
                              ) : (
                                <span className="text-[8px]">&nbsp;</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Footer: item count */}
                <div className="px-3 pb-3">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wide">
                    {outfit.items?.length ?? 0} piece{(outfit.items?.length ?? 0) !== 1 ? "s" : ""}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-xl mt-8">
          <div className="w-14 h-14 bg-accent rounded-full flex items-center justify-center border-2 border-black mb-4">
            <Bookmark className="w-7 h-7" />
          </div>
          <h3 className="font-display font-bold text-xl mb-2">No looks saved.</h3>
          <p className="text-sm font-medium text-muted-foreground">
            Go to your digital closet, pick pieces from each row, and save the combo.
          </p>
        </div>
      )}

      {/* Upgrade sheet */}
      <AnimatePresence>
        {showUpgrade && (
          <UpgradeSheet reason="outfits" onClose={() => setShowUpgrade(false)} />
        )}
      </AnimatePresence>

      {/* Add Accessory sheet */}
      <AnimatePresence>
        {addAccessoryToId !== null && (
          <QuickAddSheet
            key={addAccessoryToId}
            open
            onOpenChange={(open) => { if (!open) setAddAccessoryToId(null); }}
            category="accessories"
            existingCount={
              outfits?.find((o) => o.id === addAccessoryToId)
                ?.items?.filter((i) => i.category === "accessories").length ?? 0
            }
            onCreated={handleAccessoryCreated}
          />
        )}
      </AnimatePresence>

      {/* Accessory details sheet */}
      <AnimatePresence>
        {detailsItem && (
          <ItemDetailsSheet
            key={detailsItem.id}
            item={detailsItem}
            onClose={() => setDetailsItem(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
