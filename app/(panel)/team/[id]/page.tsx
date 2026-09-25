import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AccessEditor } from '@/components/accounts/AccessEditor';
import { AccountActions } from '@/components/accounts/AccountActions';
import { StaffProfileForm } from '@/components/accounts/StaffProfileForm';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { can, requireStaff } from '@/lib/auth';
import { ACCOUNT_STATUS, CLIENT_STATUS, EMPLOYEE_STATUS, EMPLOYMENT_TYPE, lookup, PERMISSION_LABEL, TEAM_ROLE_LABEL } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Xodim' };

const TABS = [
  { key: 'profile', label: 'Profil' },
  { key: 'account', label: 'Akkaunt' },
  { key: 'access', label: 'Rol va ruxsatlar' },
  { key: 'clients', label: 'Mijozlar' },
  { key: 'activity', label: 'Faoliyat' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const context = await requireStaff();
  if (!can(context, 'employees.read') && !can(context, 'employees.manage')) redirect('/no-access?reason=permission');
  const { id } = await params;
  const { tab } = await searchParams;
  const active: TabKey = TABS.some((t) => t.key === tab) ? (tab as TabKey) : 'profile';
  const supabase = await createClient();

  const { data: person, error } = await supabase
    .from('profiles')
    .select(
      `id, full_name, first_name, last_name, email, phone, avatar_url, status, status_reason, status_changed_at,
       password_reset_at, created_at, last_seen_at, provisioned_by,
       employee:employees!inner(job_title, department, employment_type, status, work_start_time, work_days, hired_on),
       user_roles!user_roles_user_id_fkey(role:roles(key, name, rank)),
       extra:user_permissions!user_permissions_user_id_fkey(permission_key),
       teams:client_team_members!client_team_members_user_id_fkey(team_role, client:clients(id, name, code, status))`,
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!person) notFound();

  const provisioner = person.provisioned_by
    ? (await supabase.from('profiles').select('full_name').eq('id', person.provisioned_by).maybeSingle()).data?.full_name
    : null;
  const roles = person.user_roles.map((r) => r.role).filter((r): r is NonNullable<typeof r> => !!r).sort((a, b) => a.rank - b.rank);
  const status = lookup(ACCOUNT_STATUS, person.status, ACCOUNT_STATUS.active);
  const canManage = can(context, 'employees.manage') && person.id !== context.userId;
  const tabs = TABS.map((t) => ({ key: t.key, label: t.label, href: `/team/${id}?tab=${t.key}`, count: t.key === 'clients' ? person.teams.length : undefined }));

  return (
    <div>
      <PageHeader
        back={{ href: '/team', label: 'Jamoa' }}
        title={person.full_name}
        description={[person.employee?.job_title, person.email].filter(Boolean).join(' · ')}
        actions={canManage ? <AccountActions userId={person.id} status={person.status} revalidate={`/team/${id}`} /> : null}
      />

      <Card className="mb-8 flex flex-wrap items-center gap-5">
        <Avatar name={person.full_name} url={person.avatar_url} size={56} />
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => (
            <Badge key={r.key} tone={r.rank <= 20 ? 'accent' : 'neutral'}>
              {r.name}
            </Badge>
          ))}
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
          {person.employee ? (
            <Badge tone={lookup(EMPLOYEE_STATUS, person.employee.status, EMPLOYEE_STATUS.active).tone}>
              {lookup(EMPLOYEE_STATUS, person.employee.status, EMPLOYEE_STATUS.active).label}
            </Badge>
          ) : null}
        </div>
        {person.status !== 'active' && person.status_reason ? (
          <p className="text-sm text-warning">Sabab: {person.status_reason}</p>
        ) : null}
      </Card>

      <Tabs items={tabs} active={active} />

      {active === 'profile' ? (
        <Card className="max-w-3xl">
          <StaffProfileForm
            userId={person.id}
            firstName={person.first_name ?? person.full_name.split(' ')[0] ?? ''}
            lastName={person.last_name ?? ''}
            phone={person.phone}
            jobTitle={person.employee?.job_title ?? null}
            department={person.employee?.department ?? null}
            employmentType={person.employee?.employment_type ?? 'full_time'}
            employeeStatus={person.employee?.status ?? 'active'}
            editable={canManage}
          />
        </Card>
      ) : null}

      {active === 'account' ? (
        <Card className="max-w-3xl">
          <dl className="divide-y divide-line text-sm">
            <Row label="Login (email)" value={<span className="font-mono">{person.email}</span>} />
            <Row label="Holat" value={<Badge tone={status.tone} dot>{status.label}</Badge>} />
            {person.status_changed_at ? <Row label="Holat o‘zgargan" value={formatShortDateTime(person.status_changed_at)} /> : null}
            <Row label="Akkaunt yaratilgan" value={formatShortDateTime(person.created_at)} />
            <Row label="Yaratgan" value={provisioner ?? 'Tizim (seed/import)'} />
            <Row label="Oxirgi parol tiklash" value={person.password_reset_at ? formatShortDateTime(person.password_reset_at) : 'Tiklanmagan'} />
            <Row label="Oxirgi faollik" value={person.last_seen_at ? formatShortDateTime(person.last_seen_at) : '—'} />
            <Row label="Ish holati" value={person.employee ? lookup(EMPLOYMENT_TYPE, person.employee.employment_type, '—') : '—'} />
            <Row label="Ish vaqti" value={person.employee ? `${person.employee.work_start_time.slice(0, 5)} dan · ${workDays(person.employee.work_days)}` : '—'} />
          </dl>
          <p className="mt-5 text-[13px] text-muted">
            Parollar bazada ochiq holda saqlanmaydi. Yangi vaqtinchalik parol faqat yaratilgan paytda bir marta ko‘rsatiladi.
          </p>
        </Card>
      ) : null}

      {active === 'access' ? (
        canManage ? (
          <Card className="max-w-5xl">
            <AccessPanel userId={person.id} currentRole={roles[0]?.key ?? ''} granted={person.extra.map((p) => p.permission_key)} context={context} />
          </Card>
        ) : (
          <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
            <Card>
              <SectionTitle>Rollar</SectionTitle>
              <ul className="space-y-2">
                {roles.map((r) => (
                  <li key={r.key} className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3 text-sm">
                    <span className="font-medium">{r.name}</span>
                    <span className="font-mono text-xs text-subtle">{r.key}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <SectionTitle>Qo‘shimcha ruxsatlar</SectionTitle>
              {person.extra.length === 0 ? (
                <p className="text-sm text-muted">Faqat rol ruxsatlari ishlaydi.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {person.extra.map((p) => (
                    <li key={p.permission_key}>
                      <Badge tone="info">{PERMISSION_LABEL[p.permission_key] ?? p.permission_key}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )
      ) : null}

      {active === 'clients' ? (
        person.teams.length === 0 ? (
          <EmptyRow>Xodim hali birorta mijoz jamoasiga biriktirilmagan.</EmptyRow>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {person.teams.map((t) =>
              t.client ? (
                <Link key={`${t.client.id}:${t.team_role}`} href={`/clients/${t.client.id}`} className="block">
                  <Card className="flex items-center gap-4 hover:border-line-strong">
                    <Avatar name={t.client.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{t.client.name}</p>
                      <p className="text-[13px] text-muted">{lookup(TEAM_ROLE_LABEL, t.team_role, t.team_role)}</p>
                    </div>
                    <Badge tone={lookup(CLIENT_STATUS, t.client.status, CLIENT_STATUS.active).tone}>
                      {lookup(CLIENT_STATUS, t.client.status, CLIENT_STATUS.active).label}
                    </Badge>
                  </Card>
                </Link>
              ) : null,
            )}
          </div>
        )
      ) : null}

      {active === 'activity' ? <Activity userId={person.id} allowed={can(context, 'audit.read')} /> : null}
    </div>
  );
}

async function AccessPanel({ userId, currentRole, granted, context }: { userId: string; currentRole: string; granted: string[]; context: Awaited<ReturnType<typeof requireStaff>> }) {
  const supabase = await createClient();
  const [rolesRes, grantsRes] = await Promise.all([
    supabase.from('roles').select('id, key, name, rank').eq('scope', 'staff').order('rank'),
    supabase.from('role_permissions').select('permission_key, role:roles(key)'),
  ]);
  if (rolesRes.error) throw rolesRes.error;
  if (grantsRes.error) throw grantsRes.error;
  const myRank = Math.min(...context.roles.map((r) => rolesRes.data.find((x) => x.key === r.key)?.rank ?? 1000));
  const rolePermissions: Record<string, string[]> = {};
  for (const g of grantsRes.data) {
    if (!g.role) continue;
    (rolePermissions[g.role.key] ??= []).push(g.permission_key);
  }
  return (
    <AccessEditor
      userId={userId}
      currentRole={currentRole}
      roles={rolesRes.data.map((r) => ({ key: r.key, name: r.name, disabled: r.rank < myRank }))}
      delegable={context.permissions}
      granted={granted}
      rolePermissions={rolePermissions}
      canChangeRole={can(context, 'roles.manage')}
    />
  );
}

async function Activity({ userId, allowed }: { userId: string; allowed: boolean }) {
  if (!allowed) return <EmptyRow>Faoliyat jurnalini ko‘rish uchun audit ruxsati kerak.</EmptyRow>;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, occurred_at, action, entity_type, actor:profiles!audit_logs_actor_id_fkey(full_name), new_values')
    .or(`actor_id.eq.${userId},and(entity_type.eq.profiles,entity_id.eq.${userId})`)
    .order('id', { ascending: false })
    .limit(30);
  if (error) throw error;
  if (data.length === 0) return <EmptyRow>Hali faoliyat yo‘q.</EmptyRow>;
  return (
    <Card className="max-w-4xl p-0">
      <ul className="divide-y divide-line">
        {data.map((row) => (
          <li key={row.id} className="flex items-center gap-4 px-5 py-3 text-sm">
            <span className="tabular w-32 shrink-0 text-muted">{formatShortDateTime(row.occurred_at)}</span>
            <span className="flex-1">
              <span className="font-medium">{ACTION_LABEL[row.action] ?? row.action}</span>
              {row.actor?.full_name ? <span className="text-muted"> · {row.actor.full_name}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const ACTION_LABEL: Record<string, string> = {
  'account.created': 'Akkaunt yaratildi',
  'account.password_reset': 'Parol tiklandi',
  'account.status_changed': 'Akkaunt holati o‘zgardi',
  'attendance.insert': 'Davomat belgilandi',
  'attendance.update': 'Davomat o‘zgartirildi',
  'content_items.insert': 'Kontent yaratildi',
  'content_items.update': 'Kontent yangilandi',
  'tasks.insert': 'Vazifa yaratildi',
  'tasks.update': 'Vazifa yangilandi',
  'shootings.insert': 'Syomka rejalashtirildi',
  'files.update': 'Fayl yuklandi',
  'user_roles.insert': 'Rol berildi',
  'user_roles.delete': 'Rol olib tashlandi',
  'profiles.update': 'Profil yangilandi',
  'account.role_changed': 'Rol o‘zgartirildi',
};

const WEEKDAYS = ['', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
function workDays(days: number[]): string {
  return days.map((d) => WEEKDAYS[d]).join(', ');
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
