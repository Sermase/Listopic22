import React from 'react';
import { cn } from '../../lib/utils';

export interface TabOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

interface TabsProps<T extends string> {
  value: T;
  options: TabOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

export function Tabs<T extends string>({ value, options, onChange, className }: TabsProps<T>) {
  return (
    <div className={cn('inline-flex rounded-xl border border-white/10 bg-white/5 p-1', className)} role="tablist">
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
              'inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold transition-colors',
              selected
                ? 'bg-[var(--lt-accent)] text-white shadow-lg shadow-[var(--lt-accent-shadow)]'
                : 'text-[var(--lt-text-muted)] hover:bg-white/10 hover:text-[var(--lt-text)]',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
