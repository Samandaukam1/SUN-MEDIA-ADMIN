import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AccountActions } from '@/components/accounts/AccountActions';
import { AddClientUserDialog } from '@/components/clients/AddClientUserDialog';
import { ApprovalToggle } from '@/components/clients/ApprovalToggle';
import { ClientProfileForm } from '@/components/clients/ClientProfileForm';
import { RemoveTeamMember, TeamAssignForm } from '@/components/clients/TeamAssign';
import { PageHeader } from '@/components/panel/PageHeader';
import { ClientPlanTab } from '@/components/plans/ClientPlanTab';
import { EmptyRow } from '@/components/panel/Stat';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { can, requireStaff } from '@/lib/auth';
import { ACCOUNT_STATUS, CLIENT_STATUS, lookup, TEAM_ROLE_LABEL } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Mijoz' };

const TABS = [
  { key: 'overview', label: 'Umumiy' },
  { key: 'users', label: 'Loginlar' },
  { key: 'team', label: 'SUN MEDIA jamoasi' },
  { key: 'plan', label: 'Tarif' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const context = await requireStaff();
  if (!can(context, 'clients.read_all') && !can(context, 'clients.manage')) redirect('/no-access?reason=permission');
  const { id } = await params;
  const { tab } = await searchParams;
  const active: TabKey = TABS.some((t) => t.key === tab) ? (tab as TabKey) : 'overview';
  const supabase = await createClient();

  const { data: client, error } = await supabase
    .from('clients')
    .select(
      `id, name, code, legal_name, industry, website, address, description, logo_url, status, created_at,
       members:client_members(user_id, title, created_at, role:roles(key, name),
         profile:profiles!client_members_user_id_fkey(id, full_name, email, phone, status, last_seen_at)),
       team:client_team_members(user_id, team_role, person:profiles!client_team_members_user_id_fkey(id, full_name, avatar_url))`,
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!client) notFound();

  const manage = can(context, 'clients.manage');
  const status = lookup(CLIENT_STATUS, client.status, CLIENT_STATUS.active);
  const { data: extra } = await supabase.from('client_member_permissions').select('user_id, permission_key').eq('client_id', id);
  const approvers = new Set((extra ?? []).filter((x) => x.permission_key === 'client.approve').map((x) => x.user_id));

  let staffOptions: { id: string; name: string; hint?: string | null }[] = [];
  if (active === 'team' && manage) {
    const { data: staff } = await supabase
      .from('profiles')
      .select('id, full_name, employee:employees!inner(job_title, status)')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('full_name');
    staffOptions = (staff ?? []).filter((s) => s.employee?.status !== 'terminated').map((s) => ({ id: s.id, name: s.full_name, hint: s.employee?.job_title }));
  }

  const tabs = TABS.filter((t) => t.key !== 'plan' || can(context, 'subscriptions.read') || can(context, 'subscriptions.manage')).map((t) => ({
    key: t.key,
    label: t.label,
    href: `/clients/${id}?tab=${t.key}`,
    count: t.key === 'users' ? client.members.length : t.key === 'team' ? client.team.length : undefined,
  }));

  return (
    <div>
      <PageHeader
        back={{ href: '/clients', label: 'Mijozlar' }}
        title={client.name}
        description={[client.code, client.industry, client.legal_name].filter(Boolean).join(' · ')}
        actions={
          <>
            <Badge tone={status.tone} dot>
              {status.label}
            </Badge>
            {manage && active === 'users' ? <AddClientUserDialog clientId={client.id} clientName={client.name} /> : null}
          </>
        }
      />
      <Tabs items={tabs} active={active} />

      {active === 'overview' ? (
        <Card className="max-w-3xl">
          <ClientProfileForm
            id={client.id}
            editable={manage}
            values={{
              name: client.name,
              code: client.code,
              legal_name: client.legal_name,
              industry: client.industry,
              website: client.website,
              address: client.address,
              description: client.description,
              status: client.status,
            }}
          />
        </Card>
      ) : null}

      {active === 'users' ? (
        client.members.length === 0 ? (
          <EmptyRow>Bu mijozda hali login yo‘q. “Login qo‘shish” orqali kompaniya egasi yoki xodimi uchun akkaunt yarating.</EmptyRow>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {client.members.map((m) => {
                if (!m.profile) return null;
                const accountStatus = lookup(ACCOUNT_STATUS, m.profile.status, ACCOUNT_STATUS.active);
                const isOwner = m.role?.key === 'client_owner';
                return (
                  <li key={m.user_id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <Avatar name={m.profile.full_name} size={40} />
                    <div className="min-w-48 flex-1">
                      <p className="font-medium">{m.profile.full_name}</p>
                      <p className="text-[13px] text-muted">{[m.profile.email, m.title].filter(Boolean).join(' · ')}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge tone={isOwner ? 'accent' : 'neutral'}>{m.role?.name ?? '—'}</Badge>
                      <Badge tone={accountStatus.tone} dot>
                        {accountStatus.label}
                      </Badge>
                      {isOwner ? (
                        <span className="text-[13px] text-muted">Tasdiqlaydi</span>
                      ) : manage ? (
                        <ApprovalToggle clientId={client.id} userId={m.user_id} allowed={approvers.has(m.user_id)} />
                      ) : (
                        <span className="text-[13px] text-muted">{approvers.has(m.user_id) ? 'Tasdiqlaydi' : 'Faqat ko‘radi'}</span>
                      )}
                      <span className="hidden text-[13px] text-subtle lg:inline">
                        {m.profile.last_seen_at ? `Oxirgi: ${formatShortDateTime(m.profile.last_seen_at)}` : 'Hali kirmagan'}
                      </span>
                    </div>
                    {manage ? <AccountActions userId={m.user_id} status={m.profile.status} revalidate={`/clients/${client.id}`} compact /> : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        )
      ) : null}

      {active === 'plan' ? <ClientPlanTab clientId={client.id} manage={can(context, 'subscriptions.manage')} /> : null}

      {active === 'team' ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
          <Card>
            <SectionTitle>Biriktirilgan xodimlar</SectionTitle>
            {client.team.length === 0 ? (
              <p className="text-sm text-muted">Hali hech kim biriktirilmagan.</p>
            ) : (
              <ul className="divide-y divide-line">
                {client.team.map((t) =>
                  t.person ? (
                    <li key={`${t.user_id}:${t.team_role}`} className="flex items-center gap-3 py-3">
                      <Avatar name={t.person.full_name} url={t.person.avatar_url} size={34} />
                      <Link href={`/team/${t.person.id}`} className="min-w-0 flex-1 hover:underline">
                        <span className="block truncate text-sm font-medium">{t.person.full_name}</span>
                        <span className="block text-[13px] text-muted">{lookup(TEAM_ROLE_LABEL, t.team_role, t.team_role)}</span>
                      </Link>
                      {manage ? <RemoveTeamMember clientId={client.id} userId={t.user_id} teamRole={t.team_role} /> : null}
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </Card>
          {manage ? (
            <Card>
              <SectionTitle>Xodim biriktirish</SectionTitle>
              <TeamAssignForm clientId={client.id} staff={staffOptions} />
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
