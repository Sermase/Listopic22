// Separar la actividad de los jefes en la analitica sin perderla.
// Cada contador sigue sumando todo; ademas, lo que hace un jefe se suma a un
// contador gemelo "staff*". Las consultas pueden restarlo con excludeStaff.

function normalizeUserTypes(userType) {
  if (Array.isArray(userType)) return userType;
  if (typeof userType === "string" && userType) return [userType];
  return [];
}

const STAFF_CACHE_MS = 10 * 60 * 1000;
const staffCache = new Map();

// Pares contador total -> contador de jefes.
const STAFF_FIELDS = {
  totalViews: "staffViews",
  uniqueSessions: "staffSessions",
  authenticatedViews: "staffViews", // un jefe siempre tiene sesion iniciada
  totalShares: "staffShares",
  shareActions: "staffShareActions",
  reviews: "staffReviews",
  sessions: "staffSessions",
};

async function isStaffUid(db, uid, token = null) {
  if (!uid) return false;
  if (token?.admin === true) return true;
  const cached = staffCache.get(uid);
  if (cached && Date.now() - cached.at < STAFF_CACHE_MS) return cached.value;
  let value = false;
  try {
    const snap = await db.collection("users").doc(uid).get();
    value = snap.exists && normalizeUserTypes(snap.data()?.userType).includes("jefe");
  } catch (_) {
    value = false;
  }
  staffCache.set(uid, { value, at: Date.now() });
  return value;
}

// Devuelve una copia con los contadores de jefes restados (nunca negativos).
function withoutStaff(row) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  Object.entries(STAFF_FIELDS).forEach(([field, staffField]) => {
    if (typeof out[field] !== "number") return;
    const staff = Number(row[staffField]) || 0;
    out[field] = Math.max(0, out[field] - staff);
  });
  return out;
}

function clearStaffCache() {
  staffCache.clear();
}

module.exports = { isStaffUid, withoutStaff, clearStaffCache, STAFF_FIELDS };
