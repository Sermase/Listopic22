const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const { sendNotification } = require("./notifications");

const db = getFirestore();

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
        const reporterId = afterData.reportedByUserId;

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
        if (adminDoc.id === reportData.reportedByUserId) return Promise.resolve();

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
async function getGoogleApiKey() {
    if (process.env.GOOGLE_PLACES_API_KEY) return process.env.GOOGLE_PLACES_API_KEY;
    try {
        const secretDoc = await db.collection('config').doc('serverSecrets').get();
        if (secretDoc.exists) {
            const key = secretDoc.data()?.googlePlacesApiKey;
            if (key) return key;
        }
    } catch (e) {
        logger.error('syncPlaceStatusFromGoogle: could not read API key', e);
    }
    return null;
}

const syncPlaceStatusFromGoogle = onCall({ region: 'europe-west1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { placeId } = request.data || {};
    if (!placeId || typeof placeId !== 'string') {
        throw new HttpsError('invalid-argument', 'placeId is required');
    }

    const apiKey = await getGoogleApiKey();
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
    syncPlaceStatusFromGoogle,
};
