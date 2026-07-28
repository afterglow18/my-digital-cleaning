/**
 * GeneratePage — "Spin It" screen for My Digital Suitcase.
 *
 * Uses generate-bg.png (same 1024×1536 dimensions) with the 4-shelf layout.
 * Phase machine:
 *   idle     → shelves display items; "✨ Spin It!" button at bottom
 *   spinning → carousels cycle randomly while API is in flight
 *   result   → carousels landed on AI pick; "As If!" + "Save It ♡" buttons
 *   (save input inline, same pattern as wardrobe)
 */

import React, {
  useCallback, useEffect, useRef, useState, RefObject,
} from "react";
import {
  useListClothing, getListClothingQueryKey,
  useGenerateOutfit, useSaveOutfit, getListOutfitsQueryKey,
  type ClothingItem,
} from "@/hooks/useLocalDB";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ClosetRow, ClosetRowHandle } from "@/components/ClosetRow";
import { useQueryClient } from "@tanstack/react-query";

// ── Layout constants (same as wardrobe.tsx) ───────────────────────────────────
const IMG_W = 1024;
const IMG_H = 1536;
const NAV_H = 90;
const PINK  = "#e8649a";

const LM = {
  doorL: 0.10,   // left usable boundary (shelves span near full width, clear of window/bucket)
  doorR: 0.90,   // right usable boundary (clear of right-side cabinet)
  rows: [
    { sectionTop: 0.13, shelfY: 0.280, btnCY: 0.20 },  // OUTFITS    (shelf 1 surface at 28.0%)
    { sectionTop: 0.30, shelfY: 0.500, btnCY: 0.40 },  // BEAUTY     (shelf 2 surface at 50.0%)
    { sectionTop: 0.73, shelfY: 0.870, btnCY: 0.80 },  // ESSENTIALS (below all shelves)
  ],
  barY:   0.840,
  barBot: 1.000,
} as const;

interface ImgRect {
  top: number; left: number; width: number; height: number;
  containerH: number;
}

function useImageRect(ref: RefObject<HTMLDivElement>): ImgRect {
  const [rect, setRect] = useState<ImgRect>({ top: 0, left: 0, width: 0, height: 0, containerH: 0 });
  useEffect(() => {
    const compute = () => {
      const c = ref.current;
      if (!c) return;
      const cW = c.clientWidth, cH = c.clientHeight;
      const iR = IMG_W / IMG_H;
      // Fill: stretch image to exactly match container — full bed visible
      setRect({ top: 0, left: 0, width: cW, height: cH, containerH: cH });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [ref]);
  return rect;
}

const pH = (ir: ImgRect, f: number) => ir.height * f;
const pW = (ir: ImgRect, f: number) => ir.width  * f;
const pX = (ir: ImgRect, f: number) => ir.left   + ir.width  * f;
const pY = (ir: ImgRect, f: number) => ir.top    + ir.height * f;

// ── Types ─────────────────────────────────────────────────────────────────────
type RowKey = "outfits" | "beauty" | "essentials";
type Phase  = "idle" | "spinning" | "result";

const ROWS: { key: RowKey; shelfHeading: string; headingTopFrac?: number }[] = [
  { key: "outfits",    shelfHeading: "Supplies", headingTopFrac: 0.256 },
  { key: "beauty",     shelfHeading: "Tools",    headingTopFrac: 0.416 },
  { key: "essentials", shelfHeading: "Areas",    headingTopFrac: 0.592 },
];

const MIN_SPIN_MS = 1600;

// ── Page ──────────────────────────────────────────────────────────────────────
export default function GeneratePage() {
  const containerRef = useRef<HTMLDivElement>(null!);
  const ir    = useImageRect(containerRef);
  const ready = ir.width > 0;

  const rowRefs: Record<RowKey, RefObject<ClosetRowHandle | null>> = {
    outfits:    useRef<ClosetRowHandle | null>(null),
    beauty:     useRef<ClosetRowHandle | null>(null),
    essentials: useRef<ClosetRowHandle | null>(null),
  };

  const [phase,      setPhase]      = useState<Phase>("idle");
  const [centred,    setCentred]    = useState<Partial<Record<RowKey, ClothingItem>>>({});
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [saveName,   setSaveName]   = useState("");

  const rowDataRef = useRef<Record<RowKey, ClothingItem[]>>({
    outfits: [], beauty: [], essentials: [],
  });

  const { data: outfits    = [] } = useListClothing({ category: "outfits"    }, { query: { queryKey: getListClothingQueryKey({ category: "outfits"    }) } });
  const { data: beauty     = [] } = useListClothing({ category: "beauty"     }, { query: { queryKey: getListClothingQueryKey({ category: "beauty"     }) } });
  const { data: essentials = [] } = useListClothing({ category: "essentials" }, { query: { queryKey: getListClothingQueryKey({ category: "essentials" }) } });

  useEffect(() => { rowDataRef.current = { outfits, beauty, essentials }; }, [outfits, beauty, essentials]);

  const hasItems = outfits.length > 0 || beauty.length > 0 || essentials.length > 0;

  const setCentredHandlers: Record<RowKey, (item: ClothingItem | null) => void> = {
    outfits:    useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, outfits:    item ?? undefined })), []),
    beauty:     useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, beauty:     item ?? undefined })), []),
    essentials: useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, essentials: item ?? undefined })), []),
  };

  const generateOutfit = useGenerateOutfit();
  const saveOutfit     = useSaveOutfit();
  const queryClient    = useQueryClient();

  // ── Spin ──────────────────────────────────────────────────────────────────
  const spinningRef = useRef(false);

  const startSpin = useCallback(() => {
    if (spinningRef.current) return;
    spinningRef.current = true;
    setPhase("spinning");
    setCentred({});
    setIsSaveOpen(false);
    setSaveName("");

    const spinStart = Date.now();
    const stop: Record<RowKey, boolean> = { outfits: false, beauty: false, essentials: false };

    ROWS.forEach(({ key }, ri) => {
      const INTERVAL = 65 + ri * 18;
      const cycle = () => {
        if (stop[key]) return;
        const items = rowDataRef.current[key];
        if (items.length > 1) {
          rowRefs[key].current?.scrollToIndex(
            Math.floor(Math.random() * items.length),
            false,
          );
        }
        setTimeout(cycle, INTERVAL);
      };
      cycle();
    });

    generateOutfit.mutate(
      { data: { excludeCategories: [] } },
      {
        onSuccess: (data) => {
          const landMap: Partial<Record<RowKey, { item: ClothingItem; idx: number }>> = {};
          data.items.forEach(apiItem => {
            const key = apiItem.category as RowKey;
            if (!["outfits", "beauty", "essentials"].includes(key)) return;
            const arr = rowDataRef.current[key];
            const localIdx = arr.findIndex(i => i.id === apiItem.id);
            landMap[key] = { item: apiItem, idx: localIdx >= 0 ? localIdx : 0 };
          });

          const elapsed   = Date.now() - spinStart;
          const extraWait = Math.max(0, MIN_SPIN_MS - elapsed);

          setTimeout(() => {
            ROWS.forEach(({ key }, ri) => {
              setTimeout(() => {
                stop[key] = true;
                const target = landMap[key];
                rowRefs[key].current?.scrollToIndex(target?.idx ?? 0, true);
              }, ri * 280);
            });

            const lastLandAt = (ROWS.length - 1) * 280 + 380;
            setTimeout(() => {
              const newCentred: Partial<Record<RowKey, ClothingItem>> = {};
              ROWS.forEach(({ key }) => {
                if (landMap[key]) newCentred[key] = landMap[key]!.item;
              });
              setCentred(newCentred);
              setPhase("result");
              spinningRef.current = false;
            }, lastLandAt);
          }, extraWait);
        },

        onError: () => {
          ROWS.forEach(({ key }) => { stop[key] = true; });
          setPhase("idle");
          spinningRef.current = false;
        },
      },
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSpin   = useCallback(() => {
    if (!hasItems || phase === "spinning") return;
    startSpin();
  }, [hasItems, phase, startSpin]);

  const handleRespin = useCallback(() => startSpin(), [startSpin]);

  const handleSave = () => {
    if (!saveName.trim()) return;
    const itemIds = Object.values(centred)
      .filter((i): i is ClothingItem => i != null)
      .map(i => i.id);
    saveOutfit.mutate(
      { data: { name: saveName.trim(), itemIds } },
      { onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
        setIsSaveOpen(false);
        setSaveName("");
      }},
    );
  };

  const canSave = Object.keys(centred).length > 0;

  // ── Section layout helpers — per-row, same as wardrobe.tsx ──────────────
  // 0.03 gap keeps photos from overlapping the next heading text
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

  // Same uniform size as wardrobe page — smallest section height drives all rows
  const uniformPhotoH = Math.max(0, Math.min(...sectionHeights) - 4);

  // ── Render ────────────────────────────────────────────────────────────────
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

      {ready && (() => {
        const carLeft = pX(ir, LM.doorL);
        const carW    = pW(ir, LM.doorR - LM.doorL);

        return (
          <>
            {/* ── Page title ── */}
            <div style={{
              position: "absolute",
              top: pY(ir, 0.032),
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
                fontSize: Math.max(20, Math.min(pW(ir, 0.072), ir.containerH * 0.060)),
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
                color: "#8b1a4a",
                lineHeight: 1.1,
              }}>
                My Digital Cleaning
              </div>
              <div style={{
                fontFamily: "var(--font-display, serif)",
                fontWeight: 900,
                fontSize: Math.max(10, Math.min(pW(ir, 0.040), ir.containerH * 0.032)),
                letterSpacing: "0.06em",
                whiteSpace: "nowrap",
                textTransform: "uppercase",
                color: "#8b1a4a",
                lineHeight: 1.1,
              }}>
                MATCHMAKER
              </div>
            </div>

            {/* ── 4 shelf carousels + ADD-button covers ── */}
            {ROWS.map(({ key, shelfHeading, headingTopFrac }, rowIdx) => {
              const lm    = LM.rows[rowIdx];
              const items = { outfits, beauty, essentials }[key];
              const secTopFrac    = rowIdx > 0
                ? (ROWS[rowIdx - 1].headingTopFrac ?? LM.rows[rowIdx - 1].sectionTop)
                : LM.rows[0].sectionTop;
              const secBottomFrac = (headingTopFrac ?? lm.shelfY) - SECTION_BOTTOM_GAP;
              const secTop = pY(ir, secTopFrac);
              const secH   = pH(ir, secBottomFrac - secTopFrac);
              const btnCY  = pY(ir, lm.btnCY);
              const btnH   = Math.max(32, pH(ir, 0.045));

              return (
                <React.Fragment key={key}>

                  {/* ── Shelf heading (Supplies / Tools / Areas) ── */}
                  <div style={{
                    position: "absolute",
                    top: pY(ir, headingTopFrac ?? lm.sectionTop + 0.01),
                    left: carLeft,
                    width: carW,
                    transform: "translateY(-50%)",
                    zIndex: 12,
                    textAlign: "center",
                    pointerEvents: "none",
                  }}>
                    <span style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 800,
                      fontSize: Math.max(10, pH(ir, 0.018)),
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "#fff",
                      textShadow: "0 1px 4px rgba(0,0,0,0.18)",
                    }}>
                      {shelfHeading}
                    </span>
                  </div>

                  {items.length > 0 ? (
                    <div
                      style={{
                        position: "absolute",
                        top: secTop, left: carLeft, width: carW, height: secH,
                        zIndex: 10, overflow: "visible",
                      }}
                    >
                      <ClosetRow
                        ref={rowRefs[key]}
                        items={items}
                        onCenteredItem={setCentredHandlers[key]}
                        maxPhotoH={uniformPhotoH}
                        disableSwipe
                      />
                    </div>
                  ) : (
                    <div style={{
                      position: "absolute",
                      top: secTop, left: carLeft, width: carW, height: secH,
                      zIndex: 10,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        letterSpacing: "0.09em", textTransform: "uppercase",
                        color: "rgba(180,100,110,0.40)",
                      }}>
                        No items
                      </span>
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            {/* ── Spinning sparkle overlay ── */}
            <AnimatePresence>
              {phase === "spinning" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{
                    position: "absolute",
                    top: "46%", left: "50%",
                    transform: "translate(-50%, -50%)",
                    zIndex: 25,
                    pointerEvents: "none",
                    display: "flex", flexDirection: "column",
                    alignItems: "center", gap: 8,
                  }}
                >
                  <motion.span
                    animate={{ scale: [1, 1.18, 1], rotate: [0, 12, -12, 0] }}
                    transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }}
                    style={{ fontSize: 26, lineHeight: 1, display: "block" }}
                  >
                    ✨
                  </motion.span>
                  <span style={{
                    fontSize: 10, fontWeight: 800,
                    letterSpacing: "0.13em", textTransform: "uppercase",
                    color: "#8b1a4a",
                    background: "rgba(255,220,235,0.90)",
                    padding: "3px 11px", borderRadius: 20,
                    whiteSpace: "nowrap",
                  }}>
                    Building your clean…
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Empty prompt ── */}
            {!hasItems && (
              <div style={{
                position: "absolute",
                top: "46%", left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 30,
                textAlign: "center",
                padding: "14px 22px",
                borderRadius: 16,
                background: "rgba(255,220,235,0.92)",
                border: "1.5px solid rgba(232,100,154,0.35)",
                boxShadow: "0 4px 18px rgba(0,0,0,0.11)",
                maxWidth: pW(ir, 0.65),
              }}>
                <p style={{
                  fontWeight: 800, fontSize: 12,
                  letterSpacing: "0.07em", textTransform: "uppercase",
                  color: "#8b1a4a", fontFamily: "var(--font-display)", margin: 0,
                }}>
                  Your cleaning bag is empty
                </p>
                <p style={{
                  fontSize: 11, color: "#9a5060",
                  marginTop: 5, lineHeight: 1.5,
                }}>
                  Add supplies, tools or areas in the Cleaning tab first.
                </p>
              </div>
            )}


            {/* ── Action bar — white panel behind buttons ── */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                top:    pY(ir, LM.barY),
                left:   0,
                width:  "100%",
                height: pH(ir, LM.barBot - LM.barY),
                zIndex: 18,
                pointerEvents: "none",
                background: "rgba(255,220,235,0.96)",
                borderTop: "1px solid rgba(232,100,154,0.20)",
              }}
            />

            {/* ── CTA buttons ── */}
            <div
              style={{
                position: "absolute",
                top:    pY(ir, LM.barY),
                left:   pX(ir, LM.doorL),
                width:  pW(ir, LM.doorR - LM.doorL),
                height: pH(ir, LM.barBot - LM.barY),
                zIndex: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AnimatePresence mode="wait">

                {/* IDLE: Spin It */}
                {phase === "idle" && !isSaveOpen && (
                  <motion.button
                    key="spin-btn"
                    initial={{ opacity: 0, scale: 0.88 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.88 }}
                    transition={{ type: "spring", stiffness: 360, damping: 26 }}
                    onClick={handleSpin}
                    disabled={!hasItems}
                    style={{
                      width: "100%", height: 52, borderRadius: 28,
                      border: "2.5px solid #e8649a",
                      background: hasItems
                        ? "linear-gradient(135deg, #f9c3d9 0%, #e8649a 100%)"
                        : "rgba(240,190,215,0.32)",
                      color: hasItems ? "#fff" : "#b06080",
                      fontWeight: 800, fontSize: 16,
                      letterSpacing: "-0.01em", textTransform: "uppercase",
                      whiteSpace: "nowrap",
                      boxShadow: hasItems ? "3px 3px 0 rgba(0,0,0,0.85)" : "none",
                      cursor: hasItems ? "pointer" : "default",
                      fontFamily: "var(--font-display)",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                    }}
                  >
                    ✨ Spin It!
                  </motion.button>
                )}

                {/* SPINNING: bouncing dots */}
                {phase === "spinning" && (
                  <motion.div
                    key="dots"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                      display: "flex", gap: 6,
                      padding: "0 24px", height: 44,
                      alignItems: "center", justifyContent: "center",
                      borderRadius: 24,
                      background: "rgba(255,220,235,0.85)",
                      border: "1.5px solid rgba(232,100,154,0.28)",
                    }}
                  >
                    {[0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        animate={{ y: [0, -6, 0] }}
                        transition={{
                          repeat: Infinity, duration: 0.65,
                          delay: i * 0.16, ease: "easeInOut",
                        }}
                        style={{
                          width: 7, height: 7, borderRadius: "50%",
                          background: PINK,
                        }}
                      />
                    ))}
                  </motion.div>
                )}

                {/* RESULT: As If! + Save It */}
                {phase === "result" && !isSaveOpen && (
                  <motion.div
                    key="result-btns"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    style={{
                      display: "flex", gap: 18, justifyContent: "center",
                      width: "100%",
                    }}
                  >
                    <button
                      onClick={handleRespin}
                      style={{
                        flexGrow: 1, flexShrink: 1, flexBasis: "0%", minWidth: 0,
                        height: 54, borderRadius: 28,
                        border: "2.5px solid #e8649a",
                        background: "linear-gradient(135deg, #f9c3d9 0%, #e8649a 100%)",
                        color: "#fff",
                        fontFamily: "var(--font-display)",
                        fontWeight: 800, fontSize: 14,
                        letterSpacing: "-0.01em", textTransform: "uppercase",
                        whiteSpace: "nowrap",
                        boxShadow: "2px 2px 0 rgba(0,0,0,0.85)",
                        cursor: "pointer",
                        display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center",
                        gap: 2, padding: "0 12px",
                      }}
                    >
                      <span>Respin</span>
                      <span style={{ fontSize: 14, lineHeight: 1 }}>✨</span>
                    </button>

                    <button
                      onClick={() => setIsSaveOpen(true)}
                      disabled={!canSave}
                      style={{
                        flexGrow: 1, flexShrink: 1, flexBasis: "0%", minWidth: 0,
                        height: 54, borderRadius: 28,
                        border: "2.5px solid #e8649a",
                        background: canSave ? "#fff" : "rgba(240,240,240,0.80)",
                        color: "#8b1a4a",
                        fontFamily: "var(--font-display)",
                        fontWeight: 800, fontSize: 14,
                        letterSpacing: "-0.01em", textTransform: "uppercase",
                        whiteSpace: "nowrap",
                        boxShadow: canSave ? "2px 2px 0 rgba(0,0,0,0.85)" : "none",
                        cursor: canSave ? "pointer" : "default",
                        opacity: canSave ? 1 : 0.5,
                        display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center",
                        gap: 2, padding: "0 12px",
                      }}
                    >
                      <span>Save</span>
                      <span style={{ fontSize: 14, lineHeight: 1 }}>♡</span>
                    </button>
                  </motion.div>
                )}

                {/* SAVE INPUT */}
                {isSaveOpen && (
                  <motion.div
                    key="save-input"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    style={{ display: "flex", gap: 6, width: "100%", padding: "0 8px" }}
                  >
                    <input
                      autoFocus
                      type="text"
                      placeholder="Name this case…"
                      value={saveName}
                      onChange={e => setSaveName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSave()}
                      style={{
                        flex: 1, height: 38, borderRadius: 20, padding: "0 14px",
                        fontSize: 13, fontWeight: 600, color: "#8b1a4a",
                        background: "rgba(255,230,240,0.98)",
                        border: "1.5px solid rgba(232,100,154,0.40)",
                        boxShadow: "0 3px 12px rgba(0,0,0,0.13)",
                        outline: "none",
                      }}
                    />
                    <button
                      onClick={() => { setIsSaveOpen(false); setSaveName(""); }}
                      style={{
                        width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                        background: "rgba(255,230,240,0.97)",
                        border: "1.5px solid rgba(232,100,154,0.28)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer",
                      }}
                    >
                      <X style={{ width: 14, height: 14, color: PINK }} />
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={!saveName.trim() || saveOutfit.isPending}
                      style={{
                        padding: "0 14px", height: 36, borderRadius: 20, flexShrink: 0,
                        background: "linear-gradient(135deg, #f9c3d9 0%, #e8649a 100%)",
                        color: "#fff", fontWeight: 700, fontSize: 13, border: "1.5px solid #e8649a",
                        boxShadow: "0 3px 10px rgba(120,80,40,0.30)",
                        opacity: (!saveName.trim() || saveOutfit.isPending) ? 0.42 : 1,
                        cursor: "pointer",
                      }}
                    >
                      {saveOutfit.isPending ? "…" : "Save ♡"}
                    </button>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>
          </>
        );
      })()}
    </div>
    </div>
  );
}
