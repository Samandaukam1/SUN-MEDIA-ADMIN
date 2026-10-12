import type { ReactNode } from 'react';

import { FaqList } from '@/components/site/FaqList';
import { Hero } from '@/components/site/hero/Hero';
import {
  BenefitsBento,
  CasesGrid,
  Container,
  CtaSection,
  PaperSection,
  PartnerCards,
  PartnerMarquee,
  ProcessSteps,
  SectionHeading,
  ServiceMarquee,
  ServicesGrid,
  StatsGrid,
  Testimonials,
  TextLink,
} from '@/components/site/sections';
import { getSiteContent, isPublished } from '@/lib/site/content';
import type { SiteContent, SiteSection } from '@/lib/site/types';

export const revalidate = 600;

function Band({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <section id={id} className="relative scroll-mt-24 py-24 sm:py-32">
      <Container>{children}</Container>
    </section>
  );
}

function block(section: SiteSection, c: SiteContent): ReactNode {
  const heading = (action?: ReactNode, tone: 'dark' | 'light' = 'dark') => (
    <SectionHeading eyebrow={section.eyebrow || undefined} title={section.title} subtitle={section.subtitle || undefined} action={action} tone={tone} />
  );
  switch (section.key) {
    case 'marquee':
      return <PartnerMarquee partners={c.partners} title={section.title || undefined} />;
    case 'stats':
      return c.stats.length ? (
        <Band>
          {section.title ? heading() : null}
          <StatsGrid stats={c.stats} />
        </Band>
      ) : null;
    case 'services':
      return c.services.length ? (
        <Band id="xizmatlar">
          {heading(isPublished(c, 'services') ? <TextLink href="/xizmatlar">Barcha xizmatlar</TextLink> : undefined)}
          <ServicesGrid services={c.services} />
        </Band>
      ) : null;
    case 'cases': {
      if (!c.cases.length || !isPublished(c, 'cases')) return null;
      const featured = c.cases.filter((x) => x.isFeatured);
      const shown = (featured.length ? featured : c.cases).slice(0, 5);
      return (
        <Band>
          {heading(<TextLink href="/keyslar">Barcha keyslar</TextLink>)}
          <CasesGrid cases={shown} />
        </Band>
      );
    }
    case 'benefits':
      return c.benefits.length ? (
        <Band>
          {heading()}
          <BenefitsBento benefits={c.benefits} />
        </Band>
      ) : null;
    case 'process':
      return c.steps.length ? (
        <Band>
          <ProcessSteps steps={c.steps} heading={heading()} />
        </Band>
      ) : null;
    case 'partners':
      return c.partners.length ? (
        <PaperSection>
          <Container>
            {heading(isPublished(c, 'partners') ? <TextLink href="/hamkorlar" tone="light">Barcha hamkorlar</TextLink> : undefined, 'light')}
            <PartnerCards partners={c.partners.slice(0, 6)} />
          </Container>
        </PaperSection>
      ) : null;
    case 'testimonials':
      return c.testimonials.length ? (
        <Band>
          {heading()}
          <Testimonials testimonials={c.testimonials} />
        </Band>
      ) : null;
    case 'faq':
      return c.faqs.length ? (
        <Band>
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <div>{heading()}</div>
            <FaqList faqs={c.faqs} />
          </div>
        </Band>
      ) : null;
    case 'cta':
      return <CtaSection settings={c.settings} services={c.services.map((s) => s.title)} source="/" title={section.title} subtitle={section.subtitle} />;
  }
}

export default async function HomePage() {
  const c = await getSiteContent();
  const secondary =
    c.cases.length && isPublished(c, 'cases')
      ? { href: '/keyslar', label: c.settings.secondary_cta_label }
      : c.services.length && isPublished(c, 'services')
        ? { href: '/xizmatlar', label: 'Xizmatlar' }
        : null;
  const sections = c.sections.filter((s) => s.is_visible);

  return (
    <>
      <Hero settings={{ ...c.settings, secondary_cta_label: secondary?.label ?? c.settings.secondary_cta_label }} secondaryHref={secondary?.href ?? null} />
      <ServiceMarquee words={c.services.map((s) => s.title)} />
      {sections.map((s) => (
        <div key={s.key}>{block(s, c)}</div>
      ))}
    </>
  );
}
