/**
 * Clases compartidas del kit de Business Pro (solo tokens --lt-*, legibles en
 * los 4 temas). Úsalas con `cn` para que tailwind-merge resuelva conflictos:
 *
 *   <input className={cn(kit.input, error && 'border-[var(--lt-danger)]')} />
 *   <span className={cn('rounded-full px-2 py-1', toneClass.success)}>Guardado</span>
 *
 * Reglas de color (spec §2.1): acento = seleccionado o principal; success,
 * warning y danger solo para estados; promo solo para Business Pro y patrocinado.
 */

export const kit = {
    /** Tarjeta neutra. */
    surface: 'rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card-strong)]',
    /** Bloque dentro de una tarjeta. */
    inset: 'rounded-xl border border-[var(--lt-border)] bg-[var(--lt-glass)]',
    /** Campo de texto (text-base en móvil para que iOS no haga zoom). */
    input: 'min-h-11 w-full rounded-xl border border-[var(--lt-border-strong)] bg-[var(--lt-glass)] px-3 text-base sm:text-sm text-[var(--lt-text)] placeholder:text-[var(--lt-text-muted)] outline-none focus:border-[var(--lt-accent-border)] focus:ring-2 focus:ring-[var(--lt-accent-soft)]',
    /** Chip, tile o tarjeta sin seleccionar. */
    idle: 'border-[var(--lt-border)] bg-[var(--lt-glass)] text-[var(--lt-text-muted)] hover:border-[var(--lt-border-strong)] hover:text-[var(--lt-text)]',
    /** Chip, tile o tarjeta seleccionada. */
    selected: 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] text-[var(--lt-text)]',
    /** Anillo de foco visible con teclado. */
    focus: 'outline-none focus-visible:ring-2 focus-visible:ring-[var(--lt-accent-border)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lt-card-strong)]',
    /** Texto de ayuda. */
    help: 'text-sm text-[var(--lt-text-muted)]',
    /** Etiqueta de campo (sentence case, nunca mayúsculas). */
    label: 'text-sm font-semibold text-[var(--lt-text)]',
    /** Burbuja ✓ de seleccionado. */
    checkBubble: 'grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--lt-accent)] text-white shadow-sm',
} as const;

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'promo';

/** Fondo suave + texto del tono (pills, avisos). */
export const toneClass: Record<Tone, string> = {
    neutral: 'bg-[var(--lt-glass)] text-[var(--lt-text-muted)]',
    accent: 'bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]',
    success: 'bg-[var(--lt-success-soft)] text-[var(--lt-success)]',
    warning: 'bg-[var(--lt-warning-soft)] text-[var(--lt-warning)]',
    danger: 'bg-[var(--lt-danger-soft)] text-[var(--lt-danger)]',
    promo: 'bg-[var(--lt-promo-soft)] text-[var(--lt-promo)]',
};

/** Solo el color de texto del tono. */
export const toneTextClass: Record<Tone, string> = {
    neutral: 'text-[var(--lt-text-muted)]',
    accent: 'text-[var(--lt-accent)]',
    success: 'text-[var(--lt-success)]',
    warning: 'text-[var(--lt-warning)]',
    danger: 'text-[var(--lt-danger)]',
    promo: 'text-[var(--lt-promo)]',
};

/** Borde + fondo suave del tono (tarjetas tintadas, seleccionado con tono). */
export const toneSurfaceClass: Record<Tone, string> = {
    neutral: 'border-[var(--lt-border)] bg-[var(--lt-card-strong)]',
    accent: 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)]',
    success: 'border-[var(--lt-success)]/40 bg-[var(--lt-success-soft)]',
    warning: 'border-[var(--lt-warning)]/40 bg-[var(--lt-warning-soft)]',
    danger: 'border-[var(--lt-danger)]/40 bg-[var(--lt-danger-soft)]',
    promo: 'border-[var(--lt-promo)]/40 bg-[var(--lt-promo-soft)]',
};

/** Fondo sólido del tono (burbujas ✓, puntos). */
export const toneSolidClass: Record<Tone, string> = {
    neutral: 'bg-[var(--lt-text-muted)]',
    accent: 'bg-[var(--lt-accent)]',
    success: 'bg-[var(--lt-success)]',
    warning: 'bg-[var(--lt-warning)]',
    danger: 'bg-[var(--lt-danger)]',
    promo: 'bg-[var(--lt-promo)]',
};

/**
 * Burbuja sólida con icono encima (✓). El icono usa el color de la tarjeta,
 * que contrasta con el tono en todos los temas (en claro sale blanco).
 */
export const toneBubbleClass: Record<Tone, string> = {
    neutral: 'bg-[var(--lt-text-muted)] text-[var(--lt-card-strong)]',
    accent: 'bg-[var(--lt-accent)] text-white',
    success: 'bg-[var(--lt-success)] text-[var(--lt-card-strong)]',
    warning: 'bg-[var(--lt-warning)] text-[var(--lt-card-strong)]',
    danger: 'bg-[var(--lt-danger)] text-[var(--lt-card-strong)]',
    promo: 'bg-[var(--lt-promo)] text-[var(--lt-card-strong)]',
};

/** Una entrada de los mapas META de estado (sección, oferta, campaña, propuesta). */
export interface StatusMeta {
    emoji: string;
    label: string;
    tone: Tone;
}
