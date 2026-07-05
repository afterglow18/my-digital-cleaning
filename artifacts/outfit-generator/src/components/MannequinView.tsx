import React, { useRef } from "react";
import { motion, useMotionValue, animate, AnimatePresence } from "framer-motion";
import { X, RotateCw } from "lucide-react";
import { ClothingItem } from "@workspace/api-client-react";
import { getImageUrl } from "@/lib/utils";

interface MannequinViewProps {
  top?: ClothingItem;
  bottom?: ClothingItem;
  shoes?: ClothingItem;
  outfitName?: string;
  onClose: () => void;
}

function ClothingZone({
  item,
  aspectClass,
}: {
  item?: ClothingItem;
  aspectClass?: string;
}) {
  if (!item) {
    return <div className={`w-full h-full bg-black/5 ${aspectClass ?? ""}`} />;
  }
  if (item.imageObjectPath) {
    return (
      <img
        src={getImageUrl(item.imageObjectPath)!}
        alt={item.name}
        className="w-full h-full object-contain"
        draggable={false}
      />
    );
  }
  return (
    <div className="w-full h-full bg-secondary/30 flex items-center justify-center p-2">
      <span className="text-[10px] font-bold uppercase text-center leading-tight">
        {item.name}
      </span>
    </div>
  );
}

export function MannequinView({
  top,
  bottom,
  shoes,
  outfitName,
  onClose,
}: MannequinViewProps) {
  const rotateY = useMotionValue(0);
  const panStartRotation = useRef(0);

  const handlePanStart = () => {
    panStartRotation.current = rotateY.get();
  };

  const handlePan = (_: unknown, info: { offset: { x: number } }) => {
    rotateY.set(panStartRotation.current + info.offset.x * 0.55);
  };

  const handleSpin = () => {
    animate(rotateY, rotateY.get() + 360, {
      duration: 1.4,
      ease: "easeInOut",
    });
  };

  // Mannequin body color
  const bodyColor = "#e8d5c3";
  const borderClass = "border-2 border-black";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ type: "spring", damping: 26, stiffness: 220 }}
      className="fixed inset-0 bg-[#f9f4ee] z-[60] flex flex-col max-w-md mx-auto"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black bg-white flex-shrink-0">
        <div>
          <h2 className="font-display font-bold text-xl uppercase tracking-tight leading-none">
            Outfit Preview
          </h2>
          {outfitName && (
            <p className="text-xs font-medium text-muted-foreground mt-0.5">
              {outfitName}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          data-testid="button-close-mannequin"
          className="w-9 h-9 bg-white border-2 border-black rounded-full flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Mannequin Stage ── */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden select-none"
        style={{ perspective: "1100px" }}
      >
        {/* Pan/drag target — no visual movement, only rotation */}
        <motion.div
          onPanStart={handlePanStart}
          onPan={handlePan}
          className="cursor-grab active:cursor-grabbing touch-none"
          style={{ rotateY }}
        >
          <div className="flex flex-col items-center">

            {/* Head */}
            <div
              className={`w-[54px] h-[54px] rounded-full ${borderClass} flex-shrink-0`}
              style={{ backgroundColor: bodyColor }}
            />

            {/* Neck */}
            <div
              className="w-[18px] h-[14px] border-x-2 border-black flex-shrink-0"
              style={{ backgroundColor: bodyColor }}
            />

            {/* Shoulder line */}
            <div className="w-[176px] border-t-2 border-black flex-shrink-0" />

            {/* ── Top clothing zone ── */}
            {/* Slight inward taper at waist via clip-path on inner wrapper */}
            <div
              className={`w-[176px] ${borderClass} border-t-0 overflow-hidden flex-shrink-0 relative`}
              style={{ height: 162 }}
            >
              {/* Clip the image to a trapezoid (narrow at bottom = waist) */}
              <div
                className="absolute inset-0"
                style={{ clipPath: "polygon(0% 0%, 100% 0%, 94% 100%, 6% 100%)" }}
              >
                <ClothingZone item={top} />
              </div>
            </div>

            {/* Waist belt line */}
            <div className="w-[148px] border-t-2 border-black flex-shrink-0" />

            {/* ── Bottom clothing zone ── */}
            {/* Flares outward (wider at hem) */}
            <div
              className={`w-[176px] ${borderClass} border-t-0 overflow-hidden flex-shrink-0 relative`}
              style={{ height: 154 }}
            >
              <div
                className="absolute inset-0"
                style={{ clipPath: "polygon(6% 0%, 94% 0%, 100% 100%, 0% 100%)" }}
              >
                <ClothingZone item={bottom} />
              </div>
            </div>

            {/* Ankle gap */}
            <div className="w-[176px] flex justify-around flex-shrink-0">
              <div className="w-[2px] h-4 bg-black" />
              <div className="w-[2px] h-4 bg-black" />
            </div>

            {/* ── Shoes ── two side-by-side blocks */}
            <div className="flex gap-2 flex-shrink-0">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className={`w-[82px] h-[46px] ${borderClass} overflow-hidden`}
                  style={{ backgroundColor: bodyColor }}
                >
                  {shoes?.imageObjectPath ? (
                    <img
                      src={getImageUrl(shoes.imageObjectPath)!}
                      alt={shoes.name}
                      className="w-full h-full object-cover"
                      style={{ objectPosition: i === 0 ? "left" : "right" }}
                      draggable={false}
                    />
                  ) : shoes ? (
                    <div className="w-full h-full bg-secondary/30 flex items-center justify-center">
                      <span className="text-[8px] font-bold uppercase">{shoes.name}</span>
                    </div>
                  ) : (
                    <div className="w-full h-full bg-black/5" />
                  )}
                </div>
              ))}
            </div>

          </div>
        </motion.div>
      </div>

      {/* ── Footer ── */}
      <div className="flex-shrink-0 px-4 pb-safe border-t-2 border-black bg-white">
        <div className="flex items-center justify-between py-3">
          {/* Outfit pieces legend */}
          <div className="flex flex-col gap-0.5">
            {[
              { label: "Top", item: top },
              { label: "Bottom", item: bottom },
              { label: "Shoes", item: shoes },
            ].map(({ label, item }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-black/40 w-10">
                  {label}
                </span>
                <span className="text-[10px] font-medium truncate max-w-[140px]">
                  {item?.name ?? "—"}
                </span>
              </div>
            ))}
          </div>

          {/* Rotate button */}
          <button
            onClick={handleSpin}
            data-testid="button-rotate-mannequin"
            className="flex flex-col items-center gap-1 px-4 py-2 border-2 border-black bg-primary shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] rounded-xl active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
          >
            <RotateCw className="w-5 h-5" />
            <span className="text-[9px] font-bold uppercase tracking-wide">360°</span>
          </button>
        </div>

        {/* Drag hint */}
        <p className="text-center text-[10px] font-medium text-black/30 pb-3 uppercase tracking-widest">
          ← drag to rotate →
        </p>
      </div>
    </motion.div>
  );
}
