import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AddEmployeeDialog } from '@/components/accounts/AddEmployeeDialog';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { buttonClass } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { can, requireStaff } from '@/lib/auth';
import { ACCOUNT_STATUS, lookup } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Jamoa' };

type Search = { q?: string; role?: string; status?: string };

export default async function TeamPage({ searchParams }: { searchParams: Promise<Search> }) {
  const context = await requireStaff();
  if (!can(context, 'employees.read') && !can(context, 'employees.manage')) redirect('/no-access?reason=permission');
  const params = await searchParams;
  const supabase = await createClient();

  const [peopleRes, rolesRes, clientsRes, domainRes] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        `id, full_name, email, phone, avatar_url, status, last_seen_at,
         employee:employees!inner(job_title, employment_type, status),
         user_roles!user_roles_user_id_fkey(role:roles(key, name, rank))`,
      )
      .is('deleted_at', null)
      .order('full_name'),
    supabase.from('roles').select('key, name, rank, description').eq('scope', 'staff').order('rank'),
    supabase.from('clients').select('id, name, code, industry').is('deleted_at', null).eq('status', 'active').order('name'),
    supabase.from('app_settings').select('value').eq('key', 'accounts.login_domain').maybeSingle(),
  ]);
  if (peopleRes.error) throw peopleRes.error;
  if (rolesRes.error) throw rolesRes.error;

  const q = params.q?.trim().toLowerCase() ?? '';
  const people = peopleRes.data
    .map((p) => ({ ...p, roles: p.user_roles.map((ur) => ur.role).filter(Boolean).sort((a, b) => a!.rank - b!.rank) }))
    .filter((p) => !q || `${p.full_name} ${p.email ?? ''} ${p.phone ?? ''} ${p.employee?.job_title ?? ''}`.toLowerCase().includes(q))
    .filter((p) => !params.role || p.roles.some((r) => r?.key === params.role))
    .filter((p) => !params.status || p.status === params.status);

  const all = peopleRes.data;
  const myRank = Math.min(...context.roles.map((r) => rolesRes.data.find((x) => x.key === r.key)?.rank ?? 1000));
  const assignableRoles = rolesRes.data.filter((r) => r.rank >= myRank).map((r) => ({ value: r.key, label: r.name, description: r.description ?? undefined }));
  const canManage = can(context, 'employees.manage');

  return (
    <div>
      <PageHeader
        eyebrow="Odamlar"
        title="Jamoa"
        description="SUN MEDIA xodimlari, ularning rollari va akkauntlari."
        actions={
          canManage ? (
            <AddEmployeeDialog
              roles={assignableRoles}
              clients={(clientsRes.data ?? []).map((c) => ({ value: c.id, label: c.name, description: c.industry ?? c.code }))}
              permissions={context.permissions}
              loginDomain={typeof domainRes.data?.value === 'string' ? domainRes.data.value : 'sunmedia.uz'}
            />
          ) : null
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Summary label="Jami xodimlar" value={all.length} />
        <Summary label="Faol akkauntlar" value={all.filter((p) => p.status === 'active').length} />
        <Summary label="Bloklangan" value={all.filter((p) => p.status !== 'active').length} tone={all.some((p) => p.status !== 'active') ? 'warning' : undefined} />
      </div>

      <form className="mb-5 flex flex-wrap items-center gap-3" role="search">
        <label className="relative min-w-64 flex-1">
          <span className="sr-only">Qidirish</span>
          <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle" />
          <input
            name="q"
            defaultValue={params.q}
            placeholder="Ism, email, telefon yoki lavozim"
            className="h-10 w-full rounded-xl border border-line bg-surface pr-3 pl-10 text-sm outline-none focus:border-accent"
          />
        </label>
        <select name="role" defaultValue={params.role ?? ''} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" aria-label="Rol">
          <option value="">Barcha rollar</option>
          {rolesRes.data.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={params.status ?? ''} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" aria-label="Holat">
          <option value="">Barcha holatlar</option>
          {Object.entries(ACCOUNT_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <button type="submit" className={buttonClass('secondary')}>
          Filtrlash
        </button>
      </form>

      {people.length === 0 ? (
        <EmptyRow>{all.length === 0 ? 'Hali xodim qo‘shilmagan.' : 'Filtrga mos xodim topilmadi.'}</EmptyRow>
      ) : (
        <Card className="p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">
                <th className="px-5 py-3">Xodim</th>
                <th className="px-5 py-3">Rol</th>
                <th className="hidden px-5 py-3 lg:table-cell">Telefon</th>
                <th className="px-5 py-3">Akkaunt</th>
                <th className="hidden px-5 py-3 xl:table-cell">Oxirgi faollik</th>
                <th className="w-10 px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const status = lookup(ACCOUNT_STATUS, p.status, ACCOUNT_STATUS.active);
                return (
                  <tr key={p.id} className="group relative border-b border-line last:border-0 hover:bg-surface-2">
                    <td className="px-5 py-3.5">
                      <Link href={`/team/${p.id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                        <Avatar name={p.full_name} url={p.avatar_url} size={36} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{p.full_name}</span>
                          <span className="block truncate text-[13px] text-muted">{p.employee?.job_title ?? p.email}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {p.roles.map((r) => (
                          <Badge key={r!.key} tone={r!.rank <= 20 ? 'accent' : 'neutral'}>
                            {r!.name}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="tabular hidden px-5 py-3.5 text-muted lg:table-cell">{p.phone ?? '—'}</td>
                    <td className="px-5 py-3.5">
                      <Badge tone={status.tone} dot>
                        {status.label}
                      </Badge>
                    </td>
                    <td className="hidden px-5 py-3.5 text-muted xl:table-cell">{p.last_seen_at ? formatShortDateTime(p.last_seen_at) : '—'}</td>
                    <td className="px-5 py-3.5 text-subtle">
                      <Icon name="chevronRight" size={16} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: number; tone?: 'warning' }) {
  return (
    <Card className="flex items-baseline justify-between">
      <span className="text-sm text-muted">{label}</span>
      <span className={`tabular text-2xl font-bold ${tone === 'warning' ? 'text-warning' : ''}`}>{value}</span>
    </Card>
  );
}
