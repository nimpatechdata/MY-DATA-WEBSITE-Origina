const reference = new URLSearchParams(window.location.search).get("reference");
const title = document.getElementById("membership-result-title");
const message = document.getElementById("membership-result-message");
const link = document.getElementById("membership-result-link");

async function confirmMembership() {
  if (!reference) throw new Error("No membership payment reference was found.");
  const response = await fetch("/api/agents/membership/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reference })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Membership could not be confirmed.");
  title.textContent = "You’re in";
  message.textContent = `Your membership is active. Sign in to set up your bundle store.${result.receiptSent ? " A separate NImpatech receipt was emailed to you." : " The receipt email could not be sent; contact support with your Paystack reference."}`;
  link.hidden = false;
}

confirmMembership().catch((error) => {
  title.textContent = "Membership not confirmed";
  message.textContent = `${error.message} Keep your Paystack reference and contact support if you were charged.`;
  link.hidden = false;
});