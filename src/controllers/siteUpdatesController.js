let cache = { expiresAt: 0, payload: null };

async function getProviderSnapshot() {
  const url = String(process.env.DATAMART_TRACKING_URL || "").trim();
  const key = String(process.env.DATAMART_API_KEY || "").trim();
  if (!url || !key) return null;
  if (cache.payload && cache.expiresAt > Date.now()) return cache.payload;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const separator = url.includes("?") ? "&" : "?";
    const response = await fetch(`${url}${separator}limit=1000`, { headers: { Accept: "application/json", Authorization: `Bearer ${key}`, "X-API-Key": key, ...(process.env.DATAMART_API_SECRET ? { "X-API-Secret": process.env.DATAMART_API_SECRET } : {}) }, signal: controller.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.status === "error") return null;
    cache = { payload, expiresAt: Date.now() + 30_000 };
    return payload;
  } catch (error) {
    console.error("Public site update snapshot failed:", error.message);
    return null;
  } finally { clearTimeout(timeout); }
}

async function getSiteUpdates(_req, res) {
  const payload = await getProviderSnapshot();
  const data = payload?.data || payload || {};
  const stats = data.stats || {};
  const updates = [{ title: "Delivery scanner is active", detail: "Orders are being checked and processed automatically." }];
  if (data.checkingNow?.summary) updates.unshift({ title: "Live delivery activity", detail: data.checkingNow.summary });
  if (Number(stats.delivered) > 0) updates.push({ title: "Deliveries completed", detail: `${Number(stats.delivered).toLocaleString()} bundles have been delivered in the latest provider scan.` });
  if (Number(stats.pending) + Number(stats.partial) > 0) updates.push({ title: "Orders processing", detail: `${(Number(stats.pending) + Number(stats.partial)).toLocaleString()} orders are currently being processed.` });
  return res.json({ updates, scannerActive: data.scanner?.active !== false, updatedAt: new Date().toISOString() });
}

module.exports = { getSiteUpdates };
