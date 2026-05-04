import React from 'react';
import { cn } from '../../lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--lt-accent)] text-white border border-[var(--lt-accent-border)] shadow-lg shadow-[var(--lt-accent-shadow)] hover:brightness-110',
  secondary: 'bg-white/10 text-[var(--lt-text)] border border-white/15 hover:bg-white/15',
  ghost: 'bg-transparent text-[var(--lt-text-muted)] border border-transparent hover:bg-white/10 hover:text-[var(--lt-text)]',
  danger: 'bg-red-500/15 text-red-200 border border-red-500/30 hover:bg-red-500/25',
  success: 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white border border-emerald-300/20 shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-400',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-xs rounded-lg',
  md: 'h-10 px-4 text-sm rounded-xl',
  lg: 'h-12 px-5 text-base rounded-xl',
  icon: 'h-10 w-10 p-0 rounded-xl',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  children,
  disabled,
  type = 'button',
  ...props
}, ref) => (
  <button
    ref={ref}
    type={type}
    disabled={disabled || loading}
    className={cn(
      'inline-flex items-center justify-center gap-2 font-bold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55',
      variantClasses[variant],
      sizeClasses[size],
      className,
    )}
    {...props}
  >
    {leftIcon}
    {children}
    {rightIcon}
  </button>
));

Button.displayName = 'Button';
