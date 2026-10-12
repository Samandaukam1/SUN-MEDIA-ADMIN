'use client';

import { motion, useReducedMotion } from 'motion/react';

/** Each page arrives with a short lift-and-focus, so navigating feels continuous. */
export default function SiteTemplate({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, filter: 'blur(6px)' }}
      // filter: none afterwards, so the wrapper stops being the backdrop root of the glass inside it.
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
