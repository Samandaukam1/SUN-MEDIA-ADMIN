'use client';

import Lenis from 'lenis';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

declare global {
  interface Window {
    __sunLenis?: Lenis;
  }
}

/** Inertia scrolling on wheel and trackpad; touch keeps the native feel. Off for prefers-reduced-motion. */
export function SmoothScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ duration: 1.15, easing: (t) => 1 - Math.pow(1 - t, 4), smoothWheel: true, anchors: { offset: -96 } });
    window.__sunLenis = lenis;
    let frame = requestAnimationFrame(function raf(time) {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    });
    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
      window.__sunLenis = undefined;
    };
  }, []);

  // New page → start at the top (or at its #anchor).
  useEffect(() => {
    const hash = window.location.hash;
    const target = hash ? document.querySelector(hash) : null;
    if (target) window.__sunLenis?.scrollTo(target as HTMLElement, { offset: -96, immediate: true });
    else window.__sunLenis?.scrollTo(0, { immediate: true });
  }, [pathname]);

  return null;
}

/** Scrolls to an element smoothly whether or not Lenis is running. */
export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return false;
  if (window.__sunLenis) window.__sunLenis.scrollTo(el, { offset: -96 });
  else el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}
