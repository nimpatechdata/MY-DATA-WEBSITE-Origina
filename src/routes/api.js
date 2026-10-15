const express = require("express");
const checkoutController = require("../controllers/checkoutController");
const agentController = require("../controllers/agentController");
const webhookController = require("../controllers/webhookController");

const router = express.Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "nimpatech-data-bundles" });
});

router.get("/catalog", (_req, res) => {
  res.json(checkoutController.catalog());
});

router.post("/checkout", checkoutController.createCheckout);
router.get("/orders/:id", checkoutController.getOrder);
router.post("/payments/confirm", checkoutController.confirmPayment);

router.post("/agents/enroll", agentController.enroll);
router.get("/agents/status", agentController.getStatus);
router.post("/agents/membership/confirm", agentController.confirmMembership);
router.post("/agents/login", agentController.login);
router.post("/agents/membership/retry", agentController.retryMembership);
router.get("/agents/catalog", agentController.getCatalog);
router.get("/agents/dashboard", agentController.getDashboard);
router.put("/agents/prices", agentController.savePrice);
router.post("/agents/orders", agentController.createOrder);
router.post("/agents/orders/confirm", agentController.confirmOrder);

router.post("/webhooks/payment", webhookController.handlePaymentWebhook);

router.post("/webhooks/vtu", webhookController.handleVtuWebhook);

module.exports = router;
