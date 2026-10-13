'use client';

import { animate, motion, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { formatPrice, quantityNumber, type SitePlan } from '@/lib/site/types';
import { ApplyButton } from './ApplyButton';
import { GlassCard } from './motion';
import { SiteIcon } from './SiteIcon';

const EASE = [0.22, 1, 0.36, 1] as const;

function Counter({ to, format, className }: { to: number; format: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? to : 0);
  useEffect(() => {
    if (!inView || reduce) {
      if (reduce) setValue(to);
      return;
    }
    const controls = animate(0, to, { duration: 1.6, ease: EASE, onUpdate: (v) => setValue(v) });
    return () => controls.stop();
  }, [inView, reduce, to]);
  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}

/** A check mark that draws itself when its row appears. */
function Check({ delay, lime }: { delay: number; lime: boolean }) {
  return (
    <span className={`mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full ${lime ? 'bg-[#d4fc18] text-[#0b0b0c]' : 'bg-[#d4fc18]/12 text-[#d4fc18]'}`}>
      <svg viewBox="0 0 24 24" className="size-[13px]" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <motion.path
          d="M20 6 9 17l-5-5"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay, ease: EASE }}
        />
      </svg>
    </span>
  );
}

/**
 * One tariff: a light running around its edge, 3D tilt with a pointer spotlight, the price counting up, the headline
 * quantities as big counters, services appearing one by one with their checks drawing in, and a shining button.
 * `top` is the highest tier (or the featured one): lime light; the others run silver.
 */
export function PlanCard({ plan, index, total, top }: { plan: SitePlan; index: number; total: number; top: boolean }) {
  const reduce = useReducedMotion();
  const negotiable = plan.priceMode === 'negotiable' || plan.price === null;
  const priceNumber = negotiable ? 0 : Number(plan.price);
  const counters = plan.items
    .map((item) => ({ item, n: quantityNumber(item.quantity) }))
    .filter((x): x is { item: SitePlan['items'][number]; n: number } => x.n !== null)
    .slice(0, 3);
  const level = index + 1;

  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 48, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.9, delay: index * 0.14, ease: EASE }}
      className={`relative h-full ${top ? 'lg:-translate-y-3' : ''}`}
    >
      {/* the light running around the edge */}
      <div className={`relative h-full overflow-hidden rounded-[34px] p-[1.5px] ${top ? 'shadow-[0_40px_120px_-40px_rgb(212_252_24/0.55)]' : 'shadow-[0_40px_100px_-50px_rgb(0_0_0/0.9)]'}`}>
        <span aria-hidden className={`s-aura ${top ? 's-aura-lime' : 's-aura-silver'}`} />
        <GlassCard className="lg-strong relative flex h-full flex-col rounded-[32.5px] bg-[#09090b]/92 p-7 sm:p-9">
          {/* header: tier and level */}
          <div className="flex items-center justify-between gap-3">
            <span className="font-display text-[13px] tracking-[0.2em] text-[#6e6e76]">
              {String(level).padStart(2, '0')}
              <span className="text-[#3a3a3e]"> / {String(total).padStart(2, '0')}</span>
            </span>
            <div className="flex items-center gap-2">
              {plan.isFeatured ? (
                <span className="relative inline-flex items-center gap-1.5 rounded-full bg-[#d4fc18] px-3 py-1 text-[11.5px] font-semibold tracking-wide text-[#0b0b0c]">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#0b0b0c]/60" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-[#0b0b0c]" />
                  </span>
                  Tavsiya etiladi
                </span>
              ) : null}
              <div className="flex items-end gap-1" aria-label={`Daraja ${level} / ${total}`}>
                {Array.from({ length: Math.max(total, 2) }, (_, i) => (
                  <motion.span
                    key={i}
                    className={`w-1.5 rounded-full ${i < level ? (top ? 'bg-[#d4fc18]' : 'bg-[#f4f4f5]') : 'bg-white/10'}`}
                    initial={reduce ? false : { height: 4 }}
                    whileInView={{ height: 8 + i * 5 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.3 + i * 0.12, ease: EASE }}
                    style={reduce ? { height: 8 + i * 5 } : undefined}
                  />
                ))}
              </div>
            </div>
          </div>

          <h3 className={`font-display mt-6 text-[28px] leading-tight font-medium tracking-[-0.03em] break-words sm:text-[32px] ${top ? 's-silver-sheen' : 'text-white'}`}>
            {plan.name}
          </h3>
          {plan.description ? <p className="mt-3 text-[14.5px] leading-relaxed break-words text-[#a8a8ac]">{plan.description}</p> : null}

          {/* price */}
          <div className="relative mt-7 overflow-hidden rounded-[22px] border border-white/[0.07] bg-white/[0.03] px-5 py-5">
            <span aria-hidden className={`s-drift pointer-events-none absolute -top-10 -right-10 size-40 rounded-full blur-2xl ${top ? 'bg-[#d4fc18]/25' : 'bg-white/10'}`} />
            {negotiable ? (
              <>
                <p className="font-display s-silver relative text-[34px] leading-none font-medium tracking-[-0.03em]">Kelishiladi</p>
                <p className="relative mt-2 text-[13px] text-[#8e8e96]">Narx loyiha hajmiga qarab belgilanadi</p>
              </>
            ) : (
              <>
                {plan.priceMode === 'from' ? <p className="relative mb-1 text-[11.5px] font-semibold tracking-[0.16em] text-[#d4fc18] uppercase">dan boshlab</p> : null}
                <p className="relative flex flex-wrap items-baseline gap-x-2">
                  <Counter
                    to={priceNumber}
                    format={(n) => formatPrice(Math.round(n), plan.currency)}
                    className={`font-display text-[40px] leading-none font-medium tracking-[-0.04em] tabular-nums sm:text-[48px] ${top ? 'text-[#d4fc18]' : 'text-white'}`}
                  />
                  <span className="text-[14px] text-[#8e8e96]">/ {plan.billingPeriod === 'monthly' ? 'oyiga' : 'bir martalik'}</span>
                </p>
              </>
            )}
          </div>

          {/* headline quantities */}
          {counters.length ? (
            <div className={`mt-5 grid gap-2.5 ${counters.length === 3 ? 'grid-cols-3' : counters.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {counters.map(({ item, n }, i) => (
                <motion.div
                  key={item.id}
                  initial={reduce ? false : { opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.25 + i * 0.1, ease: EASE }}
                  className="rounded-2xl border border-white/[0.06] bg-white/[0.025] px-3 py-3 text-center"
                >
                  <Counter to={n} format={(v) => String(Math.round(v))} className={`font-display block text-[26px] leading-none tabular-nums ${top ? 'text-[#d4fc18]' : 'text-white'}`} />
                  <span className="mt-1.5 line-clamp-2 block text-[11px] leading-tight break-words text-[#8e8e96] sm:text-[11.5px]" title={item.name}>
                    {item.name}
                  </span>
                </motion.div>
              ))}
            </div>
          ) : null}

          {/* services */}
          {plan.items.length ? (
            <ul className="mt-7 space-y-3.5 border-t border-white/[0.07] pt-7">
              {plan.items.map((item, i) => (
                <motion.li
                  key={item.id}
                  initial={reduce ? false : { opacity: 0, x: -14 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.55, delay: 0.15 + i * 0.07, ease: EASE }}
                  className="flex gap-3"
                >
                  <Check delay={0.3 + i * 0.07} lime={top} />
                  <div className="min-w-0">
                    <p className="text-[15px] leading-snug break-words text-[#e4e4e7]">
                      {item.name}
                      {item.quantity ? <span className="font-semibold text-white"> — {item.quantity}</span> : null}
                    </p>
                    {item.note ? <p className="mt-0.5 text-[13px] leading-snug break-words text-[#8e8e96]">{item.note}</p> : null}
                  </div>
                </motion.li>
              ))}
            </ul>
          ) : null}

          <div className="mt-auto pt-9">
            <ApplyButton
              label="Tarifni tanlash"
              service={`Tarif: ${plan.name}`}
              variant={top ? 'lime' : 'glass'}
              className="s-btn-shine h-14 w-full text-[15.5px]"
              magnetic={false}
            />
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-[#6e6e76]">
              <SiteIcon name="message" size={13} /> Ariza qoldirasiz — menejerimiz bog‘lanadi
            </p>
          </div>
        </GlassCard>
      </div>
    </motion.article>
  );
}
