const crypto = require("crypto");
const orders = require("../store/orders");

const COOKIE_NAME = "nimpatech_admin";

function secret() {
  return String(process.env.ADMIN_DASHBOARD_TOKEN || "");
}

function sign(value) {
  return crypto.createHmac("sha256", secret()).update(value).digest("hex");
}

function makeCookie() {
  const value = Buffer.from(secret(), "utf8").toString("base64url");
  return `${value}.${sign(value)}`;
}

function parseCookies(header) {
  return Object.fromEntries(String(header || "").split(";").map((part) => part.trim().split("=")).filter(([key, value]) => key && value));
}

function isAuthenticated(req) {
  const token = secret();
  if (!token) return false;
  const cookie = parseCookies(req.get("cookie"))[COOKIE_NAME] || "";
  const [value, signature] = cookie.split(".");
  if (!value || !signature) return false;
  const expected = sign(value);
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) && Buffer.from(value, "base64url").toString("utf8") === token;
}

function requireAdmin(req, res, next) {
  if (!isAuthenticated(req)) return res.status(401).json({ error: "Admin login required." });
  return next();
}

async function login(req, res) {
  if (!secret()) return res.status(503).json({ error: "Admin dashboard is not configured." });
  if (String(req.body?.token || "") !== secret()) return res.status(401).json({ error: "Invalid admin token." });
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${makeCookie()}; HttpOnly; SameSite=Lax; ${process.env.NODE_ENV === "production" ? "Secure; " : ""}Path=/; Max-Age=28800`);
  return res.json({ authenticated: true });
}

function logout(_req, res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  return res.json({ authenticated: false });
}

async function list(req, res) {
  try {
    const allOrders = await orders.listOrders();
    const summary = allOrders.reduce((result, order) => {
      result.total += 1;
      result[order.status] = (result[order.status] || 0) + 1;
      return result;
    }, { total: 0 });
    const output = allOrders.map((order) => ({
      id: order.id,
      createdAt: order.createdAt,
      network: order.networkName || order.network,
      size: order.size,
      phone: order.phone,
      email: order.email,
      priceGhs: order.priceGhs,
      status: order.status,
      paymentPaid: Boolean(order.payment?.paid),
      deliveryStatus: order.delivery?.providerStatus || null,
      delivered: Boolean(order.delivery?.delivered),
      failed: Boolean(order.delivery?.failed)
    }));
    return res.json({ summary, orders: output });
  } catch (error) {
    console.error("Admin order listing failed:", error.message);
    return res.status(503).json({ error: "Could not load admin orders." });
  }
}

module.exports = { login, logout, list, requireAdmin };
