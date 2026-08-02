import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  useListOutfits,
  useListClothing,
  useDeleteOutfit,
  useRenameOutfit,
  useAddItemToOutfit,
  useRemoveItemFromOutfit,
  getListOutfitsQueryKey,
  getListClothingQueryKey,
  type ClothingItem,
  type SavedOutfit,
} from "@/hooks/useLocalDB";
import { Trash2, Bookmark, Plus, Pencil, Check, X, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { BlobImg } from "@/components/BlobImg";
import { useQueryClient } from "@tanstack/react-query";
import { useEntitlements } from "@/hooks/useEntitlements";
import { UpgradeSheet } from "@/components/paywall/UpgradeSheet";
import { FREE_OUTFIT_LIMIT } from "@/lib/entitlements";
import { WardrobePickerSheet } from "@/components/clothing/WardrobePickerSheet";
import { ItemDetailsSheet } from "@/components/clothing/ItemDetailsSheet";

const SLOT_ORDER = ["outfits", "beauty", "essentials"] as const;
type SlotKey = (typeof SLOT_ORDER)[number];

const SLOT_LABELS: Record<SlotKey, string> = {
  outfits:    "Supplies",
  beauty:     "Tools",
  essentials: "Areas",
};


// ── Search scoring ────────────────────────────────────────────────────────────

function scoreItem(item: ClothingItem, q: string): number {
  const lq = q.toLowerCase();
  let s = 0;
  const hit = (text: string | null | undefined, w: number) => {
    if (text && text.toLowerCase().includes(lq)) s += w;
  };
  hit(item.name,          5);
  hit(item.brand,         4);
  hit(item.color,         3);
  hit(item.category,      3);
  hit(item.size,          2);
  hit(item.season,        2);
  hit(item.occasion,      2);
  hit(item.notes,         2);
  hit(item.purchasePrice, 1);
  hit(item.purchaseDate,  1);
  (item.visionLabels ?? []).forEach((l) => { if (l.toLowerCase().includes(lq)) s += 1; });
  (item.visionText   ?? []).forEach((t) => { if (t.toLowerCase().includes(lq)) s += 0.5; });
  return s;
}

function searchItems(items: ClothingItem[], q: string): ClothingItem[] {
  if (!q.trim()) return [];
  return items
    .map((item) => ({ item, score: scoreItem(item, q) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

function searchOutfits(outfits: SavedOutfit[], allItems: ClothingItem[], q: string): SavedOutfit[] {
  if (!q.trim()) return [];
  const lq = q.toLowerCase();
  const matchingItemIds = new Set(searchItems(allItems, q).map((i) => i.id));

  return outfits.filter((o) => {
    if (o.name.toLowerCase().includes(lq))  return true;
    if ((o.notes ?? "").toLowerCase().includes(lq)) return true;
    return (o.items ?? []).some((i) => matchingItemIds.has(i.id));
  });
}

// ── ItemPhoto helper ──────────────────────────────────────────────────────────

function ItemPhoto({
  item,
  size = "md",
  onClick,
}: {
  item: ClothingItem;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
}) {
  const sizeClass = size === "lg" ? "h-28" : size === "md" ? "h-20" : "h-14";
  return (
    <button
      onClick={onClick}
      className={`w-full ${sizeClass} border-2 border-black overflow-hidden relative`}
      style={{ background: "#F5EDD8", padding: 0, display: "block" }}
    >
      {item.imageObjectPath ? (
        <BlobImg
          src={item.imageObjectPath}
          alt={item.name}
          className="w-full h-full object-contain"
          style={{ objectFit: "contain", objectPosition: "center" }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center p-1">
          <span className="text-[9px] font-bold uppercase text-center leading-tight text-black/30">—</span>
        </div>
      )}
      {item.isFavorite && (
        <span className="absolute top-1 right-1 text-[10px] leading-none">❤️</span>
      )}
    </button>
  );
}

// ── Search results ────────────────────────────────────────────────────────────

function SearchResults({
  items,
  outfits,
  query,
  onItemTap,
  onOutfitTap,
}: {
  items:      ClothingItem[];
  outfits:    SavedOutfit[];
  query:      string;
  onItemTap:  (item: ClothingItem) => void;
  onOutfitTap:(outfit: SavedOutfit) => void;
}) {
  const CATEGORY_LABELS: Record<string, string> = {
    outfits:    "Supplies",
    beauty:     "Tools",
    essentials: "Areas",
  };

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* Individual items */}
      {items.length > 0 && (
        <section>
          <p className="text-[10px] font-bold uppercase tracking-widest text-black/35 mb-2">
            Items · {items.length}
          </p>
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => onItemTap(item)}
                className="flex items-center gap-3 bg-white border-2 border-black rounded-xl px-3 py-2
                           shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                           active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all text-left"
              >
                <div
                  className="w-12 h-12 border-2 border-black rounded-lg overflow-hidden flex-shrink-0"
                  style={{ background: "#F5EDD8" }}
                >
                  {item.imageObjectPath ? (
                    <BlobImg src={item.imageObjectPath} alt={item.name} className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-[10px] text-black/25 font-bold">—</span>
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-display font-bold text-sm uppercase tracking-tight truncate">{item.name}</p>
                  <p className="text-[10px] text-black/40 font-medium">
                    {CATEGORY_LABELS[item.category] ?? item.category}
                    {item.brand ? ` · ${item.brand}` : ""}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Saved groups */}
      {outfits.length > 0 && (
        <section>
          <p className="text-[10px] font-bold uppercase tracking-widest text-black/35 mb-2">
            Lookbooks · {outfits.length}
          </p>
          <div className="flex flex-col gap-2">
            {outfits.map((outfit) => {
              const thumbs = (outfit.items ?? []).slice(0, 3);
              return (
                <button
                  key={outfit.id}
                  onClick={() => onOutfitTap(outfit)}
                  className="flex items-center gap-3 bg-white border-2 border-black rounded-xl px-3 py-2
                             shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                             active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all text-left"
                >
                  <div className="flex -space-x-2 shrink-0">
                    {thumbs.length > 0 ? (
                      thumbs.map((thumb, idx) => (
                        <div
                          key={thumb.id}
                          className="w-10 h-10 border-2 border-white rounded-lg overflow-hidden bg-[#F5EDD8] shadow-sm"
                          style={{ zIndex: thumbs.length - idx }}
                        >
                          {thumb.imageObjectPath ? (
                            <BlobImg src={thumb.imageObjectPath} alt={thumb.name} className="w-full h-full object-contain" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="text-[7px] text-black/25 font-bold">—</span>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="w-10 h-10 border-2 border-black/20 rounded-lg bg-[#F5EDD8]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-display font-bold text-sm uppercase tracking-tight truncate">{outfit.name}</p>
                    <p className="text-[10px] text-black/40 font-medium">
                      {outfit.items?.length ?? 0} item{(outfit.items?.length ?? 0) !== 1 ? "s" : ""}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {items.length === 0 && outfits.length === 0 && (
        <div className="py-16 text-center">
          <p className="font-display font-bold text-lg uppercase tracking-tight text-black/30 mb-1">No results</p>
          <p className="text-xs text-black/25 font-medium">Try a different word or phrase.</p>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SavedPage() {
  const { data: outfits, isLoading } = useListOutfits();
  const { data: allItems = [] }      = useListClothing();
  const deleteOutfit       = useDeleteOutfit();
  const renameOutfit       = useRenameOutfit();
  const removeItemFromOutfit = useRemoveItemFromOutfit();
  const addItemToOutfit    = useAddItemToOutfit();
  const queryClient        = useQueryClient();
  const { tier }           = useEntitlements();

  const [showUpgrade,   setShowUpgrade]   = useState(false);
  const [replacingSlot, setReplacingSlot] = useState<{ outfitId: number; category: SlotKey } | null>(null);
  const [addingExtra,   setAddingExtra]   = useState<number | null>(null);
  const [detailsItem,   setDetailsItem]   = useState<ClothingItem | null>(null);
  const [detailsFromSearch, setDetailsFromSearch] = useState(false);
  const [renamingId,    setRenamingId]    = useState<number | null>(null);
  const [renameValue,   setRenameValue]   = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [editingNotesId, setEditingNotesId] = useState<number | null>(null);
  const [notesValue,    setNotesValue]    = useState("");
  const notesInputRef  = useRef<HTMLTextAreaElement>(null);
  const [searchQuery,   setSearchQuery]   = useState("");
  const searchRef      = useRef<HTMLInputElement>(null);
  const pageTopRef     = useRef<HTMLDivElement>(null);

  // Scroll to top the instant the user starts typing
  const handleSearchChange = useCallback((v: string) => {
    setSearchQuery(v);
    if (v) pageTopRef.current?.scrollIntoView({ behavior: "instant" });
  }, []);

  useEffect(() => {
    if (renamingId !== null) renameInputRef.current?.focus();
  }, [renamingId]);

  useEffect(() => {
    if (editingNotesId !== null) notesInputRef.current?.focus();
  }, [editingNotesId]);

  const startRename = (id: number, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const commitRename = (id: number) => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== outfits?.find((o) => o.id === id)?.name) {
      renameOutfit.mutate(
        { id, data: { name: trimmed } },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) },
      );
    }
    setRenamingId(null);
  };

  const startEditNotes = (id: number, currentNotes: string | null | undefined) => {
    setEditingNotesId(id);
    setNotesValue(currentNotes ?? "");
  };

  const commitNotes = (id: number) => {
    const trimmed = notesValue.trim();
    const current = outfits?.find((o) => o.id === id)?.notes ?? "";
    if (trimmed !== (current ?? "")) {
      renameOutfit.mutate(
        { id, data: { notes: trimmed || null } },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) },
      );
    }
    setEditingNotesId(null);
  };

  const isFree      = tier === "free";
  const outfitCount = outfits?.length ?? 0;
  const atLimit     = isFree && outfitCount >= FREE_OUTFIT_LIMIT;

  const handleDelete = (id: number) => {
    deleteOutfit.mutate(
      { id },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) },
    );
  };

  const handleRemoveItem = (outfitId: number, itemId: number) => {
    removeItemFromOutfit.mutate(
      { id: outfitId, itemId },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) },
    );
  };

  const handlePickedItem = (item: ClothingItem) => {
    if (replacingSlot == null) return;
    addItemToOutfit.mutate(
      { id: replacingSlot.outfitId, data: { itemId: item.id } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) },
    );
    setReplacingSlot(null);
  };

  const handlePickedExtra = (item: ClothingItem) => {
    if (addingExtra == null) return;
    addItemToOutfit.mutate(
      { id: addingExtra, data: { itemId: item.id } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) },
    );
    setAddingExtra(null);
  };

  // ── Search ───────────────────────────────────────────────────────────────────

  const isSearching = searchQuery.trim().length > 0;
  const resultItems   = isSearching ? searchItems(allItems, searchQuery) : [];
  const resultOutfits = isSearching ? searchOutfits(outfits ?? [], allItems, searchQuery) : [];

  // Scroll to a group card when the user taps a group in search results
  const groupCardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const handleOutfitTap = (outfit: SavedOutfit) => {
    setSearchQuery("");
    setTimeout(() => {
      const el = groupCardRefs.current[outfit.id];
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  };

  return (
    <div className="min-h-full flex flex-col pt-8 px-4 pb-8 bg-secondary/10 relative">
      <div ref={pageTopRef} />

      <header className="mb-4">
        <h1 className="text-4xl font-display font-bold uppercase tracking-tighter mb-1">Lookbook</h1>
        <div className="flex items-center justify-between">
          <p className="font-medium text-muted-foreground text-sm">Hall of fame.</p>

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

      {/* ── Search bar ────────────────────────────────────────────────────────── */}
      <div className="mb-5 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/35 pointer-events-none" />
        <input
          ref={searchRef}
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by name, category, or notes…"
          className="w-full pl-9 pr-9 py-2.5 rounded-full border-2 border-black bg-white text-sm font-medium
                     focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-black/30"
        />
        {searchQuery && (
          <button
            onClick={() => { setSearchQuery(""); searchRef.current?.focus(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center
                       rounded-full bg-black/10 hover:bg-black/20 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* ── Search results ────────────────────────────────────────────────────── */}
      {isSearching ? (
        <SearchResults
          items={resultItems}
          outfits={resultOutfits}
          query={searchQuery}
          onItemTap={(item) => { setDetailsItem(item); setDetailsFromSearch(true); }}
          onOutfitTap={handleOutfitTap}
        />
      ) : (
        <>
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
                You've saved {FREE_OUTFIT_LIMIT} looks — the free limit.
                Unlock Forever to save unlimited cases.
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
            <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:items-start">
              {outfits.map((outfit) => {
                const fmtDate = (iso: string) => {
                  const [y, m, d] = iso.split("-");
                  return `${parseInt(m)}/${parseInt(d)}/${y.slice(2)}`;
                };
                const bySlot = (outfit.items ?? []).reduce<Partial<Record<SlotKey, ClothingItem>>>(
                  (acc, item) => {
                    const key = item.category as SlotKey;
                    if (SLOT_ORDER.includes(key) && !acc[key]) acc[key] = item;
                    return acc;
                  },
                  {},
                );
                const knownIds = new Set(Object.values(bySlot).map((i) => i?.id));
                const extras   = (outfit.items ?? []).filter((i) => !knownIds.has(i.id));

                return (
                  <motion.div
                    key={outfit.id}
                    ref={(el) => { groupCardRefs.current[outfit.id] = el; }}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-xl overflow-hidden"
                    data-testid={`outfit-card-${outfit.id}`}
                  >
                    {/* Card header */}
                    <div className="px-4 py-3 border-b-2 border-black flex justify-between items-center bg-primary gap-2">
                      {renamingId === outfit.id ? (
                        <form
                          className="flex-1 flex items-center gap-1"
                          onSubmit={(e) => { e.preventDefault(); commitRename(outfit.id); }}
                        >
                          <input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => commitRename(outfit.id)}
                            maxLength={60}
                            className="flex-1 font-display font-bold text-lg uppercase tracking-tight bg-white/60 border-2 border-black rounded-lg px-2 py-0.5 outline-none min-w-0"
                          />
                          <button type="submit" className="w-7 h-7 flex items-center justify-center bg-white border-2 border-black rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] shrink-0">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      ) : (
                        <button
                          onClick={() => startRename(outfit.id, outfit.name)}
                          className="flex-1 flex items-center gap-1.5 text-left group min-w-0"
                        >
                          <h3 className="font-display font-bold text-lg uppercase tracking-tight truncate">{outfit.name}</h3>
                          <Pencil className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-50 transition-opacity" />
                        </button>
                      )}
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        {outfit.lastUsedDate && (
                          <span className="text-[9px] font-bold text-black/40 uppercase tracking-wide leading-none">
                            {fmtDate(outfit.lastUsedDate)}
                          </span>
                        )}
                        <button
                          onClick={() => handleDelete(outfit.id)}
                          className="w-8 h-8 flex items-center justify-center bg-white border-2 border-black rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:translate-x-0.5 active:shadow-none hover:bg-destructive/10 transition-colors"
                          data-testid={`button-delete-outfit-${outfit.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="px-4 py-2 border-b border-black/10">
                      {editingNotesId === outfit.id ? (
                        <form onSubmit={(e) => { e.preventDefault(); commitNotes(outfit.id); }} className="flex gap-2">
                          <textarea
                            ref={notesInputRef}
                            value={notesValue}
                            onChange={(e) => setNotesValue(e.target.value)}
                            onBlur={() => commitNotes(outfit.id)}
                            rows={2}
                            maxLength={300}
                            placeholder="Add notes…"
                            className="flex-1 text-xs border-2 border-black rounded-lg px-2 py-1.5 resize-none outline-none focus:ring-2 focus:ring-primary bg-white"
                          />
                          <button type="submit" className="self-start w-7 h-7 flex items-center justify-center bg-black text-white border-2 border-black rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] shrink-0">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      ) : (
                        <button
                          onClick={() => startEditNotes(outfit.id, outfit.notes)}
                          className="w-full text-left group"
                        >
                          {outfit.notes ? (
                            <p className="text-xs text-black/60 leading-snug flex items-start gap-1">
                              <span className="flex-1">{outfit.notes}</span>
                              <Pencil className="w-3 h-3 shrink-0 mt-0.5 opacity-0 group-hover:opacity-40 transition-opacity" />
                            </p>
                          ) : (
                            <p className="text-xs text-black/25 italic">Add notes…</p>
                          )}
                        </button>
                      )}
                    </div>

                    {/* 3-slot grid */}
                    <div className="p-3">
                      <div className="grid grid-cols-4 gap-2">
                        {SLOT_ORDER.map((slot) => {
                          const item = bySlot[slot];
                          return (
                            <div key={slot} className="flex flex-col gap-0.5">
                              {item ? (
                                <>
                                  <ItemPhoto item={item} size="lg" onClick={() => { setDetailsItem(item); setDetailsFromSearch(false); }} />
                                  <div className="flex items-center justify-between px-0.5">
                                    <span className="text-[8px] font-bold uppercase text-muted-foreground truncate">
                                      {SLOT_LABELS[slot]}
                                    </span>
                                    <button
                                      onClick={() => handleRemoveItem(outfit.id, item.id)}
                                      className="w-3.5 h-3.5 flex items-center justify-center rounded-full bg-black/10 hover:bg-red-100 transition-colors flex-shrink-0"
                                    >
                                      <X className="w-2.5 h-2.5 text-black/50" />
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => setReplacingSlot({ outfitId: outfit.id, category: slot })}
                                    className="h-28 w-full border-2 border-dashed border-black/25 rounded flex flex-col items-center justify-center gap-1 hover:border-black/50 hover:bg-black/5 transition-colors"
                                  >
                                    <Plus className="w-3.5 h-3.5 text-black/30" />
                                  </button>
                                  <span className="text-[8px] font-bold uppercase text-black/25 text-center truncate">
                                    {SLOT_LABELS[slot]}
                                  </span>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Extras */}
                      <div className="mt-3 pt-3 border-t border-black/10">
                        <p className="text-[8px] font-bold uppercase tracking-widest text-black/30 mb-2">Extras</p>
                        <div className="grid grid-cols-5 gap-1.5">
                          {Array.from({ length: 10 }).map((_, i) => {
                            const item = extras[i];
                            return item ? (
                              <div key={item.id} className="relative flex flex-col gap-0.5">
                                <button
                                  onClick={() => { setDetailsItem(item); setDetailsFromSearch(false); }}
                                  className="w-full aspect-square border-2 border-black overflow-hidden rounded"
                                  style={{ background: "#F5EDD8" }}
                                >
                                  {item.imageObjectPath ? (
                                    <BlobImg src={item.imageObjectPath} alt={item.name} className="w-full h-full object-contain" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <span className="text-[8px] font-bold text-black/30">—</span>
                                    </div>
                                  )}
                                </button>
                                {item.isFavorite && (
                                  <span className="absolute top-0 left-0 text-[10px] leading-none z-20 pointer-events-none">⭐</span>
                                )}
                                <button
                                  onClick={() => handleRemoveItem(outfit.id, item.id)}
                                  className="absolute -top-1 -right-1 w-4 h-4 bg-white border border-black rounded-full flex items-center justify-center shadow-sm z-10"
                                >
                                  <X className="w-2 h-2" />
                                </button>
                              </div>
                            ) : (
                              <button
                                key={`empty-${i}`}
                                onClick={() => setAddingExtra(outfit.id)}
                                className="aspect-square border-2 border-dashed border-black/25 rounded flex items-center justify-center hover:border-black/50 hover:bg-black/5 transition-colors"
                              >
                                <Plus className="w-3 h-3 text-black/25" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="px-3 pb-3 flex flex-col gap-2">
                      <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wide">
                        {outfit.items?.length ?? 0} item{(outfit.items?.length ?? 0) !== 1 ? "s" : ""}
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
              <h3 className="font-display font-bold text-xl mb-2">No cleanings saved yet.</h3>
              <p className="text-sm font-medium text-muted-foreground">
                Head to Generate, spin it, and save the cleans you love.
              </p>
            </div>
          )}
        </>
      )}

      {/* Upgrade sheet */}
      <AnimatePresence>
        {showUpgrade && (
          <UpgradeSheet reason="outfits" onClose={() => setShowUpgrade(false)} />
        )}
      </AnimatePresence>

      {/* Wardrobe picker for replacing a slot */}
      <AnimatePresence>
        {replacingSlot !== null && (
          <WardrobePickerSheet
            key={`${replacingSlot.outfitId}-${replacingSlot.category}`}
            open
            onOpenChange={(open) => { if (!open) setReplacingSlot(null); }}
            category={replacingSlot.category}
            existingItemIds={
              outfits?.find((o) => o.id === replacingSlot.outfitId)?.items?.map((i) => i.id) ?? []
            }
            onPick={handlePickedItem}
          />
        )}
      </AnimatePresence>

      {/* All-category picker for extras */}
      <AnimatePresence>
        {addingExtra !== null && (
          <WardrobePickerSheet
            key={`extra-${addingExtra}`}
            open
            onOpenChange={(open) => { if (!open) setAddingExtra(null); }}
            existingItemIds={
              outfits?.find((o) => o.id === addingExtra)?.items?.map((i) => i.id) ?? []
            }
            onPick={handlePickedExtra}
          />
        )}
      </AnimatePresence>

      {/* Item details sheet */}
      <AnimatePresence>
        {detailsItem && (
          <ItemDetailsSheet
            key={detailsItem.id}
            item={detailsItem}
            onClose={() => { setDetailsItem(null); setDetailsFromSearch(false); }}
            showAddToLookbook={detailsFromSearch}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
