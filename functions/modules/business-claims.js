const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const fetch = require("node-fetch");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { assertJefeAccess, writeAuditLog } = require("./lib/auth");

const resendApiKey = defineSecret("RESEND_API_KEY");
const db = getFirestore();

const CLAIM_REVIEW_EMAILS = (process.env.BUSINESS_CLAIMS_TO_EMAILS || process.env.BUSINESS_CLAIMS_TO_EMAIL || "istaricore@gmail.com")
  .split(",")
  .map((email) => email.trim())
  .filter(Boolean);
const CLAIM_FROM_EMAIL = process.env.BUSINESS_CLAIMS_FROM_EMAIL || "Listopic <onboarding@resend.dev>";
const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN || "https://listopic.es").replace(/\/$/, "");

const escapeHtml = (value) => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const buildEmailHtml = (claimId, claim) => {
  const developerUrl = `${PUBLIC_ORIGIN}/developer?tab=businessClaims&claimId=${encodeURIComponent(claimId)}`;
  const placeUrl = `${PUBLIC_ORIGIN}/place/${encodeURIComponent(claim.placeId || "")}`;
  const proofs = Array.isArray(claim.proofs) ? claim.proofs : [];

  const proofList = proofs.length
    ? `<ul>${proofs.map((proof) => `<li><a href="${escapeHtml(proof.downloadUrl)}">${escapeHtml(proof.name || proof.storagePath || "Prueba")}</a></li>`).join("")}</ul>`
    : "<p>No se adjuntaron archivos.</p>";

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h2>Nueva reclamación de negocio</h2>
      <p><strong>Lugar:</strong> ${escapeHtml(claim.placeName)}<br/>
      <strong>Place ID:</strong> ${escapeHtml(claim.placeId)}<br/>
      <strong>Solicitante:</strong> ${escapeHtml(claim.userName || claim.userEmail || claim.userId)}<br/>
      <strong>Email:</strong> ${escapeHtml(claim.contactEmail || claim.userEmail)}<br/>
      <strong>Relación:</strong> ${escapeHtml(claim.role)}</p>

      <p><strong>Solicitud:</strong></p>
      <p style="white-space:pre-wrap">${escapeHtml(claim.message)}</p>

      <p><strong>Pruebas:</strong></p>
      ${proofList}

      <p>
        <a href="${developerUrl}" style="display:inline-block;background:#6d5dfc;color:white;padding:10px 14px;border-radius:8px;text-decoration:none;font-weight:bold">Abrir en Developer</a>
        &nbsp;
        <a href="${placeUrl}">Ver lugar</a>
      </p>
    </div>
  `;
};

const sendResendEmail = async ({ to, subject, html }) => {
  const apiKey = process.env.RESEND_API_KEY || (() => {
    try {
      return resendApiKey.value();
    } catch (_) {
      return "";
    }
  })();

  if (!apiKey) {
    logger.warn("businessClaims: RESEND_API_KEY no configurada; no se envía email.");
    return { skipped: true };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: CLAIM_FROM_EMAIL,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend error ${response.status}: ${body}`);
  }

  return response.json();
};

const onBusinessClaimCreated = onDocumentCreated({
  document: "businessClaims/{claimId}",
  secrets: [resendApiKey],
}, async (event) => {
  const claimId = event.params.claimId;
  const claim = event.data?.data();
  if (!claim) return;

  try {
    await sendResendEmail({
      to: CLAIM_REVIEW_EMAILS,
      subject: `Nueva reclamación de negocio: ${claim.placeName || claim.placeId || claimId}`,
      html: buildEmailHtml(claimId, claim),
    });
    logger.info("businessClaims: email de aviso enviado", { claimId, to: CLAIM_REVIEW_EMAILS });
  } catch (error) {
    logger.error("businessClaims: error enviando email de aviso", { claimId, error: error.message || String(error) });
  }
});

const asString = (value, maxLength = 1000) => (typeof value === "string" ? value.trim().slice(0, maxLength) : "");

const notificationForClaim = (claimId, claim, status, adminNotes) => {
  const approved = status === "approved";
  return {
    type: "business_claim_reviewed",
    title: approved ? "Solicitud de negocio aprobada" : "Solicitud de negocio rechazada",
    message: approved
      ? `Ya puedes gestionar ${claim.placeName || "tu negocio"} desde Mis negocios.`
      : `Tu solicitud para ${claim.placeName || "este negocio"} ha sido rechazada.${adminNotes ? ` Motivo: ${adminNotes}` : ""}`,
    claimId,
    placeId: claim.placeId || "",
    placeName: claim.placeName || "",
    status,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
    link: approved ? "/businesses" : `/place/${encodeURIComponent(claim.placeId || "")}`,
  };
};

const reviewBusinessClaim = onCall(async (request) => {
  const actorUid = request.auth?.uid;
  await assertJefeAccess(actorUid, "Solo un administrador puede revisar reclamaciones de negocio.");

  const claimId = asString(request.data?.claimId, 300);
  const status = asString(request.data?.status, 20);
  const adminNotes = asString(request.data?.adminNotes, 1600);

  if (!claimId) throw new HttpsError("invalid-argument", "Falta claimId.");
  if (status !== "approved" && status !== "rejected") {
    throw new HttpsError("invalid-argument", "Estado de revision no valido.");
  }
  if (status === "rejected" && adminNotes.length < 8) {
    throw new HttpsError("failed-precondition", "Indica un motivo de rechazo antes de rechazar la solicitud.");
  }

  const claimRef = db.collection("businessClaims").doc(claimId);
  let claimData = null;

  await db.runTransaction(async (tx) => {
    const claimSnap = await tx.get(claimRef);
    if (!claimSnap.exists) throw new HttpsError("not-found", "La solicitud no existe.");

    claimData = claimSnap.data();
    if (claimData.status !== "pending") {
      throw new HttpsError("failed-precondition", "Esta solicitud ya fue revisada.");
    }
    if (!claimData.userId || !claimData.placeId) {
      throw new HttpsError("failed-precondition", "La solicitud no tiene usuario o lugar asociado.");
    }

    tx.update(claimRef, {
      status,
      adminNotes,
      reviewedBy: actorUid,
      reviewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (status === "approved") {
      tx.set(db.collection("places").doc(claimData.placeId), {
        businessVerified: true,
        businessClaimId: claimId,
        businessOwnerUserId: claimData.userId,
        businessManagerIds: FieldValue.arrayUnion(claimData.userId),
        businessClaimedAt: FieldValue.serverTimestamp(),
        businessVerifiedBy: actorUid,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    tx.set(
      db.collection("users").doc(claimData.userId).collection("notifications").doc(`business_claim_${claimId}`),
      notificationForClaim(claimId, claimData, status, adminNotes),
      { merge: true },
    );
  });

  await writeAuditLog(actorUid, "businessClaim.review", {
    claimId,
    status,
    placeId: claimData?.placeId || null,
    targetUserId: claimData?.userId || null,
  });

  return { ok: true, status };
});

async function getUserDocBySearch(searchTerm) {
  const term = asString(searchTerm, 180);
  if (!term) throw new HttpsError("invalid-argument", "Indica uid, username o email.");

  const directSnap = await db.collection("users").doc(term).get();
  if (directSnap.exists) return directSnap;

  const normalized = term.toLowerCase().replace(/^@/, "");
  const checks = [
    ["usernameLower", normalized],
    ["emailLowerCase", normalized],
    ["email", term],
  ];

  for (const [field, value] of checks) {
    const snap = await db.collection("users").where(field, "==", value).limit(1).get();
    if (!snap.empty) return snap.docs[0];
  }

  throw new HttpsError("not-found", "No se encontro ningun usuario con esos datos.");
}

function publicUser(userDoc) {
  const data = userDoc.data() || {};
  return {
    id: userDoc.id,
    username: data.username || "",
    displayName: data.displayName || data.name || "",
    email: data.email || "",
    photoUrl: data.photoUrl || data.photoURL || "",
  };
}

async function assertBusinessManagerAccess(placeId, uid) {
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesion.");
  const placeRef = db.collection("places").doc(placeId);
  const placeSnap = await placeRef.get();
  if (!placeSnap.exists) throw new HttpsError("not-found", "El negocio no existe.");
  const place = placeSnap.data() || {};
  const managerIds = Array.isArray(place.businessManagerIds) ? place.businessManagerIds : [];
  const isOwner = place.businessOwnerUserId === uid;
  const isManager = managerIds.includes(uid);
  let isAdmin = false;
  try {
    await assertJefeAccess(uid);
    isAdmin = true;
  } catch (_) {
    isAdmin = false;
  }
  if (!isOwner && !isManager && !isAdmin) {
    throw new HttpsError("permission-denied", "No puedes gestionar este negocio.");
  }
  return { placeRef, place, isOwner, isAdmin };
}

const getBusinessTeam = onCall(async (request) => {
  const uid = request.auth?.uid;
  const placeId = asString(request.data?.placeId, 300);
  if (!placeId) throw new HttpsError("invalid-argument", "Falta placeId.");

  const { place } = await assertBusinessManagerAccess(placeId, uid);
  const ids = Array.from(new Set([
    ...(Array.isArray(place.businessManagerIds) ? place.businessManagerIds : []),
    place.businessOwnerUserId || "",
  ].filter(Boolean)));

  const users = [];
  for (const id of ids) {
    const snap = await db.collection("users").doc(id).get();
    users.push(snap.exists ? publicUser(snap) : { id });
  }

  return {
    ownerUserId: place.businessOwnerUserId || "",
    managerIds: Array.isArray(place.businessManagerIds) ? place.businessManagerIds : [],
    users,
  };
});

const updateBusinessTeamMember = onCall(async (request) => {
  const uid = request.auth?.uid;
  const placeId = asString(request.data?.placeId, 300);
  const action = asString(request.data?.action, 20);
  if (!placeId) throw new HttpsError("invalid-argument", "Falta placeId.");
  if (action !== "add" && action !== "remove") throw new HttpsError("invalid-argument", "Accion no valida.");

  const { placeRef, place, isOwner, isAdmin } = await assertBusinessManagerAccess(placeId, uid);
  if (!isOwner && !isAdmin) {
    throw new HttpsError("permission-denied", "Solo el propietario puede cambiar el equipo del negocio.");
  }

  const targetUserDoc = action === "add"
    ? await getUserDocBySearch(request.data?.userSearch)
    : await db.collection("users").doc(asString(request.data?.targetUserId, 300)).get();
  if (!targetUserDoc.exists) throw new HttpsError("not-found", "No se encontro el usuario.");
  const targetUid = targetUserDoc.id;

  if (targetUid === place.businessOwnerUserId && action === "remove") {
    throw new HttpsError("failed-precondition", "No puedes quitar al propietario principal.");
  }

  await placeRef.update({
    businessManagerIds: action === "add" ? FieldValue.arrayUnion(targetUid) : FieldValue.arrayRemove(targetUid),
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.info("businessClaims: equipo de negocio actualizado", { placeId, actorUid: uid, targetUid, action });
  return { ok: true, user: publicUser(targetUserDoc), action };
});

const updateBusinessSettings = onCall({ region: "europe-west1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

  const placeId = asString(request.data?.placeId, 500);
  if (!placeId) throw new HttpsError("invalid-argument", "placeId requerido.");

  const placeRef = db.collection("places").doc(placeId);
  const placeSnap = await placeRef.get();
  if (!placeSnap.exists) throw new HttpsError("not-found", "Lugar no encontrado.");

  const placeData = placeSnap.data();
  const isOwner = placeData.businessOwnerUserId === uid;
  const isManager = Array.isArray(placeData.businessManagerIds) && placeData.businessManagerIds.includes(uid);
  if (!isOwner && !isManager) throw new HttpsError("permission-denied", "No tienes permiso para gestionar este negocio.");

  const updatePayload = {};

  if ("coverManagerId" in request.data) {
    const raw = request.data.coverManagerId;
    if (raw === null || raw === "") {
      updatePayload.coverManagerId = FieldValue.delete();
    } else {
      if (typeof raw !== "string") throw new HttpsError("invalid-argument", "coverManagerId debe ser un string.");
      if (raw.length > 200) throw new HttpsError("invalid-argument", "coverManagerId demasiado largo.");
      if (!/^[a-zA-Z0-9_-]+$/.test(raw)) throw new HttpsError("invalid-argument", "coverManagerId solo puede contener letras, números, guiones y guiones bajos.");
      updatePayload.coverManagerId = raw;
    }
  }

  if (Object.keys(updatePayload).length === 0) return { ok: true };

  updatePayload.updatedAt = FieldValue.serverTimestamp();
  await placeRef.update(updatePayload);
  logger.info("businessSettings: ajustes actualizados", { placeId, actorUid: uid });
  return { ok: true };
});

module.exports = {
  onBusinessClaimCreated,
  reviewBusinessClaim,
  getBusinessTeam,
  updateBusinessTeamMember,
  updateBusinessSettings,
};
