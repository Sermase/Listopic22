import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { IconButton } from './IconButton';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  closeLabel?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  className,
  bodyClassName,
  closeLabel = 'Cerrar',
}) => {
  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
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
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <button className="absolute inset-0 cursor-default" aria-label={closeLabel} onClick={onClose} />
      <section
        className={cn(
          'relative flex w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[var(--lt-card-strong)] shadow-2xl sm:max-w-2xl sm:rounded-2xl',
          className,
        )}
        style={{
          maxHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 0.5rem)',
        }}
      >
        <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[var(--lt-card-strong)]/95 px-4 py-3 backdrop-blur-xl">
          <div className="min-w-0 font-bold text-[var(--lt-text)]">{title}</div>
          <IconButton label={closeLabel} icon={<X className="w-5 h-5" />} variant="ghost" onClick={onClose} />
        </header>
        <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain p-4', bodyClassName)}>
          {children}
        </div>
      </section>
    </div>,
    document.body,
  );
};
