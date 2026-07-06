const crypto = require("crypto");
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

function verifyStripeSignature(rawBody, signatureHeader, secret) {
  const parts = String(signatureHeader || "").split(",").reduce((acc, part) => {
    const [key, value] = part.split("=");
    if (key && value) acc[key] = value;
    return acc;
  }, {});

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) throw new Error("Firma de Stripe incompleta.");

  const signedPayload = `${timestamp}.${rawBody.toString("utf8")}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const signatureBuffer = Buffer.from(signature, "hex");

  if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
    throw new Error("Firma de Stripe no válida.");
  }
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
    if ([
      "checkout.session.completed",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ].includes(event.type)) {
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
  stripeBusinessWebhook,
};
