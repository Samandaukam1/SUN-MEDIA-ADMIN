'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';

import type { SiteService } from '@/lib/site/types';
import { ApplyButton } from './ApplyButton';
import { GlassCard } from './motion';
import { SiteIcon } from './SiteIcon';

const EASE = [0.22, 1, 0.36, 1] as const;

function Details({ s }: { s: SiteService }) {
  return (
    <>
      <p className="text-[16px] leading-relaxed text-[#d9d9de] sm:text-[17px]">{s.summary}</p>
      {s.details ? <p className="mt-4 text-[15px] leading-relaxed whitespace-pre-line text-[#8e8e96]">{s.details}</p> : null}
      {s.bullets.length ? (
        <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
          {s.bullets.map((b) => (
            <li key={b} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-3 text-[14.5px] text-[#e4e4e7]">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#d4fc18]/12 text-[#d4fc18]">
                <SiteIcon name="check" size={13} strokeWidth={2.4} />
              </span>
              {b}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-7">
        <ApplyButton label="Shu xizmatga ariza" service={s.title} variant="lime" />
      </div>
    </>
  );
}

/**
 * "XIZMATLAR" in one place: every service's full description without a page per service. Desktop: the list on the
 * left, the chosen service on the right. Phones: an accordion.
 */
export function ServicesExplorer({ services }: { services: SiteService[] }) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState<string | null>(services[0]?.id ?? null);
  const current = services.find((s) => s.id === active) ?? services[0];
  if (!current) return null;

  return (
    <>
      {/* desktop */}
      <div className="hidden gap-6 lg:grid lg:grid-cols-[360px_1fr]">
        <ul className="space-y-2" role="tablist" aria-label="Xizmatlar">
          {services.map((s, i) => {
            const on = s.id === current.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setActive(s.id)}
                  className={`group relative flex w-full items-center gap-4 rounded-[22px] px-4 py-3.5 text-left transition-colors ${on ? 'text-[#0b0b0c]' : 'text-[#d9d9de] hover:bg-white/[0.04]'}`}
                >
                  {on ? <motion.span layoutId="service-tab" className="absolute inset-0 rounded-[22px] bg-[#d4fc18]" transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 34 }} /> : null}
                  <span className={`relative grid size-11 shrink-0 place-items-center rounded-2xl ${on ? 'bg-[#0b0b0c]/10' : 'bg-white/[0.05] text-[#d4fc18]'}`}>
                    <SiteIcon name={s.icon} size={20} />
                  </span>
                  <span className="relative min-w-0 flex-1">
                    <span className="font-display block truncate text-[16px] font-medium tracking-[-0.02em]">{s.title}</span>
                  </span>
                  <span className={`font-display tabular relative text-[12px] ${on ? 'text-[#0b0b0c]/60' : 'text-[#55555c]'}`}>{String(i + 1).padStart(2, '0')}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <GlassCard as="article" tilt={false} className="min-h-[420px] rounded-[34px] p-9 xl:p-11">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={current.id}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12, filter: 'blur(6px)' }}
              transition={{ duration: 0.45, ease: EASE }}
            >
              <div className="mb-6 flex items-center gap-4">
                <span className="grid size-14 place-items-center rounded-[18px] bg-[#d4fc18] text-[#0b0b0c] shadow-[0_16px_40px_-10px_rgb(212_252_24/0.55)]">
                  <SiteIcon name={current.icon} size={26} strokeWidth={1.7} />
                </span>
                <h2 className="font-display s-silver text-[30px] leading-tight font-medium tracking-[-0.03em] xl:text-[36px]">{current.title}</h2>
              </div>
              <Details s={current} />
            </motion.div>
          </AnimatePresence>
        </GlassCard>
      </div>

      {/* phones and tablets */}
      <ul className="space-y-3 lg:hidden">
        {services.map((s) => {
          const on = s.id === active;
          return (
            <li key={s.id}>
              <GlassCard as="article" tilt={false} className="rounded-[26px] p-0">
                <button type="button" aria-expanded={on} onClick={() => setActive(on ? null : s.id)} className="flex w-full items-center gap-4 px-5 py-4 text-left">
                  <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${on ? 'bg-[#d4fc18] text-[#0b0b0c]' : 'bg-white/[0.05] text-[#d4fc18]'}`}>
                    <SiteIcon name={s.icon} size={20} />
                  </span>
                  <span className="font-display min-w-0 flex-1 text-[17px] font-medium tracking-[-0.02em] text-white">{s.title}</span>
                  <SiteIcon name="arrowRight" size={18} className={`shrink-0 text-[#8e8e96] transition-transform duration-300 ${on ? 'rotate-90' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {on ? (
                    <motion.div
                      initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      transition={{ duration: 0.4, ease: EASE }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-6">
                        <Details s={s} />
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </GlassCard>
            </li>
          );
        })}
      </ul>
    </>
  );
}
