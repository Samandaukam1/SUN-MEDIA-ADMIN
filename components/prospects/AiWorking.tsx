'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';

import { display } from './ui';

/** Shown while the AI reads (it takes 20–60 seconds): what it is doing, step by step. */
export function AiWorking({ steps }: { steps: string[] }) {
  const [i, setI] = useState(0);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const step = setInterval(() => setI((n) => Math.min(n + 1, steps.length - 1)), 7000);
    const clock = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      clearInterval(step);
      clearInterval(clock);
    };
  }, [steps.length]);

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-[#d4fc18]/25 bg-[#0b0b0c] px-6 py-14 text-center sm:py-20" role="status" aria-live="polite">
      <span aria-hidden className="t-scan" />
      <span aria-hidden className="t-drift pointer-events-none absolute -top-20 left-1/2 size-80 -translate-x-1/2 rounded-full bg-[#d4fc18]/15 blur-3xl" />
      <div className="relative mx-auto grid size-20 place-items-center">
        {[0, 1, 2].map((n) => (
          <motion.span
            key={n}
            className="absolute inset-0 rounded-full border border-[#d4fc18]/50"
            initial={{ scale: 0.6, opacity: 0.9 }}
            animate={{ scale: 1.7, opacity: 0 }}
            transition={{ duration: 2.4, repeat: Infinity, delay: n * 0.8, ease: 'easeOut' }}
          />
        ))}
        <span className="grid size-14 place-items-center rounded-full bg-[#d4fc18] text-[24px] text-[#0b0b0c] shadow-[0_0_40px_rgb(212_252_24/0.6)]">✦</span>
      </div>
      <div className="relative mt-8 h-8">
        <AnimatePresence mode="wait">
          <motion.p
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
            className={`${display} text-[17px] text-white sm:text-[20px]`}
          >
            {steps[i]}
          </motion.p>
        </AnimatePresence>
      </div>
      <p className="relative mt-3 text-[13px] text-[#8e8e96]">AI ishlayapti · {seconds} soniya · sahifani yopmang</p>
    </div>
  );
}
