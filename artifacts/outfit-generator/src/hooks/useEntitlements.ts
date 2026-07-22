/**
 * useEntitlements — maps RevenueCat subscription state to the app's tier/caps model.
 *
 * Keeps the same public API as the old Stripe-backed version so pages need no
 * changes.  Under the hood it reads from useSubscription() (RevenueCat) instead
 * of localStorage + Stripe Checkout.
 *
 * Tier mapping:
 *   no active entitlement  → "free"  (up to 20 items, 5 outfits)
 *   "premium" entitlement  → "unlock" (unlimited items + outfits)
 *
 * PurchaseResult:
 *   "success"     — subscription activated
 *   "cancelled"   — user dismissed the native purchase sheet
 *   "unavailable" — not running on a native device, or no products loaded yet
 */
import { useCallback } from "react";
import { Tier, TIER_CAPS, TierCapabilities } from "@/lib/entitlements";
import { useSubscription } from "@/lib/revenuecat";

export type PurchaseResult = "success" | "cancelled" | "unavailable";
export type PurchaseProduct = "unlock" | "premium"; // kept for call-site compat

// setGlobalTier is no longer needed (RC manages state) but keep the export so
// App.tsx doesn't need special-casing if any old import remains.
export function setGlobalTier(_t: Tier): void { /* no-op */ }

export function useEntitlements() {
  const { isSubscribed, offerings, purchase: rcPurchase, isPurchasing, isLoading } =
    useSubscription();

  // Both "unlock" and "premium" products now map to the RC "unlock" tier.
  const tier: Tier = isSubscribed ? "unlock" : "free";
  const caps: TierCapabilities = TIER_CAPS[tier];

  const canAddItem = useCallback(
    (count: number) => caps.maxItems === null || count < caps.maxItems,
    [caps.maxItems],
  );

  const canSaveOutfit = useCallback(
    (count: number) => caps.maxOutfits === null || count < caps.maxOutfits,
    [caps.maxOutfits],
  );

  const purchase = useCallback(
    async (_product: PurchaseProduct): Promise<PurchaseResult> => {
      const pkgs = offerings?.current?.availablePackages ?? [];
      // Prefer the lifetime package; fall back to the first available
      const pkg =
        pkgs.find((p: any) => p.identifier === "$rc_lifetime") ??
        pkgs.find((p: any) => p.identifier === "$rc_monthly") ??
        pkgs[0];

      if (!pkg) return "unavailable";

      try {
        await rcPurchase(pkg);
        return "success";
      } catch (err: unknown) {
        // RevenueCat throws with userCancelled flag on user dismiss
        if (err && typeof err === "object" && "userCancelled" in err) {
          return "cancelled";
        }
        const msg = err instanceof Error ? err.message.toLowerCase() : "";
        if (msg.includes("cancel") || msg.includes("dismiss")) return "cancelled";
        return "unavailable";
      }
    },
    [offerings, rcPurchase],
  );

  return { tier, caps, canAddItem, canSaveOutfit, purchase, isPurchasing, isLoading };
}
