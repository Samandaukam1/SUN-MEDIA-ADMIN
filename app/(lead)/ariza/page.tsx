import type { Metadata } from 'next';

import { AdLanding } from '@/components/site/AdLanding';
import { getSiteContent } from '@/lib/site/content';
import { budgetOptions } from '@/lib/site/types';

export const metadata: Metadata = {
  title: 'Ariza qoldiring — SUN MEDIA',
  description: 'Ma’lumotlaringizni qoldiring, mutaxassislarimiz siz bilan tez orada bog‘lanishadi.',
  // An ad landing page: reached from the ad, not from search.
  robots: { index: false, follow: false },
  alternates: { canonical: '/ariza' },
};

/** The application page for Instagram and Meta ads: the site's own "Ariza qoldirish" form, nothing else. */
export default async function ApplicationPage() {
  const { settings, plans } = await getSiteContent();
  // Sun Media's own Instagram, only when it is an instagram.com address: where the visitor goes back to.
  const instagram = /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._/-]*$/.test(settings.instagram_url ?? '') ? settings.instagram_url! : 'https://www.instagram.com/';
  return (
    <AdLanding
      labels={{
        ...settings,
        form_title: 'Ariza qoldiring',
        form_subtitle: 'Ma’lumotlaringizni qoldiring, mutaxassislarimiz siz bilan tez orada bog‘lanishadi.',
        form_button_label: 'Yuborish',
        form_success_title: 'Arizangiz qabul qilindi!',
        form_success_text: 'Siz bilan tez orada bog‘lanamiz.',
      }}
      budgets={budgetOptions(plans)}
      instagram={instagram}
    />
  );
}
