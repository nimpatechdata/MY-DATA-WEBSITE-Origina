const crypto = require("crypto");
const paymentService = require("../services/paymentService");
const vtuService = require("../services/vtuService");
const receiptService = require("../services/receiptService");
const agentCatalog = require("../services/agentCatalog");
const supabase = require("../services/supabaseClient");
const {
  normalizeGhanaNumber,
  isValidGhanaMobile,
  phoneMatchesNetwork
} = require("../utils/phone");

const MEMBERSHIP_FEE_GHS = 50;

async function sendMembershipReceipt(admin, membership, reference) {
  if (membership.receipt_sent_at) return { sent: true, status: "sent" };
  try {
    const { data: authData, error: authError } = await admin.auth.admin.getUserById(membership.user_id);
    if (authError) throw authError;
    const { data: profile, error: profileError } = await admin
      .from("agent_profiles")
      .select("full_name, phone")
      .eq("user_id", membership.user_id)
      .single();
    if (profileError) throw profileError;
    const result = await receiptService.sendReceipt({
      id: reference,
      paymentReference: reference,
      receiptTitle: "Sub-agent membership fee",
      email: authData.user.email,
      phone: profile.phone,
      networkName: "NImpatech",
      size: "GHS 50 membership",
      priceGhs: MEMBERSHIP_FEE_GHS,
      status: "delivered"
    });
    if (result.sent) {
      const { error } = await admin.from("agent_membership_payments")
        .update({ receipt_sent_at: new Date().toISOString() })
        .eq("paystack_reference", reference);
      if (error) throw error;
    }
    return result;
  } catch (error) {
    console.error("Membership receipt email delivery failed:", error.message);
    return { sent: false, status: "failed" };
  }
}

async function sendAgentOrderReceipt(admin, order) {
  if (order.receipt_sent_at) return { sent: true, status: "sent" };
  try {
    const result = await receiptService.sendReceipt({
      id: order.id,
      paymentReference: order.paystack_reference,
      receiptTitle: "Sub-agent customer data bundle",
      email: order.customer_email,
      networkName: order.network === "airteltigo" ? "AirtelTigo" : order.network,
      size: `${order.size_gb}GB`,
      phone: order.phone,
      priceGhs: Number(order.sale_price),
      status: order.status
    });
    if (result.sent) {
      const { error } = await admin.from("agent_orders")
        .update({ receipt_sent_at: new Date().toISOString() })
        .eq("id", order.id);
      if (error) throw error;
    }
    return result;
  } catch (error) {
    console.error("Agent order receipt email delivery failed:", error.message);
    return { sent: false, status: "failed" };
  }
}

function getStatus(_req, res) {
  res.json({
    supabaseConfigured: supabase.isConfigured(),
    paystackConfigured: paymentService.isConfigured()
  });
}

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
      if (statusCode >= 500) console.error("Sub-agent request failed:", error.message);
      res.status(statusCode).json({
        error: statusCode === 503 ? error.message : statusCode < 500 ? error.message : genericMessage
      });
    }
  };
}

function makeCallbackUrl(pathname, params) {
  const callbackBase = process.env.PAYMENT_CALLBACK_URL || "http://localhost:3000/success.html";
  const callback = new URL(pathname, callbackBase);
  for (const [key, value] of Object.entries(params)) callback.searchParams.set(key, value);
  return callback.toString();
}

async function getAgentIdentity(req) {
  const authorization = req.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) throw httpError("Sign in to your sub-agent account.", 401);
  const admin = supabase.getAdminClient();
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) throw httpError("Your session expired. Please sign in again.", 401);
  const { data: profile, error: profileError } = await admin
    .from("agent_profiles")
    .select("user_id, full_name, phone, membership_status, wallet_balance, created_at")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw httpError("Sub-agent profile was not found.", 403);
  return { admin, user: authData.user, profile };
}

async function loadActiveAgent(req) {
  const identity = await getAgentIdentity(req);
  if (identity.profile.membership_status === "suspended") {
    throw httpError("This sub-agent account is suspended. Contact support.", 403);
  }
  if (identity.profile.membership_status !== "active") {
    throw httpError("Your GHS 50 membership must be verified before using the portal.", 403);
  }
  return identity;
}

async function refreshDelivery(admin, agentId, order) {
  if (order.status !== "paid_awaiting_delivery" || !order.justice_reference) return order;
  const delivery = await vtuService.getDeliveryStatus(order.justice_reference);
  if (!delivery) return order;

  if (delivery.delivered) {
    const { error } = await admin.rpc("complete_agent_order", {
      p_order_id: order.id,
      p_agent_id: agentId,
      p_justice_reference: order.justice_reference,
      p_provider_status: delivery.providerStatus
    });
    if (error) throw error;
  } else {
    const nextStatus = delivery.failed ? "delivery_failed" : "paid_awaiting_delivery";
    const { error } = await admin
      .from("agent_orders")
      .update({ status: nextStatus, provider_status: delivery.providerStatus, updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("agent_id", agentId);
    if (error) throw error;
  }

  const { data, error } = await admin.from("agent_orders").select("*").eq("id", order.id).single();
  if (error) throw error;
  return data;
}

async function refreshOrders(admin, agentId, orders) {
  const output = [];
  for (const order of orders) {
    if (order.status !== "paid_awaiting_delivery" || !order.justice_reference) {
      output.push(order);
      continue;
    }
    try {
      output.push(await refreshDelivery(admin, agentId, order));
    } catch {
      output.push(order);
    }
  }
  return output;
}

const enroll = safeHandler(async (req, res) => {
  const { fullName, email, phone, password } = req.body || {};
  if (!String(fullName || "").trim() || !email || !phone || String(password || "").length < 8) {
    throw httpError("Enter your name, email, phone number, and a password of at least 8 characters.", 400);
  }
  if (!paymentService.isConfigured()) throw httpError("Paystack must be configured before agent enrollment.", 503);

  const normalizedPhone = normalizeGhanaNumber(phone);
  if (!isValidGhanaMobile(normalizedPhone)) throw httpError("Enter a valid Ghana mobile number.", 400);

  const admin = supabase.getAdminClient();
  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email: String(email).trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { full_name: String(fullName).trim(), phone: normalizedPhone }
  });
  if (userError) throw httpError(userError.message, 400);

  const userId = userData.user.id;
  const { error: profileError } = await admin.from("agent_profiles").insert({
    user_id: userId,
    full_name: String(fullName).trim(),
    phone: normalizedPhone,
    membership_status: "pending"
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    throw profileError;
  }

  const reference = `join_${crypto.randomUUID()}`;
  const { error: membershipError } = await admin.from("agent_membership_payments").insert({
    user_id: userId,
    paystack_reference: reference,
    amount: MEMBERSHIP_FEE_GHS,
    status: "pending"
  });
  if (membershipError) {
    await admin.from("agent_profiles").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
    throw membershipError;
  }

  let payment;
  try {
    payment = await paymentService.initializePayment({
      id: reference,
      email: String(email).trim().toLowerCase(),
      priceGhs: MEMBERSHIP_FEE_GHS,
      callbackUrl: makeCallbackUrl("/agent-membership-success.html", { reference }),
      metadata: { purpose: "sub_agent_membership", userId }
    });
  } catch (error) {
    await admin.from("agent_membership_payments").delete().eq("paystack_reference", reference);
    await admin.from("agent_profiles").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
    throw error;
  }
  if (payment.demo) throw httpError("Live Paystack checkout is required to activate an agent account.", 503);

  res.status(201).json({ authorizationUrl: payment.authorizationUrl, reference });
}, "Could not start sub-agent registration.");

const confirmMembership = safeHandler(async (req, res) => {
  const reference = String(req.body?.reference || "");
  if (!reference.startsWith("join_")) throw httpError("Membership reference is invalid.", 400);
  const admin = supabase.getAdminClient();
  const { data: membership, error } = await admin
    .from("agent_membership_payments")
    .select("user_id, amount, status, receipt_sent_at")
    .eq("paystack_reference", reference)
    .maybeSingle();
  if (error) throw error;
  if (!membership) throw httpError("Membership payment was not found.", 404);
  if (membership.status !== "paid") {
    const verification = await paymentService.verifyPayment(
      reference,
      reference,
      MEMBERSHIP_FEE_GHS
    );
    if (!verification.paid) throw httpError("The GHS 50 membership payment is not confirmed yet.", 402);

    const { error: activationError } = await admin.rpc("activate_agent_membership", {
      p_reference: reference
    });
    if (activationError) throw activationError;
  }
  const receipt = await sendMembershipReceipt(admin, membership, reference);
  res.json({ active: true, receiptSent: receipt.sent });
}, "Could not verify membership payment.");

const login = safeHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) throw httpError("Enter your email and password.", 400);
  const auth = supabase.getAuthClient();
  const { data, error } = await auth.auth.signInWithPassword({
    email: String(email).trim().toLowerCase(),
    password
  });
  if (error || !data.session) throw httpError("Email or password is incorrect.", 401);

  const admin = supabase.getAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("agent_profiles")
    .select("user_id, full_name, phone, membership_status, wallet_balance, created_at")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw httpError("Sub-agent profile was not found.", 403);
  if (profile.membership_status === "suspended") throw httpError("This sub-agent account is suspended. Contact support.", 403);
  res.json({
    accessToken: data.session.access_token,
    expiresAt: data.session.expires_at,
    profile,
    membershipPending: profile.membership_status !== "active"
  });
}, "Could not sign in to the sub-agent portal.");

const retryMembership = safeHandler(async (req, res) => {
  const { admin, user, profile } = await getAgentIdentity(req);
  if (profile.membership_status === "active") return res.status(409).json({ error: "Membership is already active." });
  if (profile.membership_status === "suspended") throw httpError("This sub-agent account is suspended. Contact support.", 403);
  if (!paymentService.isConfigured()) throw httpError("Paystack checkout is not configured.", 503);

  const reference = `join_${crypto.randomUUID()}`;
  const { error: insertError } = await admin.from("agent_membership_payments").insert({
    user_id: user.id,
    paystack_reference: reference,
    amount: MEMBERSHIP_FEE_GHS,
    status: "pending"
  });
  if (insertError) throw insertError;

  try {
    const payment = await paymentService.initializePayment({
      id: reference,
      email: user.email,
      priceGhs: MEMBERSHIP_FEE_GHS,
      callbackUrl: makeCallbackUrl("/agent-membership-success.html", { reference }),
      metadata: { purpose: "sub_agent_membership", userId: user.id }
    });
    if (payment.demo) throw httpError("Live Paystack checkout is required to activate an agent account.", 503);
    res.status(201).json({ authorizationUrl: payment.authorizationUrl, reference });
  } catch (error) {
    if (error.statusCode) {
      await admin.from("agent_membership_payments").delete().eq("paystack_reference", reference);
    }
    throw error;
  }
}, "Could not restart membership payment.");

const getCatalog = safeHandler(async (_req, res) => {
  res.json(await agentCatalog.getAgentCatalog());
}, "Could not load agent catalog.");

const getDashboard = safeHandler(async (req, res) => {
  const { admin, profile, user } = await loadActiveAgent(req);
  const { data: prices, error: pricesError } = await admin
    .from("agent_prices")
    .select("network, size_gb, sale_price")
    .eq("agent_id", user.id);
  if (pricesError) throw pricesError;

  const { data: initialOrders, error: ordersError } = await admin
    .from("agent_orders")
    .select("*")
    .eq("agent_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (ordersError) throw ordersError;
  const orders = await refreshOrders(admin, user.id, initialOrders || []);

  const { data: ledger, error: ledgerError } = await admin
    .from("agent_wallet_ledger")
    .select("id, order_id, amount, entry_type, note, created_at")
    .eq("agent_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (ledgerError) throw ledgerError;

  const priceMap = new Map((prices || []).map((item) => [`${item.network}:${Number(item.size_gb)}`, Number(item.sale_price)]));
  const catalog = (await agentCatalog.getAgentCatalog()).map((item) => ({
    ...item,
    salePrice: priceMap.get(`${item.network}:${item.sizeGb}`) ?? item.basePrice
  }));
  const { data: refreshedProfile, error: profileError } = await admin
    .from("agent_profiles")
    .select("user_id, full_name, phone, membership_status, wallet_balance, created_at")
    .eq("user_id", user.id)
    .single();
  if (profileError) throw profileError;

  res.json({ profile: refreshedProfile || profile, catalog, orders, walletEntries: ledger || [] });
}, "Could not load the agent dashboard.");

const savePrice = safeHandler(async (req, res) => {
  const { admin, user } = await loadActiveAgent(req);
  const network = String(req.body?.network || "").toLowerCase();
  const sizeGb = Number(req.body?.sizeGb);
  const salePrice = Number(req.body?.salePrice);
  const bundle = await agentCatalog.findBundle(network, sizeGb);
  if (!bundle) throw httpError("Choose an available bundle.", 400);
  if (!Number.isFinite(salePrice) || salePrice <= bundle.basePrice) {
    throw httpError(`Your price must be higher than the GHS ${bundle.basePrice.toFixed(2)} base price.`, 400);
  }

  const { error } = await admin.from("agent_prices").upsert({
    agent_id: user.id,
    network,
    size_gb: sizeGb,
    sale_price: salePrice,
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
  res.json({ network, sizeGb, basePrice: bundle.basePrice, salePrice, margin: salePrice - bundle.basePrice });
}, "Could not save your price.");

const createOrder = safeHandler(async (req, res) => {
  const { admin, user } = await loadActiveAgent(req);
  if (!paymentService.isConfigured()) throw httpError("Paystack checkout is not configured.", 503);
  const network = String(req.body?.network || "").toLowerCase();
  const sizeGb = Number(req.body?.sizeGb);
  const phone = normalizeGhanaNumber(req.body?.phone);
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw httpError("Enter the customer's email so we can send their receipt.", 400);
  }
  const bundle = await agentCatalog.findBundle(network, sizeGb);
  if (!bundle) throw httpError("Choose an available bundle.", 400);
  if (!isValidGhanaMobile(phone) || !phoneMatchesNetwork(phone, network)) {
    throw httpError("Enter a valid phone number for the chosen network.", 400);
  }

  let salePrice = Number(req.body?.salePrice);
  if (!Number.isFinite(salePrice)) {
    const { data: price, error: priceError } = await admin
      .from("agent_prices")
      .select("sale_price")
      .eq("agent_id", user.id)
      .eq("network", network)
      .eq("size_gb", sizeGb)
      .maybeSingle();
    if (priceError) throw priceError;
    salePrice = price ? Number(price.sale_price) : bundle.basePrice;
  }
  if (salePrice <= bundle.basePrice) {
    throw httpError("Set a customer price above the base price before ordering.", 400);
  }

  const id = crypto.randomUUID();
  const { error: insertError } = await admin.from("agent_orders").insert({
    id,
    agent_id: user.id,
    network,
    size_gb: sizeGb,
    phone,
    customer_email: email,
    base_price: bundle.basePrice,
    sale_price: salePrice,
    status: "awaiting_payment",
    paystack_reference: id
  });
  if (insertError) throw insertError;

  let payment;
  try {
    payment = await paymentService.initializePayment({
      id,
      email,
      priceGhs: salePrice,
      network,
      bundleId: bundle.bundleId,
      phone,
      callbackUrl: makeCallbackUrl("/agent-order-success.html", { orderId: id, reference: id }),
      metadata: { purpose: "agent_data_sale", agentId: user.id }
    });
  } catch (error) {
    await admin.from("agent_orders").delete().eq("id", id).eq("agent_id", user.id);
    throw error;
  }
  if (payment.demo) {
    await admin.from("agent_orders").delete().eq("id", id).eq("agent_id", user.id);
    throw httpError("Live Paystack checkout is required for agent sales.", 503);
  }
  res.status(201).json({ orderId: id, basePrice: bundle.basePrice, salePrice, margin: salePrice - bundle.basePrice, authorizationUrl: payment.authorizationUrl });
}, "Could not create this agent order.");

const confirmOrder = safeHandler(async (req, res) => {
  const { admin, user } = await loadActiveAgent(req);
  const orderId = String(req.body?.orderId || "");
  const reference = String(req.body?.reference || "");
  const { data: order, error } = await admin
    .from("agent_orders")
    .select("*")
    .eq("id", orderId)
    .eq("agent_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!order) throw httpError("Agent order was not found.", 404);
  if (["delivered", "paid_awaiting_delivery", "delivery_review"].includes(order.status)) {
    const receipt = await sendAgentOrderReceipt(admin, order);
    return res.json({ order, receiptSent: receipt.sent });
  }
  if (order.status === "delivery_failed") throw httpError("The provider rejected this order. Contact support before retrying.", 409);
  if (order.status === "payment_failed") throw httpError("Payment was not completed for this order.", 402);
  if (order.status !== "awaiting_payment") throw httpError("This order cannot be confirmed again.", 409);
  if (reference !== order.paystack_reference) throw httpError("Payment reference does not match this order.", 400);

  const verification = await paymentService.verifyPayment(
    reference,
    order.paystack_reference,
    Number(order.sale_price)
  );
  if (!verification.paid) {
    await admin.from("agent_orders").update({ status: "payment_failed", updated_at: new Date().toISOString() }).eq("id", order.id);
    throw httpError("Paystack has not confirmed this payment.", 402);
  }
  const { data: claimedOrder, error: lockError } = await admin.from("agent_orders")
    .update({ status: "delivery_review", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("agent_id", user.id)
    .eq("status", "awaiting_payment")
    .select("id")
    .maybeSingle();
  if (lockError) throw lockError;
  if (!claimedOrder) throw httpError("This order is already being processed. Refresh the agent dashboard for its status.", 409);

  const receipt = await sendAgentOrderReceipt(admin, { ...order, status: "paid" });

  let delivery;
  try {
    delivery = await vtuService.deliverBundle({
      id: order.id,
      network: order.network,
      size: `${order.size_gb}GB`,
      phone: order.phone,
      priceGhs: Number(order.sale_price),
      bundleId: `${order.network}-${order.size_gb}gb`
    });
  } catch (providerError) {
    const status = providerError.providerRejected ? "delivery_failed" : "delivery_review";
    await admin.from("agent_orders").update({
      status,
      failure_message: providerError.message.slice(0, 400),
      failure_details: {
        rateLimit: providerError.rateLimit || null,
        ...(providerError.providerDetails || {})
      },
      updated_at: new Date().toISOString()
    }).eq("id", order.id);
    throw httpError(status === "delivery_failed"
      ? "Justice rejected the order. Contact support before retrying."
      : "Payment is confirmed, but delivery needs a manual status check. Contact support before retrying.", 502);
  }

  if (delivery.failed) {
    await admin.from("agent_orders").update({
      status: "delivery_failed",
      justice_reference: delivery.providerReference,
      provider_status: delivery.providerStatus,
      updated_at: new Date().toISOString()
    }).eq("id", order.id);
    throw httpError("Justice could not complete delivery. Contact support before retrying.", 502);
  }

  if (delivery.delivered) {
    const { error: creditError } = await admin.rpc("complete_agent_order", {
      p_order_id: order.id,
      p_agent_id: user.id,
      p_justice_reference: delivery.providerReference,
      p_provider_status: delivery.providerStatus
    });
    if (creditError) throw creditError;
  } else {
    const { error: updateError } = await admin.from("agent_orders").update({
      status: "paid_awaiting_delivery",
      justice_reference: delivery.providerReference,
      provider_status: delivery.providerStatus,
      updated_at: new Date().toISOString()
    }).eq("id", order.id);
    if (updateError) throw updateError;
  }

  const { data: updated, error: readError } = await admin.from("agent_orders").select("*").eq("id", order.id).single();
  if (readError) throw readError;
  res.json({ order: updated, receiptSent: receipt.sent });
}, "Could not confirm the agent order.");

module.exports = {
  getStatus,
  enroll,
  confirmMembership,
  login,
  retryMembership,
  getCatalog,
  getDashboard,
  savePrice,
  createOrder,
  confirmOrder
};
