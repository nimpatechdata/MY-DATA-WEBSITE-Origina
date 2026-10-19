const DEFAULT_TIMEOUT_MS = 10_000;

function firstValue(item, keys, fallback = null) {
  for (const key of keys) {
    if (item?.[key] !== undefined && item[key] !== null && item[key] !== "") return item[key];
  }
  return fallback;
}

function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["data", "orders", "transactions", "results"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  const providerData = payload?.data || payload;
  const current = providerData?.yourOrders?.inCurrentBatch || [];
  const last = providerData?.yourOrders?.inLastDeliveredBatch || [];
  if (Array.isArray(current) || Array.isArray(last)) return [...current, ...last];
  return [];
}

function normalizeStatus(value) {
  const status = String(value || "pending").toLowerCase().replace(/[-\s]+/g, "_");
  if (["success", "successful", "completed", "complete", "delivered", "delivery_success"].includes(status)) return "success";
  if (["failed", "failure", "cancelled", "canceled", "rejected", "delivery_failed"].includes(status)) return "failed";
  return "pending";
}

function normalizeItems(payload) {
  return toArray(payload).map((item, index) => ({
    reference: String(firstValue(item, ["reference", "ref", "orderReference", "order_reference", "orderId", "id"], `unknown-${index + 1}`)),
    status: normalizeStatus(firstValue(item, ["status", "orderStatus", "order_status", "state"])),
    statusLabel: String(firstValue(item, ["status", "orderStatus", "order_status", "state"], "Pending")),
    timestamp: firstValue(item, ["createdAt", "created_at", "date", "timestamp", "updatedAt", "updated_at"]),
    completedAt: firstValue(item, ["completedAt", "completed_at", "deliveredAt", "delivered_at", "finishedAt", "finished_at"]),
    deliveryTimeSeconds: firstValue(item, ["deliveryTimeSeconds", "delivery_time_seconds", "durationSeconds", "duration_seconds"]),
    network: firstValue(item, ["network", "networkName", "network_name"]),
    phone: firstValue(item, ["phone", "phoneNumber", "phone_number", "recipient"]),
    size: firstValue(item, ["capacity", "size", "bundle"])
  }));
}

function summarize(items) {
  return items.reduce((summary, item) => {
    summary.total += 1;
    if (item.status === "success") summary.successful += 1;
    else if (item.status === "failed") summary.failed += 1;
    else summary.pending += 1;
    return summary;
  }, { total: 0, successful: 0, pending: 0, failed: 0 });
}

async function fetchJsonWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.DATAMART_TRACKING_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.message || payload?.error || "Datamart tracking request failed.");
      error.statusCode = response.status;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function getTracking(_req, res) {
  const url = String(process.env.DATAMART_TRACKING_URL || "").trim();
  const apiKey = String(process.env.DATAMART_API_KEY || "").trim();
  const apiSecret = String(process.env.DATAMART_API_SECRET || "").trim();
  if (!url || !apiKey) return res.status(503).json({ error: "Datamart tracking is not configured on the server." });

  try {
    const separator = url.includes("?") ? "&" : "?";
    const payload = await fetchJsonWithTimeout(`${url}${separator}limit=${encodeURIComponent(process.env.DATAMART_TRACKING_LIMIT || "1000")}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-API-Key": apiKey,
        ...(apiSecret ? { "X-API-Secret": apiSecret } : {})
      }
    });
    const items = normalizeItems(payload);
    const providerData = payload?.data || payload;
    const providerStats = providerData?.stats || {};
    const metrics = Object.keys(providerStats).length ? {
      total: Number(providerStats.checked || 0),
      successful: Number(providerStats.delivered || 0),
      pending: Number(providerStats.pending || 0) + Number(providerStats.partial || 0),
      failed: Number(providerStats.failed || 0)
    } : summarize(items);
    return res.json({
      metrics,
      items,
      scanner: providerData?.scanner || null,
      checkingNow: providerData?.checkingNow || null,
      lastDelivered: providerData?.lastDelivered || null,
      refreshedAt: new Date().toISOString()
    });
  } catch (error) {
    const timedOut = error.name === "AbortError";
    console.error("Datamart tracking proxy failed:", error.message);
    return res.status(timedOut ? 504 : error.statusCode === 401 || error.statusCode === 403 ? 502 : 503).json({ error: timedOut ? "Datamart tracking timed out. Please try again." : "Could not load Datamart tracking data." });
  }
}

module.exports = { getTracking, normalizeItems, summarize };
