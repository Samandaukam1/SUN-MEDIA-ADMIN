import Link from 'next/link';
import type { ReactNode } from 'react';

import { CabinetHeader } from '@/components/cabinet/CabinetHeader';
import { PartnerLogoImage } from '@/components/site/PartnerLogoImage';
import { SiteIcon } from '@/components/site/SiteIcon';
import { partnerHref, type PartnerScope } from '@/lib/cabinet/partner-context';
import { loadChatRoom, unreadCount } from '@/lib/cabinet/partner-data';
import { createClient } from '@/lib/supabase/server';
import { Chip } from './parts';
import { PartnerTabs, type PartnerTab } from './PartnerTabs';

/** Header, the brand, the section tabs and (for SUN MEDIA staff) the preview notice around every cabinet section. */
export async function PartnerFrame({ scope, title, subtitle, actions, children }: { scope: PartnerScope; title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const supabase = await createClient();
  const [{ data: client }, room] = await Promise.all([
    supabase.from('clients').select('id, name, logo_url, home_logo_dark_url, home_logo_url').eq('id', scope.clientId).maybeSingle(),
    loadChatRoom(scope.clientId).catch(() => null),
  ]);
  const unread = room && !scope.preview ? await unreadCount(room.id, scope.context.userId).catch(() => 0) : 0;
  const can = (p: string) => scope.preview || scope.permissions.includes(p);
  const tab = (path: string, label: string, icon: string, badge?: number): PartnerTab => ({ path, href: partnerHref(scope, path), label, icon, badge });
  const tabs: PartnerTab[] = [
    tab('/kabinet', 'Umumiy', 'spark'),
    can('client.results.view') ? tab('/kabinet/natijalar', 'Natijalar', 'chart') : null,
    can('client.crm.view') ? tab('/kabinet/lidlar', 'Lidlar', 'target') : null,
    tab('/kabinet/reja', 'Reja', 'calendar'),
    can('client.plan.view') ? tab('/kabinet/tarif', 'Tarif', 'star') : null,
    can('client.reports.view') ? tab('/kabinet/hisobotlar', 'Hisobotlar', 'file') : null,
    room ? tab('/kabinet/chat', 'Chat', 'message', unread) : null,
  ].filter((t): t is PartnerTab => t !== null);
  const name = client?.name ?? 'Hamkor';
  const logo = client?.home_logo_dark_url ?? client?.logo_url ?? null;

  return (
    <>
      <CabinetHeader name={scope.context.profile?.full_name || scope.context.profile?.email || ''} role={scope.roleLabel} home={partnerHref(scope, '/kabinet')} />
      <PartnerTabs tabs={tabs} />
      <main className="mx-auto max-w-6xl space-y-7 px-4 pt-7 pb-20 sm:px-8 sm:pt-10">
        {scope.preview ? (
          <p className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#d4fc18]/25 bg-[#d4fc18]/[0.06] px-4 py-3 text-[13.5px] text-[#e4e4e7]">
            <SiteIcon name="eye" size={16} className="text-[#d4fc18]" />
            Hamkor kabinetini SUN MEDIA xodimi sifatida ko‘ryapsiz — hamkor aynan shuni ko‘radi (faqat o‘qish).
            <Link href={`/clients/${scope.clientId}`} className="ml-auto font-semibold text-[#d4fc18] hover:underline">
              Panelga qaytish →
            </Link>
          </p>
        ) : null}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="lg relative grid size-16 shrink-0 place-items-center rounded-[20px] sm:size-[72px]">
              {logo ? (
                <span className="relative block size-10 sm:size-12">
                  <PartnerLogoImage src={logo} alt={name} sizes="48px" fallback={<span className="font-display text-[22px] text-white">{name.slice(0, 1)}</span>} />
                </span>
              ) : (
                <span className="font-display text-[24px] text-white">{name.slice(0, 1)}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold tracking-[0.16em] text-[#d4fc18] uppercase">{name}</p>
              <h1 className="font-display mt-1 text-[26px] leading-tight font-medium tracking-[-0.03em] break-words text-white sm:text-[34px]">{title}</h1>
              {subtitle ? <div className="mt-1.5 text-[13.5px] text-[#8e8e96]">{subtitle}</div> : null}
            </div>
          </div>
          {actions || (scope.context.kind === 'client' && scope.context.clients.length > 1) ? (
            <div className="flex flex-wrap gap-2">
              {scope.context.kind === 'client' && scope.context.clients.length > 1
                ? scope.context.clients.map((c) => (
                    <Chip key={c.id} href={`/kabinet?brend=${c.id}`} active={c.id === scope.clientId}>
                      {c.name}
                    </Chip>
                  ))
                : null}
              {actions}
            </div>
          ) : null}
        </div>
        {children}
      </main>
    </>
  );
}
