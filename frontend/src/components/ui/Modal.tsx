import React from 'react';
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

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-0 sm:p-4" role="dialog" aria-modal="true">
      <button className="absolute inset-0 cursor-default" aria-label={closeLabel} onClick={onClose} />
      <section className={cn(
        'relative w-full sm:max-w-2xl max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem)] overflow-hidden rounded-t-3xl sm:rounded-2xl border border-white/10 bg-[var(--lt-card-strong)] shadow-2xl',
        className,
      )}>
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-[var(--lt-card-strong)]/95 px-4 py-3 backdrop-blur-xl" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <div className="min-w-0 font-bold text-[var(--lt-text)]">{title}</div>
          <IconButton label={closeLabel} icon={<X className="w-5 h-5" />} variant="ghost" onClick={onClose} />
        </header>
        <div className={cn('overflow-y-auto p-4', bodyClassName)}>
          {children}
        </div>
      </section>
    </div>
  );
};
