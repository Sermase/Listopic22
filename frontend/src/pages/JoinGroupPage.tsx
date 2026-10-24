import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { Loader, Users } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { ChatService, type JoinInvite } from '../services/ChatService';

type State = { kind: 'loading' } | { kind: 'gone' } | { kind: 'error' } | { kind: 'pending'; invite: JoinInvite } | { kind: 'preview'; invite: JoinInvite };

/** /g/{código}: enlace de invitación a un grupo. Con sesión entra directo; sin ella, primero entrar o registrarse. */
export const JoinGroupPage: React.FC = () => {
    const { code = '' } = useParams();
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
        (async () => {
            const profile = await getDoc(doc(db, 'publicProfiles', user.uid)).then((s) => s.data(), () => undefined);
            const name = profile?.displayName || profile?.username || user.displayName || 'Alguien';
            const result = await ChatService.joinByLink(code, { uid: user.uid, name });
            if (!result) setState({ kind: 'gone' });
            else if (result.status === 'pending') setState({ kind: 'pending', invite });
            else navigate(`/chats/${result.chatId}`, { replace: true });
        })().catch((error) => {
            console.error(error);
            setState({ kind: 'error' });
        });
    }, [code, loading, navigate, state, user]);

    const toLogin = (register: boolean) => navigate(register ? '/login?mode=register' : '/login', { state: { from: location } });

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
                            En «{state.invite.groupName}» aprueban antes de entrar. Cuando alguien del grupo te acepte, lo verás en tus chats.
                        </p>
                        <button type="button" onClick={() => navigate('/chats')} className="mt-5 w-full py-3 rounded-xl bg-[var(--lt-accent)] text-white font-bold">Ir a mis chats</button>
                    </>
                ) : state.kind === 'preview' ? (
                    <>
                        <div className="w-16 h-16 mx-auto rounded-full bg-[var(--lt-accent-soft)] flex items-center justify-center">
                            <Users className="w-8 h-8 text-[var(--lt-accent)]" />
                        </div>
                        <p className="mt-4 text-sm text-gray-400">{state.invite.byName} te invita al grupo</p>
                        <h1 className="mt-1 text-2xl font-black text-white">{state.invite.groupName}</h1>
                        <p className="mt-2 text-xs text-gray-500">
                            {state.invite.approval ? 'Alguien del grupo aceptará tu solicitud' : 'Quedadas, encuestas y notas de la mesa 🍽️'}
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
