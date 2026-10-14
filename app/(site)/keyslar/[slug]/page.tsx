import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CaseCard } from '@/components/site/CaseCard';
import { CountUp, Reveal, SplitWords } from '@/components/site/motion';
import { Container, CtaSection, Eyebrow } from '@/components/site/sections';
import { SiteIcon } from '@/components/site/SiteIcon';
import { SiteImage } from '@/components/site/SiteImage';
import { getSiteContent, isPublished } from '@/lib/site/content';
import { budgetOptions } from '@/lib/site/types';

export const revalidate = 600;

export async function generateStaticParams() {
  const c = await getSiteContent();
  return c.cases.map((x) => ({ slug: x.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = await getSiteContent();
  const item = c.cases.find((x) => x.slug === slug);
  if (!item) return {};
  return {
    title: { absolute: `${item.title} — SUN MEDIA keysi` },
    description: item.summary,
    alternates: { canonical: `/keyslar/${item.slug}` },
    openGraph: { title: item.title, description: item.summary, url: `/keyslar/${item.slug}`, images: item.coverUrl ? [{ url: item.coverUrl }] : undefined },
  };
}

export default async function CasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await getSiteContent();
  if (!isPublished(c, 'cases')) notFound();
  const index = c.cases.findIndex((x) => x.slug === slug);
  if (index < 0) notFound();
  const item = c.cases[index];
  const next = c.cases.length > 1 ? c.cases[(index + 1) % c.cases.length] : null;
  const client = item.partner?.name || item.clientName;
  const facts = [
    client ? { label: 'Mijoz', value: client } : null,
    item.category ? { label: 'Yo‘nalish', value: item.category } : null,
    item.year ? { label: 'Yil', value: String(item.year) } : null,
  ].filter((f): f is { label: string; value: string } => f !== null);

  return (
    <>
      <section className="relative overflow-hidden pt-36 pb-12 sm:pt-44">
        <div className="s-grid-lines pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -top-40 right-[-10%] size-[620px] rounded-full bg-[radial-gradient(circle,rgb(212_252_24/0.14),transparent_62%)] blur-2xl" />
        <Container className="relative">
          <Reveal className="mb-6 flex flex-wrap items-center gap-3">
            <Link href="/keyslar" className="lg inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] text-[#d9d9de] hover:text-white">
              <SiteIcon name="arrowRight" size={14} className="rotate-180" /> Keyslar
            </Link>
            {item.category ? <Eyebrow>{item.category}</Eyebrow> : null}
          </Reveal>
          <SplitWords
            runs={[{ text: item.title, accent: false }]}
            className="font-display s-silver max-w-4xl text-[38px] leading-[1.05] font-medium tracking-[-0.04em] sm:text-[58px] lg:text-[70px]"
          />
          <Reveal delay={0.3}>
            <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-[#a8a8ac] sm:text-[19px]">{item.summary}</p>
          </Reveal>
          {facts.length ? (
            <Reveal delay={0.4} className="mt-10 flex flex-wrap gap-x-12 gap-y-4 border-t border-white/[0.07] pt-6">
              {facts.map((f) => (
                <div key={f.label}>
                  <p className="text-[12px] font-semibold tracking-[0.14em] text-[#6e6e76] uppercase">{f.label}</p>
                  <p className="mt-1.5 text-[16px] font-medium text-white">{f.value}</p>
                </div>
              ))}
            </Reveal>
          ) : null}
        </Container>
      </section>

      {item.coverUrl ? (
        <Container>
          <Reveal className="lg overflow-hidden rounded-[36px] p-2">
            <div className="relative aspect-[16/9] overflow-hidden rounded-[30px]">
              <SiteImage src={item.coverUrl} alt={item.title} priority sizes="(min-width: 1200px) 1150px, 100vw" className="object-cover" />
            </div>
          </Reveal>
        </Container>
      ) : null}

      {item.results.length ? (
        <section className="py-20">
          <Container>
            <div className={`grid gap-4 ${item.results.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
              {item.results.map((r, i) => (
                <Reveal key={r.label + i} delay={i * 0.06} className="lg rounded-[28px] p-7 sm:p-8">
                  <CountUp value={r.value} className="font-display block text-[44px] leading-none font-medium tracking-[-0.04em] text-[#d4fc18] sm:text-[56px]" />
                  <p className="mt-4 text-[15px] text-[#d9d9de]">{r.label}</p>
                </Reveal>
              ))}
            </div>
          </Container>
        </section>
      ) : null}

      {item.challenge || item.solution ? (
        <section className="py-16">
          <Container className="grid gap-5 md:grid-cols-2">
            {[
              { title: 'Vazifa', text: item.challenge },
              { title: 'Yechim', text: item.solution },
            ]
              .filter((b) => b.text)
              .map((b, i) => (
                <Reveal key={b.title} delay={i * 0.08} className="lg rounded-[30px] p-7 sm:p-10">
                  <p className="text-[12px] font-semibold tracking-[0.16em] text-[#d4fc18] uppercase">{b.title}</p>
                  <p className="mt-5 text-[16.5px] leading-relaxed whitespace-pre-line text-[#d9d9de]">{b.text}</p>
                </Reveal>
              ))}
          </Container>
        </section>
      ) : null}

      {item.gallery.length ? (
        <section className="py-16">
          <Container className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            {item.gallery.map((src, i) => (
              <Reveal key={src} delay={(i % 3) * 0.06} className={`lg overflow-hidden rounded-[24px] p-1.5 ${i % 5 === 0 ? 'col-span-2 lg:col-span-1 lg:row-span-2' : ''}`}>
                <div className={`relative overflow-hidden rounded-[19px] ${i % 5 === 0 ? 'aspect-[4/5] h-full' : 'aspect-square'}`}>
                  <SiteImage src={src} alt={`${item.title} — ${i + 1}`} sizes="(min-width: 1024px) 380px, 50vw" className="object-cover transition-transform duration-1000 hover:scale-105" />
                </div>
              </Reveal>
            ))}
          </Container>
        </section>
      ) : null}

      {item.videoUrl ? (
        <Container className="py-6">
          <a
            href={item.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="lg group flex items-center justify-between gap-6 rounded-[28px] px-7 py-6 transition-colors hover:bg-white/[0.04]"
          >
            <span className="flex items-center gap-4">
              <span className="grid size-14 place-items-center rounded-full bg-[#d4fc18] text-[#0b0b0c] shadow-[0_12px_40px_-8px_rgb(212_252_24/0.6)]">
                <SiteIcon name="play" size={20} />
              </span>
              <span className="text-[17px] font-medium text-white">Videoni ko‘rish</span>
            </span>
            <SiteIcon name="arrowUpRight" size={22} className="text-[#a8a8ac] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </a>
        </Container>
      ) : null}

      {next && next.id !== item.id ? (
        <section className="py-20">
          <Container>
            <p className="mb-6 text-[12px] font-semibold tracking-[0.16em] text-[#6e6e76] uppercase">Keyingi keys</p>
            <div className="max-w-xl">
              <CaseCard item={next} />
            </div>
          </Container>
        </section>
      ) : null}

      <CtaSection settings={c.settings} budgets={budgetOptions(c.plans)} source={`/keyslar/${item.slug}`} />
    </>
  );
}
