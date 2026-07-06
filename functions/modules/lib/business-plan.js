// functions/modules/lib/business-plan.js
//
// Helpers compartidos para consultar el plan (entitlements) de negocios y usuarios.
// Fuente de verdad:
//   places/{placeId}.businessTier / businessProActive / businessPlanSource / businessPlanExpiresAt
//   users/{uid}.premium { active, source, expiresAt }
// La procedencia ('manual' | 'trial' | 'stripe') decide quién puede degradar el plan:
// el webhook de Stripe solo degrada planes cuyo source sea 'stripe' (o no exista).

const MANUAL_PLAN_SOURCES = new Set(["manual", "trial"]);

function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return null;
}

function isExpired(expiresAt, nowMs = Date.now()) {
  const millis = toMillis(expiresAt);
  return millis !== null && millis <= nowMs;
}

/**
 * Devuelve true si el lugar tiene Business Pro activo (tier + no caducado).
 */
function hasActiveBusinessPro(placeData = {}, nowMs = Date.now()) {
  const proFlag = placeData.businessProActive === true || placeData.businessTier === "pro";
  if (!proFlag) return false;
  return !isExpired(placeData.businessPlanExpiresAt, nowMs);
}

/**
 * Devuelve true si el plan del lugar fue concedido manualmente (manual/trial)
 * y por tanto Stripe no debe degradarlo.
 */
function isManualBusinessPlan(placeData = {}) {
  return MANUAL_PLAN_SOURCES.has(placeData.businessPlanSource);
}

/**
 * Devuelve true si el usuario tiene premium personal activo (no caducado).
 */
function hasActiveUserPremium(userData = {}, nowMs = Date.now()) {
  const premium = userData.premium || {};
  if (premium.active !== true) return false;
  return !isExpired(premium.expiresAt, nowMs);
}

function isManualUserPlan(userData = {}) {
  return MANUAL_PLAN_SOURCES.has(userData.premium?.source);
}

module.exports = {
  MANUAL_PLAN_SOURCES,
  hasActiveBusinessPro,
  isManualBusinessPlan,
  hasActiveUserPremium,
  isManualUserPlan,
  isExpired,
};
