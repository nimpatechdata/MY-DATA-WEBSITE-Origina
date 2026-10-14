const { createClient } = require("@supabase/supabase-js");

let adminClient;
let authClient;

function isAdminConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function isConfigured() {
  return Boolean(
    process.env.SUPABASE_URL &&
      process.env.SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function missingConfigError() {
  const error = new Error("Supabase server environment settings are required.");
  error.statusCode = 503;
  return error;
}

function getAdminClient() {
  if (!isAdminConfigured()) throw missingConfigError();
  if (!adminClient) {
    adminClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return adminClient;
}

function getAuthClient() {
  if (!isConfigured()) throw missingConfigError();
  if (!authClient) {
    authClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return authClient;
}

async function getAgentFromRequest(req) {
  const authorization = req.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) {
    const error = new Error("Sign in to your sub-agent account.");
    error.statusCode = 401;
    throw error;
  }

  const admin = getAdminClient();
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) {
    const error = new Error("Your session expired. Please sign in again.");
    error.statusCode = 401;
    throw error;
  }

  const { data: profile, error: profileError } = await admin
    .from("agent_profiles")
    .select("user_id, full_name, phone, membership_status, wallet_balance, created_at")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile || profile.membership_status !== "active") {
    const error = new Error("Your GHS 50 membership must be verified before using the portal.");
    error.statusCode = 403;
    throw error;
  }

  return { user: authData.user, profile, admin };
}

module.exports = {
  getAdminClient,
  getAuthClient,
  getAgentFromRequest,
  isAdminConfigured,
  isConfigured
};