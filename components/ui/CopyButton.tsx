'use client';

import { useState } from 'react';

import { buttonClass } from './Button';
import { Icon } from './Icon';

export function CopyButton({ value, label, variant = 'secondary' }: { value: string; label: string; variant?: 'primary' | 'secondary' | 'ghost' }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass(variant, 'md')}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
    >
      <Icon name={copied ? 'check' : 'copy'} size={16} />
      {copied ? 'Nusxalandi' : label}
    </button>
  );
}
