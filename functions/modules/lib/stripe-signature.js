// functions/modules/lib/stripe-signature.js
//
// Verificación de la cabecera Stripe-Signature de los webhooks (HMAC SHA-256),
// sin depender del SDK de Stripe.

const crypto = require("crypto");

// Margen para aceptar la firma (contra reenvíos de eventos viejos).
const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

function verifyStripeSignature(rawBody, signatureHeader, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  let timestamp = "";
  const signatures = [];
  String(signatureHeader || "").split(",").forEach((part) => {
    const separator = part.indexOf("=");
    if (separator <= 0) return;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "t") timestamp = value;
    // Durante una rotación del secreto Stripe envía varias firmas v1.
    if (key === "v1" && value) signatures.push(value);
  });
  if (!timestamp || signatures.length === 0) throw new Error("Firma de Stripe incompleta.");
  if (!/^\d+$/.test(timestamp) || Math.abs(nowSeconds - Number(timestamp)) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) {
    throw new Error("Firma de Stripe caducada.");
  }

  const signedPayload = `${timestamp}.${rawBody.toString("utf8")}`;
  const expectedBuffer = Buffer.from(crypto.createHmac("sha256", secret).update(signedPayload).digest("hex"), "hex");
  const matches = signatures.some((signature) => {
    const signatureBuffer = Buffer.from(signature, "hex");
    return signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  });
  if (!matches) throw new Error("Firma de Stripe no válida.");
}

module.exports = { verifyStripeSignature, STRIPE_SIGNATURE_TOLERANCE_SECONDS };
