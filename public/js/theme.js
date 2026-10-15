(function () {
  const themes = [
    ["yellow", "Yellow + dark blue"],
    ["darkblue", "Dark blue"],
    ["white", "White"],
    ["black", "Black"]
  ];
  const saved = localStorage.getItem("nimpatech-theme") || "yellow";
  document.documentElement.dataset.theme = themes.some(([id]) => id === saved) ? saved : "yellow";

  function mount() {
    if (document.querySelector(".theme-switcher")) return;
    const wrapper = document.createElement("label");
    wrapper.className = "theme-switcher";
    wrapper.innerHTML = '<span>Theme</span><select aria-label="Choose interface theme"></select>';
    const select = wrapper.querySelector("select");
    themes.forEach(([id, label]) => {
      const option = new Option(label, id, id === document.documentElement.dataset.theme, id === document.documentElement.dataset.theme);
      select.add(option);
    });
    select.addEventListener("change", () => {
      document.documentElement.dataset.theme = select.value;
      localStorage.setItem("nimpatech-theme", select.value);
    });
    document.body.prepend(wrapper);
  }

  fetch("/api/site-settings")
    .then((response) => response.ok ? response.json() : null)
    .then((settings) => {
      if (!settings) return;
      if (themes.some(([id]) => id === settings.theme)) {
        document.documentElement.dataset.theme = settings.theme;
        localStorage.setItem("nimpatech-theme", settings.theme);
        const select = document.querySelector(".theme-switcher select");
        if (select) select.value = settings.theme;
      }
      document.querySelectorAll(".logo, .dashboard-brand, .agent-result-brand").forEach((element) => { if (settings.siteName) element.textContent = settings.siteName; });
      if (settings.siteName) document.title = document.title.replace(/NImpatech[^·]*/, settings.siteName);
    })
    .catch(() => {});

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
