import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import './globals.css';

const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'SUN MEDIA Admin', template: '%s · SUN MEDIA' },
  description: 'SUN MEDIA — Agency Operating System boshqaruv paneli',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uz" className={inter.variable}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
