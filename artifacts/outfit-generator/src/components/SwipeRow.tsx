import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Plus } from "lucide-react";
import { type ClothingItem } from "@/hooks/useLocalDB";
import { getImageUrl } from "@/lib/utils";

// ── Constants (fallback defaults) ─────────────────────────────────────────────
export const ITEM_W   = 112;
export const ITEM_H   = 140;
export const ITEM_GAP =   9;
export const HANGER_H =  24;

// ── Public handle ─────────────────────────────────────────────────────────────
export interface SwipeRowHandle {
  scrollToIndex: (index: number, smooth?: boolean) => void;
  getLength: () => number;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface SwipeRowProps {
  items: ClothingItem[];
  addLabel: string;
  onCenteredItem: (item: ClothingItem | null) => void;
  onAddClick: () => void;
  onItemTap?: (item: ClothingItem) => void;
  closetStyle?: boolean;
  /** Override card width when closetStyle=true */
  closetItemW?: number;
  /** Override card height when closetStyle=true */
  closetItemH?: number;
  /** Override hanger height when closetStyle=true */
  closetHangerH?: number;
}

// ── Hanger SVG ────────────────────────────────────────────────────────────────
function HangerSVG({
  width = 72,
  height: h,
  dim = false,
}: {
  width?: number;
  height: number;
  dim?: boolean;
}) {
  const hw = width;
  const stroke = dim ? "rgba(176,136,40,0.36)" : "#C49B2A";
  const sw = "2.0";
  return (
    <svg width={hw} height={h} viewBox={`0 0 ${hw} ${h}`} fill="none" style={{ display: "block" }}>
      <path
        d={`M${hw / 2} ${h * 0.12} Q${hw / 2} ${h * 0.04} ${hw / 2 + 3} ${h * 0.04} Q${hw / 2 + 7} ${h * 0.04} ${hw / 2 + 7} ${h * 0.26} Q${hw / 2 + 7} ${h * 0.46} ${hw / 2} ${h * 0.46}`}
        stroke={stroke} strokeWidth={sw} strokeLinecap="round" fill="none"
      />
      <line x1={hw / 2} y1={h * 0.46} x2={hw / 2} y2={h * 0.76} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
      <path d={`M${hw / 2} ${h * 0.76} Q${hw * 0.22} ${h * 0.84} 4 ${h}`} stroke={stroke} strokeWidth={sw} strokeLinecap="round" fill="none" />
      <path d={`M${hw / 2} ${h * 0.76} Q${hw * 0.78} ${h * 0.84} ${hw - 4} ${h}`} stroke={stroke} strokeWidth={sw} strokeLinecap="round" fill="none" />
      <line x1="4" y1={h} x2={hw - 4} y2={h} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export const SwipeRow = forwardRef<SwipeRowHandle, SwipeRowProps>(
  (
    {
      items,
      addLabel,
      onCenteredItem,
      onAddClick,
      onItemTap,
      closetStyle = false,
      closetItemW,
      closetItemH,
      closetHangerH,
    },
    ref
  ) => {
    const iW   = closetStyle && closetItemW   != null ? closetItemW   : ITEM_W;
    const iH   = closetStyle && closetItemH   != null ? closetItemH   : ITEM_H;
    const hH   = closetStyle && closetHangerH != null ? closetHangerH : HANGER_H;
    const STEP = iW + ITEM_GAP;

    const containerRef = useRef<HTMLDivElement>(null);
    const itemRefs     = useRef<(HTMLDivElement | null)[]>([]);
    const lastSnapIdx  = useRef(-1);
    const [centredIdx, setCentredIdx] = useState(0);

    useImperativeHandle(
      ref,
      () => ({
        scrollToIndex: (index, smooth = true) => {
          containerRef.current?.scrollTo({
            left: index * STEP,
            behavior: smooth ? "smooth" : "instant",
          });
        },
        getLength: () => items.length,
      }),
      [STEP, items.length]
    );

    const updateVisuals = useCallback(() => {
      const el = containerRef.current;
      if (!el || items.length === 0) return;
      const raw     = el.scrollLeft / STEP;
      const snapIdx = Math.max(0, Math.min(items.length - 1, Math.round(raw)));
      itemRefs.current.forEach((node, i) => {
        if (!node) return;
        const dist    = Math.abs(i - raw);
        const clamped = Math.min(dist, 1);
        node.style.transform = `scale(${(1 - clamped * 0.10).toFixed(3)})`;
        node.style.opacity   = (1 - clamped * 0.65).toFixed(3);
      });
      if (snapIdx !== lastSnapIdx.current) {
        lastSnapIdx.current = snapIdx;
        setCentredIdx(snapIdx);
        onCenteredItem(items[snapIdx] ?? null);
      }
    }, [items, onCenteredItem, STEP]);

    // Re-sync centred item whenever the items array identity changes (reorder, replace)
    // or when card width changes (forces a re-layout)
    const itemIds = items.map(i => i.id).join(",");
    useEffect(() => {
      if (items.length === 0) { onCenteredItem(null); return; }
      const idx = Math.max(0, Math.min(items.length - 1,
        lastSnapIdx.current < 0 ? 0 : lastSnapIdx.current
      ));
      lastSnapIdx.current = idx;
      setCentredIdx(idx);
      onCenteredItem(items[idx]);
      updateVisuals();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [itemIds, iW]);

    const handleCardClick = useCallback(
      (item: ClothingItem, idx: number) => {
        if (idx === lastSnapIdx.current) onItemTap?.(item);
        else containerRef.current?.scrollTo({ left: idx * STEP, behavior: "smooth" });
      },
      [onItemTap, STEP]
    );

    // ── 5-ghost empty state (closet mode) ─────────────────────────────────────
    if (items.length === 0 && closetStyle) {
      return (
        <div
          style={{
            width: "100%",
            height: iH + hH,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", gap: ITEM_GAP, alignItems: "flex-end" }}>
            {([-2, -1, 0, 1, 2] as const).map((offset) => {
              const isCenter = offset === 0;
              const dist     = Math.abs(offset);
              const opacity  = dist === 0 ? 1 : dist === 1 ? 0.40 : 0.16;
              const scale    = dist === 0 ? 1 : 0.90;
              return (
                <div
                  key={offset}
                  onClick={isCenter ? onAddClick : undefined}
                  style={{
                    width: iW, height: iH + hH,
                    opacity, transform: `scale(${scale})`,
                    transformOrigin: "bottom center",
                    cursor: isCenter ? "pointer" : "default",
                    display: "flex", flexDirection: "column", alignItems: "center",
                  }}
                >
                  <HangerSVG width={iW * 0.62} height={hH} dim={!isCenter} />
                  <div
                    style={{
                      width: iW, height: iH,
                      borderRadius: "0 0 10px 10px",
                      background: "rgba(255,250,242,0.60)",
                      border: "1.5px dashed rgba(196,155,42,0.34)",
                      display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", gap: 4,
                    }}
                  >
                    {isCenter && (
                      <>
                        <div
                          style={{
                            width: 26, height: 26, borderRadius: "50%",
                            background: "rgba(196,155,42,0.12)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          <Plus style={{ width: 13, height: 13, color: "rgba(196,155,42,0.55)" }} />
                        </div>
                        <span
                          style={{
                            fontSize: 8, fontWeight: 700, letterSpacing: "0.10em",
                            textTransform: "uppercase", color: "rgba(196,155,42,0.52)",
                            textAlign: "center", lineHeight: 1.2,
                          }}
                        >
                          {addLabel}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // ── Standard empty state ──────────────────────────────────────────────────
    if (items.length === 0) {
      return (
        <div style={{ height: iH + 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <button
            onClick={onAddClick}
            className="flex flex-col items-center justify-center gap-2 transition-all active:scale-95"
            style={{
              width: iW, height: iH, borderRadius: 16,
              border: "2px dashed rgba(0,0,0,0.22)",
              background: "rgba(255,255,255,0.6)",
            }}
          >
            <div style={{ width: 36, height: 36, borderRadius: "50%", border: "2px dashed rgba(0,0,0,0.22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Plus style={{ width: 18, height: 18, color: "rgba(0,0,0,0.30)" }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(0,0,0,0.30)", textAlign: "center", padding: "0 8px" }}>
              {addLabel}
            </span>
          </button>
        </div>
      );
    }

    // ── Scroll carousel ───────────────────────────────────────────────────────
    const rowH = closetStyle ? iH + hH : iH;

    return (
      <div style={{ position: "relative", height: rowH, width: "100%" }}>
        {!closetStyle && (
          <div
            style={{
              position: "absolute", top: "50%", left: "50%",
              transform: "translate(-50%,-50%)",
              width: iW + 6, height: iH + 6, borderRadius: 16,
              boxShadow: "0 0 0 2.5px black, 0 4px 0 0 black",
              pointerEvents: "none", zIndex: 10,
            }}
          />
        )}

        <div
          ref={containerRef}
          onScroll={updateVisuals}
          className="no-scrollbar"
          style={{
            display: "flex", alignItems: "flex-end", height: "100%",
            overflowX: "auto", scrollSnapType: "x mandatory",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none", msOverflowStyle: "none",
          }}
        >
          <div style={{ flexShrink: 0, width: `calc(50% - ${iW / 2}px)` }} />

          {items.map((item, i) => (
            <div
              key={item.id}
              ref={(el) => { itemRefs.current[i] = el; }}
              onClick={() => handleCardClick(item, i)}
              style={{
                flexShrink: 0, position: "relative", cursor: "pointer",
                width: iW, height: closetStyle ? iH + hH : iH,
                marginLeft: i === 0 ? 0 : ITEM_GAP,
                scrollSnapAlign: "center",
                willChange: "transform, opacity",
                transform: "scale(1)",
                opacity: i === 0 ? "1" : "0.35",
                paddingTop: closetStyle ? hH : 0,
                alignSelf: "flex-end",
                display: "flex", flexDirection: "column",
              }}
            >
              {closetStyle && (
                <div
                  style={{
                    position: "absolute", top: 0, left: 0, right: 0, height: hH,
                    display: "flex", justifyContent: "center", pointerEvents: "none",
                  }}
                >
                  <HangerSVG width={iW * 0.62} height={hH} />
                </div>
              )}

              <div
                style={
                  closetStyle
                    ? {
                        flex: 1, overflow: "hidden", position: "relative",
                        borderRadius: "0 0 10px 10px",
                        background: "rgba(245,237,216,0.96)",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)",
                        border: "1px solid rgba(196,155,42,0.14)",
                      }
                    : {
                        flex: 1, overflow: "hidden", position: "relative",
                        borderRadius: 16, background: "white", border: "2px solid black",
                      }
                }
              >
                <div
                  style={{
                    width: "100%", height: "100%", position: "relative",
                    backgroundImage: "repeating-conic-gradient(#ede8e0 0% 25%,#f9f4ee 0% 50%)",
                    backgroundSize: "10px 10px",
                  }}
                >
                  {item.imageObjectPath ? (
                    <img
                      src={getImageUrl(item.imageObjectPath)!}
                      alt={item.name}
                      style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                      draggable={false}
                    />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: "1.2rem", opacity: 0.26 }}>
                        {addLabel.toLowerCase().includes("top") ? "👚" : addLabel.toLowerCase().includes("bottom") ? "👖" : "👟"}
                      </span>
                    </div>
                  )}
                  {/* Centred-item info dot */}
                  {i === centredIdx && (
                    <div
                      style={{
                        position: "absolute", bottom: 3, right: 3,
                        width: 15, height: 15, borderRadius: "50%",
                        background: "rgba(196,155,42,0.76)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <span style={{ color: "white", fontSize: 7, fontWeight: 700 }}>i</span>
                    </div>
                  )}
                  {/* Favourite heart indicator */}
                  {item.isFavorite && (
                    <div
                      style={{
                        position: "absolute", top: 3, left: 3,
                        width: 16, height: 16, borderRadius: "50%",
                        background: "rgba(239,68,68,0.90)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        pointerEvents: "none",
                      }}
                    >
                      <span style={{ fontSize: 8, lineHeight: 1 }}>♥</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          <div style={{ flexShrink: 0, width: `calc(50% - ${iW / 2}px)` }} />
        </div>
      </div>
    );
  }
);

SwipeRow.displayName = "SwipeRow";
