(() => {
  const dashboard = document.getElementById("dashboard");
  if (!dashboard) return;
  const panel = document.createElement("section");
  panel.className = "panel tracking-panel";
  panel.innerHTML = `<div class="admin-table-tools"><div><h2>All-time Datamart tracking</h2><p class="lead">Live delivery statistics from the secure server proxy. Delivery time updates every 45 seconds.</p></div><span class="tracking-updated" id="tracking-updated">Not loaded</span></div><div class="tracking-metrics" id="tracking-metrics"><article><span>Total tracked orders</span><strong>—</strong></article><article><span>Successful deliveries</span><strong>—</strong></article><article><span>Pending processing</span><strong>—</strong></article><article><span>Failed deliveries</span><strong>—</strong></article></div><div class="tracking-error" id="tracking-error" role="alert" hidden></div><div class="admin-table-wrap"><table class="admin-table tracking-table"><thead><tr><th>Reference</th><th>Status</th><th>Current delivery time</th><th>Date &amp; time</th><th>Network</th><th>Recipient</th><th>Bundle</th></tr></thead><tbody id="tracking-body"><tr><td colspan="7">Tracking data will appear after loading.</td></tr></tbody></table></div>`;
  dashboard.prepend(panel);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const formatDate = (value) => value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
  const formatDeliveryTime = (item) => {
    const started = item.timestamp ? new Date(item.timestamp).getTime() : NaN;
    const finished = item.completedAt ? new Date(item.completedAt).getTime() : NaN;
    const seconds = Number(item.deliveryTimeSeconds);
    const elapsedSeconds = Number.isFinite(seconds) && seconds >= 0 ? seconds : Number.isFinite(started) ? Math.max(0, ((Number.isFinite(finished) ? finished : Date.now()) - started) / 1000) : NaN;
    if (!Number.isFinite(elapsedSeconds)) return "—";
    const minutes = Math.floor(elapsedSeconds / 60);
    const remainingSeconds = Math.floor(elapsedSeconds % 60);
    const duration = minutes ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
    return item.status === "pending" ? `In progress · ${duration}` : `${item.status === "success" ? "Delivered" : "Finished"} in ${duration}`;
  };
  const metrics = document.getElementById("tracking-metrics");
  const body = document.getElementById("tracking-body");
  const error = document.getElementById("tracking-error");
  const updated = document.getElementById("tracking-updated");
  let trackingItems = [];
  const renderItems = () => {
    body.innerHTML = trackingItems.length ? trackingItems.map((item) => `<tr><td><code>${escapeHtml(item.reference)}</code></td><td><span class="tracking-badge ${escapeHtml(item.status)}">${escapeHtml(item.statusLabel)}</span></td><td><strong class="tracking-duration ${escapeHtml(item.status)}">${escapeHtml(formatDeliveryTime(item))}</strong></td><td>${escapeHtml(formatDate(item.timestamp))}</td><td>${escapeHtml(item.network || "—")}</td><td>${escapeHtml(item.phone || "—")}</td><td>${escapeHtml(item.size || "—")}</td></tr>`).join("") : '<tr><td colspan="7">No tracking records were returned.</td></tr>';
  };
  async function loadTracking() {
    error.hidden = true;
    updated.textContent = "Refreshing…";
    try {
      const response = await fetch("/api/admin/tracking", { headers: { Accept: "application/json" } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load tracking data.");
      const summary = data.metrics || {};
      metrics.innerHTML = [["Total tracked orders", summary.total], ["Successful deliveries", summary.successful], ["Pending processing", summary.pending], ["Failed deliveries", summary.failed]].map(([label, value]) => `<article><span>${label}</span><strong>${Number(value || 0).toLocaleString()}</strong></article>`).join("");
      body.innerHTML = (data.items || []).length ? data.items.map((item) => `<tr><td><code>${escapeHtml(item.reference)}</code></td><td><span class="tracking-badge ${escapeHtml(item.status)}">${escapeHtml(item.statusLabel)}</span></td><td><strong class="tracking-duration ${escapeHtml(item.status)}">${escapeHtml(formatDeliveryTime(item))}</strong></td><td>${escapeHtml(formatDate(item.timestamp))}</td><td>${escapeHtml(item.network || "—")}</td><td>${escapeHtml(item.phone || "—")}</td><td>${escapeHtml(item.size || "—")}</td></tr>`).join("") : '<tr><td colspan="7">No tracking records were returned.</td></tr>';
      trackingItems = data.items || [];
      renderItems();
      updated.textContent = `Updated ${formatDate(data.refreshedAt)}`;
    } catch (loadError) { error.textContent = loadError.message; error.hidden = false; updated.textContent = "Update failed"; }
  }
  const observer = new MutationObserver(() => { if (!dashboard.hidden && !panel.dataset.loaded) { panel.dataset.loaded = "true"; loadTracking(); } });
  observer.observe(dashboard, { attributes: true, attributeFilter: ["hidden"] });
  if (!dashboard.hidden) { panel.dataset.loaded = "true"; loadTracking(); }
  setInterval(() => { if (!dashboard.hidden && trackingItems.some((item) => item.status === "pending")) renderItems(); }, 1_000);
  setInterval(() => { if (!dashboard.hidden) loadTracking(); }, 45_000);
})();

// Keep provider network labels visually consistent even when the API returns them dynamically.
const colorizeTrackingNetworks = () => document.querySelectorAll(".tracking-table td").forEach((cell) => {
  const value = cell.textContent.trim().toLowerCase();
  const network = value.includes("airteltigo") ? "airteltigo" : value.includes("telecel") ? "telecel" : value === "mtn" ? "mtn" : "";
  if (network) cell.classList.add(`network-${network}`);
});
new MutationObserver(colorizeTrackingNetworks).observe(document.body, { childList: true, subtree: true });
colorizeTrackingNetworks();
