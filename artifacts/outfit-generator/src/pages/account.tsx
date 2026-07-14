/**
 * Settings page — Backup, Restore, and Subscription management.
 * Replaces the old Account page (which required server-side auth).
 */
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Upload, RefreshCw, Loader2, Check, AlertTriangle, Star } from "lucide-react";
import { exportBackup, importBackup, pickBackupFile } from "@/lib/backup";
import { useSubscription } from "@/lib/revenuecat";
import { useQueryClient } from "@tanstack/react-query";
import { getListClothingQueryKey, getListOutfitsQueryKey, getWardrobeStatsQueryKey } from "@/hooks/useLocalDB";
import { Capacitor } from "@capacitor/core";

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({
  title,
  emoji,
  children,
}: {
  title:    string;
  emoji:    string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border-2 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
      <div className="px-4 py-3 border-b-2 border-black bg-secondary/20 flex items-center gap-2">
        <span className="text-lg leading-none">{emoji}</span>
        <h2 className="font-display font-bold text-base uppercase tracking-tight">{title}</h2>
      </div>
      <div className="p-4 flex flex-col gap-3">{children}</div>
    </div>
  );
}

function ActionButton({
  onClick,
  pending,
  icon: Icon,
  label,
  variant = "primary",
}: {
  onClick:  () => void;
  pending?: boolean;
  icon:     React.ElementType;
  label:    string;
  variant?: "primary" | "secondary" | "gold";
}) {
  const base =
    "w-full flex items-center justify-center gap-2 py-3 border-4 border-black rounded-xl font-display font-bold text-sm uppercase tracking-tight shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed transition-all";

  const variants: Record<string, string> = {
    primary:   "bg-primary text-black",
    secondary: "bg-white text-black",
    gold:      "bg-[#E8D4B0] text-[#3A2210]",
  };

  return (
    <button onClick={onClick} disabled={!!pending} className={`${base} ${variants[variant]}`}>
      {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
      {label}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const qc = useQueryClient();
  const { isSubscribed, offerings, purchase, restore, isPurchasing, isRestoring } =
    useSubscription();

  // Backup/restore state
  const [exportPending, setExportPending] = useState(false);
  const [importPending, setImportPending] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleExport = async () => {
    setExportPending(true);
    try {
      await exportBackup();
      showMessage("success", "Backup exported — check your Files app or Share Sheet.");
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportPending(false);
    }
  };

  const handleImport = async () => {
    setImportPending(true);
    try {
      const json = await pickBackupFile();
      const result = await importBackup(json);
      // Refresh all local data
      await qc.invalidateQueries({ queryKey: getListClothingQueryKey() });
      await qc.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
      await qc.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
      showMessage(
        "success",
        `Restored ${result.clothingAdded} items and ${result.outfitsAdded} outfits.` +
          (result.skippedItems > 0 ? ` (${result.skippedItems} already existed.)` : ""),
      );
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Import failed");
    } finally {
      setImportPending(false);
    }
  };

  const handlePurchase = async () => {
    const pkg = offerings?.current?.availablePackages?.[0];
    if (!pkg) {
      showMessage("error", Capacitor.isNativePlatform() ? "No products available yet." : "Purchases only work on iOS.");
      return;
    }
    try {
      await purchase(pkg);
      showMessage("success", "Purchase successful — thanks for upgrading! 🎉");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Purchase cancelled";
      if (!msg.toLowerCase().includes("cancel")) showMessage("error", msg);
    }
  };

  const handleRestore = async () => {
    try {
      await restore();
      showMessage("success", "Purchases restored.");
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Could not restore");
    }
  };

  const pkg = offerings?.current?.availablePackages?.[0];
  const priceString = pkg?.product?.priceString ?? "$9.99";

  return (
    <div className="min-h-full flex flex-col pt-8 px-4 pb-8 bg-secondary/10">
      <header className="mb-6">
        <h1 className="text-4xl font-display font-bold uppercase tracking-tighter mb-1">Settings</h1>
        <p className="font-medium text-muted-foreground text-sm">Your suitcase, your device.</p>
      </header>

      {/* Feedback messages */}
      <AnimatePresence>
        {message && (
          <motion.div
            key="msg"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`mb-4 px-4 py-3 rounded-xl border-2 border-black text-sm font-medium flex items-start gap-2
              ${message.type === "success" ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}
          >
            {message.type === "success"
              ? <Check className="w-4 h-4 shrink-0 mt-0.5" />
              : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-4">

        {/* Backup & Restore */}
        <Section title="Backup & Restore" emoji="💾">
          <p className="text-sm text-black/60 leading-snug">
            Your wardrobe lives only on this device. Export a backup before switching phones or reinstalling the app.
          </p>
          <ActionButton
            onClick={handleExport}
            pending={exportPending}
            icon={Download}
            label="Export Backup"
            variant="primary"
          />
          <ActionButton
            onClick={handleImport}
            pending={importPending}
            icon={Upload}
            label="Import Backup"
            variant="secondary"
          />
        </Section>

        {/* Subscription */}
        <Section title="Pro Stylist" emoji="⭐">
          {isSubscribed ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <Check className="w-4 h-4 shrink-0" /> Pro Stylist active — unlimited everything
              </div>
              <button
                onClick={handleRestore}
                disabled={isRestoring}
                className="text-xs text-black/40 underline text-center pt-1"
              >
                {isRestoring ? "Restoring…" : "Restore purchases"}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <ul className="flex flex-col gap-1.5 text-sm text-black/70">
                {["Unlimited wardrobe items", "Unlimited saved outfits", "Priority support"].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <ActionButton
                onClick={handlePurchase}
                pending={isPurchasing}
                icon={Star}
                label={`Upgrade — ${priceString}/month`}
                variant="gold"
              />
              <button
                onClick={handleRestore}
                disabled={isRestoring}
                className="text-xs text-black/40 underline text-center"
              >
                {isRestoring ? "Restoring…" : "Restore previous purchase"}
              </button>
            </div>
          )}
        </Section>

        {/* App info */}
        <Section title="About" emoji="🧳">
          <div className="flex flex-col gap-1 text-sm text-black/60">
            <div className="flex justify-between">
              <span>App</span>
              <span className="font-medium text-black">My Digital Suitcase</span>
            </div>
            <div className="flex justify-between">
              <span>Storage</span>
              <span className="font-medium text-black">On-device (no cloud)</span>
            </div>
            <div className="flex justify-between">
              <span>Offline</span>
              <span className="font-medium text-black">✓ Always works</span>
            </div>
          </div>
        </Section>

      </div>
    </div>
  );
}
