// functions/modules/lib/plan-beta.js
//
// Beta gratuita de planes («Lo quiero»): mide cuántos negocios quieren
// Business Pro sin cobrar nada (Premium de usuario queda para más adelante).
// Los precios son los que se enseñan en /planes para medir disposición a
// pagar; espejo en frontend/src/config/planBeta.ts.

const PLAN_BETA = {
  open: true,
  trialDays: 90,
  plans: {
    business_pro: { monthlyEur: 12, yearlyEur: 120 },
  },
};

const BILLING_PERIODS = new Set(["monthly", "yearly"]);

function normalizeInterestRequest(data = {}) {
  const plan = typeof data.plan === "string" ? data.plan.trim() : "";
  if (!Object.prototype.hasOwnProperty.call(PLAN_BETA.plans, plan)) return { error: "Plan no válido." };
  const billing = BILLING_PERIODS.has(data.billing) ? data.billing : "monthly";
  const placeId = plan === "business_pro" && typeof data.placeId === "string"
    ? data.placeId.trim().slice(0, 300)
    : "";
  return { plan, billing, placeId };
}

// Un documento por usuario (negocio sin local verificado) o por local:
// repetir el clic no infla el recuento ni reabre la prueba.
function interestDocId({ plan, placeId }, uid) {
  if (plan === "business_pro" && placeId) return `business_pro_place_${placeId}`;
  return `${plan}_user_${uid}`;
}

function priceShown(plan, billing) {
  const prices = PLAN_BETA.plans[plan];
  return billing === "yearly" ? prices.yearlyEur : prices.monthlyEur;
}

function trialExpiry(nowMs = Date.now()) {
  return new Date(nowMs + PLAN_BETA.trialDays * 24 * 60 * 60 * 1000);
}

module.exports = {
  PLAN_BETA,
  normalizeInterestRequest,
  interestDocId,
  priceShown,
  trialExpiry,
};
