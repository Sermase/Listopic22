const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const fetch = require("node-fetch");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { assertJefeAccess, rateLimit, writeAuditLog } = require("./lib/auth");
const { sendNotification } = require("./notifications");

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
const BUSINESS_INFO_SECTIONS = ["identity", "contact", "commercial", "accessibility", "dietary", "hours", "reservations", "deliveries"];
const BUSINESS_INFO_SCHEMA_VERSION = 1;
const BUSINESS_INFO_FREE_SECTIONS = new Set(BUSINESS_INFO_SECTIONS);
const VALID_PRICE_RANGES = new Set(["low", "medium", "high", "premium"]);
const VALID_CROSS_CONTAMINATION_RISKS = new Set(["unknown", "possible", "controlled", "dedicated"]);
const VALID_RESERVATION_PROVIDERS = new Set(["covermanager", "thefork", "opentable", "zenchef", "resy", "google", "custom"]);
const VALID_RESERVATION_DISPLAY_MODES = new Set(["external", "modal", "both"]);
const VALID_DELIVERY_PROVIDERS = new Set(["glovo", "justeat", "ubereats", "deliveroo", "deliverect", "own", "whatsapp", "custom"]);
const VALID_SOURCES = new Set(["business_user", "admin_override", "ai_extracted", "user_suggestion"]);

const asStringArray = (value, maxItems = 20, maxLength = 80) => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map((item) => asString(item, maxLength))
    .filter(Boolean)))
    .slice(0, maxItems);
};

const asBoolean = (value) => value === true;

const sanitizeLocalizedText = (value, maxLength = 1000) => {
  if (typeof value === "string") {
    const es = asString(value.replace(/[<>]/g, ""), maxLength);
    return es ? { es } : {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  ["es", "en"].forEach((lang) => {
    const text = asString(value[lang]?.replace ? value[lang].replace(/[<>]/g, "") : value[lang], maxLength);
    if (text) result[lang] = text;
  });
  return result;
};

const sanitizeUrl = (value) => {
  const raw = asString(value, 400);
  if (!raw) return "";
  try {
    const url = new URL(raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString().slice(0, 400);
  } catch (_) {
    return "";
  }
};

const extractIframeSrc = (value) => {
  const raw = asString(value, 1200);
  if (!raw) return "";
  const match = raw.match(/src=["']([^"']+)["']/i);
  return match ? match[1] : raw;
};

const sanitizeReservationUrl = (value) => sanitizeUrl(extractIframeSrc(value));

const sanitizeEmail = (value) => {
  const email = asString(value, 180).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
};

const sanitizeInstagram = (value) => {
  const raw = asString(value, 120);
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    const url = sanitizeUrl(raw);
    return url.includes("instagram.com/") ? url : "";
  }
  return raw.replace(/^@/, "").replace(/[^a-zA-Z0-9._]/g, "").slice(0, 60);
};

const isTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const sanitizePeriods = (value, maxItems = 4) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((period) => {
      if (!period || typeof period !== "object") return null;
      const open = asString(period.open, 5);
      const close = asString(period.close, 5);
      if (!isTime(open) || !isTime(close)) return null;
      return { open, close };
    })
    .filter(Boolean)
    .slice(0, maxItems);
};

const sanitizeBusinessInfoData = (section, raw) => {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  if (section === "identity") {
    return {
      displayName: sanitizeLocalizedText(input.displayName, 120),
      description: sanitizeLocalizedText(input.description, 1400),
      languages: asStringArray(input.languages, 12, 40),
    };
  }
  if (section === "contact") {
    return {
      phone: asString(input.phone, 40),
      website: sanitizeUrl(input.website),
      email: sanitizeEmail(input.email),
      instagram: sanitizeInstagram(input.instagram),
    };
  }
  if (section === "commercial") {
    const priceRange = asString(input.priceRange, 20);
    return {
      priceRange: VALID_PRICE_RANGES.has(priceRange) ? priceRange : "",
      cuisineTypes: asStringArray(input.cuisineTypes, 20, 60),
      paymentMethods: asStringArray(input.paymentMethods, 20, 60),
      services: asStringArray(input.services, 30, 80),
    };
  }
  if (section === "accessibility") {
    return {
      wheelchairAccess: asBoolean(input.wheelchairAccess),
      accessibleBathroom: asBoolean(input.accessibleBathroom),
      stepFreeEntrance: asBoolean(input.stepFreeEntrance),
      babyChanging: asBoolean(input.babyChanging),
      petFriendly: asBoolean(input.petFriendly),
      hearingLoop: asBoolean(input.hearingLoop),
      notes: asString(String(input.notes || "").replace(/[<>]/g, ""), 700),
    };
  }
  if (section === "dietary") {
    const crossContaminationRisk = asString(input.crossContaminationRisk, 20);
    return {
      glutenFreeOptions: asBoolean(input.glutenFreeOptions),
      manyGlutenFreeOptions: asBoolean(input.manyGlutenFreeOptions),
      glutenFreeMenu: asBoolean(input.glutenFreeMenu),
      crossContaminationRisk: VALID_CROSS_CONTAMINATION_RISKS.has(crossContaminationRisk) ? crossContaminationRisk : "",
      crossContaminationNotes: asString(String(input.crossContaminationNotes || "").replace(/[<>]/g, ""), 700),
      vegetarianOptions: asBoolean(input.vegetarianOptions),
      veganOptions: asBoolean(input.veganOptions),
      dairyFreeOptions: asBoolean(input.dairyFreeOptions),
      nutFreeOptions: asBoolean(input.nutFreeOptions),
      eggFreeOptions: asBoolean(input.eggFreeOptions),
      allergenMenuAvailable: asBoolean(input.allergenMenuAvailable),
      staffCanAdviseAllergens: asBoolean(input.staffCanAdviseAllergens),
      allergens: asStringArray(input.allergens, 20, 80),
      notes: asString(String(input.notes || "").replace(/[<>]/g, ""), 900),
    };
  }
  if (section === "hours") {
    const weeklySchedule = Array.isArray(input.weeklySchedule) ? input.weeklySchedule : [];
    const specialHours = Array.isArray(input.specialHours) ? input.specialHours : [];
    const temporaryClosures = Array.isArray(input.temporaryClosures) ? input.temporaryClosures : [];
    return {
      weeklySchedule: weeklySchedule
        .map((day) => {
          if (!day || typeof day !== "object") return null;
          const parsedDay = Number(day.day);
          if (!Number.isInteger(parsedDay) || parsedDay < 0 || parsedDay > 6) return null;
          const periods = sanitizePeriods(day.periods);
          if (day.closed !== true && periods.length === 0) return null;
          return { day: parsedDay, closed: day.closed === true, periods };
        })
        .filter(Boolean)
        .slice(0, 7),
      specialHours: specialHours
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const date = asString(item.date, 10);
          if (!isDate(date)) return null;
          return {
            date,
            label: asString(String(item.label || "").replace(/[<>]/g, ""), 80),
            closed: item.closed === true,
            periods: sanitizePeriods(item.periods),
          };
        })
        .filter(Boolean)
        .slice(0, 30),
      temporaryClosures: temporaryClosures
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const from = asString(item.from, 10);
          const to = asString(item.to, 10);
          if (!isDate(from) || !isDate(to)) return null;
          return { from, to, reason: asString(String(item.reason || "").replace(/[<>]/g, ""), 160) };
        })
        .filter(Boolean)
        .slice(0, 10),
      notes: asString(String(input.notes || "").replace(/[<>]/g, ""), 700),
    };
  }
  if (section === "reservations") {
    const provider = asString(input.provider, 40);
    const displayMode = asString(input.displayMode, 20);
    const embedUrl = sanitizeReservationUrl(input.embedUrl || input.widgetUrl || input.iframe || input.code);
    const externalUrl = sanitizeReservationUrl(input.externalUrl || input.reservationUrl || input.url || embedUrl);
    const enabled = input.enabled === true && Boolean(embedUrl || externalUrl);
    return {
      enabled,
      provider: VALID_RESERVATION_PROVIDERS.has(provider) ? provider : "custom",
      embedUrl,
      externalUrl,
      displayMode: VALID_RESERVATION_DISPLAY_MODES.has(displayMode) ? displayMode : embedUrl ? "modal" : "external",
      buttonText: asString(String(input.buttonText || "Reservar mesa").replace(/[<>]/g, ""), 50) || "Reservar mesa",
    };
  }
  if (section === "deliveries") {
    const rawLinks = Array.isArray(input.links) ? input.links : [];
    const links = rawLinks
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const provider = asString(item.provider, 30);
        const url = sanitizeUrl(item.url);
        if (!url) return null;
        return {
          provider: VALID_DELIVERY_PROVIDERS.has(provider) ? provider : "custom",
          label: asString(String(item.label || "").replace(/[<>]/g, ""), 60),
          url,
        };
      })
      .filter(Boolean)
      .slice(0, 8);
    return {
      enabled: input.enabled === true && links.length > 0,
      links,
      notes: asString(String(input.notes || "").replace(/[<>]/g, ""), 700),
    };
  }
  throw new HttpsError("invalid-argument", "Sección no válida.");
};

const hasContent = (value) => {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.values(value).some(hasContent);
  if (typeof value === "boolean") return value === true;
  return Boolean(value);
};

const pruneEmpty = (value) => {
  if (Array.isArray(value)) return value.map(pruneEmpty).filter((item) => hasContent(item));
  if (value && typeof value === "object") {
    const result = {};
    Object.entries(value).forEach(([key, child]) => {
      const cleaned = pruneEmpty(child);
      if (hasContent(cleaned)) result[key] = cleaned;
    });
    return result;
  }
  return value;
};

const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const getBusinessInfoChangedFields = (beforeDoc, afterDoc) => {
  const beforeData = beforeDoc?.data && typeof beforeDoc.data === "object" ? beforeDoc.data : {};
  const afterData = afterDoc?.data && typeof afterDoc.data === "object" ? afterDoc.data : {};
  const keys = new Set([...Object.keys(beforeData), ...Object.keys(afterData)]);
  const changed = [];
  keys.forEach((key) => {
    if (stableStringify(beforeData[key]) !== stableStringify(afterData[key])) changed.push(`data.${key}`);
  });
  if (stableStringify(beforeDoc?.hiddenFields || []) !== stableStringify(afterDoc?.hiddenFields || [])) {
    changed.push("hiddenFields");
  }
  if ((beforeDoc?.status || "active") !== (afterDoc?.status || "active")) changed.push("status");
  if ((beforeDoc?.source || "business_user") !== (afterDoc?.source || "business_user")) changed.push("source");
  return changed.slice(0, 40);
};

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
    throw new HttpsError("invalid-argument", "Estado de revisión no válido.");
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

  });

  await sendNotification(
    claimData.userId,
    "business_claim_reviewed",
    notificationForClaim(claimId, claimData, status, adminNotes),
    { notificationId: `business_claim_${claimId}` },
  );

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

  throw new HttpsError("not-found", "No se encontró ningún usuario con esos datos.");
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
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
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
  const makeOwner = request.data?.makeOwner === true;
  if (!placeId) throw new HttpsError("invalid-argument", "Falta placeId.");
  if (action !== "add" && action !== "remove") throw new HttpsError("invalid-argument", "Acción no válida.");

  const { placeRef, place, isOwner, isAdmin } = await assertBusinessManagerAccess(placeId, uid);
  if (!isOwner && !isAdmin) {
    throw new HttpsError("permission-denied", "Solo el propietario puede cambiar el equipo del negocio.");
  }

  const targetUserDoc = action === "add"
    ? await getUserDocBySearch(request.data?.userSearch)
    : await db.collection("users").doc(asString(request.data?.targetUserId, 300)).get();
  if (!targetUserDoc.exists) throw new HttpsError("not-found", "No se encontró el usuario.");
  const targetUid = targetUserDoc.id;

  if (targetUid === place.businessOwnerUserId && action === "remove") {
    throw new HttpsError("failed-precondition", "No puedes quitar al propietario principal.");
  }

  const updatePayload = {
    businessManagerIds: action === "add" ? FieldValue.arrayUnion(targetUid) : FieldValue.arrayRemove(targetUid),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (action === "add" && makeOwner) {
    updatePayload.businessOwnerUserId = targetUid;
    updatePayload.businessVerified = true;
  }

  await placeRef.update(updatePayload);

  if (action === "add" && targetUid !== uid) {
    const placeName = place.name || place.displayName || "un negocio";
    await sendNotification(targetUid, "business_assigned", {
      senderId: uid,
      placeId,
      placeName,
      role: makeOwner ? "owner" : "manager",
      message: makeOwner
        ? `Te han asignado como propietario de ${placeName}.`
        : `Te han asignado la gestión de ${placeName}.`,
      link: "/businesses",
    }, { notificationId: `business_assigned_${placeId}` });
  }

  logger.info("businessClaims: equipo de negocio actualizado", { placeId, actorUid: uid, targetUid, action });
  return { ok: true, user: publicUser(targetUserDoc), action };
});

async function buildResolvedBusinessProjection(tx, placeId) {
  const resolved = {};
  const hiddenFields = {};

  for (const section of BUSINESS_INFO_SECTIONS) {
    const infoRef = db.collection("places").doc(placeId).collection("businessInfo").doc(section);
    const snap = tx ? await tx.get(infoRef) : await infoRef.get();
    if (!snap.exists) continue;
    const docData = snap.data() || {};
    if (docData.status !== "active") continue;

    const cleanedData = section === "accessibility" ? (docData.data || {}) : pruneEmpty(docData.data || {});
    if (hasContent(cleanedData)) resolved[section] = cleanedData;
    const sectionHiddenFields = Array.isArray(docData.hiddenFields)
      ? docData.hiddenFields.filter((field) => typeof field === "string" && field.length <= 80)
      : [];
    if (sectionHiddenFields.length) hiddenFields[section] = sectionHiddenFields;
  }

  if (Object.keys(hiddenFields).length) resolved.hiddenFields = hiddenFields;
  return resolved;
}

async function writeBusinessInfoHistory(tx, placeId, section, actorUid, beforeData, afterData) {
  const historyRef = db.collection("places").doc(placeId).collection("businessInfoHistory").doc();
  const changedFields = getBusinessInfoChangedFields(beforeData, afterData);
  if (beforeData && changedFields.length === 0) return;
  tx.set(historyRef, {
    section,
    beforeVersion: Number(beforeData?.version || 0),
    afterVersion: Number(afterData?.version || 0),
    changedFields,
    changedBy: actorUid,
    reason: "business_update",
    createdAt: FieldValue.serverTimestamp(),
  });
}

const getBusinessInfoForManager = onCall(async (request) => {
  const uid = request.auth?.uid;
  const placeId = asString(request.data?.placeId, 300);
  if (!placeId) throw new HttpsError("invalid-argument", "Falta placeId.");

  await assertBusinessManagerAccess(placeId, uid);

  const sections = {};
  const snaps = await Promise.all(BUSINESS_INFO_SECTIONS.map((section) => (
    db.collection("places").doc(placeId).collection("businessInfo").doc(section).get()
  )));

  snaps.forEach((snap, index) => {
    const section = BUSINESS_INFO_SECTIONS[index];
    sections[section] = snap.exists
      ? snap.data()
      : {
        section,
        schemaVersion: BUSINESS_INFO_SCHEMA_VERSION,
        source: "business_user",
        status: "active",
        tier: "free",
        version: 0,
        hiddenFields: [],
        data: {},
      };
  });

  const publicSnap = await db.collection("places").doc(placeId).collection("resolvedPublic").doc("business").get();
  return {
    sections,
    resolvedPublic: publicSnap.exists ? publicSnap.data() : {},
  };
});

const updateBusinessInfoSection = onCall(async (request) => {
  const uid = request.auth?.uid;
  const placeId = asString(request.data?.placeId, 300);
  const section = asString(request.data?.section, 40);
  const expectedVersion = Number(request.data?.version ?? 0);
  const hiddenFields = asStringArray(request.data?.hiddenFields, 30, 80);
  const source = asString(request.data?.source, 40) || "business_user";

  if (!placeId) throw new HttpsError("invalid-argument", "Falta placeId.");
  if (!BUSINESS_INFO_SECTIONS.includes(section)) throw new HttpsError("invalid-argument", "Sección no válida.");
  if (!VALID_SOURCES.has(source)) throw new HttpsError("invalid-argument", "Origen no válido.");
  if (!BUSINESS_INFO_FREE_SECTIONS.has(section)) throw new HttpsError("permission-denied", "Esta sección requiere un plan superior.");

  const rate = await rateLimit("businessInfoUpdate", `${uid || "anon"}_${placeId}`, 30, 24 * 60 * 60);
  if (!rate.allowed) {
    throw new HttpsError("resource-exhausted", "Has hecho demasiados cambios hoy en este negocio.");
  }

  await assertBusinessManagerAccess(placeId, uid);

  const sanitizedData = sanitizeBusinessInfoData(section, request.data?.data);
  const infoRef = db.collection("places").doc(placeId).collection("businessInfo").doc(section);
  const publicRef = db.collection("places").doc(placeId).collection("resolvedPublic").doc("business");

  let nextVersion = 1;
  let didChange = false;
  await db.runTransaction(async (tx) => {
    const currentSnap = await tx.get(infoRef);
    const current = currentSnap.exists ? currentSnap.data() : null;
    const sectionDocs = {};
    for (const sectionId of BUSINESS_INFO_SECTIONS) {
      if (sectionId === section) continue;
      const sectionSnap = await tx.get(db.collection("places").doc(placeId).collection("businessInfo").doc(sectionId));
      if (sectionSnap.exists) sectionDocs[sectionId] = sectionSnap.data();
    }
    const currentVersion = Number(current?.version || 0);
    if (Number.isFinite(expectedVersion) && expectedVersion > 0 && currentVersion !== expectedVersion) {
      throw new HttpsError("aborted", "Estos datos han cambiado. Recarga el negocio antes de guardar.");
    }

    nextVersion = currentVersion + 1;
    const nextDoc = {
      section,
      schemaVersion: BUSINESS_INFO_SCHEMA_VERSION,
      source,
      status: "active",
      tier: "free",
      version: nextVersion,
      hiddenFields,
      data: sanitizedData,
      updatedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: current?.createdAt || FieldValue.serverTimestamp(),
    };
    const changedFields = getBusinessInfoChangedFields(current, nextDoc);
    if (current && changedFields.length === 0) {
      nextVersion = currentVersion;
      return;
    }
    didChange = true;
    sectionDocs[section] = nextDoc;

    tx.set(infoRef, nextDoc, { merge: true });
    await writeBusinessInfoHistory(tx, placeId, section, uid, current, nextDoc);

    const projection = {};
    const projectionHiddenFields = {};
    Object.entries(sectionDocs).forEach(([sectionId, docData]) => {
      if (!docData || docData.status !== "active") return;
      const cleanedData = sectionId === "accessibility" ? (docData.data || {}) : pruneEmpty(docData.data || {});
      if (hasContent(cleanedData)) projection[sectionId] = cleanedData;
      const sectionHiddenFields = Array.isArray(docData.hiddenFields)
        ? docData.hiddenFields.filter((field) => typeof field === "string" && field.length <= 80)
        : [];
      if (sectionHiddenFields.length) projectionHiddenFields[sectionId] = sectionHiddenFields;
    });
    if (Object.keys(projectionHiddenFields).length) projection.hiddenFields = projectionHiddenFields;
    projection.updatedAt = FieldValue.serverTimestamp();
    tx.set(publicRef, projection, { merge: false });
  });

  logger.info("businessInfo: seccion actualizada", { placeId, section, actorUid: uid, version: nextVersion, changed: didChange });
  return { ok: true, section, version: nextVersion };
});

module.exports = {
  onBusinessClaimCreated,
  reviewBusinessClaim,
  getBusinessTeam,
  updateBusinessTeamMember,
  getBusinessInfoForManager,
  updateBusinessInfoSection,
};
