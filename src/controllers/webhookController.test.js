const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { after, test } = require("node:test");

const originalSecret = process.env.PAYSTACK_SECRET_KEY;
process.env.PAYSTACK_SECRET_KEY = "sk_test_webhook_signature_only";

const paymentService = require("../services/paymentService");
const orders = require("../store/orders");
const checkoutController = require("./checkoutController");
const { handlePaymentWebhook } = require("./webhookController");

const originalLookup = orders.getOrderByPaymentReference;
const originalConfirmPayment = checkoutController.confirmPayment;

after(() => {
  orders.getOrderByPaymentReference = originalLookup;
  checkoutController.confirmPayment = originalConfirmPayment;
  if (originalSecret === undefined) delete process.env.PAYSTACK_SECRET_KEY;
  else process.env.PAYSTACK_SECRET_KEY = originalSecret;
});

function makeRequest(event, alterSignature = (signature) => signature) {
  const rawBody = JSON.stringify(event);
  const signature = crypto
    .createHmac("sha512", "sk_test_webhook_signature_only")
    .update(rawBody)
    .digest("hex");
  return {
    rawBody,
    get(name) {
      return name.toLowerCase() === "x-paystack-signature"
        ? alterSignature(signature)
        : undefined;
    }
  };
}

function makeResponse() {
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

test("rejects invalid Paystack signatures before looking up an order", async () => {
  let lookupCount = 0;
  orders.getOrderByPaymentReference = async () => {
    lookupCount += 1;
    return null;
  };

  const req = makeRequest(
    { event: "charge.success", data: { reference: "order-123" } },
    () => "0".repeat(128)
  );
  const res = makeResponse();
  await handlePaymentWebhook(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(lookupCount, 0);
});

test("routes a signed successful event through order confirmation", async () => {
  const order = { id: "order-123" };
  let confirmation;
  orders.getOrderByPaymentReference = async (reference) => {
    assert.equal(reference, order.id);
    return order;
  };
  checkoutController.confirmPayment = async (req, res) => {
    confirmation = req.body;
    return res.json({ confirmed: true });
  };

  const req = makeRequest({ event: "charge.success", data: { reference: order.id } });
  const res = makeResponse();
  await handlePaymentWebhook(req, res);

  assert.deepEqual(confirmation, { orderId: order.id, reference: order.id });
  assert.deepEqual(res.body, { confirmed: true });
  assert.equal(paymentService.verifyWebhookSignature(req.rawBody, req.get("x-paystack-signature")), true);
});

test("acknowledges unrelated Paystack event types without fulfillment", async () => {
  orders.getOrderByPaymentReference = async () => {
    throw new Error("Non-success events must not look up an order");
  };

  const req = makeRequest({ event: "charge.failed", data: { reference: "order-123" } });
  const res = makeResponse();
  await handlePaymentWebhook(req, res);

  assert.deepEqual(res.body, { received: true, processed: false });
});