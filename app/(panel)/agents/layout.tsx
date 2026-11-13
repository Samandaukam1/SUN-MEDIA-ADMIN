import { AgentNav } from '@/components/agents/AgentNav';
import { Notice } from '@/components/ui/Notice';
import { aiOnline } from '@/lib/agents/ai';
import { imagesReady } from '@/lib/agents/images';
import { loadSettings, requireAgents } from '@/lib/agents/server';

/** AI kontent agent: only staff with agents.manage (the system owner and admins). Nothing is published from here. */
export default async function AgentsLayout({ children }: { children: React.ReactNode }) {
  await requireAgents();
  const s = await loadSettings();
  const online = aiOnline() && imagesReady();
  return (
    <div className="flex flex-col gap-6 pb-24">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-[22px] font-semibold">AI kontent agent</h1>
          <p className="text-[13px] text-muted">Story va karusellarni yaratadi, siz tasdiqlaysiz va yuklab olib, Instagram’ga qo‘lda joylaysiz. Avtomatik nashr yo‘q.</p>
        </div>
        <AgentNav />
        {!online ? (
          <Notice tone="warning" title="OpenAI ulanmagan">
            OPENAI_API_KEY serverda yo‘q — generatsiya ishlamaydi (soxta natija yaratilmaydi). Sozlamalar → Modellarni tekshirish.
          </Notice>
        ) : null}
        {!s.automation_enabled ? (
          <Notice tone="info" title="Avtomatik jadval o‘chirilgan">
            Faqat “Hozir yaratish” ishlaydi. Sozlamalarda yoqish mumkin.
          </Notice>
        ) : null}
      </div>
      {children}
    </div>
  );
}
