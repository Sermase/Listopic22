import React from 'react';

interface PlaceSectionHeaderProps {
    title: string;
    icon?: React.ReactNode;
    subtitle?: React.ReactNode;
    /** Algo pequeño a la derecha: un contador, un pill, un selector de vista... */
    aside?: React.ReactNode;
    /** Etiqueta del título (h2 por defecto). */
    as?: 'h2' | 'h3';
    className?: string;
}

/** Cabecera compacta de sección de la ficha de un sitio (mismo estilo que los carruseles de la home). */
export const PlaceSectionHeader: React.FC<PlaceSectionHeaderProps> = ({
    title,
    icon,
    subtitle,
    aside,
    as: Tag = 'h2',
    className = '',
}) => (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
        <div className="min-w-0">
            <Tag className="flex items-center gap-2 font-display text-base font-bold leading-tight text-[var(--lt-text)] md:text-xl">
                {icon && (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] [&>svg]:h-3.5 [&>svg]:w-3.5">
                        {icon}
                    </span>
                )}
                <span className="truncate">{title}</span>
            </Tag>
            {subtitle && (
                <p className="mt-0.5 truncate text-xs font-medium text-[var(--lt-text-muted)]">{subtitle}</p>
            )}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
    </div>
);
