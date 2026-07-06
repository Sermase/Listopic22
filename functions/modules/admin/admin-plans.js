// functions/modules/admin/admin-plans.js
//
// Gestión manual de planes (entitlements) desde la pestaña Planes de Developer:
// - adminSetBusinessPlan: activa/quita Business Pro a un lugar (source manual/trial).
// - adminSetUserPlan: activa/quita premium personal a un usuario.
// - expireManualPlans: scheduled diaria que degrada planes manuales caducados.
//
// La procedencia ('manual' | 'trial' | 'stripe') permite convivir con Stripe:
// el webhook no degrada planes manuales, y estas callables no tocan planes
// con suscripción de Stripe activa (se gestionan desde Stripe).

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { assertJefeAccess, writeAuditLog } = require('../lib/auth');
const { MANUAL_PLAN_SOURCES } = require('../lib/business-plan');

const db = getFirestore();

const ACTIVE_STRIPE_STATUSES = new Set(['active', 'trialing', 'past_due']);

function parseExpiresAt(value) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpsError('invalid-argument', 'La fecha de caducidad no es válida.');
  }
  if (date.getTime() <= Date.now()) {
    throw new HttpsError('invalid-argument', 'La fecha de caducidad debe ser futura.');
  }
  return Timestamp.fromDate(date);
}

function asTrimmedString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function hasActiveStripeSubscription(placeData = {}) {
  return placeData.businessPlanSource === 'stripe'
    && Boolean(placeData.stripeSubscriptionId)
    && ACTIVE_STRIPE_STATUSES.has(placeData.businessBillingStatus);
}

// invoker: 'public' fuerza el permiso de invocación no autenticada en Cloud Run
// (la autorización real la hace Firebase Auth + assertJefeAccess). Sin esto, el
// despliegue puede dejar la función devolviendo 401 antes de llegar al código.
const adminSetBusinessPlan = onCall({ invoker: "public" }, async (request) => {
  const actorUid = request.auth?.uid;
  await assertJefeAccess(actorUid);

  const placeId = asTrimmedString(request.data?.placeId, 300);
  const active = request.data?.active === true;
  const notes = asTrimmedString(request.data?.notes, 500);
  const expiresAt = active ? parseExpiresAt(request.data?.expiresAt) : null;

  if (!placeId) throw new HttpsError('invalid-argument', 'Falta placeId.');

  const placeRef = db.collection('places').doc(placeId);
  const placeSnap = await placeRef.get();
  if (!placeSnap.exists) throw new HttpsError('not-found', 'El negocio no existe.');
  const place = placeSnap.data() || {};

  if (!active && hasActiveStripeSubscription(place)) {
    throw new HttpsError(
      'failed-precondition',
      'Este negocio tiene una suscripción de Stripe activa. Cancélala desde Stripe; el webhook degradará el plan automáticamente.',
    );
  }

  const source = active ? (expiresAt ? 'trial' : 'manual') : null;
  const patch = active
    ? {
      businessTier: 'pro',
      businessProActive: true,
      businessPlanSource: source,
      businessPlanExpiresAt: expiresAt || FieldValue.delete(),
      businessPlanGrantedBy: actorUid,
      businessPlanNotes: notes || FieldValue.delete(),
      businessPlanUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }
    : {
      businessTier: 'free',
      businessProActive: false,
      businessPlanSource: FieldValue.delete(),
      businessPlanExpiresAt: FieldValue.delete(),
      businessPlanGrantedBy: FieldValue.delete(),
      businessPlanNotes: notes || FieldValue.delete(),
      businessPlanUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

  await placeRef.set(patch, { merge: true });

  await writeAuditLog(actorUid, active ? 'businessPlan.manualGrant' : 'businessPlan.manualRevoke', {
    placeId,
    placeName: place.name || null,
    source,
    expiresAt: expiresAt ? expiresAt.toDate().toISOString() : null,
    notes: notes || null,
  });

  return {
    ok: true,
    placeId,
    active,
    source,
    expiresAt: expiresAt ? expiresAt.toDate().toISOString() : null,
  };
});

const adminSetUserPlan = onCall({ invoker: "public" }, async (request) => {
  const actorUid = request.auth?.uid;
  await assertJefeAccess(actorUid);

  const userId = asTrimmedString(request.data?.userId, 300);
  const active = request.data?.active === true;
  const notes = asTrimmedString(request.data?.notes, 500);
  const expiresAt = active ? parseExpiresAt(request.data?.expiresAt) : null;

  if (!userId) throw new HttpsError('invalid-argument', 'Falta userId.');

  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new HttpsError('not-found', 'El usuario no existe.');
  const user = userSnap.data() || {};

  if (!active && user.premium?.source === 'stripe' && user.premium?.active === true) {
    throw new HttpsError(
      'failed-precondition',
      'Este usuario tiene una suscripción de Stripe activa. Cancélala desde Stripe.',
    );
  }

  const source = active ? (expiresAt ? 'trial' : 'manual') : null;
  const premium = active
    ? {
      active: true,
      tier: 'premium',
      source,
      expiresAt: expiresAt || null,
      grantedBy: actorUid,
      notes: notes || null,
      updatedAt: FieldValue.serverTimestamp(),
    }
    : {
      active: false,
      tier: null,
      source: null,
      expiresAt: null,
      grantedBy: null,
      notes: notes || null,
      updatedAt: FieldValue.serverTimestamp(),
    };

  await userRef.set({ premium, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  await writeAuditLog(actorUid, active ? 'userPlan.manualGrant' : 'userPlan.manualRevoke', {
    userId,
    username: user.username || null,
    source,
    expiresAt: expiresAt ? expiresAt.toDate().toISOString() : null,
    notes: notes || null,
  });

  return {
    ok: true,
    userId,
    active,
    source,
    expiresAt: expiresAt ? expiresAt.toDate().toISOString() : null,
  };
});

// Degrada planes manuales/trial cuya caducidad ya pasó. Los planes de Stripe
// los gestiona el webhook; los indefinidos no tienen businessPlanExpiresAt.
const expireManualPlans = onSchedule(
  {
    schedule: 'every day 03:30',
    timeZone: 'Europe/Madrid',
  },
  async () => {
    const now = Timestamp.now();

    const expiredPlaces = await db.collection('places')
      .where('businessPlanExpiresAt', '<=', now)
      .limit(200)
      .get();

    for (const placeDoc of expiredPlaces.docs) {
      const place = placeDoc.data() || {};
      if (place.businessProActive !== true || !MANUAL_PLAN_SOURCES.has(place.businessPlanSource)) continue;
      await placeDoc.ref.set({
        businessTier: 'free',
        businessProActive: false,
        businessPlanSource: FieldValue.delete(),
        businessPlanExpiresAt: FieldValue.delete(),
        businessPlanUpdatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      await writeAuditLog('system', 'businessPlan.expired', {
        placeId: placeDoc.id,
        placeName: place.name || null,
        previousSource: place.businessPlanSource,
      });
    }

    const expiredUsers = await db.collection('users')
      .where('premium.expiresAt', '<=', now)
      .limit(200)
      .get();

    for (const userDoc of expiredUsers.docs) {
      const user = userDoc.data() || {};
      if (user.premium?.active !== true || !MANUAL_PLAN_SOURCES.has(user.premium?.source)) continue;
      await userDoc.ref.set({
        premium: {
          active: false,
          tier: null,
          source: null,
          expiresAt: null,
          grantedBy: null,
          notes: user.premium?.notes || null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      await writeAuditLog('system', 'userPlan.expired', {
        userId: userDoc.id,
        username: user.username || null,
        previousSource: user.premium?.source,
      });
    }

    logger.info('expireManualPlans: completado', {
      placesChecked: expiredPlaces.size,
      usersChecked: expiredUsers.size,
    });
  },
);

module.exports = {
  adminSetBusinessPlan,
  adminSetUserPlan,
  expireManualPlans,
};
