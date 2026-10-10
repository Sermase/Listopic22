// functions/modules/lib/impulse-purchases.js
//
// Reglas puras del webhook de Stripe para las compras de impulsos
// (`impulsePurchases/{checkoutSessionId}`), probadas en
// functions/test/impulse-purchases.test.js.
//
// Una compra nace `pending` al crear el Checkout y pasa a `paid` cuando Stripe
// confirma el pago. Antes, si el Checkout caducaba o el pago asíncrono fallaba,
// se quedaba `pending` para siempre (bug 13). Ahora pasa a `expired` o `failed`.
// Una compra `paid` nunca retrocede.

// Evento de Stripe → estado final de una compra no pagada.
const IMPULSE_PURCHASE_CLOSING_EVENTS = {
  "checkout.session.expired": "expired",
  "checkout.session.async_payment_failed": "failed",
};

const IMPULSE_PURCHASE_PAID_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

/**
 * Qué hace el webhook con un evento:
 *   'impulse_paid'   → applyImpulsePurchase (suma impulsos si está pagado)
 *   'impulse_closed' → closeImpulsePurchase (expired / failed)
 *   'subscription'   → applyBusinessProSubscription
 *   null             → se ignora (y se responde 200)
 */
function stripeWebhookAction(event = {}) {
  const type = event.type || "";
  const object = event.data?.object || {};
  const isImpulsePack = object.metadata?.kind === "impulse_pack";

  if (isImpulsePack && IMPULSE_PURCHASE_PAID_EVENTS.has(type)) return "impulse_paid";
  if (isImpulsePack && Object.prototype.hasOwnProperty.call(IMPULSE_PURCHASE_CLOSING_EVENTS, type)) return "impulse_closed";
  if (type === "checkout.session.completed" && object.mode === "subscription") return "subscription";
  if (SUBSCRIPTION_EVENTS.has(type)) return "subscription";
  return null;
}

/** Estado al que pasa la compra con este evento, o null si no lo cierra. */
function impulsePurchaseClosingStatus(eventType) {
  return IMPULSE_PURCHASE_CLOSING_EVENTS[eventType] || null;
}

/**
 * ¿Se puede cerrar una compra en este estado? Solo las que siguen abiertas
 * (`pending`, o sin documento). `paid` no retrocede y las ya cerradas no se
 * reescriben si Stripe repite el evento.
 */
function canCloseImpulsePurchase(currentStatus) {
  return !currentStatus || currentStatus === "pending";
}

module.exports = {
  IMPULSE_PURCHASE_CLOSING_EVENTS,
  stripeWebhookAction,
  impulsePurchaseClosingStatus,
  canCloseImpulsePurchase,
};
