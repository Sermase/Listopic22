import React from 'react';
import { Link } from 'react-router-dom';
import { Check, Search, UserPlus } from 'lucide-react';
import { UserAvatar } from '../../UserAvatar';
import { MarqueeText } from '../../ui/MarqueeText';

/** Chip de búsqueda reciente (toca y busca). */
export const RecentSearchChip: React.FC<{ query: string; onSearch: (query: string) => void }> = ({ query, onSearch }) => (
    <button
        type="button"
        onClick={() => onSearch(query)}
        className="flex max-w-[220px] items-center gap-2 rounded-full border border-[var(--lt-border)] bg-[var(--lt-card-strong)] py-2 pl-3 pr-4 text-sm font-semibold text-[var(--lt-text)] shadow-sm transition-colors hover:border-[var(--lt-accent-border)] hover:bg-[var(--lt-accent-soft)]"
    >
        <Search className="h-3.5 w-3.5 shrink-0 text-[var(--lt-text-muted)]" />
        <span className="truncate">{query}</span>
    </button>
);

interface PersonCardProps {
    uid: string;
    name: string;
    username?: string | null;
    photoUrl?: string | null;
    userType?: unknown;
    /** Afinidad (0–100); si falta no hay chapa. */
    affinity?: number;
    reason?: string;
    follow?: { following: boolean; busy: boolean; onToggle: () => void };
}

/** Tarjeta de persona con el tamaño y el aire de las tarjetas de la Home. */
export const PersonCard: React.FC<PersonCardProps> = ({ uid, name, username, photoUrl, userType, affinity, reason, follow }) => (
    <div className="lt-media-card group relative flex h-[170px] w-[156px] shrink-0 flex-col items-center overflow-hidden rounded-3xl border border-[var(--lt-border)] bg-[var(--lt-card-strong)] px-3 pb-3 pt-4 text-center shadow-lg transition-transform duration-300 hover:scale-[1.03] md:h-[190px] md:w-[176px]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 opacity-80" style={{ backgroundImage: 'linear-gradient(180deg, var(--lt-accent-soft), transparent)' }} />
        {typeof affinity === 'number' && (
            <span className="lt-on-accent absolute right-2.5 top-2.5 z-10 rounded-full bg-[var(--lt-accent)] px-2 py-0.5 font-display text-[11px] font-black shadow-md" aria-label={`${affinity}% de afinidad`}>
                {affinity}%
            </span>
        )}
        <Link to={`/profile/${uid}`} className="relative flex min-w-0 flex-1 flex-col items-center self-stretch">
            <UserAvatar photoUrl={photoUrl ?? undefined} displayName={name} userType={userType as string | string[] | undefined} size="lg" />
            <MarqueeText as="h3" text={name} className="mt-2 w-full text-sm font-bold leading-tight text-[var(--lt-text)]" />
            {username && <p className="w-full truncate text-[11px] text-[var(--lt-text-muted)]">@{username}</p>}
            {reason && <p className="mt-1 line-clamp-2 w-full text-[11px] font-medium leading-snug text-[var(--lt-text-muted)]">{reason}</p>}
        </Link>
        {follow && (
            <button
                type="button"
                onClick={follow.onToggle}
                disabled={follow.busy}
                className={`relative mt-1.5 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold transition-opacity disabled:opacity-60 ${follow.following
                    ? 'border border-[var(--lt-border-strong)] text-[var(--lt-text)]'
                    : 'lt-on-accent bg-[var(--lt-accent)] hover:opacity-90'}`}
            >
                {follow.following ? <Check className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}
                {follow.following ? 'Siguiendo' : 'Seguir'}
            </button>
        )}
    </div>
);
