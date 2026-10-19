(() => {
  const list = document.getElementById("blog-list");
  if (!list) return;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  fetch("/api/blog").then((response) => response.ok ? response.json() : Promise.reject(new Error("Blog unavailable"))).then(({ posts }) => {
    list.innerHTML = posts.length ? posts.map((post) => `<article class="blog-card"><p class="section-kicker">NIMPATECH JOURNAL</p><h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(post.excerpt)}</p><small>${new Date(post.published_at || post.created_at).toLocaleDateString("en-GH", { dateStyle: "medium" })}</small><details><summary>Read more</summary><div>${escapeHtml(post.content).replace(/\n/g, "<br><br>")}</div></details></article>`).join("") : '<p class="orders-message">New stories will appear here soon.</p>';
  }).catch(() => { list.innerHTML = '<p class="orders-message">Our journal is being prepared. Please check back soon.</p>'; });
})();
