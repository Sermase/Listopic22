// Flags de funcionalidad.

// Capado real de Business Pro. Con `true`, los negocios sin plan Pro activo ven
// el paywall en las pestañas Pro; el plan se concede en Developer → Planes o
// (cuando esté configurado) pagando por Stripe. Con `false` quedan abiertas
// en modo pruebas.
export const BUSINESS_PRO_ENFORCED = true;

// Pagos online con Stripe (Business Pro y compra de impulsos). Apagados salvo
// que se compile con VITE_BUSINESS_PRO_CHECKOUT=true; el servidor exige además
// STRIPE_CHECKOUT_ENABLED=true. Mientras tanto, el plan se concede a mano en
// Developer → Planes, los impulsos se regalan desde ahí y los botones de
// compra no aparecen.
export const BUSINESS_PRO_CHECKOUT_ENABLED = import.meta.env.VITE_BUSINESS_PRO_CHECKOUT === 'true';
