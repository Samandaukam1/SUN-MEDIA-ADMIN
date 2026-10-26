import type { Metadata } from 'next';
import Link from 'next/link';

import { MyProfileForm } from '@/components/accounts/MyProfileForm';
import { PageHeader } from '@/components/panel/PageHeader';
import { NotificationSettings } from '@/components/pwa/NotificationSettings';
import { Card } from '@/components/ui/Card';
import { requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Mening profilim' };

/** Own name and phone for everyone in the panel; password from the same place. */
export default async function MyProfilePage() {
  const context = await requireStaff();
  const supabase = await createClient();
  const { data: me } = await supabase.from('profiles').select('first_name, last_name, full_name, phone, email').eq('id', context.userId).single();
  const first = me?.first_name ?? me?.full_name?.split(' ')[0] ?? '';
  const last = me?.last_name ?? me?.full_name?.split(' ').slice(1).join(' ') ?? '';
  return (
    <div>
      <PageHeader title="Mening profilim" description={[context.roles.map((r) => r.name).join(', '), me?.email].filter(Boolean).join(' · ')} />
      <Card className="max-w-2xl">
        <MyProfileForm firstName={first} lastName={last} phone={me?.phone ?? null} />
        <p className="mt-6 border-t border-line pt-4 text-sm text-muted">
          Parolni almashtirish:{' '}
          <Link href="/parol" className="font-medium text-ink underline-offset-4 hover:underline">
            yangi parol o‘rnatish
          </Link>
          .
        </p>
      </Card>
      <section id="bildirishnomalar" className="mt-8 max-w-2xl scroll-mt-24">
        <h2 className="mb-3 text-lg font-semibold">Bildirishnomalar va ilova</h2>
        <NotificationSettings userId={context.userId} />
      </section>
    </div>
  );
}
