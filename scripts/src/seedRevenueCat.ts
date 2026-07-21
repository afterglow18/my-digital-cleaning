/**
 * seedRevenueCat — idempotent setup script.
 *
 * Creates / verifies the RevenueCat project, iOS app, three products
 * (monthly $1.99, yearly $19.99, lifetime $9.99), the `premium` entitlement,
 * the default offering, and three packages ($rc_monthly / $rc_annual / $rc_lifetime).
 *
 * Run with:
 *   pnpm --filter scripts seed:revenuecat
 */
import { getUncachableRevenueCatClient } from "./revenueCatClient";

import {
  listProjects,
  createProject,
  listApps,
  createApp,
  listAppPublicApiKeys,
  listProducts,
  createProduct,
  listEntitlements,
  createEntitlement,
  attachProductsToEntitlement,
  listOfferings,
  createOffering,
  updateOffering,
  listPackages,
  createPackages,
  attachProductsToPackage,
  type App,
  type Product,
  type Project,
  type Entitlement,
  type Offering,
  type Package,
  type CreateProductData,
} from "@replit/revenuecat-sdk";

// ── Config ────────────────────────────────────────────────────────────────────

const PROJECT_NAME        = "My Digital Cleaning";
const APP_STORE_APP_NAME  = "My Digital Cleaning";
const APP_STORE_BUNDLE_ID = "com.mydigitalcleaning.app";

const ENTITLEMENT_IDENTIFIER = "premium";
const ENTITLEMENT_DISPLAY_NAME = "Premium Access";

const OFFERING_IDENTIFIER  = "default";
const OFFERING_DISPLAY_NAME = "Default Offering";

// Three products
interface ProductDef {
  identifier:   string;
  displayName:  string;
  type:         "subscription" | "non_consumable";
  duration?:    string;               // ISO 8601, subscriptions only
  priceMicros:  number;               // USD micros
  pkgKey:       string;               // RC package lookup key
  pkgName:      string;
}

const PRODUCTS: ProductDef[] = [
  {
    identifier:  "digital_suitcase_monthly",
    displayName: "Monthly – My Digital Cleaning",
    type:        "subscription",
    duration:    "P1M",
    priceMicros: 1990000,   // $1.99
    pkgKey:      "$rc_monthly",
    pkgName:     "Monthly",
  },
  {
    identifier:  "digital_suitcase_yearly",
    displayName: "Yearly – My Digital Cleaning",
    type:        "subscription",
    duration:    "P1Y",
    priceMicros: 19990000,  // $19.99
    pkgKey:      "$rc_annual",
    pkgName:     "Yearly",
  },
  {
    identifier:  "digital_suitcase_lifetime",
    displayName: "Lifetime – My Digital Cleaning",
    type:        "non_consumable",
    priceMicros: 9990000,   // $9.99
    pkgKey:      "$rc_lifetime",
    pkgName:     "Lifetime",
  },
];

type TestStorePricesResponse = {
  object: string;
  prices: { amount_micros: number; currency: string }[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ensureProduct(
  client: Awaited<ReturnType<typeof getUncachableRevenueCatClient>>,
  project: Project,
  app: App,
  def: ProductDef,
  isTest: boolean,
): Promise<Product> {
  const { data: existing, error: listErr } = await listProducts({
    client,
    path: { project_id: project.id },
    query: { limit: 100 },
  });
  if (listErr) throw new Error("Failed to list products");

  const found = existing.items?.find(
    (p) => p.store_identifier === def.identifier && p.app_id === app.id,
  );
  if (found) {
    console.log(`  ✓ Product exists [${def.identifier}]:`, found.id);
    return found;
  }

  const body: CreateProductData["body"] = {
    store_identifier: def.identifier,
    app_id:           app.id,
    type:             def.type,
    display_name:     def.displayName,
  };
  if (isTest) {
    body.title = def.displayName;
    if (def.type === "subscription" && def.duration) {
      body.subscription = { duration: def.duration };
    }
  }

  const { data, error } = await createProduct({ client, path: { project_id: project.id }, body });
  if (error) throw new Error(`Failed to create product [${def.identifier}]: ${JSON.stringify(error)}`);
  console.log(`  + Created product [${def.identifier}]:`, data.id);
  return data;
}

async function setTestPrice(
  client: Awaited<ReturnType<typeof getUncachableRevenueCatClient>>,
  project: Project,
  product: Product,
  priceMicros: number,
) {
  const { error } = await client.post<TestStorePricesResponse>({
    url:  "/projects/{project_id}/products/{product_id}/test_store_prices",
    path: { project_id: project.id, product_id: product.id },
    body: { prices: [{ amount_micros: priceMicros, currency: "USD" }] },
  });
  if (error) {
    if (
      error && typeof error === "object" && "type" in error &&
      error["type"] === "resource_already_exists"
    ) {
      console.log(`  ✓ Test price already set for`, product.id);
    } else {
      console.warn(`  ⚠ Could not set test price for ${product.id}:`, error);
    }
  } else {
    console.log(`  + Set test price for`, product.id);
  }
}

async function ensurePackage(
  client: Awaited<ReturnType<typeof getUncachableRevenueCatClient>>,
  project: Project,
  offering: Offering,
  pkgKey: string,
  pkgName: string,
): Promise<Package> {
  const { data: existing, error: listErr } = await listPackages({
    client,
    path: { project_id: project.id, offering_id: offering.id },
    query: { limit: 20 },
  });
  if (listErr) throw new Error("Failed to list packages");

  const found = existing.items?.find((p) => p.lookup_key === pkgKey);
  if (found) {
    console.log(`  ✓ Package exists [${pkgKey}]:`, found.id);
    return found;
  }

  const { data, error } = await createPackages({
    client,
    path:  { project_id: project.id, offering_id: offering.id },
    body:  { lookup_key: pkgKey, display_name: pkgName },
  });
  if (error) throw new Error(`Failed to create package [${pkgKey}]: ${JSON.stringify(error)}`);
  console.log(`  + Created package [${pkgKey}]:`, data.id);
  return data;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function seed() {
  const client = await getUncachableRevenueCatClient();

  // ── Project ──────────────────────────────────────────────────────────────────
  console.log("\n── Project ──");
  const { data: allProjects, error: listProjErr } = await listProjects({ client, query: { limit: 20 } });
  if (listProjErr) throw new Error(`Failed to list projects: ${JSON.stringify(listProjErr)}`);

  let project: Project;
  const existingProject = allProjects.items?.find((p) => p.name === PROJECT_NAME);
  if (existingProject) {
    console.log("  ✓ Project exists:", existingProject.id);
    project = existingProject;
  } else {
    const { data, error } = await createProject({ client, body: { name: PROJECT_NAME } });
    if (error) throw new Error("Failed to create project");
    console.log("  + Created project:", data.id);
    project = data;
  }

  // ── Apps ──────────────────────────────────────────────────────────────────────
  console.log("\n── Apps ──");
  const { data: apps, error: listAppsErr } = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listAppsErr || !apps) throw new Error("Failed to list apps");

  const testApp: App | undefined = apps.items.find((a) => a.type === "test_store");
  if (!testApp) throw new Error("No test store app found — check RevenueCat project");
  console.log("  ✓ Test store app:", testApp.id);

  let appStoreApp: App | undefined = apps.items.find((a) => a.type === "app_store");
  if (!appStoreApp) {
    const { data, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: { name: APP_STORE_APP_NAME, type: "app_store", app_store: { bundle_id: APP_STORE_BUNDLE_ID } },
    });
    if (error) throw new Error("Failed to create App Store app");
    appStoreApp = data;
    console.log("  + Created App Store app:", appStoreApp.id);
  } else {
    console.log("  ✓ App Store app:", appStoreApp.id);
  }

  // ── Products (for all three tiers) ───────────────────────────────────────────
  console.log("\n── Products ──");
  const productIds: { test: string; appStore: string }[] = [];

  for (const def of PRODUCTS) {
    console.log(`\n  [${def.pkgName}]`);
    const testProd     = await ensureProduct(client, project, testApp,     def, true);
    const appStoreProd = await ensureProduct(client, project, appStoreApp, def, false);
    await setTestPrice(client, project, testProd, def.priceMicros);
    productIds.push({ test: testProd.id, appStore: appStoreProd.id });
  }

  // ── Entitlement ───────────────────────────────────────────────────────────────
  console.log("\n── Entitlement ──");
  let entitlement: Entitlement;
  const { data: allEnts, error: listEntsErr } = await listEntitlements({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listEntsErr) throw new Error("Failed to list entitlements");

  const existingEnt = allEnts.items?.find((e) => e.lookup_key === ENTITLEMENT_IDENTIFIER);
  if (existingEnt) {
    console.log("  ✓ Entitlement exists:", existingEnt.id);
    entitlement = existingEnt;
  } else {
    const { data, error } = await createEntitlement({
      client,
      path: { project_id: project.id },
      body: { lookup_key: ENTITLEMENT_IDENTIFIER, display_name: ENTITLEMENT_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create entitlement");
    console.log("  + Created entitlement:", data.id);
    entitlement = data;
  }

  // Attach all product IDs
  const allProductIds = productIds.flatMap((p) => [p.test, p.appStore]);
  const { error: attachEntErr } = await attachProductsToEntitlement({
    client,
    path: { project_id: project.id, entitlement_id: entitlement.id },
    body: { product_ids: allProductIds },
  });
  if (attachEntErr) {
    if (attachEntErr.type === "unprocessable_entity_error") {
      console.log("  ✓ Products already attached to entitlement");
    } else {
      throw new Error("Failed to attach products to entitlement");
    }
  } else {
    console.log("  + Attached all products to entitlement");
  }

  // ── Offering ──────────────────────────────────────────────────────────────────
  console.log("\n── Offering ──");
  let offering: Offering;
  const { data: allOfferings, error: listOffsErr } = await listOfferings({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listOffsErr) throw new Error("Failed to list offerings");

  const existingOff = allOfferings.items?.find((o) => o.lookup_key === OFFERING_IDENTIFIER);
  if (existingOff) {
    console.log("  ✓ Offering exists:", existingOff.id);
    offering = existingOff;
  } else {
    const { data, error } = await createOffering({
      client,
      path: { project_id: project.id },
      body: { lookup_key: OFFERING_IDENTIFIER, display_name: OFFERING_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create offering");
    console.log("  + Created offering:", data.id);
    offering = data;
  }

  if (!offering.is_current) {
    const { error } = await updateOffering({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      body: { is_current: true },
    });
    if (error) throw new Error("Failed to set offering as current");
    console.log("  + Set as current offering");
  }

  // ── Packages ($rc_monthly / $rc_annual / $rc_lifetime) ───────────────────────
  console.log("\n── Packages ──");
  for (let i = 0; i < PRODUCTS.length; i++) {
    const def  = PRODUCTS[i];
    const ids  = productIds[i];
    const pkg: Package = await ensurePackage(client, project, offering, def.pkgKey, def.pkgName);

    const { error: attachPkgErr } = await attachProductsToPackage({
      client,
      path: { project_id: project.id, package_id: pkg.id },
      body: {
        products: [
          { product_id: ids.test,     eligibility_criteria: "all" },
          { product_id: ids.appStore, eligibility_criteria: "all" },
        ],
      },
    });
    if (attachPkgErr) {
      if (
        attachPkgErr.type === "unprocessable_entity_error" &&
        attachPkgErr.message?.includes("Cannot attach product")
      ) {
        console.log(`  ✓ Package [${def.pkgKey}] already has products`);
      } else {
        throw new Error(`Failed to attach products to package [${def.pkgKey}]`);
      }
    } else {
      console.log(`  + Attached products to package [${def.pkgKey}]`);
    }
  }

  // ── Print keys ────────────────────────────────────────────────────────────────
  const { data: testKeys, error: e1 } = await listAppPublicApiKeys({
    client, path: { project_id: project.id, app_id: testApp.id },
  });
  const { data: iosKeys, error: e2 } = await listAppPublicApiKeys({
    client, path: { project_id: project.id, app_id: appStoreApp.id },
  });
  if (e1 || e2) throw new Error("Failed to fetch public API keys");

  console.log("\n==================== DONE ====================");
  console.log("REVENUECAT_PROJECT_ID:             ", project.id);
  console.log("REVENUECAT_TEST_STORE_APP_ID:      ", testApp.id);
  console.log("REVENUECAT_APPLE_APP_STORE_APP_ID: ", appStoreApp.id);
  console.log("VITE_REVENUECAT_TEST_KEY:          ", testKeys?.items?.[0]?.key ?? "N/A");
  console.log("VITE_REVENUECAT_IOS_KEY:           ", iosKeys?.items?.[0]?.key ?? "N/A");
  console.log("==============================================");
  console.log("\nProducts seeded:");
  PRODUCTS.forEach((p) => console.log(`  ${p.pkgKey}  →  ${p.identifier}`));
  console.log("\n👆 Copy keys into Replit secrets / Codemagic env group.");
}

seed().catch((err) => { console.error(err); process.exit(1); });
