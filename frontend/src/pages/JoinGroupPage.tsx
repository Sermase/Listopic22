import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { Loader, Users } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { ChatService, type JoinEventPreview, type JoinInvite } from '../services/ChatService';
import { formatLongDay, formatTime, inviteIsPast } from '../lib/chatExtras';

type State = { kind: 'loading' } | { kind: 'gone' } | { kind: 'error' } | { kind: 'pending'; invite: JoinInvite } | { kind: 'preview'; invite: JoinInvite };

/** La quedada que llega con el enlace (?q=…), si sigue en pie. */
const liveEvent = (invite: JoinInvite, id: string | null): JoinEventPreview | null => {
    const event = id ? invite.events?.[id] : undefined;
    return event && !event.cancelled && !inviteIsPast(event) ? event : null;
};

const EventPreview: React.FC<{ event: JoinEventPreview; invite: JoinInvite }> = ({ event, invite }) => {
    const date = new Date(event.when);
    return (
        <div className="-mx-6 -mt-6 mb-5 text-left">
            <div className="relative h-40 rounded-t-3xl overflow-hidden bg-gradient-to-br from-[var(--lt-accent)] to-[var(--lt-bg-deep)]">
                {event.imageUrl
                    ? <img src={event.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    : <span className="absolute right-5 top-4 text-6xl opacity-80">🍽️</span>}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                <div className="absolute left-4 top-4 rounded-2xl bg-white text-gray-900 text-center px-2.5 py-1 shadow-lg leading-none">
                    <span className="block text-[10px] font-bold uppercase text-[var(--lt-accent)]">{date.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}</span>
                    <span className="block text-xl font-black">{date.getDate()}</span>
                </div>
                <div className="absolute left-4 right-4 bottom-3">
                    <p className="text-[10px] font-bold tracking-widest text-white/80">🍽️ {invite.byName.toUpperCase()} TE INVITA</p>
                    <h1 className="text-xl font-extrabold leading-tight text-white line-clamp-2">{event.title}</h1>
                </div>
            </div>
            <div className="px-6 pt-4 space-y-1 text-sm text-gray-200">
                {event.placeName && <p className="truncate">📍 <b>{event.placeName}</b>{event.placeCity ? ` · ${event.placeCity}` : ''}</p>}
                <p>🕑 {formatLongDay(event.when)} · <b>{formatTime(event.when)}</b></p>
                <p className="pt-1 text-xs text-gray-400">Con el grupo «{invite.groupName}» en Listopic</p>
            </div>
        </div>
    );
};

/**
 * /g/{código}: enlace de invitación a un grupo. Con sesión entra directo; sin ella, primero entrar o registrarse.
 * Con ?q={id} invita a una quedada del grupo: «Me apunto» entra en el grupo y responde «Voy» (?voy=1 tras registrarse).
 */
export const JoinGroupPage: React.FC = () => {
    const { code = '' } = useParams();
    const [searchParams] = useSearchParams();
    const eventId = searchParams.get('q');
    const wantsIn = searchParams.get('voy') === '1';
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [state, setState] = useState<State>({ kind: 'loading' });
    const joining = useRef(false);

    useEffect(() => {
        let alive = true;
        ChatService.getJoinInvite(code)
            .then((invite) => alive && setState(invite ? { kind: 'preview', invite } : { kind: 'gone' }))
            .catch(() => alive && setState({ kind: 'gone' }));
        return () => { alive = false; };
    }, [code]);

    useEffect(() => {
        if (loading || !user || state.kind !== 'preview' || joining.current) return;
        joining.current = true;
        const invite = state.invite;
        const event = liveEvent(invite, eventId);
        (async () => {
            const profile = await getDoc(doc(db, 'publicProfiles', user.uid)).then((s) => s.data(), () => undefined);
            const name = profile?.displayName || profile?.username || user.displayName || 'Alguien';
            const result = await ChatService.joinByLink(code, { uid: user.uid, name });
            if (!result) return setState({ kind: 'gone' });
            if (result.status === 'pending') return setState({ kind: 'pending', invite });
            if (event && eventId) {
                if (wantsIn) await ChatService.joinEventFromLink(result.chatId, eventId, { uid: user.uid, name }).catch(() => undefined);
                navigate(`/chats/${result.chatId}?q=${eventId}`, { replace: true });
            } else {
                navigate(`/chats/${result.chatId}`, { replace: true });
            }
        })().catch((error) => {
            console.error(error);
            setState({ kind: 'error' });
        });
    }, [code, eventId, loading, navigate, state, user, wantsIn]);

    const toLogin = (register: boolean, apuntarme = false) => navigate(register ? '/login?mode=register' : '/login', {
        state: { from: apuntarme && eventId ? { pathname: location.pathname, search: `?q=${eventId}&voy=1` } : location },
    });
    const event = state.kind === 'preview' || state.kind === 'pending' ? liveEvent(state.invite, eventId) : null;

    return (
        <div className="min-h-[70vh] flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-3xl bg-[var(--lt-card-strong)] border border-white/10 p-6 text-center shadow-2xl">
                {state.kind === 'loading' || (state.kind === 'preview' && (loading || user)) ? (
                    <>
                        <Loader className="w-8 h-8 mx-auto text-[var(--lt-accent)] animate-spin" />
                        <p className="mt-3 text-sm text-gray-400">{state.kind === 'preview' ? `Entrando en «${state.invite.groupName}»…` : 'Cargando invitación…'}</p>
                    </>
                ) : state.kind === 'pending' ? (
                    <>
                        <p className="text-4xl">🙋</p>
                        <h1 className="mt-3 text-lg font-bold text-white">Solicitud enviada</h1>
                        <p className="mt-2 text-sm text-gray-400">
                            En «{state.invite.groupName}» aprueban antes de entrar. Cuando alguien del grupo te acepte, lo verás en tus chats
                            {event ? ' y podrás apuntarte a la quedada.' : '.'}
                        </p>
                        <button type="button" onClick={() => navigate('/chats')} className="mt-5 w-full py-3 rounded-xl bg-[var(--lt-accent)] text-white font-bold">Ir a mis chats</button>
                    </>
                ) : state.kind === 'preview' && event ? (
                    <>
                        <EventPreview event={event} invite={state.invite} />
                        <button type="button" onClick={() => toLogin(true, true)} className="w-full py-3 rounded-xl bg-emerald-500 text-white font-bold">
                            ✅ Me apunto
                        </button>
                        <p className="mt-2 text-[11px] text-gray-500">
                            {state.invite.approval ? 'Creas tu cuenta y pides entrar al grupo' : 'Creas tu cuenta en un momento y entras al grupo'}
                        </p>
                        <button type="button" onClick={() => toLogin(false, true)} className="mt-3 text-sm font-semibold text-[var(--lt-accent)]">
                            ¿Ya tienes cuenta? Entra
                        </button>
                    </>
                ) : state.kind === 'preview' ? (
                    <>
                        <div className="w-16 h-16 mx-auto rounded-full bg-[var(--lt-accent-soft)] flex items-center justify-center">
                            <Users className="w-8 h-8 text-[var(--lt-accent)]" />
                        </div>
                        <p className="mt-4 text-sm text-gray-400">{state.invite.byName} te invita al grupo</p>
                        <h1 className="mt-1 text-2xl font-black text-white">{state.invite.groupName}</h1>
                        <p className="mt-2 text-xs text-gray-500">
                            {eventId && state.invite.events?.[eventId] ? 'Esa quedada ya pasó o se canceló, pero el grupo sigue 🍽️'
                                : state.invite.approval ? 'Alguien del grupo aceptará tu solicitud' : 'Quedadas, encuestas y notas de la mesa 🍽️'}
                        </p>
                        <button type="button" onClick={() => toLogin(false)} className="mt-6 w-full py-3 rounded-xl bg-[var(--lt-accent)] text-white font-bold">
                            {state.invite.approval ? 'Entrar y pedir unirme' : 'Entrar y unirme'}
                        </button>
                        <button type="button" onClick={() => toLogin(true)} className="mt-2 w-full py-3 rounded-xl bg-white/10 text-white font-bold">
                            Crear cuenta
                        </button>
                    </>
                ) : (
                    <>
                        <p className="text-4xl">🔗</p>
                        <h1 className="mt-3 text-lg font-bold text-white">{state.kind === 'gone' ? 'Este enlace ya no vale' : 'No se pudo entrar al grupo'}</h1>
                        <p className="mt-2 text-sm text-gray-400">
                            {state.kind === 'gone' ? 'Pide a alguien del grupo que te mande el enlace nuevo.' : 'Puede que el grupo esté lleno. Inténtalo otra vez en un rato.'}
                        </p>
                        <button type="button" onClick={() => navigate('/')} className="mt-5 w-full py-3 rounded-xl bg-white/10 text-white font-bold">Ir al inicio</button>
                    </>
                )}
            </div>
        </div>
    );
};
