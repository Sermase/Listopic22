// functions/modules/plan-interest.js
//
// registerPlanInterest: botón «Lo quiero» de /planes y del paywall de Business Pro.
// Guarda la intención en planInterest/{id} (lo leen los jefes en Developer → Planes)
// y, mientras la beta esté abierta, activa el plan como prueba gratuita
// (source 'trial' con caducidad; expireManualPlans lo degrada al vencer).
// Una sola prueba por usuario y por local. No toca Stripe ni pide tarjeta.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { writeAuditLog } = require("./lib/auth");
const { hasActiveBusinessPro, hasActiveUserPremium } = require("./lib/business-plan");
const {
  PLAN_BETA,
  normalizeInterestRequest,
  interestDocId,
  priceShown,
  trialExpiry,
} = require("./lib/plan-beta");

const db = getFirestore();

const registerPlanInterest = onCall({ invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

  const input = normalizeInterestRequest(request.data);
  if (input.error) throw new HttpsError("invalid-argument", input.error);
  const { plan, billing, placeId } = input;

  const interestRef = db.collection("planInterest").doc(interestDocId(input, uid));
  const targetRef = placeId ? db.collection("places").doc(placeId) : db.collection("users").doc(uid);

  const result = await db.runTransaction(async (tx) => {
    const [interestSnap, targetSnap] = await Promise.all([tx.get(interestRef), tx.get(targetRef)]);
    if (!targetSnap.exists) {
      throw new HttpsError("not-found", placeId ? "El negocio no existe." : "Tu perfil no existe.");
    }
    const target = targetSnap.data() || {};

    if (placeId) {
      const managerIds = Array.isArray(target.businessManagerIds) ? target.businessManagerIds : [];
      if (!target.businessVerified || (target.businessOwnerUserId !== uid && !managerIds.includes(uid))) {
        throw new HttpsError("permission-denied", "Solo un gestor verificado puede activar Business Pro en este local.");
      }
    }

    const previous = interestSnap.exists ? interestSnap.data() || {} : {};
    const alreadyActive = placeId ? hasActiveBusinessPro(target) : hasActiveUserPremium(target);
    // Negocio sin local verificado: solo se cuenta el interés.
    const canGrant = plan === "premium" || Boolean(placeId);
    const grant = PLAN_BETA.open && canGrant && !alreadyActive && !previous.trialGrantedAt;
    const expiresAt = grant ? Timestamp.fromDate(trialExpiry()) : null;

    if (grant && placeId) {
      tx.set(targetRef, {
        businessTier: "pro",
        businessProActive: true,
        businessPlanSource: "trial",
        businessPlanExpiresAt: expiresAt,
        businessPlanGrantedBy: "beta",
        businessPlanNotes: "Beta gratuita",
        businessPlanUpdatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } else if (grant) {
      tx.set(targetRef, {
        premium: {
          active: true,
          tier: "premium",
          source: "trial",
          expiresAt,
          grantedBy: "beta",
          notes: "Beta gratuita",
          updatedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    tx.set(interestRef, {
      plan,
      billing,
      priceShownEur: priceShown(plan, billing),
      userId: uid,
      placeId: placeId || null,
      placeName: placeId ? (target.name || null) : null,
      clicks: FieldValue.increment(1),
      lastAt: FieldValue.serverTimestamp(),
      ...(interestSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      ...(grant ? { trialGrantedAt: FieldValue.serverTimestamp(), trialExpiresAt: expiresAt } : {}),
    }, { merge: true });

    let status = "registered";
    if (grant) status = "trial_started";
    else if (alreadyActive) status = "already_active";
    else if (previous.trialGrantedAt) status = "trial_used";

    return {
      status,
      expiresAt: (grant ? expiresAt : previous.trialExpiresAt)?.toDate?.().toISOString() || null,
    };
  });

  if (result.status === "trial_started") {
    await writeAuditLog(uid, placeId ? "businessPlan.betaTrial" : "userPlan.betaTrial", {
      placeId: placeId || null,
      billing,
      expiresAt: result.expiresAt,
    });
  }

  return result;
});

module.exports = { registerPlanInterest };
