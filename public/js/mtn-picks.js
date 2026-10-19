(() => {
  const cards = [...document.querySelectorAll(".mtn-pick[data-bundle]")];
  if (!cards.length) return;

  fetch("/api/catalog", { headers: { Accept: "application/json" } })
    .then((response) => response.ok ? response.json() : null)
    .then((catalog) => {
      const bundles = catalog?.bundles?.mtn || [];
      cards.forEach((card) => {
        const bundle = bundles.find((item) => item.id === card.dataset.bundle);
        const price = card.querySelector(".mtn-pick__price");
        if (bundle && price) price.textContent = `GHS ${Number(bundle.priceGhs).toFixed(2)}`;
      });
    })
    .catch(() => cards.forEach((card) => {
      const price = card.querySelector(".mtn-pick__price");
      if (price) price.textContent = "View price";
    }));
})();
