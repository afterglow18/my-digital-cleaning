import React from "react";
import {
  useListOutfits,
  useDeleteOutfit,
  getListOutfitsQueryKey,
  ClothingItem,
} from "@workspace/api-client-react";
import { Trash2, Bookmark } from "lucide-react";
import { motion } from "framer-motion";
import { getImageUrl } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

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
    <div className={`w-full ${sizeClass} bg-muted border-2 border-black overflow-hidden relative`}>
      {item.imageObjectPath ? (
        <img
          src={getImageUrl(item.imageObjectPath)!}
          alt={item.name}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-secondary/30 flex items-center justify-center p-1">
          <span className="text-[9px] font-bold uppercase text-center leading-tight">{item.name}</span>
        </div>
      )}
    </div>
  );
}

export default function SavedPage() {
  const { data: outfits, isLoading } = useListOutfits();
  const deleteOutfit = useDeleteOutfit();
  const queryClient = useQueryClient();

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

  return (
    <div className="min-h-full flex flex-col pt-8 px-4 pb-8 bg-secondary/10 relative">
      <header className="mb-6">
        <h1 className="text-4xl font-display font-bold uppercase tracking-tighter mb-1">Lookbook</h1>
        <p className="font-medium text-muted-foreground text-sm">Hall of fame.</p>
      </header>

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
            const accessoryItem = byCategory["accessories"];

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
                <div className="px-4 py-3 border-b-2 border-black flex justify-between items-center bg-accent">
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

                  {/* Accessories / extras row */}
                  {extras.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pt-1 border-t border-black/10">
                      {extras.map((item) => (
                        <div key={item.id} className="flex-none flex flex-col items-center gap-0.5">
                          <div className="w-14 h-16 bg-muted border-2 border-black overflow-hidden">
                            {item.imageObjectPath ? (
                              <img
                                src={getImageUrl(item.imageObjectPath)!}
                                alt={item.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-secondary/30 flex items-center justify-center p-1">
                                <span className="text-[8px] font-bold uppercase text-center leading-tight">
                                  {item.name}
                                </span>
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
            Go to your closet, pick pieces from each row, and save the combo.
          </p>
        </div>
      )}
    </div>
  );
}
