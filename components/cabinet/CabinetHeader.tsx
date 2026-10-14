import Link from 'next/link';
import type { ReactNode } from 'react';

import { Logo } from '@/components/brand/Logo';
import { SiteIcon } from '@/components/site/SiteIcon';

/** Top bar of every cabinet: SUN MEDIA mark, whose cabinet this is, password change and sign-out. */
export function CabinetHeader({ name, role, home, extra }: { name: string; role: string; home: string; extra?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#050506]/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:h-[72px] sm:px-8">
        <Link href={home} className="shrink-0" aria-label="Kabinet bosh sahifasi">
          <Logo width={104} onDark compact />
        </Link>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="hidden min-w-0 text-right sm:block">
            <p className="truncate text-[14px] font-semibold text-white">{name}</p>
            <p className="truncate text-[12px] text-[#8e8e96]">{role}</p>
          </div>
          {extra}
          <Link
            href="/parol"
            aria-label="Parolni almashtirish"
            title="Parolni almashtirish"
            className="lg grid size-10 shrink-0 place-items-center rounded-full text-[#d9d9de] transition-colors hover:text-[#d4fc18]"
          >
            <SiteIcon name="key" size={17} />
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="lg flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[13.5px] font-medium text-[#f4f4f5] transition-colors hover:text-[#d4fc18]"
            >
              <SiteIcon name="logout" size={16} /> <span>Chiqish</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
