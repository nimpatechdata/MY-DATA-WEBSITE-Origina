const enrollmentForm = document.getElementById("agent-enroll-form");
const loginForm = document.getElementById("agent-login-form");
const setupBanner = document.getElementById("supabase-setup-banner");

function showFormMessage(element, message, isError = true) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
  element.classList.toggle("is-success", !isError);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "The request could not be completed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function checkPortalSetup() {
  try {
    const status = await requestJson("/api/agents/status", { headers: {} });
    if (!status.supabaseConfigured || !status.paystackConfigured) {
      setupBanner.hidden = false;
      setupBanner.textContent = !status.supabaseConfigured
        ? "Agent registration is not open yet. Supabase setup is required before accounts can be created."
        : "Agent registration is paused until Paystack is configured.";
      document.getElementById("enroll-submit").disabled = true;
    }
  } catch {
    setupBanner.hidden = false;
    setupBanner.textContent = "Agent registration setup could not be checked. Please contact support.";
    document.getElementById("enroll-submit").disabled = true;
  }
}

enrollmentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("enroll-submit");
  const message = document.getElementById("enroll-message");
  const body = Object.fromEntries(new FormData(enrollmentForm));
  button.disabled = true;
  button.textContent = "Preparing secure payment…";
  showFormMessage(message, "");
  try {
    const result = await requestJson("/api/agents/enroll", {
      method: "POST",
      body: JSON.stringify(body)
    });
    window.location.assign(result.authorizationUrl);
  } catch (error) {
    showFormMessage(message, error.message);
    button.disabled = false;
    button.textContent = "Continue to secure payment";
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector("button[type='submit']");
  const message = document.getElementById("login-message");
  button.disabled = true;
  showFormMessage(message, "");
  try {
    const result = await requestJson("/api/agents/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(loginForm)))
    });
    sessionStorage.setItem("nimpatech-agent-token", result.accessToken);
    if (result.membershipPending) {
      showFormMessage(message, "Your account is pending the GHS 50 membership payment. Use the button below to continue.");
      document.getElementById("retry-membership").hidden = false;
      button.disabled = false;
      return;
    }
    window.location.assign("/agent-dashboard.html");
  } catch (error) {
    showFormMessage(message, error.message);
    button.disabled = false;
  }
});

document.getElementById("retry-membership").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await requestJson("/api/agents/membership/retry", {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionStorage.getItem("nimpatech-agent-token")}` },
      body: JSON.stringify({})
    });
    window.location.assign(result.authorizationUrl);
  } catch (error) {
    showFormMessage(document.getElementById("login-message"), error.message);
    button.disabled = false;
  }
});

checkPortalSetup();