import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ActionButton, AssetUpload, GenerateNow, MemoryForm } from '@/components/agents/controls';
import { ProfileForm, type ProfileValues } from '@/components/agents/forms';
import { ItemCards } from '@/components/agents/ItemCards';
import { PageHeader } from '@/components/panel/PageHeader';
import { EmptyRow } from '@/components/panel/Stat';
import { Badge } from '@/components/ui/Badge';
import { Card, SectionTitle } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { Tabs } from '@/components/ui/Tabs';
import { agentIgConfig } from '@/lib/agents/connect';
import { db, signed } from '@/lib/agents/server';
import { itemsWhere } from '@/lib/agents/views';
import { agencyDateKey, formatShortDateTime } from '@/lib/time';

export const metadata: Metadata = { title: 'Agents · Profil' };
export const dynamic = 'force-dynamic';

const TABS = ['kontent', 'korsatmalar', 'fayllar', 'instagram', 'xotira'] as const;
type Tab = (typeof TABS)[number];
const MEMORY_LABEL: Record<string, string> = {
  brand_rule: 'Qoida',
  preference: 'Afzallik',
  rejected_idea: 'Rad etilgan',
  correction: 'Tuzatish',
  research: 'Soha kuzatuvi',
  result: 'Natija',
  fact: 'Fakt',
  plan: 'Reja',
};
const IG_MSG: Record<string, { tone: 'success' | 'danger' | 'warning'; text: string }> = {
  connected: { tone: 'success', text: 'Instagram ulandi. Endi tasdiqlangan materiallar shu hisobga joylanadi (sinov rejimi o‘chirilganda va avto-nashr yoqilganda).' },
  mismatch: { tone: 'danger', text: 'Boshqa Instagram hisobi bilan kirildi — profilda ko‘rsatilgan hisob bilan kiring. Hech narsa saqlanmadi.' },
  taken: { tone: 'danger', text: 'Bu Instagram hisobi boshqa Agents profiliga ulangan.' },
  not_professional: { tone: 'danger', text: 'Hisob professional (Business yoki Creator) emas. Instagram sozlamalarida professional hisobga o‘tkazing.' },
  no_publish: { tone: 'warning', text: 'Nashr ruxsati berilmadi (instagram_business_content_publish). Qayta ulab, ruxsatlarning barchasini belgilang.' },
  denied: { tone: 'warning', text: 'Ruxsat berilmadi.' },
  failed: { tone: 'danger', text: 'Ulanishda xato.' },
  state: { tone: 'danger', text: 'Ulanish havolasi eskirgan — qayta urinib ko‘ring.' },
};

export default async function AgentProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ bolim?: string; yangi?: string; ig?: string; ig_user?: string; ig_msg?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: p } = await db().from('agent_profiles').select('*').eq('id', id).maybeSingle();
  if (!p) notFound();
  const tab: Tab = TABS.includes(sp.bolim as Tab) ? (sp.bolim as Tab) : sp.yangi ? 'kontent' : 'kontent';
  const today = agencyDateKey();
  const { data: conn } = await db().from('agent_ig_connections').select('*').eq('profile_id', id).maybeSingle();
  const connected = conn?.status === 'connected';
  const href = (t: Tab) => `/agents/profillar/${id}?bolim=${t}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={p.name}
        crumbs={[{ label: 'Agents', href: '/agents' }, { label: 'Profillar', href: '/agents/profillar' }, { label: p.name }]}
        description={[p.instagram_username ? `@${p.instagram_username}` : 'Instagram ko‘rsatilmagan', p.phone, p.business].filter(Boolean).join(' · ')}
        actions={
          <>
            {p.status === 'active' ? <Badge tone="success">Faol</Badge> : p.status === 'paused' ? <Badge tone="warning">Pauza</Badge> : <Badge>Arxiv</Badge>}
            {p.status === 'active' ? (
              <ActionButton act={{ kind: 'status', profileId: id, action: 'pause' }} confirm="Pauza: yangi materiallar va nashrlar to‘xtaydi. Davom etilsinmi?">
                Pauza
              </ActionButton>
            ) : (
              <ActionButton act={{ kind: 'status', profileId: id, action: 'resume' }} variant="primary">
                Qayta yoqish
              </ActionButton>
            )}
            {p.status !== 'archived' ? (
              <ActionButton act={{ kind: 'status', profileId: id, action: 'archive' }} variant="ghost" confirm="Profil arxivlansinmi? Tarix saqlanadi, yangi materiallar tayyorlanmaydi.">
                Arxivlash
              </ActionButton>
            ) : null}
          </>
        }
      />
      {sp.yangi ? (
        <Notice tone="success" title="Profil yaratildi">
          Yaqin 3 kunlik story va post navbatga qo‘yildi — agentlar bir necha daqiqada tayyorlaydi. Kutmasdan ko‘rish uchun “Hozir tayyorlash” tugmasini bosing.
        </Notice>
      ) : null}
      <Tabs
        active={tab}
        items={[
          { key: 'kontent', label: 'Kontent', href: href('kontent') },
          { key: 'korsatmalar', label: 'Ko‘rsatmalar', href: href('korsatmalar') },
          { key: 'fayllar', label: 'Logo va rasmlar', href: href('fayllar') },
          { key: 'instagram', label: 'Instagram', href: href('instagram') },
          { key: 'xotira', label: 'Xotira', href: href('xotira') },
        ]}
      />

      {tab === 'kontent' ? <ContentTab id={id} today={today} storiesPerDay={p.stories_per_day} active={p.status === 'active'} /> : null}

      {tab === 'korsatmalar' ? (
        <div className="max-w-4xl">
          <ProfileForm
            today={today}
            igConnected={connected}
            initial={{
              ...(p as unknown as ProfileValues),
              colors: (p.colors as Record<string, string>) ?? {},
              story_time: p.story_time.slice(0, 5),
              post_time: p.post_time.slice(0, 5),
            }}
          />
        </div>
      ) : null}

      {tab === 'fayllar' ? <AssetsTab id={id} /> : null}

      {tab === 'instagram' ? (
        <div className="flex max-w-3xl flex-col gap-4">
          {sp.ig && IG_MSG[sp.ig] ? (
            <Notice tone={IG_MSG[sp.ig].tone}>
              {IG_MSG[sp.ig].text}
              {sp.ig_user ? ` (@${sp.ig_user})` : ''}
              {sp.ig_msg ? ` ${sp.ig_msg}` : ''}
            </Notice>
          ) : null}
          <Card>
            <SectionTitle>Rasmiy Instagram ulanishi</SectionTitle>
            {conn && conn.status !== 'disconnected' ? (
              <div className="flex flex-col gap-2 text-sm">
                <p>
                  Hisob: <b>@{conn.username}</b> ({conn.account_type ?? 'professional'}) ·{' '}
                  {conn.status === 'connected' ? <Badge tone="success">ulangan</Badge> : <Badge tone="danger">qayta ulash kerak</Badge>}
                </p>
                <p className="text-muted">Ruxsatlar: {conn.permissions.join(', ') || '—'}</p>
                <p className="text-muted">Token muddati: {conn.token_expires_at ? formatShortDateTime(conn.token_expires_at) : '—'} (har hafta avtomatik yangilanadi)</p>
                {conn.last_error ? <p className="text-danger">{conn.last_error}</p> : null}
              </div>
            ) : (
              <p className="text-sm text-muted">
                Ulanmagan. Parol so‘ralmaydi — Instagram’ning o‘z oynasida ruxsat berasiz. Hisob professional (Business/Creator) bo‘lishi va profilda ko‘rsatilgan @username bilan bir xil bo‘lishi
                kerak.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {agentIgConfig().configured ? (
                <ActionButton act={{ kind: 'connect', profileId: id, force: !!conn }} variant="primary">
                  {conn && conn.status !== 'disconnected' ? 'Qayta ulash' : 'Instagram’ni ulash'}
                </ActionButton>
              ) : (
                <Notice tone="warning">Serverda Instagram ilovasi sozlanmagan (INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET).</Notice>
              )}
              {conn && conn.status !== 'disconnected' ? (
                <ActionButton act={{ kind: 'disconnect', profileId: id }} variant="danger" confirm="Instagram uzilsinmi? Avto-nashr o‘chadi.">
                  Uzish
                </ActionButton>
              ) : null}
            </div>
          </Card>
          <Card>
            <SectionTitle>API imkoniyatlari (rasmiy hujjat bo‘yicha)</SectionTitle>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              <li>Rasmli post (JPEG, 4:5) va rasmli story — API orqali chiqadi.</li>
              <li>Story’ga havola, so‘rovnoma stikeri va musiqa API orqali qo‘yilmaydi — material sahifasida “qo‘lda qo‘shish” eslatmasi chiqadi.</li>
              <li>24 soatda 100 tagacha nashr. Natijalar (qamrov, ko‘rishlar) nashrdan 20–72 soat keyin yig‘iladi.</li>
            </ul>
          </Card>
        </div>
      ) : null}

      {tab === 'xotira' ? <MemoryTab id={id} /> : null}
    </div>
  );
}

async function ContentTab({ id, today, storiesPerDay, active }: { id: string; today: string; storiesPerDay: number; active: boolean }) {
  const [upcoming, history, { data: dirs }] = await Promise.all([
    itemsWhere({ profileId: id, from: today, limit: 12 }),
    itemsWhere({ profileId: id, to: today, limit: 30, order: 'desc' }),
    db().from('agent_directions').select('id, title, description').eq('profile_id', id).eq('active', true).order('position'),
  ]);
  const past = history.filter((h) => h.targetDate < today);
  return (
    <div className="flex flex-col gap-6">
      {active ? (
        <Card>
          <SectionTitle>Hozir tayyorlash</SectionTitle>
          <GenerateNow profileId={id} today={today} storiesPerDay={storiesPerDay} />
          <p className="mt-2 text-[13px] text-subtle">Navbatni kutmasdan: g‘oyalar → eng yaxshisi → matn → rasm → sifat tekshiruvi. AI bilan 30–90 soniya.</p>
        </Card>
      ) : (
        <Notice tone="warning">Profil faol emas — yangi materiallar tayyorlanmaydi va joylanmaydi.</Notice>
      )}
      <section>
        <SectionTitle>Bugun va keyingi kunlar</SectionTitle>
        <ItemCards items={upcoming} empty="Rejadagi material yo‘q." />
      </section>
      <Card>
        <SectionTitle action={<ActionButton act={{ kind: 'directions', profileId: id }} busy="Tuzilmoqda…">{dirs?.length ? 'Qayta tuzish' : 'Yo‘nalishlarni tuzish'}</ActionButton>}>
          Kontent yo‘nalishlari
        </SectionTitle>
        {dirs?.length ? (
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {dirs.map((d) => (
              <li key={d.id}>
                <b>{d.title}</b> <span className="text-muted">— {d.description}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-subtle">5–7 ta rubrika (biznesga mos). G‘oyalar shu yo‘nalishlar va 16 xil kreativ formatdan tanlanadi.</p>
        )}
      </Card>
      <section>
        <SectionTitle>Tarix</SectionTitle>
        <ItemCards items={past} empty="Hali tarix yo‘q." />
      </section>
    </div>
  );
}

async function AssetsTab({ id }: { id: string }) {
  const { data: assets } = await db().from('agent_assets').select('id, kind, storage_path, note, width, height, file_name').eq('profile_id', id).order('created_at', { ascending: false });
  const urls = await signed((assets ?? []).map((a) => a.storage_path));
  const groups: [string, string][] = [
    ['logo', 'Logotip (eng oxirgisi ishlatiladi)'],
    ['product', 'Haqiqiy mahsulot rasmlari'],
    ['style', 'Uslub namunalari'],
    ['reference', 'Reference'],
  ];
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <SectionTitle>Yuklash</SectionTitle>
        <AssetUpload profileId={id} />
        <p className="mt-3 text-[13px] text-subtle">Mahsulot rasmi bo‘lsa, “mahsulot” formatidagi postlarda haqiqiy foto ishlatiladi. AI mahsulot ko‘rinishini o‘ylab chizmaydi.</p>
      </Card>
      {groups.map(([kind, label]) => {
        const list = (assets ?? []).filter((a) => a.kind === kind);
        return (
          <Card key={kind}>
            <SectionTitle>{label}</SectionTitle>
            {list.length ? (
              <div className="flex flex-wrap gap-3">
                {list.map((a) => (
                  <div key={a.id} className="flex w-36 flex-col gap-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={urls[a.storage_path]} alt={a.note ?? ''} className="h-28 w-36 rounded-lg border border-line bg-surface-2 object-contain" />
                    <p className="truncate text-[12px] text-muted">{a.note || a.file_name}</p>
                    <ActionButton act={{ kind: 'deleteAsset', assetId: a.id }} variant="ghost" confirm="Rasm o‘chirilsinmi?">
                      O‘chirish
                    </ActionButton>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyRow>Yo‘q</EmptyRow>
            )}
          </Card>
        );
      })}
    </div>
  );
}

async function MemoryTab({ id }: { id: string }) {
  const { data: memory } = await db().from('agent_memory').select('id, kind, content, meta, active, created_at').eq('profile_id', id).order('created_at', { ascending: false }).limit(100);
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <SectionTitle action={<ActionButton act={{ kind: 'research', profileId: id }} busy="Qidirilmoqda…">Soha kuzatuvini hozir o‘tkazish</ActionButton>}>Xotiraga qo‘shish</SectionTitle>
        <MemoryForm profileId={id} />
        <p className="mt-3 text-[13px] text-subtle">
          Xotira faqat shu profilga tegishli: qoidalar, tuzatishlar, rad etilgan g‘oyalar, soha kuzatuvi (manbalari bilan) va natijalar. Agentlar har materialda shularni hisobga oladi.
        </p>
      </Card>
      {memory?.length ? (
        <Card>
          <ul className="divide-y divide-line">
            {memory.map((m) => {
              const sources = ((m.meta as { sources?: { url: string; title: string }[] })?.sources ?? []).slice(0, 6);
              return (
                <li key={m.id} className={`flex gap-3 py-3 ${m.active ? '' : 'opacity-50'}`}>
                  <div className="w-28 shrink-0">
                    <Badge tone={m.kind === 'brand_rule' ? 'accent' : m.kind === 'rejected_idea' ? 'danger' : m.kind === 'research' ? 'info' : 'neutral'}>{MEMORY_LABEL[m.kind] ?? m.kind}</Badge>
                    <p className="mt-1 text-[11px] text-subtle">{formatShortDateTime(m.created_at)}</p>
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    {sources.length ? (
                      <ul className="mt-1.5 space-y-0.5 text-[12px]">
                        {sources.map((s) => (
                          <li key={s.url}>
                            <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
                              {s.title || s.url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  {m.active ? (
                    <ActionButton act={{ kind: 'forget', memoryId: m.id }} variant="ghost">
                      ×
                    </ActionButton>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <EmptyRow>Xotira bo‘sh.</EmptyRow>
      )}
    </div>
  );
}
