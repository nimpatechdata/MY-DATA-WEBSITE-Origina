const crypto = require("crypto");
const supabase = require("../services/supabaseClient");

const VISITS_TABLE = "storefront_visits";

function visitorHash(visitorId) {
  const secret = String(process.env.VISITOR_ANALYTICS_SECRET || process.env.ADMIN_COOKIE_SECRET || "nimpatech-visitor-analytics");
  return crypto.createHash("sha256").update(`${secret}:${visitorId}`).digest("hex");
}

async function recordVisit(req, res) {
  const visitorId = String(req.body?.visitorId || "").trim().slice(0, 120);
  const path = String(req.body?.path || "/").trim().slice(0, 200) || "/";
  if (!visitorId) return res.status(400).json({ error: "Visitor ID is required." });
  try {
    const { error } = await supabase.getAdminClient().from(VISITS_TABLE).insert({ visitor_hash: visitorHash(visitorId), path, visited_at: new Date().toISOString() });
    if (error) throw error;
    return res.status(202).json({ recorded: true });
  } catch (error) {
    console.error("Visitor analytics recording failed:", error.message);
    return res.status(503).json({ error: "Visitor analytics is not configured." });
  }
}

function startOfUtc(period) {
  const now = new Date();
  if (period === "hour") return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).toISOString();
  if (period === "day") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  return new Date(now.getFullYear(), 0, 1).toISOString();
}

function aggregate(rows, keyFn) {
  const buckets = new Map();
  rows.forEach((row) => {
    const key = keyFn(new Date(row.visited_at));
    if (!buckets.has(key)) buckets.set(key, new Set());
    buckets.get(key).add(row.visitor_hash);
  });
  return Object.fromEntries([...buckets.entries()].map(([key, visitors]) => [key, visitors.size]));
}

async function getAnalytics(_req, res) {
  try {
    const since = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase.getAdminClient().from(VISITS_TABLE).select("visitor_hash, visited_at, path").gte("visited_at", since).order("visited_at", { ascending: true });
    if (error) throw error;
    const rows = data || [];
    const unique = (items) => new Set(items.map((row) => row.visitor_hash)).size;
    const hour = new Date();
    const day = new Date();
    const month = new Date();
    const year = new Date();
    const same = (rowDate, target, type) => type === "hour"
      ? rowDate.getFullYear() === target.getFullYear() && rowDate.getMonth() === target.getMonth() && rowDate.getDate() === target.getDate() && rowDate.getHours() === target.getHours()
      : type === "day"
        ? rowDate.toDateString() === target.toDateString()
        : type === "month"
          ? rowDate.getFullYear() === target.getFullYear() && rowDate.getMonth() === target.getMonth()
          : rowDate.getFullYear() === target.getFullYear();
    const summary = { hour: unique(rows.filter((row) => same(new Date(row.visited_at), hour, "hour"))), day: unique(rows.filter((row) => same(new Date(row.visited_at), day, "day"))), month: unique(rows.filter((row) => same(new Date(row.visited_at), month, "month"))), year: unique(rows.filter((row) => same(new Date(row.visited_at), year, "year"))) };
    return res.json({ summary, series: { hours: aggregate(rows, (date) => `${date.toISOString().slice(0, 13)}:00`), days: aggregate(rows, (date) => date.toISOString().slice(0, 10)), months: aggregate(rows, (date) => date.toISOString().slice(0, 7)), years: aggregate(rows, (date) => String(date.getUTCFullYear())) }, trackedSince: since, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Visitor analytics listing failed:", error.message);
    return res.status(503).json({ error: "Could not load visitor analytics. Run the latest Supabase schema migration." });
  }
}

module.exports = { recordVisit, getAnalytics };
