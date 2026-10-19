const customerSessionKey = "nimpatech-customer-session";
const signinPanel = document.getElementById("signin-panel");
const signupPanel = document.getElementById("signup-panel");
const signedInPanel = document.getElementById("signed-in-panel");
const signinTab = document.getElementById("signin-tab");
const signupTab = document.getElementById("signup-tab");

function getCustomerSession() {
  try { return JSON.parse(localStorage.getItem(customerSessionKey) || "null"); } catch { return null; }
}

function setMessage(id, message, success = false) {
  const element = document.getElementById(id);
  element.textContent = message;
  element.classList.toggle("is-success", success);
}

function showTab(tab) {
  const signin = tab === "signin";
  signinPanel.hidden = !signin;
  signupPanel.hidden = signin;
  signinTab.classList.toggle("is-active", signin);
  signupTab.classList.toggle("is-active", !signin);
  signinTab.setAttribute("aria-selected", String(signin));
  signupTab.setAttribute("aria-selected", String(!signin));
}

function showSignedIn(user) {
  document.querySelector(".account-tabs").hidden = true;
  signinPanel.hidden = true;
  signupPanel.hidden = true;
  signedInPanel.hidden = false;
  document.getElementById("signed-in-name").textContent = `Welcome, ${user.name}`;
  document.getElementById("signed-in-email").textContent = user.email;
  loadCustomerOrders();
}

let customerOrders = [];
function customerDeliveryTime(order) {
  const started = new Date(order.delivery?.startedAt || order.createdAt || order.updatedAt).getTime();
  const finished = order.delivery?.deliveredAt ? new Date(order.delivery.deliveredAt).getTime() : Date.now();
  if (!Number.isFinite(started)) return "—";
  const seconds = Math.max(0, Math.floor((finished - started) / 1000));
  return order.status === "delivered" ? `Delivered in ${Math.floor(seconds / 60)}m ${seconds % 60}s` : `In progress · ${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
function renderCustomerOrders() {
  const target = document.getElementById("customer-orders-list");
  target.innerHTML = customerOrders.length ? customerOrders.map((order) => `<article class="customer-order"><div><strong>${order.size || "Data bundle"} · ${order.network || "Network"}</strong><small>${order.phone || ""} · ${new Date(order.createdAt).toLocaleString()}</small></div><span class="customer-order-status ${order.status}">${order.status === "delivered" ? "Delivered" : order.status === "delivery_failed" ? "Needs support" : "Processing"}</span><strong class="customer-order-time">${customerDeliveryTime(order)}</strong><code>${String(order.reference).slice(0, 18)}…</code></article>`).join("") : '<p class="account-message">No orders are linked to this account yet.</p>';
}
async function loadCustomerOrders() {
  const session = getCustomerSession();
  if (!session?.accessToken) return;
  const response = await fetch("/api/customers/orders", { headers: { Authorization: `Bearer ${session.accessToken}`, Accept: "application/json" } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { document.getElementById("customer-orders-message").textContent = result.error || "Could not load your orders."; return; }
  customerOrders = result.orders || [];
  renderCustomerOrders();
}

async function submitAccountForm(event, endpoint, messageId) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  setMessage(messageId, "Working...");
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not complete this request.");
    localStorage.setItem(customerSessionKey, JSON.stringify(result));
    showSignedIn(result.user);
  } catch (error) {
    setMessage(messageId, error.message);
  } finally {
    submit.disabled = false;
  }
}

signinTab.addEventListener("click", () => showTab("signin"));
signupTab.addEventListener("click", () => showTab("signup"));
document.getElementById("signin-form").addEventListener("submit", (event) => submitAccountForm(event, "/api/customers/login", "signin-message"));
document.getElementById("signup-form").addEventListener("submit", (event) => submitAccountForm(event, "/api/customers/signup", "signup-message"));
document.getElementById("signout-button").addEventListener("click", () => { localStorage.removeItem(customerSessionKey); window.location.reload(); });

const existingSession = getCustomerSession();
if (existingSession?.user) showSignedIn(existingSession.user);
else if (window.location.hash === "#signup") showTab("signup");
setInterval(() => { if (!signedInPanel.hidden) { renderCustomerOrders(); loadCustomerOrders().catch(() => {}); } }, 15_000);
setInterval(() => { if (!signedInPanel.hidden && customerOrders.length) renderCustomerOrders(); }, 1_000);
