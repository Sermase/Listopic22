import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatScore, scoreBadgeStyle } from '../../lib/scoreScale';
import {
    countdownLabel,
    formatLongDay,
    formatTime,
    groupResponses,
    inviteIsPast,
    reviewRoute,
    type ChatInvite,
    type InviteStatus,
} from '../../lib/chatExtras';
import { AvatarStack, type Person } from './Avatars';

interface Props {
    invite: ChatInvite;
    senderId: string;
    uid: string;
    participants: string[];
    personOf: (uid: string) => Person;
    onOpen: (section?: 'duel') => void;
    onRespond: (status: InviteStatus) => void;
}

/** La quedada en el chat: grande, con foto, quién va y responder de un toque. Toca para ver todo. */
export const EventCard: React.FC<Props> = ({ invite, senderId, uid, participants, personOf, onOpen, onRespond }) => {
    const navigate = useNavigate();
    const past = inviteIsPast(invite);
    const isMine = senderId === uid;
    const groups = groupResponses(invite, senderId, participants);
    const myStatus = invite.responses?.[uid]?.status;
    const going = groups.going.includes(uid);
    const date = new Date(invite.when);
    const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

    const counts = [
        `${groups.going.length} ${groups.going.length === 1 ? 'va' : 'van'}`,
        groups.maybe.length ? `${groups.maybe.length} en duda` : '',
        groups.no.length ? `${groups.no.length} no` : '',
    ].filter(Boolean).join(' · ');

    const rsvp = (status: InviteStatus, label: string, positive = false) => (
        <button
            type="button"
            onClick={stop(() => onRespond(status))}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${myStatus === status || (status === 'maybe' && myStatus === 'other')
                ? (positive ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30' : 'bg-white text-gray-900')
                : 'bg-white/10 hover:bg-white/15 text-gray-100'}`}
        >
            {label}
        </button>
    );

    return (
        <div
            data-event-card
            onClick={() => onOpen()}
            className={`w-[min(22rem,calc(100vw-5rem))] text-left rounded-3xl overflow-hidden border border-white/10 bg-[var(--lt-card-strong)] text-gray-100 shadow-xl cursor-pointer transition-transform active:scale-[0.99] ${invite.cancelled ? 'opacity-60 grayscale' : ''}`}
        >
            <div className="relative h-36 bg-gradient-to-br from-[var(--lt-accent)] to-[var(--lt-bg-deep)]">
                {invite.imageUrl
                    ? <img src={invite.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                    : <span className="absolute right-4 top-3 text-6xl opacity-80">🍽️</span>}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                <div className="absolute left-3 top-3 rounded-2xl bg-white text-gray-900 text-center px-2.5 py-1 shadow-lg leading-none">
                    <span className="block text-[10px] font-bold uppercase text-[var(--lt-accent)]">{date.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}</span>
                    <span className="block text-xl font-black">{date.getDate()}</span>
                </div>
                <span className="absolute right-3 top-3 rounded-full bg-black/55 backdrop-blur px-2.5 py-1 text-[11px] font-bold">
                    {invite.cancelled ? '🚫 Cancelada' : countdownLabel(invite.when)}
                </span>
                <div className="absolute left-3 right-3 bottom-2.5">
                    <p className="text-[10px] font-bold tracking-widest text-white/80">
                        {isMine ? '🍽️ TU QUEDADA' : `🍽️ ${personOf(senderId).name.toUpperCase()} TE INVITA`}
                    </p>
                    <p className="text-xl font-extrabold leading-tight text-white drop-shadow line-clamp-2">{invite.itemName || invite.placeName}</p>
                </div>
            </div>

            <div className="p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-[13px] leading-snug">
                        <p className="truncate">📍 <b>{invite.placeName}</b>{invite.placeCity ? ` · ${invite.placeCity}` : ''}</p>
                        <p className={past ? 'text-gray-400' : ''}>🕑 {formatLongDay(invite.when)} · <b>{formatTime(invite.when)}</b></p>
                    </div>
                    {typeof invite.score === 'number' && (
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded-md shrink-0" style={scoreBadgeStyle(invite.score)}>{formatScore(invite.score)}</span>
                    )}
                </div>
                {invite.note && <p className="text-[13px] italic text-gray-300">«{invite.note}»</p>}

                <div className="flex items-center gap-2">
                    <AvatarStack people={groups.going.map(personOf)} />
                    <span className="text-xs text-gray-400 flex-1 min-w-0 truncate">{counts}</span>
                    <button type="button" onClick={stop(() => onOpen())} className="text-xs text-[var(--lt-accent)] font-semibold inline-flex items-center">Detalles<ChevronRight className="w-3.5 h-3.5" /></button>
                </div>

                {!past && !invite.cancelled && !isMine && (
                    <div className="flex gap-1.5 pt-1">
                        {rsvp('yes', '✅ Voy', true)}
                        {rsvp('maybe', '🤔 Duda')}
                        {rsvp('no', '❌ No')}
                    </div>
                )}

                {past && !invite.cancelled && going && (
                    <div className="flex gap-1.5 pt-1">
                        <button type="button" onClick={stop(() => navigate(reviewRoute(invite)))} className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 text-white">⭐ Valorar</button>
                        <button type="button" onClick={stop(() => onOpen('duel'))} className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-white/10 text-gray-100">🥊 Notas de la mesa</button>
                    </div>
                )}
            </div>
        </div>
    );
};
