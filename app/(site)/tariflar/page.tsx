import { notFound } from 'next/navigation';

import { ApplyButton } from '@/components/site/ApplyButton';
import { PlansGrid } from '@/components/site/PlansGrid';
import { Container, CtaSection, PageHero } from '@/components/site/sections';
import { getSiteContent, isPublished, pageMetadata, pageOf } from '@/lib/site/content';

export const revalidate = 600;
export const generateMetadata = () => pageMetadata('plans');

export default async function PlansPage() {
  const c = await getSiteContent();
  const page = pageOf(c, 'plans');
  if (!page || !isPublished(c, 'plans')) notFound();

  return (
    <>
      <PageHero eyebrow={page.nav_label} title={page.title} subtitle={page.subtitle} orb="plans" />
      <section className="pb-12">
        <Container>
          {c.plans.length ? (
            <>
              <PlansGrid plans={c.plans} />
              <p className="mt-8 text-center text-[14px] text-[#8e8e96]">
                Tarif tarkibini brendingiz ehtiyojiga moslashtirish mumkin — ariza qoldiring, menejerimiz bog‘lanadi.
              </p>
            </>
          ) : (
            <div className="lg flex flex-col items-center rounded-[36px] px-6 py-20 text-center">
              <p className="font-display s-silver text-[28px] font-medium tracking-[-0.03em] sm:text-[36px]">Tariflar tez orada e’lon qilinadi</p>
              <p className="mt-4 max-w-md text-[16px] text-[#a8a8ac]">
                Narx xizmatlar tarkibi va hajmiga qarab belgilanadi. Ariza qoldiring — brendingiz uchun taklif tayyorlaymiz.
              </p>
              <div className="mt-8">
                <ApplyButton label={c.settings.form_button_label} />
              </div>
            </div>
          )}
        </Container>
      </section>
      <CtaSection settings={c.settings} services={c.services.map((s) => s.title)} source={page.path} />
    </>
  );
}
