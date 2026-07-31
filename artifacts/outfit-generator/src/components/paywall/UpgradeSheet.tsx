/**
 * UpgradeSheet — three-tier paywall (Monthly / Yearly / Lifetime).
 *
 * Single-screen, no scroll. Lifetime pre-selected as "Best Value".
 * All accent colour uses bg-primary (warm tan hsl(35 55% 82%)).
 *
 * RC package identifiers expected in the default offering:
 *   $rc_monthly   → Monthly  $1.99
 *   $rc_annual    → Yearly   $19.99
 *   $rc_lifetime  → Lifetime $9.99 (one-time)
 */
import React, { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X, Check, Loader2 } from "lucide-react";
import { useSubscription } from "@/lib/revenuecat";
import { useQueryClient } from "@tanstack/react-query";

export type UpgradeReason = "items" | "outfits" | "mannequin";
type TierId = "monthly" | "yearly" | "lifetime";

interface Props {
  reason:  UpgradeReason;
  onClose: () => void;
}

// ── Copy ──────────────────────────────────────────────────────────────────────

const FEATURES = [
  "Unlimited cleaning items",
  "Unlimited saved cleanings",
  "Track your entire collection",
  "One-time payment options",
  "Choose monthly, yearly or lifetime!",
] as const;

const HEADLINES: Record<UpgradeReason, string> = {
  items:     "UNLOCK YOUR UNLIMITED DIGITAL CLEANING",
  outfits:   "UNLOCK YOUR UNLIMITED DIGITAL CLEANING",
  mannequin: "UNLOCK YOUR UNLIMITED DIGITAL CLEANING",
};

const SUBTITLES: Record<UpgradeReason, string> = {
  items:     "You've reached the free 20 item limit.\nUpgrade once, track everything.",
  outfits:   "You've hit the free cleaning limit. Upgrade to save every cleaning.",
  mannequin: "A premium feature — unlock it once.",
};

// Fallback tier defs (browser — RC not available)
const TIER_DEFAULTS: Record<TierId, {
  label: string;
  price: string;
  period: string;
  notes: [string, string];
  pkgId: string;
  best?: true;
}> = {
  monthly:  { label: "MONTHLY",  price: "$1.99",  period: "/month",   notes: ["Cancel anytime",  "Billed monthly"],  pkgId: "$rc_monthly"  },
  yearly:   { label: "YEARLY",   price: "$19.99", period: "/year",    notes: ["Save 17%",        "Billed yearly"],   pkgId: "$rc_annual"   },
  lifetime: { label: "LIFETIME", price: "$9.99",  period: "one-time", notes: ["Pay once",        "Yours forever"],   pkgId: "$rc_lifetime", best: true },
};

const TIER_ORDER: TierId[] = ["monthly", "yearly", "lifetime"];

// ── RC helpers ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRcPackage(offerings: any, pkgId: string): any | undefined {
  return offerings?.current?.availablePackages?.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p: any) => p.identifier === pkgId,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getLivePrice(offerings: any, pkgId: string, fallback: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (getRcPackage(offerings, pkgId) as any)?.product?.priceString ?? fallback;
}

// ── Tier card ─────────────────────────────────────────────────────────────────

function TierCard({
  id, selected, onSelect, price, period, notes, label, best,
}: {
  id: TierId; selected: boolean; onSelect: (id: TierId) => void;
  price: string; period: string; notes: [string, string]; label: string; best?: true;
}) {
  return (
    <button
      onClick={() => onSelect(id)}
      className="flex-1 flex flex-col rounded-xl border-[3px] transition-all relative overflow-hidden text-left"
      style={{
        borderColor: selected ? "#d4006e" : "rgba(255,255,255,0.6)",
        background:  selected ? "#fff" : "rgba(255,255,255,0.75)",
        boxShadow:   selected ? "3px 3px 0px 0px rgba(180,0,100,0.45)" : "none",
      }}
    >
      {best && (
        <span
          className="absolute top-0 right-0 text-[8px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded-bl-lg"
          style={{ background: "#8b0050", color: "#fff" }}
        >
          BEST ★ VALUE
        </span>
      )}
      <div className="px-2.5 pt-3 pb-2.5 flex flex-col gap-1">
        <p className="text-[9px] font-bold uppercase tracking-widest text-black/50">{label}</p>
        <p className="font-display font-bold text-[1.3rem] leading-none text-black">{price}</p>
        <p className="text-[9px] font-semibold text-black/45">{period}</p>
        <ul className="flex flex-col gap-0.5 mt-1.5">
          {notes.map((n) => (
            <li key={n} className="flex items-center gap-1">
              <Check className="w-2.5 h-2.5 shrink-0 text-black/60" strokeWidth={3} />
              <span className="text-[8.5px] font-semibold text-black/55 leading-tight">{n}</span>
            </li>
          ))}
        </ul>
      </div>
    </button>
  );
}

// ── Sheet ─────────────────────────────────────────────────────────────────────

export function UpgradeSheet({ reason, onClose }: Props) {
  const { offerings, purchase, isLoading } = useSubscription();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<TierId>("lifetime");
  const [status,   setStatus]   = useState<"idle" | "pending">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const prices: Record<TierId, string> = {
    monthly:  getLivePrice(offerings, "$rc_monthly",  "$1.99"),
    yearly:   getLivePrice(offerings, "$rc_annual",   "$19.99"),
    lifetime: getLivePrice(offerings, "$rc_lifetime", "$9.99"),
  };

  const isDisabled = status === "pending" || isLoading;

  const ctaLabel =
    isLoading               ? "Loading…"
    : status === "pending"  ? "Opening…"
    : selected === "lifetime" ? `UNLOCK FOREVER – ${prices.lifetime} ›`
    : selected === "yearly"   ? `SUBSCRIBE – ${prices.yearly}/YR ›`
    :                           `SUBSCRIBE – ${prices.monthly}/MO ›`;

  const handlePurchase = useCallback(async () => {
    if (isDisabled) return;
    setErrorMsg(null);
    setStatus("pending");

    // If offerings haven't loaded yet, force a re-fetch and wait briefly
    if (!offerings) {
      await qc.refetchQueries({ queryKey: ["revenuecat", "offerings"] });
    }

    const pkg = getRcPackage(offerings, TIER_DEFAULTS[selected].pkgId);
    if (!pkg) {
      setStatus("idle");
      setErrorMsg("Could not load purchase options. Please try again or restart the app.");
      return;
    }

    try {
      await purchase(pkg);
      onClose();
    } catch (err: unknown) {
      setStatus("idle");
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      if (msg.includes("cancel") || msg.includes("dismiss")) {
        // user tapped Cancel — silent, no error shown
      } else {
        setErrorMsg("Something went wrong. Please try again.");
        console.error("Purchase error:", err);
      }
    }
  }, [isDisabled, offerings, qc, selected, purchase, onClose]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[80] flex flex-col max-w-md mx-auto"
      style={{
        backgroundColor: "#d4006e",
        backgroundImage: `
          repeating-linear-gradient(90deg,
            transparent 0px, transparent 14px,
            rgba(255,255,255,0.22) 14px, rgba(255,255,255,0.22) 18px,
            transparent 18px, transparent 34px,
            rgba(120,0,60,0.35) 34px, rgba(120,0,60,0.35) 38px,
            transparent 38px, transparent 50px,
            rgba(255,255,255,0.22) 50px, rgba(255,255,255,0.22) 54px
          ),
          repeating-linear-gradient(0deg,
            transparent 0px, transparent 14px,
            rgba(255,255,255,0.22) 14px, rgba(255,255,255,0.22) 18px,
            transparent 18px, transparent 34px,
            rgba(120,0,60,0.35) 34px, rgba(120,0,60,0.35) 38px,
            transparent 38px, transparent 50px,
            rgba(255,255,255,0.22) 50px, rgba(255,255,255,0.22) 54px
          )
        `,
      }}
    >
      {/* Close button */}
      <div className="flex justify-end px-4 pb-0 flex-shrink-0"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
        <button
          onClick={onClose}
          aria-label="Close"
          className="w-9 h-9 rounded-full border-2 border-white flex items-center justify-center
                     bg-white/90 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)]
                     active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content — fills remaining height, no scroll */}
      <div className="flex-1 min-h-0 flex flex-col justify-between px-5 pt-3 pb-2">

        {/* Headline */}
        <div>
          <h1 className="font-display font-bold text-[2.1rem] uppercase tracking-tight leading-[0.88]"
              style={{ color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,0.25)" }}>
            {HEADLINES[reason]}
          </h1>
          <p className="text-xs font-semibold mt-1.5" style={{ whiteSpace: "pre-line", color: "rgba(255,255,255,0.85)" }}>
            {SUBTITLES[reason]}
          </p>
        </div>

        {/* Features card */}
        <div className="rounded-2xl border-[3px] overflow-hidden"
             style={{ background: "rgba(255,255,255,0.95)", borderColor: "rgba(255,255,255,0.9)",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.20)" }}>
          <div className="px-4 py-4 flex flex-col gap-2">
            <p className="font-display font-bold uppercase text-[1.45rem] leading-[0.92] tracking-tight"
               style={{ color: "#d4006e" }}>
              Unlimited cleaning items
            </p>
            <p className="font-display font-bold uppercase text-[1.45rem] leading-[0.92] tracking-tight"
               style={{ color: "#d4006e" }}>
              Unlimited saved cleanings
            </p>
            <p className="text-xs font-medium mt-1 leading-snug" style={{ color: "rgba(180,0,100,0.65)" }}>
              Your entire collection, beautifully tracked — forever.
            </p>
          </div>
        </div>

        {/* Plan selector */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-center mb-1.5" style={{ color: "rgba(255,255,255,0.8)" }}>
            Choose Your Plan
          </p>
          <div className="flex gap-2">
            {TIER_ORDER.map((id) => {
              const t = TIER_DEFAULTS[id];
              return (
                <TierCard
                  key={id}
                  id={id}
                  selected={selected === id}
                  onSelect={setSelected}
                  label={t.label}
                  price={prices[id]}
                  period={t.period}
                  notes={t.notes}
                  best={t.best}
                />
              );
            })}
          </div>
        </div>

      </div>

      {/* CTA footer */}
      <div
        className="px-5 pt-2 flex flex-col gap-2 flex-shrink-0"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={handlePurchase}
          disabled={isDisabled}
          className="w-full py-3.5 rounded-2xl font-display font-bold text-lg uppercase
                     tracking-tight border-[3px] border-white text-white
                     active:translate-x-0.5 active:translate-y-0.5 transition-all
                     disabled:opacity-60 disabled:cursor-not-allowed
                     flex items-center justify-center gap-2"
          style={{
            background: "#8b0050",
            boxShadow: isDisabled ? "none" : "4px 4px 0px 0px rgba(0,0,0,0.35)",
          }}
        >
          {isDisabled && <Loader2 className="w-4 h-4 animate-spin" />}
          {ctaLabel}
        </button>

        {errorMsg && (
          <p className="text-xs text-red-600 font-semibold text-center px-2">
            {errorMsg}
          </p>
        )}

        <button
          onClick={onClose}
          className="text-sm font-semibold text-center transition-colors" style={{ color: "rgba(255,255,255,0.7)" }}
        >
          Maybe Later
        </button>

        {/* Legal links — required by Apple for paywalls */}
        <div className="flex items-center justify-center gap-3 pt-1">
          <a
            href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { e.preventDefault(); window.open("https://www.apple.com/legal/internet-services/itunes/dev/stdeula/", "_system"); }}
            className="text-[10px] font-semibold text-black/35 underline underline-offset-2 hover:text-black/55 transition-colors"
          >
            Terms of Use
          </a>
          <span className="text-black/20 text-[10px]">·</span>
          <a
            href="https://app.notion.com/p/My-Digital-Collection-Privacy-Policy-39682db6065380b19dedcb108d4a0ef4?source=copy_link"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { e.preventDefault(); window.open("https://app.notion.com/p/My-Digital-Collection-Privacy-Policy-39682db6065380b19dedcb108d4a0ef4?source=copy_link", "_system"); }}
            className="text-[10px] font-semibold text-black/35 underline underline-offset-2 hover:text-black/55 transition-colors"
          >
            Privacy Policy
          </a>
        </div>
      </div>
    </motion.div>,
    document.body,
  );
}
