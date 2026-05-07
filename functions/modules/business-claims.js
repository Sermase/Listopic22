const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const fetch = require("node-fetch");

const resendApiKey = defineSecret("RESEND_API_KEY");

const CLAIM_REVIEW_EMAIL = process.env.BUSINESS_CLAIMS_TO_EMAIL || "istaricore@gmail.com";
const CLAIM_FROM_EMAIL = process.env.BUSINESS_CLAIMS_FROM_EMAIL || "Listopic <onboarding@resend.dev>";
const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN || "https://listopic.es").replace(/\/$/, "");

const escapeHtml = (value) => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const buildEmailHtml = (claimId, claim) => {
  const developerUrl = `${PUBLIC_ORIGIN}/developer?tab=businessClaims&claimId=${encodeURIComponent(claimId)}`;
  const placeUrl = `${PUBLIC_ORIGIN}/place/${encodeURIComponent(claim.placeId || "")}`;
  const proofs = Array.isArray(claim.proofs) ? claim.proofs : [];

  const proofList = proofs.length
    ? `<ul>${proofs.map((proof) => `<li><a href="${escapeHtml(proof.downloadUrl)}">${escapeHtml(proof.name || proof.storagePath || "Prueba")}</a></li>`).join("")}</ul>`
    : "<p>No se adjuntaron archivos.</p>";

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h2>Nueva reclamación de negocio</h2>
      <p><strong>Lugar:</strong> ${escapeHtml(claim.placeName)}<br/>
      <strong>Place ID:</strong> ${escapeHtml(claim.placeId)}<br/>
      <strong>Solicitante:</strong> ${escapeHtml(claim.userName || claim.userEmail || claim.userId)}<br/>
      <strong>Email:</strong> ${escapeHtml(claim.contactEmail || claim.userEmail)}<br/>
      <strong>Relación:</strong> ${escapeHtml(claim.role)}</p>

      <p><strong>Solicitud:</strong></p>
      <p style="white-space:pre-wrap">${escapeHtml(claim.message)}</p>

      <p><strong>Pruebas:</strong></p>
      ${proofList}

      <p>
        <a href="${developerUrl}" style="display:inline-block;background:#6d5dfc;color:white;padding:10px 14px;border-radius:8px;text-decoration:none;font-weight:bold">Abrir en Developer</a>
        &nbsp;
        <a href="${placeUrl}">Ver lugar</a>
      </p>
    </div>
  `;
};

const sendResendEmail = async ({ to, subject, html }) => {
  const apiKey = process.env.RESEND_API_KEY || (() => {
    try {
      return resendApiKey.value();
    } catch (_) {
      return "";
    }
  })();

  if (!apiKey) {
    logger.warn("businessClaims: RESEND_API_KEY no configurada; no se envía email.");
    return { skipped: true };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: CLAIM_FROM_EMAIL,
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend error ${response.status}: ${body}`);
  }

  return response.json();
};

const onBusinessClaimCreated = onDocumentCreated({
  document: "businessClaims/{claimId}",
  secrets: [resendApiKey],
}, async (event) => {
  const claimId = event.params.claimId;
  const claim = event.data?.data();
  if (!claim) return;

  try {
    await sendResendEmail({
      to: CLAIM_REVIEW_EMAIL,
      subject: `Nueva reclamación de negocio: ${claim.placeName || claim.placeId || claimId}`,
      html: buildEmailHtml(claimId, claim),
    });
    logger.info("businessClaims: email de aviso enviado", { claimId, to: CLAIM_REVIEW_EMAIL });
  } catch (error) {
    logger.error("businessClaims: error enviando email de aviso", { claimId, error: error.message || String(error) });
  }
});

module.exports = {
  onBusinessClaimCreated,
};
