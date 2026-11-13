import type { Metadata } from 'next';

import { ModelCheck } from '@/components/agents/controls';
import { SettingsForm } from '@/components/agents/forms';
import { Card, SectionTitle } from '@/components/ui/Card';
import { aiConfig } from '@/lib/brief/openai';
import { imageConfig } from '@/lib/agents/images';
import { db, loadSettings } from '@/lib/agents/server';
import { usageMonth } from '@/lib/agents/views';

export const metadata: Metadata = { title: 'Sozlamalar — AI agent' };

export default async function AgentSettings() {
  const [s, usage, { data: profiles }] = await Promise.all([loadSettings(), usageMonth(), db().from('agent_profiles').select('id, name, monthly_image_limit')]);
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
            Rasm (premium): <code>{img.premium}</code> <span className="text-subtle">(OPENAI_IMAGE_MODEL)</span>
          </li>
          <li>
            Rasm (tez / tahrir): <code>{img.fast}</code> <span className="text-subtle">(OPENAI_IMAGE_EDIT_MODEL)</span>
          </li>
          <li>
            Generatsiya o‘lchami: <code>{img.size}</code> → kompozitsiyada 1080×1920 / 1080×1350
          </li>
          <li>Narx: {img.priceIn !== null && img.priceOut !== null ? 'rasm narxi sozlangan' : 'rasm narxi sozlanmagan (xarajat faqat soni bilan nazorat qilinadi)'}</li>
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

      <SettingsForm
        s={{
          automation_enabled: s.automation_enabled,
          prepare_lead_hours: s.prepare_lead_hours,
          late_grace_minutes: s.late_grace_minutes,
          daily_ai_limit: s.daily_ai_limit,
          daily_image_limit: s.daily_image_limit,
          monthly_image_limit: s.monthly_image_limit,
          monthly_budget_usd: s.monthly_budget_usd === null ? null : Number(s.monthly_budget_usd),
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
