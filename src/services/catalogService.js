const baseBundles = require("../config/bundles");
const supabase = require("./supabaseClient");

function cloneBundles() {
  return Object.fromEntries(Object.entries(baseBundles).map(([network, items]) => [network, items.map((item) => ({ ...item }))]));
}

async function getBundles() {
  const bundles = cloneBundles();
  try {
    let result = await supabase.getAdminClient().from("storefront_bundle_prices").select("bundle_id, price_ghs, reseller_min_price_ghs");
    if (result.error && String(result.error.message || "").toLowerCase().includes("reseller_min_price_ghs")) {
      result = await supabase.getAdminClient().from("storefront_bundle_prices").select("bundle_id, price_ghs");
    }
    if (result.error) throw result.error;
    const overrides = new Map((result.data || []).map((row) => [row.bundle_id, {
      customerPriceGhs: Number(row.price_ghs),
      resellerMinPriceGhs: Number.isFinite(Number(row.reseller_min_price_ghs)) ? Number(row.reseller_min_price_ghs) : Number(row.price_ghs)
    }]));
    for (const items of Object.values(bundles)) for (const item of items) {
      const override = overrides.get(item.id);
      if (!override) continue;
      item.priceGhs = override.customerPriceGhs;
      item.customerPriceGhs = override.customerPriceGhs;
      item.resellerMinPriceGhs = override.resellerMinPriceGhs;
    }
  } catch (error) {
    if (!String(error.message || "").toLowerCase().includes("storefront_bundle_prices")) console.error("Could not load bundle price overrides:", error.message);
  }
  for (const items of Object.values(bundles)) for (const item of items) {
    item.customerPriceGhs ??= item.priceGhs;
    item.resellerMinPriceGhs ??= item.priceGhs;
  }
  return bundles;
}

function findBaseBundle(bundleId) { return Object.values(baseBundles).flat().find((item) => item.id === bundleId) || null; }

async function updatePrice(bundleId, customerPriceGhs, resellerMinPriceGhs) {
  const bundle = findBaseBundle(bundleId);
  const customerPrice = Number(customerPriceGhs);
  const resellerMinPrice = Number(resellerMinPriceGhs);
  if (!bundle || !Number.isFinite(customerPrice) || customerPrice <= 0 || !Number.isFinite(resellerMinPrice) || resellerMinPrice <= 0) throw new Error("Choose valid positive customer and reseller prices.");
  if (resellerMinPrice > customerPrice) throw new Error("The reseller minimum cannot be higher than the customer price.");
  const { error } = await supabase.getAdminClient().from("storefront_bundle_prices").upsert({ bundle_id: bundleId, price_ghs: customerPrice, reseller_min_price_ghs: resellerMinPrice, updated_at: new Date().toISOString() }, { onConflict: "bundle_id" });
  if (error) throw error;
  return { ...bundle, priceGhs: customerPrice, customerPriceGhs: customerPrice, resellerMinPriceGhs: resellerMinPrice };
}

async function listPrices() { const bundles = await getBundles(); return Object.entries(bundles).flatMap(([network, items]) => items.map((item) => ({ ...item, network }))); }

module.exports = { getBundles, updatePrice, listPrices };
