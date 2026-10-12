'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';

import type { SiteCase } from '@/lib/site/types';
import { CaseCard } from './CaseCard';

/** Category chips over the case grid ("Hammasi" + whatever categories the cases use). */
export function CaseFilter({ cases }: { cases: SiteCase[] }) {
  const categories = useMemo(() => [...new Set(cases.map((c) => c.category).filter(Boolean))], [cases]);
  const [active, setActive] = useState<string | null>(null);
  const shown = active ? cases.filter((c) => c.category === active) : cases;

  return (
    <>
      {categories.length > 1 ? (
        <div className="mb-10 flex flex-wrap gap-2" role="tablist" aria-label="Yo‘nalish">
          {[null, ...categories].map((cat) => {
            const on = active === cat;
            return (
              <button
                key={cat ?? 'all'}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setActive(cat)}
                className={`relative rounded-full px-5 py-2.5 text-[14px] font-medium transition-colors duration-300 ${
                  on ? 'text-[#0b0b0c]' : 'lg text-[#d9d9de] hover:text-white'
                }`}
              >
                {on ? (
                  <motion.span layoutId="case-filter" className="absolute inset-0 rounded-full bg-[#d4fc18]" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                ) : null}
                <span className="relative">{cat ?? 'Hammasi'}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <motion.div layout className="grid gap-5 md:grid-cols-2">
        <AnimatePresence mode="popLayout">
          {shown.map((c) => (
            <motion.div
              key={c.id}
              layout
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <CaseCard item={c} />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </>
  );
}
