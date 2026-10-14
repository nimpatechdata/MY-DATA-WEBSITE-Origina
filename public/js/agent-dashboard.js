const accessToken = sessionStorage.getItem("nimpatech-agent-token");
const dashboardMessage = document.getElementById("agent-dashboard-message");
const productGrid = document.getElementById("agent-product-grid");
const priceFormatter = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 });
const state = { catalog: [], orders: [], walletEntries: [], network: "mtn", selected: null };

function money(value) {
  return priceFormatter.format(Number(value || 0));
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "The request could not be completed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function showMessage(message, isError = true) {
  dashboardMessage.textContent = message;
  dashboardMessage.classList.toggle("is-success", !isError);
}

function displayStatus(status) {
  const labels = {
    awaiting_payment: "Awaiting payment",
    payment_failed: "Payment failed",
    paid: "Payment confirmed",
    paid_awaiting_delivery: "Awaiting delivery",
    delivered: "Delivered",
    delivery_failed: "Delivery failed",
    delivery_review: "Needs support"
  };
  return labels[status] || String(status || "Pending").replaceAll("_", " ");
}

function maskPhone(phone) {
  const value = String(phone || "");
  return value.length > 5 ? `${value.slice(0, 3)}••••${value.slice(-2)}` : "Customer";
}

function setView(name) {
  document.querySelectorAll(".agent-view-tabs button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === name);
  });
  document.querySelectorAll(".agent-view").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== name;
    panel.classList.toggle("is-active", panel.dataset.panel === name);
  });
}

function renderNetworkTabs() {
  const tabs = document.getElementById("agent-network-tabs");
  tabs.replaceChildren();
  const networks = [...new Set(state.catalog.map((item) => item.network))];
  networks.forEach((network) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = state.network === network ? "is-active" : "";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(state.network === network));
    button.textContent = network === "airteltigo" ? "AirtelTigo" : network[0].toUpperCase() + network.slice(1);
    button.addEventListener("click", () => {
      state.network = network;
      renderNetworkTabs();
      renderProducts();
    });
    tabs.appendChild(button);
  });
}

function renderProducts() {
  productGrid.replaceChildren();
  state.catalog.filter((item) => item.network === state.network).forEach((item) => {
    const card = document.createElement("article");
    card.className = "agent-product-card";
    const title = document.createElement("h3");
    title.textContent = `${item.size} data bundle`;
    const meta = document.createElement("p");
    meta.className = "agent-product-meta";
    meta.textContent = `${item.networkName} · ${item.validity}`;
    const base = document.createElement("p");
    base.className = "agent-base-price";
    base.append("Your base price: ");
    const baseValue = document.createElement("strong");
    baseValue.textContent = money(item.basePrice);
    base.appendChild(baseValue);
    const priceRow = document.createElement("div");
    priceRow.className = "agent-price-row";
    const input = document.createElement("input");
    input.type = "number";
    input.min = (Number(item.basePrice) + 0.01).toFixed(2);
    input.step = "0.01";
    input.value = Number(item.salePrice) > Number(item.basePrice) ? Number(item.salePrice).toFixed(2) : "";
    input.placeholder = "Set customer price";
    input.setAttribute("aria-label", `${item.networkName} ${item.size} customer price`);
    const save = document.createElement("button");
    save.type = "button";
    save.className = "agent-price-save";
    save.textContent = "Save price";
    const margin = document.createElement("p");
    margin.className = "agent-margin-preview";
    const sell = document.createElement("button");
    sell.type = "button";
    sell.className = "agent-sell-button";
    sell.textContent = "Create customer order";
    sell.disabled = !(Number(input.value) > Number(item.basePrice));

    const updatePreview = () => {
      const salePrice = Number(input.value);
      const valid = Number.isFinite(salePrice) && salePrice > Number(item.basePrice);
      margin.textContent = valid ? `Potential margin: ${money(salePrice - item.basePrice)} after delivery` : "Enter a price above base to sell";
      sell.disabled = !valid;
    };
    input.addEventListener("input", updatePreview);
    updatePreview();
    save.addEventListener("click", async () => {
      const salePrice = Number(input.value);
      if (!(salePrice > Number(item.basePrice))) return;
      save.disabled = true;
      try {
        const result = await apiRequest("/api/agents/prices", {
          method: "PUT",
          body: JSON.stringify({ network: item.network, sizeGb: item.sizeGb, salePrice })
        });
        item.salePrice = result.salePrice;
        showMessage(`${item.networkName} ${item.size} price saved.`, false);
      } catch (error) {
        showMessage(error.message);
      } finally {
        save.disabled = false;
      }
    });
    sell.addEventListener("click", () => {
      state.selected = { ...item, salePrice: Number(input.value) };
      openSaleDialog();
    });

    priceRow.append(input, save);
    card.append(title, meta, base, priceRow, margin, sell);
    productGrid.appendChild(card);
  });
}

function openSaleDialog() {
  const item = state.selected;
  if (!item) return;
  document.getElementById("sale-title").textContent = `${item.networkName} · ${item.size}`;
  document.getElementById("sale-base-price").textContent = money(item.basePrice);
  document.getElementById("sale-price").value = Number(item.salePrice).toFixed(2);
  document.getElementById("sale-price").min = (Number(item.basePrice) + 0.01).toFixed(2);
  updateSalePreview();
  document.getElementById("sale-error").textContent = "";
  document.getElementById("sale-dialog").showModal();
}

function updateSalePreview() {
  const salePrice = Number(document.getElementById("sale-price").value);
  const basePrice = Number(state.selected?.basePrice || 0);
  document.getElementById("sale-profit-preview").textContent = salePrice > basePrice ? money(salePrice - basePrice) : "Set a higher customer price";
}

function renderOrders() {
  const body = document.getElementById("agent-orders-body");
  body.replaceChildren();
  document.getElementById("agent-orders-empty").hidden = state.orders.length > 0;
  state.orders.forEach((order) => {
    const row = document.createElement("tr");
    const values = [
      `${String(order.id).slice(0, 8)}`,
      `${order.network.toUpperCase()} · ${order.size_gb}GB`,
      maskPhone(order.phone),
      money(order.sale_price),
      order.status === "delivered" ? money(order.profit_amount) : "—",
      displayStatus(order.status),
      new Date(order.created_at).toLocaleDateString("en-GH")
    ];
    values.forEach((value, index) => {
      const cell = document.createElement("td");
      if (index === 5) {
        const badge = document.createElement("span");
        badge.className = `agent-order-status ${order.status === "delivered" ? "agent-order-status--delivered" : ["delivery_failed", "payment_failed"].includes(order.status) ? "agent-order-status--failed" : ""}`;
        badge.textContent = value;
        cell.appendChild(badge);
      } else {
        cell.textContent = value;
      }
      row.appendChild(cell);
    });
    body.appendChild(row);
  });
}

function renderLedger() {
  const list = document.getElementById("agent-ledger-list");
  list.replaceChildren();
  document.getElementById("agent-ledger-empty").hidden = state.walletEntries.length > 0;
  state.walletEntries.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "agent-ledger-row";
    const description = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = entry.entry_type === "sale_profit" ? "Bundle sale profit" : entry.entry_type.replaceAll("_", " ");
    const date = document.createElement("span");
    date.textContent = `${entry.order_id ? `Order ${String(entry.order_id).slice(0, 8)} · ` : ""}${new Date(entry.created_at).toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" })}`;
    description.append(title, date);
    const amount = document.createElement("strong");
    amount.className = "agent-ledger-amount";
    amount.textContent = `+${money(entry.amount)}`;
    row.append(description, amount);
    list.appendChild(row);
  });
}

function renderDashboard(data) {
  document.getElementById("agent-name-display").textContent = data.profile.full_name;
  document.getElementById("agent-greeting").textContent = data.profile.full_name.split(" ")[0];
  document.getElementById("wallet-balance").textContent = money(data.profile.wallet_balance);
  state.catalog = data.catalog;
  state.orders = data.orders;
  state.walletEntries = data.walletEntries;
  const availableNetworks = [...new Set(state.catalog.map((item) => item.network))];
  if (!availableNetworks.includes(state.network)) state.network = availableNetworks[0] || "";
  const today = new Date();
  const todaysOrders = state.orders.filter((order) => {
    const created = new Date(order.created_at);
    return created.toDateString() === today.toDateString();
  });
  const paidStates = ["paid", "paid_awaiting_delivery", "delivered", "delivery_failed", "delivery_review"];
  const salesToday = todaysOrders.filter((order) => paidStates.includes(order.status));
  const profitToday = state.walletEntries.filter((entry) => entry.entry_type === "sale_profit" && new Date(entry.created_at).toDateString() === today.toDateString())
    .reduce((total, entry) => total + Number(entry.amount || 0), 0);
  document.getElementById("agent-orders-today").textContent = String(todaysOrders.length);
  document.getElementById("agent-sales-today").textContent = money(salesToday.reduce((total, order) => total + Number(order.sale_price || 0), 0));
  document.getElementById("agent-profit-today").textContent = money(profitToday);
  renderNetworkTabs();
  if (state.catalog.length) renderProducts();
  else productGrid.innerHTML = '<p class="agent-loading">No bundles are available right now.</p>';
  renderOrders();
  renderLedger();
}

document.getElementById("sale-price").addEventListener("input", updateSalePreview);
document.getElementById("sale-dialog-close").addEventListener("click", () => document.getElementById("sale-dialog").close());
document.getElementById("sale-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

document.getElementById("agent-sale-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = document.getElementById("sale-submit");
  const error = document.getElementById("sale-error");
  const salePrice = Number(document.getElementById("sale-price").value);
  if (!state.selected || salePrice <= state.selected.basePrice) {
    error.textContent = "Customer price must be above the base price.";
    return;
  }
  submit.disabled = true;
  submit.textContent = "Creating secure checkout…";
  error.textContent = "";
  try {
    const result = await apiRequest("/api/agents/orders", {
      method: "POST",
      body: JSON.stringify({
        network: state.selected.network,
        sizeGb: state.selected.sizeGb,
        salePrice,
        phone: document.getElementById("sale-phone").value,
        email: document.getElementById("sale-email").value
      })
    });
    window.location.assign(result.authorizationUrl);
  } catch (requestError) {
    error.textContent = requestError.message;
    submit.disabled = false;
    submit.textContent = "Continue to customer payment";
  }
});

document.querySelectorAll(".agent-view-tabs button").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

document.querySelector(".agent-dashboard-nav").addEventListener("click", (event) => {
  const link = event.target.closest("a");
  if (!link) return;
  const views = { "#agent-orders": "orders", "#agent-wallet": "transactions" };
  if (views[link.hash]) setView(views[link.hash]);
  else if (link.hash) setView("store");
});

document.getElementById("agent-signout").addEventListener("click", () => {
  sessionStorage.removeItem("nimpatech-agent-token");
  window.location.assign("/agents.html");
});

async function loadAgentDashboard() {
  if (!accessToken) {
    window.location.replace("/agents.html#login");
    return;
  }
  try {
    const data = await apiRequest("/api/agents/dashboard");
    renderDashboard(data);
  } catch (error) {
    showMessage(error.message);
    if (error.status === 401 || error.status === 403) {
      sessionStorage.removeItem("nimpatech-agent-token");
      window.location.replace("/agents.html#login");
    }
  }
}

loadAgentDashboard();