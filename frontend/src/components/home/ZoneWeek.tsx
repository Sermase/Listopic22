import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { FriendBite, ZoneWeek } from '../../lib/zoneWeek';
import { shortAgo } from '../../lib/zoneWeek';
import { scoreBadgeStyle } from '../../lib/scoreScale';
import { ProgressiveImage } from '../ProgressiveImage';
import { DishArtTile } from './DishArt';

const fmt = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const Stat: React.FC<{ value: number; label: string; orMore?: boolean }> = ({ value, label, orMore }) => (
    <div className="rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-glass)] px-2 py-2 text-center">
        <span className="block font-display text-xl font-bold tabular-nums text-[var(--lt-text)]">{value}{orMore && value > 0 ? '+' : ''}</span>
        <span className="block text-[11px] leading-tight text-[var(--lt-text-muted)]">{label}</span>
    </div>
);

const Line: React.FC<{ icon: string; to: string; children: React.ReactNode }> = ({ icon, to, children }) => (
    <Link to={to} className="flex items-center gap-2.5 rounded-xl px-1 py-1.5 text-[13px] text-[var(--lt-text)] transition-colors hover:bg-[var(--lt-glass)]">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--lt-glass)] text-base" aria-hidden="true">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{children}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--lt-text-muted)]" aria-hidden="true" />
    </Link>
);

/**
 * «Tu zona esta semana»: qué se mueve cerca (lib/zoneWeek). `partial`: Inicio no
 * ha cargado toda la semana (tope de reseñas), así que los totales son «N o más».
 */
export const ZoneWeekCard: React.FC<{ week: ZoneWeek; scope?: string; partial?: boolean }> = ({ week, scope, partial }) => (
    <section
        aria-label="Tu zona esta semana"
        className="rounded-3xl border border-[var(--lt-border)] p-3.5 shadow-lg"
        style={{ backgroundImage: 'linear-gradient(160deg, var(--lt-accent-soft), transparent 55%)', backgroundColor: 'var(--lt-card)' }}
    >
        <div className="flex items-center justify-between gap-2">
            <span className="rounded-lg bg-[var(--lt-accent-soft)] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--lt-accent)]">Tu zona esta semana</span>
            {scope && <span className="truncate text-[11px] text-[var(--lt-text-muted)]">{scope}</span>}
        </div>
        {week.reviews === 0 ? (
            <div className="mt-3 flex items-center gap-3">
                <p className="min-w-0 flex-1 text-sm text-[var(--lt-text)]">Esta semana aún no hay valoraciones por aquí. ¿La estrenas tú?</p>
                <Link to="/create-review" className="shrink-0 rounded-xl px-3 py-2 text-xs font-bold lt-on-accent" style={{ backgroundImage: 'var(--lt-accent-grad)' }}>Valorar algo</Link>
            </div>
        ) : (
            <>
                <div className="mt-3 grid grid-cols-3 gap-2">
                    <Stat value={week.reviews} label={week.reviews === 1 ? 'valoración' : 'valoraciones'} orMore={partial} />
                    <Stat value={week.withPhoto} label="con foto" orMore={partial} />
                    <Stat value={week.newPlaces} label={week.newPlaces === 1 ? 'sitio nuevo' : 'sitios nuevos'} orMore={partial} />
                </div>
                <div className="mt-2">
                    {week.star && (
                        <Line icon="⭐" to={week.star.to}>
                            Plato estrella: <b>{week.star.title}</b>{week.star.detail ? <> de {week.star.detail}</> : null}{typeof week.star.score === 'number' ? <> · <b>{fmt(week.star.score)}</b></> : null}
                        </Line>
                    )}
                    {week.newcomer && (
                        <Line icon="🆕" to={week.newcomer.to}>
                            Recién llegado: <b>{week.newcomer.title}</b>{week.newcomer.detail ? <>, {week.newcomer.detail}</> : null}
                        </Line>
                    )}
                    {week.busiestList && (
                        <Line icon="🔥" to={week.busiestList.to}>
                            Lista más movida: <b>{week.busiestList.title}</b> ({week.busiestList.count})
                        </Line>
                    )}
                </div>
            </>
        )}
    </section>
);

/** «Tus colegas»: lo último que ha valorado cada persona a la que sigues. */
export const FriendsRow: React.FC<{ bites: FriendBite[]; now: number; onViewAll?: () => void }> = ({ bites, now, onViewAll }) => {
    if (!bites.length) return null;
    return (
        <section aria-label="Tus colegas">
            <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="text-base font-bold text-[var(--lt-text)]">Tus colegas</h2>
                {onViewAll && (
                    <button type="button" onClick={onViewAll} className="flex items-center gap-0.5 text-xs font-bold text-[var(--lt-accent)] hover:opacity-80">
                        Ver todo <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                )}
            </div>
            <ul className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
                {bites.map((bite) => (
                    <li key={bite.id} className="w-[76px] shrink-0">
                        <Link to={bite.to} className="block text-center" aria-label={`${bite.authorName} le dio un ${fmt(bite.score)} a ${bite.title}${bite.place ? ` en ${bite.place}` : ''}`}>
                            <span className="relative mx-auto block h-[60px] w-[60px]">
                                <span className="block h-full w-full overflow-hidden rounded-full border-2 border-[var(--lt-accent)]">
                                    {bite.photo ? (
                                        <ProgressiveImage src={bite.photo} alt="" containerClassName="h-full w-full" className="h-full w-full object-cover" fallback={<DishArtTile names={[bite.title, bite.place]} />} />
                                    ) : (
                                        <DishArtTile names={[bite.title, bite.place]} />
                                    )}
                                </span>
                                {bite.authorPhoto && (
                                    <img src={bite.authorPhoto} alt="" className="absolute -left-1 -top-1 h-6 w-6 rounded-full border-2 border-[var(--lt-bg)] object-cover" />
                                )}
                                <span className="absolute -bottom-1 -right-1.5 rounded-lg px-1.5 py-0.5 font-display text-[11px] font-bold tabular-nums" style={scoreBadgeStyle(bite.score)}>
                                    {fmt(bite.score)}
                                </span>
                            </span>
                            <span className="mt-1.5 block truncate text-xs font-bold text-[var(--lt-text)]">{bite.authorName}</span>
                            <span className="block truncate text-[10px] text-[var(--lt-text-muted)]">{bite.title} · {shortAgo(bite.at, now)}</span>
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
};
