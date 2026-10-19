const express = require("express");
const checkoutController = require("../controllers/checkoutController");
const agentController = require("../controllers/agentController");
const webhookController = require("../controllers/webhookController");
const adminController = require("../controllers/adminController");
const customerController = require("../controllers/customerController");
const trackingController = require("../controllers/trackingController");
const siteUpdatesController = require("../controllers/siteUpdatesController");
const analyticsController = require("../controllers/analyticsController");
const blogController = require("../controllers/blogController");

const router = express.Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "nimpatech-data-bundles" });
});

router.get("/catalog", async (_req, res) => {
  res.json(await checkoutController.catalog());
});
router.get("/site-settings", adminController.siteSettings);
router.get("/site-updates", siteUpdatesController.getSiteUpdates);
router.post("/analytics/visit", analyticsController.recordVisit);
router.get("/blog", blogController.listPublished);

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

router.post("/customers/signup", customerController.signup);
router.post("/customers/login", customerController.login);
router.get("/customers/me", customerController.me);
router.get("/customers/orders", customerController.listOrders);

router.post("/webhooks/payment", webhookController.handlePaymentWebhook);

router.post("/webhooks/vtu", webhookController.handleVtuWebhook);

router.post("/admin/login", adminController.login);
router.post("/admin/forgot-password", adminController.forgotPassword);
router.post("/admin/reset-password", adminController.resetPassword);
router.post("/admin/logout", adminController.logout);
router.get("/admin/activity", adminController.requireAdmin, adminController.list);
router.get("/admin/tracking", adminController.requireAdmin, trackingController.getTracking);
router.get("/admin/prices", adminController.requireAdmin, adminController.prices);
router.put("/admin/prices", adminController.requireAdmin, adminController.updatePrice);
router.put("/admin/password", adminController.requireAdmin, adminController.changePassword);
router.get("/admin/settings", adminController.requireAdmin, adminController.siteSettings);
router.put("/admin/settings", adminController.requireAdmin, adminController.updateSiteSettings);
router.get("/admin/analytics", adminController.requireAdmin, analyticsController.getAnalytics);
router.get("/admin/blog", adminController.requireAdmin, blogController.listAdmin);
router.post("/admin/blog", adminController.requireAdmin, blogController.create);
router.put("/admin/blog/:id", adminController.requireAdmin, blogController.update);
router.delete("/admin/blog/:id", adminController.requireAdmin, blogController.remove);

module.exports = router;
