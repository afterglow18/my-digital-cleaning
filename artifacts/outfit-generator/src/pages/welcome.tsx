/**
 * WelcomePage — Three-phase splash sequence.
 *
 * HERO     : Full-screen hero image with branding text. Auto-advances after 2.5 s.
 * IDLE     : Floating bubbles over pink bg, same branding + CTA button.
 * POPPING  : Bubbles pop, hero fades back in beneath.
 * EXITING  : Whole screen fades out → onEnter().
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props { onEnter: () => void; }

type Phase = "hero" | "idle" | "popping" | "exiting";

interface BubbleData {
  id: number;
  x: number;
  y: number;
  size: number;
  floatDelay: number;
  floatDuration: number;
  popDelay: number;
}

// Golden-angle spiral — fixed so they never re-randomise
const BUBBLES: BubbleData[] = Array.from({ length: 58 }, (_, i) => {
  const angle  = (i * 137.508 * Math.PI) / 180;
  const radius = Math.sqrt(i / 58) * 0.92;
  const cx     = 50 + radius * 52 * Math.cos(angle);
  const cy     = 46 + radius * 54 * Math.sin(angle);
  return {
    id: i,
    x: Math.max(3, Math.min(97, cx)),
    y: Math.max(3, Math.min(90, cy)),
    size: 16 + (i % 6) * 14,
    floatDelay:    (i * 0.19) % 3.0,
    floatDuration: 2.4 + (i % 5) * 0.4,
    popDelay:      ((i * 0.023) + (i % 9) * 0.07) % 1.05,
  };
});

const POP_COMPLETE_MS =
  Math.max(...BUBBLES.map(b => b.popDelay)) * 1000 + 380;

// ── Single bubble ────────────────────────────────────────────────────────────
function Bubble({
  data,
  bubblePhase,
}: {
  data: BubbleData;
  bubblePhase: "idle" | "popping" | "exiting";
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (bubblePhase !== "popping") return;
    const t = setTimeout(() => setVisible(false), data.popDelay * 1000);
    return () => clearTimeout(t);
  }, [bubblePhase, data.popDelay]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={data.id}
          initial={{ scale: 1, opacity: 1 }}
          animate={
            bubblePhase === "idle"
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

// ── Page ─────────────────────────────────────────────────────────────────────
export default function WelcomePage({ onEnter }: Props) {
  const [phase, setPhase] = useState<Phase>("hero");
  const calledRef = useRef(false);

  // Phase 1 → Phase 2: auto-advance after 2.5 s
  useEffect(() => {
    const t = setTimeout(() => setPhase("idle"), 2500);
    return () => clearTimeout(t);
  }, []);

  const finish = useCallback(() => {
    if (calledRef.current) return;
    calledRef.current = true;
    onEnter();
  }, [onEnter]);

  const handleStart = () => {
    if (phase !== "idle") return;
    setPhase("popping");
    // Start fade-out of overlay shortly after last bubble pops
    setTimeout(() => setPhase("exiting"), POP_COMPLETE_MS + 350);
    // Remove overlay at end of fade
    setTimeout(finish, POP_COMPLETE_MS + 1050);
  };

  const bubblePhase: "idle" | "popping" | "exiting" =
    phase === "hero" ? "idle" : phase === "idle" ? "idle" : phase === "popping" ? "popping" : "exiting";

  return (
    <motion.div
      animate={{ opacity: phase === "exiting" ? 0 : 1 }}
      transition={{ duration: 0.75, ease: "easeIn" }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        overflow: "hidden",
      }}
    >
      {/* ── Pink background ──────────────────────────────────────────── */}
      <motion.div
        animate={{ opacity: phase === "hero" ? 0 : 1 }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
        style={{ position: "absolute", inset: 0, background: "#fce8ef" }}
      />

      {/* ── Wardrobe bg — fades in as bubbles pop, mimics app reveal ──── */}
      <motion.img
        src="/cleaning-shelves-bg.png"
        alt=""
        draggable={false}
        animate={{ opacity: phase === "popping" || phase === "exiting" ? 1 : 0 }}
        transition={{ duration: 0.55, delay: phase === "popping" ? 0.15 : 0, ease: "easeInOut" }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "fill",
          objectPosition: "center",
          userSelect: "none",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />

      {/* ── Hero image ─────────────────────────────────────────────────── */}
      {/* Visible in Phase 1 (hero), fades out for Phase 2 (idle),
          fades back in as bubbles pop (popping/exiting)               */}
      <motion.img
        src="/cleaning-hero.png"
        alt="My Digital Cleaning"
        draggable={false}
        animate={{ opacity: phase === "hero" ? 1 : 0 }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "top center",
          userSelect: "none",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* ── Dark gradient — helps text readability over hero (Phase 1) ── */}
      <motion.div
        animate={{ opacity: phase === "hero" ? 1 : 0 }}
        transition={{ duration: 0.4 }}
        style={{
          position: "absolute",
          bottom: 0, left: 0, right: 0,
          height: "55%",
          background:
            "linear-gradient(to top, rgba(0,0,0,0.60) 0%, rgba(0,0,0,0.18) 55%, transparent 100%)",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />

      {/* ── Bubbles (Phase 2+) ─────────────────────────────────────────── */}
      {phase !== "hero" &&
        BUBBLES.map(b => (
          <Bubble key={b.id} data={b} bubblePhase={bubblePhase} />
        ))}

      {/* ══ BOTTOM BAR ════════════════════════════════════════════════════ */}

      {/* Phase 1 branding — white text over hero, no background */}
      <motion.div
        animate={{ opacity: phase === "hero" ? 1 : 0 }}
        transition={{ duration: 0.35, ease: "easeInOut" }}
        style={{
          position: "absolute",
          bottom: 0, left: 0, right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          padding: "24px 32px",
          paddingBottom: "calc(56px + env(safe-area-inset-bottom, 0px))",
          zIndex: 20,
          pointerEvents: "none",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.30em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.70)",
            fontFamily: "var(--font-display, sans-serif)",
          }}
        >
          Welcome to
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: "0.01em",
            color: "#ffffff",
            fontFamily: "var(--font-display, sans-serif)",
            textShadow: "0 2px 12px rgba(0,0,0,0.30)",
            textAlign: "center",
            lineHeight: 1.15,
          }}
        >
          My Digital Cleaning
        </p>
      </motion.div>

      {/* Phase 2 bottom bar — frosted pink, same branding + button + links */}
      <motion.div
        animate={{ opacity: phase === "idle" ? 1 : 0 }}
        transition={{ duration: 0.35, ease: "easeInOut" }}
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
          pointerEvents: phase === "idle" ? "auto" : "none",
        }}
      >
        {/* Branding */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            marginBottom: 4,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.30em",
              textTransform: "uppercase",
              color: "rgba(176, 80, 120, 0.60)",
              fontFamily: "var(--font-display, sans-serif)",
            }}
          >
            Welcome to
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: "0.01em",
              color: "rgba(140, 40, 85, 0.90)",
              fontFamily: "var(--font-display, sans-serif)",
              textAlign: "center",
              lineHeight: 1.2,
            }}
          >
            My Digital Cleaning
          </p>
        </div>

        {/* CTA button */}
        <motion.button
          onClick={handleStart}
          whileTap={{ scale: 0.96 }}
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
          }}
        >
          Start Cleaning 🧹
        </motion.button>
      </motion.div>

      {/* Footer links (Phase 2 only) */}
      <motion.div
        animate={{ opacity: phase === "idle" ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        style={{
          position: "absolute",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 112px)",
          left: 0, right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          zIndex: 10,
          pointerEvents: phase === "idle" ? "auto" : "none",
        }}
      >
        <a
          href="https://classy-alpaca-441.notion.site/Privacy-Policy-39682db6065380b19dedcb108d4a0ef4"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 11, fontWeight: 500,
            color: "rgba(160,80,110,0.45)",
            textDecoration: "none",
            letterSpacing: "0.02em",
          }}
        >
          Privacy Policy
        </a>
        <a
          href="https://app.notion.com/p/My-Digital-Closet-Support-39782db60653802a9088dcbae84c0527?source=copy_link"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 11, fontWeight: 500,
            color: "rgba(160,80,110,0.45)",
            textDecoration: "none",
            letterSpacing: "0.02em",
          }}
        >
          Support
        </a>
      </motion.div>
    </motion.div>
  );
}
