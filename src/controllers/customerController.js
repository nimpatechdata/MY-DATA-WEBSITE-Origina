const supabase = require("../services/supabaseClient");

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function safeHandler(handler, genericMessage) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      if (statusCode >= 500) console.error("Customer account request failed:", error.message);
      res.status(statusCode).json({
        error: statusCode === 503 ? error.message : statusCode < 500 ? error.message : genericMessage
      });
    }
  };
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: String(user.user_metadata?.full_name || "Customer").trim() || "Customer"
  };
}

function getBearerToken(req) {
  const authorization = req.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

const signup = safeHandler(async (req, res) => {
  const name = String(req.body?.fullName || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (name.length < 2 || name.length > 90) throw httpError("Enter your name.", 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError("Enter a valid email address.", 400);
  if (password.length < 8) throw httpError("Your password must be at least 8 characters.", 400);

  const admin = supabase.getAdminClient();
  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name, account_type: "customer" }
  });
  if (userError) throw httpError(userError.message, 400);

  const auth = supabase.getAuthClient();
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw httpError("Your account was created. Please sign in.", 201);
  res.status(201).json({
    accessToken: data.session.access_token,
    expiresAt: data.session.expires_at,
    user: publicUser(userData.user)
  });
}, "Could not create your customer account.");

const login = safeHandler(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || !password) throw httpError("Enter your email and password.", 400);
  const auth = supabase.getAuthClient();
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw httpError("Email or password is incorrect.", 401);
  res.json({
    accessToken: data.session.access_token,
    expiresAt: data.session.expires_at,
    user: publicUser(data.user)
  });
}, "Could not sign you in.");

const me = safeHandler(async (req, res) => {
  const token = getBearerToken(req);
  if (!token) throw httpError("Sign in to continue.", 401);
  const admin = supabase.getAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw httpError("Your session has expired. Please sign in again.", 401);
  res.json({ user: publicUser(data.user) });
}, "Could not load your account.");

module.exports = { signup, login, me };
