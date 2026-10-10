/**
 * QueueToolbar: cabecera de una cola de Developer.
 *   [ ⏳ Pendientes 3 | 🗂️ Resueltos ]                🔎 [buscar…]  [↻ Actualizar]
 *   [ ✅ Aprobadas 12 ] [ ❌ Rechazadas 3 ] [ Todas ]       (solo si pasas `filters`)
 *   ⚠️ Índice en construcción: orden aproximado y quizá incompleto (máx. 200)   (solo si `degraded`)
 *
 * No toca la URL: la pestaña conecta los callbacks con su `onNavigate`, que
 * escribe ?view= y ?status= con replace. Por ejemplo:
 *   <QueueToolbar
 *     view={view} onViewChange={(v) => onNavigate({ view: v, status: '', focus: null })}
 *     pendingCount={counts.pending}
 *     filters={view === 'resolved' ? [{ value: 'approved', label: 'Aprobadas', emoji: '✅', count: 12 }, …] : undefined}
 *     filter={status} onFilterChange={(s) => onNavigate({ status: s })}
 *     search={search} onSearchChange={setSearch}
 *     onRefresh={reload} refreshing={loading} updatedAt={dataUpdatedAt} degraded={page.degraded}
 *   />
 *
 * Props
 *   view: string                         vista activa
 *   onViewChange: (view: string) => void
 *   views?: QueueViewOption[]            por defecto «⏳ Pendientes (pendingCount) | 🗂️ Resueltos»
 *   pendingCount?: number | null         contador de la vista por defecto «Pendientes»
 *   resolvedLabel?: string               «Resueltos» por defecto (p. ej. «Resueltas», «Historial»)
 *   filters?: QueueFilterOption[]        chips de estado con contador
 *   filter?: string | null               chip activo
 *   onFilterChange?: (value: string) => void
 *   search?: string; onSearchChange?: (value: string) => void; searchPlaceholder?: string
 *   onRefresh?: () => void; refreshing?: boolean
 *   updatedAt?: number | null            ms de la última carga → «actualizado hace 1 min»
 *   degraded?: boolean                   aviso de índice en construcción (sin índice, fetchQueue
 *                                        trae como mucho FALLBACK_LIMIT sin orden de servidor)
 *   actions?: ReactNode                  botones extra a la derecha
 *   className?: string
 *
 * QueueViewOption / QueueFilterOption = { value: string; label: string; emoji?: string; count?: number | null }
 */
import React from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { FALLBACK_LIMIT } from '../../../services/adminQueues';
import { formatAge } from '../../../utils/adminTime';
import { Button, Tabs, type TabOption } from '../../ui';

export interface QueueViewOption {
    value: string;
    label: string;
    emoji?: string;
    count?: number | null;
}

export type QueueFilterOption = QueueViewOption;

export interface QueueToolbarProps {
    view: string;
    onViewChange: (view: string) => void;
    views?: QueueViewOption[];
    pendingCount?: number | null;
    resolvedLabel?: string;
    filters?: QueueFilterOption[];
    filter?: string | null;
    onFilterChange?: (value: string) => void;
    search?: string;
    onSearchChange?: (value: string) => void;
    searchPlaceholder?: string;
    onRefresh?: () => void;
    refreshing?: boolean;
    updatedAt?: number | null;
    degraded?: boolean;
    actions?: React.ReactNode;
    className?: string;
}

const CountBubble: React.FC<{ count?: number | null }> = ({ count }) => (typeof count === 'number'
    ? <span className="min-w-5 rounded-full bg-black/20 px-1.5 text-center text-[11px] font-bold tabular-nums">{count.toLocaleString('es-ES')}</span>
    : null);

export const QueueToolbar: React.FC<QueueToolbarProps> = ({
    view,
    onViewChange,
    views,
    pendingCount,
    resolvedLabel = 'Resueltos',
    filters,
    filter,
    onFilterChange,
    search,
    onSearchChange,
    searchPlaceholder = 'Buscar por lugar, usuario, email o id',
    onRefresh,
    refreshing = false,
    updatedAt,
    degraded = false,
    actions,
    className,
}) => {
    const viewOptions: QueueViewOption[] = views ?? [
        { value: 'pending', label: 'Pendientes', emoji: '⏳', count: pendingCount },
        { value: 'resolved', label: resolvedLabel, emoji: '🗂️' },
    ];
    const tabOptions: TabOption<string>[] = viewOptions.map((option) => ({
        value: option.value,
        label: (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                {option.emoji && <span aria-hidden="true">{option.emoji}</span>}
                {option.label}
                <CountBubble count={option.count} />
            </span>
        ),
    }));
    // Re-render cada minuto para que «hace 3 min» no se quede congelado.
    const [, setMinuteTick] = React.useState(0);
    React.useEffect(() => {
        if (!updatedAt) return undefined;
        const handle = window.setInterval(() => setMinuteTick((value) => value + 1), 60 * 1000);
        return () => window.clearInterval(handle);
    }, [updatedAt]);
    const updatedText = updatedAt ? formatAge(updatedAt) : '';

    return (
        <div className={cn('space-y-3', className)}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="-mx-1 max-w-full overflow-x-auto px-1">
                    <Tabs value={view} options={tabOptions} onChange={onViewChange} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {onSearchChange && (
                        <label className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
                            <span className="sr-only">Buscar</span>
                            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm">🔎</span>
                            <input
                                type="search"
                                value={search ?? ''}
                                onChange={(event) => onSearchChange(event.target.value)}
                                placeholder={searchPlaceholder}
                                className="h-9 w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-[var(--lt-text)] outline-none transition-colors placeholder:text-gray-500 focus:border-[var(--lt-accent-border)]"
                            />
                        </label>
                    )}
                    {actions}
                    {onRefresh && (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={onRefresh}
                            disabled={refreshing}
                            title={updatedText ? `Actualizado ${updatedText}` : undefined}
                            leftIcon={<RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />}
                        >
                            Actualizar
                        </Button>
                    )}
                </div>
            </div>

            {filters && filters.length > 0 && (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
                    {filters.map((option) => {
                        const selected = option.value === filter;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => onFilterChange?.(option.value)}
                                className={cn(
                                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
                                    selected
                                        ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-[var(--lt-text)]'
                                        : 'border-white/10 bg-white/5 text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]',
                                )}
                            >
                                {option.emoji && <span aria-hidden="true">{option.emoji}</span>}
                                {option.label}
                                {typeof option.count === 'number' && (
                                    <span className="tabular-nums opacity-70">{option.count.toLocaleString('es-ES')}</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {(degraded || updatedText) && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    {degraded && (
                        <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-semibold text-amber-300">
                            ⚠️ Índice en construcción: orden aproximado y quizá incompleto (máx. {FALLBACK_LIMIT})
                        </span>
                    )}
                    {updatedText && <span className="text-gray-500">Actualizado {updatedText}</span>}
                </div>
            )}
        </div>
    );
};
