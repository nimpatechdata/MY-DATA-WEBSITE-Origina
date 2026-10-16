const crypto = require("crypto");
const bundles = require("../config/bundles");
const catalogService = require("../services/catalogService");
const networks = require("../config/networks");
const orders = require("../store/orders");
const paymentService = require("../services/paymentService");
const vtuService = require("../services/vtuService");
const receiptService = require("../services/receiptService");
const {
  normalizeGhanaNumber,
  isValidGhanaMobile,
  phoneMatchesNetwork
} = require("../utils/phone");

async function catalog() {
  const currentBundles = await catalogService.getBundles();
  return {
    networks: Object.values(networks).map(({ id, name, color, prefixes }) => ({
      id,
      name,
      color,
      prefixes
    })),
    bundles: Object.fromEntries(Object.entries(currentBundles).map(([network, items]) => [network, items.map(({ id, size, validity, priceGhs }) => ({ id, size, validity, priceGhs }))]))
  };
}

function publicOrder(order) {
  if (!order) return null;
  return {
    id: order.id,
    status: order.status,
    network: order.network,
    networkName: order.networkName,
    size: order.size,
    validity: order.validity,
    priceGhs: order.priceGhs,
    phone: order.phone,
    email: order.email,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    receipt: order.receipt
      ? { sent: Boolean(order.receipt.sent), status: order.receipt.status }
      : null,
    delivery: order.delivery
      ? {
          provider: order.delivery.provider,
          providerStatus: order.delivery.providerStatus,
          delivered: Boolean(order.delivery.delivered),
          failed: Boolean(order.delivery.failed),
          message: order.delivery.message
        }
      : null
  };
}

async function createCheckout(req, res) {
  try {
    const { network, bundleId, phone, email } = req.body || {};

    if (!networks[network]) {
      return res.status(400).json({ error: "Choose MTN, Telecel, or AirtelTigo." });
    }

    const currentBundles = await catalogService.getBundles();
    const bundle = (currentBundles[network] || []).find((item) => item.id === bundleId);
    if (!bundle) {
      return res.status(400).json({ error: "Choose a valid bundle size." });
    }

    const normalizedPhone = normalizeGhanaNumber(phone);
    if (!isValidGhanaMobile(normalizedPhone)) {
      return res.status(400).json({
        error: "Enter a valid Ghana mobile number, for example 0241234567."
      });
    }

    if (!phoneMatchesNetwork(normalizedPhone, network)) {
      return res.status(400).json({
        error: `That number does not look like a ${networks[network].name} line.`
      });
    }

    const receiptEmail = String(email || "").trim().toLowerCase();
    if (receiptEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receiptEmail)) {
      return res.status(400).json({ error: "Enter a valid email address so we can send your receipt." });
    }

    const order = await orders.createOrder({
      id: `ord_${crypto.randomBytes(32).toString("hex")}`,
      network,
      networkName: networks[network].name,
      bundleId: bundle.id,
      size: bundle.size,
      validity: bundle.validity,
      priceGhs: bundle.priceGhs,
      phone: normalizedPhone,
      email: receiptEmail || null,
      status: "awaiting_payment",
      payment: null,
      delivery: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const payment = await paymentService.initializePayment(order);
    await orders.updateOrder(order.id, {
      payment,
      status: payment.demo ? "demo_pending" : "awaiting_payment"
    });

    return res.status(201).json({
      orderId: order.id,
      amount: bundle.priceGhs,
      currency: "GHS",
      phone: normalizedPhone,
      network: networks[network].name,
      bundle: bundle.size,
      payment
    });
  } catch (error) {
    console.error("Checkout failed:", error.message);
    return res.status(500).json({ error: "Checkout failed. Please try again." });
  }
}

async function getOrder(req, res) {
  try {
    let order = await orders.getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    if (
      order.status === "paid_awaiting_delivery" &&
      order.delivery?.providerReference &&
      vtuService.isConfigured()
    ) {
      try {
        const deliveryStatus = await vtuService.getDeliveryStatus(
          order.delivery.providerReference
        );
        if (deliveryStatus) {
          const nextStatus = deliveryStatus.delivered
            ? "delivered"
            : deliveryStatus.failed
              ? "delivery_failed"
              : order.status;
          if (
            nextStatus !== order.status ||
            deliveryStatus.providerStatus !== order.delivery.providerStatus
          ) {
            order = await orders.updateOrder(order.id, {
              status: nextStatus,
              delivery: {
                ...order.delivery,
                ...deliveryStatus,
                deliveredAt: deliveryStatus.delivered
                  ? (order.delivery.deliveredAt || new Date().toISOString())
                  : order.delivery.deliveredAt || null
              }
            });
          }
        }
      } catch {
        return res.status(502).json({
          error: "Could not refresh delivery status from Justice.",
          order: publicOrder(order)
        });
      }
    }

    return res.json(publicOrder(order));
  } catch (error) {
    console.error("Order lookup failed:", error.message);
    return res.status(503).json({ error: "Order status is temporarily unavailable." });
  }
}

async function confirmPayment(req, res) {
  try {
    const { orderId, reference } = req.body || {};
    const order = await orders.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }
    if (order.status !== "awaiting_payment") {
      return res.json(publicOrder(order));
    }

    const expectedReference = order.payment?.reference || order.id;
    const verification = await paymentService.verifyPayment(
      reference || expectedReference,
      expectedReference,
      order.priceGhs
    );
    if (!verification.paid) {
      const failedOrder = await orders.updateOrderIfStatus(order.id, "awaiting_payment", {
        status: "payment_failed",
        payment: verification
      });
      if (!failedOrder) return res.json(publicOrder(await orders.getOrder(order.id)));
      return res.status(402).json({ error: "Payment was not successful." });
    }

    let updatedOrder = await orders.claimOrderForProcessing(order.id, verification);
    if (!updatedOrder) return res.json(publicOrder(await orders.getOrder(order.id)));

    if (!updatedOrder.receipt?.sent) {
      let receipt;
      try {
        receipt = await receiptService.sendReceipt({
          ...updatedOrder,
          paymentReference: verification.reference || reference || order.id
        });
      } catch (error) {
        console.error("Receipt email delivery failed:", error.message);
        receipt = { sent: false, status: "failed" };
      }
      updatedOrder = await orders.updateOrder(order.id, {
        receipt: { ...receipt, attemptedAt: new Date().toISOString() }
      });
    }

    let delivery;
    try {
      delivery = await vtuService.deliverBundle(updatedOrder);
    } catch (error) {
      const providerRejected = Boolean(error.providerRejected);
      updatedOrder = await orders.updateOrder(order.id, {
        status: providerRejected ? "delivery_failed" : "delivery_review",
        delivery: {
          provider: process.env.VTU_PROVIDER || "vtu",
          delivered: false,
          failed: providerRejected,
          message: providerRejected
            ? error.message || "The data provider rejected delivery. Contact support before retrying."
            : "Payment is confirmed, but data delivery needs a status check. Contact support before retrying.",
          estimatedMinutes: Number(process.env.DATAMART_DELIVERY_ESTIMATE_MINUTES || 5),
          estimatedDeliveryAt: null,
          rateLimit: error.rateLimit || null,
          providerDetails: error.providerDetails || null
        }
      });
      return res.json(publicOrder(updatedOrder));
    }
    const nextStatus = delivery.delivered
      ? "delivered"
      : delivery.failed
        ? "delivery_failed"
        : "paid_awaiting_delivery";
    const estimatedMinutes = Number(process.env.DATAMART_DELIVERY_ESTIMATE_MINUTES || 5);
    const deliveryWithEstimate = {
      ...delivery,
      estimatedMinutes: Number.isFinite(estimatedMinutes) && estimatedMinutes > 0 ? estimatedMinutes : 5,
      estimatedDeliveryAt: delivery.delivered
        ? null
        : new Date(Date.now() + (Number.isFinite(estimatedMinutes) && estimatedMinutes > 0 ? estimatedMinutes : 5) * 60 * 1000).toISOString(),
      deliveredAt: delivery.delivered ? new Date().toISOString() : null
    };
    updatedOrder = await orders.updateOrder(order.id, {
      status: nextStatus,
      delivery: deliveryWithEstimate
    });

    return res.json(publicOrder(updatedOrder));
  } catch (error) {
    console.error("Payment confirmation failed:", error.message);
    return res.status(500).json({ error: "Could not confirm payment." });
  }
}

module.exports = {
  catalog,
  createCheckout,
  getOrder,
  confirmPayment
};
