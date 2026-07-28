/**
 * WelcomePage — Bubble pop reveal animation.
 *
 * IDLE    : floating bubbles over pink bg; hero image hidden beneath.
 * POPPING : bubbles pop staggered; hero fades in underneath.
 * EXITING : whole screen fades out → onEnter().
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props { onEnter: () => void; }

interface BubbleData {
  id: number;
  x: number;         // % from left
  y: number;         // % from top
  size: number;      // px diameter
  floatDelay: number;
  floatDuration: number;
  popDelay: number;  // seconds after popping starts
}

// Golden-angle spiral — fixed at module level so they never re-randomise
const BUBBLES: BubbleData[] = Array.from({ length: 58 }, (_, i) => {
  const angle   = (i * 137.508 * Math.PI) / 180;
  const radius  = Math.sqrt(i / 58) * 0.92;
  const cx      = 50 + radius * 52 * Math.cos(angle);
  const cy      = 46 + radius * 54 * Math.sin(angle);
  return {
    id: i,
    x: Math.max(3, Math.min(97, cx)),
    y: Math.max(3, Math.min(90, cy)),
    size: 16 + (i % 6) * 14,          // 16 → 86 px in steps of 14
    floatDelay:    (i * 0.19) % 3.0,
    floatDuration: 2.4 + (i % 5) * 0.4,
    popDelay:      ((i * 0.023) + (i % 9) * 0.07) % 1.05,
  };
});

const POP_COMPLETE_MS =
  Math.max(...BUBBLES.map(b => b.popDelay)) * 1000 + 380;

// ── Single bubble ──────────────────────────────────────────────────────────
function Bubble({
  data,
  phase,
}: {
  data: BubbleData;
  phase: "idle" | "popping" | "exiting";
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (phase !== "popping") return;
    const t = setTimeout(() => setVisible(false), data.popDelay * 1000);
    return () => clearTimeout(t);
  }, [phase, data.popDelay]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={data.id}
          initial={{ scale: 1, opacity: 1 }}
          animate={
            phase === "idle"
              ? {
                  y: [0, -10, 3, -7, 0],
                  x: [0, 4, -2, 5, 0],
                  transition: {
                    duration: data.floatDuration,
                    delay: data.floatDelay,
                    repeat: Infinity,
                    ease: "easeInOut",
                  },
                }
              : {}
          }
          exit={{
            scale: [1, 1.30, 0.05],
            opacity: [1, 0.55, 0],
            transition: { duration: 0.28, ease: "easeOut" },
          }}
          style={{
            position: "absolute",
            left: `${data.x}%`,
            top: `${data.y}%`,
            width: data.size,
            height: data.size,
            marginLeft: -data.size / 2,
            marginTop:  -data.size / 2,
            borderRadius: "50%",
            zIndex: 6,
            pointerEvents: "none",
            background:
              "radial-gradient(circle at 33% 28%, rgba(255,255,255,0.72) 0%, rgba(255,220,235,0.18) 45%, rgba(232,100,154,0.07) 100%)",
            border: "1.5px solid rgba(232, 100, 154, 0.38)",
            boxShadow:
              "inset 0 -3px 8px rgba(232,100,154,0.10), 0 2px 10px rgba(232,100,154,0.07)",
          }}
        />
      )}
    </AnimatePresence>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function WelcomePage({ onEnter }: Props) {
  const [phase, setPhase] = useState<"idle" | "popping" | "exiting">("idle");
  const calledRef = useRef(false);

  const finish = useCallback(() => {
    if (calledRef.current) return;
    calledRef.current = true;
    onEnter();
  }, [onEnter]);

  const handleStart = () => {
    if (phase !== "idle") return;
    setPhase("popping");
    // Start fade-out shortly after last bubble pops
    setTimeout(() => setPhase("exiting"), POP_COMPLETE_MS + 350);
    // Call onEnter at the end of the fade
    setTimeout(finish, POP_COMPLETE_MS + 1050);
  };

  return (
    <motion.div
      animate={{ opacity: phase === "exiting" ? 0 : 1 }}
      transition={{ duration: 0.75, ease: "easeIn" }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "#fce8ef",
        overflow: "hidden",
        paddingTop: "env(safe-area-inset-top, 44px)",
      }}
    >
      {/* Hero image — hidden behind bubbles, fades in as they pop */}
      <motion.img
        src="/cleaning-hero.png"
        alt="My Digital Cleaning"
        draggable={false}
        initial={{ opacity: 0 }}
        animate={{ opacity: phase !== "idle" ? 1 : 0 }}
        transition={{ duration: 0.55, delay: phase === "popping" ? 0.15 : 0 }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "top center",
          userSelect: "none",
          pointerEvents: "none",
        }}
      />

      {/* Bubbles */}
      {BUBBLES.map(b => (
        <Bubble key={b.id} data={b} phase={phase} />
      ))}

      {/* Bottom bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0, left: 0, right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          padding: "18px 32px",
          paddingBottom: "calc(18px + env(safe-area-inset-bottom, 0px))",
          background: "rgba(252,232,239,0.88)",
          backdropFilter: "blur(6px)",
          zIndex: 20,
        }}
      >
        <AnimatePresence>
          {phase === "idle" && (
            <motion.p
              key="subtitle"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.25em",
                textTransform: "uppercase",
                color: "rgba(176, 80, 120, 0.65)",
              }}
            >
              your cleaning collection
            </motion.p>
          )}
        </AnimatePresence>

        <motion.button
          onClick={handleStart}
          whileTap={{ scale: 0.96 }}
          animate={{
            opacity: phase === "idle" ? 1 : 0,
            scale:   phase === "idle" ? 1 : 0.85,
          }}
          transition={{ duration: 0.22 }}
          style={{
            fontFamily: "var(--font-display, sans-serif)",
            fontWeight: 800,
            fontSize: 15,
            letterSpacing: "0.04em",
            color: "#fff",
            background: "linear-gradient(135deg, #e8649a 0%, #c0447a 100%)",
            border: "none",
            borderRadius: 100,
            padding: "14px 48px",
            cursor: "pointer",
            boxShadow:
              "0 4px 18px rgba(192,68,122,0.45), 0 1px 0 rgba(255,255,255,0.18) inset",
            whiteSpace: "nowrap",
            pointerEvents: phase === "idle" ? "auto" : "none",
          }}
        >
          Start Cleaning 🧹
        </motion.button>
      </div>

      {/* Footer links */}
      <motion.div
        animate={{ opacity: phase === "idle" ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        style={{
          position: "absolute",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
          left: 0, right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <a
          href="https://classy-alpaca-441.notion.site/Privacy-Policy-39682db6065380b19dedcb108d4a0ef4"
          target="_blank" rel="noopener noreferrer"
          style={{
            fontSize: 11, fontWeight: 500,
            color: "rgba(160,80,110,0.45)",
            textDecoration: "none",
            letterSpacing: "0.02em",
            pointerEvents: "auto",
          }}
        >Privacy Policy</a>
        <a
          href="https://app.notion.com/p/My-Digital-Closet-Support-39782db60653802a9088dcbae84c0527?source=copy_link"
          target="_blank" rel="noopener noreferrer"
          style={{
            fontSize: 11, fontWeight: 500,
            color: "rgba(160,80,110,0.45)",
            textDecoration: "none",
            letterSpacing: "0.02em",
            pointerEvents: "auto",
          }}
        >Support</a>
      </motion.div>
    </motion.div>
  );
}
