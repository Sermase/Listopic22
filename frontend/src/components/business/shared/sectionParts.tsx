import React from 'react';
import { Loader2, Save, Sparkles } from 'lucide-react';

// Piezas comunes de la gestión del negocio (Ficha y pestañas Pro) antes del kit
// de components/business/kit. Movidas tal cual desde BusinessManagePage y
// BusinessProSections: se irán sustituyendo por el kit pestaña a pestaña.

export type Message = { type: 'success' | 'error'; text: string } | null;

export const inputClass = 'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--lt-text)] outline-none transition-colors placeholder:text-[var(--lt-text-muted)] focus:border-[var(--lt-accent-border)]';

export const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
    <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-[var(--lt-text-muted)]">{label}</span>
        {children}
        {hint && <span className="mt-1 block text-xs text-[var(--lt-text-muted)]">{hint}</span>}
    </label>
);

export const SectionMessage: React.FC<{ message: Message }> = ({ message }) => {
    if (!message) return null;
    return (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
            message.type === 'success'
                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                : 'border-red-500/25 bg-red-500/10 text-red-200'
        }`}>
            {message.text}
        </div>
    );
};

export const SaveButton: React.FC<{ saving: boolean; onClick: () => void; label?: string }> = ({ saving, onClick, label = 'Guardar' }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={saving}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--lt-accent)] px-4 py-2.5 text-sm font-black text-white shadow-lg disabled:opacity-60"
    >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {label}
    </button>
);

export const ProSectionShell: React.FC<{
    title: string;
    text: string;
    icon: React.ElementType;
    children: React.ReactNode;
}> = ({ title, text, icon: Icon, children }) => (
    <section className="rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] p-5">
        <div className="mb-5 flex items-start gap-3 border-b border-white/10 pb-5">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]">
                <Icon className="h-5 w-5" />
            </div>
            <div>
                <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-black text-[var(--lt-text)]">{title}</h2>
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-200">
                        <Sparkles className="h-3 w-3" />
                        Pro
                    </span>
                </div>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--lt-text-muted)]">{text}</p>
            </div>
        </div>
        {children}
    </section>
);
