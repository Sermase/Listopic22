import React, { useState } from 'react';
import { db } from '../../firebase';
import {
    doc,
    getDoc,
    collection,
    query,
    where,
    getDocs,
    collectionGroup,
} from 'firebase/firestore';
import { FileDown, Search, Loader2, AlertCircle, CheckCircle, Info } from 'lucide-react';
import jsPDF from 'jspdf';

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt = (val: any): string => {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'Sí' : 'No';
    if (typeof val === 'object' && val.toDate) return val.toDate().toLocaleString('es-ES');
    if (Array.isArray(val)) return val.join(', ') || '—';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
};

const loadImageAsBase64 = (src: string): Promise<string> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.getContext('2d')!.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = src;
    });

// ─── PDF builder ─────────────────────────────────────────────────────────────

const COLORS = {
    bg: [11, 16, 33] as [number, number, number],
    surface: [21, 27, 46] as [number, number, number],
    accent: [99, 102, 241] as [number, number, number],
    amber: [245, 158, 11] as [number, number, number],
    green: [16, 185, 129] as [number, number, number],
    violet: [139, 92, 246] as [number, number, number],
    cyan: [6, 182, 212] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
    gray: [156, 163, 175] as [number, number, number],
    lightGray: [55, 65, 81] as [number, number, number],
};

async function buildPDF(
    userData: any,
    reviews: any[],
    lists: any[],
    followers: any[],
    following: any[],
    chats: any[],
    istariLogoB64: string | null
) {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const PW = pdf.internal.pageSize.getWidth();
    const PH = pdf.internal.pageSize.getHeight();
    const M = 14;
    let y = 0;

    const fillPage = () => {
        pdf.setFillColor(...COLORS.bg);
        pdf.rect(0, 0, PW, PH, 'F');
    };
    const newPage = () => { pdf.addPage(); fillPage(); y = M; };
    const checkY = (needed: number) => { if (y + needed > PH - M) newPage(); };

    // ── cover ────────────────────────────────────────────────────────────────
    fillPage();
    pdf.setFillColor(...COLORS.accent);
    pdf.rect(0, 0, PW, 55, 'F');

    // Listopic logo mark
    const cx = M + 10, cy = 20;
    pdf.setFillColor(...COLORS.cyan);
    pdf.circle(cx, cy, 9, 'F');
    pdf.setFillColor(...COLORS.accent);
    pdf.circle(cx + 1.5, cy, 7, 'F');
    pdf.setFillColor(255, 255, 255);
    pdf.circle(cx + 1, cy, 2.5, 'F');

    pdf.setTextColor(...COLORS.white);
    pdf.setFontSize(22);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Listopic', M + 22, cy + 3);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(199, 210, 254);
    pdf.text('Informe de datos personales · RGPD Art. 15', M + 22, cy + 11);

    if (istariLogoB64) {
        pdf.addImage(istariLogoB64, 'PNG', PW - M - 20, 5, 20, 20);
    }

    pdf.setFillColor(...COLORS.surface);
    pdf.rect(0, 55, PW, 40, 'F');
    pdf.setTextColor(...COLORS.white);
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Datos del usuario', M, 75);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...COLORS.gray);
    pdf.text(`UID: ${userData.id}`, M, 84);
    const dateStr = new Date().toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
    pdf.setFontSize(9);
    pdf.text(`Generado: ${dateStr}`, M, 91);

    y = 105;

    // ── helpers ──────────────────────────────────────────────────────────────
    const drawSectionHeader = (title: string, color: [number, number, number] = COLORS.accent) => {
        checkY(14);
        pdf.setFillColor(...color);
        pdf.rect(M, y, 3, 8, 'F');
        pdf.setTextColor(...COLORS.white);
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.text(title, M + 6, y + 6);
        y += 12;
    };

    const drawRow = (label: string, value: string) => {
        const maxW = PW - M * 2 - 45;
        const lines = pdf.splitTextToSize(value, maxW);
        const lineH = 5.5;
        const needed = Math.max(lines.length * lineH + 4, 10);
        checkY(needed);
        pdf.setFontSize(8.5);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...COLORS.gray);
        pdf.text(label, M, y + 5);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...COLORS.white);
        pdf.text(lines, M + 42, y + 5);
        pdf.setDrawColor(...COLORS.lightGray);
        pdf.setLineWidth(0.2);
        pdf.line(M, y + needed, PW - M, y + needed);
        y += needed + 1;
    };

    const drawEmpty = (msg: string) => {
        checkY(10);
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'italic');
        pdf.setTextColor(...COLORS.gray);
        pdf.text(msg, M, y + 5);
        y += 10;
    };

    // ── 1. Perfil ─────────────────────────────────────────────────────────────
    drawSectionHeader('1. Datos de perfil');
    const profileFields: [string, string][] = [
        ['UID', fmt(userData.id)],
        ['Email', fmt(userData.email)],
        ['Username', fmt(userData.username)],
        ['Display name', fmt(userData.displayName)],
        ['Nombre', fmt(userData.name)],
        ['Apellidos', fmt(userData.surnames)],
        ['Biografía', fmt(userData.bio)],
        ['Ubicación', fmt(userData.location)],
        ['Foto de perfil', fmt(userData.photoUrl)],
        ['Tipo de usuario', fmt(userData.userType)],
        ['Cuenta creada', fmt(userData.createdAt)],
        ['Última actualización', fmt(userData.updatedAt)],
        ['Username bloqueado', fmt(!!userData.usernameLockedAt)],
    ];
    profileFields.forEach(([l, v]) => drawRow(l, v));
    y += 4;

    // ── 2. Preferencias ───────────────────────────────────────────────────────
    drawSectionHeader('2. Preferencias de la app', COLORS.cyan);
    const prefFields: [string, string][] = [
        ['Rango búsqueda (km)', fmt(userData.defaultDistanceKm ?? userData.defaultRange)],
        ['Capa de mapa', fmt(userData.mapLayerPreference)],
        ['Idioma', fmt(userData.language)],
        ['Notificaciones', fmt(userData.notificationsEnabled)],
        ['Tema', fmt(userData.theme)],
    ];
    prefFields.forEach(([l, v]) => drawRow(l, v));
    y += 4;

    // ── 3. Gamificación ───────────────────────────────────────────────────────
    drawSectionHeader('3. Gamificación y nivel', COLORS.amber);
    const gamFields: [string, string][] = [
        ['Nivel', fmt(userData.level)],
        ['XP total', fmt(userData.xp)],
        ['Reseñas (contador)', fmt(userData.reviewsCount)],
        ['Seguidores', fmt(userData.followersCount)],
        ['Siguiendo (usuarios)', fmt(userData.followingUsersCount ?? userData.followingCount)],
        ['Listas seguidas', fmt(userData.followingListsCount)],
        ['Medallas obtenidas', fmt(userData.earnedBadgeIds)],
        ['Insignia favorita', fmt(userData.favoriteBadgeId)],
        ['Racha actual (días)', fmt(userData.streakDays)],
        ['Primera reseña en', fmt(userData.firstReviewAt)],
    ];
    gamFields.forEach(([l, v]) => drawRow(l, v));
    y += 4;

    // ── 4. Social — seguidores / siguiendo ────────────────────────────────────
    drawSectionHeader('4. Red social', COLORS.violet);
    drawRow('Nº seguidores', String(followers.length));
    drawRow('Nº siguiendo', String(following.length));

    if (followers.length > 0) {
        checkY(8);
        pdf.setFontSize(8.5);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...COLORS.gray);
        pdf.text('Seguidores (UID):', M, y + 5);
        y += 8;
        const followerList = followers.map(f => f.id).join(', ');
        const lines = pdf.splitTextToSize(followerList, PW - M * 2);
        checkY(lines.length * 5 + 4);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...COLORS.white);
        pdf.setFontSize(7.5);
        pdf.text(lines, M, y + 5);
        y += lines.length * 5 + 6;
    }

    if (following.length > 0) {
        checkY(8);
        pdf.setFontSize(8.5);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...COLORS.gray);
        pdf.text('Siguiendo (UID):', M, y + 5);
        y += 8;
        const followingList = following.map(f => f.id).join(', ');
        const lines = pdf.splitTextToSize(followingList, PW - M * 2);
        checkY(lines.length * 5 + 4);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...COLORS.white);
        pdf.setFontSize(7.5);
        pdf.text(lines, M, y + 5);
        y += lines.length * 5 + 6;
    }
    y += 4;

    // ── 5. Chats ──────────────────────────────────────────────────────────────
    drawSectionHeader('5. Conversaciones (chats)', COLORS.green);
    if (chats.length === 0) {
        drawEmpty('Sin conversaciones.');
    } else {
        chats.forEach((c: any, i: number) => {
            checkY(20);
            pdf.setFillColor(...COLORS.surface);
            pdf.roundedRect(M, y, PW - M * 2, 18, 2, 2, 'F');
            pdf.setFontSize(8.5);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(...COLORS.white);
            const label = c.groupName || `Chat ${i + 1} (${c.type})`;
            pdf.text(`${i + 1}. ${label}`, M + 3, y + 6);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(...COLORS.gray);
            pdf.setFontSize(7.5);
            pdf.text(`ID: ${c.id}`, M + 3, y + 11);
            pdf.text(`Participantes: ${(c.participants || []).join(', ')}`, M + 3, y + 15);
            y += 21;
        });
    }
    y += 4;

    // ── 6. Listas ─────────────────────────────────────────────────────────────
    drawSectionHeader('6. Listas creadas', COLORS.accent);
    if (lists.length === 0) {
        drawEmpty('Sin listas.');
    } else {
        lists.forEach((l: any, i: number) => {
            checkY(24);
            pdf.setFillColor(...COLORS.surface);
            pdf.roundedRect(M, y, PW - M * 2, 22, 2, 2, 'F');
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(...COLORS.white);
            pdf.text(`${i + 1}. ${l.name || l.title || `Lista #${i + 1}`}`, M + 3, y + 6);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(...COLORS.gray);
            pdf.setFontSize(7.5);
            pdf.text(`ID: ${l.id}`, M + 3, y + 11);
            const meta = `Pública: ${fmt(l.isPublic)}  ·  Sublista: ${fmt(!!l.parentId)}  ·  Creada: ${fmt(l.createdAt)}`;
            pdf.text(meta, M + 3, y + 16);
            y += 25;
        });
    }
    y += 4;

    // ── 7. Reseñas ────────────────────────────────────────────────────────────
    drawSectionHeader('7. Reseñas', COLORS.amber);
    if (reviews.length === 0) {
        drawEmpty('Sin reseñas encontradas.');
    } else {
        reviews.forEach((r: any, i: number) => {
            checkY(32);
            pdf.setFillColor(...COLORS.surface);
            pdf.roundedRect(M, y, PW - M * 2, 30, 2, 2, 'F');
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(...COLORS.white);
            const title = r.placeName || r.placeId || `Reseña #${i + 1}`;
            pdf.text(`${i + 1}. ${title}`, M + 3, y + 6);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(...COLORS.gray);
            pdf.setFontSize(7.5);
            pdf.text(`Lista: ${fmt(r.listId)}`, M + 3, y + 11);
            pdf.text(`Puntuación: ${fmt(r.score)}  ·  Fecha: ${fmt(r.createdAt)}`, M + 3, y + 16);
            const commentText = r.comment || r.body || '';
            const commentLines = pdf.splitTextToSize(commentText, PW - M * 2 - 10);
            pdf.text(commentLines.slice(0, 2), M + 3, y + 21);
            y += 33;
        });
    }
    y += 4;

    // ── 8. Footer legal ───────────────────────────────────────────────────────
    checkY(30);
    pdf.setFillColor(...COLORS.surface);
    pdf.rect(M, y, PW - M * 2, 24, 'F');
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...COLORS.gray);
    pdf.text('Este documento ha sido generado en respuesta a una solicitud de acceso a datos bajo el RGPD (Art. 15 UE).', M + 3, y + 6);
    pdf.text('Listopic · Istari Core · istaricore@gmail.com  ·  listopic.es', M + 3, y + 11);
    pdf.text(`Generado: ${dateStr}. Documento confidencial, destinado únicamente al titular de la cuenta.`, M + 3, y + 16);
    pdf.text(`Reseñas: ${reviews.length}  ·  Listas: ${lists.length}  ·  Chats: ${chats.length}  ·  Seguidores: ${followers.length}  ·  Siguiendo: ${following.length}`, M + 3, y + 21);

    // page numbers
    const totalPages = pdf.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        pdf.setPage(p);
        pdf.setFontSize(7);
        pdf.setTextColor(...COLORS.gray);
        pdf.text(`Página ${p} de ${totalPages}`, PW - M - 20, PH - 5);
        pdf.text('Listopic · Istari Core', M, PH - 5);
    }

    return pdf;
}

// ─── Component ───────────────────────────────────────────────────────────────

const FIREBASE_INDEX_URL = 'https://console.firebase.google.com/project/listopic/firestore/indexes';

export const UserDataExportTab: React.FC = () => {
    const [searchInput, setSearchInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [preview, setPreview] = useState<any | null>(null);
    const [needsIndex, setNeedsIndex] = useState(false);

    const findUser = async () => {
        const term = searchInput.trim();
        if (!term) return;
        setLoading(true);
        setError(null);
        setSuccess(null);
        setPreview(null);
        setNeedsIndex(false);
        try {
            let userData: any = null;
            const byId = await getDoc(doc(db, 'users', term));
            if (byId.exists()) {
                userData = { id: byId.id, ...byId.data() };
            } else {
                const byEmail = await getDocs(query(collection(db, 'users'), where('email', '==', term)));
                if (!byEmail.empty) {
                    const d = byEmail.docs[0];
                    userData = { id: d.id, ...d.data() };
                } else {
                    const byUsername = await getDocs(query(collection(db, 'users'), where('username', '==', term)));
                    if (!byUsername.empty) {
                        const d = byUsername.docs[0];
                        userData = { id: d.id, ...d.data() };
                    }
                }
            }
            if (!userData) {
                setError('Usuario no encontrado. Prueba con UID, email o username exacto.');
                return;
            }
            setPreview(userData);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const downloadPDF = async () => {
        if (!preview) return;
        setLoading(true);
        setError(null);
        setSuccess(null);
        setNeedsIndex(false);

        const uid = preview.id;
        const warnings: string[] = [];

        // ── Lists ──────────────────────────────────────────────────────────
        let lists: any[] = [];
        try {
            const snap = await getDocs(query(collection(db, 'lists'), where('userId', '==', uid)));
            lists = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch { warnings.push('listas (sin permisos)'); }

        // ── Reviews ────────────────────────────────────────────────────────
        // Primary: collectionGroup (requires index + security rule allowing admins).
        // Fallback A: subcollection of each list owned by user.
        // Fallback B: legacy root collection.
        const reviews: any[] = [];
        const seen = new Set<string>();

        try {
            const cgSnap = await getDocs(
                query(collectionGroup(db, 'reviews'), where('authorId', '==', uid))
            );
            cgSnap.docs.forEach(d => {
                seen.add(d.id);
                const seg = d.ref.path.split('/');
                const listId = seg.length >= 4 ? seg[1] : undefined;
                reviews.push({ id: d.id, listId, ...d.data() });
            });
        } catch {
            // Index missing or no permission → query per-list subcollections
            setNeedsIndex(true);
            for (const listDoc of lists.map(l => l.id)) {
                try {
                    const revSnap = await getDocs(
                        query(collection(db, 'lists', listDoc, 'reviews'), where('authorId', '==', uid))
                    );
                    revSnap.docs.forEach(d => {
                        if (!seen.has(d.id)) {
                            seen.add(d.id);
                            reviews.push({ id: d.id, listId: listDoc, ...d.data() });
                        }
                    });
                } catch { /* skip lists we can't read */ }
            }
        }

        // Legacy root reviews
        try {
            const rootSnap = await getDocs(query(collection(db, 'reviews'), where('authorId', '==', uid)));
            rootSnap.docs.forEach(d => {
                if (!seen.has(d.id)) { seen.add(d.id); reviews.push({ id: d.id, ...d.data() }); }
            });
        } catch { /* doesn't exist */ }

        // ── Followers / Following ──────────────────────────────────────────
        let followers: any[] = [];
        try {
            const snap = await getDocs(collection(db, 'users', uid, 'followers'));
            followers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch { warnings.push('seguidores (sin permisos)'); }

        let following: any[] = [];
        try {
            const snap = await getDocs(collection(db, 'users', uid, 'following'));
            following = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch { warnings.push('siguiendo (sin permisos)'); }

        // ── Chats ──────────────────────────────────────────────────────────
        let chats: any[] = [];
        try {
            const snap = await getDocs(
                query(collection(db, 'chats'), where('participants', 'array-contains', uid))
            );
            chats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch { warnings.push('chats (sin permisos — las reglas de Firestore solo permiten leerlos a los participantes)'); }

        // ── Logo ───────────────────────────────────────────────────────────
        let istariLogoB64: string | null = null;
        try { istariLogoB64 = await loadImageAsBase64('/images/istari-core-logo.png'); } catch { }

        try {
            const pdf = await buildPDF(preview, reviews, lists, followers, following, chats, istariLogoB64);
            const filename = `listopic-datos-${preview.username || preview.id}-${new Date().toISOString().slice(0, 10)}.pdf`;
            pdf.save(filename);

            let msg = `PDF descargado · ${reviews.length} reseñas · ${lists.length} listas · ${chats.length} chats`;
            if (warnings.length > 0) msg += ` · Advertencias: ${warnings.join(', ')}`;
            setSuccess(msg);
        } catch (err: any) {
            setError(`Error generando PDF: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 max-w-2xl">
            <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-1">
                    <FileDown className="w-5 h-5 text-[var(--lt-accent)]" /> Exportar datos de usuario (RGPD)
                </h2>
                <p className="text-sm text-gray-500">
                    Genera un PDF con toda la información almacenada de un usuario. Útil para responder solicitudes de acceso a datos (Art. 15 RGPD).
                </p>
            </div>

            {/* Index warning */}
            {needsIndex && (
                <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                    <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-300 space-y-1">
                        <p className="font-bold">Reseñas incompletas</p>
                        <p>No se ha podido usar el índice de Firestore, por lo que solo se incluyen reseñas en listas creadas por el usuario. Para exportar todas las reseñas (incluidas las de listas ajenas), crea el índice:</p>
                        <a
                            href={FIREBASE_INDEX_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-amber-400 underline text-xs"
                        >
                            Crear índice en Firebase Console →
                        </a>
                        <p className="text-xs text-amber-500">(Colección: reviews · Campo: authorId · Tipo: COLLECTION_GROUP_ASC)</p>
                    </div>
                </div>
            )}

            {/* Search */}
            <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-5">
                <label className="text-xs font-bold text-gray-400 uppercase block mb-2">Buscar usuario</label>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && findUser()}
                        placeholder="UID, email o username"
                        className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[var(--lt-accent-border)]"
                    />
                    <button
                        onClick={findUser}
                        disabled={loading || !searchInput.trim()}
                        className="flex items-center gap-2 px-4 py-2 bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-sm font-bold transition-colors"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        Buscar
                    </button>
                </div>
            </div>

            {error && (
                <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-300">{error}</p>
                </div>
            )}

            {success && (
                <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                    <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-green-300">{success}</p>
                </div>
            )}

            {preview && (
                <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            {preview.photoUrl && (
                                <img src={preview.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                            )}
                            <div className="min-w-0">
                                <p className="text-white font-bold truncate">{preview.displayName || preview.username || '—'}</p>
                                <p className="text-xs text-gray-500 truncate">{preview.email} · {preview.id}</p>
                            </div>
                        </div>
                        <button
                            onClick={downloadPDF}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 bg-[var(--lt-accent)] hover:bg-[var(--lt-accent)] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-sm font-bold transition-colors shrink-0"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                            Descargar PDF
                        </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                        {[
                            ['Username', preview.username || '—'],
                            ['Nivel', preview.level ?? '—'],
                            ['XP', preview.xp ?? '—'],
                            ['Reseñas', preview.reviewsCount ?? '—'],
                            ['Seguidores', preview.followersCount ?? '—'],
                            ['Medallas', (preview.earnedBadgeIds?.length) ?? '—'],
                        ].map(([label, val]) => (
                            <div key={label as string} className="bg-black/20 rounded-lg px-3 py-2">
                                <p className="text-xs text-gray-500 uppercase font-bold mb-0.5">{label}</p>
                                <p className="text-white text-sm font-bold">{String(val)}</p>
                            </div>
                        ))}
                    </div>

                    <p className="text-xs text-gray-500">
                        El PDF incluye: perfil, preferencias, gamificación, red social, chats, listas y reseñas. Puede tardar unos segundos.
                    </p>
                </div>
            )}
        </div>
    );
};
