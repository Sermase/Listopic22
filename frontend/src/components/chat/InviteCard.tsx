import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatScore, scoreBadgeStyle } from '../../lib/scoreScale';
import {
    buildIcs,
    dishRoute,
    formatWhen,
    googleCalendarUrl,
    inviteAttendees,
    inviteIsPast,
    mapsUrl,
    pendingProposals,
    placeRoute,
    reviewRoute,
    type ChatInvite,
    type InviteStatus,
} from '../../lib/chatExtras';

const STATUS_ICON: Record<InviteStatus, string> = { yes: '✅', no: '❌', other: '🗓️' };

interface Props {
    invite: ChatInvite;
    messageId: string;
    senderId: string;
    uid: string;
    nameOf: (uid: string) => string;
    onRespond: (status: InviteStatus) => void;
    onProposeDate: () => void;
    onChangeDate: () => void;
    onAcceptProposal: (fromUid: string, when: number) => void;
    onOpenDuel: () => void;
}

export const InviteCard: React.FC<Props> = ({
    invite, messageId, senderId, uid, nameOf, onRespond, onProposeDate, onChangeDate, onAcceptProposal, onOpenDuel,
}) => {
    const navigate = useNavigate();
    const [calendarOpen, setCalendarOpen] = useState(false);
    const isMine = senderId === uid;
    const past = inviteIsPast(invite);
    const myStatus = invite.responses?.[uid]?.status;
    const attendees = inviteAttendees(invite, senderId);
    const going = attendees.includes(uid);
    const proposals = pendingProposals(invite);
    const responses = Object.entries(invite.responses || {}).filter(([who]) => who !== senderId);
    const dish = dishRoute(invite);
    const place = placeRoute(invite);

    const downloadIcs = () => {
        const blob = new Blob([buildIcs(invite, messageId)], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'quedada-listopic.ics';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setCalendarOpen(false);
    };

    const linkClass = 'px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/15 text-[11px] font-semibold text-gray-100 whitespace-nowrap';
    const actionClass = (active: boolean, positive = false) =>
        `flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${active
            ? (positive ? 'bg-emerald-500 text-white' : 'bg-white/25 text-white')
            : (positive ? 'bg-emerald-500/80 hover:bg-emerald-500 text-white' : 'bg-white/10 hover:bg-white/15 text-gray-100')}`;

    return (
        <div className="w-[min(18rem,78vw)] rounded-2xl overflow-hidden border border-[var(--lt-accent-border)] bg-gradient-to-br from-[var(--lt-card-strong)] to-[var(--lt-accent-soft)] text-gray-100 shadow-lg">
            {invite.imageUrl && (
                <div className="relative h-24">
                    <img src={invite.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                    {typeof invite.score === 'number' && (
                        <span className="absolute top-2 right-2 text-xs font-bold px-1.5 py-0.5 rounded-md" style={scoreBadgeStyle(invite.score)}>
                            {formatScore(invite.score)}
                        </span>
                    )}
                </div>
            )}
            <div className="p-3">
                <p className="text-[10px] font-bold tracking-widest text-[var(--lt-accent)]">
                    {isMine ? '🍽️ HAS INVITADO A COMER' : `🍽️ ${nameOf(senderId).toUpperCase()} TE INVITA`}
                </p>
                <p className="text-lg font-extrabold leading-tight mt-0.5">{invite.itemName}</p>
                <p className="text-xs text-gray-300 mt-1">📍 {[invite.placeName, invite.placeCity].filter(Boolean).join(' · ')}</p>
                <p className={`text-xs mt-0.5 ${past ? 'text-gray-400' : 'text-white font-semibold'}`}>📅 {formatWhen(invite.when)}{past ? ' · ya pasó' : ''}</p>
                {invite.note && <p className="text-xs italic text-gray-300 mt-1.5">«{invite.note}»</p>}

                <div className="flex gap-1.5 mt-2.5 overflow-x-auto hide-scrollbar">
                    {dish && <button type="button" onClick={() => navigate(dish)} className={linkClass}>🍽️ Plato</button>}
                    {place && <button type="button" onClick={() => navigate(place)} className={linkClass}>🏠 Sitio</button>}
                    <a href={mapsUrl(invite)} target="_blank" rel="noopener noreferrer" className={linkClass}>🗺️ Maps</a>
                    {!past && <button type="button" onClick={() => setCalendarOpen((v) => !v)} className={linkClass}>📅 Calendario</button>}
                </div>
                {calendarOpen && (
                    <div className="flex gap-1.5 mt-1.5">
                        <a href={googleCalendarUrl(invite)} target="_blank" rel="noopener noreferrer" onClick={() => setCalendarOpen(false)} className={linkClass}>Google</a>
                        <button type="button" onClick={downloadIcs} className={linkClass}>iPhone / Outlook</button>
                    </div>
                )}

                {responses.length > 0 && (
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-2.5 text-[11px] text-gray-300">
                        {responses.map(([who, r]) => (
                            <span key={who}>
                                {STATUS_ICON[r.status]} {who === uid ? 'Tú' : nameOf(who)}
                                {r.status === 'other' && r.proposedAt ? ` (${formatWhen(r.proposedAt)})` : ''}
                            </span>
                        ))}
                    </div>
                )}

                {!past && isMine && proposals.map((p) => (
                    <div key={p.uid} className="mt-2 rounded-xl bg-black/20 p-2">
                        <p className="text-[11px] text-gray-300"><b>{nameOf(p.uid)}</b> propone <b>{formatWhen(p.proposedAt)}</b></p>
                        <button type="button" onClick={() => onAcceptProposal(p.uid, p.proposedAt)} className={`${actionClass(false, true)} w-full mt-1.5`}>✅ Me vale</button>
                    </div>
                ))}

                {!past && !isMine && (
                    <div className="flex gap-1.5 mt-3">
                        <button type="button" onClick={() => onRespond('yes')} className={actionClass(myStatus === 'yes', true)}>✅ Voy</button>
                        <button type="button" onClick={onProposeDate} className={actionClass(myStatus === 'other')}>🗓️ Otro día</button>
                        <button type="button" onClick={() => onRespond('no')} className={actionClass(myStatus === 'no')}>❌ No</button>
                    </div>
                )}
                {!past && isMine && (
                    <button type="button" onClick={onChangeDate} className="mt-2 text-[11px] text-gray-400 hover:text-white underline-offset-2 hover:underline">Cambiar fecha</button>
                )}

                {past && going && (
                    <div className="mt-3 space-y-1.5">
                        <p className="text-xs text-gray-200">¿Qué tal estaba? 😋</p>
                        <div className="flex gap-1.5">
                            <button type="button" onClick={() => navigate(reviewRoute(invite))} className={actionClass(false, true)}>⭐ Valorar</button>
                            <button type="button" onClick={onOpenDuel} className={actionClass(false)}>🥊 Notas de la mesa</button>
                        </div>
                    </div>
                )}
                {past && !going && attendees.length > 1 && (
                    <button type="button" onClick={onOpenDuel} className={`${actionClass(false)} w-full mt-3`}>🥊 Notas de la mesa</button>
                )}
            </div>
        </div>
    );
};
