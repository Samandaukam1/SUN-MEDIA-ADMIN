import type { Metadata } from 'next';

import { Logo } from '@/components/brand/Logo';
import { safeNextPath } from '@/lib/errors';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Kirish' };

const ERRORS: Record<string, string> = {
  oauth: 'Google orqali kirish tugallanmadi. Qayta urinib ko‘ring.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <section className="flex flex-col justify-between px-6 py-10 sm:px-12">
        <Logo size={30} />
        <div className="mx-auto w-full max-w-[400px] py-12">
          <h1 className="text-3xl font-bold tracking-tight">Boshqaruv paneli</h1>
          <p className="mt-2 mb-8 text-muted">SUN MEDIA jamoasi uchun. Hisobingiz bilan kiring.</p>
          <LoginForm next={safeNextPath(params.next)} initialError={params.error ? ERRORS[params.error] : undefined} />
        </div>
        <p className="text-[13px] text-subtle">Hisoblarni Owner yoki Admin yaratadi.</p>
      </section>
      <aside className="relative hidden overflow-hidden bg-sidebar lg:block" aria-hidden>
        <div className="absolute inset-0 flex flex-col justify-end p-14">
          <p className="max-w-md text-[28px] leading-tight font-semibold text-white">
            Agentlik, jamoa va mijozlar — bitta real vaqt tizimida.
          </p>
          <p className="mt-4 max-w-md text-sidebar-text">
            Kontent reja, syomkalar, tasdiqlash, davomat, tariflar va oylik natijalar.
          </p>
        </div>
        <div className="absolute -top-40 -right-40 size-[520px] rounded-full bg-[#F5A524] opacity-[0.07]" />
      </aside>
    </main>
  );
}
