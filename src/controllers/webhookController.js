const checkoutController = require("./checkoutController");
const paymentService = require("../services/paymentService");
const orders = require("../store/orders");
const crypto = require("crypto");

async function handlePaymentWebhook(req, res) {
  const rawBody = req.rawBody;
  const signature = req.get("x-paystack-signature");
  if (!paymentService.verifyWebhookSignature(rawBody, signature)) {
    return res.status(401).json({ error: "Invalid Paystack signature." });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: "Invalid Paystack event body." });
  }

  if (event.event !== "charge.success") {
    return res.json({ received: true, processed: false });
  }

  const reference = event.data?.reference;
  if (typeof reference !== "string" || !reference) {
    return res.json({ received: true, processed: false });
  }

  try {
    const order = await orders.getOrderByPaymentReference(reference);
    if (!order) return res.json({ received: true, processed: false });

    return checkoutController.confirmPayment(
      { body: { orderId: order.id, reference } },
      res
    );
  } catch (error) {
    console.error("Paystack webhook processing failed:", error.message);
    return res.status(503).json({ error: "Payment event processing is temporarily unavailable." });
  }
}

function verifyVtuWebhookSignature(rawBody, signature, body) {
  const secret = process.env.DATAMART_WEBHOOK_SECRET || process.env.VTU_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!rawBody || !signature) return false;

  const provided = String(signature).replace(/^sha256=/i, "");
  const providedBuffer = Buffer.from(provided, "utf8");
  const signedBodies = [rawBody];
  if (body && typeof body === "object") signedBodies.push(JSON.stringify(body));

  return signedBodies.some((signedBody) => {
    const expected = crypto.createHmac("sha256", secret).update(signedBody).digest("hex");
    const expectedBuffer = Buffer.from(expected, "utf8");
    return (
      expectedBuffer.length === providedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    );
  });
}

async function handleVtuWebhook(req, res) {
  const signature =
    req.get("x-datamart-signature") ||
    req.get("x-vtu-signature") ||
    req.get("x-webhook-signature");
  if (!verifyVtuWebhookSignature(req.rawBody, signature, req.body)) {
    return res.status(401).json({ error: "Invalid VTU webhook signature." });
  }

  const event = req.body || {};
  const data = event.data || {};
  const eventName = String(event.event || req.get("x-datamart-event") || "").toLowerCase();
  const providerStatus = String(data.status || eventName.split(".").pop() || "unknown").toUpperCase();
  const completed = providerStatus === "COMPLETED" || providerStatus === "SUCCESS";
  const failed = ["FAILED", "CANCELLED", "REJECTED"].includes(providerStatus);
  const references = [data.orderReference, data.transactionId, data.orderId]
    .filter((value) => typeof value === "string" && value);

  if (!references.length) {
    return res.status(400).json({ error: "Webhook is missing a provider order reference." });
  }

  try {
    const order = (await orders.listOrders()).find((candidate) => {
      const delivery = candidate.delivery || {};
      return [
        delivery.providerReference,
        delivery.providerOrderReference,
        delivery.providerTransactionReference
      ].some((reference) => references.includes(reference));
    });

    if (!order) return res.status(404).json({ received: true, matched: false });

    const nextStatus = completed
      ? "delivered"
      : failed
        ? "delivery_failed"
        : ["paid_awaiting_delivery", "delivery_review"].includes(order.status)
          ? order.status
          : order.status;
    const delivery = {
      ...(order.delivery || {}),
      provider: "datamart",
      providerReference: data.orderReference || order.delivery?.providerReference,
      providerOrderReference: data.orderReference || order.delivery?.providerOrderReference,
      providerTransactionReference: data.transactionId || order.delivery?.providerTransactionReference,
      providerStatus,
      delivered: completed,
      failed,
      webhookEvent: event.event || null,
      webhookUpdatedAt: event.timestamp || new Date().toISOString(),
      rawWebhook: event
    };

    const updated = await orders.updateOrder(order.id, {
      status: nextStatus,
      delivery
    });
    return res.json({ received: true, matched: true, orderId: updated.id, status: updated.status });
  } catch (error) {
    console.error("VTU webhook processing failed:", error.message);
    return res.status(503).json({ error: "VTU webhook processing is temporarily unavailable." });
  }
}

module.exports = { handlePaymentWebhook, handleVtuWebhook, verifyVtuWebhookSignature };
