import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'SUN MEDIA Admin', description: 'SUN MEDIA boshqaruv paneli' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="uz"><body>{children}</body></html>; }
