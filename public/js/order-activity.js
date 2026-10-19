const lookupForm = document.getElementById("order-lookup-form");
const lookupMessage = document.getElementById("order-lookup-message");
const lookupResult = document.getElementById("order-lookup-result");
let refreshTimer = null;
function deliveryTime(order) {
  const started = new Date(order.delivery?.startedAt || order.createdAt || order.updatedAt).getTime();
  const finished = order.delivery?.deliveredAt ? new Date(order.delivery.deliveredAt).getTime() : Date.now();
  if (!Number.isFinite(started)) return "—";
  const seconds = Math.max(0, Math.floor((finished - started) / 1000));
  return order.status === "delivered" ? `Delivered in ${Math.floor(seconds / 60)}m ${seconds % 60}s` : `In progress · ${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
function renderTrackedOrder(order) {
  document.getElementById("lookup-status").textContent = statusLabels[order.status] || "Processing";
  const initialNetwork = document.getElementById("lookup-network");
  initialNetwork.textContent = order.networkName || order.network || "—";
  initialNetwork.dataset.network = order.network || "";
  document.getElementById("lookup-bundle").textContent = `${order.size || "—"}${order.validity ? ` · ${order.validity}` : ""}`;
  document.getElementById("lookup-phone").textContent = order.phone || "—";
  document.getElementById("lookup-amount").textContent = `GHS ${Number(order.priceGhs || 0).toFixed(2)}`;
  document.getElementById("lookup-delivery-time").textContent = deliveryTime(order);
  document.getElementById("lookup-delivery-message").textContent = order.delivery?.message || "";
}

const statusLabels = {
  awaiting_payment: "Awaiting payment",
  payment_failed: "Payment not confirmed",
  processing: "Preparing delivery",
  paid: "Payment received",
  paid_awaiting_delivery: "Awaiting delivery",
  delivered: "Delivered",
  delivery_failed: "Delivery needs support",
  delivery_review: "Delivery being reviewed"
};

lookupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  lookupResult.hidden = true;
  lookupMessage.textContent = "Looking up your order…";
  const button = lookupForm.querySelector("button[type='submit']");
  button.disabled = true;

  try {
    const reference = new FormData(lookupForm).get("reference").trim();
    const response = await fetch(`/api/orders/${encodeURIComponent(reference)}`, {
      headers: { Accept: "application/json" }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(response.status === 404 ? "We couldn't find that order reference." : result.error || "Order status is temporarily unavailable.");
    }

    document.getElementById("lookup-status").textContent = statusLabels[result.status] || "Processing";
    const networkLabel = document.getElementById("lookup-network");
    networkLabel.textContent = result.networkName || result.network || "—";
    networkLabel.dataset.network = result.network || "";
    document.getElementById("lookup-bundle").textContent = `${result.size || "—"}${result.validity ? ` · ${result.validity}` : ""}`;
    document.getElementById("lookup-phone").textContent = result.phone || "—";
    document.getElementById("lookup-amount").textContent = `GHS ${Number(result.priceGhs || 0).toFixed(2)}`;
    document.getElementById("lookup-delivery-message").textContent = result.delivery?.message || "";
    lookupMessage.textContent = "";
    lookupResult.hidden = false;
    renderTrackedOrder(result);
    clearInterval(refreshTimer);
    refreshTimer = setInterval(async () => {
      const latestResponse = await fetch(`/api/orders/${encodeURIComponent(reference)}`, { headers: { Accept: "application/json" } });
      if (latestResponse.ok) renderTrackedOrder(await latestResponse.json());
    }, 15_000);
  } catch (error) {
    lookupMessage.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
