import type { Metadata } from 'next';

import { Logo } from '@/components/brand/Logo';
import { Button, ButtonLink } from '@/components/ui/Button';
import { getSessionContext } from '@/lib/auth';

export const metadata: Metadata = { title: 'Ruxsat yo‘q' };

export default async function NoAccessPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const context = await getSessionContext().catch(() => null);
  const isClient = context?.kind === 'client';
  const title = reason === 'permission' ? 'Bu bo‘lim sizga yopiq' : isClient ? 'Admin panel faqat SUN MEDIA jamoasi uchun' : 'Hisobingiz hali faollashtirilmagan';
  const text =
    reason === 'permission'
      ? 'Rolingizda bu sahifa uchun ruxsat yo‘q. Kerak bo‘lsa, Owner yoki Admin bilan bog‘laning.'
      : isClient
        ? 'Kontent rejangiz, tasdiqlashlar va hisobotlaringizni SUN MEDIA mobil ilovasida ko‘rasiz.'
        : 'Owner yoki Admin sizga rol biriktirgach, panel ochiladi.';

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 text-center">
      <Logo size={30} />
      <div className="max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-muted">{text}</p>
        {context?.profile?.email ? <p className="mt-2 text-sm text-subtle">{context.profile.email}</p> : null}
      </div>
      <div className="flex gap-3">
        {reason === 'permission' ? (
          <ButtonLink href="/">Bosh sahifa</ButtonLink>
        ) : null}
        {context ? (
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost">
              Boshqa hisob bilan kirish
            </Button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
