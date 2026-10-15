const VTU_BASE_URL = (process.env.VTU_BASE_URL || "").replace(/\/$/, "");
const VTU_API_KEY = process.env.VTU_API_KEY || "";
const VTU_PROVIDER = String(process.env.VTU_PROVIDER || "justice").toLowerCase();
const DATAMART_BASE_URL = (process.env.DATAMART_BASE_URL || "https://api.datamartgh.shop/api/developer").replace(/\/$/, "");
const DATAMART_API_KEY = process.env.DATAMART_API_KEY || "";
const DATAMART_API_SECRET = process.env.DATAMART_API_SECRET || "";
const DATAMART_STATUS_URL = String(process.env.DATAMART_STATUS_URL || "").trim();

function isConfigured() {
  if (VTU_PROVIDER === "datamart") {
    return Boolean(DATAMART_BASE_URL && DATAMART_API_KEY && DATAMART_API_SECRET);
  }
  if (VTU_PROVIDER !== "justice") return false;
  return Boolean(VTU_BASE_URL && VTU_API_KEY);
}

function getJusticeNetwork(network) {
  const networkCodes = {
    mtn: "MTN",
    telecel: "TELECEL",
    airteltigo: "AIRTELTIGO_ISHARE"
  };
  const networkCode = networkCodes[String(network).toLowerCase()];
  if (!networkCode) throw new Error("Unsupported Justice network.");
  return networkCode;
}

function getSizeInGb(size) {
  const sizeInGb = Number.parseFloat(String(size).trim().replace(/\s*GB$/i, ""));
  if (!Number.isFinite(sizeInGb) || sizeInGb <= 0) {
    throw new Error("Bundle size must be a positive number of GB.");
  }
  return sizeInGb;
}

function getTerminalStatus(status) {
  const normalizedStatus = String(status || "").toUpperCase();
  return {
    delivered: ["COMPLETED", "SUCCESS", "DELIVERED"].includes(normalizedStatus),
    failed: ["FAILED", "CANCELLED", "REJECTED"].includes(normalizedStatus)
  };
}

async function parseJusticeResponse(response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.status !== true || !result.payload) {
    throw new Error(result.message || "Justice rejected the request");
  }
  return result;
}

function getDatamartNetwork(network) {
  const networkCodes = {
    mtn: "YELLO",
    telecel: "TELECEL",
    airteltigo: "AT_PREMIUM"
  };
  const networkCode = networkCodes[String(network).toLowerCase()];
  if (!networkCode) throw new Error("Unsupported Datamart network.");
  return networkCode;
}

function makeDatamartReference(orderId) {
  const reference = String(orderId || "order").replace(/[^a-zA-Z0-9-]/g, "-");
  return reference.startsWith("sam-") ? reference : `sam-${reference}`;
}

async function parseDatamartResponse(response) {
  const result = await response.json().catch(() => ({}));
  const bodyRateLimit = result.rateLimit || {};
  const readRateLimitValue = (bodyValue, headerName) => {
    const value = bodyValue ?? response.headers?.get?.(headerName);
    if (value === null || value === undefined || value === "") return undefined;
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  };
  const rateLimit = {
    limit: readRateLimitValue(bodyRateLimit.limit, "X-RateLimit-Limit"),
    remaining: readRateLimitValue(bodyRateLimit.remaining, "X-RateLimit-Remaining"),
    resetInSeconds: readRateLimitValue(bodyRateLimit.resetInSeconds, "X-RateLimit-Reset")
  };
  if (Object.values(rateLimit).some((value) => value !== undefined)) {
    result.rateLimit = rateLimit;
  }

  if (response.ok && result.status === "success" && result.data) return result;

  const error = new Error(result.message || "Datamart rejected the data order.");
  error.providerRejected = result.status === "error";
  error.rateLimit = result.rateLimit || null;
  error.providerDetails = {
    currentBalance: result.currentBalance,
    requiredAmount: result.requiredAmount
  };
  throw error;
}

async function deliverDatamartBundle(order) {
  const reference = makeDatamartReference(order.id);
  const response = await fetch(`${DATAMART_BASE_URL}/purchase`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": DATAMART_API_KEY,
      "X-API-Secret": DATAMART_API_SECRET
    },
    body: JSON.stringify({
      phoneNumber: order.phone,
      network: getDatamartNetwork(order.network),
      capacity: String(getSizeInGb(order.size)),
      gateway: "wallet",
      ref: reference
    })
  });

  const result = await parseDatamartResponse(response);
  const data = result.data;
  const providerStatus = data.orderStatus || "UNKNOWN";
  return {
    demo: false,
    provider: "datamart",
    providerReference: data.purchaseId || data.orderReference || data.transactionReference || reference,
    providerOrderReference: data.orderReference || reference,
    providerTransactionReference: data.transactionReference || null,
    providerStatus,
    priceGhs: Number.isFinite(Number(data.price)) ? Number(data.price) : null,
    balanceBefore: Number.isFinite(Number(data.balanceBefore)) ? Number(data.balanceBefore) : null,
    balanceAfter: Number.isFinite(Number(data.balanceAfter)) ? Number(data.balanceAfter) : null,
    processingMethod: data.processingMethod || null,
    rateLimit: result.rateLimit || null,
    ...getTerminalStatus(providerStatus),
    raw: result
  };
}

async function getDeliveryStatus(providerReference) {
  if (VTU_PROVIDER === "datamart") {
    if (!isConfigured() || !DATAMART_STATUS_URL || !providerReference) return null;

    const statusUrl = DATAMART_STATUS_URL.replace(
      "{reference}",
      encodeURIComponent(providerReference)
    );
    const response = await fetch(statusUrl, {
      headers: {
        "X-API-Key": DATAMART_API_KEY,
        "X-API-Secret": DATAMART_API_SECRET
      }
    });
    const result = await response.json().catch(() => ({}));
    const bodyRateLimit = result.rateLimit || {};
    const readRateLimitValue = (bodyValue, headerName) => {
      const value = bodyValue ?? response.headers?.get?.(headerName);
      if (value === null || value === undefined || value === "") return undefined;
      const number = Number(value);
      return Number.isFinite(number) ? number : undefined;
    };
    const rateLimit = {
      limit: readRateLimitValue(bodyRateLimit.limit, "X-RateLimit-Limit"),
      remaining: readRateLimitValue(bodyRateLimit.remaining, "X-RateLimit-Remaining"),
      resetInSeconds: readRateLimitValue(bodyRateLimit.resetInSeconds, "X-RateLimit-Reset")
    };
    const data = result.data || result.order || result;
    const providerStatus = String(
      data.orderStatus || data.status || data.state || "UNKNOWN"
    ).toUpperCase();

    if (!response.ok || ["ERROR", "FAILED", "REJECTED"].includes(String(result.status || "").toUpperCase()) && !data.status) {
      throw new Error(result.message || "Datamart status lookup failed.");
    }

    return {
      provider: "datamart",
      providerReference: data.purchaseId || data.orderReference || data.transactionReference || providerReference,
      providerStatus,
      rateLimit,
      ...getTerminalStatus(providerStatus),
      raw: result
    };
  }
  if (!isConfigured()) return null;

  const response = await fetch(
    `${VTU_BASE_URL}/api/order/${encodeURIComponent(providerReference)}`,
    { headers: { "X-API-Key": VTU_API_KEY } }
  );
  const result = await parseJusticeResponse(response);
  const providerStatus = result.payload.status || "UNKNOWN";

  return {
    provider: VTU_PROVIDER,
    providerReference: result.payload.id || providerReference,
    providerStatus,
    ...getTerminalStatus(providerStatus),
    raw: result
  };
}

async function deliverBundle(order) {
  if (!isConfigured()) {
    return {
      demo: true,
      delivered: false,
      provider: VTU_PROVIDER,
      message:
        "VTU keys are not set. Order is marked pending delivery. Add VTU_BASE_URL and VTU_API_KEY to go live."
    };
  }

  if (VTU_PROVIDER === "datamart") return deliverDatamartBundle(order);

  const response = await fetch(`${VTU_BASE_URL}/api/order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": VTU_API_KEY
    },
    body: JSON.stringify({
      phone: order.phone,
      size: getSizeInGb(order.size),
      network: getJusticeNetwork(order.network)
    })
  });

  const result = await parseJusticeResponse(response);
  if (!result.payload.id) {
    throw new Error("Justice response did not include an order ID");
  }
  const providerStatus = result.payload.status || "UNKNOWN";

  return {
    demo: false,
    provider: VTU_PROVIDER,
    providerReference: result.payload.id || null,
    providerStatus,
    ...getTerminalStatus(providerStatus),
    raw: result
  };
}

module.exports = {
  isConfigured,
  deliverBundle,
  getDeliveryStatus
};
