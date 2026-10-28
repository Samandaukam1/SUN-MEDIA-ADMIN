import type { Viewport } from 'next';
import { Unbounded } from 'next/font/google';

import '../(site)/site.css';

const unbounded = Unbounded({ subsets: ['latin'], variable: '--font-unbounded', display: 'swap' });

export const viewport: Viewport = { themeColor: '#050506', colorScheme: 'dark', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

/**
 * Standalone pages for ad visitors (the /ariza application page): the site's own colours, fonts and form, without the
 * header, footer, smooth scroll, cursor effects or the 3D assistant — a light page that opens fast in Instagram's browser.
 */
export default function LeadLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-site className={unbounded.variable}>
      {children}
    </div>
  );
}
