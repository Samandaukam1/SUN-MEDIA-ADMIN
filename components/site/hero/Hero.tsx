import Link from 'next/link';

import type { BubblePartner } from '@/lib/site/bubbles';
import { accentRuns, type SiteSettings } from '@/lib/site/types';
import { Magnetic, Reveal, SplitWords } from '../motion';
import { Eyebrow } from '../sections';
import { SiteIcon } from '../SiteIcon';
import { HeroCanvas } from './HeroCanvas';

export function Hero({ settings, secondaryHref, partners }: { settings: SiteSettings; secondaryHref: string | null; partners: BubblePartner[] }) {
  return (
    <section className="relative flex min-h-[100svh] flex-col overflow-hidden bg-[#060607]">
      <HeroCanvas partners={partners} />
      {/* Readability veil on the text side; the 3D logo keeps its own half. */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(0deg,#060607_8%,rgb(6_6_7/0.55)_38%,transparent_62%)] lg:bg-[linear-gradient(90deg,#060607_18%,rgb(6_6_7/0.55)_46%,transparent_66%)]" />
      <div className="s-grid-lines pointer-events-none absolute inset-0 opacity-50" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#050506] to-transparent" />

      <div className="pointer-events-none relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-end px-5 pt-[43svh] pb-12 sm:px-8 lg:justify-center lg:pt-32 lg:pb-24">
        <div className="pointer-events-auto max-w-[640px]">
          {settings.hero_eyebrow ? (
            <Reveal onMount className="mb-5 sm:mb-7" y={14}>
              <Eyebrow>{settings.hero_eyebrow}</Eyebrow>
            </Reveal>
          ) : null}
          <SplitWords
            runs={accentRuns(settings.hero_title)}
            className="font-display s-silver text-[37px] leading-[1.02] font-medium tracking-[-0.045em] text-balance sm:text-[64px] lg:text-[78px]"
          />
          {settings.hero_subtitle ? (
            <Reveal onMount delay={0.55} y={16}>
              <p className="mt-5 max-w-[520px] text-[16px] sm:mt-7 leading-relaxed text-[#b4b4ba] sm:text-[19px]">{settings.hero_subtitle}</p>
            </Reveal>
          ) : null}
          <Reveal onMount delay={0.7} y={16} className="mt-8 flex flex-wrap items-center gap-3 sm:mt-10">
            <Magnetic>
              <Link href="/hamkorlar" className="s-btn s-btn-lime group">
                <span>{settings.primary_cta_label}</span>
                <span className="grid size-7 place-items-center rounded-full bg-black/10 transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-rotate-45">
                  <SiteIcon name="arrowRight" size={16} strokeWidth={2} />
                </span>
              </Link>
            </Magnetic>
            {secondaryHref ? (
              <Link href={secondaryHref} className="s-btn s-btn-glass lg">
                {settings.secondary_cta_label}
              </Link>
            ) : null}
          </Reveal>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[11px] tracking-[0.2em] text-[#6e6e76] uppercase lg:flex">
        <span>Pastga</span>
        <span className="grid h-10 w-6 justify-center rounded-full border border-white/15 pt-2">
          <span className="block h-2 w-0.5 animate-bounce rounded-full bg-[#d4fc18]" />
        </span>
      </div>
    </section>
  );
}
