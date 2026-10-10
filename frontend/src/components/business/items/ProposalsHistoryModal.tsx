/**
 * «🕓 Tus propuestas» (spec §7.7): historial de fusiones, renombres y
 * valoraciones movidas, con filtro por estado y línea de tiempo.
 *
 *   <ProposalsHistoryModal open={open} load={loadProposals} onClose={close} />
 *
 * `load` se llama cada vez que se abre (y al reintentar).
 */
import React, { useEffect, useState } from 'react';
import { Modal, Tabs } from '../../ui';
import type { ItemProposal, ItemProposalStatus } from '../../../services/BusinessProService';
import { cn } from '../../../lib/utils';
import { EmptyState, kit, PanelError, StatusPill } from '../kit';
import { formatReviewDate, groupProposalsByWhen } from './menuModel';
import { PROPOSAL_STATUS_META, PROPOSAL_TYPE_META } from './menuVisuals';

export interface ProposalsHistoryModalProps {
    open: boolean;
    load: () => Promise<ItemProposal[]>;
    onClose: () => void;
}

// «Aplicándose» dura segundos: para el negocio sigue contando como pendiente.
type Filter = 'all' | Exclude<ItemProposalStatus, 'applying'>;
const isPendingLike = (status: ItemProposalStatus) => status === 'pending' || status === 'applying';

export const ProposalsHistoryModal: React.FC<ProposalsHistoryModalProps> = (props) => {
    if (!props.open) return null;
    return <ProposalsHistory {...props} />;
};

const Pill: React.FC<{ children: React.ReactNode; strong?: boolean }> = ({ children, strong = false }) => (
    <span
        className={cn(
            'inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-sm font-semibold',
            strong ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-[var(--lt-text)]' : 'border-[var(--lt-border)] text-[var(--lt-text)]',
        )}
    >
        <span className="truncate">{children}</span>
    </span>
);

const ProposalDiff: React.FC<{ proposal: ItemProposal }> = ({ proposal }) => {
    const p = proposal.payload || {};
    if (proposal.type === 'merge') {
        return (
            <p className="flex flex-wrap items-center gap-2">
                <Pill>«{p.sourceItemName || p.sourceItemId}»</Pill>
                <span aria-hidden="true">➜</span>
                <span className="sr-only">se junta con</span>
                <Pill strong>«{p.targetItemName || p.targetItemId}»</Pill>
            </p>
        );
    }
    if (proposal.type === 'rename') {
        return (
            <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--lt-text)]">
                <span className="text-[var(--lt-text-muted)] line-through">«{p.currentName || p.itemId}»</span>
                <span aria-hidden="true">→</span>
                <span className="sr-only">pasa a llamarse</span>
                <span className="font-semibold">«{p.newName}»</span>
            </p>
        );
    }
    return (
        <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--lt-text)]">
            <span>
                💬 valoración{p.reviewAuthorName ? ` de ${p.reviewAuthorName}` : ''}
                {p.reviewItemName ? <span className="text-[var(--lt-text-muted)]"> («{p.reviewItemName}»)</span> : null}
            </span>
            <span aria-hidden="true">➜</span>
            <span className="sr-only">pasa a</span>
            <Pill strong>«{p.targetItemName || p.targetItemId}»</Pill>
        </p>
    );
};

const ProposalsHistory: React.FC<ProposalsHistoryModalProps> = ({ load, onClose }) => {
    const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; rows: ItemProposal[] }>({ status: 'loading', rows: [] });
    const [filter, setFilter] = useState<Filter>('all');

    useEffect(() => {
        let cancelled = false;
        load()
            .then((rows) => { if (!cancelled) setState({ status: 'ready', rows }); })
            .catch(() => { if (!cancelled) setState((prev) => ({ ...prev, status: 'error' })); });
        return () => {
            cancelled = true;
        };
    }, [load]);

    const retry = () => {
        setState((prev) => ({ ...prev, status: 'loading' }));
        load()
            .then((rows) => setState({ status: 'ready', rows }))
            .catch(() => setState((prev) => ({ ...prev, status: 'error' })));
    };

    const counts: Record<Filter, number> = {
        all: state.rows.length,
        pending: state.rows.filter((row) => isPendingLike(row.status)).length,
        approved: state.rows.filter((row) => row.status === 'approved').length,
        rejected: state.rows.filter((row) => row.status === 'rejected').length,
    };
    const shown = filter === 'all'
        ? state.rows
        : state.rows.filter((row) => (filter === 'pending' ? isPendingLike(row.status) : row.status === filter));
    const groups = groupProposalsByWhen(shown);
    const count = (value: number) => <span className="rounded-full bg-[var(--lt-glass)] px-1.5 text-xs tabular-nums">{value}</span>;

    return (
        <Modal isOpen onClose={onClose} title={<span className="text-base font-black">🕓 Tus propuestas</span>}>
            {state.status === 'error' ? (
                <PanelError what="tus propuestas" onRetry={retry} />
            ) : state.status === 'loading' && state.rows.length === 0 ? (
                <div className="space-y-2" aria-busy="true" aria-label="Cargando propuestas">
                    {[0, 1, 2].map((key) => <div key={key} className={cn(kit.inset, 'h-20 animate-pulse motion-reduce:animate-none')} />)}
                </div>
            ) : state.rows.length === 0 ? (
                <EmptyState
                    emoji="🧹"
                    title="Todo limpio."
                    text="Si ves platos duplicados por erratas, abre su ficha → 🛠️ Correcciones."
                />
            ) : (
                <div className="space-y-4">
                    <Tabs
                        size="lg"
                        value={filter}
                        onChange={setFilter}
                        scrollable
                        ariaLabel="Filtrar propuestas"
                        options={[
                            { value: 'all', label: 'Todas', suffix: count(counts.all) },
                            { value: 'pending', label: '⏳ Pendientes', suffix: count(counts.pending) },
                            { value: 'approved', label: '✅ Aprobadas', suffix: count(counts.approved) },
                            { value: 'rejected', label: '❌ Rechazadas', suffix: count(counts.rejected) },
                        ]}
                    />
                    {groups.length === 0 ? (
                        <p className="py-6 text-center text-sm text-[var(--lt-text-muted)]">Nada por aquí con este filtro.</p>
                    ) : groups.map((group) => (
                        <section key={group.when} className="space-y-2" aria-label={group.label}>
                            <h3 className="text-xs font-bold text-[var(--lt-text-muted)]">{group.label}</h3>
                            <ol className="space-y-2 border-l-2 border-[var(--lt-border)] pl-3">
                                {group.proposals.map((proposal) => {
                                    const type = PROPOSAL_TYPE_META[proposal.type];
                                    return (
                                        <li key={proposal.id} className={cn(kit.inset, 'relative space-y-2 px-3 py-3')}>
                                            <span aria-hidden="true" className="absolute -left-[19px] top-4 h-2.5 w-2.5 rounded-full bg-[var(--lt-border-strong)]" />
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm font-bold text-[var(--lt-text)]">
                                                    <span aria-hidden="true">{type.emoji} </span>{type.label}
                                                </span>
                                                <StatusPill size="sm" {...PROPOSAL_STATUS_META[proposal.status]} />
                                                {proposal.createdAtMs > 0 && (
                                                    <span className="ml-auto text-xs text-[var(--lt-text-muted)]">{formatReviewDate(proposal.createdAtMs)}</span>
                                                )}
                                            </div>
                                            <ProposalDiff proposal={proposal} />
                                            {proposal.note && (
                                                <p className="text-xs text-[var(--lt-text-muted)]"><span className="font-semibold">Tu nota:</span> {proposal.note}</p>
                                            )}
                                            {proposal.adminNotes && (
                                                <p className="rounded-xl rounded-tl-sm bg-[var(--lt-accent-soft)] px-3 py-2 text-sm text-[var(--lt-text)]">
                                                    <span aria-hidden="true">🗨️ </span><span className="font-semibold">Equipo Listopic:</span> {proposal.adminNotes}
                                                </p>
                                            )}
                                        </li>
                                    );
                                })}
                            </ol>
                        </section>
                    ))}
                </div>
            )}
        </Modal>
    );
};
