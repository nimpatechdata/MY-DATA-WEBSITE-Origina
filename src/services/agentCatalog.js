const bundles = require("../config/bundles");

function getAgentCatalog() {
  return Object.entries(bundles).flatMap(([network, items]) =>
    items.map((item) => ({
      bundleId: item.id,
      network,
      networkName: network === "airteltigo" ? "AirtelTigo" : network[0].toUpperCase() + network.slice(1),
      size: item.size,
      sizeGb: Number.parseFloat(item.size),
      basePrice: item.priceGhs,
      validity: item.validity
    }))
  );
}

function findBundle(network, sizeGb) {
  return getAgentCatalog().find(
    (item) => item.network === network && item.sizeGb === Number(sizeGb)
  ) || null;
}

module.exports = { getAgentCatalog, findBundle };