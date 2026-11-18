import React, { useLayoutEffect, useRef, useState } from 'react';

import { splitLinks } from '../lib/linkify';

/** Enlaces pulsables en un texto escrito por la gente (se abren aparte, sin pasar autoridad). */
export const LinkifiedText: React.FC<{ text: string; linkClassName?: string }> = ({ text, linkClassName = 'underline underline-offset-2 font-semibold break-all' }) => (
    <>
        {splitLinks(text).map((part, i) => ('href' in part
            ? <a key={i} href={part.href} target="_blank" rel="noopener noreferrer nofollow ugc" className={linkClassName} onClick={(e) => e.stopPropagation()}>{part.text.replace(/^https?:\/\//i, '')}</a>
            : <React.Fragment key={i}>{part.text}</React.Fragment>))}
    </>
);

/**
 * Texto recortado a `lines` líneas con «Leer más» / «Leer menos», que solo sale
 * si de verdad no cabe. Respeta saltos de línea y enlaza las URLs.
 */
export const ExpandableText: React.FC<{ text: string; lines?: 2 | 3 | 4; className?: string }> = ({ text, lines = 2, className = '' }) => {
    const ref = useRef<HTMLParagraphElement>(null);
    const [open, setOpen] = useState(false);
    const [overflows, setOverflows] = useState(false);
    const clamp = lines === 2 ? 'line-clamp-2' : lines === 3 ? 'line-clamp-3' : 'line-clamp-4';

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || open) return;
        const measure = () => setOverflows(el.scrollHeight - el.clientHeight > 2);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [text, open]);

    return (
        <div className={className}>
            <p ref={ref} className={`whitespace-pre-line ${open ? '' : clamp}`}>
                <LinkifiedText text={text} />
            </p>
            {(overflows || open) && (
                <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-0.5 text-xs font-bold underline-offset-2 hover:underline opacity-90">
                    {open ? 'Leer menos' : 'Leer más'}
                </button>
            )}
        </div>
    );
};
