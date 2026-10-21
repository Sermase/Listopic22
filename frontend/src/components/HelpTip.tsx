import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Info, X } from 'lucide-react';
import { helpTopic, type HelpTopicId } from '../lib/helpTopics';
import { usePreferences } from '../context/PreferencesContext';

interface HelpTipProps {
    topic: HelpTopicId;
    className?: string;
}

/**
 * Mini ⓘ: al tocarla explica esa parte de la app con el mismo texto que la
 * página Ayuda. Se apagan todas desde Ayuda o Preferencias.
 */
export const HelpTip: React.FC<HelpTipProps> = ({ topic, className = '' }) => {
    const { prefs, setPref } = usePreferences();
    const [open, setOpen] = useState(false);
    if (!prefs.showHelpTips) return null;
    const t = helpTopic(topic);

    return (
        <>
            <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
                aria-label={`Ayuda: ${t.title}`}
                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--lt-text-muted)] opacity-70 transition-opacity hover:opacity-100 ${className}`}
            >
                <Info className="h-3.5 w-3.5" />
            </button>
            {open && createPortal(
                <div className="fixed inset-0 z-[10001] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4" onClick={() => setOpen(false)}>
                    <div role="dialog" aria-label={t.title} className="w-full rounded-t-3xl border border-[var(--lt-border)] bg-[var(--lt-card-strong)] p-5 shadow-2xl sm:max-w-sm sm:rounded-3xl" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }} onClick={(e) => e.stopPropagation()}>
                        <div className="mb-3 flex items-start gap-3">
                            <span className="text-2xl" aria-hidden="true">{t.emoji}</span>
                            <h2 className="flex-1 font-display text-lg font-bold leading-tight text-[var(--lt-text)]">{t.title}</h2>
                            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="rounded-full p-1.5 text-[var(--lt-text-muted)] hover:bg-[var(--lt-glass)]">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="space-y-2 text-sm leading-relaxed text-[var(--lt-text)]">
                            {t.body.map((p) => <p key={p}>{p}</p>)}
                        </div>
                        <div className="mt-5 flex items-center justify-between gap-3 text-xs">
                            <button type="button" onClick={() => { setPref('showHelpTips', false); setOpen(false); }} className="font-semibold text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]">
                                No mostrar más ⓘ
                            </button>
                            <Link to="/ayuda" onClick={() => setOpen(false)} className="font-bold text-[var(--lt-accent)] hover:underline">Toda la ayuda ›</Link>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
};
