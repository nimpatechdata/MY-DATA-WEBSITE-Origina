const bundles = require("../config/bundles");
const catalogService = require("./catalogService");

async function getAgentCatalog() {
  const currentBundles = await catalogService.getBundles();
  return Object.entries(currentBundles).flatMap(([network, items]) =>
    items.map((item) => ({
      bundleId: item.id,
      network,
      networkName: network === "airteltigo" ? "AirtelTigo" : network[0].toUpperCase() + network.slice(1),
      size: item.size,
      sizeGb: Number.parseFloat(item.size),
      basePrice: item.resellerMinPriceGhs ?? item.priceGhs,
      validity: item.validity
    }))
  );
}

async function findBundle(network, sizeGb) {
  const catalog = await getAgentCatalog();
  return catalog.find(
    (item) => item.network === network && item.sizeGb === Number(sizeGb)
  ) || null;
}

module.exports = { getAgentCatalog, findBundle };
