const crypto = require("crypto");
const orders = require("../store/orders");
const catalogService = require("../services/catalogService");
const supabase = require("../services/supabaseClient");
const receiptService = require("../services/receiptService");

const COOKIE_NAME = "nimpatech_admin";
const SETTINGS_TABLE = "storefront_admin_settings";

function environmentPassword() {
  return String(process.env.ADMIN_PASSWORD || process.env.ADMIN_DASHBOARD_TOKEN || "");
}

function allowedEmails() {
  return String(process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
}

function sign(value, key) {
  return crypto.createHmac("sha256", key).update(value).digest("hex");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return password === environmentPassword();
  const [, salt, expectedHex] = String(storedHash).split("$");
  if (!salt || !expectedHex) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function readSettings() {
  try {
    const { data, error } = await supabase.getAdminClient()
      .from(SETTINGS_TABLE)
      .select("id, admin_email, password_hash, reset_token_hash, reset_expires_at, site_settings")
      .eq("id", "singleton")
      .maybeSingle();
    if (error) {
      if (["42P01", "PGRST205"].includes(error.code) || error.statusCode === 503) return null;
      throw error;
    }
    return data || null;
  } catch (error) {
    if (["42P01", "PGRST205"].includes(error.code) || error.statusCode === 503) return null;
    throw error;
  }
}

async function adminConfig() {
  const settings = await readSettings();
  const password = environmentPassword();
  const passwordHash = settings?.password_hash || null;
  return {
    settings,
    password,
    passwordHash,
    credentialVersion: passwordHash || password,
    emails: [...new Set([...allowedEmails(), settings?.admin_email].filter(Boolean).map((email) => String(email).toLowerCase()))],
    signingKey: String(process.env.ADMIN_COOKIE_SECRET || password || passwordHash || "nimpatech-admin-cookie")
  };
}

function makeCookie(config, email) {
  const value = Buffer.from(JSON.stringify({ email, version: config.credentialVersion }), "utf8").toString("base64url");
  return `${value}.${sign(value, config.signingKey)}`;
}

function parseCookies(header) {
  return Object.fromEntries(String(header || "").split(";").map((part) => part.trim().split("=")).filter(([key, value]) => key && value));
}

async function getAuthenticatedAdmin(req) {
  const config = await adminConfig();
  if (!config.credentialVersion) return null;
  const cookie = parseCookies(req.get("cookie"))[COOKIE_NAME] || "";
  const [value, signature] = cookie.split(".");
  if (!value || !signature) return null;
  const expected = sign(value, config.signingKey);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(value, "base64url").toString("utf8")); } catch { return null; }
  if (payload.version !== config.credentialVersion || !config.emails.includes(String(payload.email || "").toLowerCase())) return null;
  return { ...config, email: String(payload.email).toLowerCase() };
}

async function requireAdmin(req, res, next) {
  try {
    const admin = await getAuthenticatedAdmin(req);
    if (!admin) return res.status(401).json({ error: "Admin login required." });
    req.admin = admin;
    return next();
  } catch (error) {
    console.error("Admin authentication failed:", error.message);
    return res.status(503).json({ error: "Admin authentication is temporarily unavailable." });
  }
}

async function login(req, res) {
  const config = await adminConfig();
  if (!config.credentialVersion) return res.status(503).json({ error: "Admin dashboard is not configured." });
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || req.body?.token || "");
  if (!config.emails.includes(email) || !verifyPassword(password, config.passwordHash)) return res.status(401).json({ error: "Invalid admin email or password." });
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${makeCookie(config, email)}; HttpOnly; SameSite=Lax; ${process.env.NODE_ENV === "production" ? "Secure; " : ""}Path=/; Max-Age=28800`);
  return res.json({ authenticated: true });
}

async function changePassword(req, res) {
  const config = req.admin || await adminConfig();
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");
  if (!verifyPassword(currentPassword, config.passwordHash)) return res.status(401).json({ error: "Current password is incorrect." });
  if (newPassword.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters." });
  const adminEmail = String(req.admin?.email || config.settings?.admin_email || allowedEmails()[0] || "").toLowerCase();
  if (!adminEmail) return res.status(400).json({ error: "Admin email is not configured." });
  const { error } = await supabase.getAdminClient()
    .from(SETTINGS_TABLE)
    .upsert({ id: "singleton", admin_email: adminEmail, password_hash: hashPassword(newPassword), updated_at: new Date().toISOString() });
  if (error) return res.status(503).json({ error: "Password storage is not ready. Run the admin settings migration first." });
  const nextConfig = await adminConfig();
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${makeCookie(nextConfig, adminEmail)}; HttpOnly; SameSite=Lax; ${process.env.NODE_ENV === "production" ? "Secure; " : ""}Path=/; Max-Age=28800`);
  return res.json({ updated: true });
}

async function forgotPassword(req, res) {
  const generic = { message: "If that admin email is registered, a password reset link has been sent." };
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return res.json(generic);

  try {
    const config = await adminConfig();
    if (!config.emails.includes(email)) return res.json(generic);
    if (!receiptService.isConfigured()) return res.status(503).json({ error: "Password reset email is not configured. Add the SMTP settings in Vercel first." });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const currentHash = config.passwordHash || hashPassword(config.password);
    const { error } = await supabase.getAdminClient().from(SETTINGS_TABLE).upsert({
      id: "singleton",
      admin_email: email,
      password_hash: currentHash,
      reset_token_hash: tokenHash,
      reset_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    });
    if (error) throw error;

    const configuredBaseUrl = String(process.env.PUBLIC_APP_URL || process.env.ADMIN_APP_URL || "").replace(/\/$/, "");
    const baseUrl = configuredBaseUrl || `${req.protocol}://${req.get("host")}`;
    await receiptService.sendAdminPasswordReset(email, `${baseUrl}/admin?reset=${rawToken}`);
    return res.json(generic);
  } catch (error) {
    console.error("Admin password reset request failed:", error.message);
    return res.status(503).json({ error: "Could not send the reset email. Check the admin settings and SMTP configuration." });
  }
}

async function resetPassword(req, res) {
  const rawToken = String(req.body?.token || "");
  const newPassword = String(req.body?.newPassword || "");
  if (!rawToken || newPassword.length < 8) return res.status(400).json({ error: "Use a valid reset link and a password of at least 8 characters." });
  try {
    const settings = await readSettings();
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    if (!settings?.reset_token_hash || settings.reset_token_hash !== tokenHash || !settings.reset_expires_at || new Date(settings.reset_expires_at).getTime() <= Date.now()) {
      return res.status(400).json({ error: "This reset link is invalid or expired. Request a new one." });
    }
    const passwordHash = hashPassword(newPassword);
    const { error } = await supabase.getAdminClient().from(SETTINGS_TABLE).update({
      password_hash: passwordHash,
      reset_token_hash: null,
      reset_expires_at: null,
      updated_at: new Date().toISOString()
    }).eq("id", "singleton");
    if (error) throw error;
    const nextConfig = await adminConfig();
    const email = String(settings.admin_email).toLowerCase();
    res.setHeader("Set-Cookie", `${COOKIE_NAME}=${makeCookie(nextConfig, email)}; HttpOnly; SameSite=Lax; ${process.env.NODE_ENV === "production" ? "Secure; " : ""}Path=/; Max-Age=28800`);
    return res.json({ updated: true });
  } catch (error) {
    console.error("Admin password reset failed:", error.message);
    return res.status(503).json({ error: "Could not reset the password. Try again later." });
  }
}

async function prices(_req, res) {
  try { return res.json({ prices: await catalogService.listPrices() }); }
  catch (error) { console.error("Admin price listing failed:", error.message); return res.status(503).json({ error: "Could not load prices." }); }
}

async function updatePrice(req, res) {
  try {
    const customerPrice = req.body?.customerPriceGhs ?? req.body?.priceGhs;
    const resellerMinPrice = req.body?.resellerMinPriceGhs ?? customerPrice;
    return res.json({ price: await catalogService.updatePrice(req.body?.bundleId, customerPrice, resellerMinPrice) });
  }
  catch (error) { return res.status(400).json({ error: error.message || "Could not update price." }); }
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
      orderReference: order.payment?.reference || order.id,
      deliveryStatus: order.delivery?.providerStatus || null,
      delivered: Boolean(order.delivery?.delivered),
      failed: Boolean(order.delivery?.failed),
      providerOrderReference: order.delivery?.providerOrderReference || null,
      providerTransactionReference: order.delivery?.providerTransactionReference || null,
      deliveredAt: order.delivery?.deliveredAt || null,
      estimatedMinutes: order.delivery?.estimatedMinutes ?? Number(process.env.DATAMART_DELIVERY_ESTIMATE_MINUTES || 5),
      estimatedDeliveryAt: order.delivery?.estimatedDeliveryAt || null
    }));
    return res.json({ summary, orders: output });
  } catch (error) {
    console.error("Admin order listing failed:", error.message);
    return res.status(503).json({ error: "Could not load admin orders." });
  }
}

const defaultSiteSettings = {
  siteName: "NImpatech data bundles",
  siteTagline: "Fast Ghana data bundles with secure checkout.",
  siteDescription: "Choose a network, select a bundle, and enter the number that should receive the data.",
  supportPhone: "0533323096",
  whatsappNumber: "233533323096",
  theme: "yellow"
};

async function siteSettings(_req, res) {
  try {
    const settings = await readSettings();
    return res.json({ ...defaultSiteSettings, ...(settings?.site_settings || {}) });
  } catch (error) {
    console.error("Site settings listing failed:", error.message);
    return res.json(defaultSiteSettings);
  }
}

async function updateSiteSettings(req, res) {
  const allowedThemes = new Set(["yellow", "darkblue", "white", "black"]);
  const current = await readSettings();
  const next = {
    ...defaultSiteSettings,
    ...(current?.site_settings || {}),
    siteName: String(req.body?.siteName || "").trim().slice(0, 80),
    siteTagline: String(req.body?.siteTagline || "").trim().slice(0, 160),
    siteDescription: String(req.body?.siteDescription || "").trim().slice(0, 300),
    supportPhone: String(req.body?.supportPhone || "").replace(/\D/g, "").slice(0, 15),
    whatsappNumber: String(req.body?.whatsappNumber || "").replace(/\D/g, "").slice(0, 15),
    theme: allowedThemes.has(req.body?.theme) ? req.body.theme : "yellow"
  };
  if (!next.siteName || !next.supportPhone || !next.whatsappNumber) return res.status(400).json({ error: "Site name and support numbers are required." });
  const { error } = await supabase.getAdminClient().from(SETTINGS_TABLE).upsert({
    id: "singleton",
    admin_email: current?.admin_email || req.admin?.email || allowedEmails()[0],
    password_hash: current?.password_hash || hashPassword(environmentPassword()),
    site_settings: next,
    updated_at: new Date().toISOString()
  });
  if (error) return res.status(503).json({ error: "Could not save site settings. Check the Supabase admin settings table." });
  return res.json(next);
}

module.exports = { login, logout, list, prices, updatePrice, changePassword, forgotPassword, resetPassword, siteSettings, updateSiteSettings, requireAdmin };
