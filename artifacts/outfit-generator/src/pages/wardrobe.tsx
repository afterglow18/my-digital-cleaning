import React, { useState } from "react";
import {
  useListClothing,
  getListClothingQueryKey,
  useSaveOutfit,
  getListOutfitsQueryKey,
  ClothingItem,
} from "@workspace/api-client-react";
import { Plus, Shirt, BookmarkPlus, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AddClothingSheet } from "@/components/clothing/AddClothingSheet";
import { EditClothingSheet } from "@/components/clothing/EditClothingSheet";
import { getImageUrl } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

const CATEGORY_ORDER = ["tops", "bottoms", "shoes", "dresses", "outerwear", "accessories"] as const;
type Category = (typeof CATEGORY_ORDER)[number];

const CATEGORY_LABELS: Record<Category, string> = {
  tops: "Tops",
  bottoms: "Bottoms",
  shoes: "Shoes",
  dresses: "Dresses",
  outerwear: "Outerwear",
  accessories: "Accessories",
};

export default function WardrobePage() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [selectedItems, setSelectedItems] = useState<Partial<Record<Category, ClothingItem>>>({});
  const [isSaveMode, setIsSaveMode] = useState(false);
  const [saveName, setSaveName] = useState("");

  const { data: clothes, isLoading } = useListClothing(undefined, {
    query: { queryKey: getListClothingQueryKey() },
  });

  const saveOutfit = useSaveOutfit();
  const queryClient = useQueryClient();

  const grouped = CATEGORY_ORDER.reduce<Record<Category, ClothingItem[]>>((acc, cat) => {
    acc[cat] = (clothes ?? []).filter((item) => item.category === cat);
    return acc;
  }, {} as Record<Category, ClothingItem[]>);

  const hasItems = !!clothes && clothes.length > 0;
  const selectedCount = Object.keys(selectedItems).length;

  const toggleItem = (item: ClothingItem) => {
    const cat = item.category as Category;
    setSelectedItems((prev) => {
      if (prev[cat]?.id === item.id) {
        const next = { ...prev };
        delete next[cat];
        return next;
      }
      return { ...prev, [cat]: item };
    });
  };

  const clearSelection = () => {
    setSelectedItems({});
    setIsSaveMode(false);
    setSaveName("");
  };

  const handleSave = () => {
    if (!saveName.trim()) return;
    const itemIds = Object.values(selectedItems).map((i) => i!.id);
    saveOutfit.mutate(
      { data: { name: saveName.trim(), itemIds } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
          clearSelection();
        },
      }
    );
  };

  return (
    <div className="min-h-full flex flex-col pt-8 px-4 pb-8 bg-background relative">
      <header className="mb-6">
        <h1 className="text-4xl font-display font-bold uppercase tracking-tighter mb-1">My Closet</h1>
        <p className="text-muted-foreground font-medium text-sm">
          {hasItems ? "Tap items to build an outfit." : "Like, totally organized."}
        </p>
      </header>

      {isLoading ? (
        <div className="flex flex-col gap-8">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <div className="h-4 w-16 bg-muted animate-pulse rounded mb-3" />
              <div className="flex gap-3">
                {[1, 2, 3, 4].map((j) => (
                  <div
                    key={j}
                    className="w-24 h-[7.5rem] flex-none bg-muted animate-pulse border-2 border-black/20 rounded-lg"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : hasItems ? (
        <div className="flex flex-col gap-7">
          {CATEGORY_ORDER.map((cat) => {
            const items = grouped[cat];
            if (!items || items.length === 0) return null;
            return (
              <div key={cat}>
                {/* Row header */}
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="font-display font-bold text-xs uppercase tracking-widest">
                    {CATEGORY_LABELS[cat]}
                  </h2>
                  <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 border border-black/30 rounded">
                    {items.length}
                  </span>
                </div>

                {/* Horizontal scroll row */}
                <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1 no-scrollbar">
                  {items.map((item) => {
                    const isSelected = selectedItems[cat]?.id === item.id;
                    return (
                      <motion.button
                        key={item.id}
                        onClick={() => toggleItem(item)}
                        whileTap={{ scale: 0.94 }}
                        data-testid={`clothing-item-${item.id}`}
                        className={`flex-none w-24 flex flex-col border-2 transition-all rounded-lg overflow-hidden relative ${
                          isSelected
                            ? "border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-y-1.5"
                            : "border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                        } bg-white`}
                      >
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-black rounded-full flex items-center justify-center z-10">
                            <Check className="w-3 h-3 text-white" strokeWidth={3} />
                          </div>
                        )}
                        <div className="w-full h-28 bg-muted relative overflow-hidden">
                          {item.imageObjectPath ? (
                            <img
                              src={getImageUrl(item.imageObjectPath)!}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div
                              className={`w-full h-full flex items-center justify-center p-2 ${
                                isSelected ? "bg-primary" : "bg-secondary/30"
                              }`}
                            >
                              <span className="font-display font-bold text-center text-[9px] uppercase leading-tight">
                                {item.name}
                              </span>
                            </div>
                          )}
                        </div>
                        <div
                          className={`px-1.5 py-1 border-t-2 border-black ${
                            isSelected ? "bg-primary" : "bg-white"
                          }`}
                        >
                          <span className="font-bold text-[10px] uppercase tracking-tight line-clamp-1 block">
                            {item.name}
                          </span>
                        </div>
                      </motion.button>
                    );
                  })}

                  {/* Inline add button at end of each row */}
                  <button
                    onClick={() => setIsAddOpen(true)}
                    className="flex-none w-14 h-[calc(7rem+1.875rem)] border-2 border-dashed border-black/25 rounded-lg flex items-center justify-center hover:border-black/50 transition-colors"
                    data-testid="add-item-row-inline"
                  >
                    <Plus className="w-4 h-4 text-black/30" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty state */
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-xl mt-8">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center border-2 border-black shadow-sm mb-4">
            <Shirt className="w-8 h-8" />
          </div>
          <h3 className="font-display font-bold text-xl mb-2">Ugh, as if!</h3>
          <p className="text-sm font-medium text-muted-foreground mb-6">
            Your closet is empty. Time to go shopping or add some items.
          </p>
          <button
            onClick={() => setIsAddOpen(true)}
            className="btn-brutalist px-6 py-3 rounded-full flex items-center gap-2"
            data-testid="button-add-first-item"
          >
            <Plus className="w-5 h-5" />
            Add Item
          </button>
        </div>
      )}

      {/* Floating Add Button (when wardrobe has items) */}
      {hasItems && selectedCount === 0 && (
        <button
          onClick={() => setIsAddOpen(true)}
          data-testid="fab-add-item"
          className="fixed bottom-24 right-4 w-12 h-12 bg-primary text-black border-2 border-black rounded-full shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center z-20 hover:-translate-y-1 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Save Outfit Bottom Bar */}
      <AnimatePresence>
        {selectedCount > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", damping: 22, stiffness: 220 }}
            className="fixed bottom-[76px] left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-30"
          >
            <div className="bg-white border-2 border-black shadow-[0px_-4px_0px_0px_rgba(0,0,0,0.08),4px_4px_0px_0px_rgba(0,0,0,1)] rounded-2xl p-3 flex flex-col gap-2">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-sm uppercase tracking-wide">
                  {selectedCount} item{selectedCount !== 1 ? "s" : ""} picked
                </span>
                <button
                  onClick={clearSelection}
                  className="w-6 h-6 flex items-center justify-center rounded-full border border-black/30 hover:border-black hover:bg-muted transition-colors"
                  data-testid="button-clear-selection"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Mini preview strip */}
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                {CATEGORY_ORDER.map((cat) => {
                  const item = selectedItems[cat];
                  if (!item) return null;
                  return (
                    <div
                      key={cat}
                      className="flex-none flex flex-col items-center gap-0.5"
                    >
                      <div className="w-10 h-12 border-2 border-black overflow-hidden rounded bg-muted">
                        {item.imageObjectPath ? (
                          <img
                            src={getImageUrl(item.imageObjectPath)!}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-secondary/40 flex items-center justify-center">
                            <span className="text-[7px] font-bold uppercase text-center p-0.5 leading-tight">
                              {item.name}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="text-[8px] font-bold uppercase text-muted-foreground tracking-wide">
                        {CATEGORY_LABELS[cat].slice(0, 3)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Save action */}
              {isSaveMode ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Name this look..."
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSave()}
                    className="flex-1 border-2 border-black rounded-lg px-3 py-2 text-sm font-bold uppercase tracking-wide placeholder:font-normal placeholder:normal-case placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="input-outfit-name"
                  />
                  <button
                    onClick={handleSave}
                    disabled={!saveName.trim() || saveOutfit.isPending}
                    className="btn-brutalist px-4 py-2 rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    data-testid="button-save-outfit-confirm"
                  >
                    {saveOutfit.isPending ? "..." : "Save"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsSaveMode(true)}
                  className="btn-brutalist w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm"
                  data-testid="button-save-to-favorites"
                >
                  <BookmarkPlus className="w-4 h-4" />
                  Save to Favorites
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AddClothingSheet open={isAddOpen} onOpenChange={setIsAddOpen} />
      <EditClothingSheet
        itemId={editingItemId}
        open={editingItemId !== null}
        onOpenChange={(open) => !open && setEditingItemId(null)}
      />
    </div>
  );
}
