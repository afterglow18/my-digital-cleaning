/**
 * RevenueCat integration — using @revenuecat/purchases-capacitor.
 *
 * • On iOS (Capacitor native): full purchase flow via StoreKit.
 * • In browser (Replit preview / web): purchases show "unavailable" gracefully.
 *
 * Usage:
 *   1. Wrap root in <SubscriptionProvider>
 *   2. Call initializeRevenueCat() at app startup (inside try/catch)
 *   3. Consume via useSubscription() anywhere
 */

import React, { createContext, useContext } from "react";
import { Capacitor } from "@capacitor/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ── Constants ─────────────────────────────────────────────────────────────────

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "premium";

const RC_TEST_KEY    = import.meta.env.VITE_REVENUECAT_TEST_KEY    as string | undefined;
const RC_IOS_KEY     = import.meta.env.VITE_REVENUECAT_IOS_KEY     as string | undefined;

function getApiKey(): string {
  const isNative = Capacitor.isNativePlatform();
  if (isNative && RC_IOS_KEY) return RC_IOS_KEY;
  if (RC_TEST_KEY) return RC_TEST_KEY;
  throw new Error("RevenueCat API key not configured");
}

// ── Lazy-import Purchases so it doesn't crash in the browser ─────────────────

type PurchasesType = typeof import("@revenuecat/purchases-capacitor").Purchases;
let _Purchases: PurchasesType | null = null;

async function getPurchases(): Promise<PurchasesType | null> {
  if (!Capacitor.isNativePlatform()) return null; // not available in browser
  if (_Purchases) return _Purchases;
  try {
    const mod = await import("@revenuecat/purchases-capacitor");
    _Purchases = mod.Purchases;
    return _Purchases;
  } catch {
    return null;
  }
}

// ── Initialization ────────────────────────────────────────────────────────────

export async function initializeRevenueCat(): Promise<void> {
  const Purchases = await getPurchases();
  if (!Purchases) return; // silently skip in browser

  const apiKey = getApiKey();

  try {
    const { LOG_LEVEL } = await import("@revenuecat/purchases-capacitor");
    await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
  } catch { /* non-fatal */ }

  await Purchases.configure({ apiKey });
  console.log("[RevenueCat] Configured");
}

// ── Subscription context ──────────────────────────────────────────────────────

function useSubscriptionContext() {
  const qc = useQueryClient();

  const customerInfoQuery = useQuery({
    queryKey: ["revenuecat", "customer-info"],
    queryFn:  async () => {
      const Purchases = await getPurchases();
      if (!Purchases) return null;
      const { customerInfo } = await Purchases.getCustomerInfo();
      return customerInfo;
    },
    staleTime: 60 * 1000,
    retry: false,
  });

  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    queryFn:  async () => {
      const Purchases = await getPurchases();
      if (!Purchases) return null;
      // @revenuecat/purchases-capacitor returns the PurchasesOfferings object directly
      const result = await Purchases.getOfferings();
      // Capacitor plugin wraps in { offerings } on some versions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (result as any).offerings ?? result ?? null;
    },
    staleTime: 300 * 1000,
    retry: false,
  });

  const purchaseMutation = useMutation({
    mutationFn: async (pkg: unknown) => {
      const Purchases = await getPurchases();
      if (!Purchases) throw new Error("Purchases not available in browser");
      const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg as never });
      return customerInfo;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenuecat"] });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      const Purchases = await getPurchases();
      if (!Purchases) throw new Error("Purchases not available in browser");
      const { customerInfo } = await Purchases.restorePurchases();
      return customerInfo;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenuecat"] });
    },
  });

  const isSubscribed =
    customerInfoQuery.data?.entitlements?.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;

  return {
    customerInfo:  customerInfoQuery.data ?? null,
    offerings:     offeringsQuery.data ?? null,
    isSubscribed,
    isLoading:     customerInfoQuery.isLoading || offeringsQuery.isLoading,
    purchase:      purchaseMutation.mutateAsync,
    restore:       restoreMutation.mutateAsync,
    isPurchasing:  purchaseMutation.isPending,
    isRestoring:   restoreMutation.isPending,
    purchaseError: purchaseMutation.error as Error | null,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const value = useSubscriptionContext();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useSubscription must be inside <SubscriptionProvider>");
  return ctx;
}
