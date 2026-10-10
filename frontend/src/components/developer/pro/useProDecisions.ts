/**
 * useProDecisions: decisiones de la pestaña «Patrocinios y Pro» fila a fila.
 *
 * - Cada fila tiene su propia nota (notes[row.item.key]); se vacía al decidir,
 *   así el motivo escrito para un negocio nunca le llega a otro.
 * - El confirm enseña la nota que se va a enviar.
 * - El aviso de éxito o error queda en la propia fila (messages[key]).
 * - Tras decidir se pinta el estado nuevo al momento (onPatch) y después se
 *   relee el documento para traer lo que escribe el servidor (fechas del plato,
 *   applyResult, devolución de impulsos). Si la decisión falla porque otra
 *   persona ya la tomó o porque el navegador dejó de esperar, también se relee
 *   para enseñar el estado real.
 */
import { useCallback, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { useAuth } from '../../../context/AuthContext';
import { useConfirm } from '../../../context/ConfirmContext';
import { QUEUES, toInboxItem } from '../../../services/adminQueues';
import { reviewItemProposal, reviewItemSpotlight, reviewSponsoredPlacement } from '../../../services/BusinessProService';
import {
    applyDecisionLocally,
    decisionConfirm,
    decisionSuccessText,
    toProRow,
    type ProDecision,
    type ProRow,
} from './proUtils';

export interface ProRowMessage {
    type: 'success' | 'error';
    text: string;
}

export interface UseProDecisionsOptions {
    /** Sustituye una fila (estado local tras decidir o tras releerla). */
    onPatch: (row: ProRow) => void;
    /** Después de una decisión correcta. */
    onDecided: () => void;
}

export interface ProDecisionsApi {
    notes: Record<string, string>;
    setNote: (key: string, value: string) => void;
    messages: Record<string, ProRowMessage>;
    clearMessages: () => void;
    busy: { key: string; decision: ProDecision } | null;
    decide: (row: ProRow, decision: ProDecision) => Promise<void>;
}

const errorCode = (error: unknown): string => {
    const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
    return typeof code === 'string' ? code : '';
};

/** El navegador dejó de esperar (el SDK lo cuenta en inglés: «deadline-exceeded»). */
const DEADLINE_EXCEEDED_MESSAGE = 'El servidor está tardando más de lo normal y hemos dejado de esperar, pero puede que siga trabajando. En un momento pulsa «Actualizar» para ver cómo ha quedado.';

const getErrorMessage = (error: unknown): string => {
    if (errorCode(error).endsWith('deadline-exceeded')) return DEADLINE_EXCEEDED_MESSAGE;
    if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
        const text = (error as { message: string }).message.trim();
        if (text) return text;
    }
    return 'No se pudo guardar la decisión.';
};

/**
 * La fila ya no está como creíamos (otra persona decidió, o la borraron), o el
 * navegador dejó de esperar (deadline-exceeded) mientras el servidor sigue
 * aplicando: se relee para enseñar el estado real (p. ej. «⚙️ Aplicándose»).
 */
const isStaleError = (error: unknown): boolean => {
    const code = errorCode(error);
    return code.endsWith('failed-precondition') || code.endsWith('not-found') || code.endsWith('deadline-exceeded') || code.endsWith('aborted');
};

const sendDecision = async (row: ProRow, decision: ProDecision, note: string): Promise<void> => {
    const adminNotes = note || undefined;
    if (row.kind === 'proposal') {
        if (decision !== 'approve' && decision !== 'reject') throw new Error('Decisión no válida para una propuesta.');
        await reviewItemProposal(row.item.id, decision, adminNotes);
        return;
    }
    if (decision === 'approve') throw new Error('Decisión no válida para una campaña.');
    if (row.kind === 'placement') await reviewSponsoredPlacement(row.item.id, decision, adminNotes);
    else await reviewItemSpotlight(row.item.id, decision, adminNotes);
};

export function useProDecisions({ onPatch, onDecided }: UseProDecisionsOptions): ProDecisionsApi {
    const { user } = useAuth();
    const confirm = useConfirm();
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [messages, setMessages] = useState<Record<string, ProRowMessage>>({});
    const [busy, setBusy] = useState<{ key: string; decision: ProDecision } | null>(null);
    const uid = user?.uid ?? null;

    const setNote = useCallback((key: string, value: string) => {
        setNotes((prev) => ({ ...prev, [key]: value }));
    }, []);

    const setMessage = useCallback((key: string, message: ProRowMessage | null) => {
        setMessages((prev) => {
            const next = { ...prev };
            if (message) next[key] = message;
            else delete next[key];
            return next;
        });
    }, []);

    const clearMessages = useCallback(() => setMessages({}), []);

    const reread = useCallback(async (row: ProRow) => {
        try {
            const snap = await getDoc(doc(db, QUEUES[row.item.queue].collection, row.item.id));
            if (snap.exists()) onPatch(toProRow(toInboxItem(row.item.queue, snap.id, snap.data() as Record<string, unknown>)));
        } catch (error) {
            console.warn('ProProposalsTab: no se pudo releer la fila', row.item.key, error);
        }
    }, [onPatch]);

    const decide = useCallback(async (row: ProRow, decision: ProDecision) => {
        if (busy) return;
        const key = row.item.key;
        const note = (notes[key] ?? '').trim();
        const confirmed = await confirm(decisionConfirm(row, decision, note));
        if (!confirmed) return;

        setBusy({ key, decision });
        setMessage(key, null);
        try {
            await sendDecision(row, decision, note);
            onPatch(applyDecisionLocally(row, decision, { uid, notes: note, now: Date.now() }));
            setNotes((prev) => {
                const next = { ...prev };
                delete next[key];
                return next;
            });
            setMessage(key, { type: 'success', text: decisionSuccessText(row, decision) });
            onDecided();
            void reread(row);
        } catch (error) {
            console.error('ProProposalsTab: la decisión falló', key, decision, error);
            setMessage(key, { type: 'error', text: `⚠️ ${getErrorMessage(error)}` });
            if (isStaleError(error)) void reread(row);
        } finally {
            setBusy(null);
        }
    }, [busy, notes, confirm, setMessage, onPatch, uid, onDecided, reread]);

    return { notes, setNote, messages, clearMessages, busy, decide };
}
