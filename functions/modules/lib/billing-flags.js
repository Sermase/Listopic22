// functions/modules/lib/billing-flags.js
/** La contratación con Stripe solo se abre con STRIPE_CHECKOUT_ENABLED=true explícito. */
const isCheckoutEnabled = (env) => String((env && env.STRIPE_CHECKOUT_ENABLED) || '').trim().toLowerCase() === 'true';

module.exports = { isCheckoutEnabled };
