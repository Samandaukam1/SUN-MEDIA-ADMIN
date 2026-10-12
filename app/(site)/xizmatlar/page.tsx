import { notFound } from 'next/navigation';

import { FaqList } from '@/components/site/FaqList';
import { Container, CtaSection, PageHero, ProcessSteps, SectionHeading, ServiceRows } from '@/components/site/sections';
import { getSiteContent, isPublished, pageMetadata, pageOf, sectionOf } from '@/lib/site/content';

export const revalidate = 600;
export const generateMetadata = () => pageMetadata('services');

export default async function ServicesPage() {
  const c = await getSiteContent();
  const page = pageOf(c, 'services');
  if (!page || !isPublished(c, 'services')) notFound();
  const process = sectionOf(c, 'process');
  const faq = sectionOf(c, 'faq');

  return (
    <>
      <PageHero eyebrow={page.nav_label} title={page.title} subtitle={page.subtitle} />
      {c.services.length ? (
        <section className="pb-24">
          <Container>
            <ServiceRows services={c.services} />
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
      {c.faqs.length ? (
        <section className="py-24 sm:py-32">
          <Container>
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
              <SectionHeading eyebrow={faq?.eyebrow || 'Savollar'} title={faq?.title || 'Ko‘p beriladigan savollar'} />
              <FaqList faqs={c.faqs} />
            </div>
          </Container>
        </section>
      ) : null}
      <CtaSection settings={c.settings} services={c.services.map((s) => s.title)} source={page.path} />
    </>
  );
}
