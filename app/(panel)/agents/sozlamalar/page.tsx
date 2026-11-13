import type { Metadata } from 'next';
import Link from 'next/link';

import { ModelCheck } from '@/components/agents/controls';
import { SettingsForm } from '@/components/agents/forms';
import { Card, SectionTitle } from '@/components/ui/Card';
import { aiConfig } from '@/lib/brief/openai';
import { imageConfig } from '@/lib/agents/images';
import { db, loadSettings } from '@/lib/agents/server';
import { COST_MODE_LABEL, type CostMode } from '@/lib/agents/cost';
import { costMonth, usageMonth } from '@/lib/agents/views';

export const metadata: Metadata = { title: 'Sozlamalar — AI agent' };

export default async function AgentSettings() {
  const [s, usage, { data: profiles }, costs] = await Promise.all([loadSettings(), usageMonth(), db().from('agent_profiles').select('id, name, monthly_image_limit'), costMonth()]);
  const usd = (v: number | null) => (v === null ? '—' : '$' + v.toFixed(v < 1 ? 3 : 2));
  const cfg = aiConfig();
  const img = imageConfig();
  const name = new Map((profiles ?? []).map((p) => [p.id, p]));
  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3">
        <SectionTitle>OpenAI modellari (server muhitidan)</SectionTitle>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          <li>
            Kontent: <code>{cfg.models.content}</code> <span className="text-subtle">(OPENAI_CONTENT_MODEL)</span>
          </li>
          <li>
            Strategiya: <code>{cfg.models.strategy}</code> <span className="text-subtle">(OPENAI_STRATEGY_MODEL)</span>
          </li>
          <li>
            Rasm (tejamkor / muvozanatli): <code>{img.economy}</code> <span className="text-subtle">(CONTENT_IMAGE_MODEL)</span>, sifat <code>{img.quality}</code>, tejamkorda <code>{img.previewQuality}</code>
          </li>
          <li>
            Rasm (premium): <code>{img.premium}</code> <span className="text-subtle">(CONTENT_PREMIUM_IMAGE_MODEL)</span>
          </li>
          <li>
            Rasm (tez / tahrir): <code>{img.fast}</code> <span className="text-subtle">(OPENAI_IMAGE_EDIT_MODEL)</span>
          </li>
          <li>
            Generatsiya o‘lchami: <code>{img.size}</code> → kompozitsiyada 1080×1920 / 1080×1350
          </li>
          <li>Narx: OpenAI rasmiy narxlari bo‘yicha taxmin (rasm chiqishi 30 USD / 1 mln token; matn modellari o‘z narxida)</li>
        </ul>
        <ModelCheck />
      </Card>

      <Card className="flex flex-col gap-3">
        <SectionTitle>Shu oy sarfi</SectionTitle>
        <p className="text-sm">
          {usage.images} rasm · {usage.calls} matn chaqiruvi · {usage.tokens.toLocaleString('ru-RU')} token · {usage.searches} veb-qidiruv · {usage.cost !== null ? `~$${usage.cost.toFixed(2)}` : 'narx noma’lum'}
        </p>
        <table className="w-full text-sm">
          <thead className="text-left text-[12px] text-muted">
            <tr>
              <th className="py-1">Mijoz</th>
              <th>Rasm</th>
              <th>Limit</th>
              <th>Matn</th>
              <th>Narx</th>
            </tr>
          </thead>
          <tbody>
            {[...usage.byProfile.entries()].map(([pid, u]) => (
              <tr key={pid} className="border-t border-line">
                <td className="py-1">{name.get(pid)?.name ?? '—'}</td>
                <td>{u.images}</td>
                <td>{name.get(pid)?.monthly_image_limit ?? '—'}</td>
                <td>{u.calls}</td>
                <td>{u.cost !== null ? `$${u.cost.toFixed(2)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="flex flex-col gap-3">
        <SectionTitle>Xarajat paneli — mijozlar kesimida (shu oy)</SectionTitle>
        <p className="text-[13px] text-muted">
          AI rasm faqat sahna kerak bo‘lganda chiziladi; shablon va qayta kadrlangan fonlar API so‘rovisiz (0 USD). Narx — OpenAI qaytargan token soni × rasmiy narx (taxminiy).
        </p>
        {costs.clients.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="text-left text-[12px] text-muted">
                <tr>
                  <th className="py-1">Mijoz</th>
                  <th>Rejim</th>
                  <th>AI rasm</th>
                  <th>Tahrir</th>
                  <th>Qayta yaratish</th>
                  <th>AI’siz fon</th>
                  <th>So‘rovlar</th>
                  <th>1 rasm o‘rtacha</th>
                  <th>Oylik sarf</th>
                  <th>Qolgan budjet</th>
                </tr>
              </thead>
              <tbody>
                {costs.clients.map((c) => {
                  const p = costs.names.get(c.profileId);
                  return (
                    <tr key={c.profileId} className="border-t border-line align-top">
                      <td className="py-1">
                        <Link href={`/agents/profillar/${c.profileId}`} className="font-medium hover:underline">
                          {p?.name ?? '—'}
                        </Link>
                        {c.models.length ? <p className="text-[12px] text-subtle">{c.models.join(', ')}</p> : null}
                        {c.warn ? <p className="text-[12px] text-danger">{c.warn}</p> : null}
                      </td>
                      <td>{p ? (COST_MODE_LABEL[p.cost_mode as CostMode] ?? p.cost_mode) : '—'}</td>
                      <td>
                        {c.images}
                        {c.imageLimit ? <span className="text-subtle"> / {c.imageLimit}</span> : null}
                      </td>
                      <td>{c.edits}</td>
                      <td>{c.regenerations}</td>
                      <td>{c.freeFrames}</td>
                      <td>{c.requests}</td>
                      <td>{usd(c.perImage)}</td>
                      <td>
                        {usd(c.total)}
                        {c.imageCost !== null ? (
                          <span className="block text-[12px] text-subtle">
                            rasm {usd(c.imageCost)} · matn {usd(c.textCost)}
                          </span>
                        ) : null}
                      </td>
                      <td>{c.budget === null ? 'chegara yo‘q' : usd(c.remaining)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">Shu oy AI sarfi yo‘q.</p>
        )}
        {costs.top.length ? (
          <div>
            <p className="mb-1 text-[13px] font-medium">Eng qimmat materiallar</p>
            <ul className="space-y-0.5 text-[13px]">
              {costs.top.map((t) => (
                <li key={t.itemId}>
                  <Link href={`/agents/kontent/${t.itemId}`} className="hover:underline">
                    {costs.names.get(t.profileId)?.name ?? '—'}
                  </Link>{' '}
                  — {usd(t.cost)}, {t.images} ta AI rasm
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <SettingsForm
        s={{
          automation_enabled: s.automation_enabled,
          prepare_lead_hours: s.prepare_lead_hours,
          late_grace_minutes: s.late_grace_minutes,
          daily_ai_limit: s.daily_ai_limit,
          daily_image_limit: s.daily_image_limit,
          monthly_image_limit: s.monthly_image_limit,
          monthly_budget_usd: s.monthly_budget_usd === null ? null : Number(s.monthly_budget_usd),
          max_images_per_item: s.max_images_per_item,
          max_job_cost_usd: s.max_job_cost_usd === null ? null : Number(s.max_job_cost_usd),
          daily_budget_usd: s.daily_budget_usd === null ? null : Number(s.daily_budget_usd),
          revision_warn: s.revision_warn,
          research_weekday: s.research_weekday,
          story_safe_top: s.story_safe_top,
          story_safe_bottom: s.story_safe_bottom,
        }}
      />
      <Card className="text-[13px] text-muted">
        Ruxsatlar: bo‘limga faqat “SMM agentlar” (agents.manage) ruxsati bor xodimlar kiradi — Rollar bo‘limida beriladi. Instagram’ga avtomatik nashr 1.0 versiyada yo‘q; Telegram ishlatilmaydi.
      </Card>
    </div>
  );
}
