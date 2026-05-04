const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const fetch = require("node-fetch");
const { sendNotification } = require("./notifications");
const { rateLimit } = require("./lib/auth");
const {
  googlePlacesApiKey: GOOGLE_PLACES_API_KEY_SECRET,
  getGooglePlacesApiKey,
} = require("./lib/secrets");

const db = getFirestore();

const REPORT_TARGET_TYPES = new Set(['place', 'review', 'list', 'group', 'user', 'other']);
const REPORT_ISSUE_TYPES = new Set([
    'inappropriate',
    'spam',
    'fake',
    'place_closed',
    'item_missing',
    'duplicate',
    'item_not_available',
    'incorrect_info',
    'wrong_place',
    'harassment',
    'impersonation',
    'other',
]);

function cleanReportString(value, maxLength) {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, maxLength);
}

// --- Umbral anti-flood en la creación de reportes ---
const REPORT_FLOOD_WINDOW_SECONDS = 60 * 60; // 1 hora
const REPORT_FLOOD_LIMIT = 15;               // máx. 15 reportes por hora y usuario

/**
 * Callable: crea reportes desde servidor para validar payload, evitar
 * suplantaciones y centralizar anti-flood/duplicados.
 */
const submitReport = onCall({ region: 'europe-west1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Debes iniciar sesion para reportar.');
    }

    const uid = request.auth.uid;
    const rl = await rateLimit('reportsCreate', `uid_${uid}`, REPORT_FLOOD_LIMIT, REPORT_FLOOD_WINDOW_SECONDS);
    if (!rl.allowed) {
        throw new HttpsError('resource-exhausted', 'Has enviado demasiados reportes en poco tiempo.');
    }

    const payload = request.data || {};
    const targetId = cleanReportString(payload.targetId, 240);
    const targetName = cleanReportString(payload.targetName, 180);
    const targetType = cleanReportString(payload.targetType, 40);
    const targetOwnerId = cleanReportString(payload.targetOwnerId, 128);
    const itemName = cleanReportString(payload.itemName, 180);
    const issueType = cleanReportString(payload.issueType, 60) || 'other';
    const description = cleanReportString(payload.description, 1200);

    if (!targetId || !targetType || !REPORT_TARGET_TYPES.has(targetType)) {
        throw new HttpsError('invalid-argument', 'El contenido reportado no es valido.');
    }
    if (!REPORT_ISSUE_TYPES.has(issueType)) {
        throw new HttpsError('invalid-argument', 'El motivo del reporte no es valido.');
    }
    if (targetOwnerId && targetOwnerId === uid) {
        throw new HttpsError('failed-precondition', 'No puedes reportar tu propio contenido.');
    }

    const duplicateSnap = await db.collection('reports')
        .where('userId', '==', uid)
        .where('targetId', '==', targetId)
        .where('status', '==', 'pending')
        .limit(1)
        .get();

    if (!duplicateSnap.empty) {
        throw new HttpsError('already-exists', 'Ya has reportado este contenido. Estamos revisandolo.');
    }

    const userName = request.auth.token.name || request.auth.token.email || 'Anonimo';
    const userEmail = request.auth.token.email || null;

    const reportRef = await db.collection('reports').add({
        userId: uid,
        reportedByUserId: uid,
        reporterUid: uid,
        userName,
        reportedByName: userName,
        userEmail,
        targetId,
        targetName,
        targetType,
        targetOwnerId: targetOwnerId || null,
        itemName: itemName || null,
        issueType,
        description,
        status: 'pending',
        source: 'callable',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { ok: true, reportId: reportRef.id };
});

/**
 * Trigger: When a report document is created or updated.
 * Path: reports/{reportId}
 *
 * On CREATE:
 *   - Auto-set status to 'pending' if missing
 *   - Send notification to admins (optional, via admin users collection)
 *   - Increment a report counter on the target (user/place/review)
 *
 * On UPDATE (status change to 'resolved' or 'rejected'):
 *   - Send notification to the reporter about the resolution
 *   - If resolved, optionally flag the target
 */
const onReportWritten = onDocumentWritten("reports/{reportId}", async (event) => {
    const reportId = event.params.reportId;
    const beforeData = event.data.before.exists ? event.data.before.data() : null;
    const afterData = event.data.after.exists ? event.data.after.data() : null;

    if (!afterData) {
        // Report was deleted — nothing to do
        return;
    }

    const isCreate = !beforeData;
    const isStatusChange = beforeData && beforeData.status !== afterData.status;

    // --- ON CREATE ---
    if (isCreate) {
        logger.info(`New report created: ${reportId}`, {
            targetType: afterData.targetType,
            targetId: afterData.targetId,
            issueType: afterData.issueType,
        });

        // Anti-flood: si el usuario supera el límite, borramos el reporte.
        const reporterUid = afterData.userId || afterData.reportedByUserId || afterData.reporterUid;
        if (reporterUid && afterData.source !== 'callable') {
            const rl = await rateLimit(
                'reportsCreate',
                `uid_${reporterUid}`,
                REPORT_FLOOD_LIMIT,
                REPORT_FLOOD_WINDOW_SECONDS
            );
            if (!rl.allowed) {
                logger.warn(`Report flood: borrando ${reportId} del usuario ${reporterUid}`);
                try { await event.data.after.ref.delete(); } catch (_) { /* noop */ }
                return;
            }
        }

        // Ensure status is set
        if (!afterData.status) {
            await event.data.after.ref.update({ status: "pending" });
        }

        // Increment report count on the target entity
        try {
            await incrementReportCount(afterData.targetType, afterData.targetId, 1);
        } catch (err) {
            logger.warn(`Could not increment report count on target`, err);
        }

        // Notify admin users
        try {
            await notifyAdmins(reportId, afterData);
        } catch (err) {
            logger.warn(`Could not notify admins about report`, err);
        }

        return;
    }

    // --- ON STATUS CHANGE ---
    if (isStatusChange) {
        const newStatus = afterData.status;
        const reporterId = afterData.userId || afterData.reportedByUserId || afterData.reporterUid;

        logger.info(`Report ${reportId} status changed: ${beforeData.status} -> ${newStatus}`);

        if (newStatus === "resolved" || newStatus === "rejected") {
            // Notify the reporter that their report was handled
            if (reporterId) {
                const statusLabel = newStatus === "resolved" ? "resuelto" : "rechazado";
                const targetLabel = afterData.targetName || afterData.targetId || "un contenido";

                await sendNotification(reporterId, "report_resolved", {
                    message: `Tu reporte sobre "${targetLabel}" ha sido ${statusLabel}.`,
                    link: getTargetLink(afterData),
                    reportId: reportId,
                    resolution: newStatus,
                    adminNotes: afterData.adminNotes || null,
                });
            }
        }

        return;
    }
});

/**
 * Increment a reportCount field on the target entity.
 */
async function incrementReportCount(targetType, targetId, delta) {
    if (!targetType || !targetId) return;

    let docRef = null;

    switch (targetType) {
        case "user":
            docRef = db.collection("users").doc(targetId);
            break;
        case "place":
            docRef = db.collection("places").doc(targetId);
            break;
        case "review":
            // Reviews are nested: we'd need listId. Store reportCount on the report doc itself.
            // For now, skip review-level counting — the reports collection is the source of truth.
            return;
        case "group":
            // Groups don't have a dedicated collection — skip
            return;
        default:
            return;
    }

    if (docRef) {
        const snap = await docRef.get();
        if (snap.exists) {
            await docRef.update({
                reportCount: admin.firestore.FieldValue.increment(delta),
            });
        }
    }
}

/**
 * Notify admin users about a new report.
 * We look for users with the 'admin' or 'developer' role.
 */
async function notifyAdmins(reportId, reportData) {
    // Query users with developer/admin role
    const adminsSnap = await db.collection("users")
        .where("role", "in", ["admin", "developer"])
        .limit(10)
        .get();

    if (adminsSnap.empty) {
        logger.info("No admin users found to notify about report");
        return;
    }

    const targetLabel = reportData.targetName || reportData.targetId || "contenido";
    const issueLabel = reportData.issueType || "problema";

    const promises = adminsSnap.docs.map(adminDoc => {
        // Don't notify the reporter if they happen to be an admin
        if (adminDoc.id === (reportData.userId || reportData.reportedByUserId || reportData.reporterUid)) return Promise.resolve();

        return sendNotification(adminDoc.id, "new_report", {
            message: `Nuevo reporte: "${issueLabel}" en ${targetLabel}`,
            link: "/developer?tab=reports",
            reportId: reportId,
            targetType: reportData.targetType,
        }, {
            notificationId: `report_${reportId}`,
        });
    });

    await Promise.all(promises);
}

/**
 * Build a frontend link for the reported target.
 */
function getTargetLink(reportData) {
    switch (reportData.targetType) {
        case "user":
            return `/profile/${reportData.targetId}`;
        case "place":
            return `/place/${reportData.targetId}`;
        case "review":
            return `/place/${reportData.targetId}`;
        default:
            return "/";
    }
}

/**
 * Callable: Sync place business status from Google Places API.
 * Takes { placeId } — the Firestore place doc ID (= Google Place ID).
 * Updates place.closedStatus and place.googleBusinessStatus.
 */

const syncPlaceStatusFromGoogle = onCall(
    { region: 'europe-west1', secrets: [GOOGLE_PLACES_API_KEY_SECRET] },
    async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const rl = await rateLimit('syncPlaceStatusFromGoogle', `uid_${request.auth.uid}`, 30, 60);
    if (!rl.allowed) {
        throw new HttpsError('resource-exhausted', 'Demasiadas peticiones.');
    }

    const { placeId } = request.data || {};
    if (!placeId || typeof placeId !== 'string' || placeId.length > 200) {
        throw new HttpsError('invalid-argument', 'placeId is required');
    }

    const apiKey = await getGooglePlacesApiKey();
    if (!apiKey) {
        throw new HttpsError('internal', 'Google Places API key not configured');
    }

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&key=${apiKey}&fields=business_status,name&language=es`;

    let data;
    try {
        const response = await fetch(url);
        data = await response.json();
    } catch (e) {
        throw new HttpsError('internal', `Google Places API request failed: ${e.message}`);
    }

    if (data.status !== 'OK') {
        throw new HttpsError('not-found', `Google Places API returned: ${data.status}`);
    }

    const businessStatus = data.result?.business_status || 'UNKNOWN';
    let closedStatus = null;
    if (businessStatus === 'CLOSED_PERMANENTLY') closedStatus = 'permanently_closed';
    else if (businessStatus === 'CLOSED_TEMPORARILY') closedStatus = 'temporarily_closed';

    await db.collection('places').doc(placeId).update({
        closedStatus: closedStatus,
        googleBusinessStatus: businessStatus,
        closedStatusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info(`syncPlaceStatusFromGoogle: ${placeId} → ${businessStatus} (closedStatus: ${closedStatus})`);
    return { businessStatus, closedStatus };
});

module.exports = {
    onReportWritten,
    submitReport,
    syncPlaceStatusFromGoogle,
};
