import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'soft';
  size?: 'sm' | 'md' | 'lg';
};

const base =
  'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition active:scale-95 disabled:opacity-40 disabled:active:scale-100 disabled:active:translate-y-0 select-none';
const variants = {
  primary: 'bg-ink text-paper shadow-[0_4px_0_#0f0e14] active:shadow-none active:translate-y-1',
  ghost: 'bg-paper text-ink border-2 border-ink/15',
  soft: 'bg-ink/[.06] text-ink',
  danger: 'bg-accent text-white shadow-[0_4px_0_#a53c2c] active:shadow-none active:translate-y-1',
};
const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-base', lg: 'px-6 py-3 text-lg' };

/** The one button. variant: primary (ink) / ghost (outlined) / soft / danger. */
export function Button({ variant = 'primary', size = 'md', className = '', ...rest }: Props) {
  return <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...rest} />;
}
