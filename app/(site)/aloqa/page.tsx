import { notFound } from 'next/navigation';

import { ApplicationForm } from '@/components/site/ApplicationForm';
import { Reveal } from '@/components/site/motion';
import { ContactCards, Container, PageHero } from '@/components/site/sections';
import { SocialRow } from '@/components/site/SiteFooter';
import { getSiteContent, isPublished, pageMetadata, pageOf } from '@/lib/site/content';

export const revalidate = 600;
export const generateMetadata = () => pageMetadata('contact');

export default async function ContactPage() {
  const c = await getSiteContent();
  const page = pageOf(c, 'contact');
  if (!page || !isPublished(c, 'contact')) notFound();
  const s = c.settings;
  const hasContacts = !!(s.phone_primary || s.phone_secondary || s.email || s.address || s.working_hours);

  return (
    <>
      <PageHero eyebrow={page.nav_label} title={page.title} subtitle={page.subtitle} />
      <section id="ariza" className="scroll-mt-28 pb-24">
        <Container className={`grid gap-6 ${hasContacts ? 'lg:grid-cols-[0.85fr_1.15fr]' : ''}`}>
          {hasContacts ? (
            <div className="flex flex-col gap-4">
              <ContactCards settings={s} />
              <SocialRow settings={s} className="mt-2" />
            </div>
          ) : null}
          <Reveal>
            <div className={`lg relative overflow-hidden rounded-[36px] p-6 sm:p-10 ${hasContacts ? '' : 'mx-auto max-w-3xl'}`}>
              <div className="pointer-events-none absolute -top-40 -right-32 size-[460px] rounded-full bg-[radial-gradient(circle,rgb(212_252_24/0.16),transparent_62%)]" />
              <div className="relative">
                <h2 className="font-display s-silver text-[28px] leading-tight font-medium tracking-[-0.03em] sm:text-[36px]">{s.form_title}</h2>
                {s.form_subtitle ? <p className="mt-3 mb-8 text-[15.5px] text-[#a8a8ac]">{s.form_subtitle}</p> : <div className="mb-8" />}
                <ApplicationForm labels={s} services={c.services.map((x) => x.title)} source={page.path} />
              </div>
            </div>
          </Reveal>
        </Container>
      </section>
    </>
  );
}
