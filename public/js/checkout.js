const state = {
  catalog: null,
  network: "mtn",
  bundleId: null
};
const requestedNetwork = new URLSearchParams(window.location.search).get("network");
const requestedBundle = new URLSearchParams(window.location.search).get("bundle");

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
  const summaryNetwork = document.getElementById("sum-network");
  summaryNetwork.textContent = network ? network.name : "—";
  summaryNetwork.dataset.network = network?.id || "";
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
    button.className = `choice ${network.id} network-${network.id} ${state.network === network.id ? "active" : ""}`;
    button.dataset.network = network.id;
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

function renderOldBundles() {
  const network = state.catalog.networks.find((item) => item.id === state.network);
  const recipientDetails = document.querySelector(".recipient-details");
  const heading = document.getElementById("bundle-heading");
  heading.textContent = `2. ${network?.name || "Selected network"} bundles`;
  heading.className = `bundle-heading network-${state.network}`;
  heading.dataset.network = state.network;
  bundleBox.innerHTML = "";
  state.catalog.bundles[state.network].forEach((bundle) => {
    const option = document.createElement("div");
    option.className = `bundle-option ${state.bundleId === bundle.id ? "selected" : ""}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `bundle ${state.bundleId === bundle.id ? "active" : ""}`;
    button.innerHTML = `<strong>${bundle.size}</strong><small>GHS ${bundle.priceGhs} · ${bundle.validity}</small>`;
    button.addEventListener("click", () => {
      state.bundleId = bundle.id;
      renderBundles();
      renderSummary();
    });
    option.appendChild(button);
    if (state.bundleId === bundle.id) option.appendChild(recipientDetails);
    bundleBox.appendChild(option);
  });
}

function renderAllBundles() {
  const recipientDetails = document.querySelector(".recipient-details");
  const heading = document.getElementById("bundle-heading");
  heading.textContent = "2. Choose a bundle by network";
  heading.className = "bundle-heading";
  heading.removeAttribute("data-network");
  bundleBox.innerHTML = "";
  const networks = [...state.catalog.networks].sort((a, b) => a.id === state.network ? -1 : b.id === state.network ? 1 : 0);

  networks.forEach((network) => {
    const group = document.createElement("section");
    group.className = `bundle-network-group bundle-network-group--${network.id} ${network.id === state.network ? "is-selected" : ""}`;
    group.innerHTML = `<div class="bundle-network-heading"><h3>${network.name} bundles</h3><span>${network.id === state.network ? "Selected network" : `Choose ${network.name}`}</span></div>`;
    const choices = document.createElement("div");
    choices.className = "choices bundle-network-choices";
    (state.catalog.bundles[network.id] || []).forEach((bundle) => {
      const option = document.createElement("div");
      option.className = `bundle-option ${state.bundleId === bundle.id ? "selected" : ""}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `bundle ${state.bundleId === bundle.id ? "active" : ""}`;
      button.innerHTML = `<strong>${bundle.size}</strong><small>GHS ${bundle.priceGhs} · ${bundle.validity}</small>`;
      button.addEventListener("click", () => {
        state.network = network.id;
        state.bundleId = bundle.id;
        renderNetworks();
        renderBundles();
        renderSummary();
      });
      option.appendChild(button);
      if (state.bundleId === bundle.id) option.appendChild(recipientDetails);
      choices.appendChild(option);
    });
    group.appendChild(choices);
    bundleBox.appendChild(group);
  });
}

function renderBundles() {
  const recipientDetails = document.querySelector(".recipient-details");
  const heading = document.getElementById("bundle-heading");
  heading.textContent = "2. Choose a bundle";
  heading.className = "bundle-heading";
  heading.removeAttribute("data-network");
  bundleBox.innerHTML = "";

  const columns = document.createElement("div");
  columns.className = "network-bundle-columns";
  state.catalog.networks.forEach((network) => {
    const column = document.createElement("section");
    column.className = `network-bundle-column network-bundle-column--${network.id} ${network.id === state.network ? "is-selected" : ""}`;
    column.innerHTML = `<div class="network-bundle-column__heading"><h3>${network.name}</h3><span>${network.id === state.network ? "Selected" : "Available"}</span></div>`;

    if (true) {
      const choices = document.createElement("div");
      choices.className = "choices network-bundle-column__choices";
      (state.catalog.bundles[network.id] || []).forEach((bundle) => {
        const option = document.createElement("div");
        option.className = `bundle-option ${state.bundleId === bundle.id ? "selected" : ""}`;
        const button = document.createElement("button");
        button.type = "button";
        button.className = `bundle ${state.bundleId === bundle.id ? "active" : ""}`;
        button.innerHTML = `<strong>${bundle.size}</strong><small>GHS ${bundle.priceGhs} · ${bundle.validity}</small>`;
        button.addEventListener("click", () => {
          state.network = network.id;
          state.bundleId = bundle.id;
          renderBundles();
          renderSummary();
        });
        option.appendChild(button);
        if (state.bundleId === bundle.id) option.appendChild(recipientDetails);
        choices.appendChild(option);
      });
      column.appendChild(choices);
    } else {
      column.insertAdjacentHTML("beforeend", `<p class="network-bundle-column__hint">Select ${network.name} above to view bundles here.</p>`);
    }
    columns.appendChild(column);
  });
  bundleBox.appendChild(columns);
}

async function loadCatalog() {
  const response = await fetch("/api/catalog");
  state.catalog = await response.json();
  if (requestedNetwork && state.catalog.bundles[requestedNetwork]) {
    state.network = requestedNetwork;
  }
  const availableBundles = state.catalog.bundles[state.network] || [];
  state.bundleId = availableBundles.some((bundle) => bundle.id === requestedBundle)
    ? requestedBundle
    : availableBundles[0]?.id;
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
