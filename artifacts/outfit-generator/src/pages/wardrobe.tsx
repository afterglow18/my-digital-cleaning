/**
 * WardrobePage — cleaning-shelves-bg.png (1024×1536 PNG)
 *
 * Layout: 4 sections mapped to 3 physical wall shelves + floor area.
 * Items sit ON TOP of each shelf surface (bottom-anchored within each section).
 * React-rendered category labels and transparent tap zones overlay the empty
 * pink wall space above each shelf.
 *
 * Shelf surface positions (calibrated from pixel analysis of 1024×1536 image):
 *   Shelf 1 top surface: y ≈ 0.267  (px 410 / 1536)
 *   Shelf 2 top surface: y ≈ 0.433  (px 665 / 1536)
 *   Shelf 3 top surface: y ≈ 0.602  (px 925 / 1536)
 *   Floor / below-shelf:  y ≈ 0.760
 *
 * Sections (y-fractions of image height):
 *   Section 1 (OUTFITS):    0.13 → 0.267
 *   Section 2 (BEAUTY):     0.33 → 0.433
 *   Section 3 (TOILETRIES): 0.47 → 0.602
 *   Section 4 (ESSENTIALS): 0.65 → 0.760
 *
 * Save outfit: floating pill button in the lower floor area.
 */

import React, {
  useEffect, useRef, useState,
  useCallback, RefObject,
} from "react";
import { useLocation } from "wouter";
import {
  useListClothing, getListClothingQueryKey,
  useListOutfits, getListOutfitsQueryKey,
  useSaveOutfit,
  type ClothingItem,
} from "@/hooks/useLocalDB";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ClosetRow, ClosetRowHandle } from "@/components/ClosetRow";
import { QuickAddSheet } from "@/components/clothing/QuickAddSheet";
import { ItemDetailsSheet } from "@/components/clothing/ItemDetailsSheet";
import { UpgradeSheet, UpgradeReason } from "@/components/paywall/UpgradeSheet";
import { useQueryClient } from "@tanstack/react-query";
import { useEntitlements } from "@/hooks/useEntitlements";
import { FREE_ITEM_LIMIT } from "@/lib/entitlements";
import { createClothingItem } from "@/lib/localDB";

// ── Types ─────────────────────────────────────────────────────────────────────
type RowKey   = "outfits" | "beauty" | "essentials";
type Category = "outfits" | "beauty" | "essentials";

const ROWS: { key: RowKey; btnLabel: string; showLabel: boolean; shelfHeading: string | null; headingTopFrac?: number }[] = [
  { key: "outfits",    btnLabel: "+ ADD OUTFITS",    showLabel: false, shelfHeading: "Supplies", headingTopFrac: 0.256 },
  { key: "beauty",     btnLabel: "+ ADD BEAUTY",     showLabel: false, shelfHeading: "Tools",    headingTopFrac: 0.416 },
  { key: "essentials", btnLabel: "+ ADD ESSENTIALS", showLabel: false, shelfHeading: "Areas",    headingTopFrac: 0.592 },
];

// ── Image constants ───────────────────────────────────────────────────────────
const IMG_W = 1024;
const IMG_H = 1536;
const NAV_H = 90;

// ── Landmark fractions (calibrated via pixel analysis of cleaning-shelves-bg.png 1024×1536) ──
// 3 pink wall shelves. Each row fills the wall space above a shelf surface.
// shelfY = exact top-surface of the shelf board (items rest here, bottom-anchored).
// Row 4 occupies the floor/accessory area below the lowest shelf.
const LM = {
  doorL: 0.10,   // left usable boundary (shelves span near full width, clear of window/bucket)
  doorR: 0.90,   // right usable boundary (clear of right-side cabinet)

  rows: [
    { sectionTop: 0.13, shelfY: 0.280, btnCY: 0.20 },  // OUTFITS    (shelf 1 surface at 28.0%)
    { sectionTop: 0.30, shelfY: 0.500, btnCY: 0.40 },  // BEAUTY     (shelf 2 surface at 50.0%)
    { sectionTop: 0.73, shelfY: 0.870, btnCY: 0.80 },  // ESSENTIALS (below all shelves)
  ],

  saveAreaY: 0.88,
} as const;

// ── useImageRect ─────────────────────────────────────────────────────────────
interface ImgRect {
  top: number; left: number; width: number; height: number;
  containerH: number; containerW: number;
}

function useImageRect(containerRef: RefObject<HTMLDivElement>): ImgRect {
  const [rect, setRect] = useState<ImgRect>({ top: 0, left: 0, width: 0, height: 0, containerH: 0, containerW: 0 });
  useEffect(() => {
    const compute = () => {
      const c = containerRef.current;
      if (!c) return;
      const cW = c.clientWidth, cH = c.clientHeight;
      const iR = IMG_W / IMG_H;
      // Fill: stretch image to exactly match container — full bed visible
      setRect({ top: 0, left: 0, width: cW, height: cH, containerH: cH, containerW: cW });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [containerRef]);
  return rect;
}

// ── Pixel helpers ─────────────────────────────────────────────────────────────
const pH = (ir: ImgRect, f: number) => ir.height * f;
const pW = (ir: ImgRect, f: number) => ir.width  * f;
const pX = (ir: ImgRect, f: number) => ir.left   + ir.width  * f;
const pY = (ir: ImgRect, f: number) => ir.top    + ir.height * f;

// ── Page ──────────────────────────────────────────────────────────────────────
export default function WardrobePage() {
  const containerRef = useRef<HTMLDivElement>(null!);
  const ir = useImageRect(containerRef);

  const rowRefs: Record<RowKey, RefObject<ClosetRowHandle | null>> = {
    outfits:    useRef<ClosetRowHandle | null>(null),
    beauty:     useRef<ClosetRowHandle | null>(null),
    essentials: useRef<ClosetRowHandle | null>(null),
  };

  const [centred,       setCentred]       = useState<Partial<Record<RowKey, ClothingItem>>>({});
  const [addCategory,   setAddCategory]   = useState<Category | null>(null);
  const [detailsItem,   setDetailsItem]   = useState<ClothingItem | null>(null);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason | null>(null);
  const [isSaveOpen,    setIsSaveOpen]    = useState(false);
  const [saveName,      setSaveName]      = useState("");
  const [saveSuccess,   setSaveSuccess]   = useState(false);

  const saveOutfit = useSaveOutfit();

  const { data: outfitsItems  = [] } = useListClothing({ category: "outfits"    }, { query: { queryKey: getListClothingQueryKey({ category: "outfits"    }) } });
  const { data: beautyItems   = [] } = useListClothing({ category: "beauty"     }, { query: { queryKey: getListClothingQueryKey({ category: "beauty"     }) } });
  const { data: essentialsItems = [] } = useListClothing({ category: "essentials" }, { query: { queryKey: getListClothingQueryKey({ category: "essentials" }) } });
  const { data: savedOutfitsList = [] } = useListOutfits();

  const rowData: Record<RowKey, ClothingItem[]> = { outfits: outfitsItems, beauty: beautyItems, essentials: essentialsItems };
  const totalItems = outfitsItems.length + beautyItems.length + essentialsItems.length;


  const queryClient = useQueryClient();
  const { tier, canAddItem } = useEntitlements();

  // ── Dev-only: seed one placeholder item per category when ?seed=1 ──────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("seed") !== "1") return;
    const SEED_KEY = "wardrobe-seed-done";
    if (sessionStorage.getItem(SEED_KEY)) return;
    sessionStorage.setItem(SEED_KEY, "1");
    const seeds: { name: string; category: string }[] = [
      { name: "Summer Dress",   category: "outfits"    },
      { name: "Rose Serum",     category: "beauty"     },
      { name: "Travel Shampoo", category: "toiletries" },
      { name: "Charger Kit",    category: "essentials" },
    ];
    Promise.all(seeds.map(s => createClothingItem(s)))
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["clothing"] });
      })
      .catch(() => {/* dev-only, silent */ });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCentred(prev => {
      const next = { ...prev };
      let changed = false;
      (["outfits", "beauty", "essentials"] as RowKey[]).forEach(key => {
        if (rowData[key].length === 0 && next[key] !== undefined) {
          delete next[key]; changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [outfitsItems.length, beautyItems.length, essentialsItems.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCentredHandlers: Record<RowKey, (item: ClothingItem | null) => void> = {
    outfits:    useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, outfits:    item ?? undefined })), []),
    beauty:     useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, beauty:     item ?? undefined })), []),
    essentials: useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, essentials: item ?? undefined })), []),
  };

  const handleAddClick = useCallback((cat: Category) => {
    if (canAddItem(totalItems)) setAddCategory(cat); else setUpgradeReason("items");
  }, [canAddItem, totalItems]);

  const addHandlers: Record<RowKey, () => void> = {
    outfits:    useCallback(() => handleAddClick("outfits"),    [handleAddClick]),
    beauty:     useCallback(() => handleAddClick("beauty"),     [handleAddClick]),
    essentials: useCallback(() => handleAddClick("essentials"), [handleAddClick]),
  };

  const handleItemTap = useCallback((item: ClothingItem) => setDetailsItem(item), []);

  const handleSave = () => {
    if (!saveName.trim()) return;
    const itemIds = Object.values(centred)
      .filter((i): i is ClothingItem => i != null)
      .map(i => i.id);
    saveOutfit.mutate(
      { data: { name: saveName.trim(), itemIds } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
          setSaveSuccess(true);
          setTimeout(() => { setIsSaveOpen(false); setSaveSuccess(false); setSaveName(""); }, 1400);
        },
      },
    );
  };

  const [, navigate] = useLocation();
  const isFree    = tier === "free";
  const itemsLeft = isFree ? Math.max(0, FREE_ITEM_LIMIT - totalItems) : null;
  const ready     = ir.width > 0;

  // ── Section layout helpers ────────────────────────────────────────────────
  // Each carousel spans from sectionTop up to just before the heading label,
  // so photos sit on the shelf board ABOVE the "+ Add …" text.
  // 0.015 gap keeps the bottom of the photo clear of the heading.
  const SECTION_BOTTOM_GAP = 0.015;
  const sectionHeights = ready
    ? ROWS.map(({ headingTopFrac }, i) => {
        const top    = i > 0
          ? (ROWS[i - 1].headingTopFrac ?? LM.rows[i - 1].sectionTop)
          : LM.rows[0].sectionTop;
        const bottom = (headingTopFrac ?? LM.rows[i].shelfY) - SECTION_BOTTOM_GAP;
        return pH(ir, bottom - top);
      })
    : ROWS.map(() => 0);

  // Use the smallest row height so all carousels show photos at the same size
  const uniformPhotoH = Math.max(0, Math.min(...sectionHeights) - 4);

  return (
    // On phone: leave 90px for bottom nav. On iPad: sidebar takes no vertical space.
    <div className="h-[calc(100dvh-90px)] md:h-[100dvh]">
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#fce8ef",
      }}
    >
      {/* ── Background image ── */}
      <img
        src="/cleaning-shelves-bg.png"
        alt="My Digital Cleaning"
        style={{
          position: "absolute",
          top: 0, left: 0,
          width: "100%", height: "100%",
          objectFit: "fill",
          objectPosition: "center",
          display: "block",
          pointerEvents: "none",
          userSelect: "none",
          zIndex: 0,
        }}
      />

      {ready && (
        <>
          {/* ── Page title ── */}
          <div style={{
            position: "absolute",
            top: pY(ir, 0.068),
            left: 8,
            right: 8,
            zIndex: 25,
            textAlign: "center",
            pointerEvents: "none",
            overflow: "hidden",
          }}>
            <div style={{
              fontFamily: "'Dancing Script', cursive",
              fontWeight: 700,
              fontSize: Math.max(20, Math.min(pW(ir, 0.072), ir.containerW * 0.075)),
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
              color: "#8b1a4a",
              lineHeight: 1.1,
            }}>
              My Digital Cleaning
            </div>
          </div>

          {/* ── Item-count badge (free tier) ── */}
          {itemsLeft !== null && (
            <button
              onClick={() => setUpgradeReason("items")}
              data-testid="badge-item-count"
              aria-label={`${totalItems} of ${FREE_ITEM_LIMIT} items used — tap to upgrade`}
              style={{
                position: "absolute",
                top: pY(ir, 0.036), left: "50%", transform: "translateX(-50%)",
                zIndex: 25,
                padding: "3px 14px", borderRadius: 20, border: "none",
                background: totalItems >= FREE_ITEM_LIMIT
                  ? "rgba(200,40,40,0.14)"
                  : "rgba(255,255,255,0.55)",
                boxShadow: totalItems >= FREE_ITEM_LIMIT
                  ? "0 0 0 2px rgba(200,40,40,0.40)"
                  : "0 0 0 1.5px rgba(180,100,110,0.28)",
                color: totalItems >= FREE_ITEM_LIMIT ? "#aa0000" : "#c2185b",
                fontWeight: 700, fontSize: 10,
                letterSpacing: "0.08em", textTransform: "uppercase",
                whiteSpace: "nowrap", cursor: "pointer",
              }}
            >
              {totalItems}/{FREE_ITEM_LIMIT} ITEMS
            </button>
          )}

          {/* ── 4 shelf rows ── */}
          {ROWS.map(({ key, btnLabel, showLabel, shelfHeading, headingTopFrac }, rowIdx) => {
            const lm      = LM.rows[rowIdx];
            const items   = rowData[key];

            const secTopFrac    = rowIdx > 0
              ? (ROWS[rowIdx - 1].headingTopFrac ?? LM.rows[rowIdx - 1].sectionTop)
              : LM.rows[0].sectionTop;
            const secBottomFrac = (headingTopFrac ?? lm.shelfY) - SECTION_BOTTOM_GAP;
            const secTop  = pY(ir, secTopFrac);
            const secH    = pH(ir, secBottomFrac - secTopFrac);
            const carLeft = pX(ir, LM.doorL);
            const carW    = pW(ir, LM.doorR - LM.doorL);

            // ADD button: centered in the section at btnCY
            const btnCY   = pY(ir, lm.btnCY);
            const btnH    = Math.max(32, pH(ir, 0.045));

            const labelY = pY(ir, lm.btnCY + (lm.sectionTop - lm.btnCY) * 0.08);

            return (
              <React.Fragment key={key}>

                {/* ── Shelf heading (tappable → opens add sheet) ── */}
                {shelfHeading && (
                  <button
                    onClick={addHandlers[key]}
                    aria-label={`Add to ${shelfHeading}`}
                    style={{
                      position: "absolute",
                      top:       pY(ir, headingTopFrac ?? lm.sectionTop + 0.01),
                      left:      carLeft,
                      width:     carW,
                      transform: "translateY(-50%)",
                      zIndex:    24,
                      textAlign: "center",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <span style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 800,
                      fontSize:   Math.max(10, pH(ir, 0.018)),
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "#fff",
                      textShadow: "0 1px 4px rgba(0,0,0,0.18)",
                    }}>
                      + Add {shelfHeading}
                    </span>
                  </button>
                )}

                {/* ── Category label (tappable → add photo) ── */}
                {showLabel && (
                <button
                  onClick={addHandlers[key]}
                  aria-label={btnLabel}
                  style={{
                    position: "absolute",
                    top: labelY,
                    left: carLeft,
                    width: carW,
                    transform: "translateY(-50%)",
                    zIndex: 23,
                    textAlign: "center",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <span style={{
                    fontSize: Math.max(9, pH(ir, 0.013)),
                    fontWeight: 800,
                    letterSpacing: "0.12em",
                    color: "#8b1a4a",
                    fontFamily: "var(--font-display)",
                    textTransform: "uppercase",
                  }}>
                    {btnLabel}
                  </span>
                </button>
                )}

                {/* ── Item carousel — fills the section between buttons ── */}
                {items.length > 0 && (
                  <div
                    data-testid={`row-${key}`}
                    style={{
                      position: "absolute",
                      top:    secTop,
                      left:   carLeft,
                      width:  carW,
                      height: secH,
                      zIndex: 10,
                      overflow: "visible",
                    }}
                  >
                    <ClosetRow
                      ref={rowRefs[key]}
                      items={items}
                      onCenteredItem={setCentredHandlers[key]}
                      onItemTap={handleItemTap}
                      maxPhotoH={uniformPhotoH}
                    />
                  </div>
                )}


              </React.Fragment>
            );
          })}


          {/* ── Spray bottle (left) → saved cleans ── */}
          <button
            onClick={() => navigate("/favorites")}
            aria-label="Favorites"
            data-testid="btn-spray-favorites"
            style={{
              position: "absolute",
              top:    pY(ir, 0.868),
              left:   pX(ir, 0.100),
              width:  pW(ir, 0.175),
              height: pH(ir, 0.110),
              borderRadius: "50%",
              zIndex: 26,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          />

          {/* ── Broom (right) → matchmaker ── */}
          <button
            onClick={() => { setUpgradeReason("items"); }}
            aria-label="Upgrade plan"
            data-testid="btn-broom-upgrade"
            style={{
              position: "absolute",
              top:    pY(ir, 0.868),
              left:   pX(ir, 0.710),
              width:  pW(ir, 0.175),
              height: pH(ir, 0.110),
              borderRadius: "50%",
              zIndex: 26,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          />

          {/* ── SAVE button ── */}
          <button
            onClick={() => { setSaveName(""); setIsSaveOpen(true); }}
            aria-label="Save current case"
            style={{
              position: "absolute",
              top:    pY(ir, 0.868) - pW(ir, 0.074),
              left:   pX(ir, 0.500)  - pW(ir, 0.074),
              width:  pW(ir, 0.148),
              height: pW(ir, 0.148),
              borderRadius: "50%",
              zIndex: 26,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          />
        </>
      )}

      {/* ── Save modal ── */}
      <AnimatePresence>
        {isSaveOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "absolute", inset: 0, zIndex: 60,
              background: "rgba(0,0,0,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "0 24px",
            }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 12 }}
              style={{
                background: "#fff", borderRadius: 20,
                border: "2.5px solid #000",
                boxShadow: "4px 4px 0 #000",
                padding: "24px 20px 20px",
                width: "100%", maxWidth: 340,
              }}
            >
              {saveSuccess ? (
                <div style={{ textAlign: "center", padding: "12px 0" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>💕</div>
                  <p style={{ fontWeight: 800, fontSize: 16, fontFamily: "var(--font-display)" }}>Cleaning saved!</p>
                </div>
              ) : (
                <>
                  <p style={{ fontWeight: 800, fontSize: 15, fontFamily: "var(--font-display)", marginBottom: 12 }}>
                    Name this case
                  </p>
                  <input
                    autoFocus
                    value={saveName}
                    onChange={e => setSaveName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && saveName.trim() && handleSave()}
                    placeholder="e.g. Sunday Glow ✨"
                    style={{
                      width: "100%", height: 42, borderRadius: 10,
                      border: "2px solid #000", padding: "0 12px",
                      fontSize: 14, fontFamily: "var(--font-display)",
                      boxSizing: "border-box", marginBottom: 12, outline: "none",
                    }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setIsSaveOpen(false)}
                      style={{
                        flex: 1, height: 40, borderRadius: 20,
                        border: "2px solid #000", background: "#fff",
                        fontWeight: 700, fontSize: 13, cursor: "pointer",
                        fontFamily: "var(--font-display)",
                      }}
                    >Cancel</button>
                    <button
                      onClick={handleSave}
                      disabled={!saveName.trim() || saveOutfit.isPending}
                      style={{
                        flex: 1, height: 40, borderRadius: 20,
                        border: "2px solid #e8649a",
                        background: "linear-gradient(135deg, #f9c3d9 0%, #e8649a 100%)",
                        color: "#fff", fontWeight: 800, fontSize: 13,
                        cursor: saveName.trim() ? "pointer" : "default",
                        opacity: saveName.trim() ? 1 : 0.45,
                        fontFamily: "var(--font-display)",
                      }}
                    >
                      {saveOutfit.isPending ? "…" : "Save ♡"}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modals ── */}
      <AnimatePresence>
        {upgradeReason && (
          <UpgradeSheet reason={upgradeReason} onClose={() => setUpgradeReason(null)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {addCategory && (
          <QuickAddSheet
            key={addCategory}
            open={!!addCategory}
            onOpenChange={open => !open && setAddCategory(null)}
            category={addCategory}
            existingCount={rowData[addCategory as RowKey]?.length ?? 0}
          />
        )}
      </AnimatePresence>
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
    </div>
  );
}
