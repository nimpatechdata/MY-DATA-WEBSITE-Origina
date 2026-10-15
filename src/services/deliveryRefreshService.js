const orders = require("../store/orders");
const vtuService = require("./vtuService");

const INTERVAL_MS = Math.max(
  15_000,
  Number.parseInt(process.env.DELIVERY_REFRESH_INTERVAL_MS || "60000", 10)
);
const MAX_CHECKS_PER_RUN = Math.max(
  1,
  Number.parseInt(process.env.DATAMART_MAX_STATUS_CHECKS_PER_RUN || "140", 10)
);

let running = false;

async function refreshPendingDeliveries() {
  if (running || !vtuService.isConfigured()) return;
  running = true;

  try {
    const allOrders = await orders.listOrders();
    const pending = allOrders.filter(
      (order) =>
        ["paid_awaiting_delivery", "delivery_review"].includes(order.status) &&
        order.delivery?.providerReference
    );

    for (const [index, order] of pending.entries()) {
      if (index >= MAX_CHECKS_PER_RUN) {
        console.warn(`Datamart refresh paused after ${MAX_CHECKS_PER_RUN} checks to protect the rate limit.`);
        break;
      }
      try {
        const delivery = await vtuService.getDeliveryStatus(
          order.delivery.providerReference
        );
        if (!delivery) continue;

        const status = delivery.delivered
          ? "delivered"
          : delivery.failed
            ? "delivery_failed"
            : order.status;

        if (
          status !== order.status ||
          delivery.providerStatus !== order.delivery.providerStatus
        ) {
          await orders.updateOrder(order.id, {
            status,
            delivery: { ...order.delivery, ...delivery }
          });
          console.log(`Delivery status refreshed: ${order.id} -> ${status}`);
        }

        if (delivery.rateLimit?.remaining !== undefined && delivery.rateLimit.remaining <= 1) {
          console.warn(
            `Datamart rate limit nearly exhausted; next reset in ${delivery.rateLimit.resetInSeconds ?? "unknown"} seconds.`
          );
          break;
        }
      } catch (error) {
        console.error(`Delivery status refresh failed for ${order.id}:`, error.message);
      }
    }
  } catch (error) {
    console.error("Delivery refresh worker failed:", error.message);
  } finally {
    running = false;
  }
}

function startDeliveryRefresh() {
  if (String(process.env.VTU_PROVIDER || "justice").toLowerCase() !== "datamart") {
    return null;
  }

  if (!process.env.DATAMART_STATUS_URL) {
    console.warn("Datamart status refresh disabled: set DATAMART_STATUS_URL.");
    return null;
  }

  const timer = setInterval(refreshPendingDeliveries, INTERVAL_MS);
  timer.unref?.();
  refreshPendingDeliveries();
  console.log(`Datamart status refresh enabled every ${INTERVAL_MS}ms.`);
  return timer;
}

module.exports = { startDeliveryRefresh, refreshPendingDeliveries };
