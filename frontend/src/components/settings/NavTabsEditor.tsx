import React from 'react';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAppConfig } from '../../context/AppConfigContext';
import { isLabAppEnabled } from '../../lib/labApps';
import { BAR_SLOTS, DEFAULT_NAV_ORDER, NAV_TABS, saveNavOrder, useNavOrder, type NavTabId } from '../../lib/navTabs';

const usableOrder = (order: NavTabId[], pachoteOn: boolean) => order.filter((id) => id !== 'pachote' || pachoteOn);

/** Lo que va en la barra, en corto («Inicio · Buscar · Chats · Perfil»). */
export const NavTabsSummary: React.FC = () => {
    const { isJefe } = useAuth();
    const pachoteOn = isLabAppEnabled(useAppConfig(), 'pachote', isJefe);
    return <>{usableOrder(useNavOrder(), pachoteOn).slice(0, BAR_SLOTS).map((id) => NAV_TABS[id].label).join(' · ')}</>;
};

const arrowClass = 'flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--lt-border)] text-[var(--lt-text-muted)] transition-colors hover:text-[var(--lt-text)] disabled:opacity-30';

/** Barra de abajo: una lista que se ordena con flechas; las cuatro primeras van en la barra y el resto, en el menú. Se guarda al momento. */
export const NavTabsEditor: React.FC = () => {
    const { isJefe } = useAuth();
    const pachoteOn = isLabAppEnabled(useAppConfig(), 'pachote', isJefe);
    const list = usableOrder(useNavOrder(), pachoteOn);
    const isDefault = list.join() === usableOrder(DEFAULT_NAV_ORDER, pachoteOn).join();

    const move = (index: number, delta: number) => {
        const next = [...list];
        [next[index], next[index + delta]] = [next[index + delta], next[index]];
        saveNavOrder(next);
    };

    const preview = (id: NavTabId) => {
        const Icon = NAV_TABS[id].icon;
        return (
            <span key={id} className="flex min-w-0 flex-col items-center gap-0.5 text-[9px] font-bold text-[var(--lt-text-muted)]">
                <Icon className="h-4 w-4" />
                <span className="max-w-full truncate">{NAV_TABS[id].label}</span>
            </span>
        );
    };

    return (
        <div className="space-y-3">
            {/* Así queda la barra. */}
            <div aria-hidden="true" className="grid grid-cols-5 items-center rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card-strong)] px-1 py-2">
                {list.slice(0, 2).map(preview)}
                <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full lt-on-accent" style={{ backgroundImage: 'var(--lt-accent-grad)' }}>
                    <Plus className="h-4 w-4" strokeWidth={3} />
                </span>
                {list.slice(2, BAR_SLOTS).map(preview)}
            </div>
            <p className="text-xs text-[var(--lt-text-muted)]">Ordénalas con las flechas: las {BAR_SLOTS} primeras van en la barra y el resto, en el menú ☰.</p>

            <ol className="space-y-1.5">
                {list.map((id, index) => {
                    const { icon: Icon, label } = NAV_TABS[id];
                    return (
                        <React.Fragment key={id}>
                            {index === BAR_SLOTS && (
                                <li aria-hidden="true" className="px-1 pt-2 text-[11px] font-bold uppercase tracking-widest text-[var(--lt-text-muted)]">En el menú</li>
                            )}
                            <li className={`flex items-center gap-3 rounded-xl border px-3 py-1.5 ${index < BAR_SLOTS ? 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)]' : 'border-[var(--lt-border)] bg-[var(--lt-glass)]'}`}>
                                <Icon className="h-4 w-4 shrink-0 text-[var(--lt-accent)]" aria-hidden="true" />
                                <span className="flex-1 text-sm font-semibold text-[var(--lt-text)]">{label}</span>
                                <button type="button" className={arrowClass} aria-label={`Subir ${label}`} disabled={index === 0} onClick={() => move(index, -1)}>
                                    <ArrowUp className="h-4 w-4" />
                                </button>
                                <button type="button" className={arrowClass} aria-label={`Bajar ${label}`} disabled={index === list.length - 1} onClick={() => move(index, 1)}>
                                    <ArrowDown className="h-4 w-4" />
                                </button>
                            </li>
                        </React.Fragment>
                    );
                })}
            </ol>
            {!isDefault && (
                <button type="button" onClick={() => saveNavOrder(null)} className="text-xs font-semibold text-[var(--lt-accent)]">Volver a la de siempre</button>
            )}
        </div>
    );
};
