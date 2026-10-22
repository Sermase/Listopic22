import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { markWelcomeSeen, welcomeSeen, WELCOME_EVENT } from '../lib/welcome';

const CARDS = [
    { emoji: '🏆', title: 'Rankings de cosas concretas', text: 'Cada lista es un ranking: las mejores bravas, tortillas, cocidos… según la gente.' },
    { emoji: '📍', title: 'Lo bueno, cerca', text: 'En Inicio ves lo mejor valorado a tu alrededor. Toca cualquier plato o sitio para ver más.' },
    { emoji: '➕', title: 'Valora con el botón central', text: 'Puntúa cada criterio, cuenta qué tal en una frase y sube una foto si quieres.' },
    { emoji: 'ⓘ', title: 'Ayuda a mano', text: 'Por la app verás iconos ⓘ: tócalos y te explican esa parte. Si ya no los necesitas, apágalos desde el propio ⓘ o en Menú → Ayuda.' },
];

// Solo en pantallas de descubrir; nunca encima de un formulario o un enlace compartido.
const SHOW_ON = /^\/($|search|list\/|place\/|group\/)/;

/** Cuatro tarjetas la primera vez que alguien entra. Se pueden saltar y volver a ver desde Ayuda. */
export const WelcomeCards: React.FC = () => {
    const { pathname } = useLocation();
    // Se decide en cada ruta: quien entra por /login o /ayuda las ve al llegar a Inicio.
    const [closed, setClosed] = useState(false);
    const [forced, setForced] = useState(false);
    const [step, setStep] = useState(0);
    const open = forced || (!closed && !welcomeSeen() && SHOW_ON.test(pathname));

    useEffect(() => {
        const reopen = () => { setStep(0); setForced(true); };
        window.addEventListener(WELCOME_EVENT, reopen);
        return () => window.removeEventListener(WELCOME_EVENT, reopen);
    }, []);

    if (!open) return null;
    const close = () => { markWelcomeSeen(); setClosed(true); setForced(false); };
    const card = CARDS[step];
    const last = step === CARDS.length - 1;

    return createPortal(
        <div className="fixed inset-0 z-[10002] flex items-end justify-center bg-black/65 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4">
            <div role="dialog" aria-label="Bienvenida" className="w-full rounded-t-[2rem] border border-[var(--lt-border)] bg-[var(--lt-card-strong)] p-6 text-center shadow-2xl sm:max-w-sm sm:rounded-[2rem]" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}>
                <div className="text-5xl" aria-hidden="true">{card.emoji}</div>
                <h2 className="mt-3 font-display text-xl font-bold text-[var(--lt-text)]">{card.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--lt-text-muted)]">{card.text}</p>
                <div className="mt-5 flex justify-center gap-1.5" aria-hidden="true">
                    {CARDS.map((_, i) => (
                        <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-[var(--lt-accent)]' : 'w-1.5 bg-[var(--lt-border)]'}`} />
                    ))}
                </div>
                <div className="mt-5 flex gap-2">
                    <button type="button" onClick={close} className="flex-1 rounded-xl py-3 text-sm font-bold text-[var(--lt-text-muted)] hover:text-[var(--lt-text)]">
                        Saltar
                    </button>
                    <button
                        type="button"
                        onClick={() => (last ? close() : setStep(step + 1))}
                        className="flex-1 rounded-xl py-3 text-sm font-bold lt-on-accent"
                        style={{ backgroundImage: 'var(--lt-accent-grad)' }}
                    >
                        {last ? '¡Vamos!' : 'Siguiente'}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
};
