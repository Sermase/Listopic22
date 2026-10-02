'use strict';

// Roles de los autores según su perfil público (lo mismo que mira la web).
// `userType` solo lo cambia un jefe: las reglas lo impiden al propio usuario,
// así que «crítico» aquí es un crítico verificado.

const { getFirestore } = require('firebase-admin/firestore');

const hasRole = (userType, role) => (Array.isArray(userType) ? userType : [userType])
  .some((type) => typeof type === 'string' && type.trim() === role);

/** @returns {Promise<{ bots: Set<string>, critics: Set<string>, types: Map<string, string[]> }>} */
async function fetchAuthorRoles(authorIds) {
  const ids = Array.from(new Set((authorIds || []).filter(Boolean)));
  const bots = new Set();
  const critics = new Set();
  const types = new Map();
  const db = getFirestore();
  for (let i = 0; i < ids.length; i += 100) {
    const snaps = await db.getAll(...ids.slice(i, i + 100).map((uid) => db.collection('publicProfiles').doc(uid)));
    snaps.forEach((snap) => {
      if (!snap.exists) return;
      const userType = (snap.data() || {}).userType;
      types.set(snap.id, (Array.isArray(userType) ? userType : [userType])
        .filter((type) => typeof type === 'string' && type.trim())
        .map((type) => type.trim()));
      if (hasRole(userType, 'bot')) bots.add(snap.id);
      if (hasRole(userType, 'critico')) critics.add(snap.id);
    });
  }
  return { bots, critics, types };
}

const authorOf = (review) => (review && (review.userId || review.authorId)) || null;

module.exports = { fetchAuthorRoles, hasRole, authorOf };
