'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

import { SiteIcon } from './SiteIcon';

export type OrbTheme = 'services' | 'partners' | 'plans' | 'about' | 'contact' | 'cases';

const LIME = '#d4fc18';
const loop = (duration: number, extra: object = {}) => ({ duration, repeat: Infinity, ease: 'linear' as const, ...extra });

/** Something that turns forever; still when the visitor asked for less motion. */
function Spin({ seconds, reverse = false, className, children }: { seconds: number; reverse?: boolean; className?: string; children: ReactNode }) {
  const still = useReducedMotion();
  return (
    <motion.div className={className} animate={still ? undefined : { rotate: reverse ? -360 : 360 }} transition={loop(seconds)}>
      {children}
    </motion.div>
  );
}

/* --------------------------------------------------------------------------------------------- */

/** Xizmatlar: every service orbits the core it all comes back to. */
function Services() {
  const icons = ['strategy', 'camera', 'film', 'design', 'target', 'megaphone'];
  const still = useReducedMotion();
  return (
    <>
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full">
        <circle cx="100" cy="100" r="66" fill="none" stroke="rgb(255 255 255 / 0.12)" strokeDasharray="2 6" />
        <circle cx="100" cy="100" r="36" fill="none" stroke="rgb(212 252 24 / 0.18)" />
      </svg>
      <Spin seconds={28} className="absolute inset-0">
        {icons.map((icon, i) => {
          const a = (i / icons.length) * Math.PI * 2;
          return (
            <div key={icon} className="absolute size-9 -translate-x-1/2 -translate-y-1/2" style={{ left: `${(50 + 31 * Math.cos(a)).toFixed(2)}%`, top: `${(50 + 31 * Math.sin(a)).toFixed(2)}%` }}>
              <Spin seconds={28} reverse className="grid size-full place-items-center rounded-full border border-white/15 bg-[#141416] text-[#d4fc18] shadow-[0_0_18px_rgb(212_252_24/0.18)]">
                <SiteIcon name={icon} size={16} strokeWidth={1.8} />
              </Spin>
            </div>
          );
        })}
      </Spin>
      <motion.div
        className="absolute top-1/2 left-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#d4fc18] text-[#0b0b0c] shadow-[0_0_40px_rgb(212_252_24/0.55)]"
        animate={still ? undefined : { scale: [1, 1.12, 1] }}
        transition={loop(2.6, { ease: 'easeInOut' })}
      >
        <SiteIcon name="spark" size={20} strokeWidth={2} />
      </motion.div>
    </>
  );
}

/** Hamkorlar: the partners, connected to SUN MEDIA, with signals running between them. */
function Partners({ logos }: { logos: string[] }) {
  const still = useReducedMotion();
  const nodes = (logos.length ? logos : Array.from({ length: 5 }, () => '')).slice(0, 6);
  const n = nodes.length;
  return (
    <>
      <Spin seconds={40} className="absolute inset-0">
        {nodes.map((logo, i) => {
          const deg = (i / n) * 360;
          return (
            <div key={i} className="absolute top-1/2 left-1/2 h-px w-[29%] origin-left" style={{ transform: `rotate(${deg}deg)` }}>
              <div className="absolute inset-0 bg-gradient-to-r from-[#d4fc18]/50 to-white/10" />
              <motion.span
                className="absolute top-1/2 -mt-[3px] size-1.5 rounded-full bg-[#d4fc18] shadow-[0_0_10px_#d4fc18]"
                animate={still ? undefined : { left: ['0%', '100%'], opacity: [0, 1, 0] }}
                transition={loop(2.4, { delay: i * 0.45, ease: 'easeInOut' })}
              />
              <div className="absolute top-1/2 right-0 size-11 translate-x-1/2 -translate-y-1/2" style={{ transform: `translate(50%, -50%) rotate(${-deg}deg)` }}>
                <Spin seconds={40} reverse className="grid size-full place-items-center overflow-hidden rounded-full border border-white/20 bg-[#ececef] p-1.5 shadow-[0_6px_18px_rgb(0_0_0/0.4)]">
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo} alt="" className="size-full object-contain" loading="lazy" />
                  ) : (
                    <SiteIcon name="building" size={16} className="text-[#0b0b0c]" />
                  )}
                </Spin>
              </div>
            </div>
          );
        })}
      </Spin>
      <div className="absolute top-1/2 left-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#0b0b0c] shadow-[0_0_0_2px_#d4fc18,0_0_36px_rgb(212_252_24/0.45)]">
        <span className="font-display text-[11px] font-semibold tracking-tight text-white">SUN</span>
      </div>
    </>
  );
}

/** Tariflar: three plans side by side, the recommended one tallest, gently breathing. */
function Plans() {
  const still = useReducedMotion();
  const bars = [
    { h: [38, 48, 38], color: 'bg-white/25', delay: 0 },
    { h: [72, 84, 72], color: 'bg-[#d4fc18]', delay: 0.3 },
    { h: [52, 62, 52], color: 'bg-white/40', delay: 0.6 },
  ];
  return (
    <div className="absolute inset-0 flex items-end justify-center gap-3 pb-[24%]">
      {bars.map((b, i) => (
        <div key={i} className="relative flex w-9 flex-col items-center">
          {i === 1 ? (
            <motion.div className="mb-2 text-[#d4fc18]" animate={still ? undefined : { y: [0, -6, 0], rotate: [0, 12, 0] }} transition={loop(2.4, { ease: 'easeInOut' })}>
              <SiteIcon name="star" size={18} strokeWidth={2} />
            </motion.div>
          ) : null}
          <motion.div
            className={`w-full rounded-t-xl ${b.color} ${i === 1 ? 'shadow-[0_0_30px_rgb(212_252_24/0.45)]' : ''}`}
            initial={{ height: 0 }}
            animate={still ? { height: b.h[0] * 1.1 } : { height: b.h.map((x) => x * 1.1) }}
            transition={still ? { duration: 0 } : loop(3.2, { delay: b.delay, ease: 'easeInOut' })}
          />
        </div>
      ))}
      <div className="absolute right-[18%] bottom-[24%] left-[18%] h-px bg-white/25" />
    </div>
  );
}

/** Biz haqimizda: the SUN — rays turning, the team circling around it. */
function About() {
  const rays = Array.from({ length: 12 }, (_, i) => i);
  return (
    <>
      <Spin seconds={36} className="absolute inset-0">
        <svg viewBox="0 0 200 200" className="size-full">
          {rays.map((i) => {
            const a = (i / rays.length) * Math.PI * 2;
            const r1 = 34;
            const r2 = i % 2 ? 50 : 58;
            return (
              <line
                key={i}
                x1={(100 + r1 * Math.cos(a)).toFixed(2)}
                y1={(100 + r1 * Math.sin(a)).toFixed(2)}
                x2={(100 + r2 * Math.cos(a)).toFixed(2)}
                y2={(100 + r2 * Math.sin(a)).toFixed(2)}
                stroke={LIME}
                strokeOpacity={i % 2 ? 0.45 : 0.9}
                strokeWidth={3}
                strokeLinecap="round"
              />
            );
          })}
        </svg>
      </Spin>
      {[
        { px: 150, seconds: 14, dot: 'size-3 bg-white' },
        { px: 184, seconds: 22, dot: 'size-2.5 bg-[#d4fc18]' },
        { px: 120, seconds: 10, dot: 'size-2 bg-white/70' },
      ].map((o, i) => (
        <div key={o.px} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: o.px, height: o.px }}>
          <Spin seconds={o.seconds} reverse={i === 1} className="relative size-full rounded-full border border-white/[0.06]">
            <span className={`absolute -top-1 left-1/2 -translate-x-1/2 rounded-full shadow-[0_0_12px_rgb(255_255_255/0.6)] ${o.dot}`} />
          </Spin>
        </div>
      ))}
      <div className="absolute top-1/2 left-1/2 size-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#f2ff9e,#d4fc18_55%,#9cbf0c)] shadow-[0_0_50px_rgb(212_252_24/0.6)]" />
    </>
  );
}

/** Aloqa: a message going out in waves, and someone already typing back. */
function Contact() {
  const still = useReducedMotion();
  return (
    <>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute top-1/2 left-1/2 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#d4fc18]"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={still ? { scale: 1 + i * 0.35, opacity: 0.25 } : { scale: [0.5, 2], opacity: [0.7, 0] }}
          transition={still ? { duration: 0 } : loop(3, { delay: i, ease: 'easeOut' })}
        />
      ))}
      <div className="absolute top-1/2 left-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#d4fc18] text-[#0b0b0c] shadow-[0_0_40px_rgb(212_252_24/0.55)]">
        <SiteIcon name="message" size={22} strokeWidth={2} />
      </div>
      <motion.div
        className="absolute top-[22%] right-[16%] flex gap-1 rounded-2xl rounded-bl-sm bg-white/90 px-2.5 py-2"
        animate={still ? undefined : { y: [0, -4, 0] }}
        transition={loop(2.2, { ease: 'easeInOut' })}
      >
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-[#0b0b0c]"
            animate={still ? undefined : { opacity: [0.25, 1, 0.25] }}
            transition={loop(1.2, { delay: i * 0.2, ease: 'easeInOut' })}
          />
        ))}
      </motion.div>
      <div className="absolute bottom-[22%] left-[18%] grid size-8 place-items-center rounded-full border border-white/20 bg-[#141416] text-white/80">
        <SiteIcon name="phone" size={14} />
      </div>
    </>
  );
}

/** Keyslar: results — a growth line drawing itself, next to the video it came from. */
function Cases() {
  const still = useReducedMotion();
  const path = 'M30 140 L62 122 L88 128 L114 96 L140 102 L170 62';
  return (
    <>
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full">
        {[70, 100, 130].map((y) => (
          <line key={y} x1="28" x2="172" y1={y} y2={y} stroke="rgb(255 255 255 / 0.08)" strokeDasharray="3 5" />
        ))}
        <defs>
          <linearGradient id="orb-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={LIME} stopOpacity="0.35" />
            <stop offset="1" stopColor={LIME} stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path
          d={`${path} L170 150 L30 150 Z`}
          fill="url(#orb-area)"
          animate={still ? undefined : { opacity: [0, 1, 1, 0] }}
          transition={loop(4, { times: [0, 0.45, 0.85, 1], ease: 'easeInOut' })}
        />
        <motion.path
          d={path}
          fill="none"
          stroke={LIME}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: still ? 1 : 0 }}
          animate={still ? undefined : { pathLength: [0, 1, 1, 0] }}
          transition={loop(4, { times: [0, 0.45, 0.85, 1], ease: 'easeInOut' })}
        />
        <motion.circle
          cx="170"
          cy="62"
          r="6"
          fill={LIME}
          animate={still ? undefined : { scale: [0, 0, 1.3, 1, 0], opacity: [0, 0, 1, 1, 0] }}
          transition={loop(4, { times: [0, 0.4, 0.5, 0.85, 1] })}
          style={{ transformOrigin: '170px 62px' }}
        />
      </svg>
      <motion.div
        className="absolute top-[24%] left-[20%] grid size-10 place-items-center rounded-full bg-white/90 text-[#0b0b0c] shadow-[0_6px_20px_rgb(0_0_0/0.4)]"
        animate={still ? undefined : { scale: [1, 1.08, 1] }}
        transition={loop(2, { ease: 'easeInOut' })}
      >
        <SiteIcon name="play" size={14} className="ml-0.5" />
      </motion.div>
    </>
  );
}

/**
 * The glass sphere at the top right of an inside page, with a small scene about that page inside it.
 * Desktop only (on phones the headline needs the room); decorative, hidden from screen readers.
 */
export function PageOrb({ theme, logos = [] }: { theme: OrbTheme; logos?: string[] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute top-28 right-[6%] hidden size-56 lg:block">
      <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_200deg,#f4f4f5,#6e6e76,#d9d9de,#3a3a3e,#f4f4f5)] opacity-80 blur-[1px]" />
      <div className="absolute inset-[5px] overflow-hidden rounded-full bg-[radial-gradient(circle_at_50%_38%,#1c1c20,#070708_72%)]">
        {theme === 'services' ? <Services /> : null}
        {theme === 'partners' ? <Partners logos={logos} /> : null}
        {theme === 'plans' ? <Plans /> : null}
        {theme === 'about' ? <About /> : null}
        {theme === 'contact' ? <Contact /> : null}
        {theme === 'cases' ? <Cases /> : null}
      </div>
      <div className="absolute inset-0 rounded-full shadow-[inset_0_2px_10px_rgb(255_255_255/0.35),inset_0_-16px_34px_rgb(0_0_0/0.55),0_30px_80px_-24px_rgb(212_252_24/0.3)]" />
      <div className="absolute inset-[8%] rounded-full bg-[radial-gradient(circle_at_30%_20%,rgb(255_255_255/0.32),transparent_38%)]" />
    </div>
  );
}
