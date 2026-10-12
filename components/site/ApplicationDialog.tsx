'use client';

import { motion } from 'motion/react';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { APPLY_EVENT } from './ApplyButton';
import { ApplicationForm, type FormLabels } from './ApplicationForm';
import { SiteIcon } from './SiteIcon';

/** "Ariza qoldirish" from any button on the site: a liquid-glass window with the form. */
export function ApplicationDialog({ labels, services }: { labels: FormLabels; services: string[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [service, setService] = useState<string | undefined>();
  const [round, setRound] = useState(0);

  useEffect(() => {
    const onApply = (e: Event) => {
      setService((e as CustomEvent<{ service?: string }>).detail?.service);
      setRound((r) => r + 1);
      setOpen(true);
    };
    window.addEventListener(APPLY_EVENT, onApply);
    return () => window.removeEventListener(APPLY_EVENT, onApply);
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      window.__sunLenis?.stop();
    }
    if (!open && dialog.open) dialog.close();
    if (!open) window.__sunLenis?.start();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={() => setOpen(false)}
      onCancel={(e) => {
        e.preventDefault();
        setOpen(false);
      }}
      onClick={(e) => {
        if (e.target === ref.current) setOpen(false);
      }}
      aria-labelledby="apply-title"
      className="m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-[640px] overflow-visible bg-transparent p-0 text-[#f4f4f5]"
    >
      {open ? (
        <motion.div
          key={round}
          initial={{ opacity: 0, y: 28, scale: 0.97, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="lg lg-strong max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain rounded-[32px] px-5 pt-7 pb-6 sm:px-9 sm:pt-9 sm:pb-8"
          data-lenis-prevent
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Yopish"
            className="absolute top-4 right-4 z-10 grid size-10 place-items-center rounded-full text-[#a8a8ac] transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <SiteIcon name="close" size={18} />
          </button>
          <div className="mb-7 pr-10">
            <p className="mb-3 inline-flex items-center gap-2 text-[12px] font-semibold tracking-[0.14em] text-[#d4fc18] uppercase">
              <span className="s-pulse-dot size-1.5 rounded-full bg-[#d4fc18]" /> SUN MEDIA
            </p>
            <h2 id="apply-title" className="font-display text-[26px] leading-tight font-medium tracking-tight sm:text-[30px]">
              <span className="s-silver">{labels.form_title}</span>
            </h2>
            {labels.form_subtitle ? <p className="mt-2 text-[15px] text-[#a8a8ac]">{labels.form_subtitle}</p> : null}
          </div>
          <ApplicationForm labels={labels} services={services} source={pathname} initialService={service} onDone={() => setOpen(false)} />
        </motion.div>
      ) : null}
    </dialog>
  );
}
