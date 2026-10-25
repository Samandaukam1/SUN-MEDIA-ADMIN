import type { Metadata, Viewport } from 'next';
import { Unbounded } from 'next/font/google';

import { SunBot } from '@/components/assistant/SunBot';
import '../(site)/site.css';

const unbounded = Unbounded({ subsets: ['latin', 'latin-ext', 'cyrillic'], variable: '--font-unbounded', display: 'swap' });

export const viewport: Viewport = { themeColor: '#050506', colorScheme: 'dark' };
export const metadata: Metadata = { title: { default: 'Kabinet', template: '%s — SUN MEDIA' }, robots: { index: false, follow: false } };
// Personal pages: rendered for each request with the visitor's own session, never cached.
export const dynamic = 'force-dynamic';

export default function CabinetLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-site className={unbounded.variable}>
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_80%_at_20%_0%,rgb(212_252_24/0.07),transparent_70%),radial-gradient(50%_70%_at_90%_10%,rgb(244_244_245/0.05),transparent_70%)]" />
      <div className="relative">{children}</div>
      <div className="s-grain" aria-hidden />
      <SunBot audience="member" />
    </div>
  );
}
