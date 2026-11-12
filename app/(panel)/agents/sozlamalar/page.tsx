import type { Metadata } from 'next';

import { SettingsForm } from '@/components/agents/forms';
import { PageHeader } from '@/components/panel/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { CopyButton } from '@/components/ui/CopyButton';
import { db, loadSettings } from '@/lib/agents/server';
import { connectionsStatus } from '@/lib/agents/views';

export const metadata: Metadata = { title: 'Agents · Sozlamalar' };
export const dynamic = 'force-dynamic';

export default async function AgentSettings() {
  const s = await loadSettings();
  const c = connectionsStatus();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: usage }, { data: profiles }] = await Promise.all([
    db().from('agent_usage').select('profile_id, provider, model, input_tokens, output_tokens, web_searches, cost_usd').gte('created_at', since).limit(20000),
    db().from('agent_profiles').select('id, name'),
  ]);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.name]));
  const rows = new Map<string, { name: string; calls: number; searches: number; tokens: number; cost: number; unknown: number }>();
  for (const u of usage ?? []) {
    const key = u.profile_id ?? '—';
    const r = rows.get(key) ?? { name: names.get(key) ?? 'Umumiy', calls: 0, searches: 0, tokens: 0, cost: 0, unknown: 0 };
    r.calls++;
    r.searches += u.web_searches;
    r.tokens += u.input_tokens + u.output_tokens;
    if (u.cost_usd === null) r.unknown++;
    else r.cost += Number(u.cost_usd);
    rows.set(key, r);
  }
  const route = (r: { provider: string; model: string } | null) => (r ? <Badge tone="success">{`${r.provider} · ${r.model}`}</Badge> : <Badge tone="warning">ulanmagan</Badge>);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Sozlamalar" crumbs={[{ label: 'Agents', href: '/agents' }, { label: 'Sozlamalar' }]} />
      <Card className="max-w-4xl">
        <SectionTitle>Nashr va jadval</SectionTitle>
        <SettingsForm s={s} />
      </Card>
      <Card className="max-w-4xl">
        <SectionTitle>AI ulanishlari</SectionTitle>
        <ul className="flex flex-col gap-2 text-sm">
          <li className="flex flex-wrap justify-between gap-2">
            <span>G‘oyalar (8 ta variant, arzon model)</span>
            {route(c.idea)}
          </li>
          <li className="flex flex-wrap justify-between gap-2">
            <span>Yakuniy matn (sifatli model)</span>
            {route(c.write)}
          </li>
          <li className="flex flex-wrap justify-between gap-2">
            <span>Haftalik soha kuzatuvi (internet, manbali)</span>
            {route(c.research)}
          </li>
        </ul>
        <p className="mt-3 text-[13px] text-muted">
          Kalitlar faqat serverda (Vercel → Environment Variables), panelda ko‘rinmaydi. <b>GEMINI_API_KEY</b> — Google AI Studio’dan bepul (kartasiz): g‘oyalar bepul. <b>ANTHROPIC_API_KEY</b> bo‘lsa yakuniy matn
          Claude Sonnet 5.5 da yoziladi (taxminan $0.02–0.04 bir material). Faqat bittasi bo‘lsa ham ishlaydi. AGENTS_AI=gemini qilib to‘liq bepul rejimga o‘tish mumkin.
        </p>
      </Card>
      <Card className="max-w-4xl">
        <SectionTitle>Instagram ilovasi (Meta)</SectionTitle>
        <ul className="flex flex-col gap-2 text-sm">
          <li className="flex flex-wrap justify-between gap-2">
            <span>INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET</span>
            {c.instagramApp ? <Badge tone="success">sozlangan</Badge> : <Badge tone="warning">sozlanmagan</Badge>}
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span>Meta ilovasiga qo‘shiladigan qaytish manzili</span>
            <span className="flex items-center gap-2">
              <code className="rounded bg-surface-2 px-2 py-0.5 text-[12px]">{c.redirectUri}</code>
              <CopyButton value={c.redirectUri} label="Nusxa" variant="ghost" />
            </span>
          </li>
          <li className="text-muted">Ruxsatlar: instagram_business_basic, instagram_business_content_publish, instagram_business_manage_insights.</li>
        </ul>
      </Card>
      <Card className="max-w-4xl">
        <SectionTitle>Oxirgi 30 kun: AI chaqiruvlari va taxminiy xarajat</SectionTitle>
        {rows.size ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[12px] text-subtle">
                <th className="py-1">Profil</th>
                <th>Chaqiruvlar</th>
                <th>Qidiruvlar</th>
                <th>Tokenlar</th>
                <th>Taxminiy $</th>
              </tr>
            </thead>
            <tbody>
              {[...rows.values()].map((r) => (
                <tr key={r.name} className="border-t border-line">
                  <td className="py-1.5">{r.name}</td>
                  <td>{r.calls}</td>
                  <td>{r.searches}</td>
                  <td>{r.tokens.toLocaleString('ru-RU')}</td>
                  <td>
                    {r.cost.toFixed(3)}
                    {r.unknown ? <span className="text-subtle"> (+{r.unknown} ta Gemini — narxsiz)</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-subtle">Hali chaqiruv yo‘q.</p>
        )}
        <p className="mt-2 text-[12px] text-subtle">Narx — Anthropic e’lon qilgan stavkalar bo‘yicha taxmin; haqiqiy hisob Anthropic Console’da.</p>
      </Card>
    </div>
  );
}
