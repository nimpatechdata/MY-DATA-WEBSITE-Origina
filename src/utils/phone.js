const networks = require("../config/networks");

function normalizeGhanaNumber(input) {
  if (!input) return "";
  let digits = String(input).replace(/\D/g, "");

  if (digits.startsWith("233") && digits.length === 12) {
    digits = `0${digits.slice(3)}`;
  }

  return digits;
}

function detectNetwork(phone) {
  const normalized = normalizeGhanaNumber(phone);
  const prefix = normalized.slice(0, 3);

  return Object.values(networks).find((network) =>
    network.prefixes.includes(prefix)
  );
}

function isValidGhanaMobile(phone) {
  const normalized = normalizeGhanaNumber(phone);
  return /^0\d{9}$/.test(normalized) && Boolean(detectNetwork(normalized));
}

function phoneMatchesNetwork(phone, networkId) {
  const network = detectNetwork(phone);
  return Boolean(network && network.id === networkId);
}

module.exports = {
  normalizeGhanaNumber,
  detectNetwork,
  isValidGhanaMobile,
  phoneMatchesNetwork
};
