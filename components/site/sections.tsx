import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  type BudgetOption,
  accentRuns,
  formatPhone,
  partnershipYears,
  type SiteBenefit,
  type SiteCase,
  type SitePartner,
  type SiteService,
  type SiteSettings,
  type SiteStat,
  type SiteStep,
  type SiteTestimonial,
} from '@/lib/site/types';
import { ApplicationForm } from './ApplicationForm';
import { CountUp, GlassCard, Reveal, ScrollLine, SplitWords } from './motion';
import { SocialRow } from './SiteFooter';
import { SiteIcon } from './SiteIcon';
import { CaseCard } from './CaseCard';
import { PageOrb, type OrbTheme } from './PageOrb';
import { PartnerLogoImage } from './PartnerLogoImage';
import { initialsOf, SiteImage } from './SiteImage';

export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>{children}</div>;
}

function Accent({ text, tone = 'dark' }: { text: string; tone?: 'dark' | 'light' }) {
  return (
    <>
      {accentRuns(text).map((run, i) =>
        run.accent ? (
          <span key={i} className={tone === 'dark' ? 's-lime-text' : 'rounded-[0.2em] bg-[#d4fc18] px-[0.12em] text-[#0b0b0c]'}>
            {run.text}
          </span>
        ) : (
          <span key={i}>{run.text}</span>
        ),
      )}
    </>
  );
}

export function Eyebrow({ children, tone = 'dark' }: { children: ReactNode; tone?: 'dark' | 'light' }) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold tracking-[0.16em] uppercase ${
        tone === 'dark' ? 'lg text-[#d9d9de]' : 'border border-black/10 bg-white/70 text-[#3f3f46]'
      }`}
    >
      <span className="s-pulse-dot size-1.5 rounded-full bg-[#d4fc18] shadow-[0_0_10px_#d4fc18]" />
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  tone = 'dark',
  align = 'left',
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  tone?: 'dark' | 'light';
  align?: 'left' | 'center';
  action?: ReactNode;
}) {
  const center = align === 'center';
  return (
    <div className={`mb-12 flex flex-col gap-6 sm:mb-16 ${center ? 'items-center text-center' : 'lg:flex-row lg:items-end lg:justify-between'}`}>
      <div className={center ? 'flex max-w-3xl flex-col items-center' : 'max-w-3xl'}>
        {eyebrow ? (
          <Reveal className="mb-5">
            <Eyebrow tone={tone}>{eyebrow}</Eyebrow>
          </Reveal>
        ) : null}
        <Reveal delay={0.05}>
          <h2
            className={`font-display text-[34px] leading-[1.06] font-medium tracking-[-0.035em] text-balance sm:text-[46px] lg:text-[54px] ${
              tone === 'dark' ? 's-silver' : 'text-[#0b0b0c]'
            }`}
          >
            <Accent text={title} tone={tone} />
          </h2>
        </Reveal>
        {subtitle ? (
          <Reveal delay={0.1}>
            <p className={`mt-5 max-w-2xl text-[16px] leading-relaxed sm:text-[17px] ${tone === 'dark' ? 'text-[#a8a8ac]' : 'text-[#52525b]'}`}>{subtitle}</p>
          </Reveal>
        ) : null}
      </div>
      {action ? <Reveal delay={0.15}>{action}</Reveal> : null}
    </div>
  );
}

export function TextLink({ href, children, tone = 'dark' }: { href: string; children: ReactNode; tone?: 'dark' | 'light' }) {
  return (
    <Link
      href={href}
      className={`group inline-flex items-center gap-3 text-[15px] font-medium ${tone === 'dark' ? 'text-white' : 'text-[#0b0b0c]'}`}
    >
      <span className="relative">
        {children}
        <span className="absolute -bottom-1 left-0 h-px w-full origin-left scale-x-0 bg-[#d4fc18] transition-transform duration-500 group-hover:scale-x-100" />
      </span>
      <span
        className={`grid size-10 place-items-center rounded-full transition-all duration-500 group-hover:-rotate-45 group-hover:bg-[#d4fc18] group-hover:text-[#0b0b0c] ${
          tone === 'dark' ? 'bg-white/[0.07]' : 'bg-black/[0.06]'
        }`}
      >
        <SiteIcon name="arrowRight" size={16} strokeWidth={2} />
      </span>
    </Link>
  );
}

/* --------------------------------------------------------------------------------------------- */

export function PageHero({
  eyebrow,
  title,
  subtitle,
  orb,
  orbLogos,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  /** The scene inside the glass sphere: what this page is about. */
  orb?: OrbTheme;
  orbLogos?: string[];
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden pt-36 pb-16 sm:pt-44 sm:pb-24">
      <div className="s-grid-lines pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -top-40 right-[-10%] size-[620px] rounded-full bg-[radial-gradient(circle,rgb(212_252_24/0.16),transparent_62%)] blur-2xl" />
      {orb ? (
        <PageOrb theme={orb} logos={orbLogos} />
      ) : (
        <div aria-hidden className="s-hero-fallback pointer-events-none absolute top-28 right-[6%] hidden size-56 rounded-full lg:block">
          <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_200deg,#f4f4f5,#6e6e76,#d9d9de,#3a3a3e,#f4f4f5)] opacity-80 blur-[2px]" />
          <div className="lg absolute inset-0 rounded-full" />
          <div className="absolute inset-[18%] rounded-full bg-[radial-gradient(circle_at_30%_25%,rgb(255_255_255/0.6),transparent_45%)]" />
        </div>
      )}
      <Container className="relative">
        <Reveal className="mb-6">
          <Eyebrow>{eyebrow}</Eyebrow>
        </Reveal>
        <SplitWords
          runs={accentRuns(title)}
          className="font-display s-silver max-w-4xl text-[40px] leading-[1.04] font-medium tracking-[-0.04em] sm:text-[60px] lg:text-[76px]"
        />
        {subtitle ? (
          <Reveal delay={0.35}>
            <p className="mt-7 max-w-2xl text-[17px] leading-relaxed text-[#a8a8ac] sm:text-[19px]">{subtitle}</p>
          </Reveal>
        ) : null}
        {children}
      </Container>
    </section>
  );
}

/* --------------------------------------------------------------------------------------------- */

export function ServiceMarquee({ words }: { words: string[] }) {
  if (!words.length) return null;
  const row = [...words, ...words];
  return (
    <div className="s-marquee-wrap s-fade-edges relative overflow-hidden border-y border-white/[0.06] py-7" aria-hidden>
      <div className="s-marquee gap-10" style={{ ['--s-marquee-duration' as string]: `${Math.max(28, words.length * 7)}s` }}>
        {row.map((w, i) => (
          <span key={i} className="font-display flex items-center gap-10 text-[28px] font-medium tracking-[-0.02em] whitespace-nowrap sm:text-[44px]">
            <span className={i % 2 ? 's-outline-text' : 's-silver'}>{w}</span>
            <span className="text-[22px] text-[#d4fc18]">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function StatsGrid({ stats }: { stats: SiteStat[] }) {
  return (
    <div className={`grid gap-4 ${stats.length >= 4 ? 'grid-cols-2 lg:grid-cols-4' : stats.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
      {stats.map((s, i) => (
        <Reveal key={s.id} delay={i * 0.06}>
          <GlassCard className="h-full rounded-[28px] p-6 sm:p-8">
            <CountUp value={s.value} className="font-display s-silver block text-[40px] leading-none font-medium tracking-[-0.04em] sm:text-[56px]" />
            <p className="mt-4 text-[15px] font-medium text-white">{s.label}</p>
            {s.description ? <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#8e8e96]">{s.description}</p> : null}
          </GlassCard>
        </Reveal>
      ))}
    </div>
  );
}

export function ServicesGrid({ services }: { services: SiteService[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {services.map((s, i) => (
        <Reveal key={s.id} delay={(i % 3) * 0.08}>
          <GlassCard as="article" className="group flex h-full min-h-[320px] flex-col rounded-[30px] p-7 sm:p-8">
            <div className="mb-8 flex items-start justify-between">
              <span className="grid size-14 place-items-center rounded-2xl bg-[#d4fc18]/[0.09] text-[#d4fc18] shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_0_0_1px_rgb(212_252_24/0.18)] transition-all duration-500 group-hover:bg-[#d4fc18] group-hover:text-[#0b0b0c] group-hover:shadow-[0_12px_40px_-8px_rgb(212_252_24/0.6)]">
                <SiteIcon name={s.icon} size={24} />
              </span>
              <span className="font-display tabular text-[13px] text-[#55555c]">{String(i + 1).padStart(2, '0')}</span>
            </div>
            <h3 className="font-display text-[20px] leading-snug font-medium tracking-[-0.02em] text-white">{s.title}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-[#a8a8ac]">{s.summary}</p>
            {s.bullets.length ? (
              <ul className="mt-6 space-y-2.5 border-t border-white/[0.07] pt-6">
                {s.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-3 text-[14px] text-[#d9d9de]">
                    <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#d4fc18]" />
                    {b}
                  </li>
                ))}
              </ul>
            ) : null}
          </GlassCard>
        </Reveal>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------------------------------- */

export function CasesGrid({ cases }: { cases: SiteCase[] }) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {cases.map((c, i) => {
        const large = cases.length % 2 === 1 && i === 0;
        return (
          <Reveal key={c.id} delay={(i % 2) * 0.08} className={large ? 'md:col-span-2' : ''}>
            <CaseCard item={c} large={large} />
          </Reveal>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------------------------------------- */

export function BenefitsBento({ benefits }: { benefits: SiteBenefit[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {benefits.map((b, i) => {
        const hero = i === 0;
        return (
          <Reveal key={b.id} delay={(i % 3) * 0.07} className={hero ? 'md:col-span-2 lg:row-span-2' : ''}>
            <GlassCard className={`flex h-full flex-col rounded-[30px] ${hero ? 'min-h-[300px] p-8 sm:p-10 lg:min-h-[100%]' : 'p-7'}`}>
              {hero ? (
                <div className="pointer-events-none absolute -right-20 -bottom-24 size-80 rounded-full bg-[radial-gradient(circle,rgb(212_252_24/0.22),transparent_60%)]" />
              ) : null}
              <span
                className={`grid place-items-center rounded-2xl ${
                  hero ? 'size-16 bg-[#d4fc18] text-[#0b0b0c] shadow-[0_16px_40px_-10px_rgb(212_252_24/0.55)]' : 'size-12 bg-white/[0.06] text-[#d4fc18]'
                }`}
              >
                <SiteIcon name={b.icon} size={hero ? 28 : 22} />
              </span>
              <h3 className={`font-display mt-auto pt-10 font-medium tracking-[-0.025em] text-white ${hero ? 'text-[28px] sm:text-[38px]' : 'text-[19px]'}`}>
                {b.title}
              </h3>
              <p className={`mt-3 leading-relaxed text-[#a8a8ac] ${hero ? 'max-w-md text-[16px] sm:text-[17px]' : 'text-[14.5px]'}`}>{b.description}</p>
            </GlassCard>
          </Reveal>
        );
      })}
    </div>
  );
}

export function ProcessSteps({ steps, heading }: { steps: SiteStep[]; heading: ReactNode }) {
  return (
    <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
      <div className="lg:sticky lg:top-32 lg:self-start">{heading}</div>
      <ol className="relative">
        <div className="absolute top-2 bottom-2 left-[27px] w-px bg-white/[0.08]" aria-hidden />
        <ScrollLine vertical className="absolute top-2 bottom-2 left-[27px] w-px" />
        {steps.map((s, i) => (
          <Reveal as="li" key={s.id} className="relative flex gap-6 pb-10 last:pb-0 sm:gap-8">
            <span className="lg font-display relative z-10 grid size-14 shrink-0 place-items-center rounded-full text-[15px] font-medium text-[#d4fc18] tabular">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="pt-3">
              <h3 className="font-display text-[20px] font-medium tracking-[-0.02em] text-white sm:text-[22px]">{s.title}</h3>
              <p className="mt-2 max-w-md text-[15px] leading-relaxed text-[#a8a8ac]">{s.description}</p>
            </div>
          </Reveal>
        ))}
      </ol>
    </div>
  );
}

/* --------------------------------------------------------------------------------------------- */

/** A partner's logo in its own colours (contain, never cropped); the name if there is no logo or it fails to load. */
export function PartnerLogo({ partner, muted = false }: { partner: Pick<SitePartner, 'name' | 'logoUrl'>; muted?: boolean }) {
  const name = <span className="font-display s-silver text-[18px] font-semibold tracking-[-0.02em]">{partner.name}</span>;
  if (!partner.logoUrl) return name;
  return (
    <div className="relative h-full w-full">
      <PartnerLogoImage src={partner.logoUrl} alt={partner.name} sizes="240px" muted={muted} fallback={<span className="absolute inset-0 grid place-items-center">{name}</span>} />
    </div>
  );
}

export function PartnerMarquee({ partners, title }: { partners: SitePartner[]; title?: string }) {
  if (!partners.length) return null;
  // Each half of the loop must be wider than the screen, so few partners repeat (≥ 12 cards per half).
  const items = Array.from({ length: Math.ceil(12 / partners.length) }, () => partners).flat();
  const row = [...items, ...items];
  return (
    <section className="relative py-14">
      {title ? <p className="mb-8 text-center text-[12px] font-semibold tracking-[0.18em] text-[#6e6e76] uppercase">{title}</p> : null}
      <div className="s-marquee-wrap s-fade-edges overflow-hidden">
        <div className="s-marquee gap-4" style={{ ['--s-marquee-duration' as string]: `${Math.max(30, items.length * 5)}s` }}>
          {row.map((p, i) => {
            // Only the first copy of each partner is reachable by keyboard / screen readers.
            const first = i < partners.length;
            return (
              <Link
                key={`${p.id}-${i}`}
                href={`/hamkorlar/${p.slug}`}
                aria-hidden={first ? undefined : true}
                tabIndex={first ? undefined : -1}
                aria-label={first ? `${p.name} — hamkorlik haqida` : undefined}
                className="lg group flex h-24 w-56 shrink-0 items-center justify-center rounded-3xl px-7 py-4 transition-transform duration-500 hover:-translate-y-0.5"
              >
                <PartnerLogo partner={p} />
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Partner cards; each opens the partner's own page with the whole story of the work. */
export function PartnerCards({ partners }: { partners: SitePartner[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {partners.map((p, i) => {
        const years = partnershipYears(p.sinceYear);
        return (
          <Reveal key={p.id} delay={(i % 3) * 0.07}>
            <Link href={`/hamkorlar/${p.slug}`} className="group block h-full" aria-label={`${p.name} — hamkorlik haqida batafsil`}>
              <GlassCard as="article" className="flex h-full flex-col rounded-[30px] p-6 transition-transform duration-700 group-hover:-translate-y-1 sm:p-7">
                <div className="flex h-24 items-center justify-center rounded-[22px] border border-white/[0.07] bg-white/[0.03] px-6 py-4">
                  <PartnerLogo partner={p} muted />
                </div>
                <div className="mt-6 flex flex-wrap items-center gap-2">
                  <h3 className="font-display mr-auto text-[19px] font-medium tracking-[-0.02em] text-white">{p.name}</h3>
                  {p.sinceYear ? (
                    <span className="rounded-full border border-[#d4fc18]/30 bg-[#d4fc18]/10 px-3 py-1 text-[12px] font-semibold text-[#d4fc18] tabular">
                      {p.sinceYear}-yildan{years ? ` · ${years} yil` : ''}
                    </span>
                  ) : null}
                </div>
                {p.industry ? <p className="mt-1 text-[13px] text-[#8e8e96]">{p.industry}</p> : null}
                {p.highlight ? (
                  <p className="mt-5 flex items-start gap-3 rounded-2xl border border-[#d4fc18]/15 bg-[#d4fc18]/[0.07] px-4 py-3 text-[14.5px] font-semibold text-[#e4f68f]">
                    <SiteIcon name="chart" size={18} className="mt-0.5 shrink-0 text-[#d4fc18]" strokeWidth={2} />
                    {p.highlight}
                  </p>
                ) : null}
                {p.description ? <p className="mt-4 line-clamp-3 text-[14.5px] leading-relaxed text-[#a8a8ac]">{p.description}</p> : null}
                <span className="mt-auto flex items-center justify-between gap-3 pt-6 text-[14px] font-medium text-white">
                  Hamkorlik haqida batafsil
                  <span className="grid size-10 place-items-center rounded-full bg-white/[0.07] transition-all duration-500 group-hover:-rotate-45 group-hover:bg-[#d4fc18] group-hover:text-[#0b0b0c]">
                    <SiteIcon name="arrowRight" size={16} strokeWidth={2} />
                  </span>
                </span>
              </GlassCard>
            </Link>
          </Reveal>
        );
      })}
    </div>
  );
}

/** "Hamkorlik tarixi": when, what and how it went — a vertical line that draws itself while scrolling. */
export function PartnerTimeline({ items }: { items: SitePartner['timeline'] }) {
  return (
    <ol className="relative">
      <div className="absolute top-2 bottom-2 left-[11px] w-px bg-white/[0.08]" aria-hidden />
      <ScrollLine vertical className="absolute top-2 bottom-2 left-[11px] w-px" />
      {items.map((item, i) => (
        <Reveal as="li" key={`${item.title}-${i}`} className="relative grid grid-cols-[24px_1fr] gap-5 pb-10 last:pb-0 sm:gap-7">
          <span className="relative z-10 mt-1.5 grid size-6 place-items-center rounded-full border border-[#d4fc18]/50 bg-[#0b0b0c]">
            <span className="size-2 rounded-full bg-[#d4fc18] shadow-[0_0_12px_#d4fc18]" />
          </span>
          <div>
            {item.period ? <p className="text-[12px] font-semibold tracking-[0.14em] text-[#d4fc18] uppercase">{item.period}</p> : null}
            <h3 className="font-display mt-1.5 text-[20px] font-medium tracking-[-0.02em] text-white sm:text-[22px]">{item.title}</h3>
            {item.text ? <p className="mt-2 max-w-2xl text-[15px] leading-relaxed whitespace-pre-line text-[#a8a8ac]">{item.text}</p> : null}
          </div>
        </Reveal>
      ))}
    </ol>
  );
}

export function Testimonials({ testimonials }: { testimonials: SiteTestimonial[] }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 pb-4 [scrollbar-width:none] sm:-mx-8 sm:px-8" data-lenis-prevent-wheel>
      <ul className="flex snap-x snap-mandatory gap-4">
        {testimonials.map((t, i) => (
          <Reveal as="li" key={t.id} delay={i * 0.06} className="w-[86vw] shrink-0 snap-start sm:w-[460px]">
            <GlassCard tilt={false} className="flex h-full flex-col rounded-[30px] p-7 sm:p-9">
              <span className="font-display text-[56px] leading-[0.6] text-[#d4fc18]">“</span>
              <blockquote className="mt-5 text-[17px] leading-relaxed text-[#e4e4e7] sm:text-[18px]">{t.quote}</blockquote>
              <div className="mt-auto flex items-center gap-4 pt-8">
                <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-white/[0.08] text-[14px] font-semibold text-white">
                  {t.avatarUrl ? (
                    <SiteImage
                      src={t.avatarUrl}
                      alt={t.authorName}
                      sizes="48px"
                      className="object-cover"
                      fallback={<span className="absolute inset-0 grid place-items-center">{initialsOf(t.authorName)}</span>}
                    />
                  ) : (
                    initialsOf(t.authorName)
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">{t.authorName}</p>
                  <p className="truncate text-[13px] text-[#8e8e96]">{[t.authorRole, t.partner?.name].filter(Boolean).join(' · ')}</p>
                </div>
                {t.partner?.logoUrl ? (
                  <div className="relative h-8 w-20 shrink-0">
                    <SiteImage src={t.partner.logoUrl} alt={t.partner.name} sizes="80px" className="object-contain opacity-85" />
                  </div>
                ) : null}
              </div>
            </GlassCard>
          </Reveal>
        ))}
      </ul>
    </div>
  );
}

/** "Where to next" links after a page (e.g. partners → about, tariffs). */
export function NextSteps({ links }: { links: ({ href: string; title: string; text: string } | null)[] }) {
  const items = links.filter((l): l is { href: string; title: string; text: string } => l !== null);
  if (!items.length) return null;
  return (
    <section className="pt-20 sm:pt-24">
      <Container className={`grid gap-4 ${items.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {items.map((l, i) => (
          <Reveal key={l.href} delay={i * 0.06}>
            <Link href={l.href} className="lg group flex items-center justify-between gap-6 rounded-[28px] p-7 transition-colors duration-500 hover:bg-white/[0.04] sm:p-8">
              <span>
                <span className="font-display block text-[22px] font-medium tracking-[-0.02em] text-white">{l.title}</span>
                <span className="mt-1.5 block text-[14.5px] text-[#a8a8ac]">{l.text}</span>
              </span>
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/[0.07] text-white transition-all duration-500 group-hover:-rotate-45 group-hover:bg-[#d4fc18] group-hover:text-[#0b0b0c]">
                <SiteIcon name="arrowRight" size={18} strokeWidth={2} />
              </span>
            </Link>
          </Reveal>
        ))}
      </Container>
    </section>
  );
}

/* --------------------------------------------------------------------------------------------- */

export function ContactCards({ settings }: { settings: SiteSettings }) {
  const phones = [settings.phone_primary, settings.phone_secondary].filter((p): p is string => !!p);
  const cards: { icon: string; label: string; body: ReactNode }[] = [];
  if (phones.length) {
    cards.push({
      icon: 'phone',
      label: 'Telefon',
      body: phones.map((p) => (
        <a key={p} href={`tel:${p}`} className="block tabular transition-colors hover:text-[#d4fc18]">
          {formatPhone(p)}
        </a>
      )),
    });
  }
  if (settings.email) {
    cards.push({
      icon: 'mail',
      label: 'Email',
      body: (
        <a href={`mailto:${settings.email}`} className="break-all transition-colors hover:text-[#d4fc18]">
          {settings.email}
        </a>
      ),
    });
  }
  if (settings.address) {
    cards.push({
      icon: 'pin',
      label: 'Manzil',
      body: (
        <>
          <span>{settings.address}</span>
          {settings.map_url ? (
            <a href={settings.map_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-[#d4fc18]">
              Xaritada ochish <SiteIcon name="arrowUpRight" size={14} strokeWidth={2} />
            </a>
          ) : null}
        </>
      ),
    });
  }
  if (settings.working_hours) cards.push({ icon: 'clock', label: 'Ish vaqti', body: settings.working_hours });
  if (!cards.length) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cards.map((c, i) => (
        <Reveal key={c.label} delay={i * 0.06}>
          <GlassCard className="flex h-full flex-col gap-5 rounded-[28px] p-7">
            <span className="grid size-12 place-items-center rounded-2xl bg-[#d4fc18]/10 text-[#d4fc18]">
              <SiteIcon name={c.icon} size={22} />
            </span>
            <div>
              <p className="text-[12px] font-semibold tracking-[0.14em] text-[#6e6e76] uppercase">{c.label}</p>
              <div className="mt-2 flex flex-col text-[17px] font-medium text-white">{c.body}</div>
            </div>
          </GlassCard>
        </Reveal>
      ))}
    </div>
  );
}

export function CtaSection({
  settings,
  budgets,
  source,
  title,
  subtitle,
}: {
  settings: SiteSettings;
  budgets: BudgetOption[];
  source: string;
  title?: string;
  subtitle?: string;
}) {
  const heading = title || settings.cta_title || settings.form_title;
  const text = subtitle || settings.cta_subtitle || settings.form_subtitle;
  return (
    <section id="ariza" className="relative scroll-mt-28 py-24 sm:py-32">
      <Container>
        <div className="lg relative overflow-hidden rounded-[40px] p-6 sm:p-10 lg:p-14">
          <div className="s-grid-lines pointer-events-none absolute inset-0 opacity-70" />
          <div className="pointer-events-none absolute -top-40 -left-32 size-[560px] rounded-full bg-[radial-gradient(circle,rgb(212_252_24/0.2),transparent_62%)]" />
          <div className="relative grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <div className="flex flex-col">
              <Reveal className="mb-6">
                <Eyebrow>{settings.form_title}</Eyebrow>
              </Reveal>
              <Reveal delay={0.05}>
                <h2 className="font-display s-silver text-[34px] leading-[1.06] font-medium tracking-[-0.035em] text-balance sm:text-[48px]">
                  <Accent text={heading} />
                </h2>
              </Reveal>
              {text ? (
                <Reveal delay={0.1}>
                  <p className="mt-5 max-w-md text-[16px] leading-relaxed text-[#a8a8ac] sm:text-[17px]">{text}</p>
                </Reveal>
              ) : null}
              <Reveal delay={0.12} className="mt-10">
                <ol className="space-y-3">
                  {['Arizangizni ko‘rib chiqamiz', 'Menejer siz bilan bog‘lanadi', 'Brendingiz uchun taklif tayyorlaymiz'].map((t, i) => (
                    <li key={t} className="flex items-center gap-4 text-[15px] text-[#d9d9de]">
                      <span className="font-display tabular grid size-9 shrink-0 place-items-center rounded-full border border-white/[0.1] bg-white/[0.04] text-[12px] text-[#d4fc18]">
                        {i + 1}
                      </span>
                      {t}
                    </li>
                  ))}
                </ol>
              </Reveal>
              <Reveal delay={0.15} className="mt-auto pt-10">
                <div className="flex flex-col gap-3">
                  {settings.phone_primary ? (
                    <a href={`tel:${settings.phone_primary}`} className="group inline-flex items-center gap-4 text-white">
                      <span className="grid size-12 place-items-center rounded-full bg-white/[0.07] text-[#d4fc18] transition-colors group-hover:bg-[#d4fc18] group-hover:text-[#0b0b0c]">
                        <SiteIcon name="phone" size={18} />
                      </span>
                      <span className="font-display tabular text-[20px] font-medium tracking-[-0.02em]">{formatPhone(settings.phone_primary)}</span>
                    </a>
                  ) : null}
                  {settings.telegram_url ? (
                    <a href={settings.telegram_url} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-4 text-white">
                      <span className="grid size-12 place-items-center rounded-full bg-white/[0.07] text-[#d4fc18] transition-colors group-hover:bg-[#d4fc18] group-hover:text-[#0b0b0c]">
                        <SiteIcon name="telegram" size={18} />
                      </span>
                      <span className="text-[16px] font-medium">Telegram orqali yozish</span>
                    </a>
                  ) : null}
                  <SocialRow settings={settings} className="mt-2" />
                </div>
              </Reveal>
            </div>
            <Reveal delay={0.1}>
              <div className="rounded-[30px] border border-white/[0.07] bg-[#0b0b0c]/55 p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)] sm:p-8">
                <ApplicationForm labels={settings} budgets={budgets} source={source} />
              </div>
            </Reveal>
          </div>
        </div>
      </Container>
    </section>
  );
}
