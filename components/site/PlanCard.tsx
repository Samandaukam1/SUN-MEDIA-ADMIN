'use client';

import { animate, motion, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { formatPrice, isUnlimited, quantityLabel, quantityValue, type SitePlan } from '@/lib/site/types';
import { ApplyButton } from './ApplyButton';
import { GlassCard } from './motion';
import { SiteIcon } from './SiteIcon';

const EASE = [0.22, 1, 0.36, 1] as const;

/** By price: the cheapest is "base", the most expensive "ultra", the ones between "pro". */
export type PlanTier = 'base' | 'pro' | 'ultra';

const TIER: Record<
  PlanTier,
  {
    label: string;
    frame: string;
    aura: string | null;
    card: string;
    title: string;
    price: string;
    priceBox: string;
    counter: string;
    counterBox: string;
    check: string;
    button: 'glass' | 'silver' | 'lime';
    chip: string;
  }
> = {
  base: {
    label: 'Boshlang‘ich',
    frame: 'bg-[linear-gradient(180deg,rgb(255_255_255/0.14),rgb(255_255_255/0.04))] shadow-[0_40px_100px_-50px_rgb(0_0_0/0.9)]',
    aura: null,
    card: 'bg-[#0a0a0c]/94',
    title: 'text-white',
    price: 'text-white',
    priceBox: 'border-white/[0.07] bg-white/[0.025]',
    counter: 'text-white',
    counterBox: 'border-white/[0.06] bg-white/[0.02]',
    check: 'bg-white/[0.08] text-[#d9d9de]',
    button: 'glass',
    chip: 'border-white/15 text-[#a8a8ac]',
  },
  pro: {
    label: 'Professional',
    frame: 'shadow-[0_40px_110px_-45px_rgb(244_244_245/0.28)]',
    aura: 's-aura-silver',
    card: 'bg-[linear-gradient(165deg,#16161a_0%,#0b0b0d_55%,#101013_100%)]',
    title: 's-silver-sheen',
    price: 's-silver',
    priceBox: 'border-white/[0.12] bg-[linear-gradient(180deg,rgb(255_255_255/0.07),rgb(255_255_255/0.02))]',
    counter: 's-silver',
    counterBox: 'border-white/[0.12] bg-white/[0.035]',
    check: 'bg-[linear-gradient(180deg,#ffffff,#a8a8ac)] text-[#0b0b0c]',
    button: 'silver',
    chip: 'border-white/30 bg-white/[0.06] text-[#f4f4f5]',
  },
  ultra: {
    label: 'Premium ultra',
    frame: 'shadow-[0_50px_140px_-40px_rgb(212_252_24/0.55)]',
    aura: 's-aura-lime',
    card: 'bg-[radial-gradient(120%_70%_at_50%_0%,rgb(212_252_24/0.10),transparent_60%),linear-gradient(170deg,#121408_0%,#0a0a0b_45%,#0b0c08_100%)]',
    title: 's-lime-sheen',
    price: 'text-[#d4fc18] [text-shadow:0_0_40px_rgb(212_252_24/0.45)]',
    priceBox: 'border-[#d4fc18]/25 bg-[linear-gradient(180deg,rgb(212_252_24/0.10),rgb(212_252_24/0.02))]',
    counter: 'text-[#d4fc18] [text-shadow:0_0_24px_rgb(212_252_24/0.4)]',
    counterBox: 'border-[#d4fc18]/20 bg-[#d4fc18]/[0.05]',
    check: 'bg-[#d4fc18] text-[#0b0b0c] shadow-[0_0_14px_rgb(212_252_24/0.55)]',
    button: 'lime',
    chip: 'border-[#d4fc18]/50 bg-[#d4fc18]/10 text-[#d4fc18]',
  },
};

// Where the ultra card's sparkles twinkle (% of the card) and when.
// Along the edges only, so they never sit on the text.
const SPARKLES = [
  { top: 3, left: 30, delay: 0 },
  { top: 18, left: 3, delay: 1.1 },
  { top: 37, left: 96.5, delay: 2.3 },
  { top: 55, left: 2.5, delay: 0.6 },
  { top: 71, left: 96.5, delay: 1.7 },
  { top: 97, left: 62, delay: 2.9 },
  { top: 2.5, left: 70, delay: 3.3 },
];

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

/** "∞" that draws itself again and again: an unlimited quantity. */
function InfinityMark({ className = '', size = 34 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 40 20" width={size} height={size / 2} className={`s-infinity inline-block ${className}`} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-label="cheksiz" role="img">
      <path d="M20 10c-3.2-4.2-6.4-6.3-9.6-6.3A6.3 6.3 0 0 0 4 10a6.3 6.3 0 0 0 6.4 6.3c3.2 0 6.4-2.1 9.6-6.3s6.4-6.3 9.6-6.3A6.3 6.3 0 0 1 36 10a6.3 6.3 0 0 1-6.4 6.3c-3.2 0-6.4-2.1-9.6-6.3z" />
    </svg>
  );
}

/** A check mark that draws itself when its row appears. */
function Check({ delay, className }: { delay: number; className: string }) {
  return (
    <span className={`mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full ${className}`}>
      <svg viewBox="0 0 24 24" className="size-[13px]" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <motion.path d="M20 6 9 17l-5-5" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay, ease: EASE }} />
      </svg>
    </span>
  );
}

/**
 * One tariff in one of three looks set by its price: "base" (calm graphite glass), "pro" (brushed chrome with a
 * silver light running around it and a metallic sweep) and "ultra" (the premium one: lime light, holographic glow,
 * sparkles, a crowned badge). Price and headline quantities count up; an unlimited quantity ("∞") is shown as a
 * self-drawing infinity mark, also among the headline numbers.
 */
export function PlanCard({ plan, index, total, tier }: { plan: SitePlan; index: number; total: number; tier: PlanTier }) {
  const reduce = useReducedMotion();
  const t = TIER[tier];
  const ultra = tier === 'ultra';
  const negotiable = plan.priceMode === 'negotiable' || plan.price === null;
  const priceNumber = negotiable ? 0 : Number(plan.price);
  const counters = plan.items
    .map((item) => ({ item, n: quantityValue(item.quantity) }))
    .filter((x): x is { item: SitePlan['items'][number]; n: number } => x.n !== null)
    .slice(0, 3);
  const level = index + 1;

  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 48, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.9, delay: index * 0.14, ease: EASE }}
      className={`relative h-full ${ultra ? 'z-10 lg:-translate-y-4 lg:scale-[1.035]' : tier === 'pro' ? 'lg:-translate-y-1.5' : ''}`}
    >
      {ultra ? (
        <span aria-hidden className="s-ultra-glow pointer-events-none absolute -inset-6 -z-10 rounded-[48px] bg-[radial-gradient(60%_50%_at_50%_45%,rgb(212_252_24/0.32),transparent_70%)] blur-2xl" />
      ) : null}
      {/* the frame: a running light (pro, ultra) or a quiet hairline (base) */}
      <div className={`relative h-full overflow-hidden rounded-[34px] p-[1.5px] ${t.frame}`}>
        {t.aura ? <span aria-hidden className={`s-aura ${t.aura}`} /> : null}
        <GlassCard className={`lg-strong relative flex h-full flex-col overflow-hidden rounded-[32.5px] p-7 sm:p-9 ${t.card}`}>
          {tier === 'pro' ? <span aria-hidden className="s-chrome-sweep" /> : null}
          {ultra ? (
            <>
              <span aria-hidden className="s-holo" />
              {SPARKLES.map((s, i) => (
                <span key={i} aria-hidden className="s-sparkle" style={{ top: `${s.top}%`, left: `${s.left}%`, animationDelay: `${s.delay}s` }} />
              ))}
            </>
          ) : null}

          {/* header: tier chip and level */}
          <div className="relative flex items-center justify-between gap-3">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase ${t.chip}`}>
              {ultra ? (
                <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
                  <path d="M3 8.5 7.5 12 12 5l4.5 7L21 8.5 19 18H5L3 8.5Z" />
                </svg>
              ) : null}
              {t.label}
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
                    className={`w-1.5 rounded-full ${i < level ? (ultra ? 'bg-[#d4fc18]' : tier === 'pro' ? 'bg-[#f4f4f5]' : 'bg-[#8e8e96]') : 'bg-white/10'}`}
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

          <h3 className={`font-display relative mt-6 font-medium tracking-[-0.03em] break-words ${ultra ? 'text-[32px] leading-[1.05] sm:text-[38px]' : 'text-[28px] leading-tight sm:text-[32px]'} ${t.title}`}>{plan.name}</h3>
          {plan.description ? <p className="relative mt-3 text-[14.5px] leading-relaxed break-words text-[#a8a8ac]">{plan.description}</p> : null}

          {/* price */}
          <div className={`relative mt-7 overflow-hidden rounded-[22px] border px-5 py-5 ${t.priceBox}`}>
            <span aria-hidden className={`s-drift pointer-events-none absolute -top-10 -right-10 size-40 rounded-full blur-2xl ${ultra ? 'bg-[#d4fc18]/30' : tier === 'pro' ? 'bg-white/14' : 'bg-white/6'}`} />
            {negotiable ? (
              <>
                <p className={`font-display relative text-[34px] leading-none font-medium tracking-[-0.03em] ${ultra ? 's-lime-sheen' : 's-silver'}`}>Kelishiladi</p>
                <p className="relative mt-2 text-[13px] text-[#8e8e96]">Narx loyiha hajmiga qarab belgilanadi</p>
              </>
            ) : (
              <>
                {plan.priceMode === 'from' ? <p className="relative mb-1 text-[11.5px] font-semibold tracking-[0.16em] text-[#d4fc18] uppercase">dan boshlab</p> : null}
                <p className="relative flex flex-wrap items-baseline gap-x-2">
                  <Counter
                    to={priceNumber}
                    format={(n) => formatPrice(Math.round(n), plan.currency)}
                    className={`font-display leading-none font-medium tracking-[-0.04em] tabular-nums ${ultra ? 'text-[46px] sm:text-[56px]' : 'text-[40px] sm:text-[48px]'} ${t.price}`}
                  />
                  <span className="text-[14px] text-[#8e8e96]">/ {plan.billingPeriod === 'monthly' ? 'oyiga' : 'bir martalik'}</span>
                </p>
              </>
            )}
          </div>

          {/* headline quantities: numbers count up, "∞" draws itself */}
          {counters.length ? (
            <div className={`relative mt-5 grid gap-2.5 ${counters.length === 3 ? 'grid-cols-3' : counters.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {counters.map(({ item, n }, i) => (
                <motion.div
                  key={item.id}
                  initial={reduce ? false : { opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.25 + i * 0.1, ease: EASE }}
                  className={`flex flex-col items-center rounded-2xl border px-3 py-3 text-center ${t.counterBox}`}
                >
                  {n === Number.POSITIVE_INFINITY ? (
                    <span className={`grid h-[26px] place-items-center ${ultra ? 'text-[#d4fc18] drop-shadow-[0_0_10px_rgb(212_252_24/0.6)]' : 'text-white'}`}>
                      <InfinityMark size={36} />
                    </span>
                  ) : (
                    <Counter to={n} format={(v) => String(Math.round(v))} className={`font-display block text-[26px] leading-none tabular-nums ${t.counter}`} />
                  )}
                  <span className="mt-1.5 line-clamp-2 block text-[11px] leading-tight break-words text-[#8e8e96] sm:text-[11.5px]" title={item.name}>
                    {item.name}
                  </span>
                </motion.div>
              ))}
            </div>
          ) : null}

          {/* services */}
          {plan.items.length ? (
            <ul className={`relative mt-7 space-y-3.5 border-t pt-7 ${ultra ? 'border-[#d4fc18]/15' : 'border-white/[0.07]'}`}>
              {plan.items.map((item, i) => (
                <motion.li
                  key={item.id}
                  initial={reduce ? false : { opacity: 0, x: -14 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.55, delay: 0.15 + i * 0.07, ease: EASE }}
                  className="flex gap-3"
                >
                  <Check delay={0.3 + i * 0.07} className={t.check} />
                  <div className="min-w-0">
                    <p className="text-[15px] leading-snug break-words text-[#e4e4e7]">
                      {item.name}
                      {item.quantity ? (
                        isUnlimited(item.quantity) ? (
                          <span className={`font-semibold ${ultra ? 'text-[#d4fc18]' : 'text-white'}`}>
                            {' — '}
                            <InfinityMark size={22} className="-mt-0.5 align-middle" /> <span className="text-[13px] font-medium opacity-80">cheksiz</span>
                          </span>
                        ) : (
                          <span className="font-semibold text-white"> — {quantityLabel(item.quantity)}</span>
                        )
                      ) : null}
                    </p>
                    {item.note ? <p className="mt-0.5 text-[13px] leading-snug break-words text-[#8e8e96]">{item.note}</p> : null}
                  </div>
                </motion.li>
              ))}
            </ul>
          ) : null}

          <div className="relative mt-auto pt-9">
            <ApplyButton
              label={ultra ? 'Premium tarifni tanlash' : 'Tarifni tanlash'}
              service={`Tarif: ${plan.name}`}
              variant={t.button}
              className={`s-btn-shine w-full ${ultra ? 'h-15 text-[16px]' : 'h-14 text-[15.5px]'}`}
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
