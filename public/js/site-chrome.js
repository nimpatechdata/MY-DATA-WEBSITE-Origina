(function () {
  const year = new Date().getFullYear();
  const existingFooter = document.querySelector("footer");
  const footer = existingFooter || document.createElement("footer");
  footer.classList.add("site-footer");
  footer.innerHTML = `<span>© ${year} Nimpatech Data. All rights reserved.</span>`;
  if (!existingFooter) document.body.appendChild(footer);
})();
