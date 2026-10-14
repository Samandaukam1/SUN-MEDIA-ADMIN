import { notFound } from 'next/navigation';

import { ApplyButton } from '@/components/site/ApplyButton';
import { Container, CtaSection, NextSteps, PageHero, PartnerCards, SectionHeading, StatsGrid, Testimonials } from '@/components/site/sections';
import { getSiteContent, isPublished, pageMetadata, pageOf, sectionOf } from '@/lib/site/content';
import { budgetOptions } from '@/lib/site/types';

export const revalidate = 600;
export const generateMetadata = () => pageMetadata('partners');

export default async function PartnersPage() {
  const c = await getSiteContent();
  const page = pageOf(c, 'partners');
  if (!page || !isPublished(c, 'partners')) notFound();
  const reviews = sectionOf(c, 'testimonials');

  return (
    <>
      <PageHero eyebrow={page.nav_label} title={page.title} subtitle={page.subtitle} orb="partners" orbLogos={c.partners.filter((p) => p.logoUrl).map((p) => p.logoUrl!)} />
      {c.stats.length ? (
        <section className="pb-20">
          <Container>
            <StatsGrid stats={c.stats} />
          </Container>
        </section>
      ) : null}
      {c.partners.length ? (
        <section className="pb-4">
          <Container>
            <PartnerCards partners={c.partners} />
          </Container>
        </section>
      ) : (
        <Container>
          <div className="lg flex flex-col items-center rounded-[36px] px-6 py-20 text-center">
            <p className="font-display s-silver text-[28px] font-medium tracking-[-0.03em] sm:text-[36px]">Hamkorlarimiz ro‘yxati tayyorlanmoqda</p>
            <p className="mt-4 max-w-md text-[16px] text-[#a8a8ac]">Brendingiz uchun nima qila olishimizni bilmoqchimisiz? Ariza qoldiring.</p>
            <div className="mt-8">
              <ApplyButton label={c.settings.form_button_label} />
            </div>
          </div>
        </Container>
      )}
      <NextSteps
        links={[
          isPublished(c, 'about') ? { href: '/biz-haqimizda', title: 'Biz haqimizda', text: 'Jamoa, jarayon va qadriyatlarimiz.' } : null,
          isPublished(c, 'plans') ? { href: '/tariflar', title: 'Tariflar', text: 'Xizmatlar tarkibi va narxlari.' } : null,
        ]}
      />
      {c.testimonials.length ? (
        <section className="py-24 sm:py-32">
          <Container>
            <SectionHeading eyebrow={reviews?.eyebrow || 'Fikrlar'} title={reviews?.title || 'Hamkorlarimiz nima deydi'} subtitle={reviews?.subtitle || undefined} />
            <Testimonials testimonials={c.testimonials} />
          </Container>
        </section>
      ) : null}
      <CtaSection settings={c.settings} budgets={budgetOptions(c.plans)} source={page.path} />
    </>
  );
}
