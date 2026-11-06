import React, { useEffect, useState } from 'react';
import type { ThemeId } from '../../context/ThemeContext';
import { fireSurprise, prefersReducedMotion } from '../../lib/surprises';
import { activeCharacter } from '../../lib/themeCharacters';
import { duskAlpha, emberAlpha, isGoldenHour, startOfWeek } from '../../lib/themeAmbience';
import { useMyReviewCount } from '../../hooks/useMyReviewCount';

const setVar = (name: string, value: string | null) => {
    const root = document.documentElement;
    if (value === null) root.style.removeProperty(name);
    else root.style.setProperty(name, value);
};

/**
 * Gracias de ambiente que no son animaciones sueltas: variables de CSS en <html>
 * (ascuas de Brasa, puesta de sol de Atardecer), la clase `lt-graces` (el letrero
 * de Neón que parpadea) y el aviso de la hora dorada. Va dentro de SurpriseHost.
 */
export const ThemeAmbience: React.FC<{ theme: ThemeId; gracesOn: boolean; charactersOn: boolean }> = ({ theme, gracesOn, charactersOn }) => {
    const [week] = useState(() => startOfWeek(new Date()));
    const weekCount = useMyReviewCount(week, gracesOn && theme === 'warm');

    // Neón y compañía: solo con las gracias encendidas y sin «menos movimiento».
    useEffect(() => {
        const on = gracesOn && !prefersReducedMotion();
        document.documentElement.classList.toggle('lt-graces', on);
        return () => document.documentElement.classList.remove('lt-graces');
    }, [gracesOn]);

    // Brasa: las ascuas brillan más con cada valoración de esta semana.
    useEffect(() => {
        if (!gracesOn || theme !== 'warm') return;
        setVar('--lt-ember-a', String(emberAlpha(weekCount)));
        return () => setVar('--lt-ember-a', null);
    }, [gracesOn, theme, weekCount]);

    // Atardecer: el fondo se enciende al acercarse la puesta de sol.
    useEffect(() => {
        if (!gracesOn || theme !== 'sunset') return;
        const place = () => setVar('--lt-dusk-a', String(duskAlpha(new Date())));
        place();
        const timer = window.setInterval(place, 10 * 60_000);
        return () => {
            window.clearInterval(timer);
            setVar('--lt-dusk-a', null);
        };
    }, [gracesOn, theme]);

    // El del Vermú avisa de la hora dorada, una vez al día.
    useEffect(() => {
        if (!charactersOn || theme !== 'sunset' || !isGoldenHour(new Date())) return;
        const character = activeCharacter('sunset');
        if (!character) return;
        const key = 'listopic_hora_dorada';
        const today = new Date().toDateString();
        try {
            if (localStorage.getItem(key) === today) return;
        } catch { return; }
        const t = window.setTimeout(() => {
            try { localStorage.setItem(key, today); } catch { /* opcional */ }
            fireSurprise({ kind: 'bubble', emoji: character.emoji, text: 'Es la hora dorada: lo que valores ahora sale con la mejor luz.' });
        }, 9_000);
        return () => window.clearTimeout(t);
    }, [charactersOn, theme]);

    return null;
};
