/**
 * PendingInboxTab: bandeja «📥 Pendientes», la pestaña de inicio de Developer.
 * Sirve para triar, no para decidir: cada fila lleva a su pestaña con la vista
 * y el elemento ya seleccionados (§1 del diseño).
 *
 *   📥 Pendientes                              actualizado hace 1 min [↻]
 *   [Por revisar 9] [Urgentes 1 🚨] [Atención 4 ⏳] [Más antigua hace 5 d]
 *   🚨 Reportes urgentes · 1 … 🏪 Solicitudes de negocio · 3 … (5 filas y «Ver N más →»)
 *   ── Atención ── ⏳ Pro que caduca · 💳 Pagos · 🧹 Vencidas · 📅 Terminan pronto
 *   ▸ Seguimiento (plegado): 👋 leads beta · 🛒 checkouts sin terminar
 *
 * Props
 *   goToTab: GoToTab      DeveloperPage.goToTab (push en la URL)
 *   enabled: boolean      jefeClaim.status === 'ready' (las reglas piden el claim admin)
 *
 * Datos: hooks/useDeveloperInbox (react-query ['developer','inbox']).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
    useDeveloperInbox,
    useInvalidateDeveloper,
    type AttentionItem,
    type AttentionKind,
    type AttentionSection,
    type DeveloperInbox,
    type InboxGroup,
} from '../../hooks/useDeveloperInbox';
import { useAdminNames } from '../../hooks/useAdminNames';
import type { InboxBadge, InboxBadgeTone, InboxItem, QueueTarget } from '../../services/adminQueues';
import { ageLevel, formatAge } from '../../utils/adminTime';
import { Button, Card } from '../ui';
import { AgeChip } from './queue';
import type { GoToTab } from './developerTabs';

export interface PendingInboxTabProps {
    goToTab: GoToTab;
    enabled: boolean;
}

const ROWS_PER_GROUP = 5;
const TICK_MS = 60 * 1000;

const BADGE_TONE_CLASS: Record<InboxBadgeTone, string> = {
    danger: 'border-red-500/30 bg-red-500/10 text-red-300',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    info: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
    neutral: 'border-white/10 bg-white/5 text-gray-300',
};

const ATTENTION_ACTION: Record<AttentionKind, string> = {
    planExpiring: 'Gestionar →',
    billing: 'Ver plan →',
    campaignOverdue: 'Revisar →',
    campaignEndingSoon: 'Ver →',
};

const ATTENTION_MORE_TARGET: Record<AttentionKind, QueueTarget> = {
    planExpiring: { tab: 'plans', view: 'attention' },
    billing: { tab: 'plans', view: 'attention' },
    campaignOverdue: { tab: 'proProposals', view: 'active' },
    campaignEndingSoon: { tab: 'proProposals', view: 'active' },
};

/** Re-render periódico para que «hace 3 min» no se quede congelado. */
const useMinuteTick = (): number => {
    const [tick, setTick] = useState(0);
    useEffect(() => {
        const handle = window.setInterval(() => setTick((value) => value + 1), TICK_MS);
        return () => window.clearInterval(handle);
    }, []);
    return tick;
};

const go = (goToTab: GoToTab, target: QueueTarget) => goToTab(target.tab, {
    view: target.view,
    status: target.status,
    focus: target.focus ?? null,
});

const pluralize = (count: number, one: string, many: string) => `${count.toLocaleString('es-ES')} ${count === 1 ? one : many}`;

// ── Piezas ───────────────────────────────────────────────────────────────────

type TileTone = 'accent' | 'danger' | 'warning' | 'neutral';

const TILE_CLASS: Record<TileTone, string> = {
    accent: 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)]',
    danger: 'border-red-500/30 bg-red-500/10',
    warning: 'border-amber-500/30 bg-amber-500/10',
    neutral: 'border-white/10 bg-[var(--lt-card-strong)]',
};

const TILE_VALUE_CLASS: Record<TileTone, string> = {
    accent: 'text-white',
    danger: 'text-red-300',
    warning: 'text-amber-300',
    neutral: 'text-white',
};

const SummaryTile: React.FC<{ label: string; value: string; emoji: string; tone: TileTone }> = ({ label, value, emoji, tone }) => (
    <div className={cn('rounded-xl border p-4', TILE_CLASS[tone])}>
        <div className="text-xs font-bold uppercase tracking-wider text-gray-400">{label}</div>
        <div className={cn('mt-1 flex items-baseline gap-2 text-2xl font-black tabular-nums', TILE_VALUE_CLASS[tone])}>
            <span>{value}</span>
            <span aria-hidden="true" className="text-lg">{emoji}</span>
        </div>
    </div>
);

const BadgeChip: React.FC<{ badge: InboxBadge; names: Record<string, string> }> = ({ badge, names }) => (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', BADGE_TONE_CLASS[badge.tone])}>
        <span aria-hidden="true">{badge.emoji}</span>
        {badge.text}
        {badge.userId && <span className="font-bold">{names[badge.userId] ?? ''}</span>}
    </span>
);

const LinkButton: React.FC<{ onClick: () => void; children: React.ReactNode; className?: string }> = ({ onClick, children, className }) => (
    <button
        type="button"
        onClick={onClick}
        className={cn('whitespace-nowrap text-xs font-bold text-[var(--lt-accent)] hover:underline', className)}
    >
        {children}
    </button>
);

const InboxRow: React.FC<{ item: InboxItem; names: Record<string, string>; onOpen: () => void }> = ({ item, names, onOpen }) => (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="mt-0.5 shrink-0 text-lg leading-5" aria-hidden="true">{item.emoji}</span>
            <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                {item.subtitle && <p className="mt-0.5 break-words text-xs text-gray-400">{item.subtitle}</p>}
                {item.badges.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {item.badges.map((badge) => (
                            <BadgeChip key={`${badge.emoji}${badge.text}${badge.userId ?? ''}`} badge={badge} names={names} />
                        ))}
                    </div>
                )}
            </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
            <AgeChip at={item.createdAtMs} urgent={item.urgent} />
            <Button variant="secondary" size="sm" onClick={onOpen} aria-label={`Revisar ${item.title}`}>
                Revisar →
            </Button>
        </div>
    </li>
);

const GroupCard: React.FC<{ group: InboxGroup; names: Record<string, string>; goToTab: GoToTab }> = ({ group, names, goToTab }) => {
    const shown = group.items.slice(0, ROWS_PER_GROUP);
    const remaining = Math.max(0, group.total - shown.length);
    const urgent = group.key === 'urgentReports';
    return (
        <section aria-label={group.title} className="space-y-2">
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 className={cn('text-base font-bold', urgent ? 'text-red-300' : 'text-white')}>
                    <span aria-hidden="true">{group.emoji}</span> {group.title}
                    <span className="font-semibold text-gray-500"> · {group.total.toLocaleString('es-ES')}</span>
                </h3>
                {group.oldestMs && shown.length > 1 && <AgeChip at={group.oldestMs} prefix="la más antigua" urgent={urgent} />}
                <LinkButton className="ml-auto" onClick={() => go(goToTab, group.target)}>
                    {urgent ? 'Ir a Reportes →' : 'Ver todas →'}
                </LinkButton>
            </header>
            {group.error ? (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                    ⚠️ {group.error}. Ábrelo desde su pestaña.
                </p>
            ) : (
                <ul className={cn(
                    'divide-y divide-white/5 overflow-hidden rounded-xl border',
                    urgent ? 'border-red-500/30 bg-red-500/5' : 'border-white/10 bg-[var(--lt-card-strong)]',
                )}
                >
                    {shown.map((item) => (
                        <InboxRow key={item.key} item={item} names={names} onOpen={() => go(goToTab, item.target)} />
                    ))}
                </ul>
            )}
            {remaining > 0 && !group.error && (
                <LinkButton className="px-1" onClick={() => go(goToTab, group.target)}>
                    Ver {remaining.toLocaleString('es-ES')} más →
                </LinkButton>
            )}
        </section>
    );
};

const AttentionRow: React.FC<{ item: AttentionItem; muted: boolean; onOpen: () => void }> = ({ item, muted, onOpen }) => (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="mt-0.5 shrink-0 text-lg leading-5" aria-hidden="true">{item.emoji}</span>
            <div className="min-w-0">
                <p className={cn('truncate text-sm font-semibold', muted ? 'text-gray-300' : 'text-white')}>{item.title}</p>
                {item.subtitle && <p className="mt-0.5 break-words text-xs text-gray-400">{item.subtitle}</p>}
            </div>
        </div>
        <div className="flex shrink-0 justify-end">
            <Button variant={muted ? 'ghost' : 'secondary'} size="sm" onClick={onOpen}>
                {ATTENTION_ACTION[item.kind]}
            </Button>
        </div>
    </li>
);

const AttentionBlock: React.FC<{ section: AttentionSection; goToTab: GoToTab }> = ({ section, goToTab }) => {
    const shown = section.items.slice(0, ROWS_PER_GROUP);
    const remaining = section.items.length - shown.length;
    return (
        <section aria-label={section.title} className="space-y-2">
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h4 className={cn('text-sm font-bold', section.informative ? 'text-gray-300' : 'text-white')}>
                    <span aria-hidden="true">{section.emoji}</span> {section.title}
                    {!section.error && <span className="font-semibold text-gray-500"> · {section.items.length.toLocaleString('es-ES')}</span>}
                </h4>
                {section.informative && <span className="text-[11px] font-semibold text-gray-500">Solo informativo</span>}
            </header>
            {section.error ? (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">⚠️ {section.error}</p>
            ) : (
                <ul className={cn(
                    'divide-y divide-white/5 overflow-hidden rounded-xl border',
                    section.informative ? 'border-white/10 bg-[var(--lt-card-strong)]/60' : 'border-amber-500/20 bg-[var(--lt-card-strong)]',
                )}
                >
                    {shown.map((item) => (
                        <AttentionRow key={item.key} item={item} muted={section.informative} onOpen={() => go(goToTab, item.target)} />
                    ))}
                </ul>
            )}
            {remaining > 0 && !section.error && (
                <LinkButton className="px-1" onClick={() => go(goToTab, ATTENTION_MORE_TARGET[section.key])}>
                    Ver {remaining.toLocaleString('es-ES')} más →
                </LinkButton>
            )}
        </section>
    );
};

const FollowUp: React.FC<{ followUp: DeveloperInbox['followUp']; goToTab: GoToTab }> = ({ followUp, goToTab }) => {
    const betaLeads = followUp.betaLeads ?? 0;
    const checkouts = followUp.checkoutsStarted ?? 0;
    if (betaLeads <= 0 && checkouts <= 0) return null;
    const parts = [
        betaLeads > 0 ? `👋 ${pluralize(betaLeads, 'lead beta sin local', 'leads beta sin local')}` : '',
        checkouts > 0 ? `🛒 ${pluralize(checkouts, 'checkout Pro sin terminar', 'checkouts Pro sin terminar')}` : '',
    ].filter(Boolean);
    return (
        <details className="group rounded-xl border border-white/10 bg-[var(--lt-card-strong)]/60">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm text-gray-300 [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className="inline-block text-gray-500 transition-transform group-open:rotate-90">▸</span>
                <span className="font-bold text-white">Seguimiento</span>
                <span className="min-w-0 truncate text-gray-400">{parts.join(' · ')}</span>
            </summary>
            <ul className="divide-y divide-white/5 border-t border-white/10">
                {betaLeads > 0 && (
                    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-gray-300">
                        <span>👋 {pluralize(betaLeads, 'persona pidió', 'personas pidieron')} Business Pro («Lo quiero») sin indicar local.</span>
                        <Button variant="ghost" size="sm" onClick={() => go(goToTab, followUp.betaTarget)}>Ver leads →</Button>
                    </li>
                )}
                {checkouts > 0 && (
                    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-gray-300">
                        <span>🛒 {pluralize(checkouts, 'local empezó', 'locales empezaron')} a pagar Business Pro y no terminó.</span>
                        <Button variant="ghost" size="sm" onClick={() => go(goToTab, followUp.checkoutsTarget)}>Ver checkouts →</Button>
                    </li>
                )}
            </ul>
        </details>
    );
};

const InboxSkeleton: React.FC = () => (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando la bandeja">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
                <div key={index} className="h-20 animate-pulse rounded-xl border border-white/10 bg-[var(--lt-card-strong)]" />
            ))}
        </div>
        {[0, 1].map((index) => (
            <div key={index} className="space-y-2">
                <div className="h-5 w-48 animate-pulse rounded bg-white/10" />
                <div className="h-24 animate-pulse rounded-xl border border-white/10 bg-[var(--lt-card-strong)]" />
            </div>
        ))}
    </div>
);

// ── Pestaña ──────────────────────────────────────────────────────────────────

export const PendingInboxTab: React.FC<PendingInboxTabProps> = ({ goToTab, enabled }) => {
    const inbox = useDeveloperInbox(enabled);
    const invalidateDeveloper = useInvalidateDeveloper();
    useMinuteTick();
    const data = inbox.data;

    const badgeUserIds = useMemo(() => (data?.groups ?? []).flatMap((group) => group.items.flatMap((item) => item.badges
        .map((badge) => badge.userId)
        .filter((uid): uid is string => Boolean(uid)))), [data]);
    const names = useAdminNames(badgeUserIds);

    const refreshing = inbox.isFetching;
    const refresh = () => {
        void invalidateDeveloper();
    };

    const header = (
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h2 className="flex items-center gap-2 text-2xl font-bold text-white">
                    <span aria-hidden="true">📥</span> Pendientes
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                    Lo que espera una decisión, del más antiguo al más reciente. Cada fila te lleva a su pestaña.
                </p>
            </div>
            <div className="flex items-center gap-3">
                {inbox.dataUpdatedAt > 0 && (
                    <span className="text-xs text-gray-500">Actualizado {formatAge(inbox.dataUpdatedAt)}</span>
                )}
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={refresh}
                    disabled={!enabled || refreshing}
                    leftIcon={<RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />}
                >
                    Actualizar
                </Button>
            </div>
        </div>
    );

    if (!enabled) {
        return (
            <div className="mx-auto max-w-5xl space-y-6">
                {header}
                <Card className="p-6 text-sm text-gray-300">
                    🔒 La bandeja necesita tus permisos de Developer activos. Recarga la página o prueba desde Mantenimiento → Provisionar claim admin.
                </Card>
            </div>
        );
    }

    if (inbox.isError && !data) {
        return (
            <div className="mx-auto max-w-5xl space-y-6">
                {header}
                <Card className="p-6 text-sm text-red-300">
                    <p>⚠️ No se pudo cargar la bandeja{inbox.error instanceof Error ? `: ${inbox.error.message}` : '.'}</p>
                    <Button variant="secondary" size="sm" className="mt-3" onClick={refresh}>Reintentar</Button>
                </Card>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="mx-auto max-w-5xl space-y-6">
                {header}
                <InboxSkeleton />
            </div>
        );
    }

    const { summary } = data;
    const visibleGroups = data.groups.filter((group) => group.items.length > 0 || group.error);
    const campaignKeys = new Set(['sponsoredPlacements', 'sponsoredItemSpotlights']);
    const campaignGroups = visibleGroups.filter((group) => campaignKeys.has(group.key) && !group.error);
    const pairCampaigns = campaignGroups.length === 2;
    const attentionSections = data.attention.filter((section) => section.items.length > 0 || section.error);
    const allClear = summary.toReview === 0 && visibleGroups.length === 0;
    const oldestLevel = summary.oldestMs ? ageLevel(summary.oldestMs) : 'fresh';

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            {header}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <SummaryTile label="Por revisar" value={summary.toReview.toLocaleString('es-ES')} emoji="📋" tone={summary.toReview > 0 ? 'accent' : 'neutral'} />
                <SummaryTile label="Urgentes" value={summary.urgent.toLocaleString('es-ES')} emoji="🚨" tone={summary.urgent > 0 ? 'danger' : 'neutral'} />
                <SummaryTile label="Atención" value={summary.attention.toLocaleString('es-ES')} emoji="⏳" tone={summary.attention > 0 ? 'warning' : 'neutral'} />
                <SummaryTile
                    label="Más antigua"
                    value={summary.oldestMs ? formatAge(summary.oldestMs) : 'Ninguna'}
                    emoji="🕰️"
                    tone={!summary.oldestMs ? 'neutral' : oldestLevel === 'old' ? 'danger' : oldestLevel === 'warning' ? 'warning' : 'neutral'}
                />
            </div>

            {(data.degraded || data.errors.length > 0) && (
                <div className="flex flex-wrap gap-2 text-xs">
                    {data.degraded && (
                        <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-semibold text-amber-300">
                            ⚠️ Índice en construcción, orden aproximado
                        </span>
                    )}
                    {data.errors.length > 0 && (
                        <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-semibold text-amber-300">
                            ⚠️ No se pudo cargar: {data.errors.join(', ')}
                        </span>
                    )}
                </div>
            )}

            {allClear ? (
                <Card className="p-8 text-center">
                    <p className="text-4xl" aria-hidden="true">✨</p>
                    <p className="mt-2 text-lg font-bold text-white">Todo al día. No hay nada pendiente</p>
                    <p className="mt-1 text-sm text-gray-400">
                        {attentionSections.length > 0 ? 'Abajo tienes lo que conviene vigilar.' : 'Ni reportes, ni solicitudes, ni campañas por revisar.'}
                    </p>
                </Card>
            ) : (
                <div className="space-y-6">
                    {visibleGroups
                        .filter((group) => !pairCampaigns || !campaignKeys.has(group.key))
                        .map((group) => <GroupCard key={group.key} group={group} names={names} goToTab={goToTab} />)}
                    {pairCampaigns && (
                        <div className="grid gap-6 xl:grid-cols-2">
                            {campaignGroups.map((group) => <GroupCard key={group.key} group={group} names={names} goToTab={goToTab} />)}
                        </div>
                    )}
                </div>
            )}

            {attentionSections.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center gap-3" role="separator" aria-label="Atención">
                        <span className="h-px flex-1 bg-white/10" />
                        <span className="text-xs font-black uppercase tracking-[0.18em] text-gray-500">Atención</span>
                        <span className="h-px flex-1 bg-white/10" />
                    </div>
                    {attentionSections.map((section) => <AttentionBlock key={section.key} section={section} goToTab={goToTab} />)}
                </div>
            )}

            <FollowUp followUp={data.followUp} goToTab={goToTab} />
        </div>
    );
};
