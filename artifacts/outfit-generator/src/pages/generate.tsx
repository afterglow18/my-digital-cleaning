/**
 * GeneratePage — "Matchmaker" screen.
 *
 * Identical closet background and ClosetRow carousels as WardrobePage.
 * Phase machine:
 *   idle     → wardrobe display; golden "✨ Spin It!" button on rug
 *   spinning → carousels cycle randomly while API is in flight
 *   result   → carousels landed on AI pick; Re-spin + Save It ♡ on rug
 *   (save input inline in rug bar, same pattern as wardrobe)
 */

import React, {
  useCallback, useEffect, useRef, useState, RefObject,
} from "react";
import {
  useListClothing, getListClothingQueryKey,
  useGenerateOutfit, useSaveOutfit, getListOutfitsQueryKey,
  ClothingItem,
} from "@workspace/api-client-react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ClosetRow, ClosetRowHandle } from "@/components/ClosetRow";
import { useQueryClient } from "@tanstack/react-query";

// ── Layout constants (identical to wardrobe.tsx) ──────────────────────────────
const IMG_W = 941;
const IMG_H = 1672;
const NAV_H = 90;
const GOLD  = "#C49B2A";

const LM = {
  doorL: 0.092,
  doorR: 0.901,
  rows: [
    { btnCY: 0.311, boxY: 0.319 },
    { btnCY: 0.498, boxY: 0.506 },
    { btnCY: 0.690, boxY: 0.697 },
  ],
  barY:    0.885,
  barBot:  0.993,
  saveBtnL: 0.350,
  saveBtnR: 0.650,
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
      const cR = cW / cH;
      let rW: number, rH: number, rL: number, rT: number;
      if (cR > iR) { rH = cH; rW = cH * iR; rT = 0; rL = (cW - rW) / 2; }
      else          { rW = cW; rH = cW / iR; rL = 0; rT = 0; }
      setRect({ top: rT, left: rL, width: rW, height: rH, containerH: cH });
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
type RowKey = "tops" | "bottoms" | "shoes";
type Phase  = "idle" | "spinning" | "result";

const ROWS: { key: RowKey }[] = [
  { key: "tops"    },
  { key: "bottoms" },
  { key: "shoes"   },
];

// Minimum spin duration (ms) even if API responds instantly — so the animation
// always feels deliberate.
const MIN_SPIN_MS = 1600;

// ── Page ──────────────────────────────────────────────────────────────────────
export default function GeneratePage() {
  const containerRef = useRef<HTMLDivElement>(null!);
  const ir    = useImageRect(containerRef);
  const ready = ir.width > 0;

  const rowRefs: Record<RowKey, RefObject<ClosetRowHandle | null>> = {
    tops:    useRef<ClosetRowHandle | null>(null),
    bottoms: useRef<ClosetRowHandle | null>(null),
    shoes:   useRef<ClosetRowHandle | null>(null),
  };

  const [phase,      setPhase]      = useState<Phase>("idle");
  const [centred,    setCentred]    = useState<Partial<Record<RowKey, ClothingItem>>>({});
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [saveName,   setSaveName]   = useState("");

  // Ref so the spin callbacks always read the latest rowData without needing
  // to be recreated on every data change.
  const rowDataRef = useRef<Record<RowKey, ClothingItem[]>>({ tops: [], bottoms: [], shoes: [] });

  const { data: tops    = [] } = useListClothing({ category: "tops"    }, { query: { queryKey: getListClothingQueryKey({ category: "tops"    }) } });
  const { data: bottoms = [] } = useListClothing({ category: "bottoms" }, { query: { queryKey: getListClothingQueryKey({ category: "bottoms" }) } });
  const { data: shoes   = [] } = useListClothing({ category: "shoes"   }, { query: { queryKey: getListClothingQueryKey({ category: "shoes"   }) } });

  useEffect(() => { rowDataRef.current = { tops, bottoms, shoes }; }, [tops, bottoms, shoes]);

  const hasItems = tops.length > 0 || bottoms.length > 0 || shoes.length > 0;

  const setCentredTops    = useCallback((item: ClothingItem | null) =>
    setCentred(p => ({ ...p, tops:    item ?? undefined })), []);
  const setCentredBottoms = useCallback((item: ClothingItem | null) =>
    setCentred(p => ({ ...p, bottoms: item ?? undefined })), []);
  const setCentredShoes   = useCallback((item: ClothingItem | null) =>
    setCentred(p => ({ ...p, shoes:   item ?? undefined })), []);
  const centredHandlers: Record<RowKey, (item: ClothingItem | null) => void> = {
    tops: setCentredTops, bottoms: setCentredBottoms, shoes: setCentredShoes,
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

    // Stop flags — each row's cycle loop checks this
    const stop: Record<RowKey, boolean> = { tops: false, bottoms: false, shoes: false };

    // Each row cycles at a slightly different cadence for a slot-machine feel
    ROWS.forEach(({ key }, ri) => {
      const INTERVAL = 65 + ri * 18; // tops=65ms, bottoms=83ms, shoes=101ms
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

    // Fire API request simultaneously with animation
    generateOutfit.mutate(
      { data: { excludeCategories: [] } },
      {
        onSuccess: (data) => {
          // Build target map: category → { item, localIdx }
          const landMap: Partial<Record<RowKey, { item: ClothingItem; idx: number }>> = {};
          data.items.forEach(apiItem => {
            const key = apiItem.category as RowKey;
            if (!["tops", "bottoms", "shoes"].includes(key)) return;
            const arr = rowDataRef.current[key];
            const localIdx = arr.findIndex(i => i.id === apiItem.id);
            landMap[key] = { item: apiItem, idx: localIdx >= 0 ? localIdx : 0 };
          });

          // Honour minimum spin time so the animation always feels deliberate
          const elapsed   = Date.now() - spinStart;
          const extraWait = Math.max(0, MIN_SPIN_MS - elapsed);

          setTimeout(() => {
            // Stagger the landing: tops 0ms, bottoms 280ms, shoes 560ms
            ROWS.forEach(({ key }, ri) => {
              setTimeout(() => {
                stop[key] = true;
                const target = landMap[key];
                rowRefs[key].current?.scrollToIndex(target?.idx ?? 0, true);
              }, ri * 280);
            });

            // Transition to result after the last row lands + snap animation
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

  const handleRespin = useCallback(() => {
    startSpin();
  }, [startSpin]);

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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: `min(calc(100dvh - ${NAV_H}px), calc(100vw * ${(IMG_H / IMG_W).toFixed(6)}))`,
        overflow: "hidden",
        background: "#F0C030",
      }}
    >
      {/* ── Background image ── */}
      <img
        src="/closet-bg.png"
        alt="My Digital Closet"
        style={{
          position: "absolute",
          top:    ready ? ir.top    : 0,
          left:   ready ? ir.left   : 0,
          width:  ready ? ir.width  : "100%",
          height: ready ? ir.height : "auto",
          display: "block",
          pointerEvents: "none",
          userSelect: "none",
          zIndex: 0,
        }}
      />

      {ready && (() => {
        const tapH       = Math.max(36, pH(ir, 0.055));
        const rowTapTops = LM.rows.map(lm => pY(ir, lm.btnCY) - tapH / 2);
        const rowTapBots = rowTapTops.map(t => t + tapH);
        const GAP_PX     = 2;

        const rowLayouts = LM.rows.map((lm, i) => {
          const nextOverlayTop = i < LM.rows.length - 1
            ? rowTapTops[i + 1]
            : pY(ir, LM.barY);
          const carTop = i === 2
            ? pY(ir, lm.boxY) + GAP_PX
            : Math.max(pY(ir, lm.boxY), rowTapBots[i] + GAP_PX);
          const carH = Math.max(0, nextOverlayTop - carTop);
          return { carTop, carH };
        });

        const minCarH   = Math.min(...rowLayouts.map(r => r.carH));
        const maxPhotoH = Math.max(0, minCarH - 2);
        const carLeft   = pX(ir, LM.doorL);
        const carRight  = ir.left + pW(ir, 1 - LM.doorR);

        return (
          <>
            {/* ── Three clothing carousels ── */}
            {ROWS.map(({ key }, rowIdx) => {
              const lm         = LM.rows[rowIdx];
              const items      = { tops, bottoms, shoes }[key];
              const { carTop, carH } = rowLayouts[rowIdx];
              const tapTop     = rowTapTops[rowIdx];
              const overlayH   = carTop - tapTop;
              const bgPosX     = -pW(ir, LM.doorL);
              const bgPosY     = -tapTop;

              return (
                <React.Fragment key={key}>
                  {/* Rod + pill overlay — re-draws background crop at z=20 so the
                      rod and baked-in label always sit above photo cards */}
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top:    tapTop,
                      left:   carLeft,
                      right:  carRight,
                      height: Math.max(0, overlayH),
                      zIndex: 20,
                      pointerEvents: "none",
                      backgroundImage: "url('/closet-bg.png')",
                      backgroundSize: `${ir.width}px ${ir.height}px`,
                      backgroundPosition: `${bgPosX}px ${bgPosY}px`,
                      backgroundRepeat: "no-repeat",
                    }}
                  />

                  {/* Clothing carousel */}
                  {items.length > 0 ? (
                    <div
                      style={{
                        position: "absolute",
                        top:    carTop,
                        left:   carLeft,
                        right:  carRight,
                        height: carH,
                        zIndex: 10,
                        overflow: "hidden",
                      }}
                    >
                      <ClosetRow
                        ref={rowRefs[key]}
                        items={items}
                        onCenteredItem={centredHandlers[key]}
                        maxPhotoH={maxPhotoH}
                      />
                    </div>
                  ) : (
                    /* Empty row placeholder */
                    <div
                      style={{
                        position: "absolute",
                        top: carTop, left: carLeft, right: carRight,
                        height: carH, zIndex: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        letterSpacing: "0.09em", textTransform: "uppercase",
                        color: "rgba(160,100,60,0.35)",
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
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
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
                    color: "#6a3a10",
                    background: "rgba(255,248,225,0.88)",
                    padding: "3px 11px", borderRadius: 20,
                    whiteSpace: "nowrap",
                  }}>
                    Finding your look…
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Empty wardrobe prompt ── */}
            {!hasItems && (
              <div style={{
                position: "absolute",
                top: "46%", left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 15,
                textAlign: "center",
                padding: "14px 22px",
                borderRadius: 16,
                background: "rgba(255,248,232,0.92)",
                border: "1.5px solid rgba(196,155,42,0.40)",
                boxShadow: "0 4px 18px rgba(0,0,0,0.11)",
                maxWidth: pW(ir, 0.65),
              }}>
                <p style={{
                  fontWeight: 800, fontSize: 12,
                  letterSpacing: "0.07em", textTransform: "uppercase",
                  color: "#5a3a10", fontFamily: "var(--font-display)", margin: 0,
                }}>
                  Your closet is empty
                </p>
                <p style={{
                  fontSize: 11, color: "#8a5e28",
                  marginTop: 5, lineHeight: 1.5,
                }}>
                  Add tops, bottoms and shoes in the Wardrobe tab first.
                </p>
              </div>
            )}

            {/* ── Rug cover — hides the three baked-in wardrobe circle buttons ──
                The closet-bg.png image has hanger / SAVE OUTFIT ♡ / mannequin
                circles baked into the rug.  We redraw the rug using a zoomed-in
                background-image crop of the circle-free top strip of the rug
                (y = barY → barY+0.013, just above the circles).  That thin slice
                is scaled to fill the full bar height, reproducing the authentic
                rug colour without any circles. */}
            {(() => {
              const barH           = pH(ir, LM.barBot - LM.barY);
              const rugStripH      = pH(ir, 0.013);          // circle-free rug top strip
              const scaleY         = barH / Math.max(1, rugStripH);
              const bgScaleH       = ir.height * scaleY;
              const coverBgPosX    = -pW(ir, LM.doorL);      // same x alignment as rod overlays
              const coverBgPosY    = -pY(ir, LM.barY) * scaleY;
              return (
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top:    pY(ir, LM.barY),
                    left:   pX(ir, LM.doorL),
                    right:  ir.left + pW(ir, 1 - LM.doorR),
                    height: barH,
                    zIndex: 18,
                    pointerEvents: "none",
                    backgroundImage: "url('/closet-bg.png')",
                    backgroundSize: `${ir.width}px ${bgScaleH}px`,
                    backgroundPosition: `${coverBgPosX}px ${coverBgPosY}px`,
                    backgroundRepeat: "no-repeat",
                  }}
                />
              );
            })()}

            {/* ── Rug bar — CTA buttons ── */}
            {/* Positioned over the rug cover at z=22 so they appear on the rug
                without any wardrobe circles showing through. */}
            <div
              style={{
                position: "absolute",
                top:    pY(ir, LM.barY),
                left:   pX(ir, LM.doorL),
                right:  ir.left + pW(ir, 1 - LM.doorR),
                height: pH(ir, LM.barBot - LM.barY),
                zIndex: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AnimatePresence mode="wait">

                {/* IDLE: Spin It button */}
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
                      padding: "0 28px",
                      height: 44,
                      borderRadius: 24,
                      border: "2.5px solid #000",
                      background: hasItems
                        ? "linear-gradient(to bottom, #f6db3a, #c98f12)"
                        : "rgba(210,185,100,0.32)",
                      color: "#2e1a00",
                      fontWeight: 900,
                      fontSize: 14,
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      boxShadow: hasItems ? "3px 3px 0 rgba(0,0,0,0.85)" : "none",
                      cursor: hasItems ? "pointer" : "default",
                      fontFamily: "var(--font-display)",
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
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
                      background: "rgba(255,246,220,0.78)",
                      border: "1.5px solid rgba(196,155,42,0.28)",
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
                          background: GOLD,
                        }}
                      />
                    ))}
                  </motion.div>
                )}

                {/* RESULT: Re-spin + Save It */}
                {phase === "result" && !isSaveOpen && (
                  <motion.div
                    key="result-btns"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    style={{ display: "flex", gap: 8 }}
                  >
                    <button
                      onClick={handleRespin}
                      style={{
                        padding: "0 18px", height: 40, borderRadius: 22,
                        border: "2px solid #000",
                        background: "rgba(255,251,238,0.97)",
                        color: "#2e1a00", fontWeight: 700,
                        fontSize: 12, letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        boxShadow: "2px 2px 0 rgba(0,0,0,0.85)",
                        cursor: "pointer",
                        fontFamily: "var(--font-display)",
                      }}
                    >
                      Re-spin
                    </button>
                    <button
                      onClick={() => setIsSaveOpen(true)}
                      disabled={!canSave}
                      style={{
                        padding: "0 18px", height: 40, borderRadius: 22,
                        border: "2px solid #000",
                        background: canSave
                          ? "linear-gradient(to bottom, #f6db3a, #c98f12)"
                          : "rgba(210,185,100,0.38)",
                        color: "#2e1a00", fontWeight: 800,
                        fontSize: 12, letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        boxShadow: canSave ? "2px 2px 0 rgba(0,0,0,0.85)" : "none",
                        cursor: canSave ? "pointer" : "default",
                        fontFamily: "var(--font-display)",
                      }}
                    >
                      Save It ♡
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
                    style={{ display: "flex", gap: 6, width: "100%" }}
                  >
                    <input
                      autoFocus
                      type="text"
                      placeholder="Name this look…"
                      value={saveName}
                      onChange={e => setSaveName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSave()}
                      style={{
                        flex: 1, height: 38, borderRadius: 20, padding: "0 14px",
                        fontSize: 13, fontWeight: 600, color: "#3a2400",
                        background: "rgba(255,252,245,0.98)",
                        border: "1.5px solid rgba(196,155,42,0.50)",
                        boxShadow: "0 3px 12px rgba(0,0,0,0.13)",
                        outline: "none",
                      }}
                    />
                    <button
                      onClick={() => { setIsSaveOpen(false); setSaveName(""); }}
                      style={{
                        width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                        background: "rgba(255,250,240,0.97)",
                        border: "1.5px solid rgba(196,155,42,0.36)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer",
                      }}
                    >
                      <X style={{ width: 14, height: 14, color: GOLD }} />
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={!saveName.trim() || saveOutfit.isPending}
                      style={{
                        padding: "0 16px", height: 36, borderRadius: 20, flexShrink: 0,
                        background: "linear-gradient(to bottom,#f6db3a,#c98f12)",
                        color: "#3a2400", fontWeight: 700, fontSize: 13, border: "none",
                        boxShadow: "0 3px 10px rgba(200,168,24,0.30)",
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
  );
}
