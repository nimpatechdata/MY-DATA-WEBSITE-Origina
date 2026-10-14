const query = new URLSearchParams(window.location.search);
const orderId = query.get("orderId");
const reference = query.get("reference");
const token = sessionStorage.getItem("nimpatech-agent-token");
const title = document.getElementById("agent-order-result-title");
const message = document.getElementById("agent-order-result-message");

async function confirmOrder() {
  if (!token) throw new Error("Your agent session is missing. Sign in to check this paid order.");
  if (!orderId || !reference) throw new Error("The order reference is incomplete.");
  const response = await fetch("/api/agents/orders/confirm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ orderId, reference })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The order could not be confirmed.");
  title.textContent = result.order.status === "delivered" ? "Bundle delivered" : "Payment confirmed";
  message.textContent = result.order.status === "delivered"
    ? `Justice confirmed delivery. Your margin has been added to your wallet.${result.receiptSent ? " A separate NImpatech receipt was emailed to the customer." : " The receipt email could not be sent; check SMTP settings."}`
    : `The bundle is being processed. Your margin is credited after delivery is confirmed.${result.receiptSent ? " A separate NImpatech receipt was emailed to the customer." : " The receipt email could not be sent; check SMTP settings."}`;
}

confirmOrder().catch((error) => {
  title.textContent = "Order needs attention";
  message.textContent = `${error.message} Do not charge the customer again; contact support with the order reference.`;
});