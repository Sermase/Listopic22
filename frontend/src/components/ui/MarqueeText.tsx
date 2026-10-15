import React, { useLayoutEffect, useRef, useState } from 'react';

const GAP_PX = 32;
const SPEED_PX_PER_S = 28;

interface MarqueeTextProps {
    text: string;
    className?: string;
    as?: 'span' | 'p' | 'h2' | 'h3' | 'h4';
}

/**
 * Texto de una línea que, si no cabe, se desplaza solo para leerse entero
 * (con una pausa al principio). Si cabe, se queda quieto. Sin animación si el
 * usuario pide reducir el movimiento: entonces se corta con puntos suspensivos.
 */
export const MarqueeText: React.FC<MarqueeTextProps> = ({ text, className = '', as: Tag = 'span' }) => {
    const boxRef = useRef<HTMLSpanElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const [textWidth, setTextWidth] = useState(0);

    useLayoutEffect(() => {
        const box = boxRef.current;
        const measured = textRef.current;
        if (!box || !measured) return;
        const measure = () => {
            // offsetWidth ignora las transformaciones (p. ej. el zoom al pasar el ratón).
            const width = measured.offsetWidth;
            setTextWidth(width - box.clientWidth > 2 ? width : 0);
        };
        measure();
        // La fuente puede llegar después y cambiar el ancho del texto.
        let alive = true;
        document.fonts?.ready.then(() => { if (alive) measure(); }).catch(() => { /* sin fuentes, sin más */ });
        if (typeof ResizeObserver === 'undefined') return () => { alive = false; };
        const observer = new ResizeObserver(measure);
        observer.observe(box);
        return () => {
            alive = false;
            observer.disconnect();
        };
    }, [text]);

    const moving = textWidth > 0;
    const distance = textWidth + GAP_PX;
    const style = moving
        ? ({
            '--lt-marquee-shift': `-${distance}px`,
            '--lt-marquee-duration': `${Math.max(4, distance / SPEED_PX_PER_S + 1.5).toFixed(1)}s`,
        } as React.CSSProperties)
        : undefined;

    return (
        <Tag className={`block min-w-0 ${className}`} title={moving ? text : undefined}>
            <span ref={boxRef} className={`lt-marquee block overflow-hidden whitespace-nowrap ${moving ? 'lt-marquee-on' : 'text-ellipsis'}`}>
                <span className={moving ? 'lt-marquee-track' : ''} style={style}>
                    <span ref={textRef}>{text}</span>
                    {moving && <span aria-hidden="true" className="lt-marquee-dup" style={{ paddingLeft: GAP_PX }}>{text}</span>}
                </span>
            </span>
        </Tag>
    );
};
