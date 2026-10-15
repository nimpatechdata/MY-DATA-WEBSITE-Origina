const state = {
  catalog: null,
  network: "mtn",
  bundleId: null
};
const requestedNetwork = new URLSearchParams(window.location.search).get("network");

const networkBox = document.getElementById("network-choices");
const bundleBox = document.getElementById("bundle-choices");
const errorEl = document.getElementById("error");
const phoneInput = document.getElementById("phone");

function selectedBundle() {
  if (!state.catalog) return null;
  return (state.catalog.bundles[state.network] || []).find(
    (item) => item.id === state.bundleId
  );
}

function renderSummary() {
  const bundle = selectedBundle();
  const network = state.catalog.networks.find((item) => item.id === state.network);
  document.getElementById("sum-network").textContent = network ? network.name : "—";
  document.getElementById("sum-bundle").textContent = bundle ? bundle.size : "—";
  document.getElementById("sum-validity").textContent = bundle ? bundle.validity : "—";
  document.getElementById("sum-phone").textContent = phoneInput.value || "—";
  document.getElementById("sum-total").textContent = bundle ? `GHS ${bundle.priceGhs}` : "GHS 0";
  document.getElementById("selected-bundle-label").textContent = bundle
    ? `${network?.name || "Network"} · ${bundle.size} · GHS ${bundle.priceGhs}`
    : "Choose a bundle above";
}

function renderNetworks() {
  networkBox.innerHTML = "";
  state.catalog.networks.forEach((network) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `choice ${network.id} ${state.network === network.id ? "active" : ""}`;
    button.innerHTML = `<strong>${network.name}</strong><small>${network.prefixes.join(", ")}</small>`;
    button.addEventListener("click", () => {
      state.network = network.id;
      state.bundleId = state.catalog.bundles[network.id][0].id;
      renderNetworks();
      renderBundles();
      renderSummary();
    });
    networkBox.appendChild(button);
  });
}

function renderBundles() {
  bundleBox.innerHTML = "";
  state.catalog.bundles[state.network].forEach((bundle) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `bundle ${state.bundleId === bundle.id ? "active" : ""}`;
    button.innerHTML = `<strong>${bundle.size}</strong><small>GHS ${bundle.priceGhs} · ${bundle.validity}</small>`;
    button.addEventListener("click", () => {
      state.bundleId = bundle.id;
      renderBundles();
      renderSummary();
    });
    bundleBox.appendChild(button);
  });
}

async function loadCatalog() {
  const response = await fetch("/api/catalog");
  state.catalog = await response.json();
  if (requestedNetwork && state.catalog.bundles[requestedNetwork]) {
    state.network = requestedNetwork;
  }
  state.bundleId = state.catalog.bundles[state.network][0].id;
  renderNetworks();
  renderBundles();
  renderSummary();
}

phoneInput.addEventListener("input", renderSummary);

document.getElementById("checkout-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.textContent = "";
  const payBtn = document.getElementById("pay-btn");
  payBtn.disabled = true;
  payBtn.textContent = "Starting payment...";

  try {
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        network: state.network,
        bundleId: state.bundleId,
        phone: phoneInput.value,
        email: document.getElementById("email").value
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Checkout failed");
    }
    window.location.href = data.payment.authorizationUrl;
  } catch (error) {
    errorEl.textContent = error.message;
    payBtn.disabled = false;
    payBtn.textContent = "Continue to payment";
  }
});

loadCatalog().catch(() => {
  errorEl.textContent = "Could not load bundles. Start the server with npm start.";
});
