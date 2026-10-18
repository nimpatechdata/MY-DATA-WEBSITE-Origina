const customerSessionKey = "nimpatech-customer-session";
const signinPanel = document.getElementById("signin-panel");
const signupPanel = document.getElementById("signup-panel");
const signedInPanel = document.getElementById("signed-in-panel");
const signinTab = document.getElementById("signin-tab");
const signupTab = document.getElementById("signup-tab");

function getCustomerSession() {
  try { return JSON.parse(localStorage.getItem(customerSessionKey) || "null"); } catch { return null; }
}

function setMessage(id, message, success = false) {
  const element = document.getElementById(id);
  element.textContent = message;
  element.classList.toggle("is-success", success);
}

function showTab(tab) {
  const signin = tab === "signin";
  signinPanel.hidden = !signin;
  signupPanel.hidden = signin;
  signinTab.classList.toggle("is-active", signin);
  signupTab.classList.toggle("is-active", !signin);
  signinTab.setAttribute("aria-selected", String(signin));
  signupTab.setAttribute("aria-selected", String(!signin));
}

function showSignedIn(user) {
  document.querySelector(".account-tabs").hidden = true;
  signinPanel.hidden = true;
  signupPanel.hidden = true;
  signedInPanel.hidden = false;
  document.getElementById("signed-in-name").textContent = `Welcome, ${user.name}`;
  document.getElementById("signed-in-email").textContent = user.email;
}

async function submitAccountForm(event, endpoint, messageId) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  setMessage(messageId, "Working...");
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not complete this request.");
    localStorage.setItem(customerSessionKey, JSON.stringify(result));
    showSignedIn(result.user);
  } catch (error) {
    setMessage(messageId, error.message);
  } finally {
    submit.disabled = false;
  }
}

signinTab.addEventListener("click", () => showTab("signin"));
signupTab.addEventListener("click", () => showTab("signup"));
document.getElementById("signin-form").addEventListener("submit", (event) => submitAccountForm(event, "/api/customers/login", "signin-message"));
document.getElementById("signup-form").addEventListener("submit", (event) => submitAccountForm(event, "/api/customers/signup", "signup-message"));
document.getElementById("signout-button").addEventListener("click", () => { localStorage.removeItem(customerSessionKey); window.location.reload(); });

const existingSession = getCustomerSession();
if (existingSession?.user) showSignedIn(existingSession.user);
else if (window.location.hash === "#signup") showTab("signup");
