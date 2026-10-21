import React, { useLayoutEffect, useRef, useState } from 'react';

interface ExpandableTextProps {
    text: string;
    /** Líneas visibles antes de «Leer más». */
    lines?: 3 | 4 | 5;
    className?: string;
    defaultExpanded?: boolean;
}

const CLAMP: Record<NonNullable<ExpandableTextProps['lines']>, string> = {
    3: 'line-clamp-3',
    4: 'line-clamp-4',
    5: 'line-clamp-5',
};

/** Texto de una reseña: cortado con «Leer más» que lo despliega en el sitio. */
export const ExpandableText: React.FC<ExpandableTextProps> = ({ text, lines = 4, className = '', defaultExpanded = false }) => {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const [clamped, setClamped] = useState(false);
    const ref = useRef<HTMLParagraphElement>(null);

    // Se mide el texto ya pintado: así sale «Leer más» justo cuando algo queda oculto,
    // también en tarjetas estrechas o al girar el móvil.
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || expanded) return;
        const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [text, lines, expanded]);

    return (
        <div className={className}>
            <p ref={ref} className={`whitespace-pre-line ${expanded ? '' : CLAMP[lines]}`}>{text}</p>
            {clamped && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
                    className="mt-1 text-xs font-bold text-[var(--lt-accent)] hover:underline"
                    aria-expanded={expanded}
                >
                    {expanded ? 'Leer menos' : 'Leer más'}
                </button>
            )}
        </div>
    );
};
