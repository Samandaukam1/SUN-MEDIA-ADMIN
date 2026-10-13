'use client';

import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

import { SiteIcon } from './SiteIcon';

/** Every few photos one spans two columns and rows, so the grid reads like an editorial spread. */
const span = (i: number) => (i % 7 === 0 ? 'col-span-2 row-span-2' : '');

/**
 * Photos from the shoots: a grid of thumbnails; a click (or Enter) opens the photo full size with previous /
 * next (buttons, arrow keys, swipe) and Esc to close. Photos that fail to load drop out of the grid.
 */
export function GalleryLightbox({ images, title }: { images: string[]; title: string }) {
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const photos = images.filter((src) => !broken.has(src));
  const [index, setIndex] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const touchX = useRef<number | null>(null);

  const go = useCallback((dir: -1 | 1) => setIndex((i) => (i === null ? i : (i + dir + photos.length) % photos.length)), [photos.length]);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (index !== null && !el.open) {
      el.showModal();
      window.__sunLenis?.stop();
    }
    if (index === null && el.open) el.close();
    if (index === null) window.__sunLenis?.start();
  }, [index]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, go]);

  if (!photos.length) return null;
  const current = index === null ? null : photos[index];

  return (
    <>
      <div className="grid auto-rows-[150px] grid-cols-2 gap-3 sm:auto-rows-[190px] md:grid-cols-3 lg:auto-rows-[230px]">
        {photos.map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`${title} — ${i + 1}-rasmni kattalashtirish`}
            className={`lg group relative overflow-hidden rounded-[22px] p-1.5 ${span(i)}`}
          >
            <span className="relative block size-full overflow-hidden rounded-[17px]">
              <Image
                src={src}
                alt={`${title} — ${i + 1}`}
                fill
                sizes={i % 7 === 0 ? '(min-width: 768px) 66vw, 100vw' : '(min-width: 768px) 33vw, 50vw'}
                className="object-cover transition-transform duration-[1.2s] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.05]"
                onError={() => setBroken((b) => new Set(b).add(src))}
              />
              <span className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <span className="absolute right-3 bottom-3 grid size-9 place-items-center rounded-full bg-[#d4fc18] text-[#0b0b0c] opacity-0 transition-all duration-500 group-hover:opacity-100">
                <SiteIcon name="plus" size={16} strokeWidth={2.2} />
              </span>
            </span>
          </button>
        ))}
      </div>

      <dialog
        ref={dialog}
        onClose={() => setIndex(null)}
        onCancel={(e) => {
          e.preventDefault();
          setIndex(null);
        }}
        onClick={(e) => {
          if (e.target === dialog.current) setIndex(null);
        }}
        aria-label={`${title} — rasmlar`}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0"
        data-lenis-prevent
      >
        {current !== null && index !== null ? (
          <div
            className="relative flex h-full w-full items-center justify-center bg-[#050506]/90 backdrop-blur-xl"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIndex(null);
            }}
            onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
            onTouchEnd={(e) => {
              if (touchX.current === null) return;
              const dx = e.changedTouches[0].clientX - touchX.current;
              if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
              touchX.current = null;
            }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={current}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="relative h-[78dvh] w-[92vw] max-w-6xl"
              >
                <Image src={current} alt={`${title} — ${index + 1}`} fill sizes="92vw" className="object-contain" priority />
              </motion.div>
            </AnimatePresence>

            <p className="absolute top-5 left-1/2 -translate-x-1/2 rounded-full bg-white/[0.08] px-4 py-1.5 text-[13px] font-medium text-white tabular">
              {index + 1} / {photos.length}
            </p>
            <button
              type="button"
              onClick={() => setIndex(null)}
              aria-label="Yopish"
              className="lg absolute top-4 right-4 grid size-12 place-items-center rounded-full text-white"
            >
              <SiteIcon name="close" size={20} />
            </button>
            {photos.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Oldingi rasm"
                  className="lg absolute left-3 grid size-12 place-items-center rounded-full text-white sm:left-6"
                >
                  <SiteIcon name="arrowRight" size={20} className="rotate-180" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Keyingi rasm"
                  className="lg absolute right-3 grid size-12 place-items-center rounded-full text-white sm:right-6"
                >
                  <SiteIcon name="arrowRight" size={20} />
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
