(() => {
  const list = document.getElementById("site-updates-list");
  const updated = document.getElementById("site-updates-refresh");
  if (!list) return;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  async function load() {
    try {
      const response = await fetch("/api/site-updates", { headers: { Accept: "application/json" } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Updates unavailable.");
      list.innerHTML = (data.updates || []).map((item) => `<article class="site-update"><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div><small>Now</small></article>`).join("");
      updated.textContent = `Updated ${new Date(data.updatedAt).toLocaleTimeString()}. Refreshes automatically.`;
    } catch (error) { list.innerHTML = `<p class="orders-message">${escapeHtml(error.message)}</p>`; }
  }
  load();
  setInterval(load, 30_000);
})();
