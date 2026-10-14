import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AddClientDialog } from '@/components/clients/AddClientDialog';
import { PageHeader } from '@/components/panel/PageHeader';
import { ClientsBoard, type ClientRow } from '@/components/clients/ClientsBoard';
import { can, requireStaff } from '@/lib/auth';
import { CLIENT_STATUS, lookup } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import type { Billing } from '@/lib/billing';
import { agencyDateKey } from '@/lib/time';

export const metadata: Metadata = { title: 'Mijozlar' };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ status?: string; new?: string }> }) {
  const context = await requireStaff();
  if (!can(context, 'clients.read_all') && !can(context, 'clients.manage')) redirect('/no-access?reason=permission');
  const params = await searchParams;
  const supabase = await createClient();
  const today = agencyDateKey();
  const finance = can(context, 'finance.read') || can(context, 'subscriptions.manage');

  const [{ data, error }, billing] = await Promise.all([
    supabase
      .from('clients')
      .select(
        `id, name, code, industry, logo_url, status,
         contacts:client_contacts(full_name, phone, is_primary, deleted_at),
         members:client_members(role:roles(key), profile:profiles!client_members_user_id_fkey(full_name, phone)),
         team:client_team_members(user_id, person:profiles!client_team_members_user_id_fkey(full_name)),
         subscriptions:client_subscriptions(status, starts_on, ends_on, plan:plans(name)),
         contents:content_items(count)`,
      )
      .is('deleted_at', null)
      .order('name'),
    // Money only for people with finance rights; the database returns nothing to anyone else.
    finance ? supabase.from('client_billing').select('*') : Promise.resolve({ data: [] as Billing[] & { client_id: string }[] }),
  ]);
  if (error) throw error;
  const money = new Map(((billing.data ?? []) as (Billing & { client_id: string })[]).map((b) => [b.client_id, b]));

  const rows: ClientRow[] = data.map((c) => {
    const status = lookup(CLIENT_STATUS, c.status, CLIENT_STATUS.active);
    const contact = c.contacts.filter((x) => !x.deleted_at).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0];
    const owner = c.members.find((m) => m.role?.key === 'client_owner')?.profile ?? c.members[0]?.profile;
    const current = c.subscriptions.find((s) => s.status === 'active' && s.starts_on <= today && s.ends_on >= today);
    return {
      id: c.id,
      name: c.name,
      code: c.code,
      industry: c.industry,
      logo: c.logo_url,
      active: c.status === 'active',
      statusLabel: c.status === 'active' ? 'Faol' : status.label,
      statusTone: status.tone,
      contact: contact?.full_name ?? owner?.full_name ?? null,
      phone: contact?.phone ?? owner?.phone ?? null,
      plan: current?.plan?.name ?? null,
      team: [...new Set(c.team.map((t) => t.person?.full_name).filter((n): n is string => !!n))],
      contents: c.contents?.[0]?.count ?? 0,
      billing: money.get(c.id) ?? null,
    };
  });
  const initial = params.status === 'active' ? 'active' : params.status === 'inactive' ? 'inactive' : 'all';

  return (
    <div>
      <PageHeader
        title="Barcha mijozlar"
        description="Mijozlar, mas’ul shaxslar, tariflar, kelishilgan narx va to‘lovlar."
        actions={can(context, 'clients.create') ? <AddClientDialog defaultOpen={params.new === '1'} /> : null}
      />
      <ClientsBoard rows={rows} initial={initial} today={today} finance={finance} />
    </div>
  );
}
