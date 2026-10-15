const baseBundles = require("../config/bundles");
const supabase = require("./supabaseClient");

function cloneBundles() {
  return Object.fromEntries(Object.entries(baseBundles).map(([network, items]) => [network, items.map((item) => ({ ...item }))]));
}

async function getBundles() {
  const bundles = cloneBundles();
  try {
    const { data, error } = await supabase.getAdminClient().from("storefront_bundle_prices").select("bundle_id, price_ghs");
    if (error) throw error;
    const overrides = new Map((data || []).map((row) => [row.bundle_id, Number(row.price_ghs)]));
    for (const items of Object.values(bundles)) for (const item of items) if (overrides.has(item.id)) item.priceGhs = overrides.get(item.id);
  } catch (error) {
    if (!String(error.message || "").toLowerCase().includes("storefront_bundle_prices")) console.error("Could not load bundle price overrides:", error.message);
  }
  return bundles;
}

function findBaseBundle(bundleId) { return Object.values(baseBundles).flat().find((item) => item.id === bundleId) || null; }

async function updatePrice(bundleId, priceGhs) {
  const bundle = findBaseBundle(bundleId);
  const price = Number(priceGhs);
  if (!bundle || !Number.isFinite(price) || price <= 0) throw new Error("Choose a valid bundle and positive price.");
  const { error } = await supabase.getAdminClient().from("storefront_bundle_prices").upsert({ bundle_id: bundleId, price_ghs: price, updated_at: new Date().toISOString() }, { onConflict: "bundle_id" });
  if (error) throw error;
  return { ...bundle, priceGhs: price };
}

async function listPrices() { const bundles = await getBundles(); return Object.entries(bundles).flatMap(([network, items]) => items.map((item) => ({ ...item, network }))); }

module.exports = { getBundles, updatePrice, listPrices };
