import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader } from '@/components/panel/PageHeader';
import { Stat } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card, SectionTitle } from '@/components/ui/Card';
import { cn } from '@/components/ui/cn';
import { Icon, type IconName } from '@/components/ui/Icon';
import { requirePermission } from '@/lib/auth';
import { siteCounts } from '@/lib/site/admin';
import { formatPhone } from '@/lib/site/types';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Sayt' };

const SHORTCUTS: { href: string; label: string; hint: string; icon: IconName }[] = [
  { href: '/site/pages', label: 'Sahifalar', hint: 'Menyu, sarlavhalar, bloklar tartibi', icon: 'layers' },
  { href: '/site/texts', label: 'Matnlar va aloqa', hint: 'Bosh ekran, forma, telefonlar', icon: 'edit' },
  { href: '/site/services', label: 'Xizmatlar', hint: 'Kartalar va batafsil sahifa', icon: 'briefcase' },
  { href: '/site/cases', label: 'Keyslar', hint: 'Loyihalar va natijalar', icon: 'film' },
  { href: '/site/partners', label: 'Hamkorlar', hint: 'Logotiplar va hamkorlik yillari', icon: 'users' },
  { href: '/site/testimonials', label: 'Fikrlar', hint: 'Hamkorlar so‘zlari', icon: 'send' },
  { href: '/site/highlights', label: 'Raqamlar va afzalliklar', hint: 'Ko‘rsatkichlar, “Nega SUN MEDIA”', icon: 'trendingUp' },
  { href: '/site/process', label: 'Jarayon va savollar', hint: 'Bosqichlar va FAQ', icon: 'checkSquare' },
  { href: '/site/security', label: 'Kirish kodi', hint: 'Footerdagi 6 xonali kod', icon: 'lock' },
];

export default async function SiteOverviewPage() {
  await requirePermission('site.manage');
  const supabase = await createClient();
  const [counts, settingsResult, latestResult, gateResult] = await Promise.all([
    siteCounts(),
    supabase.from('site_settings').select('phone_primary, email, address, instagram_url, telegram_url').eq('id', true).single(),
    supabase.from('site_applications').select('id, full_name, phone, service, status, created_at').order('created_at', { ascending: false }).limit(5),
    supabase.rpc('site_gate_status'),
  ]);
  const settings = settingsResult.data;
  const gate = (gateResult.data ?? {}) as { configured?: boolean };

  const checklist = [
    { done: !!settings?.phone_primary, label: 'Telefon raqam', href: '/site/texts' },
    { done: !!(settings?.email || settings?.address), label: 'Email yoki manzil', href: '/site/texts' },
    { done: !!(settings?.instagram_url || settings?.telegram_url), label: 'Instagram / Telegram', href: '/site/texts' },
    { done: counts.partners > 0, label: 'Hamkorlar logotiplari', href: '/site/partners' },
    { done: counts.cases > 0, label: 'Kamida bitta keys', href: '/site/cases' },
    { done: counts.stats > 0, label: 'Raqamlar (loyihalar, yillar…)', href: '/site/highlights' },
    { done: counts.testimonials > 0, label: 'Hamkorlar fikrlari', href: '/site/testimonials' },
    { done: gate.configured === true, label: 'Xodimlar kirish kodi', href: '/site/security' },
  ];
  const ready = checklist.filter((c) => c.done).length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Sayt"
        description="SUN MEDIA ochiq sayti: landing, sahifalar, kontent va arizalar. Saqlangan har bir o‘zgarish saytda darhol ko‘rinadi."
        actions={
          <>
            <ButtonLink href="/site/applications">Arizalar</ButtonLink>
            <a href="/" target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90">
              Saytni ochish <Icon name="externalLink" size={15} />
            </a>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Yangi arizalar" value={String(counts.newApplications)} tone={counts.newApplications ? 'warning' : 'default'} detail="Ko‘rib chiqilmagan" />
        <Stat label="Xizmatlar" value={String(counts.services)} detail="Saytda ko‘rinadi" />
        <Stat label="Keyslar" value={String(counts.cases)} detail="Saytda ko‘rinadi" />
        <Stat label="Hamkorlar" value={String(counts.partners)} detail="Saytda ko‘rinadi" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card className="space-y-4">
          <SectionTitle action={<Badge tone={ready === checklist.length ? 'success' : 'warning'}>{ready}/{checklist.length}</Badge>}>Saytni to‘ldirish</SectionTitle>
          <ul className="space-y-1">
            {checklist.map((c) => (
              <li key={c.label}>
                <Link href={c.href} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-surface-2">
                  <span className={cn('grid size-6 shrink-0 place-items-center rounded-full', c.done ? 'bg-success-soft text-success' : 'border border-dashed border-line-strong text-subtle')}>
                    {c.done ? <Icon name="check" size={13} /> : null}
                  </span>
                  <span className={cn('flex-1', c.done && 'text-muted')}>{c.label}</span>
                  {!c.done ? <Icon name="chevronRight" size={15} className="text-subtle" /> : null}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-xs text-subtle">Bo‘sh bo‘limlar saytda o‘z-o‘zidan yashirin turadi — soxta ma’lumot chiqmaydi.</p>
        </Card>

        <Card className="space-y-4">
          <SectionTitle action={<Link href="/site/applications?status=all" className="text-sm font-medium text-muted hover:text-ink">Hammasi →</Link>}>So‘nggi arizalar</SectionTitle>
          {latestResult.data?.length ? (
            <ul className="divide-y divide-line">
              {latestResult.data.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.full_name}</p>
                    <p className="truncate text-sm text-muted">
                      {formatPhone(a.phone)}
                      {a.service ? ` · ${a.service}` : ''}
                    </p>
                  </div>
                  {a.status === 'new' ? <Badge tone="accent" dot>Yangi</Badge> : null}
                  <span className="shrink-0 text-xs text-subtle">{formatShortDateTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-subtle">Hali ariza kelmagan.</p>
          )}
        </Card>
      </div>

      <section>
        <SectionTitle>Bo‘limlar</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SHORTCUTS.map((s) => (
            <Link key={s.href} href={s.href} className="shadow-card flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-line-strong">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-on-soft">
                <Icon name={s.icon} size={19} />
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{s.label}</span>
                <span className="block truncate text-sm text-muted">{s.hint}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
