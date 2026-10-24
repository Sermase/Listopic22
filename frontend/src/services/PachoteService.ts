import {
    deleteField,
    doc,
    getDoc,
    onSnapshot,
    serverTimestamp,
    setDoc,
    updateDoc,
    writeBatch,
    addDoc,
    collection,
} from 'firebase/firestore';
import { db } from '../firebase';
import { eventNoteText, type ChatEventNote } from '../lib/chatExtras';
import {
    membersFromPeople,
    pachoteCardText,
    pachoteId,
    pachoteToken,
    type ChatPachoteLink,
    type PachoteGroup,
    type PachoteMember,
} from '../lib/pachote';
import { ChatService } from './ChatService';

export interface PachoteAccess {
    role: 'admin' | 'editor' | 'viewer';
    memberId?: string | null;
}

type Person = { uid: string; name: string };

const groupRef = (gid: string) => doc(db, 'pachoteGroups', gid);
const accessRef = (gid: string, uid: string) => doc(db, 'pachoteGroups', gid, 'access', uid);
const userRef = (uid: string) => doc(db, 'pachoteUsers', uid);

/** Apunte en el historial de Pachote, como los que escribe la propia app. */
const logEntry = (gid: string, uid: string, who: string, txt: string) =>
    addDoc(collection(db, 'pachoteGroups', gid, 'log'), { act: 'group', txt, who, uid, at: serverTimestamp() }).catch(() => undefined);

const firstName = (n: string) => n.trim().split(/\s+/)[0]?.toLowerCase() || '';

export const PachoteService = {
    watchGroup: (gid: string, cb: (g: PachoteGroup | null) => void, onError?: () => void) =>
        onSnapshot(groupRef(gid), (s) => cb(s.exists() ? ({ id: s.id, members: [], ...s.data() } as unknown as PachoteGroup) : null), () => {
            cb(null);
            onError?.();
        }),

    /** Mi acceso al grupo (null si aún no he entrado). */
    watchAccess: (gid: string, uid: string, cb: (a: PachoteAccess | null) => void) =>
        onSnapshot(accessRef(gid, uid), (s) => cb(s.exists() ? (s.data() as PachoteAccess) : null), () => cb(null)),

    /** Cuentas nuevas con la gente del chat, ya enlazadas a él. Quien las crea administra. */
    async createForChat({ chatId, name, emoji, me, people }: { chatId: string; name: string; emoji?: string; me: Person; people: Person[] }) {
        const gid = pachoteId();
        const members = membersFromPeople(people);
        const mine = members.find((m) => m.luid === me.uid) || null;
        const now = Date.now();
        const clean = name.trim().slice(0, 60) || 'Cuentas';
        await setDoc(groupRef(gid), {
            name: clean,
            ...(emoji ? { emoji } : {}),
            members,
            households: [],
            created: now,
            updated: now,
            features: { families: false, kids: false },
            owner: me.uid,
            inviteToken: pachoteToken(),
            chatId,
        });
        // Las reglas miran el grupo ya guardado para dar el acceso de administrador.
        await setDoc(accessRef(gid, me.uid), { role: 'admin', memberId: mine?.id || null, joined: now, label: 'Listopic' });
        const b = writeBatch(db);
        b.set(userRef(me.uid), { groups: { [gid]: { joined: now } } }, { merge: true });
        b.update(doc(db, 'chats', chatId), { [`pachote.${gid}`]: { name: clean, ...(emoji ? { emoji } : {}) } satisfies ChatPachoteLink });
        await b.commit();
        await logEntry(gid, me.uid, mine?.name || me.name, `creó el grupo «${clean}» desde Listopic con ${members.length} personas`);
        const event: ChatEventNote = { kind: 'pachote', title: clean };
        await ChatService.sendMessage(chatId, me.uid, eventNoteText(event, me.name), 'event', undefined, { event });
        return gid;
    },

    /** Entrar desde el chat enlazado, sin link. Si el grupo me tiene como persona, soy esa persona. */
    async joinFromChat(gid: string, uid: string, memberId: string | null) {
        const now = Date.now();
        await setDoc(accessRef(gid, uid), { role: 'editor', memberId, joined: now, label: 'Listopic' });
        await setDoc(userRef(uid), { groups: { [gid]: { joined: now } } }, { merge: true });
    },

    /** Mis grupos de Pachote que administro y aún no están enlazados a ningún chat. */
    async linkableGroups(uid: string): Promise<PachoteGroup[]> {
        const mine = await getDoc(userRef(uid)).catch(() => null);
        const ids = Object.keys((mine?.exists() && mine.data().groups) || {}).slice(0, 40);
        const rows = await Promise.all(ids.map(async (gid) => {
            try {
                const [g, a] = await Promise.all([getDoc(groupRef(gid)), getDoc(accessRef(gid, uid))]);
                if (!g.exists() || !a.exists()) return null;
                const group = { id: g.id, members: [], ...g.data() } as unknown as PachoteGroup & { allAdmin?: boolean };
                const role = (a.data() as PachoteAccess).role;
                const admin = role === 'admin' || (role === 'editor' && !!group.allAdmin);
                return admin && !group.chatId ? group : null;
            } catch {
                return null;
            }
        }));
        return rows.filter((g): g is PachoteGroup => !!g);
    },

    /** Enlaza un grupo mío a este chat. Quien se llame igual que alguien del chat queda unido a su usuario. */
    async linkToChat(group: PachoteGroup, chatId: string, me: Person, people: Person[]) {
        const counts: Record<string, number> = {};
        people.forEach((p) => { counts[firstName(p.name)] = (counts[firstName(p.name)] || 0) + 1; });
        const taken = new Set(group.members.map((m) => m.luid).filter(Boolean));
        const members: PachoteMember[] = group.members.map((m) => {
            if (m.luid) return m;
            const match = people.find((p) => !taken.has(p.uid) && counts[firstName(p.name)] === 1 && firstName(p.name) === firstName(m.name));
            if (!match) return m;
            taken.add(match.uid);
            return { ...m, luid: match.uid };
        });
        await updateDoc(groupRef(group.id), { chatId, members, updated: Date.now() });
        await updateDoc(doc(db, 'chats', chatId), { [`pachote.${group.id}`]: { name: group.name, ...(group.emoji ? { emoji: group.emoji } : {}) } satisfies ChatPachoteLink });
        const event: ChatEventNote = { kind: 'pachote-link', title: group.name };
        await ChatService.sendMessage(chatId, me.uid, eventNoteText(event, me.name), 'event', undefined, { event });
    },

    /** Quita el enlace (lo hace quien administra el grupo en Pachote). */
    async unlink(gid: string, chatId: string) {
        await updateDoc(groupRef(gid), { chatId: deleteField(), updated: Date.now() });
        await updateDoc(doc(db, 'chats', chatId), { [`pachote.${gid}`]: deleteField() });
    },

    /** Tarjeta viva con las cuentas en el chat. */
    shareCard: (chatId: string, uid: string, gid: string, name: string) =>
        ChatService.sendMessage(chatId, uid, pachoteCardText(name), 'pachote', undefined, { pachote: { gid, name } }),
};
