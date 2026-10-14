const lookupForm = document.getElementById("order-lookup-form");
const lookupMessage = document.getElementById("order-lookup-message");
const lookupResult = document.getElementById("order-lookup-result");

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
    document.getElementById("lookup-network").textContent = result.networkName || result.network || "—";
    document.getElementById("lookup-bundle").textContent = `${result.size || "—"}${result.validity ? ` · ${result.validity}` : ""}`;
    document.getElementById("lookup-phone").textContent = result.phone || "—";
    document.getElementById("lookup-amount").textContent = `GHS ${Number(result.priceGhs || 0).toFixed(2)}`;
    document.getElementById("lookup-delivery-message").textContent = result.delivery?.message || "";
    lookupMessage.textContent = "";
    lookupResult.hidden = false;
  } catch (error) {
    lookupMessage.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});