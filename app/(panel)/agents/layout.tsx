import { ActionButton } from '@/components/agents/controls';
import { Notice } from '@/components/ui/Notice';
import { loadSettings, requireAgents } from '@/lib/agents/server';

/** Agents: faqat `agents.manage` ruxsati borlar (Tizim egasi va adminlar). */
export default async function AgentsLayout({ children }: { children: React.ReactNode }) {
  await requireAgents();
  const s = await loadSettings();
  return (
    <div className="pb-24">
      <div className="mb-6 flex flex-col gap-3">
        {s.simulate ? (
          <Notice tone="info" title="Sinov rejimi yoqilgan">
            Instagram’ga hech narsa yuborilmaydi — tasdiqlangan materiallar “Sinov nashri” bo‘ladi. Haqiqiy nashr: Agents → Sozlamalar.
          </Notice>
        ) : null}
        {!s.publishing_enabled ? (
          <div className="flex flex-wrap items-center gap-3">
            <Notice tone="warning" title="Barcha avtomatik nashrlar to‘xtatilgan">
              Tayyorlash va tasdiqlash davom etadi, lekin hech narsa avtomatik chiqmaydi.
            </Notice>
            <ActionButton act={{ kind: 'publishing', on: true }}>Qayta yoqish</ActionButton>
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
