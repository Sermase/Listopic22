import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { HELP_TOPICS } from '../lib/helpTopics';
import { reopenWelcome } from '../lib/welcome';

/** Ayuda: cómo funciona cada parte, en corto. Lo que se ajusta está en Preferencias. */
export const HelpPage: React.FC = () => (
    <div className="min-h-screen bg-[var(--lt-bg)] px-4 pb-24 pt-safe-24">
        <div className="mx-auto max-w-2xl space-y-6 pt-4">
            <header>
                <h1 className="font-display text-2xl font-bold text-[var(--lt-text)]">Ayuda</h1>
                <p className="mt-1 text-sm text-[var(--lt-text-muted)]">Cómo funciona cada parte de Listopic, en corto.</p>
            </header>

            <section className="space-y-2">
                {HELP_TOPICS.map((t) => (
                    <details key={t.id} id={t.id} className="group rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card)]">
                        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                            <span className="text-xl" aria-hidden="true">{t.emoji}</span>
                            <span className="flex-1 text-sm font-bold text-[var(--lt-text)]">{t.title}</span>
                            <ChevronDown className="h-4 w-4 text-[var(--lt-text-muted)] transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="space-y-2 px-4 pb-4 text-sm leading-relaxed text-[var(--lt-text)]">
                            {t.body.map((p) => <p key={p}>{p}</p>)}
                        </div>
                    </details>
                ))}
            </section>

            <Link to="/preferencias" className="flex items-center gap-3 rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card)] px-4 py-3 hover:border-[var(--lt-accent-border)]">
                <span className="text-xl" aria-hidden="true">⚙️</span>
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-[var(--lt-text)]">Preferencias</span>
                    <span className="block text-xs text-[var(--lt-text-muted)]">Perfil, avisos, distancia, tema y tus filtros</span>
                </span>
                <ChevronRight className="h-4 w-4 text-[var(--lt-text-muted)]" />
            </Link>

            <button type="button" onClick={reopenWelcome} className="w-full rounded-xl border border-[var(--lt-border)] py-3 text-sm font-bold text-[var(--lt-text)] hover:border-[var(--lt-accent-border)]">
                Ver otra vez la bienvenida
            </button>
        </div>
    </div>
);

export default HelpPage;
