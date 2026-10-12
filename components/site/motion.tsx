'use client';

import { animate, motion, useInView, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';

const EASE = [0.22, 1, 0.36, 1] as const;

/** Rises out of a soft blur as it scrolls into view. */
export function Reveal({
  children,
  delay = 0,
  y = 28,
  className,
  as = 'div',
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article' | 'header' | 'p' | 'span';
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y, filter: 'blur(10px)' }}
      // filter: none once visible, so glass inside blurs the page again (a filtered parent becomes its backdrop root).
      whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.9, delay, ease: EASE }}
    >
      {children}
    </Tag>
  );
}

/** Headline words slide up from behind a mask, one after another. */
export function SplitWords({
  runs,
  className,
  accentClassName = 'text-[#d4fc18]',
  delay = 0.15,
  as: Tag = 'h1',
}: {
  runs: { text: string; accent: boolean }[];
  className?: string;
  accentClassName?: string;
  delay?: number;
  as?: 'h1' | 'h2' | 'p';
}) {
  const reduce = useReducedMotion();
  let index = 0;
  return (
    <Tag className={className}>
      {runs.map((run, r) =>
        run.text.split(/(\s+)/).map((word, w) => {
          if (/^\s+$/.test(word) || word === '') return word;
          const i = index++;
          return (
            <span key={`${r}-${w}`} className="inline-block overflow-hidden pb-[0.12em] align-bottom">
              <motion.span
                className={`inline-block ${run.accent ? accentClassName : ''}`}
                initial={reduce ? { opacity: 0 } : { y: '110%', rotate: 4 }}
                animate={reduce ? { opacity: 1 } : { y: '0%', rotate: 0 }}
                transition={{ duration: 1.05, delay: delay + i * 0.07, ease: EASE }}
              >
                {word}
              </motion.span>
            </span>
          );
        }),
      )}
    </Tag>
  );
}

/** Liquid-glass card: a lime spotlight follows the pointer and the card leans toward it a little. */
export function GlassCard({
  children,
  className = '',
  tilt = true,
  style,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  tilt?: boolean;
  style?: CSSProperties;
  as?: 'div' | 'article' | 'li';
}) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const rx = useSpring(0, { stiffness: 160, damping: 18 });
  const ry = useSpring(0, { stiffness: 160, damping: 18 });
  const Component = motion[Tag];

  const onMove = (e: PointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== 'mouse') return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    el.style.setProperty('--mx', `${x}px`);
    el.style.setProperty('--my', `${y}px`);
    if (tilt && !reduce) {
      ry.set(((x / rect.width) - 0.5) * 7);
      rx.set(-((y / rect.height) - 0.5) * 7);
    }
  };
  const onLeave = () => {
    rx.set(0);
    ry.set(0);
    ref.current?.style.setProperty('--mx', '-999px');
    ref.current?.style.setProperty('--my', '-999px');
  };

  return (
    <Component
      ref={ref as never}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`lg ${className}`}
      style={{ ...style, rotateX: rx, rotateY: ry, transformPerspective: 900 }}
    >
      {children}
    </Component>
  );
}

/** Pulls gently toward the cursor (buttons). */
export function Magnetic({ children, strength = 0.28, className }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const x = useSpring(0, { stiffness: 220, damping: 16, mass: 0.4 });
  const y = useSpring(0, { stiffness: 220, damping: 16, mass: 0.4 });
  return (
    <motion.span
      ref={ref}
      className={`inline-flex ${className ?? ''}`}
      style={{ x, y }}
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== 'mouse' || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * strength);
        y.set((e.clientY - r.top - r.height / 2) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.span>
  );
}

/** "120+" counts up from 0 when it scrolls into view; text that is not a number appears as is. */
export function CountUp({ value, className }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const reduce = useReducedMotion();
  const match = /^([^0-9]*)(\d+(?:[.,]\d+)?)(.*)$/.exec(value);
  const [shown, setShown] = useState(match && !reduce ? `${match[1]}0${match[3]}` : value);

  useEffect(() => {
    if (!match || !inView || reduce) {
      if (!match || reduce) setShown(value);
      return;
    }
    const [, prefix, num, suffix] = match;
    const decimals = num.includes('.') || num.includes(',') ? num.split(/[.,]/)[1].length : 0;
    const target = Number(num.replace(',', '.'));
    const controls = animate(0, target, {
      duration: 1.8,
      ease: EASE,
      onUpdate: (v) => setShown(`${prefix}${v.toFixed(decimals).replace('.', num.includes(',') ? ',' : '.')}${suffix}`),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value, reduce]);

  return (
    <span ref={ref} className={className}>
      {shown}
    </span>
  );
}

/** A lime line that draws itself as the section scrolls past (process timeline). */
export function ScrollLine({ className, vertical = false }: { className?: string; vertical?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const progress = useMotionValue(0);
  const scale = useSpring(progress, { stiffness: 90, damping: 24 });
  const reduce = useReducedMotion();
  const transform = useTransform(scale, (v) => (vertical ? `scaleY(${v})` : `scaleX(${v})`));

  useEffect(() => {
    if (reduce) {
      progress.set(1);
      return;
    }
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const start = vh * 0.85;
      const span = (vertical ? rect.height : rect.width * 0.3) + vh * 0.35;
      progress.set(Math.min(1, Math.max(0, (start - rect.top) / span)));
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [progress, reduce, vertical]);

  return (
    <div ref={ref} className={className} aria-hidden>
      <motion.div
        className={`size-full shadow-[0_0_24px_rgb(212_252_24/0.6)] ${
          vertical ? 'bg-[linear-gradient(180deg,#d4fc18,#f4f4f5)]' : 'bg-[linear-gradient(90deg,#d4fc18,#f4f4f5)]'
        }`}
        style={{ transform, transformOrigin: vertical ? 'top' : 'left' }}
      />
    </div>
  );
}
