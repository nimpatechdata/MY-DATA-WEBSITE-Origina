const supabase = require("../services/supabaseClient");

const TABLE = "storefront_orders";

function toRow(order) {
  const { id, status, payment, delivery, createdAt, updatedAt, ...details } = order;
  return {
    id,
    details,
    status,
    payment: payment ?? null,
    delivery: delivery ?? null,
    created_at: createdAt,
    updated_at: updatedAt
  };
}

function fromRow(row) {
  return {
    ...row.details,
    id: row.id,
    status: row.status,
    payment: row.payment,
    delivery: row.delivery,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function throwIfError(error) {
  if (error) throw error;
}

async function createOrder(order) {
  const { data, error } = await supabase
    .getAdminClient()
    .from(TABLE)
    .insert(toRow(order))
    .select("*")
    .single();
  throwIfError(error);
  return fromRow(data);
}

async function getOrder(id) {
  const { data, error } = await supabase
    .getAdminClient()
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwIfError(error);
  return data ? fromRow(data) : null;
}

async function getOrderByPaymentReference(reference) {
  const { data, error } = await supabase
    .getAdminClient()
    .from(TABLE)
    .select("*")
    .eq("payment->>reference", reference)
    .maybeSingle();
  throwIfError(error);
  return data ? fromRow(data) : null;
}

async function updateOrder(id, patch) {
  const existing = await getOrder(id);
  if (!existing) return null;
  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  const { data, error } = await supabase
    .getAdminClient()
    .from(TABLE)
    .update(toRow(updated))
    .eq("id", id)
    .select("*")
    .maybeSingle();
  throwIfError(error);
  return data ? fromRow(data) : null;
}

async function updateOrderIfStatus(id, expectedStatus, patch) {
  const existing = await getOrder(id);
  if (!existing || existing.status !== expectedStatus) return null;
  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  const { data, error } = await supabase
    .getAdminClient()
    .from(TABLE)
    .update(toRow(updated))
    .eq("id", id)
    .eq("status", expectedStatus)
    .select("*")
    .maybeSingle();
  throwIfError(error);
  return data ? fromRow(data) : null;
}

async function claimOrderForProcessing(id, payment) {
  const { data, error } = await supabase
    .getAdminClient()
    .from(TABLE)
    .update({
      status: "processing",
      payment: payment ?? null,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .eq("status", "awaiting_payment")
    .select("*")
    .maybeSingle();
  throwIfError(error);
  return data ? fromRow(data) : null;
}

async function listOrders() {
  const { data, error } = await supabase
    .getAdminClient()
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);
  throwIfError(error);
  return (data || []).map(fromRow);
}

module.exports = {
  createOrder,
  getOrder,
  getOrderByPaymentReference,
  updateOrder,
  updateOrderIfStatus,
  claimOrderForProcessing,
  listOrders
};
