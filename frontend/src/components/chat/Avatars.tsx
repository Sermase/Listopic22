import React from 'react';

export interface Person {
    name: string;
    photoUrl?: string;
}

export const Avatar: React.FC<{ person: Person; size?: number; ring?: boolean }> = ({ person, size = 28, ring = false }) => (
    <span
        className={`inline-flex items-center justify-center rounded-full overflow-hidden bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] font-bold shrink-0 ${ring ? 'ring-2 ring-[var(--lt-card-strong)]' : ''}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
        title={person.name}
    >
        {person.photoUrl ? <img src={person.photoUrl} alt="" className="w-full h-full object-cover" /> : person.name.charAt(0).toUpperCase()}
    </span>
);

/** Caras apiladas («y 3 más»). */
export const AvatarStack: React.FC<{ people: Person[]; max?: number; size?: number }> = ({ people, max = 4, size = 26 }) => (
    <span className="inline-flex items-center">
        {people.slice(0, max).map((p, i) => (
            <span key={`${p.name}-${i}`} style={{ marginLeft: i ? -size * 0.3 : 0 }}>
                <Avatar person={p} size={size} ring />
            </span>
        ))}
        {people.length > max && <span className="ml-1 text-[11px] text-gray-400">+{people.length - max}</span>}
    </span>
);
