'use client';

import type { ReactNode } from 'react';

import { Magnetic } from './motion';
import { SiteIcon } from './SiteIcon';

export const APPLY_EVENT = 'sun:apply';

/** Opens the application window from anywhere on the site, optionally with a service picked. */
export function openApplication(service?: string) {
  window.dispatchEvent(new CustomEvent(APPLY_EVENT, { detail: { service } }));
}

export function ApplyButton({
  label,
  service,
  variant = 'lime',
  className = '',
  icon = true,
  magnetic = true,
}: {
  label: ReactNode;
  service?: string;
  variant?: 'lime' | 'glass' | 'ink' | 'silver';
  className?: string;
  icon?: boolean;
  magnetic?: boolean;
}) {
  const button = (
    <button
      type="button"
      onClick={() => openApplication(service)}
      className={`s-btn ${variant === 'lime' ? 's-btn-lime' : variant === 'ink' ? 's-btn-ink' : variant === 'silver' ? 's-btn-silver' : 's-btn-glass lg'} group ${className}`}
    >
      <span>{label}</span>
      {icon ? (
        <span className="grid size-7 place-items-center rounded-full bg-black/10 transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-rotate-45">
          <SiteIcon name="arrowRight" size={16} strokeWidth={2} />
        </span>
      ) : null}
    </button>
  );
  return magnetic ? <Magnetic>{button}</Magnetic> : button;
}
