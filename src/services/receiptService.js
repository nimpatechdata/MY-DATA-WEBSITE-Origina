const nodemailer = require("nodemailer");

let transport;

function isConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.RECEIPT_FROM
  );
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function buildReceipt(order) {
  const reference = order.paymentReference || order.payment?.reference || order.id;
  const title = order.receiptTitle || "Data bundle purchase";
  const status = order.status === "delivered" ? "Paid and delivered" : "Payment received · delivery processing";
  const rows = [
    ["Receipt reference", reference],
    ["Description", title],
    ["Network", order.networkName || order.network || "—"],
    ["Bundle", order.size || "—"],
    ["Recipient", order.phone || "—"],
    ["Payment status", status]
  ];
  if (order.validity) rows.splice(4, 0, ["Validity", order.validity]);
  const amount = Number(order.priceGhs || 0).toFixed(2);
  const htmlRows = rows.map(([label, value]) =>
    `<tr><th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:600;border-bottom:1px solid #e8edf2">${escapeHtml(label)}</th><td style="padding:10px 12px;text-align:right;color:#182840;font-weight:700;border-bottom:1px solid #e8edf2">${escapeHtml(value)}</td></tr>`
  ).join("");
  const textRows = rows.map(([label, value]) => `${label}: ${value}`).join("\n");

  return {
    subject: `NImpatech receipt ${reference}`,
    text: `NImpatech data bundles\nPayment receipt\n\n${textRows}\nAmount paid: GHS ${amount}\n\nThank you for choosing NImpatech.`,
    html: `<!doctype html><html><body style="margin:0;padding:24px;background:#f2f4f7;font-family:Arial,sans-serif;color:#182840"><main style="max-width:560px;margin:auto;padding:28px;background:#fff;border:1px solid #e4e9ef;border-radius:10px"><p style="margin:0 0 8px;color:#d28c00;font-weight:800">NIMPATECH DATA BUNDLES</p><h1 style="margin:0 0 8px;font-size:24px">Payment receipt</h1><p style="margin:0 0 20px;color:#64748b">Your payment was verified. Bundle delivery status: ${escapeHtml(status)}.</p><table style="width:100%;border-collapse:collapse">${htmlRows}<tr><th style="padding:14px 12px;text-align:left;font-size:15px">Amount paid</th><td style="padding:14px 12px;text-align:right;font-size:18px;font-weight:800">GHS ${amount}</td></tr></table><p style="margin:20px 0 0;color:#64748b;font-size:12px">Keep this email as your receipt. For help, contact WhatsApp support at +233 53 332 3096.</p></main></body></html>`
  };
}

function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return transport;
}

async function sendReceipt(order, transportOverride) {
  if (!order.email) return { sent: false, status: "email_missing" };
  if (!isConfigured()) return { sent: false, status: "not_configured" };

  const receipt = buildReceipt(order);
  const result = await (transportOverride || getTransport()).sendMail({
    from: process.env.RECEIPT_FROM,
    to: order.email,
    subject: receipt.subject,
    text: receipt.text,
    html: receipt.html
  });
  return { sent: true, status: "sent", messageId: result.messageId || null };
}

async function sendAdminPasswordReset(email, resetUrl, transportOverride) {
  if (!isConfigured()) return { sent: false, status: "not_configured" };
  const safeUrl = escapeHtml(resetUrl);
  const result = await (transportOverride || getTransport()).sendMail({
    from: process.env.RECEIPT_FROM,
    to: email,
    subject: "NImpatech admin password reset",
    text: `NImpatech admin password reset\n\nUse this link within 30 minutes to choose a new password:\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
    html: `<!doctype html><html><body style="margin:0;padding:24px;background:#f2f4f7;font-family:Arial,sans-serif;color:#182840"><main style="max-width:560px;margin:auto;padding:28px;background:#fff;border:1px solid #e4e9ef;border-radius:10px"><h1 style="margin:0 0 12px">Reset admin password</h1><p style="color:#64748b">This link expires in 30 minutes.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#f4c400;color:#182840;text-decoration:none;border-radius:8px;font-weight:700">Choose a new password</a></p><p style="color:#64748b;font-size:12px">If you did not request this, ignore this email.</p></main></body></html>`
  });
  return { sent: true, status: "sent", messageId: result.messageId || null };
}

module.exports = { buildReceipt, isConfigured, sendReceipt, sendAdminPasswordReset };
