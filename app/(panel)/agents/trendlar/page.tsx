import type { Metadata } from 'next';

import { ActionButton } from '@/components/agents/controls';
import { TrendForm } from '@/components/agents/forms';
import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { db } from '@/lib/agents/server';
import { formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Trend Radar — AI agent' };

const FRESH: Record<string, string> = { fresh: 'Yangi', recent: 'Yaqinda', evergreen: 'Doimiy', unknown: 'Noma’lum' };

/**
 * Trend Radar: findings from OpenAI web search (kept only when the search itself returned the source) and links added
 * by admins. No Instagram internal data is claimed; nothing is scraped.
 */
export default async function Trends({ searchParams }: { searchParams: Promise<{ mijoz?: string }> }) {
  const sp = await searchParams;
  const { data: profiles } = await db().from('agent_profiles').select('id, name').neq('status', 'archived').order('name');
  const profile = (profiles ?? []).find((p) => p.id === sp.mijoz) ?? (profiles ?? [])[0];
  const [{ data: trends }, { data: lastJob }] = profile
    ? await Promise.all([
        db().from('agent_trends').select('*').eq('profile_id', profile.id).neq('status', 'dismissed').order('created_at', { ascending: false }).limit(60),
        db().from('agent_jobs').select('status, error, result, updated_at').eq('profile_id', profile.id).eq('kind', 'research').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])
    : [{ data: [] }, { data: null }];
  return (
    <div className="flex flex-col gap-4">
      <form method="get" className="flex flex-wrap items-center gap-2">
        <select name="mijoz" defaultValue={profile?.id ?? ''} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" aria-label="Mijoz">
          {(profiles ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="h-10 rounded-xl border border-line px-4 text-sm">Ko‘rsatish</button>
      </form>
      {profile ? (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <p className="font-semibold">Oxirgi tadqiqot</p>
              <p className="text-muted">
                {lastJob
                  ? `${formatShortDateTime(lastJob.updated_at)} · ${lastJob.status}${(lastJob.result as { message?: string } | null)?.message ? ` · ${(lastJob.result as { message?: string }).message}` : ''}${lastJob.error && lastJob.status === 'failed' ? ` · ${lastJob.error}` : ''}`
                  : 'Hali o‘tkazilmagan'}
              </p>
            </div>
            <ActionButton act={{ kind: 'research', profileId: profile.id }}>Hozir tadqiq qilish</ActionButton>
          </Card>
          <Card className="flex flex-col gap-3">
            <SectionTitle>Admin havolasi (Instagram post, Reel yoki maqola)</SectionTitle>
            <TrendForm profileId={profile.id} />
          </Card>
          {(trends ?? []).length ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {(trends ?? []).map((t) => (
                <li key={t.id}>
                  <Card className="flex h-full flex-col gap-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{t.title}</p>
                      <div className="flex shrink-0 flex-wrap gap-1">
                        <Badge tone={t.origin === 'admin' ? 'violet' : t.verified ? 'success' : 'warning'}>{t.origin === 'admin' ? 'Admin' : t.verified ? 'Manba tasdiqlangan' : 'Tasdiqlanmagan'}</Badge>
                        {t.status === 'used' ? <Badge tone="accent">Ishlatilgan ×{t.used_count}</Badge> : null}
                      </div>
                    </div>
                    {t.why ? <p>{t.why}</p> : null}
                    {t.adaptation ? (
                      <p>
                        <span className="text-muted">Moslashtirish: </span>
                        {t.adaptation}
                      </p>
                    ) : null}
                    {t.visual_direction ? (
                      <p className="text-muted">
                        Vizual: {t.visual_direction}
                        {t.content_format ? ` · ${t.content_format}` : ''}
                      </p>
                    ) : null}
                    <p className="text-[12px] text-subtle">
                      {FRESH[t.freshness ?? 'unknown']} · ishonch {t.confidence !== null ? `${Math.round(Number(t.confidence) * 100)}%` : '—'} · {formatShortDateTime(t.created_at)}
                    </p>
                    {t.source_url ? (
                      <a href={t.source_url} target="_blank" rel="noopener noreferrer nofollow" className="truncate text-[12.5px] text-accent-on-soft underline">
                        {t.source_title || t.source_platform || t.source_url}
                      </a>
                    ) : null}
                    <div className="mt-auto">
                      <ActionButton act={{ kind: 'dismissTrend', id: t.id }} variant="ghost">
                        Chetga olish
                      </ActionButton>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <Card className="py-8 text-center text-sm text-muted">Hali trend yo‘q. Tadqiqot faqat manbasi tasdiqlangan topilmalarni saqlaydi.</Card>
          )}
        </>
      ) : (
        <Card className="py-8 text-center text-sm text-muted">Avval mijoz qo‘shing.</Card>
      )}
    </div>
  );
}
