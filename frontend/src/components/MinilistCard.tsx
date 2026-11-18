import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Layers, Lock } from 'lucide-react';
import { formatScore, scoreBadgeStyle } from '../lib/scoreScale';
import { peopleLabel, type MinilistCardData } from '../lib/minilists';

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Tarjeta propia de Minilista (no la de Lista): hojas apiladas detrás, color
 * secundario y «Minilista de …». El podio se despliega a petición; sus datos ya
 * vienen en la Minilista, así que desplegarlo no lee nada.
 */
export const MinilistCard: React.FC<{ card: MinilistCardData; showParent?: boolean; onNavigate?: () => void }> = ({ card, showParent = false, onNavigate }) => {
    const [open, setOpen] = useState(false);
    const contestChip = card.contest === 'open' ? '🏆 Concurso abierto' : card.contest === 'before' ? '🏆 Concurso · pronto' : card.contest === 'after' ? '🏆 Concurso terminado' : null;
    return (
        <article className="relative pt-1.5" data-testid="minilist-card">
            {/* Hojas apiladas: lo que la distingue de una Lista. */}
            <div aria-hidden="true" className="absolute inset-x-4 top-0 h-3 rounded-t-xl border border-b-0 border-[var(--lt-border)] bg-[var(--lt-card)] opacity-60" />
            <div aria-hidden="true" className="absolute inset-x-2 top-[3px] h-3 rounded-t-xl border border-b-0 border-[var(--lt-border)] bg-[var(--lt-card)] opacity-80" />
            <div className="relative overflow-hidden rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card-strong)] shadow-sm" style={{ borderLeft: '3px solid var(--lt-accent-2)' }}>
                <Link to={`/list/${card.id}`} onClick={onNavigate} className="flex gap-3 p-3 hover:bg-[var(--lt-card)] transition-colors">
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[var(--lt-card)]">
                        {card.coverUrl ? (
                            <img src={card.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : card.podium[0]?.photo ? (
                            <img src={card.podium[0].photo} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center bg-[var(--lt-accent-soft)]"><Layers className="h-7 w-7 text-[var(--lt-accent-2)]" /></div>
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[10px] font-bold uppercase tracking-wider text-[var(--lt-accent-2)]">
                            Minilista{showParent && card.parentListName ? ` de ${card.parentListName}` : ''}
                        </p>
                        <h3 className="line-clamp-2 font-display text-base font-bold leading-tight text-[var(--lt-text)]">{card.name}</h3>
                        {card.authorName && (
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--lt-text-muted)]">
                                {card.authorPhoto
                                    ? <img src={card.authorPhoto} alt="" className="h-4 w-4 rounded-full object-cover" />
                                    : <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--lt-accent-soft)] text-[9px] font-bold text-[var(--lt-accent)]">{card.authorName.charAt(0).toUpperCase()}</span>}
                                <span className="truncate">{card.authorName}</span>
                            </p>
                        )}
                        <div className="mt-1.5 flex flex-wrap gap-1">
                            {contestChip && <span className="rounded-md bg-[var(--lt-warning-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--lt-warning)]">{contestChip}</span>}
                            {card.official && <span className="rounded-md bg-[var(--lt-accent-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--lt-accent)]">✔️ Oficial</span>}
                            {!card.isPublic && <span className="inline-flex items-center gap-0.5 rounded-md bg-[var(--lt-card)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--lt-text-muted)]"><Lock className="h-2.5 w-2.5" /> Privada</span>}
                        </div>
                    </div>
                </Link>
                <div className="flex items-center gap-3 border-t border-[var(--lt-border)] px-3 py-2 text-xs text-[var(--lt-text-muted)]">
                    <span title="Personas que han valorado">👥 {peopleLabel(card.participantsCount)}</span>
                    <span title="Valoraciones">⭐ {card.reviewCount}</span>
                    <span title="Seguidores">❤️ {card.followersCount}</span>
                    {card.podium.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setOpen((v) => !v)}
                            aria-expanded={open}
                            className="ml-auto inline-flex items-center gap-1 rounded-full bg-[var(--lt-card)] px-2 py-0.5 font-bold text-[var(--lt-text)] hover:text-[var(--lt-accent)]"
                        >
                            🥇 Podio <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </button>
                    )}
                </div>
                {open && (
                    <ol className="grid grid-cols-3 gap-2 px-3 pb-3" aria-label={`Podio de ${card.name}`}>
                        {card.podium.map((entry, i) => (
                            <li key={`${entry.name}-${i}`} className="min-w-0">
                                <div className="relative aspect-square overflow-hidden rounded-xl bg-[var(--lt-card)]">
                                    {entry.photo
                                        ? <img src={entry.photo} alt="" loading="lazy" className="h-full w-full object-cover" />
                                        : <div className="flex h-full w-full items-center justify-center text-2xl">{MEDALS[i]}</div>}
                                    {entry.photo && <span className="absolute left-1 top-1 text-base leading-none drop-shadow">{MEDALS[i]}</span>}
                                    <span className="absolute bottom-1 right-1 rounded-md px-1 text-[11px] font-bold" style={scoreBadgeStyle(entry.average)}>{formatScore(entry.average)}</span>
                                </div>
                                <p className="mt-1 truncate text-[11px] font-bold text-[var(--lt-text)]">{entry.name}</p>
                                {entry.placeName && entry.placeName !== entry.name && <p className="truncate text-[10px] text-[var(--lt-text-muted)]">{entry.placeName}</p>}
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </article>
    );
};
