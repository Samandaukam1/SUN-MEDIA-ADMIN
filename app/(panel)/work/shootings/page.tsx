import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { cellClass, ChipLinks, Pager, RowLink, rowClass, Table, withParams } from '@/components/panel/List';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { can, requireStaff } from '@/lib/auth';
import { lookup, SHOOTING_STATUS } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import { agencyDateKey, agencyDayRange, formatDateKey, formatTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Syomkalar' };
const PAGE = 40;

/** Ish jarayoni → Syomkalar: what is coming (default) or what was shot. */
export default async function ShootingsPage({ searchParams }: { searchParams: Promise<{ when?: string; client?: string; page?: string; created?: string }> }) {
  const context = await requireStaff();
  if (!['shootings.manage', 'clients.read_all'].some((p) => can(context, p))) redirect('/no-access?reason=permission');
  const params = await searchParams;
  const past = params.when === 'past';
  const page = Math.max(0, Number(params.page ?? 0) || 0);
  const dayStart = agencyDayRange(agencyDateKey()).from;
  const supabase = await createClient();

  let query = supabase
    .from('shootings')
    .select('id, title, starts_at, ends_at, status, location_name, location_address, client:clients(name), crew:shooting_members(role, person:profiles!shooting_members_user_id_fkey(full_name))')
    .is('deleted_at', null);
  query = past ? query.lt('starts_at', dayStart).order('starts_at', { ascending: false }) : query.gte('starts_at', dayStart).order('starts_at');
  if (params.client) query = query.eq('client_id', params.client);
  const [{ data, error }, clients] = await Promise.all([query.range(page * PAGE, page * PAGE + PAGE), supabase.from('clients').select('id, name').is('deleted_at', null).order('name')]);
  if (error) throw error;
  const rows = data.slice(0, PAGE);
  const keep = { client: params.client, when: past ? 'past' : undefined };

  return (
    <div>
      <PageHeader
        title="Syomkalar"
        description="Qachon, qayerda va kim boradi."
        actions={can(context, 'shootings.manage') ? <ButtonLink href="/work/shootings/new" variant="primary">+ Syomka</ButtonLink> : null}
      />
      {params.created ? (
        <div className="mb-4">
          <Notice tone="success" title="Syomka rejalashtirildi. Jamoaga bildirishnoma yuborildi." />
        </div>
      ) : null}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <ChipLinks
          items={[
            { label: 'Kelgusi', href: withParams('/work/shootings', { client: params.client }), active: !past },
            { label: 'O‘tgan', href: withParams('/work/shootings', { client: params.client, when: 'past' }), active: past },
          ]}
        />
        <form className="ml-auto flex gap-2">
          {past ? <input type="hidden" name="when" value="past" /> : null}
          <select name="client" defaultValue={params.client ?? ''} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" aria-label="Mijoz">
            <option value="">Barcha mijozlar</option>
            {(clients.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="submit" className="h-10 rounded-xl border border-line-strong bg-surface px-4 text-sm font-medium hover:bg-surface-2">
            Ko‘rsatish
          </button>
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyRow>{past ? 'O‘tgan syomka yo‘q.' : 'Kelgusi syomka rejalashtirilmagan.'}</EmptyRow>
      ) : (
        <Table columns={['Qachon', 'Syomka', 'Mijoz', { label: 'Joy', className: 'hidden lg:table-cell' }, { label: 'Jamoa', className: 'hidden xl:table-cell' }, 'Holat']}>
          {rows.map((s) => {
            const status = lookup(SHOOTING_STATUS, s.status, SHOOTING_STATUS.planned);
            return (
              <tr key={s.id} className={rowClass}>
                <td className={`${cellClass} tabular whitespace-nowrap`}>
                  <span className="block font-medium">{formatDateKey(agencyDateKey(new Date(s.starts_at)), true)}</span>
                  <span className="block text-[13px] text-muted">
                    {formatTime(s.starts_at)}–{formatTime(s.ends_at)}
                  </span>
                </td>
                <td className={cellClass}>
                  <RowLink href={`/work/shootings/${s.id}`}>
                    <span className="font-medium">{s.title}</span>
                  </RowLink>
                </td>
                <td className={`${cellClass} text-muted`}>{s.client?.name ?? '—'}</td>
                <td className={`${cellClass} hidden text-muted lg:table-cell`}>{s.location_name ?? s.location_address ?? '—'}</td>
                <td className={`${cellClass} hidden text-muted xl:table-cell`}>{s.crew.map((m) => m.person?.full_name.split(' ')[0]).filter(Boolean).join(', ') || '—'}</td>
                <td className={cellClass}>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
      <Pager page={page} hasNext={data.length > PAGE} href={(p) => withParams('/work/shootings', keep, { page: p ? String(p) : undefined })} />
    </div>
  );
}
