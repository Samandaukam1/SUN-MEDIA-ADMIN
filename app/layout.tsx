import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';

import { PwaRuntime } from '@/components/pwa/PwaRuntime';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'SUN MEDIA Admin', template: '%s · SUN MEDIA' },
  description: 'SUN MEDIA — Agency Operating System boshqaruv paneli',
  robots: { index: false, follow: false },
  applicationName: 'Sun Media',
  // Installed on an iPhone or iPad home screen: its own window, the app's name under the icon, a black status bar
  // (content starts below the notch / Dynamic Island).
  appleWebApp: { capable: true, title: 'Sun Media', statusBarStyle: 'black' },
  formatDetection: { telephone: false },
};

// The panel follows the system theme; the site and the cabinets set their own dark colour.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f4f5' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uz" className={inter.variable}>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <PwaRuntime />
      </body>
    </html>
  );
}
