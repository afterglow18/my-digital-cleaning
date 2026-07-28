/**
 * WelcomePage — Cleaning hero splash screen.
 *
 * IDLE    : hero image fills the screen, subtitle + button below.
 * EXITING : whole screen fades out → onEnter().
 */

import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";

interface Props { onEnter: () => void; }

export default function WelcomePage({ onEnter }: Props) {
  const [exiting, setExiting] = useState(false);
  const calledRef             = useRef(false);

  const finish = useCallback(() => {
    if (calledRef.current) return;
    calledRef.current = true;
    onEnter();
  }, [onEnter]);

  const handleOpen = () => {
    if (exiting) return;
    setExiting(true);
    setTimeout(finish, 600);
  };

  return (
    <motion.div
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.6, ease: "easeIn" }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", flexDirection: "column",
        alignItems: "center",
        background: "#fce8ef",
        overflow: "hidden",
        paddingTop: "env(safe-area-inset-top, 44px)",
      }}
    >
      {/* ── Hero image ── */}
      <img
        src="/cleaning-hero.png"
        alt="My Digital Cleaning"
        draggable={false}
        style={{
          width: "100%",
          flex: 1,
          minHeight: 0,
          objectFit: "cover",
          objectPosition: "top center",
          userSelect: "none",
          pointerEvents: "none",
        }}
      />

      {/* ── Bottom bar ── */}
      <div style={{
        flexShrink: 0,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        padding: "18px 32px",
        paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
        background: "#fce8ef",
      }}>
        <p style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.25em",
          textTransform: "uppercase",
          color: "rgba(176, 80, 120, 0.65)",
        }}>
          your cleaning collection
        </p>

        <motion.button
          onClick={handleOpen}
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
            boxShadow: "0 4px 18px rgba(192, 68, 122, 0.45), 0 1px 0 rgba(255,255,255,0.18) inset",
            whiteSpace: "nowrap",
            pointerEvents: exiting ? "none" : "auto",
          }}
        >
          Open App ✨
        </motion.button>
      </div>

      {/* ── Footer links ── */}
      <div style={{
        position: "absolute",
        bottom: "calc(env(safe-area-inset-bottom) + 80px)",
        left: 0, right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        zIndex: 10,
        pointerEvents: "none",
      }}>
        <a
          href="https://classy-alpaca-441.notion.site/Privacy-Policy-39682db6065380b19dedcb108d4a0ef4"
          target="_blank" rel="noopener noreferrer"
          style={{
            fontSize: 11, fontWeight: 500,
            color: "rgba(160, 80, 110, 0.45)",
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
            color: "rgba(160, 80, 110, 0.45)",
            textDecoration: "none",
            letterSpacing: "0.02em",
            pointerEvents: "auto",
          }}
        >Support</a>
      </div>
    </motion.div>
  );
}
