const crypto = require('crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

function isPrivateHostname(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return true;

  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) return false;

  const [a, b] = ipv4.slice(1).map(Number);
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function extensionForContentType(contentType) {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/gif') return 'gif';
  if (contentType === 'image/heic') return 'heic';
  if (contentType === 'image/heif') return 'heif';
  return 'jpg';
}

function firebaseDownloadUrl(bucketName, path, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

async function fetchWithValidatedRedirects(url, redirectsLeft = 3) {
  const parsedUrl = new URL(url);
  if (!['http:', 'https:'].includes(parsedUrl.protocol) || isPrivateHostname(parsedUrl.hostname)) {
    throw new HttpsError('invalid-argument', 'URL de imagen no permitida.');
  }

  const response = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    size: MAX_IMAGE_BYTES,
    headers: {
      'user-agent': 'ListopicImageImporter/1.0',
      accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/heic,image/heif;q=0.9,*/*;q=0.1',
    },
  }).catch((error) => {
    throw new HttpsError('unavailable', 'No se pudo descargar la imagen externa.', { message: error.message });
  });

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (redirectsLeft <= 0) {
      throw new HttpsError('failed-precondition', 'Demasiadas redirecciones al descargar la imagen.');
    }
    const location = response.headers.get('location');
    if (!location) {
      throw new HttpsError('failed-precondition', 'Redirección de imagen inválida.');
    }
    const nextUrl = new URL(location, url).toString();
    return fetchWithValidatedRedirects(nextUrl, redirectsLeft - 1);
  }

  return { response, parsedUrl };
}

const importExternalReviewPhoto = onCall({ timeoutSeconds: 60, memory: '512MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const url = typeof request.data?.url === 'string' ? request.data.url.trim() : '';
  if (!url || url.length > 2048) {
    throw new HttpsError('invalid-argument', 'URL de imagen inválida.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new HttpsError('invalid-argument', 'URL de imagen inválida.');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol) || isPrivateHostname(parsedUrl.hostname)) {
    throw new HttpsError('invalid-argument', 'URL de imagen no permitida.');
  }

  const { response, parsedUrl: finalUrl } = await fetchWithValidatedRedirects(url);

  if (!response.ok) {
    throw new HttpsError('failed-precondition', 'La imagen externa no está disponible.');
  }

  const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new HttpsError('invalid-argument', 'El archivo externo no es una imagen compatible.');
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_IMAGE_BYTES) {
    throw new HttpsError('resource-exhausted', 'La imagen es demasiado grande.');
  }

  const buffer = await response.buffer();
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new HttpsError('resource-exhausted', 'La imagen es demasiado grande.');
  }

  const uid = request.auth.uid;
  const token = crypto.randomUUID();
  const ext = extensionForContentType(contentType);
  const safeId = crypto.randomUUID();
  const path = `reviews/${uid}/imported/${Date.now()}_${safeId}.${ext}`;
  const bucket = admin.storage().bucket();
  const file = bucket.file(path);

  await file.save(buffer, {
    resumable: false,
    metadata: {
      contentType,
      cacheControl: 'public,max-age=31536000,immutable',
      metadata: {
        firebaseStorageDownloadTokens: token,
        importedBy: uid,
        sourceHost: finalUrl.hostname,
      },
    },
  });

  return {
    url: firebaseDownloadUrl(bucket.name, path, token),
    storagePath: path,
    contentType,
    size: buffer.length,
  };
});

module.exports = {
  importExternalReviewPhoto,
};
