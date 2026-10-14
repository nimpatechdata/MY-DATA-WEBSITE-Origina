const checkoutController = require("./checkoutController");
const paymentService = require("../services/paymentService");
const orders = require("../store/orders");

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

module.exports = { handlePaymentWebhook };