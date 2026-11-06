import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useAppConfig } from '../../context/AppConfigContext';
import { isSurpriseOn } from '../../lib/surprises';
import { startOfMonth, todaysMenu } from '../../lib/themeAmbience';
import { hashString, mulberry32 } from '../../lib/homeFeeds';
import { useMyReviewCount } from '../../hooks/useMyReviewCount';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MAX_STARS = 60;

/** Medianoche: tu cielo del mes, una estrella por valoración. */
const MonthSky: React.FC = () => {
    const [since] = useState(() => startOfMonth(new Date()));
    const count = useMyReviewCount(since, true);
    const month = MONTHS[since.getMonth()];
    const stars = useMemo(() => {
        const rand = mulberry32(hashString(`cielo-${since.toISOString()}`));
        return Array.from({ length: Math.min(count ?? 0, MAX_STARS) }, (_, i) => ({
            key: i, left: 3 + rand() * 94, top: 8 + rand() * 70, size: 1.5 + rand() * 2.5, delay: rand() * 4,
        }));
    }, [count, since]);
    if (count === null) return null;
    return (
        <div className="relative mb-3 h-20 overflow-hidden rounded-2xl border border-[rgba(199,210,254,0.25)]" style={{ background: 'radial-gradient(circle at 85% 20%, rgba(199,210,254,.18), transparent 35%), linear-gradient(180deg, #0b1130, #182256)' }}>
            {stars.map((s) => (
                <span
                    key={s.key}
                    className="absolute rounded-full bg-white"
                    style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, boxShadow: '0 0 6px rgba(255,255,255,.9)', animation: `lt-sky-twinkle 3.2s ${s.delay}s ease-in-out infinite` }}
                />
            ))}
            <p className="absolute inset-x-0 bottom-1.5 text-center text-[11px] font-semibold text-[rgba(224,231,255,0.85)]">
                {count === 0 ? `Tu cielo de ${month} aún está a oscuras: cada valoración enciende una estrella.` : `Tu cielo de ${month}: ${count} ${count === 1 ? 'estrella' : 'estrellas'}, una por valoración.`}
            </p>
        </div>
    );
};

/** Pizarra: el menú del día a tiza, con tres platos de «Cerca y bueno». */
const DailyMenu: React.FC<{ onNavigate: () => void }> = ({ onNavigate }) => {
    const [dishes] = useState(() => todaysMenu());
    if (!dishes.length) return null;
    return (
        <div className="mb-3 rounded-xl px-4 pb-3 pt-2" style={{ background: 'rgba(0,0,0,.18)', border: '1px dashed rgba(244,241,232,.35)' }}>
            <p className="text-center text-2xl font-bold text-[#f4f1e8]" style={{ fontFamily: "'Caveat Variable', 'Caveat', cursive" }}>Menú del día</p>
            <ol className="mt-1 space-y-1">
                {dishes.map((d, i) => (
                    <li key={d.to}>
                        <Link to={d.to} onClick={onNavigate} className="flex items-baseline gap-2 text-[#f4f1e8]" style={{ fontFamily: "'Caveat Variable', 'Caveat', cursive" }}>
                            <span className="text-lg opacity-70">{['1.º', '2.º', 'Postre'][i] ?? `${i + 1}.º`}</span>
                            <span className="min-w-0 flex-1 truncate text-xl">{d.title}{d.subtitle ? <span className="opacity-70"> · {d.subtitle}</span> : null}</span>
                            {typeof d.score === 'number' && <span className="text-xl text-[#bef264]">{d.score.toFixed(1).replace('.', ',')}</span>}
                        </Link>
                    </li>
                ))}
            </ol>
        </div>
    );
};

/** Lo que el menú (Navbar) enseña según el tema: el cielo de Medianoche o el menú de la Pizarra. */
export const MenuAmbience: React.FC<{ onNavigate: () => void }> = ({ onNavigate }) => {
    const { theme, graceUnlocked } = useTheme();
    const config = useAppConfig();
    if (!isSurpriseOn(config, 'themeGraces')) return null;
    if (theme === 'dark' && graceUnlocked('dark')) return <MonthSky />;
    if (theme === 'graphite') return <DailyMenu onNavigate={onNavigate} />;
    return null;
};
