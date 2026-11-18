import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MapPin, Trophy } from 'lucide-react';
import { ProgressiveImage } from '../ProgressiveImage';

export interface FeaturedContestData {
    id: string;
    name: string;
    photoUrl?: string;
    datesLabel: string | null;
    scopeLabel: string;
    candidates: number;
    upcoming: boolean;
}

/** Concurso abierto destacado en Inicio (lo acepta un jefe; no es patrocinado). */
export const FeaturedContestCard: React.FC<{ contest: FeaturedContestData }> = ({ contest }) => (
    <Link
        to={`/list/${contest.id}`}
        className="lt-media-card group relative block h-44 overflow-hidden rounded-[1.75rem] border border-amber-400/40 shadow-xl sm:h-56"
        style={{ boxShadow: '0 18px 40px -18px rgba(245, 158, 11, 0.45)' }}
    >
        {contest.photoUrl ? (
            <ProgressiveImage
                src={contest.photoUrl}
                alt=""
                containerClassName="absolute inset-0"
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                fallback={<div className="absolute inset-0 bg-gradient-to-br from-amber-500 to-orange-700" />}
            />
        ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500 to-orange-700" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 sm:p-6">
            <div className="min-w-0">
                <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-300 backdrop-blur">
                    <Trophy className="h-3 w-3" /> {contest.upcoming ? 'Concurso · pronto' : 'Concurso abierto'}
                </span>
                <h2 className="line-clamp-2 font-display text-2xl font-bold leading-tight text-white drop-shadow sm:text-3xl">{contest.name}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-white/80">
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{contest.scopeLabel}</span>
                    {contest.datesLabel && <span>{contest.datesLabel}</span>}
                    <span>{contest.candidates} {contest.candidates === 1 ? 'aspirante' : 'aspirantes'}</span>
                </div>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400 text-black transition-transform group-hover:translate-x-1">
                <ArrowRight className="h-5 w-5" />
            </span>
        </div>
    </Link>
);
