'use client';

import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Logo } from '@/components/brand/Logo';
import { openApplication } from './ApplyButton';
import { SiteIcon } from './SiteIcon';

type NavItem = { href: string; label: string };

const EASE = [0.22, 1, 0.36, 1] as const;

/** Floating liquid-glass bar: hides while reading down, returns on the way up; a full-screen menu on phones. */
export function SiteHeader({ nav, ctaLabel, phone }: { nav: NavItem[]; ctaLabel: string; phone: string | null }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 24);
      setHidden(y > 320 && y > last + 2);
      if (y < last - 2) setHidden(false);
      last = y;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (open) window.__sunLenis?.stop();
    else window.__sunLenis?.start();
    document.documentElement.style.overflow = open ? 'hidden' : '';
  }, [open]);

  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <motion.header
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: hidden && !open ? -110 : 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: EASE }}
        className="fixed inset-x-0 top-3 z-50 px-3 sm:top-5 sm:px-5"
      >
        <div
          className={`lg mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 rounded-full pr-2 pl-5 transition-[background-color] duration-500 sm:h-[68px] sm:pl-6 ${
            scrolled ? 'lg-strong' : ''
          }`}
        >
          <Link href="/" aria-label="SUN MEDIA — bosh sahifa" className="shrink-0">
            <Logo width={104} onDark compact />
          </Link>

          <nav aria-label="Asosiy" className="hidden items-center gap-1 lg:flex">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active(item.href) ? 'page' : undefined}
                className={`relative rounded-full px-4 py-2 text-[14px] font-medium transition-colors duration-300 ${
                  active(item.href) ? 'text-white' : 'text-[#a8a8ac] hover:text-white'
                }`}
              >
                {active(item.href) ? (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full bg-white/[0.08] shadow-[inset_0_1px_0_rgb(255_255_255/0.14)]"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                ) : null}
                <span className="relative">{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/hamkorlar" className="s-btn s-btn-lime hidden h-11 px-5 text-[14px] sm:inline-flex">
              {ctaLabel}
            </Link>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? 'Menyuni yopish' : 'Menyu'}
              className="grid size-12 place-items-center rounded-full bg-white/[0.06] text-white transition-colors hover:bg-white/[0.12] lg:hidden"
            >
              <SiteIcon name={open ? 'close' : 'menu'} size={22} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </motion.header>

      <AnimatePresence>
        {open ? (
          <motion.div
            key="menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="fixed inset-0 z-40 flex flex-col bg-[#050506]/80 px-6 pt-28 pb-10 backdrop-blur-2xl lg:hidden"
            data-lenis-prevent
          >
            <div className="pointer-events-none absolute top-1/3 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(212_252_24/0.16),transparent_62%)] blur-2xl" />
            <nav aria-label="Menyu" className="relative flex flex-col">
              {[{ href: '/', label: 'Bosh sahifa' }, ...nav].map((item, i) => (
                <motion.div
                  key={item.href}
                  initial={{ y: 40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.7, delay: 0.06 + i * 0.06, ease: EASE }}
                >
                  <Link
                    href={item.href}
                    className={`font-display flex items-center justify-between border-b border-white/[0.07] py-5 text-[26px] font-medium tracking-tight ${
                      (item.href === '/' ? pathname === '/' : active(item.href)) ? 's-lime-text' : 's-silver'
                    }`}
                  >
                    {item.label}
                    <SiteIcon name="arrowUpRight" size={22} className="text-[#6e6e76]" />
                  </Link>
                </motion.div>
              ))}
            </nav>
            <motion.div
              className="relative mt-auto flex flex-col gap-3"
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.4, ease: EASE }}
            >
              <Link href="/hamkorlar" onClick={() => setOpen(false)} className="s-btn s-btn-lime w-full">
                {ctaLabel}
              </Link>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  openApplication();
                }}
                className="s-btn s-btn-glass lg w-full"
              >
                Ariza qoldirish
              </button>
              {phone ? (
                <a href={`tel:${phone}`} className="s-btn s-btn-glass lg w-full">
                  <SiteIcon name="phone" size={18} /> Qo‘ng‘iroq qilish
                </a>
              ) : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
