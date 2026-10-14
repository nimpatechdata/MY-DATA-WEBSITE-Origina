/**
 * Payment connector.
 *
 * Fill PAYSTACK_SECRET_KEY in .env to go live with Paystack.
 * Swap the fetch URLs if you later use Hubtel or Flutterwave.
 */

const crypto = require("node:crypto");

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYMENT_PROVIDER = process.env.PAYMENT_PROVIDER || "paystack";
const CALLBACK_URL =
  process.env.PAYMENT_CALLBACK_URL || "http://localhost:3000/success.html";

function isConfigured() {
  return Boolean(PAYSTACK_SECRET_KEY);
}

function verifyWebhookSignature(rawBody, signature) {
  if (
    !isConfigured() ||
    typeof rawBody !== "string" ||
    typeof signature !== "string" ||
    !/^[a-f\d]{128}$/i.test(signature)
  ) {
    return false;
  }

  const expected = crypto.createHmac("sha512", PAYSTACK_SECRET_KEY).update(rawBody).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

async function initializePayment(order) {
  if (!isConfigured()) {
    return {
      demo: true,
      provider: PAYMENT_PROVIDER,
      reference: order.id,
      authorizationUrl: `/success.html?orderId=${encodeURIComponent(order.id)}&demo=1`,
      message: "Payment keys are not set. Checkout is running in demo mode."
    };
  }

  const customerEmail = String(order.email || "").trim().toLowerCase() || "customer@example.com";

  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: customerEmail,
      amount: Math.round(order.priceGhs * 100),
      currency: "GHS",
      reference: order.id,
      callback_url:
        order.callbackUrl || `${CALLBACK_URL}?orderId=${encodeURIComponent(order.id)}`,
      metadata: {
        network: order.network,
        bundleId: order.bundleId,
        phone: order.phone,
        ...order.metadata
      }
    })
  });

  const payload = await response.json();

  if (!response.ok || !payload.status) {
    throw new Error(payload.message || "Could not start payment");
  }

  return {
    demo: false,
    provider: "paystack",
    reference: payload.data.reference,
    authorizationUrl: payload.data.authorization_url
  };
}

async function verifyPayment(reference, expectedReference, expectedAmountGhs) {
  const expectedAmount = Math.round(Number(expectedAmountGhs) * 100);
  if (
    typeof reference !== "string" ||
    !reference ||
    reference !== expectedReference ||
    !Number.isSafeInteger(expectedAmount) ||
    expectedAmount <= 0
  ) {
    return {
      demo: false,
      paid: false,
      reference,
      amount: null,
      currency: null,
      raw: null
    };
  }

  if (!isConfigured()) {
    return {
      demo: true,
      paid: false,
      reference,
      amount: null,
      currency: null,
      raw: null,
      message: "Payment cannot be confirmed because PAYSTACK_SECRET_KEY is not configured."
    };
  }

  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
      }
    }
  );

  const payload = await response.json();
  const data = payload.data;
  const paid = Boolean(
    response.ok &&
      payload.status === true &&
      data?.status === "success" &&
      data.reference === expectedReference &&
      data.amount === expectedAmount &&
      data.currency === "GHS"
  );

  return {
    demo: false,
    paid,
    reference: data?.reference || reference,
    amount: data?.amount ?? null,
    currency: data?.currency ?? null,
    raw: payload
  };
}

module.exports = {
  isConfigured,
  verifyWebhookSignature,
  initializePayment,
  verifyPayment
};
