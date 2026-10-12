import Image from 'next/image';
import Link from 'next/link';

import { Logo } from '@/components/brand/Logo';
import { formatPhone, type SiteSettings } from '@/lib/site/types';
import { GateTrigger } from './GateDialog';
import { SiteIcon } from './SiteIcon';

export function socialLinks(settings: SiteSettings) {
  return [
    { href: settings.instagram_url, icon: 'instagram', label: 'Instagram' },
    { href: settings.telegram_url, icon: 'telegram', label: 'Telegram' },
    { href: settings.youtube_url, icon: 'youtube', label: 'YouTube' },
    { href: settings.tiktok_url, icon: 'tiktok', label: 'TikTok' },
    { href: settings.facebook_url, icon: 'facebook', label: 'Facebook' },
    { href: settings.linkedin_url, icon: 'linkedin', label: 'LinkedIn' },
  ].filter((s): s is { href: string; icon: string; label: string } => !!s.href);
}

export function SocialRow({ settings, className = '' }: { settings: SiteSettings; className?: string }) {
  const links = socialLinks(settings);
  if (!links.length) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {links.map((s) => (
        <a
          key={s.label}
          href={s.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={s.label}
          className="lg grid size-11 place-items-center rounded-full text-[#d9d9de] transition-all duration-500 hover:-translate-y-0.5 hover:text-[#d4fc18]"
        >
          <SiteIcon name={s.icon} size={18} />
        </a>
      ))}
    </div>
  );
}

export function SiteFooter({ settings, nav }: { settings: SiteSettings; nav: { href: string; label: string }[] }) {
  const year = new Date().getFullYear();
  const phones = [settings.phone_primary, settings.phone_secondary].filter((p): p is string => !!p);
  return (
    <footer className="relative mt-24 overflow-hidden border-t border-white/[0.06] bg-[#050506] pt-20">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgb(212_252_24/0.08),transparent_65%)]" />
      <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Logo width={168} onDark className="h-auto w-[128px] sm:w-[168px]" />
        {/* Developer credit (Jaxongirmans IT Teams), linked to their Telegram — level with the logo, on the right. */}
        <a
          href="https://t.me/jaxongirman"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Developed by Jaxongirmans IT Teams — Telegram"
          title="Developed by Jaxongirmans IT Teams"
          className="group block w-[170px] shrink-0 rounded-[16px] transition-all duration-500 hover:-translate-y-0.5 hover:shadow-[0_14px_40px_-12px_rgb(212_252_24/0.55)] sm:w-[244px]"
        >
          <Image
            src="/credits/jaxongirmans-it-teams.png"
            alt="Developed by Jaxongirmans IT Teams"
            width={1080}
            height={300}
            sizes="(min-width: 640px) 244px, 170px"
            className="h-auto w-full opacity-90 transition-opacity duration-500 group-hover:opacity-100"
          />
        </a>
      </div>
      <div className="relative mx-auto mt-10 grid max-w-6xl gap-12 px-5 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          {settings.footer_note ? <p className="max-w-sm text-[15px] leading-relaxed text-[#a8a8ac]">{settings.footer_note}</p> : null}
          <SocialRow settings={settings} className="mt-6" />
        </div>
        <div>
          <p className="mb-5 text-[12px] font-semibold tracking-[0.14em] text-[#6e6e76] uppercase">Sahifalar</p>
          <ul className="space-y-3">
            <li>
              <Link href="/" className="text-[15px] text-[#d9d9de] transition-colors hover:text-[#d4fc18]">
                Bosh sahifa
              </Link>
            </li>
            {nav.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="text-[15px] text-[#d9d9de] transition-colors hover:text-[#d4fc18]">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-5 text-[12px] font-semibold tracking-[0.14em] text-[#6e6e76] uppercase">Aloqa</p>
          <ul className="space-y-3 text-[15px] text-[#d9d9de]">
            {phones.map((p) => (
              <li key={p}>
                <a href={`tel:${p}`} className="tabular transition-colors hover:text-[#d4fc18]">
                  {formatPhone(p)}
                </a>
              </li>
            ))}
            {settings.email ? (
              <li>
                <a href={`mailto:${settings.email}`} className="transition-colors hover:text-[#d4fc18]">
                  {settings.email}
                </a>
              </li>
            ) : null}
            {settings.address ? <li className="text-[#a8a8ac]">{settings.address}</li> : null}
            {settings.working_hours ? <li className="text-[#a8a8ac]">{settings.working_hours}</li> : null}
            {!phones.length && !settings.email && !settings.address ? (
              <li>
                <Link href="/aloqa" className="transition-colors hover:text-[#d4fc18]">
                  Ariza qoldirish →
                </Link>
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      <div
        aria-hidden
        className="font-display pointer-events-none mt-16 pb-[1.2vw] bg-[linear-gradient(180deg,rgb(244_244_245/0.12),rgb(244_244_245/0.015)_85%)] bg-clip-text text-center text-[12.4vw] leading-[0.82] font-semibold tracking-[-0.045em] whitespace-nowrap text-transparent select-none"
      >
        SUN MEDIA
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-6 text-[12px] text-[#6e6e76] sm:flex-row sm:px-8">
        <p>© {year} SUN MEDIA. Barcha huquqlar himoyalangan.</p>
        <GateTrigger label={settings.gate_label} />
      </div>
    </footer>
  );
}
