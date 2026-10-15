(function () {
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
