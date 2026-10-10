/**
 * statusMeta: emoji, etiqueta y clases (literales, para Tailwind 4) de cada
 * estado de las colas de Developer. Lo usan StatusChip y ResolvedMeta.
 *
 * API
 *   type StatusGender = 'f' | 'm'           'f': solicitud, propuesta, campaña · 'm': reporte, plato
 *   STATUS_META: Record<KnownStatus, { emoji, f, m, fPlural, mPlural, className }>
 *   statusLabel(status, { gender?: StatusGender = 'f', plural?: boolean = false }): string
 *       statusLabel('approved') → «Aprobada»; statusLabel('resolved', { gender: 'm', plural: true }) → «Resueltos»
 *   statusEmoji(status): string               ⏳ 📨 ⚙️ ✅ 🟢 ❌ 🏁 (• si es desconocido)
 *   statusClassName(status): string          clases de borde, fondo y texto
 *   allStatusLabel(gender?): string          «Todas» / «Todos»
 */

export type StatusGender = 'f' | 'm';

export type KnownStatus = 'pending' | 'requested' | 'applying' | 'approved' | 'active' | 'rejected' | 'ended' | 'resolved';

interface StatusMetaEntry {
    emoji: string;
    f: string;
    m: string;
    fPlural: string;
    mPlural: string;
    className: string;
}

const AMBER = 'border-amber-500/30 bg-amber-500/15 text-amber-300';
const EMERALD = 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300';
const CYAN = 'border-cyan-500/30 bg-cyan-500/15 text-cyan-300';
const RED = 'border-red-500/30 bg-red-500/15 text-red-300';
const NEUTRAL = 'border-white/15 bg-white/5 text-gray-300';

export const STATUS_META: Record<KnownStatus, StatusMetaEntry> = {
    pending: { emoji: '⏳', f: 'Pendiente', m: 'Pendiente', fPlural: 'Pendientes', mPlural: 'Pendientes', className: AMBER },
    requested: { emoji: '📨', f: 'Solicitada', m: 'Solicitado', fPlural: 'Solicitadas', mPlural: 'Solicitados', className: AMBER },
    // Propuesta de carta que un jefe está aplicando (o que se atascó al aplicarla).
    applying: { emoji: '⚙️', f: 'Aplicándose', m: 'Aplicándose', fPlural: 'Aplicándose', mPlural: 'Aplicándose', className: CYAN },
    approved: { emoji: '✅', f: 'Aprobada', m: 'Aprobado', fPlural: 'Aprobadas', mPlural: 'Aprobados', className: EMERALD },
    active: { emoji: '🟢', f: 'Activa', m: 'Activo', fPlural: 'Activas', mPlural: 'Activos', className: CYAN },
    rejected: { emoji: '❌', f: 'Rechazada', m: 'Rechazado', fPlural: 'Rechazadas', mPlural: 'Rechazados', className: RED },
    ended: { emoji: '🏁', f: 'Finalizada', m: 'Finalizado', fPlural: 'Finalizadas', mPlural: 'Finalizados', className: NEUTRAL },
    resolved: { emoji: '✅', f: 'Resuelta', m: 'Resuelto', fPlural: 'Resueltas', mPlural: 'Resueltos', className: EMERALD },
};

const isKnownStatus = (status: string): status is KnownStatus =>
    Object.prototype.hasOwnProperty.call(STATUS_META, status);

export const statusLabel = (
    status: string,
    { gender = 'f', plural = false }: { gender?: StatusGender; plural?: boolean } = {},
): string => {
    if (!isKnownStatus(status)) return status || 'Sin estado';
    const meta = STATUS_META[status];
    if (plural) return gender === 'm' ? meta.mPlural : meta.fPlural;
    return gender === 'm' ? meta.m : meta.f;
};

export const statusEmoji = (status: string): string => (isKnownStatus(status) ? STATUS_META[status].emoji : '•');

export const statusClassName = (status: string): string => (isKnownStatus(status) ? STATUS_META[status].className : NEUTRAL);

export const allStatusLabel = (gender: StatusGender = 'f'): string => (gender === 'm' ? 'Todos' : 'Todas');
