import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { IconButton } from './IconButton';

type ModalSize = 'md' | 'lg' | 'xl';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  closeLabel?: string;
  /** Pie fijo bajo el contenido desplazable (p. ej. la barra de guardar). */
  footer?: React.ReactNode;
  /** Ancho en escritorio: md (por defecto) 2xl, lg 3xl, xl 5xl. */
  size?: ModalSize;
}

const sizeClasses: Record<ModalSize, string> = {
  md: 'sm:max-w-2xl',
  lg: 'sm:max-w-3xl',
  xl: 'sm:max-w-5xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  className,
  bodyClassName,
  closeLabel = 'Cerrar',
  footer,
  size = 'md',
}) => {
  const titleId = React.useId();

  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Con un diálogo de confirmación abierto encima, Esc es suyo.
      if (document.querySelector('[role="alertdialog"][aria-modal="true"]')) return;
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/70 backdrop-blur-md p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <button className="absolute inset-0 cursor-default" aria-label={closeLabel} onClick={onClose} />
      <section
        className={cn(
          'relative flex w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[var(--lt-card-strong)] shadow-2xl sm:rounded-2xl',
          sizeClasses[size],
          className,
        )}
        style={{
          maxHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 0.5rem)',
        }}
      >
        <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[var(--lt-card-strong)]/95 px-4 py-3 backdrop-blur-xl">
          <div id={titleId} className="min-w-0 font-bold text-[var(--lt-text)]">{title}</div>
          <IconButton label={closeLabel} icon={<X className="w-5 h-5" />} variant="ghost" onClick={onClose} />
        </header>
        <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain p-4', bodyClassName)}>
          {children}
        </div>
        {/* La zona segura de abajo ya la deja libre el contenedor (paddingBottom). */}
        {footer != null && footer !== false && (
          <footer className="shrink-0 border-t border-[var(--lt-border)] bg-[var(--lt-card-strong)] px-4 py-3">
            {footer}
          </footer>
        )}
      </section>
    </div>,
    document.body,
  );
};
