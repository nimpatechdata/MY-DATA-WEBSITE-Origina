const loginPanel = document.getElementById("login-panel");
const dashboard = document.getElementById("dashboard");
const loginError = document.getElementById("login-error");
const dashboardError = document.getElementById("dashboard-error");
const logout = document.getElementById("logout");
const statusLabels = { awaiting_payment: "Attempted · unpaid", payment_failed: "Payment failed", processing: "Processing", paid_awaiting_delivery: "Awaiting delivery", delivered: "Delivered", delivery_failed: "Delivery failed", delivery_review: "Needs review", demo_pending: "Demo" };

function showDashboard() { loginPanel.hidden = true; dashboard.hidden = false; logout.hidden = false; loadOrders(); }
async function loadOrders() {
  dashboardError.textContent = "Loading…";
  const response = await fetch("/api/admin/activity");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load orders.");
  document.getElementById("admin-stats").innerHTML = Object.entries(data.summary).map(([key, value]) => `<article><span>${statusLabels[key] || key}</span><strong>${value}</strong></article>`).join("");
  document.getElementById("orders-body").innerHTML = data.orders.map((order) => `<tr><td>${new Date(order.createdAt).toLocaleString("en-GH")}</td><td>${order.phone}<small>${order.email || "No email"}</small></td><td>${order.network} · ${order.size}</td><td>GHS ${Number(order.priceGhs || 0).toFixed(2)}</td><td>${order.paymentPaid ? "Paid" : "Not paid"}</td><td><span class="status-pill ${order.status}">${statusLabels[order.status] || order.status}</span><small>${order.deliveryStatus || "—"}</small></td><td><code>${order.id.slice(0, 14)}…</code></td></tr>`).join("");
  dashboardError.textContent = "";
}
document.getElementById("login-form").addEventListener("submit", async (event) => { event.preventDefault(); loginError.textContent = ""; const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: document.getElementById("admin-token").value }) }); const data = await response.json(); if (!response.ok) { loginError.textContent = data.error || "Login failed."; return; } showDashboard(); });
document.getElementById("refresh").addEventListener("click", () => loadOrders().catch((error) => { dashboardError.textContent = error.message; }));
logout.addEventListener("click", async () => { await fetch("/api/admin/logout", { method: "POST" }); window.location.reload(); });
