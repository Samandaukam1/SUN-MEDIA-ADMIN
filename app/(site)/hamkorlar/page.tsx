import { notFound } from 'next/navigation';

import { ApplyButton } from '@/components/site/ApplyButton';
import { Container, CtaSection, PageHero, PaperSection, PartnerCards, SectionHeading, StatsGrid, Testimonials } from '@/components/site/sections';
import { getSiteContent, isPublished, pageMetadata, pageOf, sectionOf } from '@/lib/site/content';

export const revalidate = 600;
export const generateMetadata = () => pageMetadata('partners');

export default async function PartnersPage() {
  const c = await getSiteContent();
  const page = pageOf(c, 'partners');
  if (!page || !isPublished(c, 'partners')) notFound();
  const reviews = sectionOf(c, 'testimonials');

  return (
    <>
      <PageHero eyebrow={page.nav_label} title={page.title} subtitle={page.subtitle} />
      {c.stats.length ? (
        <section className="pb-20">
          <Container>
            <StatsGrid stats={c.stats} />
          </Container>
        </section>
      ) : null}
      {c.partners.length ? (
        <PaperSection>
          <Container>
            <PartnerCards partners={c.partners} />
          </Container>
        </PaperSection>
      ) : (
        <Container>
          <div className="lg flex flex-col items-center rounded-[36px] px-6 py-20 text-center">
            <p className="font-display s-silver text-[28px] font-medium tracking-[-0.03em] sm:text-[36px]">Hamkorlarimiz ro‘yxati tayyorlanmoqda</p>
            <p className="mt-4 max-w-md text-[16px] text-[#a8a8ac]">Brendingiz uchun nima qila olishimizni bilmoqchimisiz? Ariza qoldiring.</p>
            <div className="mt-8">
              <ApplyButton label={c.settings.primary_cta_label} />
            </div>
          </div>
        </Container>
      )}
      {c.testimonials.length ? (
        <section className="py-24 sm:py-32">
          <Container>
            <SectionHeading eyebrow={reviews?.eyebrow || 'Fikrlar'} title={reviews?.title || 'Hamkorlarimiz nima deydi'} subtitle={reviews?.subtitle || undefined} />
            <Testimonials testimonials={c.testimonials} />
          </Container>
        </section>
      ) : null}
      <CtaSection settings={c.settings} services={c.services.map((s) => s.title)} source={page.path} />
    </>
  );
}
