import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Logo } from '@/components/brand/Logo';
import { PasswordForm } from '@/components/cabinet/PasswordForm';
import { SiteIcon } from '@/components/site/SiteIcon';
import { getSessionContext } from '@/lib/auth';
import { homeFor } from '@/lib/cabinet/routing';

export const metadata: Metadata = { title: 'Parolni almashtirish' };

/** Forced after an admin-issued temporary password; also reachable from every cabinet by choice. */
export default async function PasswordPage() {
  const context = await getSessionContext();
  const home = homeFor(context);
  if (!context || !home) redirect('/');
  const forced = !!context.temporary_password;

  return (
    <main className="flex min-h-dvh flex-col items-center px-4 py-10 sm:py-16">
      <Logo width={120} onDark compact />
      <section className="lg lg-strong mt-10 w-full max-w-[460px] rounded-[32px] px-6 pt-8 pb-7 sm:px-9">
        <div className="flex flex-col items-center text-center">
          <div className="mb-5 grid size-16 place-items-center rounded-2xl bg-white/[0.06] text-[#d4fc18] shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_0_40px_rgb(212_252_24/0.18)]">
            <SiteIcon name="key" size={26} strokeWidth={1.8} />
          </div>
          <h1 className="font-display text-[21px] font-medium tracking-tight">{forced ? 'Yangi parol o‘rnating' : 'Parolni almashtirish'}</h1>
          <p className="mt-2 max-w-[340px] text-[14px] leading-relaxed text-[#a8a8ac]">
            {forced
              ? 'Siz SUN MEDIA bergan vaqtinchalik parol bilan kirdingiz. Davom etish uchun faqat o‘zingiz biladigan yangi parol o‘rnating.'
              : 'Joriy parolingizni kiriting va yangisini tanlang.'}
          </p>
          <p className="mt-3 text-[13px] text-[#8e8e96]">{context.profile?.email}</p>
        </div>
        <PasswordForm email={context.profile?.email ?? ''} forced={forced} />
      </section>
      <div className="mt-6 flex items-center gap-5 text-[13.5px]">
        {forced ? null : (
          <Link href={home} className="text-[#a8a8ac] transition-colors hover:text-white">
            ← Kabinetga qaytish
          </Link>
        )}
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-[#a8a8ac] transition-colors hover:text-white">
            Chiqish
          </button>
        </form>
      </div>
    </main>
  );
}
