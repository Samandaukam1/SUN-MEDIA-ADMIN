import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { ActionButton, GenerateNow, MemoryForm } from '@/components/agents/controls';
import { AssetUploadForm, CampaignForm, DnaForm, ProfileForm, type ProfileValues } from '@/components/agents/forms';
import { ItemCards } from '@/components/agents/ItemCards';
import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { parseDna } from '@/lib/agents/brand';
import { FORMATS } from '@/lib/agents/creative';
import { buildInsights, type MetricRow } from '@/lib/agents/insights';
import { db, signed } from '@/lib/agents/server';
import { OBJECTIVES } from '@/lib/agents/strategy';
import { itemsWhere } from '@/lib/agents/views';
import { agencyDateKey } from '@/lib/time';

export const metadata: Metadata = { title: 'Mijoz — AI agent' };

const TABS = [
  ['umumiy', 'Umumiy'],
  ['dna', 'Brand DNA'],
  ['aktivlar', 'Aktivlar'],
  ['kampaniyalar', 'Kampaniyalar'],
  ['kontent', 'Kontent'],
  ['natijalar', 'Natijalar'],
] as const;

const KIND_LABEL: Record<string, string> = {
  logo: 'Logo',
  logo_light: 'Logo (oq)',
  logo_dark: 'Logo (to‘q)',
  product: 'Mahsulot',
  packaging: 'Qadoq',
  service: 'Xizmat',
  venue: 'Joy',
  people: 'Odamlar',
  illustration: 'Illyustratsiya',
  previous_design: 'Oldingi dizayn',
  reference: 'Namuna',
  campaign: 'Kampaniya',
  typography: 'Tipografiya',
  style: 'Uslub',
  font: 'Shrift',
};

export default async function AgentProfile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; q?: string; arxiv?: string; almashtir?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? 'umumiy';
  const { data: p } = await db().from('agent_profiles').select('*').eq('id', id).maybeSingle();
  if (!p) notFound();
  const dna = parseDna(p.brand_dna);

  const header = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/agents/profillar" className="text-[13px] text-muted hover:text-ink">
            ← Mijozlar
          </Link>
          <h2 className="mt-1 text-[20px] font-semibold">{p.name}</h2>
          <p className="text-[13px] text-muted">{[p.instagram_username ? `@${p.instagram_username}` : null, p.industry].filter(Boolean).join(' · ') || '—'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={p.status === 'active' ? 'success' : 'warning'} dot>
            {p.status === 'active' ? 'Faol' : p.status === 'paused' ? 'Pauza' : 'Arxiv'}
          </Badge>
          {p.emergency_pause ? <Badge tone="danger">Favqulodda to‘xtatilgan</Badge> : null}
        </div>
      </div>
      <nav className="flex flex-wrap gap-1" aria-label="Mijoz bo‘limlari">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`/agents/profillar/${id}?tab=${k}`} aria-current={tab === k ? 'page' : undefined} className={`rounded-full px-3 py-1.5 text-[13px] ${tab === k ? 'bg-surface-2 font-semibold text-ink' : 'text-muted hover:text-ink'}`}>
            {l}
          </Link>
        ))}
      </nav>
    </div>
  );

  if (tab === 'umumiy') {
    const [{ data: clients }, { data: memory }] = await Promise.all([
      db().from('clients').select('id, name').order('name').limit(500),
      db().from('agent_memory').select('id, kind, content, created_at').eq('profile_id', id).eq('active', true).in('kind', ['brand_rule', 'preference', 'fact', 'plan', 'correction', 'rejected_idea']).order('created_at', { ascending: false }).limit(40),
    ]);
    const values: ProfileValues = { ...p, products: p.products, colors: (p.colors ?? {}) as Record<string, string>, monthly_budget_usd: p.monthly_budget_usd === null ? null : Number(p.monthly_budget_usd) };
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card className="flex flex-col gap-4">
          <SectionTitle>Boshqaruv</SectionTitle>
          <GenerateNow profileId={id} carousel={p.carousel_enabled} />
          <div className="flex flex-wrap gap-2">
            {p.status === 'active' ? <ActionButton act={{ kind: 'status', profileId: id, action: 'pause' }}>Pauza</ActionButton> : <ActionButton act={{ kind: 'status', profileId: id, action: 'resume' }}>Davom ettirish</ActionButton>}
            {p.emergency_pause ? (
              <ActionButton act={{ kind: 'status', profileId: id, action: 'unstop' }}>To‘xtatishni olib tashlash</ActionButton>
            ) : (
              <ActionButton act={{ kind: 'status', profileId: id, action: 'stop' }} variant="danger" confirm="Bu mijoz uchun barcha pullik generatsiya darhol to‘xtatilsinmi?">
                Favqulodda to‘xtatish
              </ActionButton>
            )}
            <ActionButton act={{ kind: 'research', profileId: id }}>Trend tadqiqoti</ActionButton>
            <ActionButton act={{ kind: 'status', profileId: id, action: 'archive' }} variant="ghost" confirm="Mijoz arxivlansinmi? Kontent va fayllar saqlanadi.">
              Arxivlash
            </ActionButton>
          </div>
        </Card>
        <ProfileForm initial={values} today={agencyDateKey()} clients={(clients ?? []).map((c) => ({ id: c.id, name: c.name }))} />
        <Card className="flex flex-col gap-3">
          <SectionTitle>Agent xotirasi (qoidalar, tuzatishlar, rad etilgan g‘oyalar)</SectionTitle>
          <MemoryForm profileId={id} />
          <ul className="flex flex-col divide-y divide-line">
            {(memory ?? []).map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <span>
                  <span className="text-[12px] text-subtle">{m.kind} · </span>
                  {m.content}
                </span>
                <ActionButton act={{ kind: 'forget', memoryId: m.id }} variant="ghost">
                  O‘chirish
                </ActionButton>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );
  }

  if (tab === 'dna') {
    const { data: fonts } = await db().from('agent_assets').select('id, title, file_name').eq('profile_id', id).eq('kind', 'font').is('archived_at', null);
    return (
      <div className="flex flex-col gap-6">
        {header}
        <DnaForm profileId={id} dna={dna} colors={(p.colors ?? {}) as Record<string, string>} tone={p.tone} fonts={(fonts ?? []).map((f) => ({ id: f.id, label: f.title ?? f.file_name ?? 'Shrift' }))} />
      </div>
    );
  }

  if (tab === 'aktivlar') {
    const archived = sp.arxiv === '1';
    let q = db().from('agent_assets').select('*').eq('profile_id', id).order('created_at', { ascending: false }).limit(300);
    q = archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
    const { data: assets } = await q;
    const needle = (sp.q ?? '').toLowerCase().trim();
    const list = (assets ?? []).filter((a) => !needle || [a.title, a.product_name, a.note, a.file_name, ...(a.tags ?? [])].some((v) => v?.toLowerCase().includes(needle)));
    const urls = await signed(list.filter((a) => a.kind !== 'font').map((a) => a.storage_path));
    const replacing = list.find((a) => a.id === sp.almashtir);
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card className="flex flex-col gap-3">
          <SectionTitle>{replacing ? 'Faylni almashtirish (eskisi arxivga o‘tadi)' : 'Fayl yuklash'}</SectionTitle>
          <AssetUploadForm profileId={id} replaces={replacing ? { id: replacing.id, label: replacing.title ?? replacing.file_name ?? 'fayl', kind: replacing.kind } : undefined} />
          <p className="text-[12px] text-subtle">Logo va mahsulot fotosi AI tomonidan qayta chizilmaydi — ular rasm ustiga aslicha qo‘yiladi. Mahsulot uchun shaffof fonli PNG eng yaxshi natija beradi.</p>
        </Card>
        <form className="flex flex-wrap items-end gap-2" method="get">
          <input type="hidden" name="tab" value="aktivlar" />
          <input name="q" defaultValue={sp.q ?? ''} placeholder="Qidirish: nom, teg, izoh" className="h-10 min-w-60 rounded-xl border border-line bg-surface px-3 text-sm" aria-label="Qidirish" />
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="arxiv" value="1" defaultChecked={archived} /> Arxiv
          </label>
          <button className="h-10 rounded-xl border border-line px-4 text-sm">Ko‘rsatish</button>
        </form>
        {Object.entries(
          list.reduce<Record<string, typeof list>>((acc, a) => {
            (acc[a.kind] ??= []).push(a);
            return acc;
          }, {}),
        ).map(([kind, items]) => (
          <section key={kind}>
            <SectionTitle>{KIND_LABEL[kind] ?? kind}</SectionTitle>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {items.map((a) => (
                <li key={a.id}>
                  <Card className="flex h-full flex-col gap-2 p-3">
                    {a.kind === 'font' ? (
                      <div className="flex h-28 items-center justify-center rounded-lg bg-surface-2 text-[13px]">{a.file_name}</div>
                    ) : urls[a.storage_path] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={urls[a.storage_path]} alt={a.title ?? ''} loading="lazy" className="h-28 w-full rounded-lg bg-[repeating-conic-gradient(#0000000d_0_25%,transparent_0_50%)] bg-[length:16px_16px] object-contain" />
                    ) : null}
                    <p className="line-clamp-1 text-[13px] font-medium">{a.product_name ?? a.title ?? a.file_name}</p>
                    <p className="text-[11.5px] text-subtle">
                      {a.width && a.height ? `${a.width}×${a.height}` : ''} {a.has_alpha ? '· shaffof' : ''} · v{a.version}
                    </p>
                    <div className="mt-auto flex flex-wrap gap-1">
                      {archived ? (
                        <ActionButton act={{ kind: 'archiveAsset', assetId: a.id, restore: true }} variant="ghost">
                          Qaytarish
                        </ActionButton>
                      ) : (
                        <>
                          <Link href={`/agents/profillar/${id}?tab=aktivlar&almashtir=${a.id}`} className="rounded-lg px-2 py-1 text-[12px] text-muted hover:bg-surface-2">
                            Almashtirish
                          </Link>
                          <ActionButton act={{ kind: 'archiveAsset', assetId: a.id }} variant="ghost">
                            Arxiv
                          </ActionButton>
                        </>
                      )}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!list.length ? <Card className="py-8 text-center text-sm text-muted">Fayl yo‘q.</Card> : null}
      </div>
    );
  }

  if (tab === 'kampaniyalar') {
    const { data: campaigns } = await db().from('agent_campaigns').select('*').eq('profile_id', id).order('created_at', { ascending: false });
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card className="flex flex-col gap-3">
          <SectionTitle>Yangi kampaniya</SectionTitle>
          <CampaignForm profileId={id} />
        </Card>
        <ul className="flex flex-col gap-2">
          {(campaigns ?? []).map((c) => (
            <li key={c.id}>
              <Card className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{c.title}</p>
                  <p className="text-[12.5px] text-muted">
                    {c.starts_on ?? '…'} — {c.ends_on ?? '…'} · ustuvorlik {c.priority}
                  </p>
                  {c.terms ? <p className="mt-1 text-[13px] whitespace-pre-wrap">{c.terms}</p> : <p className="mt-1 text-[12.5px] text-subtle">Shartlar kiritilmagan — narx/chegirma yozilmaydi.</p>}
                </div>
                <ActionButton act={{ kind: 'campaign', id: c.id, active: !c.active }} variant="ghost">
                  {c.active ? 'O‘chirish' : 'Yoqish'}
                </ActionButton>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (tab === 'kontent') {
    const items = await itemsWhere({ profileId: id, order: 'desc', limit: 60 });
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ItemCards items={items} empty="Hali kontent yo‘q." />
      </div>
    );
  }

  // natijalar
  const { data: metricRows } = await db().from('agent_metrics').select('item_id, reach, views, likes, comments, shares, saves, leads, created_at, item:agent_items(kind, plan, target_date)').eq('profile_id', id).order('created_at', { ascending: false }).limit(300);
  const rows: MetricRow[] = (metricRows ?? []).map((m) => {
    const it = m.item as unknown as { kind: string; plan: { format?: string; objective?: string } } | null;
    return { itemId: m.item_id, kind: it?.kind ?? '', format: it?.plan?.format ?? null, objective: it?.plan?.objective ?? null, reach: m.reach, views: m.views, likes: m.likes, comments: m.comments, shares: m.shares, saves: m.saves, leads: m.leads };
  });
  const labels = { ...Object.fromEntries(FORMATS.map((f) => [f.key, f.name])), ...OBJECTIVES };
  const ins = buildInsights(rows, labels);
  return (
    <div className="flex flex-col gap-6">
      {header}
      <Card className="flex flex-col gap-2">
        <SectionTitle>Tavsiyalar</SectionTitle>
        {ins.recommendations.length ? (
          <ul className="list-disc pl-5 text-sm">
            {ins.recommendations.map((r) => (
              <li key={r.text}>
                {r.text} <span className="text-subtle">({r.basis})</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Xulosa uchun ma’lumot yetarli emas: har formatda kamida 3 ta materialning natijasi kerak. Natijalar kontent sahifasida kiritiladi.</p>
        )}
      </Card>
      <Card>
        <SectionTitle>Formatlar bo‘yicha</SectionTitle>
        <table className="w-full text-sm">
          <thead className="text-left text-[12px] text-muted">
            <tr>
              <th className="py-1">Format</th>
              <th>Material</th>
              <th>O‘rt. qamrov</th>
              <th>O‘rt. jalb</th>
              <th>So‘rovlar</th>
            </tr>
          </thead>
          <tbody>
            {ins.byFormat.map((g) => (
              <tr key={g.key} className="border-t border-line">
                <td className="py-1.5">{labels[g.key as keyof typeof labels] ?? g.key}</td>
                <td>{g.n}</td>
                <td>{g.reach ?? '—'}</td>
                <td>{g.engagement !== null ? `${g.engagement}%` : '—'}</td>
                <td>{g.leads ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!ins.byFormat.length ? <p className="mt-2 text-sm text-muted">Hali natija kiritilmagan.</p> : null}
      </Card>
    </div>
  );
}
