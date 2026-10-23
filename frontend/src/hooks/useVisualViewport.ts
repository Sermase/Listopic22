import { useEffect, useState } from 'react';

export interface VisualViewportBox {
    height: number;
    top: number;
    /** El teclado del móvil tapa parte de la pantalla (iOS no cambia el alto de la página). */
    keyboard: boolean;
}

const read = (): VisualViewportBox | null => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    return vv ? { height: vv.height, top: vv.offsetTop, keyboard: window.innerHeight - vv.height > 120 } : null;
};

/** Zona realmente visible: sin las barras del navegador ni el teclado. */
export function useVisualViewport(): VisualViewportBox | null {
    const [box, setBox] = useState(read);

    useEffect(() => {
        const vv = window.visualViewport;
        if (!vv) return;
        const update = () => setBox(read());
        vv.addEventListener('resize', update);
        vv.addEventListener('scroll', update);
        return () => {
            vv.removeEventListener('resize', update);
            vv.removeEventListener('scroll', update);
        };
    }, []);

    return box;
}
