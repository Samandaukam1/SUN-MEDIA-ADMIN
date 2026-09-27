import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { buttonClass } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Audit log' };

const PAGE = 50;

const ENTITY: Record<string, string> = {
  content_items: 'Kontent',
  content_versions: 'Versiya',
  content_publications: 'Nashr',
  content_assignments: 'Kontent jamoasi',
  revisions: 'Revision',
  tasks: 'Vazifa',
  task_assignments: 'Vazifa mas’uli',
  shootings: 'Syomka',
  attendance: 'Davomat',
  files: 'Fayl',
  folders: 'Papka',
  clients: 'Mijoz',
  client_members: 'Mijoz logini',
  client_team_members: 'Mijoz jamoasi',
  user_roles: 'Rol',
  role_permissions: 'Rol ruxsati',
  employees: 'Xodim',
  profiles: 'Profil',
  plans: 'Tarif',
  plan_features: 'Tarif tarkibi',
  client_subscriptions: 'Obuna',
  client_plan_usage: 'Tarif sarfi',
  plan_upgrade_requests: 'Tarif so‘rovi',
  monthly_reports: 'Hisobot',
  social_metrics: 'Statistika',
  app_settings: 'Sozlama',
  announcements: 'E’lon',
  projects: 'Loyiha',
  chat_members: 'Chat a’zosi',
};

const OP: Record<string, { label: string; tone: 'success' | 'info' | 'danger' | 'neutral' | 'warning' }> = {
  insert: { label: 'yaratildi', tone: 'success' },
  update: { label: 'o‘zgartirildi', tone: 'info' },
  delete: { label: 'o‘chirildi', tone: 'danger' },
};

const ACTION: Record<string, { label: string; tone: 'success' | 'info' | 'danger' | 'neutral' | 'warning' }> = {
  'content.approved': { label: 'tasdiqlandi', tone: 'success' },
  'content.changes_requested': { label: 'o‘zgartirish so‘raldi', tone: 'warning' },
  'content.version_submitted': { label: 'versiya yuborildi', tone: 'info' },
  'file.removed': { label: 'fayl o‘chirildi', tone: 'danger' },
  'subscription.assigned': { label: 'tarif biriktirildi', tone: 'success' },
  'account.created': { label: 'akkaunt yaratildi', tone: 'success' },
  'account.status_changed': { label: 'akkaunt holati o‘zgardi', tone: 'warning' },
  'account.role_changed': { label: 'roli o‘zgardi', tone: 'warning' },
  'account.password_reset': { label: 'parol tiklandi', tone: 'warning' },
};

function describe(action: string, entity: string): { what: string; op: string; tone: 'success' | 'info' | 'danger' | 'neutral' | 'warning' } {
  const [first, second] = action.split('.');
  const known = OP[second ?? ''];
  if (known && ENTITY[first]) return { what: ENTITY[first], op: known.label, tone: known.tone };
  const special = ACTION[action];
  if (special) return { what: ENTITY[entity] ?? entity, op: special.label, tone: special.tone };
  return { what: ENTITY[entity] ?? entity, op: action, tone: 'warning' };
}

type Json = Record<string, unknown> | null;

/** Only the fields that actually changed; secrets and noise are never shown. */
function diff(oldValues: Json, newValues: Json): { key: string; from: string; to: string }[] {
  const hidden = new Set(['updated_at', 'created_at', 'search_vector']);
  const keys = new Set([...Object.keys(oldValues ?? {}), ...Object.keys(newValues ?? {})]);
  const show = (v: unknown) => {
    if (v == null) return '—';
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return formatShortDateTime(v);
    return (typeof v === 'object' ? JSON.stringify(v) : String(v)).slice(0, 140);
  };
  return [...keys]
    .filter((k) => !hidden.has(k) && JSON.stringify(oldValues?.[k]) !== JSON.stringify(newValues?.[k]))
    .slice(0, 12)
    .map((k) => ({ key: k, from: show(oldValues?.[k]), to: show(newValues?.[k]) }));
}

type Search = { entity?: string; actor?: string; from?: string; to?: string; q?: string; page?: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission('audit.read');
  const params = await searchParams;
  const page = Math.max(0, Number(params.page ?? 0) || 0);
  const supabase = await createClient();

  let query = supabase
    .from('audit_logs')
    .select('id, occurred_at, action, entity_type, entity_id, old_values, new_values, actor:profiles!audit_logs_actor_id_fkey(full_name), client:clients(name)', { count: 'exact' })
    .order('occurred_at', { ascending: false })
    .range(page * PAGE, page * PAGE + PAGE - 1);
  if (params.entity) query = query.eq('entity_type', params.entity);
  if (params.actor) query = query.eq('actor_id', params.actor);
  if (params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from)) query = query.gte('occurred_at', `${params.from}T00:00:00+05:00`);
  if (params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to)) query = query.lte('occurred_at', `${params.to}T23:59:59+05:00`);
  if (params.q?.trim()) query = query.ilike('action', `%${params.q.trim().replace(/[%_\\]/g, '\\$&')}%`);

  const [{ data: rows, count, error }, staff] = await Promise.all([
    query,
    supabase.from('profiles').select('id, full_name, employee:employees!inner(user_id)').is('deleted_at', null).order('full_name'),
  ]);
  if (error) throw error;
  const total = count ?? 0;
  const link = (p: number) => {
    const next = new URLSearchParams(Object.entries({ ...params, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `/audit?${next.toString()}`;
  };

  return (
    <div>
      <PageHeader eyebrow="Tizim" title="Audit log" description="Kim, qachon, nimani o‘zgartirgani. Yozuvlarni o‘zgartirib yoki o‘chirib bo‘lmaydi." />
      <Card className="mb-6">
        <form className="grid gap-3 md:grid-cols-[1fr_1fr_150px_150px_1fr_auto]" method="get">
          <select name="entity" defaultValue={params.entity ?? ''} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" aria-label="Bo‘lim">
            <option value="">Barcha bo‘limlar</option>
            {Object.entries(ENTITY).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select name="actor" defaultValue={params.actor ?? ''} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" aria-label="Kim">
            <option value="">Barcha xodimlar</option>
            {(staff.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
          <input type="date" name="from" defaultValue={params.from ?? ''} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" aria-label="Dan" />
          <input type="date" name="to" defaultValue={params.to ?? ''} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" aria-label="Gacha" />
          <input name="q" defaultValue={params.q ?? ''} placeholder="Amal (masalan: approved)" className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" aria-label="Amal" />
          <button type="submit" className={buttonClass('primary')}>
            Filtrlash
          </button>
        </form>
      </Card>

      {!rows || rows.length === 0 ? (
        <EmptyRow>Tanlangan filtr bo‘yicha yozuv yo‘q.</EmptyRow>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const d = describe(r.action, r.entity_type);
              const changes = diff(r.old_values as Json, r.new_values as Json);
              return (
                <li key={r.id} className="px-5 py-3">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
                      <span className="w-32 shrink-0 text-[13px] tabular-nums text-muted">{formatShortDateTime(r.occurred_at)}</span>
                      <span className="min-w-40 flex-1 text-sm">
                        <span className="font-medium">{r.actor?.full_name ?? 'Tizim'}</span>
                        <span className="text-muted">{` · ${d.what}`}</span>
                        {r.client?.name ? <span className="text-muted">{` · ${r.client.name}`}</span> : null}
                      </span>
                      <Badge tone={d.tone}>{d.op}</Badge>
                      <span className="text-[12px] text-subtle group-open:hidden">{changes.length ? `${changes.length} maydon` : ''}</span>
                    </summary>
                    {changes.length ? (
                      <table className="mt-3 w-full text-[13px]">
                        <tbody className="divide-y divide-line">
                          {changes.map((c) => (
                            <tr key={c.key}>
                              <td className="w-48 py-1.5 pr-3 font-mono text-muted">{c.key}</td>
                              <td className="py-1.5 pr-3 text-danger line-through decoration-danger/40">{c.from}</td>
                              <td className="py-1.5 text-success">{c.to}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="mt-2 text-[13px] text-muted">{`${r.action} · ${r.entity_id ?? ''}`}</p>
                    )}
                  </details>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="mt-5 flex items-center justify-between text-sm text-muted">
        <span>{`${total} ta yozuv · ${page * PAGE + 1}–${Math.min(total, page * PAGE + PAGE)}`}</span>
        <div className="flex gap-2">
          {page > 0 ? (
            <Link href={link(page - 1)} className={buttonClass('secondary')}>
              ← Oldingi
            </Link>
          ) : null}
          {(page + 1) * PAGE < total ? (
            <Link href={link(page + 1)} className={buttonClass('secondary')}>
              Keyingi →
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
