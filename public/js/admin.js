const trackingScript = document.createElement("script"); trackingScript.src = "/js/tracking-dashboard.js"; document.head.appendChild(trackingScript);
const contentScript = document.createElement("script"); contentScript.src = "/js/admin-content.js"; document.head.appendChild(contentScript);
const loginPanel = document.getElementById("login-panel");
const dashboard = document.getElementById("dashboard");
const loginError = document.getElementById("login-error");
const dashboardError = document.getElementById("dashboard-error");
const logout = document.getElementById("logout");
const statusLabels = { awaiting_payment: "Attempted · unpaid", payment_failed: "Payment failed", processing: "Processing", paid_awaiting_delivery: "Awaiting delivery", delivered: "Delivered", delivery_failed: "Delivery failed", delivery_review: "Needs review", demo_pending: "Demo" };

function showDashboard() { loginPanel.hidden = true; dashboard.hidden = false; logout.hidden = false; if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); loadOrders(); loadPrices(); loadSiteSettings().catch((error) => { document.getElementById("settings-error").textContent = error.message; }); }
async function loadOrders() {
  dashboardError.textContent = "Loading…";
  const response = await fetch("/api/admin/activity");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load orders.");
  document.getElementById("admin-stats").innerHTML = Object.entries(data.summary).map(([key, value]) => `<article><span>${statusLabels[key] || key}</span><strong>${value}</strong></article>`).join("");
  document.getElementById("orders-body").innerHTML = data.orders.map((order) => `<tr><td>${new Date(order.createdAt).toLocaleString("en-GH")}</td><td>${order.phone}<small>${order.email || "No email"}</small></td><td>${order.network} · ${order.size}</td><td>GHS ${Number(order.priceGhs || 0).toFixed(2)}</td><td>${order.paymentPaid ? "Paid" : "Not paid"}</td><td><span class="status-pill ${order.status}">${statusLabels[order.status] || order.status}</span><small>${order.deliveryStatus || "—"}</small></td><td><code>${order.id.slice(0, 14)}…</code></td></tr>`).join("");
  dashboardError.textContent = "";
}
document.getElementById("login-form").addEventListener("submit", async (event) => { event.preventDefault(); loginError.textContent = ""; const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: document.getElementById("admin-email").value, password: document.getElementById("admin-password").value }) }); const data = await response.json(); if (!response.ok) { loginError.textContent = data.error || "Login failed."; return; } showDashboard(); });
document.getElementById("refresh").addEventListener("click", () => loadOrders().catch((error) => { dashboardError.textContent = error.message; }));
logout.addEventListener("click", async () => { await fetch("/api/admin/logout", { method: "POST" }); window.location.reload(); });

async function loadPrices() { const response = await fetch("/api/admin/prices"); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load prices."); document.getElementById("price-grid").innerHTML = data.prices.map((item) => `<form class="price-editor" data-bundle="${item.id}"><strong>${item.network.toUpperCase()} · ${item.size}</strong><label>Customer price<input name="customerPriceGhs" type="number" min="0.01" step="0.01" value="${Number(item.customerPriceGhs ?? item.priceGhs).toFixed(2)}"></label><label>Reseller minimum<input name="resellerMinPriceGhs" type="number" min="0.01" step="0.01" value="${Number(item.resellerMinPriceGhs ?? item.priceGhs).toFixed(2)}"></label><button class="btn btn-ghost" type="submit">Save</button><small class="price-message"></small></form>`).join(""); document.querySelectorAll(".price-editor").forEach((form) => form.addEventListener("submit", async (event) => { event.preventDefault(); const message = form.querySelector(".price-message"); const response = await fetch("/api/admin/prices", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bundleId: form.dataset.bundle, customerPriceGhs: form.elements.customerPriceGhs.value, resellerMinPriceGhs: form.elements.resellerMinPriceGhs.value }) }); const result = await response.json(); message.textContent = response.ok ? "Saved" : result.error || "Failed"; })); }
document.getElementById("refresh-prices").addEventListener("click", () => loadPrices().catch((error) => { document.getElementById("price-error").textContent = error.message; }));
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character])); }
function formatDate(value) { return value ? new Date(value).toLocaleString("en-GH") : "—"; }
function etaText(order) {
  if (order.deliveredAt) return `Delivered ${formatDate(order.deliveredAt)}`;
  if (order.estimatedDeliveryAt) {
    const remaining = Math.max(0, Math.ceil((new Date(order.estimatedDeliveryAt).getTime() - Date.now()) / 60000));
    return remaining ? `Estimated in ${remaining} min` : "Expected shortly";
  }
  return order.estimatedMinutes ? `Estimated in about ${order.estimatedMinutes} min` : "Estimate unavailable";
}
function notifyDelivered(order) {
  const message = `Order ${order.orderReference} was delivered${order.deliveredAt ? ` at ${formatDate(order.deliveredAt)}` : ""}.`;
  dashboardError.textContent = message;
  if ("Notification" in window && Notification.permission === "granted") new Notification("Data bundle delivered", { body: message });
}
let previousDelivered = new Set();
let firstOrderLoad = true;
async function loadOrders() {
  dashboardError.textContent = "Loading...";
  const response = await fetch("/api/admin/activity");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load orders.");
  document.getElementById("admin-stats").innerHTML = Object.entries(data.summary).map(([key, value]) => `<article><span>${escapeHtml(statusLabels[key] || key)}</span><strong>${value}</strong></article>`).join("");
  document.getElementById("orders-body").innerHTML = data.orders.map((order) => `<tr><td>${formatDate(order.createdAt)}</td><td>${escapeHtml(order.phone)}<small>${escapeHtml(order.email || "No email")}</small></td><td>${escapeHtml(order.network)} · ${escapeHtml(order.size)}</td><td>GHS ${Number(order.priceGhs || 0).toFixed(2)}</td><td>${order.paymentPaid ? "Paid" : "Not paid"}</td><td><span class="status-pill ${escapeHtml(order.status)}">${escapeHtml(statusLabels[order.status] || order.status)}</span><small>${escapeHtml(order.deliveryStatus || "—")}</small><small>${escapeHtml(etaText(order))}</small></td><td><code>${escapeHtml(order.orderReference)}</code>${order.providerOrderReference ? `<small>Datamart: ${escapeHtml(order.providerOrderReference)}</small>` : ""}${order.providerTransactionReference ? `<small>Transaction: ${escapeHtml(order.providerTransactionReference)}</small>` : ""}</td></tr>`).join("");
  const deliveredNow = new Set(data.orders.filter((order) => order.delivered).map((order) => order.id));
  if (!firstOrderLoad) data.orders.filter((order) => order.delivered && !previousDelivered.has(order.id)).forEach(notifyDelivered);
  previousDelivered = deliveredNow;
  firstOrderLoad = false;
  if (!dashboardError.textContent.startsWith("Order ")) dashboardError.textContent = "";
}
document.getElementById("password-form").addEventListener("submit", async (event) => { event.preventDefault(); const message = document.getElementById("password-error"); const newPassword = document.getElementById("new-password").value; if (newPassword !== document.getElementById("confirm-password").value) { message.textContent = "New passwords do not match."; return; } const response = await fetch("/api/admin/password", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: document.getElementById("current-password").value, newPassword }) }); const result = await response.json(); message.textContent = response.ok ? "Password updated successfully." : result.error || "Could not update password."; if (response.ok) event.target.reset(); });
setInterval(() => { if (!dashboard.hidden) loadOrders().catch((error) => { dashboardError.textContent = error.message; }); }, 30000);

// Apply the same MTN/Telecel/AirtelTigo identity to dynamically loaded admin rows.
const colorizeAdminNetworks = () => document.querySelectorAll("#orders-body td, .price-editor strong").forEach((element) => {
  const value = element.textContent.trim().toLowerCase();
  const network = value.includes("airteltigo") ? "airteltigo" : value.includes("telecel") ? "telecel" : value.startsWith("mtn") ? "mtn" : "";
  if (network) element.classList.add(`network-${network}`);
});
new MutationObserver(colorizeAdminNetworks).observe(document.body, { childList: true, subtree: true });
colorizeAdminNetworks();
const forgotPanel = document.getElementById("forgot-panel");
const resetPanel = document.getElementById("reset-panel");
const resetToken = new URLSearchParams(window.location.search).get("reset");
function showAuthPanel(panel) { loginPanel.hidden = panel !== loginPanel; forgotPanel.hidden = panel !== forgotPanel; resetPanel.hidden = panel !== resetPanel; }
document.getElementById("show-forgot").addEventListener("click", () => { document.getElementById("forgot-email").value = document.getElementById("admin-email").value; showAuthPanel(forgotPanel); });
document.getElementById("show-login").addEventListener("click", () => showAuthPanel(loginPanel));
document.getElementById("forgot-form").addEventListener("submit", async (event) => { event.preventDefault(); const message = document.getElementById("forgot-error"); message.textContent = "Sending..."; const response = await fetch("/api/admin/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: document.getElementById("forgot-email").value }) }); const result = await response.json(); message.textContent = response.ok ? result.message : result.error || "Could not send reset link."; });
document.getElementById("reset-form").addEventListener("submit", async (event) => { event.preventDefault(); const message = document.getElementById("reset-error"); const newPassword = document.getElementById("reset-password").value; if (newPassword !== document.getElementById("reset-confirm-password").value) { message.textContent = "Passwords do not match."; return; } const response = await fetch("/api/admin/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: resetToken, newPassword }) }); const result = await response.json(); if (!response.ok) { message.textContent = result.error || "Could not reset password."; return; } showAuthPanel(loginPanel); showDashboard(); });
if (resetToken) showAuthPanel(resetPanel);

let activeOrderFilter = "all";
function applyOrderFilter() {
  document.querySelectorAll("#orders-body tr").forEach((row) => {
    const status = row.querySelector(".status-pill")?.className || "";
    const isDelivered = status.includes("delivered");
    const isFailed = status.includes("failed");
    const isPending = status.includes("processing") || status.includes("paid_awaiting_delivery") || status.includes("delivery_review");
    row.hidden = activeOrderFilter === "delivered" ? !isDelivered : activeOrderFilter === "failed" ? !isFailed : activeOrderFilter === "pending" ? !isPending : false;
  });
}
const orderFilterPanel = document.createElement("div");
orderFilterPanel.className = "panel status-filter-panel";
orderFilterPanel.innerHTML = '<div class="admin-table-tools"><h2>Order views</h2><span class="lead">Filter attempts by delivery status.</span></div><div class="admin-filter-buttons"><button class="btn btn-ghost active" data-order-filter="all" type="button">All attempts</button><button class="btn btn-ghost" data-order-filter="delivered" type="button">Delivered</button><button class="btn btn-ghost" data-order-filter="pending" type="button">Pending delivery</button><button class="btn btn-ghost" data-order-filter="failed" type="button">Failed</button></div>';
dashboard.insertBefore(orderFilterPanel, dashboard.querySelector(".admin-table-panel"));
orderFilterPanel.querySelectorAll("[data-order-filter]").forEach((button) => button.addEventListener("click", () => { activeOrderFilter = button.dataset.orderFilter; orderFilterPanel.querySelectorAll("[data-order-filter]").forEach((item) => item.classList.toggle("active", item === button)); applyOrderFilter(); }));
new MutationObserver(applyOrderFilter).observe(document.getElementById("orders-body"), { childList: true });

const settingsPanel = document.createElement("div");
settingsPanel.className = "panel site-settings-panel";
settingsPanel.innerHTML = '<h2>Site interface settings</h2><p class="lead">Update the public brand, support contact, and global theme.</p><form id="site-settings-form"><label>Site name<input name="siteName" maxlength="80" required></label><label>Tagline<input name="siteTagline" maxlength="160"></label><label>Homepage description<textarea name="siteDescription" maxlength="300" rows="3"></textarea></label><label>Support phone<input name="supportPhone" inputmode="tel" maxlength="15" required></label><label>WhatsApp number<input name="whatsappNumber" inputmode="tel" maxlength="15" required></label><label>Global theme<select name="theme"><option value="yellow">Yellow + dark blue</option><option value="darkblue">Dark blue</option><option value="white">White</option><option value="black">Black</option></select></label><p class="error" id="settings-error"></p><button class="primary" type="submit">Save interface settings</button></form>';
dashboard.appendChild(settingsPanel);
async function loadSiteSettings() { const response = await fetch("/api/admin/settings"); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load site settings."); const form = document.getElementById("site-settings-form"); Object.entries(data).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value; }); }
loadSiteSettings().catch((error) => { document.getElementById("settings-error").textContent = error.message; });
document.getElementById("site-settings-form").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.target; const response = await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) }); const data = await response.json(); document.getElementById("settings-error").textContent = response.ok ? "Interface settings saved." : data.error || "Could not save settings."; });
