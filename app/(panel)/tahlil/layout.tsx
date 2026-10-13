import { Unbounded } from 'next/font/google';

import { requirePermission } from '@/lib/auth';

import './tahlil.css';

const unbounded = Unbounded({ subsets: ['latin', 'latin-ext', 'cyrillic'], variable: '--font-unbounded', display: 'swap' });

/** "Mijoz tahlili" — the system owner's and admins' studio, in the website's look (dark glass, lime). */
export default async function ProspectsLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('prospects.manage');
  return (
    <div
      className={`${unbounded.variable} relative -mx-4 -my-5 min-h-[calc(100dvh-3.5rem)] overflow-hidden bg-[#050506] px-4 py-7 text-[#f4f4f5] sm:-mx-6 sm:-my-6 sm:px-6 lg:-mx-8 lg:-my-8 lg:px-8 lg:py-10`}
    >
      <div aria-hidden className="pointer-events-none absolute -top-48 right-[-10%] size-[640px] rounded-full bg-[radial-gradient(circle,rgb(212_252_24/0.13),transparent_62%)] blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute bottom-[-20%] left-[-10%] size-[520px] rounded-full bg-[radial-gradient(circle,rgb(244_244_245/0.05),transparent_65%)] blur-2xl" />
      <div className="relative mx-auto max-w-6xl">{children}</div>
    </div>
  );
}
