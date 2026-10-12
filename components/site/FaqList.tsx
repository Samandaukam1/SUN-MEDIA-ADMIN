'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';

import type { SiteFaq } from '@/lib/site/types';

export function FaqList({ faqs }: { faqs: SiteFaq[] }) {
  const [open, setOpen] = useState<string | null>(faqs[0]?.id ?? null);
  return (
    <ul className="flex flex-col gap-3">
      {faqs.map((faq, i) => {
        const on = open === faq.id;
        return (
          <li key={faq.id} className={`lg overflow-hidden rounded-3xl transition-colors duration-500 ${on ? 'lg-strong' : ''}`}>
            <h3>
              <button
                type="button"
                aria-expanded={on}
                aria-controls={`faq-${faq.id}`}
                onClick={() => setOpen(on ? null : faq.id)}
                className="flex w-full items-center gap-5 px-6 py-6 text-left sm:px-8"
              >
                <span className="font-display tabular text-[13px] text-[#6e6e76]">{String(i + 1).padStart(2, '0')}</span>
                <span className="flex-1 text-[16px] font-medium text-white sm:text-[18px]">{faq.question}</span>
                <span
                  className={`relative grid size-9 shrink-0 place-items-center rounded-full transition-all duration-500 ${
                    on ? 'rotate-45 bg-[#d4fc18] text-[#0b0b0c]' : 'bg-white/[0.06] text-white'
                  }`}
                  aria-hidden
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {on ? (
                <motion.div
                  id={`faq-${faq.id}`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                  <p className="px-6 pb-7 pl-[4.25rem] text-[15px] leading-relaxed text-[#a8a8ac] sm:px-8 sm:pl-[5.25rem]">{faq.answer}</p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}
