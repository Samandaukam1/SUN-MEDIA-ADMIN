import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AddClientDialog } from '@/components/clients/AddClientDialog';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { can, requireStaff } from '@/lib/auth';
import { CLIENT_STATUS, lookup } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Mijozlar' };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const context = await requireStaff();
  if (!can(context, 'clients.read_all') && !can(context, 'clients.manage')) redirect('/no-access?reason=permission');
  const params = await searchParams;
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('clients')
    .select(
      `id, name, code, industry, logo_url, status,
       members:client_members(user_id),
       team:client_team_members(user_id),
       subscriptions:client_subscriptions(status, starts_on, ends_on, plan:plans(name))`,
    )
    .is('deleted_at', null)
    .order('name');
  if (error) throw error;

  const q = params.q?.trim().toLowerCase() ?? '';
  const clients = data
    .filter((c) => !q || `${c.name} ${c.code} ${c.industry ?? ''}`.toLowerCase().includes(q))
    .filter((c) => !params.status || c.status === params.status);

  return (
    <div>
      <PageHeader
        eyebrow="Odamlar"
        title="Mijozlar"
        description="Kompaniyalar, ularning loginlari, SUN MEDIA jamoasi va tariflari."
        actions={can(context, 'clients.manage') ? <AddClientDialog /> : null}
      />

      <form className="mb-6 flex flex-wrap gap-3" role="search">
        <label className="relative min-w-64 flex-1">
          <span className="sr-only">Qidirish</span>
          <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle" />
          <input name="q" defaultValue={params.q} placeholder="Nomi, kodi yoki sohasi" className="h-10 w-full rounded-xl border border-line bg-surface pr-3 pl-10 text-sm outline-none focus:border-accent" />
        </label>
        <select name="status" defaultValue={params.status ?? ''} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" aria-label="Holat">
          <option value="">Barcha holatlar</option>
          {Object.entries(CLIENT_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <button type="submit" className="h-10 rounded-xl border border-line-strong bg-surface px-4 text-sm font-medium hover:bg-surface-2">
          Filtrlash
        </button>
      </form>

      {clients.length === 0 ? (
        <EmptyRow>{data.length === 0 ? 'Hali mijoz qo‘shilmagan.' : 'Filtrga mos mijoz topilmadi.'}</EmptyRow>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clients.map((c) => {
            const status = lookup(CLIENT_STATUS, c.status, CLIENT_STATUS.active);
            const current = c.subscriptions.find((s) => s.status === 'active' && s.starts_on <= today && s.ends_on >= today);
            const team = new Set(c.team.map((t) => t.user_id)).size;
            return (
              <Link key={c.id} href={`/clients/${c.id}`} className="block">
                <Card className="flex h-full flex-col gap-4 transition-colors hover:border-line-strong">
                  <div className="flex items-center gap-3">
                    <Avatar name={c.name} url={c.logo_url} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">{c.name}</p>
                      <p className="truncate text-[13px] text-muted">{[c.code, c.industry].filter(Boolean).join(' · ')}</p>
                    </div>
                    <Badge tone={status.tone} dot>
                      {status.label}
                    </Badge>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
                    <Metric label="Tarif" value={current?.plan?.name ?? '—'} />
                    <Metric label="Jamoa" value={String(team)} />
                    <Metric label="Loginlar" value={String(c.members.length)} />
                  </dl>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] tracking-[0.06em] text-subtle uppercase">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold">{value}</dd>
    </div>
  );
}
