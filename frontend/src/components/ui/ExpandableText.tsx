import React, { useState } from 'react';

interface ExpandableTextProps {
    text: string;
    /** Líneas visibles antes de «Leer más». */
    lines?: 3 | 4 | 5;
    className?: string;
}

const CLAMP: Record<NonNullable<ExpandableTextProps['lines']>, string> = {
    3: 'line-clamp-3',
    4: 'line-clamp-4',
    5: 'line-clamp-5',
};

// Aproximación barata: por encima de esto el texto suele pasar de las líneas visibles.
const CHARS_PER_LINE = 48;

/** Texto de una reseña: cortado con «Leer más» que lo despliega en el sitio. */
export const ExpandableText: React.FC<ExpandableTextProps> = ({ text, lines = 4, className = '' }) => {
    const [expanded, setExpanded] = useState(false);
    const long = text.length > lines * CHARS_PER_LINE || text.split('\n').length > lines;

    return (
        <div className={className}>
            <p className={`whitespace-pre-line ${expanded ? '' : CLAMP[lines]}`}>{text}</p>
            {long && (
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
