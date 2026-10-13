import { notFound } from 'next/navigation';

import { ApplyButton } from '@/components/site/ApplyButton';
import { CaseFilter } from '@/components/site/CaseFilter';
import { Container, CtaSection, PageHero } from '@/components/site/sections';
import { getSiteContent, isPublished, pageMetadata, pageOf } from '@/lib/site/content';

export const revalidate = 600;
export const generateMetadata = () => pageMetadata('cases');

export default async function CasesPage() {
  const c = await getSiteContent();
  const page = pageOf(c, 'cases');
  if (!page || !isPublished(c, 'cases')) notFound();

  return (
    <>
      <PageHero eyebrow={page.nav_label} title={page.title} subtitle={page.subtitle} />
      <section className="pb-12">
        <Container>
          {c.cases.length ? (
            <CaseFilter cases={c.cases} />
          ) : (
            <div className="lg flex flex-col items-center rounded-[36px] px-6 py-20 text-center">
              <p className="font-display s-silver text-[28px] font-medium tracking-[-0.03em] sm:text-[36px]">Keyslar tez orada shu yerda</p>
              <p className="mt-4 max-w-md text-[16px] text-[#a8a8ac]">Hozircha loyihalarimizni shaxsan ko‘rsatamiz — ariza qoldiring, namunalarni yuboramiz.</p>
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
