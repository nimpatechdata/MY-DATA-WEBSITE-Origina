(function () {
  function goBack() {
    const sameSiteReferrer = document.referrer.startsWith(window.location.origin);
    if (sameSiteReferrer && window.history.length > 1) window.history.back();
    else window.location.assign("/");
  }

  const menuToggle = document.getElementById("menu-toggle");
  const headerActions = menuToggle?.closest(".header-actions");
  if (!menuToggle || !headerActions) {
    const backButton = document.createElement("button");
    backButton.className = "site-back-button";
    backButton.type = "button";
    backButton.setAttribute("aria-label", "Go back to the previous page");
    backButton.textContent = "← Back";
    backButton.addEventListener("click", goBack);
    document.body.appendChild(backButton);
  }

  const menuBackButton = document.getElementById("menu-back-button");
  if (menuBackButton) {
    const dashboardNav = document.getElementById("dashboard-nav");
    if (dashboardNav) dashboardNav.prepend(menuBackButton);
    menuBackButton.addEventListener("click", goBack);
  }

  const welcomeTitle = document.getElementById("welcome-title");
  const customerAccountLink = document.getElementById("customer-account-link");
  const customerSessionKey = "nimpatech-customer-session";
  const customerSession = (() => {
    try { return JSON.parse(localStorage.getItem(customerSessionKey) || "null"); } catch { return null; }
  })();

  function setGreeting(name) {
    if (!welcomeTitle) return;
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    welcomeTitle.innerHTML = name ? `${greeting}, ${name}.<br />welcome back.` : `${greeting},<br />welcome back.`;
  }

  setGreeting(customerSession?.user?.name || "");
  if (customerAccountLink && customerSession?.user?.name) {
    customerAccountLink.textContent = `Hi, ${customerSession.user.name.split(" ")[0]}`;
    customerAccountLink.href = "/account.html";
  }

  const dashboardNav = document.getElementById("dashboard-nav");
  if (menuToggle && dashboardNav) {
    menuToggle.addEventListener("click", () => {
      const open = dashboardNav.classList.toggle("is-open");
      menuToggle.setAttribute("aria-expanded", String(open));
    });
  }

  const year = new Date().getFullYear();
  const existingFooter = document.querySelector("footer");
  const footer = existingFooter || document.createElement("footer");
  footer.classList.add("site-footer");
  footer.innerHTML = `
    <nav class="site-footer__links" aria-label="Helpful links">
      <a href="https://whatsapp.com/channel/0029VbDe7YwIHphPAs75Yk0y" target="_blank" rel="noopener noreferrer">WhatsApp Channel</a>
      <a class="site-footer__whatsapp" href="https://wa.me/233533323096" target="_blank" rel="noopener noreferrer">WhatsApp</a>
      <a href="#support-widget" data-open-support>Contact</a>
      <a href="/#track-order">Track Order</a>
      <a href="/agents.html">Become a Reseller</a>
      <a href="/agents.html">Reseller Registration</a>
      <a href="/agent-dashboard.html">Reseller Login</a>
      <a href="/checkout.html">Buy Data</a>
    </nav>
    <span>© ${year} Nimpatech Data. All rights reserved.</span>`;
  if (!existingFooter) document.body.appendChild(footer);

  fetch("/api/site-settings").then((response) => response.ok ? response.json() : null).then((settings) => {
    if (!settings?.whatsappNumber) return;
    const number = settings.whatsappNumber.replace(/\D/g, "");
    const whatsapp = footer.querySelector(".site-footer__whatsapp");
    if (whatsapp) whatsapp.href = `https://wa.me/${number}`;
  }).catch(() => {});
})();
