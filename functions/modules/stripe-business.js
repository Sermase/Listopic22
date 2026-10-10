const { onCall, HttpsError, onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const fetch = require("node-fetch");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { writeAuditLog } = require("./lib/auth");
const { isManualBusinessPlan } = require("./lib/business-plan");

const db = getFirestore();

const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
const stripeBusinessProPriceId = defineSecret("STRIPE_BUSINESS_PRO_PRICE_ID");

const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN || "https://listopic.es").replace(/\/$/, "");
const STRIPE_API_VERSION = "2024-06-20";
const { isCheckoutEnabled } = require("./lib/billing-flags");
const { assertBusinessProAccess } = require("./business-pro");
const { loadImpulsePricing, resolveImpulsePurchase } = require("./lib/impulse-pricing");
const { verifyStripeSignature } = require("./lib/stripe-signature");
const {
  stripeWebhookAction,
  impulsePurchaseClosingStatus,
  canCloseImpulsePurchase,
} = require("./lib/impulse-purchases");

const asString = (value, maxLength = 500) => (typeof value === "string" ? value.trim().slice(0, maxLength) : "");

const getSecretValue = (secret, envName) => {
  if (process.env[envName]) return process.env[envName];
  try {
    return secret.value();
  } catch (_) {
    return "";
  }
};

async function assertBusinessProCheckoutAccess(placeId, uid) {
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  const placeRef = db.collection("places").doc(placeId);
  const placeSnap = await placeRef.get();
  if (!placeSnap.exists) throw new HttpsError("not-found", "El negocio no existe.");

  const place = placeSnap.data() || {};
  const managerIds = Array.isArray(place.businessManagerIds) ? place.businessManagerIds : [];
  const isOwner = place.businessOwnerUserId === uid;
  const isManager = managerIds.includes(uid);

  if (!place.businessVerified || (!isOwner && !isManager)) {
    throw new HttpsError("permission-denied", "Solo un gestor verificado puede contratar Business Pro.");
  }

  return { placeRef, place };
}

async function stripeRequest(path, form, secretKey) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": STRIPE_API_VERSION,
    },
    body: form.toString(),
  });

  const body = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }));
  if (!response.ok) {
    logger.error("stripeBusiness: Stripe API error", { path, status: response.status, body });
    throw new HttpsError("internal", body?.error?.message || "Stripe no pudo procesar la operación.");
  }
  return body;
}

const createBusinessProCheckoutSession = onCall({
  secrets: [stripeSecretKey, stripeBusinessProPriceId],
}, async (request) => {
  const uid = request.auth?.uid;
  const placeId = asString(request.data?.placeId, 300);
  if (!placeId) throw new HttpsError("invalid-argument", "Falta placeId.");
  // Seguro: sin STRIPE_CHECKOUT_ENABLED=true (functions/.env) no se toca Stripe,
  // aunque existan claves. El plan se concede a mano en Developer → Planes.
  if (!isCheckoutEnabled(process.env)) {
    throw new HttpsError("failed-precondition", "La contratación online de Business Pro todavía no está activa.");
  }

  const secretKey = getSecretValue(stripeSecretKey, "STRIPE_SECRET_KEY");
  const priceId = getSecretValue(stripeBusinessProPriceId, "STRIPE_BUSINESS_PRO_PRICE_ID");
  if (!secretKey || !priceId) {
    throw new HttpsError("failed-precondition", "Stripe Business Pro no está configurado.");
  }

  const { placeRef, place } = await assertBusinessProCheckoutAccess(placeId, uid);
  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("line_items[0][price]", priceId);
  form.set("line_items[0][quantity]", "1");
  form.set("client_reference_id", placeId);
  form.set("customer_email", asString(request.auth?.token?.email, 180));
  form.set("success_url", `${PUBLIC_ORIGIN}/businesses/${encodeURIComponent(placeId)}/manage?checkout=success`);
  form.set("cancel_url", `${PUBLIC_ORIGIN}/businesses/${encodeURIComponent(placeId)}/manage?checkout=cancelled`);
  form.set("metadata[placeId]", placeId);
  form.set("metadata[userId]", uid);
  form.set("metadata[plan]", "business_pro");
  form.set("subscription_data[metadata][placeId]", placeId);
  form.set("subscription_data[metadata][userId]", uid);
  form.set("subscription_data[metadata][plan]", "business_pro");

  const session = await stripeRequest("checkout/sessions", form, secretKey);

  await placeRef.set({
    businessBillingStatus: "checkout_started",
    businessBillingPlan: "business_pro",
    businessBillingUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await writeAuditLog(uid, "businessPro.checkoutCreated", {
    placeId,
    placeName: place.name || place.displayName || null,
    stripeSessionId: session.id || null,
  });

  return { id: session.id, url: session.url };
});

// Compra de impulsos (pago único): un paquete o lo que falta a precio de lista.
// Los impulsos se suman al saldo del local solo cuando el webhook confirma el pago.
const createImpulsePackCheckoutSession = onCall({
  secrets: [stripeSecretKey],
}, async (request) => {
  const uid = request.auth?.uid;
  const placeId = asString(request.data?.placeId, 300);
  if (!placeId) throw new HttpsError("invalid-argument", "Falta placeId.");
  if (!isCheckoutEnabled(process.env)) {
    throw new HttpsError("failed-precondition", "La compra online de impulsos todavía no está activa.");
  }
  const secretKey = getSecretValue(stripeSecretKey, "STRIPE_SECRET_KEY");
  if (!secretKey) throw new HttpsError("failed-precondition", "Stripe no está configurado.");

  const { place } = await assertBusinessProAccess(placeId, uid);
  const pricing = await loadImpulsePricing(db);
  const purchase = resolveImpulsePurchase(request.data || {}, pricing);
  if (purchase.error) throw new HttpsError("invalid-argument", purchase.error);

  const amountCents = Math.round(purchase.priceEur * 100);
  const impulsesLabel = purchase.impulses.toLocaleString("es-ES");
  const returnBase = `${PUBLIC_ORIGIN}/businesses/${encodeURIComponent(placeId)}/manage?tab=sponsored`;
  const metadata = {
    kind: "impulse_pack",
    placeId,
    userId: uid,
    impulses: String(purchase.impulses),
    priceEur: String(purchase.priceEur),
    packIndex: purchase.packIndex === null ? "" : String(purchase.packIndex),
  };

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", "eur");
  form.set("line_items[0][price_data][unit_amount]", String(amountCents));
  form.set("line_items[0][price_data][product_data][name]", `${impulsesLabel} impulsos de Listopic`);
  form.set("line_items[0][price_data][product_data][description]", `Para destacar platos de ${asString(place.name, 80) || "tu local"}`);
  form.set("client_reference_id", placeId);
  form.set("customer_email", asString(request.auth?.token?.email, 180));
  form.set("success_url", `${returnBase}&impulsos=ok`);
  form.set("cancel_url", `${returnBase}&impulsos=cancelado`);
  for (const [key, value] of Object.entries(metadata)) {
    form.set(`metadata[${key}]`, value);
    form.set(`payment_intent_data[metadata][${key}]`, value);
  }

  const session = await stripeRequest("checkout/sessions", form, secretKey);

  await db.collection("impulsePurchases").doc(session.id).set({
    placeId,
    placeName: place.name || null,
    userId: uid,
    impulses: purchase.impulses,
    priceEur: purchase.priceEur,
    amountCents,
    packIndex: purchase.packIndex,
    status: "pending",
    stripeSessionId: session.id,
    createdAt: FieldValue.serverTimestamp(),
  });

  await writeAuditLog(uid, "sponsored.impulseCheckoutCreated", {
    placeId,
    placeName: place.name || null,
    impulses: purchase.impulses,
    priceEur: purchase.priceEur,
    stripeSessionId: session.id || null,
  });

  return { id: session.id, url: session.url, impulses: purchase.impulses, priceEur: purchase.priceEur };
});

// Suma al saldo los impulsos de una compra pagada. Idempotente por sesión de
// Checkout: Stripe puede reenviar el mismo evento.
async function applyImpulsePurchase(event) {
  const session = event.data?.object || {};
  const metadata = session.metadata || {};
  const sessionId = asString(session.id, 300);
  const placeId = asString(metadata.placeId, 300);
  const impulses = Number(metadata.impulses);

  if (session.payment_status !== "paid") {
    logger.info("stripeBusiness: compra de impulsos aún sin pagar", { sessionId, paymentStatus: session.payment_status });
    return;
  }
  if (!sessionId || !placeId || !Number.isInteger(impulses) || impulses <= 0) {
    logger.warn("stripeBusiness: compra de impulsos con metadatos incompletos", { eventId: event.id, sessionId });
    return;
  }

  const purchaseRef = db.collection("impulsePurchases").doc(sessionId);
  const placeRef = db.collection("places").doc(placeId);
  const credited = await db.runTransaction(async (tx) => {
    const purchaseSnap = await tx.get(purchaseRef);
    if (purchaseSnap.exists && purchaseSnap.data()?.status === "paid") return false;
    tx.set(placeRef, {
      spotlightCredits: FieldValue.increment(impulses),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(purchaseRef, {
      placeId,
      userId: asString(metadata.userId, 300) || null,
      impulses,
      amountTotalCents: typeof session.amount_total === "number" ? session.amount_total : null,
      currency: asString(session.currency, 10) || null,
      stripeSessionId: sessionId,
      stripePaymentIntentId: asString(session.payment_intent, 300) || null,
      stripeEventId: event.id || null,
      status: "paid",
      paidAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });

  if (credited) {
    await writeAuditLog(asString(metadata.userId, 300) || "stripe", "sponsored.impulsesPurchased", {
      placeId,
      impulses,
      amountTotalCents: typeof session.amount_total === "number" ? session.amount_total : null,
      stripeSessionId: sessionId,
      stripeEventId: event.id || null,
    });
  }
}

// Checkout de impulsos caducado o pago asíncrono fallido: la compra pasa de
// `pending` a `expired` / `failed` para que no quede abierta para siempre.
// Nunca toca una compra ya pagada. Idempotente: Stripe puede repetir el evento.
async function closeImpulsePurchase(event) {
  const session = event.data?.object || {};
  const metadata = session.metadata || {};
  const sessionId = asString(session.id, 300);
  const nextStatus = impulsePurchaseClosingStatus(event.type);
  if (!sessionId || !nextStatus) {
    logger.warn("stripeBusiness: cierre de compra de impulsos sin sesión", { eventId: event.id, type: event.type });
    return;
  }

  const purchaseRef = db.collection("impulsePurchases").doc(sessionId);
  const closed = await db.runTransaction(async (tx) => {
    const purchaseSnap = await tx.get(purchaseRef);
    const currentStatus = purchaseSnap.exists ? purchaseSnap.data()?.status : null;
    if (!canCloseImpulsePurchase(currentStatus)) return false;
    const impulses = Number(metadata.impulses);
    tx.set(purchaseRef, {
      ...(purchaseSnap.exists ? {} : {
        placeId: asString(metadata.placeId, 300) || null,
        userId: asString(metadata.userId, 300) || null,
        impulses: Number.isInteger(impulses) && impulses > 0 ? impulses : null,
        stripeSessionId: sessionId,
        createdAt: FieldValue.serverTimestamp(),
      }),
      status: nextStatus,
      stripeEventId: event.id || null,
      [nextStatus === "expired" ? "expiredAt" : "failedAt"]: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });

  logger.info("stripeBusiness: compra de impulsos cerrada sin pago", {
    sessionId,
    status: nextStatus,
    changed: closed,
    eventId: event.id || null,
  });
}

async function applyBusinessProSubscription(event) {
  const object = event.data?.object || {};
  const metadata = object.metadata || {};
  const placeId = asString(metadata.placeId || object.client_reference_id, 300);
  const userId = asString(metadata.userId, 300);
  const subscriptionId = asString(object.subscription || object.id, 300);
  const customerId = asString(object.customer, 300);

  if (!placeId) {
    logger.warn("stripeBusiness: evento sin placeId", { eventId: event.id, type: event.type });
    return;
  }

  const isActive = event.type === "checkout.session.completed"
    || object.status === "active"
    || object.status === "trialing";
  const isEnded = event.type === "customer.subscription.deleted"
    || object.status === "canceled"
    || object.status === "unpaid";

  const placeRef = db.collection("places").doc(placeId);
  const placeSnap = await placeRef.get();
  const currentPlace = placeSnap.exists ? placeSnap.data() || {} : {};
  const manualPlan = isManualBusinessPlan(currentPlace);

  const placePatch = {
    stripeCustomerId: customerId || FieldValue.delete(),
    stripeSubscriptionId: subscriptionId || FieldValue.delete(),
    businessBillingStatus: object.status || (isActive ? "active" : "updated"),
    businessBillingPlan: "business_pro",
    businessBillingUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (isActive) {
    // Pagar siempre gana: el plan pasa a ser de Stripe y pierde caducidad manual.
    placePatch.businessTier = "pro";
    placePatch.businessProActive = true;
    placePatch.businessPlanSource = "stripe";
    placePatch.businessPlanExpiresAt = FieldValue.delete();
  }
  if (isEnded) {
    if (manualPlan) {
      // El plan vigente fue concedido a mano desde Developer: Stripe no lo degrada.
      logger.info("stripeBusiness: fin de suscripción ignorado por plan manual", {
        placeId,
        eventId: event.id,
        planSource: currentPlace.businessPlanSource,
      });
    } else {
      placePatch.businessTier = "free";
      placePatch.businessProActive = false;
      placePatch.businessPlanSource = FieldValue.delete();
      placePatch.businessPlanExpiresAt = FieldValue.delete();
    }
  }

  await placeRef.set(placePatch, { merge: true });

  if (subscriptionId) {
    await db.collection("businessSubscriptions").doc(subscriptionId).set({
      placeId,
      userId: userId || null,
      stripeCustomerId: customerId || null,
      stripeSubscriptionId: subscriptionId,
      status: object.status || null,
      plan: "business_pro",
      latestEventId: event.id || null,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  await writeAuditLog(userId || "stripe", "businessPro.subscriptionUpdated", {
    placeId,
    stripeEventId: event.id || null,
    stripeEventType: event.type,
    stripeSubscriptionId: subscriptionId || null,
    status: object.status || null,
  });
}

const stripeBusinessWebhook = onRequest({
  secrets: [stripeWebhookSecret],
}, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const secret = getSecretValue(stripeWebhookSecret, "STRIPE_WEBHOOK_SECRET");
  if (!secret) {
    res.status(500).send("Stripe webhook secret is not configured");
    return;
  }

  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  try {
    verifyStripeSignature(rawBody, req.header("stripe-signature"), secret);
  } catch (error) {
    logger.warn("stripeBusiness: firma webhook inválida", { error: error.message });
    res.status(400).send("Invalid signature");
    return;
  }

  const event = JSON.parse(rawBody.toString("utf8"));
  try {
    const action = stripeWebhookAction(event);
    if (action === "impulse_paid") {
      await applyImpulsePurchase(event);
    } else if (action === "impulse_closed") {
      await closeImpulsePurchase(event);
    } else if (action === "subscription") {
      await applyBusinessProSubscription(event);
    }
    res.status(200).json({ received: true });
  } catch (error) {
    logger.error("stripeBusiness: error procesando webhook", { eventId: event.id, type: event.type, error: error.message });
    res.status(500).send("Webhook processing failed");
  }
});

module.exports = {
  createBusinessProCheckoutSession,
  createImpulsePackCheckoutSession,
  stripeBusinessWebhook,
};
