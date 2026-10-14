const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { after, test } = require("node:test");

const supabase = require("../services/supabaseClient");
const paymentService = require("../services/paymentService");
const receiptService = require("../services/receiptService");
const vtuService = require("../services/vtuService");

const rows = new Map();
const originalGetAdminClient = supabase.getAdminClient;
const originalVerifyPayment = paymentService.verifyPayment;
const originalSendReceipt = receiptService.sendReceipt;
const originalDeliverBundle = vtuService.deliverBundle;

function createQueryBuilder() {
  let action = "select";
  let values;
  let filters = [];
  let orderBy;
  let rowLimit;

  async function execute() {
    if (action === "insert") {
      if (rows.has(values.id)) return { data: null, error: new Error("Duplicate order") };
      rows.set(values.id, values);
      return { data: values, error: null };
    }

    let matching = [...rows.values()].filter((row) =>
      filters.every(([key, value]) => row[key] === value)
    );
    if (action === "update") {
      matching = matching.map((row) => {
        const updated = { ...row, ...values };
        rows.set(row.id, updated);
        return updated;
      });
    }
    if (orderBy) {
      matching.sort((left, right) =>
        orderBy.ascending
          ? left[orderBy.column].localeCompare(right[orderBy.column])
          : right[orderBy.column].localeCompare(left[orderBy.column])
      );
    }
    if (rowLimit !== undefined) matching = matching.slice(0, rowLimit);
    return { data: matching, error: null };
  }

  const builder = {
    insert(value) {
      action = "insert";
      values = value;
      return builder;
    },
    update(value) {
      action = "update";
      values = value;
      return builder;
    },
    select() {
      return builder;
    },
    eq(key, value) {
      filters.push([key, value]);
      return builder;
    },
    order(column, options) {
      orderBy = { column, ...options };
      return builder;
    },
    limit(value) {
      rowLimit = value;
      return builder;
    },
    async single() {
      const result = await execute();
      return { ...result, data: Array.isArray(result.data) ? result.data[0] ?? null : result.data };
    },
    async maybeSingle() {
      const result = await execute();
      return { ...result, data: Array.isArray(result.data) ? result.data[0] ?? null : result.data };
    },
    then(resolve, reject) {
      return execute().then(resolve, reject);
    }
  };
  return builder;
}

supabase.getAdminClient = () => ({
  from(table) {
    assert.equal(table, "storefront_orders");
    return createQueryBuilder();
  }
});

const orders = require("../store/orders");
const { confirmPayment, getOrder } = require("./checkoutController");

after(() => {
  supabase.getAdminClient = originalGetAdminClient;
  paymentService.verifyPayment = originalVerifyPayment;
  receiptService.sendReceipt = originalSendReceipt;
  vtuService.deliverBundle = originalDeliverBundle;
});

test("concurrent payment confirmations fulfill once and persist order state", async () => {
  const id = `order-${crypto.randomUUID()}`;
  await orders.createOrder({
    id,
    priceGhs: 12.5,
    status: "awaiting_payment",
    payment: { reference: id },
    delivery: null,
    receipt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  let deliveryCount = 0;
  paymentService.verifyPayment = async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { paid: true, reference: id };
  };
  receiptService.sendReceipt = async () => ({ sent: true });
  vtuService.deliverBundle = async () => {
    deliveryCount += 1;
    return { delivered: true, provider: "test" };
  };

  function response() {
    return {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      }
    };
  }

  const responses = [response(), response()];
  await Promise.all(responses.map((res) => confirmPayment({ body: { orderId: id, reference: id } }, res)));

  delete require.cache[require.resolve("../store/orders")];
  const reloadedOrders = require("../store/orders");
  const persistedOrder = await reloadedOrders.getOrder(id);
  assert.equal(deliveryCount, 1);
  assert.equal(persistedOrder.status, "delivered");
  assert.equal(responses[0].statusCode, 200);
  assert.equal(responses[1].statusCode, 200);
});

test("persists paid orders for manual recovery after supplier failure", async () => {
  const id = `order-${crypto.randomUUID()}`;
  await orders.createOrder({
    id,
    priceGhs: 12.5,
    status: "awaiting_payment",
    payment: { reference: id },
    delivery: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  let deliveryCount = 0;
  paymentService.verifyPayment = async () => ({ paid: true, reference: id });
  receiptService.sendReceipt = async () => ({ sent: true });
  vtuService.deliverBundle = async () => {
    deliveryCount += 1;
    throw new Error("Supplier response was interrupted");
  };

  function response() {
    return {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      }
    };
  }

  const failedResponse = response();
  await confirmPayment({ body: { orderId: id, reference: id } }, failedResponse);

  delete require.cache[require.resolve("../store/orders")];
  const reloadedOrders = require("../store/orders");
  const persistedOrder = await reloadedOrders.getOrder(id);
  assert.equal(persistedOrder.status, "delivery_review");
  assert.equal(persistedOrder.payment.reference, id);
  assert.match(persistedOrder.delivery.message, /needs a status check/);

  const retryResponse = response();
  await confirmPayment({ body: { orderId: id, reference: id } }, retryResponse);
  assert.equal(deliveryCount, 1);
  assert.equal(retryResponse.body.status, "delivery_review");
});

test("order lookup exposes only customer-safe details for its private reference", async () => {
  const id = `ord_${crypto.randomBytes(32).toString("hex")}`;
  await orders.createOrder({
    id,
    network: "mtn",
    networkName: "MTN",
    size: "1GB",
    validity: "30 days",
    priceGhs: 5,
    phone: "0241234567",
    email: "customer@example.com",
    status: "awaiting_payment",
    payment: { reference: id, raw: { authorization_code: "must-not-leak" } },
    delivery: { providerReference: "supplier-private-reference", raw: { secret: "must-not-leak" } },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  await getOrder({ params: { id } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.id, id);
  assert.equal(res.body.phone, "0241234567");
  assert.equal("payment" in res.body, false);
  assert.equal(JSON.stringify(res.body).includes("must-not-leak"), false);
  assert.equal(JSON.stringify(res.body).includes("supplier-private-reference"), false);
});