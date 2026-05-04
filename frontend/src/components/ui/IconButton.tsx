import React from 'react';
import { Button, type ButtonProps } from './Button';
import { cn } from '../../lib/utils';

export interface IconButtonProps extends Omit<ButtonProps, 'size' | 'leftIcon' | 'rightIcon'> {
  label: string;
  icon: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-9 w-9',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(({
  label,
  icon,
  className,
  size = 'md',
  children,
  ...props
}, ref) => (
  <Button
    ref={ref}
    aria-label={label}
    title={label}
    size="icon"
    className={cn(sizeClasses[size], className)}
    {...props}
  >
    {icon}
    {children}
  </Button>
));

IconButton.displayName = 'IconButton';
