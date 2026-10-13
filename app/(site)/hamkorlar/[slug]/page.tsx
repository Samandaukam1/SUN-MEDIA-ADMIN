import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { GalleryLightbox } from '@/components/site/GalleryLightbox';
import { CountUp, GlassCard, Reveal, SplitWords } from '@/components/site/motion';
import {
  CasesGrid,
  Container,
  CtaSection,
  Eyebrow,
  PartnerLogo,
  PartnerTimeline,
  SectionHeading,
  Testimonials,
} from '@/components/site/sections';
import { SiteIcon } from '@/components/site/SiteIcon';
import { SiteImage } from '@/components/site/SiteImage';
import { getSiteContent, isPublished } from '@/lib/site/content';
import { partnershipYears } from '@/lib/site/types';

export const revalidate = 600;

export async function generateStaticParams() {
  const c = await getSiteContent();
  return c.partners.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = await getSiteContent();
  const p = c.partners.find((x) => x.slug === slug);
  if (!p) return {};
  const description = p.description || p.highlight || `${p.name} va SUN MEDIA hamkorligi`;
  const image = p.coverUrl ?? p.logoUrl;
  return {
    title: { absolute: `${p.name} — SUN MEDIA hamkori` },
    description,
    alternates: { canonical: `/hamkorlar/${p.slug}` },
    openGraph: { title: `${p.name} — SUN MEDIA hamkori`, description, url: `/hamkorlar/${p.slug}`, images: image ? [{ url: image }] : undefined },
  };
}

export default async function PartnerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await getSiteContent();
  if (!isPublished(c, 'partners')) notFound();
  const p = c.partners.find((x) => x.slug === slug);
  if (!p) notFound();

  const years = partnershipYears(p.sinceYear);
  const cases = c.cases.filter((x) => x.partner?.id === p.id);
  const reviews = c.testimonials.filter((t) => t.partner?.id === p.id);
  const others = c.partners.filter((x) => x.id !== p.id).slice(0, 6);
  const story = p.story.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
  const facts = [
    p.sinceYear ? { label: 'Hamkorlik boshlangan', value: `${p.sinceYear}-yil` } : null,
    years ? { label: 'Birga', value: `${years} yil` } : null,
    p.industry ? { label: 'Yo‘nalish', value: p.industry } : null,
    cases.length ? { label: 'Loyihalar', value: `${cases.length} ta keys` } : null,
  ].filter((f): f is { label: string; value: string } => f !== null);

  return (
    <>
      <section className="relative overflow-hidden pt-36 pb-16 sm:pt-44 sm:pb-20">
        <div className="s-grid-lines pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -top-40 right-[-10%] size-[640px] rounded-full bg-[radial-gradient(circle,rgb(212_252_24/0.15),transparent_62%)] blur-2xl" />
        <Container className="relative">
          <Reveal className="mb-8 flex flex-wrap items-center gap-3" y={12}>
            <Link href="/hamkorlar" className="lg inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] text-[#d9d9de] hover:text-white">
              <SiteIcon name="arrowRight" size={14} className="rotate-180" /> Hamkorlar
            </Link>
            <Eyebrow>{p.industry || 'Hamkor'}</Eyebrow>
          </Reveal>
          <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
            <div>
              <SplitWords
                runs={[{ text: p.name, accent: false }]}
                className="font-display s-silver text-[44px] leading-[1.02] font-medium tracking-[-0.045em] sm:text-[64px] lg:text-[80px]"
              />
              {p.highlight ? (
                <Reveal delay={0.3} y={12}>
                  <p className="mt-7 inline-flex items-start gap-3 rounded-2xl border border-[#d4fc18]/20 bg-[#d4fc18]/[0.08] px-4 py-3 text-[15px] font-semibold text-[#e4f68f]">
                    <SiteIcon name="chart" size={18} className="mt-0.5 shrink-0 text-[#d4fc18]" strokeWidth={2} />
                    {p.highlight}
                  </p>
                </Reveal>
              ) : null}
              {p.description ? (
                <Reveal delay={0.38} y={12}>
                  <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-[#a8a8ac] sm:text-[18px]">{p.description}</p>
                </Reveal>
              ) : null}
              {p.websiteUrl ? (
                <Reveal delay={0.45} y={12} className="mt-8">
                  <a href={p.websiteUrl} target="_blank" rel="noopener noreferrer" className="s-btn s-btn-glass lg">
                    {p.name} sahifasi <SiteIcon name="arrowUpRight" size={16} strokeWidth={2} />
                  </a>
                </Reveal>
              ) : null}
            </div>
            <Reveal delay={0.2}>
              <GlassCard className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[36px] p-10 sm:p-14">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgb(212_252_24/0.12),transparent_60%)]" />
                <div className="relative h-full w-full">
                  <PartnerLogo partner={p} />
                </div>
              </GlassCard>
            </Reveal>
          </div>

          {facts.length ? (
            <Reveal delay={0.1} className={`mt-14 grid gap-px overflow-hidden rounded-[24px] border border-white/[0.07] bg-white/[0.07] ${facts.length >= 4 ? 'grid-cols-2 lg:grid-cols-4' : facts.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
              {facts.map((f) => (
                <div key={f.label} className="bg-[#0b0b0c] px-6 py-5">
                  <p className="text-[12px] font-semibold tracking-[0.14em] text-[#6e6e76] uppercase">{f.label}</p>
                  <p className="font-display mt-2 text-[20px] font-medium tracking-[-0.02em] text-white">{f.value}</p>
                </div>
              ))}
            </Reveal>
          ) : null}
        </Container>
      </section>

      {p.coverUrl ? (
        <Container>
          <Reveal className="lg overflow-hidden rounded-[36px] p-2">
            <div className="relative aspect-[16/9] overflow-hidden rounded-[30px]">
              <SiteImage src={p.coverUrl} alt={`${p.name} — SUN MEDIA bilan`} priority sizes="(min-width: 1200px) 1150px, 100vw" className="object-cover" />
            </div>
          </Reveal>
        </Container>
      ) : null}

      {p.results.length ? (
        <section className="py-20">
          <Container>
            <div className={`grid gap-4 ${p.results.length >= 4 ? 'grid-cols-2 lg:grid-cols-4' : p.results.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
              {p.results.map((r, i) => (
                <Reveal key={`${r.label}-${i}`} delay={i * 0.06}>
                  <GlassCard className="h-full rounded-[28px] p-7 sm:p-8">
                    <CountUp value={r.value} className="font-display block text-[42px] leading-none font-medium tracking-[-0.04em] text-[#d4fc18] sm:text-[54px]" />
                    <p className="mt-4 text-[15px] text-[#d9d9de]">{r.label}</p>
                  </GlassCard>
                </Reveal>
              ))}
            </div>
          </Container>
        </section>
      ) : null}

      {story.length || p.services.length ? (
        <section className="py-16 sm:py-20">
          <Container className={`grid gap-5 ${story.length && p.services.length ? 'lg:grid-cols-[1.25fr_0.75fr]' : ''}`}>
            {story.length ? (
              <Reveal>
                <GlassCard tilt={false} className="h-full rounded-[32px] p-7 sm:p-10">
                  <p className="text-[12px] font-semibold tracking-[0.16em] text-[#d4fc18] uppercase">Hamkorlik haqida</p>
                  <div className="mt-6 space-y-5 text-[16.5px] leading-relaxed text-[#d9d9de] sm:text-[17.5px]">
                    {story.map((para, i) => (
                      <p key={i} className="whitespace-pre-line">
                        {para}
                      </p>
                    ))}
                  </div>
                </GlassCard>
              </Reveal>
            ) : null}
            {p.services.length ? (
              <Reveal delay={0.08}>
                <GlassCard tilt={false} className="h-full rounded-[32px] p-7 sm:p-10">
                  <p className="text-[12px] font-semibold tracking-[0.16em] text-[#d4fc18] uppercase">Nimalar qildik</p>
                  <ul className="mt-6 space-y-3">
                    {p.services.map((item) => (
                      <li key={item} className="flex items-start gap-3 text-[15.5px] text-[#e4e4e7]">
                        <span className="mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full bg-[#d4fc18]/12 text-[#d4fc18]">
                          <SiteIcon name="check" size={13} strokeWidth={2.4} />
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              </Reveal>
            ) : null}
          </Container>
        </section>
      ) : null}

      {p.timeline.length ? (
        <section className="py-20 sm:py-24">
          <Container className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div className="lg:sticky lg:top-32 lg:self-start">
              <SectionHeading eyebrow="Hamkorlik tarixi" title={`${p.name} bilan yo‘limiz`} subtitle="Qachon nima qildik va qanday natijaga erishdik." />
            </div>
            <PartnerTimeline items={p.timeline} />
          </Container>
        </section>
      ) : null}

      {p.gallery.length ? (
        <section className="py-20 sm:py-24">
          <Container>
            <SectionHeading eyebrow="Syomkalardan" title="Kadrlar" subtitle="Rasmni bosing — katta ko‘rinishda ochiladi." />
            <GalleryLightbox images={p.gallery} title={p.name} />
          </Container>
        </section>
      ) : null}

      {cases.length ? (
        <section className="py-20 sm:py-24">
          <Container>
            <SectionHeading eyebrow="Keyslar" title="Birga qilgan loyihalarimiz" />
            <CasesGrid cases={cases} />
          </Container>
        </section>
      ) : null}

      {reviews.length ? (
        <section className="py-20 sm:py-24">
          <Container>
            <SectionHeading eyebrow="Fikr" title={`${p.name} nima deydi`} />
            <Testimonials testimonials={reviews} />
          </Container>
        </section>
      ) : null}

      {others.length ? (
        <section className="py-16">
          <Container>
            <p className="mb-6 text-[12px] font-semibold tracking-[0.16em] text-[#6e6e76] uppercase">Boshqa hamkorlar</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {others.map((o) => (
                <Link key={o.id} href={`/hamkorlar/${o.slug}`} className="lg group flex flex-col items-center gap-3 rounded-[22px] px-4 py-5 transition-transform duration-500 hover:-translate-y-0.5">
                  <span className="relative block h-12 w-full">
                    <PartnerLogo partner={o} />
                  </span>
                  <span className="text-[13px] font-medium text-[#d9d9de] group-hover:text-white">{o.name}</span>
                </Link>
              ))}
            </div>
          </Container>
        </section>
      ) : null}

      <CtaSection settings={c.settings} services={c.services.map((s) => s.title)} source={`/hamkorlar/${p.slug}`} />
    </>
  );
}
