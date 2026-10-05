import legal from './legal.json';

/**
 * Datos legales de Listopic. `version` identifica la versión vigente de los
 * Términos y la Política de privacidad: al cambiarla, a todos los usuarios se
 * les vuelve a pedir que las acepten (LegalAcceptanceGate). El seed de e2e la
 * lee del mismo JSON.
 *
 * Titular: mientras no haya empresa, el responsable es una persona física.
 * `ownerName` es obligatorio antes de publicar (art. 13 RGPD); `ownerNif` y
 * `ownerAddress` solo se muestran si se rellenan.
 */
export const LEGAL = legal;

export const LEGAL_VERSION = legal.version;

export const LEGAL_OWNER_NAME = legal.ownerName.trim() || '[Pendiente: nombre y apellidos del titular]';

export const LEGAL_CONTACT_MAILTO = `mailto:${legal.contactEmail}`;

/** Rutas de los textos legales: se ven aunque haya que aceptar las condiciones. */
export const LEGAL_PATHS = ['/terms', '/privacy', '/aviso-legal', '/cookies', '/child-safety'];
