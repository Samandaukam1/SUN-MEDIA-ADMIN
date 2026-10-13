import { notFound } from 'next/navigation';

import { Logo } from '@/components/brand/Logo';
import { GlassCard, Reveal } from '@/components/site/motion';
import { BenefitsBento, Container, CtaSection, PageHero, ProcessSteps, SectionHeading, StatsGrid } from '@/components/site/sections';
import { getSiteContent, isPublished, pageMetadata, pageOf, sectionOf } from '@/lib/site/content';

export const revalidate = 600;
export const generateMetadata = () => pageMetadata('about');

export default async function AboutPage() {
  const c = await getSiteContent();
  const page = pageOf(c, 'about');
  if (!page || !isPublished(c, 'about')) notFound();
  const benefits = sectionOf(c, 'benefits');
  const process = sectionOf(c, 'process');
  const paragraphs = c.settings.about_body.split(/\n{2,}/).filter(Boolean);

  return (
    <>
      <PageHero eyebrow={page.nav_label} title={page.title} subtitle={page.subtitle} orb="about" />

      {c.settings.about_title || paragraphs.length ? (
        <section className="pb-24">
          <Container className="grid items-stretch gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <Reveal>
              <GlassCard tilt={false} className="h-full rounded-[36px] p-8 sm:p-12">
                {c.settings.about_title ? (
                  <h2 className="font-display s-silver text-[30px] leading-[1.1] font-medium tracking-[-0.035em] sm:text-[42px]">{c.settings.about_title}</h2>
                ) : null}
                <div className="mt-6 space-y-5 text-[16.5px] leading-relaxed text-[#b4b4ba] sm:text-[18px]">
                  {paragraphs.map((p) => (
                    <p key={p.slice(0, 32)}>{p}</p>
                  ))}
                </div>
              </GlassCard>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="relative flex h-full min-h-[320px] items-center justify-center overflow-hidden rounded-[36px] bg-[#0b0b0c] p-10 shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]">
                <div className="s-grid-lines absolute inset-0" />
                <div className="absolute size-[420px] rounded-full bg-[radial-gradient(circle,rgb(212_252_24/0.18),transparent_62%)]" />
                <div className="s-hero-fallback relative w-full max-w-[340px]">
                  <Logo width={340} onDark className="h-auto w-full drop-shadow-[0_30px_50px_rgb(0_0_0/0.6)]" />
                </div>
              </div>
            </Reveal>
          </Container>
        </section>
      ) : null}

      {c.stats.length ? (
        <section className="pb-24">
          <Container>
            <StatsGrid stats={c.stats} />
          </Container>
        </section>
      ) : null}

      {c.benefits.length ? (
        <section className="py-24 sm:py-32">
          <Container>
            <SectionHeading eyebrow={benefits?.eyebrow || undefined} title={benefits?.title || 'Nega SUN MEDIA'} subtitle={benefits?.subtitle || undefined} />
            <BenefitsBento benefits={c.benefits} />
          </Container>
        </section>
      ) : null}

      {c.steps.length ? (
        <section className="py-24 sm:py-32">
          <Container>
            <ProcessSteps
              steps={c.steps}
              heading={<SectionHeading eyebrow={process?.eyebrow || 'Jarayon'} title={process?.title || 'Qanday ishlaymiz'} subtitle={process?.subtitle || undefined} />}
            />
          </Container>
        </section>
      ) : null}

      <CtaSection settings={c.settings} services={c.services.map((s) => s.title)} source={page.path} />
    </>
  );
}
