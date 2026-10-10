import React from 'react';
import { cn } from '../../lib/utils';

export interface TabOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  /** Detrás de la etiqueta: un 🔒, un contador… */
  suffix?: React.ReactNode;
}

interface TabsProps<T extends string> {
  value: T;
  options: TabOption<T>[];
  onChange: (value: T) => void;
  /** Sin `scrollable`, clases de la barra; con `scrollable`, del contenedor que desplaza. */
  className?: string;
  /** Una sola fila que se desplaza en horizontal (con difuminado en los bordes) en vez de desbordar. */
  scrollable?: boolean;
  /** Nombre accesible de la barra de pestañas. */
  ariaLabel?: string;
  /** `lg`: pestañas de 44px de alto (zona táctil mínima); `md` (por defecto): 36px. */
  size?: 'md' | 'lg';
}

const EDGE_FADE_PX = 24;

const edgeMask = (fadeLeft: boolean, fadeRight: boolean): React.CSSProperties | undefined => {
  if (!fadeLeft && !fadeRight) return undefined;
  const left = fadeLeft ? `transparent 0, #000 ${EDGE_FADE_PX}px` : '#000 0';
  const right = fadeRight ? `#000 calc(100% - ${EDGE_FADE_PX}px), transparent 100%` : '#000 100%';
  const mask = `linear-gradient(to right, ${left}, ${right})`;
  return { maskImage: mask, WebkitMaskImage: mask };
};

export function Tabs<T extends string>({ value, options, onChange, className, scrollable = false, ariaLabel, size = 'md' }: TabsProps<T>) {
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const [fade, setFade] = React.useState({ left: false, right: false });

  const updateFade = React.useCallback(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const left = node.scrollLeft > 1;
    const right = node.scrollLeft + node.clientWidth < node.scrollWidth - 1;
    setFade((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  React.useEffect(() => {
    if (!scrollable) return;
    updateFade();
    const node = scrollerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateFade);
    observer.observe(node);
    return () => observer.disconnect();
  }, [scrollable, updateFade, options.length]);

  // La pestaña activa siempre a la vista en móvil.
  React.useEffect(() => {
    if (!scrollable) return;
    const active = scrollerRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    active?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [scrollable, value]);

  const list = (
    <div
      className={cn(
        'inline-flex rounded-xl border border-white/10 bg-white/5 p-1',
        scrollable ? 'w-max' : className,
      )}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-bold transition-colors',
              size === 'lg' ? 'min-h-11' : 'h-9',
              scrollable && 'snap-start',
              selected
                ? 'bg-[var(--lt-accent)] text-white shadow-lg shadow-[var(--lt-accent-shadow)]'
                : 'text-[var(--lt-text-muted)] hover:bg-white/10 hover:text-[var(--lt-text)]',
            )}
          >
            {option.icon}
            {option.label}
            {option.suffix != null && <span className="inline-flex items-center">{option.suffix}</span>}
          </button>
        );
      })}
    </div>
  );

  if (!scrollable) return list;

  return (
    <div
      ref={scrollerRef}
      onScroll={updateFade}
      className={cn('max-w-full snap-x overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
      style={edgeMask(fade.left, fade.right)}
    >
      {list}
    </div>
  );
}
