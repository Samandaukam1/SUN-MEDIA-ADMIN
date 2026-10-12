import Link from 'next/link';

import { Logo } from '@/components/brand/Logo';
import './(site)/site.css';

export default function NotFound() {
  return (
    <div data-site className="flex min-h-dvh flex-col items-center justify-center gap-10 px-6 text-center">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_50%_40%,rgb(212_252_24/0.1),transparent_70%)]" />
      <Logo width={170} onDark />
      <div className="relative">
        <p className="s-silver text-[96px] leading-none font-semibold tracking-[-0.06em] sm:text-[140px]">404</p>
        <p className="mt-4 text-[17px] text-[#a8a8ac]">Bu sahifa topilmadi yoki ko‘chirilgan.</p>
      </div>
      <Link href="/" className="s-btn s-btn-lime relative">
        Bosh sahifaga qaytish
      </Link>
    </div>
  );
}
