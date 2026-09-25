import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-[opacity,background-color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50';
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:opacity-90',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-ink hover:bg-surface-2',
  danger: 'bg-danger-soft text-danger hover:opacity-90',
};
const sizes: Record<Size, string> = { md: 'h-10 px-4 text-sm', lg: 'h-12 px-5 text-[15px]' };

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode };

export function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }: Props) {
  return (
    <button {...rest} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClass(variant, size, className)}>
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant = 'secondary', size = 'md', className, children }: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}
