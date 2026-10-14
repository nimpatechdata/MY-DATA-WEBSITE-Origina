const assert = require("node:assert/strict");
const { after, test } = require("node:test");

const originalSecret = process.env.PAYSTACK_SECRET_KEY;
const originalFetch = global.fetch;
process.env.PAYSTACK_SECRET_KEY = "test-secret";

const { verifyPayment } = require("./paymentService");

after(() => {
  global.fetch = originalFetch;
  if (originalSecret === undefined) delete process.env.PAYSTACK_SECRET_KEY;
  else process.env.PAYSTACK_SECRET_KEY = originalSecret;
});

function paystackResponse(data, ok = true) {
  return {
    ok,
    json: async () => ({ status: true, data })
  };
}

test("accepts only a successful exact-reference GHS payment", async () => {
  global.fetch = async (url) => {
    assert.equal(url, "https://api.paystack.co/transaction/verify/order-123");
    return paystackResponse({
      reference: "order-123",
      status: "success",
      amount: 1250,
      currency: "GHS"
    });
  };

  const result = await verifyPayment("order-123", "order-123", 12.5);
  assert.equal(result.paid, true);
});

test("rejects a reference that does not match the stored order", async () => {
  global.fetch = async () => {
    throw new Error("Paystack must not be called for a mismatched reference");
  };

  const result = await verifyPayment("other-order", "order-123", 12.5);
  assert.equal(result.paid, false);
});

test("rejects mismatched reference, amount, or currency from Paystack", async (context) => {
  const mismatches = [
    { reference: "other-order", status: "success", amount: 1250, currency: "GHS" },
    { reference: "order-123", status: "success", amount: 1249, currency: "GHS" },
    { reference: "order-123", status: "success", amount: 1250, currency: "USD" }
  ];

  for (const data of mismatches) {
    await context.test(JSON.stringify(data), async () => {
      global.fetch = async () => paystackResponse(data);
      const result = await verifyPayment("order-123", "order-123", 12.5);
      assert.equal(result.paid, false);
    });
  }
});

test("rejects a successful transaction response with an HTTP error", async () => {
  global.fetch = async () => paystackResponse({
    reference: "order-123",
    status: "success",
    amount: 1250,
    currency: "GHS"
  }, false);

  const result = await verifyPayment("order-123", "order-123", 12.5);
  assert.equal(result.paid, false);
});