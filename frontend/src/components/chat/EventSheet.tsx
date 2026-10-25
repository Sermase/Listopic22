import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, ExternalLink, MapPin, Phone, X } from 'lucide-react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useSheetDismiss } from '../../hooks/useSheetDismiss';
import { usePlaceDetails } from '../../hooks/usePlaceDetails';
import { todayHours } from '../../lib/openingHours';
import { formatScore, scoreBadgeStyle } from '../../lib/scoreScale';
import {
    buildIcs,
    countdownLabel,
    dishRoute,
    formatLongDay,
    formatTime,
    formatWhen,
    googleCalendarUrl,
    groupResponses,
    inviteIsPast,
    mapsUrl,
    placeRoute,
    reviewRoute,
    sameItemName,
    summarizePlaceDishes,
    type ChatInvite,
    type InviteStatus,
} from '../../lib/chatExtras';
import { Avatar, type Person } from './Avatars';
import { DuelTable } from './DuelTable';

interface Props {
    invite: ChatInvite;
    messageId: string;
    senderId: string;
    uid: string;
    participants: string[];
    personOf: (uid: string) => Person;
    focus?: 'duel';
    onClose: () => void;
    onRespond: (status: InviteStatus) => void;
    onProposeDate: () => void;
    onChangeDate: () => void;
    onAcceptProposal: (fromUid: string, when: number) => void;
    onCancel: () => void;
}

const Section: React.FC<{ title: string; children: React.ReactNode; innerRef?: React.Ref<HTMLElement> }> = ({ title, children, innerRef }) => (
    <section ref={innerRef} className="px-5 py-4 border-t border-white/5">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">{title}</h3>
        {children}
    </section>
);

/** Todo sobre la quedada: quién va, el sitio, los platos y, después, las notas de la mesa. */
export const EventSheet: React.FC<Props> = ({
    invite, messageId, senderId, uid, participants, personOf, focus, onClose,
    onRespond, onProposeDate, onChangeDate, onAcceptProposal, onCancel,
}) => {
    useBodyScrollLock(true);
    const panelRef = useSheetDismiss(onClose);
    const navigate = useNavigate();
    const { place } = usePlaceDetails(invite.placeId);
    const [confirmCancel, setConfirmCancel] = useState(false);
    const duelRef = useRef<HTMLElement>(null);
    const past = inviteIsPast(invite);
    const isMine = senderId === uid;
    const groups = groupResponses(invite, senderId, participants);
    const myStatus = invite.responses?.[uid]?.status;
    const going = groups.going.includes(uid);
    const open = !past && !invite.cancelled;
    const dayHours = todayHours(place?.openingHours, new Date(invite.when));
    const closedThatDay = !!dayHours && /cerrado|closed/i.test(dayHours);
    const dishes = summarizePlaceDishes(place?.reviews || []).slice(0, 6);
    const photo = invite.imageUrl || place?.photoUrl;

    useEffect(() => {
        if (focus === 'duel' && place) duelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [focus, place]);

    const go = (route: string | null) => { if (route) { onClose(); navigate(route); } };
    const downloadIcs = () => {
        const url = URL.createObjectURL(new Blob([buildIcs(invite, messageId)], { type: 'text/calendar;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'quedada-listopic.ics';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const rsvp = (status: InviteStatus, label: string, positive = false) => {
        const active = myStatus === status || (status === 'maybe' && myStatus === 'other');
        return (
            <button
                type="button"
                onClick={() => onRespond(status)}
                className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-all active:scale-95 ${active
                    ? (positive ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-white text-gray-900')
                    : 'bg-white/10 hover:bg-white/15 text-gray-100'}`}
            >
                {label}
            </button>
        );
    };

    const chip = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-100';
    const personRow = (id: string, extra?: React.ReactNode) => (
        <li key={id} className="flex items-center gap-2 py-1">
            <Avatar person={personOf(id)} size={26} />
            <span className="text-sm text-gray-100 truncate flex-1">{id === uid ? 'Tú' : personOf(id).name}</span>
            {extra}
        </li>
    );

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div ref={panelRef} className="w-full md:max-w-lg max-h-[94vh] overflow-y-auto bg-[var(--lt-card-strong)] border border-white/10 rounded-t-3xl md:rounded-3xl shadow-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
                <div className={`relative h-52 bg-gradient-to-br from-[var(--lt-accent)] to-[var(--lt-bg-deep)] ${invite.cancelled ? 'grayscale' : ''}`}>
                    {photo
                        ? <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
                        : <span className="absolute right-6 top-6 text-7xl opacity-80">🍽️</span>}
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--lt-card-strong)] via-black/30 to-black/10" />
                    <button type="button" onClick={onClose} className="absolute right-3 top-3 p-2 rounded-full bg-black/50 text-white" aria-label="Cerrar"><X className="w-5 h-5" /></button>
                    <span className="absolute left-4 top-4 rounded-full bg-black/55 backdrop-blur px-3 py-1 text-xs font-bold text-white">
                        {invite.cancelled ? '🚫 Cancelada' : countdownLabel(invite.when)}
                    </span>
                    <div className="absolute left-5 right-5 bottom-3">
                        <p className="text-[11px] font-bold tracking-widest text-white/80">🍽️ QUEDADA · ORGANIZA {isMine ? 'TÚ' : personOf(senderId).name.toUpperCase()}</p>
                        <h2 className="text-2xl font-extrabold leading-tight text-white">{invite.itemName || invite.placeName}</h2>
                        {invite.itemName && <p className="text-sm text-gray-200">en <b>{invite.placeName}</b>{invite.placeCity ? ` · ${invite.placeCity}` : ''}</p>}
                    </div>
                </div>

                <div className="px-5 pt-2 pb-4">
                    <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
                        <div className="rounded-xl bg-white text-gray-900 text-center px-3 py-1.5 leading-none">
                            <span className="block text-[10px] font-bold uppercase text-[var(--lt-accent)]">{new Date(invite.when).toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}</span>
                            <span className="block text-2xl font-black">{new Date(invite.when).getDate()}</span>
                        </div>
                        <div className="min-w-0">
                            <p className={`text-base font-bold text-white ${invite.cancelled ? 'line-through' : ''}`}>{formatLongDay(invite.when)}</p>
                            <p className="text-sm text-gray-300">a las <b className="text-white">{formatTime(invite.when)}</b></p>
                        </div>
                    </div>
                    {invite.note && <p className="mt-3 text-sm italic text-gray-300">«{invite.note}»</p>}
                    {invite.cancelled && <p className="mt-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-3 py-2">Esta quedada se ha cancelado.</p>}

                    {open && !isMine && (
                        <>
                            <div className="flex gap-2 mt-4">
                                {rsvp('yes', '✅ Voy', true)}
                                {rsvp('maybe', '🤔 En duda')}
                                {rsvp('no', '❌ No puedo')}
                            </div>
                            <button type="button" onClick={onProposeDate} className="w-full mt-2 py-2 text-xs font-semibold text-gray-300 hover:text-white">🗓️ ¿Te viene mejor otro día? Propónlo</button>
                        </>
                    )}
                    {open && isMine && (
                        <div className="flex gap-2 mt-4">
                            <button type="button" onClick={onChangeDate} className="flex-1 py-2.5 rounded-2xl text-sm font-bold bg-white/10 text-gray-100">📅 Cambiar fecha</button>
                            {confirmCancel
                                ? <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-2xl text-sm font-bold bg-red-500 text-white">¿Seguro? Cancelar</button>
                                : <button type="button" onClick={() => setConfirmCancel(true)} className="flex-1 py-2.5 rounded-2xl text-sm font-bold bg-white/5 text-gray-400">🚫 Cancelar</button>}
                        </div>
                    )}
                    {past && going && !invite.cancelled && (
                        <button type="button" onClick={() => go(reviewRoute(invite))} className="w-full mt-4 py-3 rounded-2xl text-sm font-bold bg-emerald-500 text-white">⭐ ¿Qué tal estaba? Valóralo</button>
                    )}
                </div>

                {past && !invite.cancelled && (
                    <Section title="🥊 Notas de la mesa" innerRef={duelRef}>
                        <DuelTable invite={invite} attendees={groups.going} uid={uid} nameOf={(id) => personOf(id).name} placeReviews={place?.reviews || null} />
                    </Section>
                )}

                <Section title={`¿Quién va? · ${groups.going.length}`}>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-3">
                            <p className="text-xs font-bold text-emerald-300 mb-1">✅ Van · {groups.going.length}</p>
                            <ul>{groups.going.map((id) => personRow(id, id === senderId ? <span className="text-[10px] text-gray-400">organiza</span> : null))}</ul>
                        </div>
                        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-3">
                            <p className="text-xs font-bold text-amber-300 mb-1">🤔 Dudas · {groups.maybe.length}</p>
                            {groups.maybe.length === 0 && <p className="text-xs text-gray-500">Nadie</p>}
                            <ul>
                                {groups.maybe.map(({ uid: id, proposedAt }) => personRow(id, proposedAt ? (
                                    <span className="text-right">
                                        <span className="block text-[10px] text-amber-200">{formatWhen(proposedAt)}</span>
                                        {isMine && open && <button type="button" onClick={() => onAcceptProposal(id, proposedAt)} className="text-[10px] font-bold text-emerald-300">Me vale</button>}
                                    </span>
                                ) : null))}
                            </ul>
                        </div>
                        <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
                            <p className="text-xs font-bold text-gray-300 mb-1">❌ No van · {groups.no.length}</p>
                            {groups.no.length === 0 && <p className="text-xs text-gray-500">Nadie</p>}
                            <ul>{groups.no.map((id) => personRow(id))}</ul>
                        </div>
                    </div>
                    {groups.pending.length > 0 && (
                        <p className="text-[11px] text-gray-500 mt-2">Sin responder: {groups.pending.map((id) => (id === uid ? 'tú' : personOf(id).name)).join(', ')}</p>
                    )}
                </Section>

                <Section title="El sitio">
                    <div className="space-y-1.5 text-sm text-gray-200">
                        <p className="font-bold text-white">{place?.name || invite.placeName}</p>
                        {(place?.address || invite.placeCity) && <p className="text-gray-400">{place?.address || invite.placeCity}</p>}
                        {dayHours && (
                            <p className={closedThatDay ? 'text-red-300' : ''}>
                                🕑 {closedThatDay ? '⚠️ Ese día cierra' : `Ese día: ${dayHours}`}
                            </p>
                        )}
                        <p className="flex flex-wrap gap-x-3 gap-y-1">
                            {place && place.avgScore > 0 && <span>Listopic <b style={{ color: 'var(--lt-text)' }}>{formatScore(place.avgScore)}</b> <span className="text-gray-500">({place.reviewCount})</span></span>}
                            {place?.googleRating ? <span>Google <b>{place.googleRating.toFixed(1)}</b> ★</span> : null}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                        {placeRoute(invite) && <button type="button" onClick={() => go(placeRoute(invite))} className={chip}><ExternalLink className="w-3.5 h-3.5" />Ver sitio</button>}
                        <a href={place?.googleMapsUri || mapsUrl(invite)} target="_blank" rel="noopener noreferrer" className={chip}><MapPin className="w-3.5 h-3.5" />Cómo llegar</a>
                        {place?.phone && <a href={`tel:${place.phone}`} className={chip}><Phone className="w-3.5 h-3.5" />Llamar</a>}
                        {open && <a href={googleCalendarUrl(invite)} target="_blank" rel="noopener noreferrer" className={chip}><CalendarPlus className="w-3.5 h-3.5" />Google Calendar</a>}
                        {open && <button type="button" onClick={downloadIcs} className={chip}><CalendarPlus className="w-3.5 h-3.5" />iPhone / Outlook</button>}
                    </div>
                </Section>

                <Section title="Platos y notas">
                    {!place && <p className="text-sm text-gray-500">Cargando…</p>}
                    {place && dishes.length === 0 && <p className="text-sm text-gray-500">Aún no hay platos valorados aquí.</p>}
                    <ul className="space-y-1.5">
                        {dishes.map((d) => {
                            const isPlan = sameItemName(d.itemName, invite.itemName);
                            return (
                                <li key={d.itemName}>
                                    <button
                                        type="button"
                                        onClick={() => go(dishRoute({ ...invite, itemName: d.itemName }))}
                                        className={`w-full flex items-center gap-3 rounded-xl p-1.5 text-left hover:bg-white/5 ${isPlan ? 'bg-[var(--lt-accent-soft)] ring-1 ring-[var(--lt-accent-border)]' : ''}`}
                                    >
                                        {d.photoUrl
                                            ? <img src={d.photoUrl} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" loading="lazy" />
                                            : <span className="w-11 h-11 rounded-lg bg-white/5 flex items-center justify-center shrink-0">🍽️</span>}
                                        <span className="flex-1 min-w-0">
                                            <span className="block text-sm font-bold text-white truncate">{isPlan ? '🎯 ' : ''}{d.itemName}</span>
                                            <span className="block text-[11px] text-gray-500">{d.count} {d.count === 1 ? 'reseña' : 'reseñas'}</span>
                                        </span>
                                        <span className="text-xs font-bold px-1.5 py-0.5 rounded-md" style={scoreBadgeStyle(d.avg)}>{formatScore(d.avg)}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </Section>
            </div>
        </div>,
        document.body
    );
};
