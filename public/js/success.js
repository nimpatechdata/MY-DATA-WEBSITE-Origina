const params = new URLSearchParams(window.location.search);
const orderId = params.get("orderId");
const demo = params.get("demo");
const reference = params.get("reference") || params.get("trxref") || orderId;
let latestOrder = null;
function renderDeliveryTime(order) {
  latestOrder = order;
  const started = new Date(order.delivery?.startedAt || order.createdAt || order.updatedAt).getTime();
  const finished = order.delivery?.deliveredAt ? new Date(order.delivery.deliveredAt).getTime() : Date.now();
  const element = document.getElementById("delivery-time");
  if (!element || !Number.isFinite(started)) return;
  const seconds = Math.max(0, Math.floor((finished - started) / 1000));
  element.textContent = order.status === "delivered" ? `Delivered in ${Math.floor(seconds / 60)}m ${seconds % 60}s` : `In progress · ${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

async function run() {
  if (!orderId) {
    document.getElementById("title").textContent = "No order found";
    document.getElementById("message").textContent =
      "Open checkout and complete a purchase first.";
    return;
  }

  document.getElementById("order-id").textContent = orderId;
  const printButton = document.getElementById("print-receipt");
  printButton.addEventListener("click", () => window.print());

  const confirmResponse = await fetch("/api/payments/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId, reference })
  });

  const order = await confirmResponse.json();
  if (!confirmResponse.ok) {
    document.getElementById("title").textContent = "Payment not confirmed";
    document.getElementById("message").textContent = order.error || "Try the checkout again.";
    return;
  }

  document.getElementById("status").textContent = order.status;
  printButton.hidden = false;
  const receiptStatus = document.getElementById("receipt-status");
  if (order.receipt?.sent) {
    receiptStatus.textContent = `Emailed to ${order.email}`;
  } else if (!order.email || order.receipt?.status === "email_missing") {
    receiptStatus.textContent = "No email provided · print this receipt";
  } else if (order.receipt?.status === "not_configured") {
    receiptStatus.textContent = "Email delivery is not configured";
  } else if (order.receipt?.status === "failed") {
    receiptStatus.textContent = "Email failed; contact support with the reference";
  } else {
    receiptStatus.textContent = "Not sent";
  }
  const networkLabel = document.getElementById("network");
  networkLabel.textContent = order.networkName;
  networkLabel.dataset.network = order.network;
  document.getElementById("bundle").textContent = `${order.size} · GHS ${order.priceGhs}`;
  document.getElementById("phone").textContent = order.phone;
  document.getElementById("eta").textContent = order.delivery?.estimatedDeliveryAt 
    ? new Date(order.delivery.estimatedDeliveryAt).toLocaleTimeString("en-GH", { hour: '2-digit', minute: '2-digit' }) 
    : "Processing...";
  renderDeliveryTime(order);
  setInterval(async () => {
    const latestResponse = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { headers: { Accept: "application/json" } });
    if (latestResponse.ok) renderDeliveryTime(await latestResponse.json());
  }, 15_000);

  if (order.status === "delivered") {
    document.getElementById("title").textContent = "Data sent";
    document.getElementById("message").textContent = `The ${order.size} bundle is on its way to ${order.phone}. ${order.receipt?.sent ? "Your NImpatech receipt is in your email." : "Your payment is confirmed."}`;
    return;
  }

  document.getElementById("title").textContent = demo ? "Demo order created" : ["delivery_failed", "delivery_review"].includes(order.status) ? "Payment received · delivery needs support" : "Payment received";
  const deliveryMessage = order.delivery?.message || "Your bundle is still being processed.";
  const receiptMessage = order.receipt?.sent
    ? `A separate receipt was emailed to ${order.email}.`
    : !order.email
      ? "No email was provided. Print this page to keep your receipt."
      : "The payment is confirmed, but an email receipt could not be sent. Keep your order reference for support.";
  document.getElementById("message").textContent = `${deliveryMessage} ${receiptMessage}`;
}

run().catch(() => {
  document.getElementById("title").textContent = "Something went wrong";
  document.getElementById("message").textContent = "Refresh this page or start a new checkout.";
});
