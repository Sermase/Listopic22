/**
 * 👀 ¿Cuánta gente te ve? (spec §9.3): visitas por día (7 o 30 columnas, hoy
 * recuadrado), «≈ visitas distintas», tus días fuertes de la semana y la tabla
 * con los números. Si falla la analítica, PanelError: nunca un 0.
 */
import React, { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { EmptyState, HelpToggle, kit, PanelError } from '../kit';
import { formatCount, plural } from '../sponsored/sponsoredMeta';
import { MiniColumns, type MiniColumn } from './MiniColumns';
import { WEEKDAY_ABBR } from './statsMeta';
import { dayDetail, formatDayLabel, weekdayIndex, type TrafficSummary, type WeekdayStrength } from './statsModel';
import { CardSkeleton, secondaryActionClass, StatsCard } from './statsParts';
import type { StatsLoadStatus } from './useStatsData';

export interface VisitsCardProps {
    placeId: string;
    status: StatsLoadStatus;
    summary: TrafficSummary | null;
    weekdays: { days: WeekdayStrength[]; best: WeekdayStrength | null; max: number } | null;
    onRetry: () => void;
    onBoost: () => void;
    busy?: boolean;
    className?: string;
}

const dayNumber = (key: string): string => String(Number(key.slice(8, 10)));

/** Etiquetas del eje: todas con 7 días; con 30, la primera, la del medio y «hoy». */
const toColumns = (days: TrafficSummary['days']): MiniColumn[] => {
    const dense = days.length > 12;
    const middle = Math.floor((days.length - 1) / 2);
    return days.map((day, index) => {
        const isToday = index === days.length - 1;
        let axisLabel: React.ReactNode = null;
        if (!dense) {
            const weekday = WEEKDAY_ABBR[(weekdayIndex(day.date) + 1) % 7];
            axisLabel = isToday ? <>hoy<br />{dayNumber(day.date)}</> : <>{weekday}<br />{dayNumber(day.date)}</>;
        } else if (isToday) {
            axisLabel = 'hoy';
        } else if (index === 0 || index === middle) {
            axisLabel = formatDayLabel(day.date, false);
        }
        return {
            key: day.date,
            value: day.views,
            detail: isToday ? `Hoy · ${dayDetail(day)}` : dayDetail(day),
            axisLabel,
            current: isToday,
        };
    });
};

const WeekdayStrip: React.FC<{ weekdays: NonNullable<VisitsCardProps['weekdays']> }> = ({ weekdays }) => (
    <div className="space-y-2">
        <h4 className="text-sm font-semibold text-[var(--lt-text)]">
            <span aria-hidden="true">📅 </span>Tus días fuertes
        </h4>
        <ol aria-label="Visitas de media por día de la semana" className="grid grid-cols-7 gap-1.5">
            {weekdays.days.map((day) => {
                const isBest = weekdays.best?.index === day.index;
                const strength = weekdays.max > 0 ? day.average / weekdays.max : 0;
                const average = day.average >= 10 ? Math.round(day.average) : Math.round(day.average * 10) / 10;
                return (
                    <li key={day.index} className="flex min-w-0 flex-col items-center gap-1">
                        <span aria-hidden="true" className="h-5 text-base leading-none">{isBest ? '👑' : ''}</span>
                        <span aria-hidden="true" className="relative block h-8 w-full overflow-hidden rounded-lg border border-[var(--lt-border)] bg-[var(--lt-glass)]">
                            {strength > 0 && (
                                <span className="absolute inset-0 bg-[var(--lt-accent)]" style={{ opacity: 0.12 + strength * strength * 0.88 }} />
                            )}
                        </span>
                        <span className={cn('text-xs', isBest ? 'font-black text-[var(--lt-text)]' : 'font-semibold text-[var(--lt-text-muted)]')}>
                            <span aria-hidden="true">{day.short}</span>
                            <span className="sr-only">
                                {`${day.name}: ${String(average).replace('.', ',')} visitas de media${isBest ? ', tu mejor día' : ''}`}
                            </span>
                        </span>
                    </li>
                );
            })}
        </ol>
        <p className="text-xs text-[var(--lt-text-muted)]">
            {weekdays.best
                ? `Media de las últimas 8 semanas. Los ${weekdays.best.plural} son tu mejor día.`
                : 'Media de las últimas 8 semanas. Con unas cuantas visitas más sabremos cuál es tu mejor día.'}
        </p>
    </div>
);

const NumbersTable: React.FC<{ days: TrafficSummary['days']; id: string }> = ({ days, id }) => (
    <div id={id} className={cn(kit.inset, 'max-h-72 overflow-y-auto')}>
        <table className="w-full text-sm">
            <caption className="sr-only">Visitas y compartidos por día</caption>
            <thead className="sticky top-0 bg-[var(--lt-card-strong)] text-xs text-[var(--lt-text-muted)]">
                <tr>
                    <th scope="col" className="px-3 py-2 text-left font-semibold">Día</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Visitas</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Distintas</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Compartidos</th>
                </tr>
            </thead>
            <tbody className="tabular-nums">
                {[...days].reverse().map((day) => (
                    <tr key={day.date} className="border-t border-[var(--lt-border)]">
                        <th scope="row" className="px-3 py-1.5 text-left font-semibold text-[var(--lt-text)]">{formatDayLabel(day.date)}</th>
                        <td className="px-3 py-1.5 text-right text-[var(--lt-text)]">{formatCount(day.views)}</td>
                        <td className="px-3 py-1.5 text-right text-[var(--lt-text-muted)]">{formatCount(day.sessions)}</td>
                        <td className="px-3 py-1.5 text-right text-[var(--lt-text)]">{formatCount(day.shares)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

export const VisitsCard: React.FC<VisitsCardProps> = ({ placeId, status, summary, weekdays, onRetry, onBoost, busy, className }) => {
    const [showTable, setShowTable] = useState(false);
    const tableId = useId();

    let body: React.ReactNode;
    if (status === 'error') {
        body = <PanelError what="las visitas de tu ficha" onRetry={onRetry} />;
    } else if (status === 'loading' || !summary) {
        body = <CardSkeleton chart lines={1} label="Cargando tus visitas…" />;
    } else if (summary.views === 0) {
        body = (
            <EmptyState
                as="h4"
                size="sm"
                emoji="🌱"
                title="Tu ficha aún no ha tenido visitas en estos días."
                text="Compártela o date un impulso para que te descubran."
                actions={(
                    <>
                        <Link to={`/place/${encodeURIComponent(placeId)}`} className={secondaryActionClass}>
                            <span aria-hidden="true">🔗</span>
                            Ver mi ficha
                        </Link>
                        <button type="button" onClick={onBoost} className={secondaryActionClass}>
                            <span aria-hidden="true">📣</span>
                            Dar un impulso
                        </button>
                    </>
                )}
            />
        );
    } else {
        body = (
            <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <p className="text-sm text-[var(--lt-text-muted)]">
                        <strong className="text-lg font-black text-[var(--lt-text)]">{formatCount(summary.views)}</strong>
                        {summary.views === 1 ? ' visita' : ' visitas'}
                    </p>
                    <div className="flex flex-wrap items-center">
                        <p className="text-sm text-[var(--lt-text-muted)]">
                            ≈ <strong className="font-black text-[var(--lt-text)]">{formatCount(summary.sessions)}</strong>
                            {summary.sessions === 1 ? ' visita distinta' : ' visitas distintas'}
                        </p>
                        <HelpToggle label="Qué son las visitas distintas">
                            <span aria-hidden="true">ℹ️ </span>Una misma persona cuenta una vez al día mientras no recargue.
                        </HelpToggle>
                    </div>
                </div>

                <MiniColumns
                    ariaLabel={`Visitas por día, ${plural(summary.days.length, 'día', 'días')}`}
                    hint="Toca una columna para ver el día"
                    columns={toColumns(summary.days)}
                />

                {weekdays && <WeekdayStrip weekdays={weekdays} />}

                <div className="space-y-2">
                    <button
                        type="button"
                        aria-expanded={showTable}
                        aria-controls={tableId}
                        onClick={() => setShowTable((value) => !value)}
                        className={cn('-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-bold text-[var(--lt-accent)]', kit.focus)}
                    >
                        <span aria-hidden="true">🔢</span>
                        {showTable ? 'Ocultar números' : 'Ver números'}
                        <ChevronDown aria-hidden="true" className={cn('h-4 w-4 transition-transform', showTable && 'rotate-180')} />
                    </button>
                    {showTable && <NumbersTable id={tableId} days={summary.days} />}
                </div>
            </>
        );
    }

    return (
        <StatsCard emoji="👀" title="¿Cuánta gente te ve?" help="Visitas a tu ficha cada día." busy={busy} className={className}>
            {body}
        </StatsCard>
    );
};
