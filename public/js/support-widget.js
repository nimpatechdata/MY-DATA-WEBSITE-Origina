let supportNumber = "0533323096";
let whatsappNumber = "233533323096";
const channelUrl = "https://whatsapp.com/channel/0029VbDe7YwIHphPAs75Yk0y";
const supportMessage = "Hello NImpatech, I need help with a data bundle order.";

const supportRoot = document.createElement("div");
supportRoot.className = "support-widget";
supportRoot.innerHTML = `
  <button class="support-launcher" type="button" aria-expanded="false" aria-controls="support-panel">
    <span class="support-launcher__icon" aria-hidden="true">◌</span> Contact &amp; Support
  </button>
  <section class="support-panel" id="support-panel" aria-labelledby="support-title" hidden>
    <header class="support-panel__head">
      <div><h2 id="support-title">Contact &amp; Support</h2><p>Talk to our team or get quick help.</p></div>
      <button class="support-close" type="button" aria-label="Close support">×</button>
    </header>
    <div class="support-panel__body">
      <div class="support-buttons">
        <a class="support-link support-link--whatsapp" target="_blank" rel="noopener noreferrer" href="https://wa.me/${whatsappNumber}?text=${encodeURIComponent(supportMessage)}">WhatsApp support</a>
        <a class="support-link" target="_blank" rel="noopener noreferrer" href="${channelUrl}">Join WhatsApp channel</a>
      </div>
      <p class="support-direct">Direct support <a href="tel:+${whatsappNumber}">+${whatsappNumber}</a></p>
      <p class="support-divider">Quick bot assistance</p>
      <div class="support-chat-log" aria-live="polite"><div class="support-bubble">Hi, I can help with payment, delivery, or joining as a sub-agent.</div></div>
      <div class="support-prompts">
        <button class="support-prompt" type="button" data-topic="payment">Payment help</button>
        <button class="support-prompt" type="button" data-topic="delivery">Order delivery</button>
        <button class="support-prompt" type="button" data-topic="agent">Join as an agent</button>
      </div>
      <form class="support-form">
        <label for="support-reference">Order reference (optional)</label>
        <input id="support-reference" name="reference" autocomplete="off" placeholder="e.g. order reference" />
        <label for="support-message">How can we help?</label>
        <textarea id="support-message" name="message" required maxlength="500" placeholder="Write a short message"></textarea>
        <button type="submit">Continue in WhatsApp</button>
      </form>
      <p class="support-note">Quick answers are automated prompts. The contact form opens WhatsApp with a draft; nothing is sent until you choose to send it.</p>
    </div>
  </section>`;
document.body.appendChild(supportRoot);

fetch("/api/site-settings").then((response) => response.ok ? response.json() : null).then((settings) => {
  if (!settings) return;
  supportNumber = settings.supportPhone || supportNumber;
  whatsappNumber = settings.whatsappNumber || whatsappNumber;
  const message = settings.siteName ? `Hello ${settings.siteName}, I need help with a data bundle order.` : supportMessage;
  supportRoot.querySelector(".support-link--whatsapp").href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
  supportRoot.querySelector(".support-direct a").href = `tel:+${whatsappNumber}`;
  supportRoot.querySelector(".support-direct a").textContent = `+${whatsappNumber}`;
}).catch(() => {});

const supportLauncher = supportRoot.querySelector(".support-launcher");
const supportPanel = supportRoot.querySelector(".support-panel");
const supportClose = supportRoot.querySelector(".support-close");
const chatLog = supportRoot.querySelector(".support-chat-log");

function setSupportOpen(open) {
  supportPanel.hidden = !open;
  supportLauncher.setAttribute("aria-expanded", String(open));
  if (open) supportClose.focus();
  else supportLauncher.focus();
}

supportLauncher.addEventListener("click", () => setSupportOpen(supportPanel.hidden));
supportClose.addEventListener("click", () => setSupportOpen(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !supportPanel.hidden) setSupportOpen(false);
});

const botReplies = {
  payment: "After checkout, Paystack redirects to the order page. Keep your order reference and contact support if the status does not update.",
  delivery: "A delivery can remain pending while the data provider processes it. Share your order reference with WhatsApp support so the team can check it.",
  agent: "Sub-agent registration and the GHS 50 joining fee are available from the agent portal."
};

supportRoot.querySelectorAll(".support-prompt").forEach((button) => {
  button.addEventListener("click", () => {
    const question = document.createElement("div");
    question.className = "support-bubble support-bubble--user";
    question.textContent = button.textContent;
    const answer = document.createElement("div");
    answer.className = "support-bubble";
    answer.textContent = botReplies[button.dataset.topic];
    chatLog.append(question, answer);
    chatLog.scrollTop = chatLog.scrollHeight;
  });
});

supportRoot.querySelector(".support-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const reference = supportRoot.querySelector("#support-reference").value.trim();
  const message = supportRoot.querySelector("#support-message").value.trim();
  const text = ["Hello NImpatech, I need support.", reference && `Order reference: ${reference}`, message]
    .filter(Boolean)
    .join("\n");
  window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
});
