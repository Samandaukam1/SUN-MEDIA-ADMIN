'use client';

import { useActionState, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card, SectionTitle } from '@/components/ui/Card';
import { Checkbox, SelectInput, TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import {
  addAgentMetrics,
  addAgentTrend,
  briefPrefill,
  createAgentProfile,
  saveAgentSettings,
  saveBrandDna,
  saveCampaign,
  updateAgentProfile,
  uploadAgentAsset,
} from '@/lib/actions/agents';
import { idle, type ActionState } from '@/lib/actions/state';
import type { BrandDna } from '@/lib/agents/brand';

function StateNotice({ state }: { state: ActionState }) {
  if (state.status === 'idle') return null;
  return <Notice tone={state.status === 'success' ? 'success' : 'danger'}>{state.message}</Notice>;
}

const WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

export type ProfileValues = {
  id?: string;
  name: string;
  client_id: string | null;
  instagram_username: string | null;
  industry: string | null;
  phone: string | null;
  telegram: string | null;
  address: string | null;
  website: string | null;
  business: string | null;
  products: string | null;
  audience: string | null;
  region: string | null;
  language: string;
  goal: string | null;
  advantages: string | null;
  tone: string | null;
  instructions: string | null;
  facts: string | null;
  price_source: string | null;
  cta: string | null;
  forbidden: string | null;
  colors: Record<string, string>;
  stories_per_day: number;
  carousel_slides: number;
  carousel_every_days: number;
  active_weekdays: number[];
  story_time: string;
  post_time: string;
  post_start_date: string;
  research_enabled: boolean;
  monthly_image_limit: number;
  monthly_budget_usd: number | null;
  image_quality: string;
  image_tier: string;
  brief_session_id: string | null;
};

/**
 * The client's business brief and cadence. Creating one may start from a completed "Mijoz tahlili" interview: the
 * fields are filled from it for the admin to check — nothing is saved until "Saqlash".
 */
export function ProfileForm({ initial, today, clients, briefs }: { initial?: ProfileValues; today: string; clients: { id: string; name: string }[]; briefs?: { id: string; label: string }[] }) {
  const action = initial?.id ? updateAgentProfile.bind(null, initial.id) : createAgentProfile;
  const [state, formAction] = useActionState<ActionState, FormData>(action, idle);
  const [pre, setPre] = useState<Record<string, string>>({});
  const [preMsg, setPreMsg] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const e = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  const v = initial;
  const val = (k: keyof ProfileValues) => pre[k] ?? (v?.[k] as string | null | undefined) ?? '';
  const c = v?.colors ?? {};
  const days = v?.active_weekdays ?? [1, 2, 3, 4, 5, 6, 7];
  return (
    <form action={formAction} className="flex flex-col gap-5" key={key}>
      {!v?.id && briefs?.length ? (
        <Card className="flex flex-col gap-3">
          <SectionTitle>Mijoz tahlilidan to‘ldirish</SectionTitle>
          <div className="flex flex-wrap items-end gap-3">
            <SelectInput label="Yakunlangan tahlil" id="brief_pick" className="min-w-64" defaultValue="">
              <option value="">— tanlang —</option>
              {briefs.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </SelectInput>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                const id = (document.getElementById('brief_pick') as HTMLSelectElement | null)?.value ?? '';
                if (!id) return;
                const r = await briefPrefill(id);
                if (!r.ok) return setPreMsg(r.message);
                setPre(r.fields);
                setKey((k) => k + 1);
                setPreMsg('Maydonlar tahlildan to‘ldirildi — tekshirib, keyin saqlang. Tahlil eskirgan bo‘lishi mumkin.');
              }}
            >
              To‘ldirish
            </Button>
          </div>
          {preMsg ? <p className="text-[13px] text-muted">{preMsg}</p> : null}
        </Card>
      ) : null}
      <input type="hidden" name="brief_session_id" value={val('brief_session_id')} />

      <Card className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <SectionTitle>Mijoz</SectionTitle>
        </div>
        <TextInput label="Brend nomi" name="name" defaultValue={val('name')} error={e.name} required />
        <SelectInput label="Mijozlar bazasidagi kartasi (ixtiyoriy)" name="client_id" defaultValue={v?.client_id ?? ''}>
          <option value="">—</option>
          {clients.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </SelectInput>
        <TextInput label="Instagram" name="instagram" placeholder="@brend yoki havola" defaultValue={v?.instagram_username ? `@${v.instagram_username}` : ''} error={e.instagram_username} />
        <TextInput label="Soha" name="industry" placeholder="Masalan: ichimlik suvi ishlab chiqarish" defaultValue={val('industry')} />
        <TextArea label="Biznes nima qiladi" name="business" rows={2} defaultValue={val('business')} />
        <TextArea label="Mahsulot va xizmatlar (faqat haqiqiylari)" name="products_text" rows={2} defaultValue={v?.products ?? ''} />
        <TextArea label="Auditoriya" name="audience" rows={2} defaultValue={val('audience')} />
        <TextArea label="Marketing maqsadlari" name="goal" rows={2} defaultValue={val('goal')} />
        <TextArea label="Afzalliklar" name="advantages" rows={2} defaultValue={val('advantages')} />
        <TextInput label="Hudud" name="region" defaultValue={val('region')} />
        <TextArea label="Tasdiqlangan faktlar (raqam va da’volar faqat shu yerdan)" name="facts" rows={3} defaultValue={v?.facts ?? ''} />
        <TextArea label="Narxlar manbasi (tasdiqlangan)" name="price_source" rows={2} defaultValue={v?.price_source ?? ''} hint="Bo‘sh bo‘lsa narx va chegirma yozilmaydi" />
        <TextArea label="Qo‘shimcha ko‘rsatmalar" name="instructions" rows={3} defaultValue={val('instructions')} className="sm:col-span-2" />
        <TextInput label="Asosiy CTA" name="cta" defaultValue={v?.cta ?? ''} />
        <TextArea label="Taqiqlangan mavzu va iboralar" name="forbidden" rows={2} defaultValue={v?.forbidden ?? ''} />
        <SelectInput label="Kontent tili" name="language" defaultValue={v?.language ?? 'uz'}>
          <option value="uz">O‘zbek (lotin)</option>
          <option value="uz-cyrl">O‘zbek (kirill)</option>
          <option value="ru">Rus</option>
        </SelectInput>
        <TextInput label="Ohang" name="tone" defaultValue={v?.tone ?? ''} placeholder="Samimiy, premium, energik…" />
      </Card>

      <Card className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <SectionTitle>Aloqa (rasmda faqat shular ishlatiladi)</SectionTitle>
        </div>
        <TextInput label="Telefon" name="phone" defaultValue={v?.phone ?? ''} />
        <TextInput label="Telegram (matn sifatida)" name="telegram" defaultValue={v?.telegram ?? ''} />
        <TextInput label="Sayt" name="website" defaultValue={v?.website ?? ''} />
        <TextInput label="Manzil" name="address" defaultValue={v?.address ?? ''} />
        <div className="grid grid-cols-4 gap-3 sm:col-span-2">
          {(['primary', 'secondary', 'bg', 'text'] as const).map((k) => (
            <TextInput key={k} label={{ primary: 'Asosiy rang', secondary: 'Ikkinchi rang', bg: 'Fon', text: 'Matn' }[k]} name={`color_${k}`} defaultValue={c[k] ?? ''} placeholder="#RRGGBB" />
          ))}
        </div>
      </Card>

      <Card className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <SectionTitle>Jadval va budjet</SectionTitle>
        </div>
        <TextInput label="Kunlik Story soni" name="stories_per_day" type="number" min={1} max={10} defaultValue={v?.stories_per_day ?? 1} error={e.stories_per_day} />
        <TextInput label="Story vaqti" name="story_time" type="time" defaultValue={v?.story_time?.slice(0, 5) ?? '10:00'} />
        <TextInput label="Karusel vaqti" name="post_time" type="time" defaultValue={v?.post_time?.slice(0, 5) ?? '18:00'} />
        <TextInput label="Karusel har necha kunda" name="carousel_every_days" type="number" min={1} max={14} defaultValue={v?.carousel_every_days ?? 2} />
        <TextInput label="Karusel slaydlari" name="carousel_slides" type="number" min={2} max={10} defaultValue={v?.carousel_slides ?? 4} />
        <TextInput label="Karusel boshlanish sanasi" name="post_start_date" type="date" defaultValue={v?.post_start_date ?? today} />
        <fieldset className="sm:col-span-3">
          <legend className="mb-1.5 text-[13px] font-medium text-muted">Faol kunlar</legend>
          <div className="flex flex-wrap gap-3">
            {WEEKDAYS.map((d, i) => (
              <label key={d} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="weekday" value={i + 1} defaultChecked={days.includes(i + 1)} className="accent-[var(--accent)]" />
                {d}
              </label>
            ))}
          </div>
          {e.active_weekdays ? <p className="text-[13px] text-danger">{e.active_weekdays}</p> : null}
        </fieldset>
        <TextInput label="Oylik rasm limiti" name="monthly_image_limit" type="number" min={0} defaultValue={v?.monthly_image_limit ?? 120} />
        <TextInput label="Oylik budjet ($, ixtiyoriy)" name="monthly_budget_usd" defaultValue={v?.monthly_budget_usd ?? ''} hint="Narx sozlamalarda berilgan bo‘lsa ishlaydi" />
        <SelectInput label="Rasm sifati" name="image_quality" defaultValue={v?.image_quality ?? 'medium'}>
          <option value="low">Past (arzon)</option>
          <option value="medium">O‘rta</option>
          <option value="high">Yuqori</option>
        </SelectInput>
        <SelectInput label="Rasm modeli" name="image_tier" defaultValue={v?.image_tier ?? 'premium'}>
          <option value="premium">Premium (batafsil)</option>
          <option value="fast">Tez</option>
        </SelectInput>
        <Checkbox label="Haftalik trend tadqiqoti" name="research_enabled" defaultChecked={v?.research_enabled ?? true} />
      </Card>

      <StateNotice state={state} />
      <div>
        <SubmitButton>{v?.id ? 'Saqlash' : 'Mijozni qo‘shish'}</SubmitButton>
      </div>
    </form>
  );
}

/** Brand DNA: colours, typography, voice, slogans, contacts, rules. */
export function DnaForm({ profileId, dna, colors, tone, fonts }: { profileId: string; dna: BrandDna; colors: Record<string, string>; tone: string | null; fonts: { id: string; label: string }[] }) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveBrandDna.bind(null, profileId), idle);
  const list = (xs: string[]) => xs.join('\n');
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Card className="grid gap-4 sm:grid-cols-4">
        <div className="sm:col-span-4">
          <SectionTitle>Ranglar</SectionTitle>
        </div>
        {(['primary', 'secondary', 'bg', 'text'] as const).map((k) => (
          <div key={k} className="flex items-end gap-2">
            <TextInput label={{ primary: 'Asosiy', secondary: 'Ikkinchi', bg: 'Fon', text: 'Matn' }[k]} name={`color_${k}`} defaultValue={colors[k] ?? ''} placeholder="#RRGGBB" />
            {colors[k] ? <span aria-hidden className="mb-2 size-7 shrink-0 rounded-lg border border-line" style={{ background: colors[k] }} /> : null}
          </div>
        ))}
        <TextArea label="Qo‘shimcha aksent ranglar" name="accents" rows={2} defaultValue={list(dna.accents)} hint="#RRGGBB, har qatorda bittadan" />
        <TextArea label="Ruxsat etilgan gradientlar" name="gradients" rows={2} defaultValue={list(dna.gradients)} />
        <TextArea label="Taqiqlangan ranglar" name="forbidden_colors" rows={2} defaultValue={list(dna.forbidden_colors)} />
        <TextInput label="Rang tolerantligi (1–40)" name="color_tolerance" type="number" min={1} max={40} defaultValue={dna.color_tolerance} />
      </Card>
      <Card className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <SectionTitle>Tipografiya</SectionTitle>
        </div>
        <TextInput label="Sarlavha shrifti (nomi)" name="heading_font" defaultValue={dna.typography.heading} />
        <TextInput label="Matn shrifti (nomi)" name="body_font" defaultValue={dna.typography.body} />
        <SelectInput label="Sarlavha shrift fayli" name="heading_font_asset" defaultValue={dna.typography.heading_font_asset ?? ''} hint="TTF/OTF Aktivlar bo‘limiga yuklanadi; bo‘lmasa Unbounded">
          <option value="">Standart (Unbounded)</option>
          {fonts.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </SelectInput>
        <SelectInput label="Matn shrift fayli" name="body_font_asset" defaultValue={dna.typography.body_font_asset ?? ''}>
          <option value="">Standart (Inter)</option>
          {fonts.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </SelectInput>
      </Card>
      <Card className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <SectionTitle>Ovoz va qoidalar</SectionTitle>
        </div>
        <TextInput label="Ohang" name="tone" defaultValue={tone ?? ''} />
        <TextInput label="Vizual uslub" name="style" defaultValue={dna.style} placeholder="Premium minimalizm, studiya yorug‘ligi…" />
        <TextArea label="Pozitsiya" name="positioning" rows={2} defaultValue={dna.positioning} />
        <TextArea label="Rasmiy shiorlar" name="slogans" rows={2} defaultValue={list(dna.slogans)} hint="Har qatorda bittadan, o‘zgartirmasdan ishlatiladi" />
        <TextArea label="Kopirayting qoidalari" name="copy_rules" rows={3} defaultValue={dna.copy_rules} />
        <TextArea label="CTA qoidalari" name="cta_rules" rows={2} defaultValue={dna.cta_rules} />
        <TextArea label="Majburiy eslatma (disclaimer)" name="disclaimers" rows={2} defaultValue={dna.disclaimers} />
        <TextArea label="Taqiqlangan so‘zlar" name="forbidden_words" rows={2} defaultValue={list(dna.forbidden_words)} />
        <TextArea label="Taqiqlangan dizayn elementlari" name="forbidden_design" rows={2} defaultValue={dna.forbidden_design} />
        <TextArea label="Brend heshteglari" name="hashtags" rows={2} defaultValue={list(dna.hashtags)} />
      </Card>
      <Card className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <SectionTitle>Aloqa va joylashuv</SectionTitle>
        </div>
        <TextArea label="Qo‘shimcha telefonlar (tasdiqlangan)" name="phones" rows={2} defaultValue={list(dna.contacts.phones)} />
        <TextInput label="Telegram" name="dna_telegram" defaultValue={dna.contacts.telegram} />
        <TextInput label="Instagram" name="dna_instagram" defaultValue={dna.contacts.instagram} />
        <TextInput label="Sayt" name="dna_website" defaultValue={dna.contacts.website} />
        <TextInput label="Manzil" name="dna_address" defaultValue={dna.contacts.address} />
        <TextInput label="Ish vaqti" name="hours" defaultValue={dna.contacts.hours} />
        <SelectInput label="Aloqa rasmda" name="show_contacts" defaultValue={dna.show_contacts}>
          <option value="cta_only">Faqat CTA kadrida</option>
          <option value="always">Har kadrda</option>
          <option value="never">Ko‘rsatilmasin</option>
        </SelectInput>
        <SelectInput label="Logo joyi" name="logo_position" defaultValue={dna.logo_position}>
          <option value="top-left">Yuqori chap</option>
          <option value="top-center">Yuqori markaz</option>
          <option value="top-right">Yuqori o‘ng</option>
          <option value="bottom-right">Pastki o‘ng</option>
        </SelectInput>
      </Card>
      <StateNotice state={state} />
      <div>
        <SubmitButton>Brand DNA’ni saqlash</SubmitButton>
      </div>
    </form>
  );
}

const KINDS: [string, string][] = [
  ['logo', 'Asosiy logo'],
  ['logo_light', 'Logo (to‘q fon uchun, oq)'],
  ['logo_dark', 'Logo (och fon uchun, to‘q)'],
  ['product', 'Mahsulot packshot'],
  ['packaging', 'Qadoq'],
  ['service', 'Xizmat surati'],
  ['venue', 'Joy / interyer'],
  ['people', 'Xodim / mutaxassis'],
  ['illustration', 'Illyustratsiya'],
  ['previous_design', 'Oldingi dizayn'],
  ['reference', 'Brend namunasi'],
  ['campaign', 'Kampaniya materiali'],
  ['font', 'Shrift (TTF/OTF)'],
];

export function AssetUploadForm({ profileId, replaces }: { profileId: string; replaces?: { id: string; label: string; kind: string } }) {
  const [state, formAction] = useActionState<ActionState, FormData>(uploadAgentAsset.bind(null, profileId), idle);
  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2">
      {replaces ? <input type="hidden" name="replaces" value={replaces.id} /> : null}
      <SelectInput label="Turi" name="kind" defaultValue={replaces?.kind ?? 'product'}>
        {KINDS.map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </SelectInput>
      <TextInput label="Fayl" name="file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg,.ttf,.otf" required hint="PNG (shaffof fon tavsiya), JPEG, WebP, xavfsiz SVG yoki TTF/OTF; ≤ 2,8 MB" />
      <TextInput label="Nomi" name="title" placeholder="Masalan: 0,5 L shisha" />
      <TextInput label="Mahsulot nomi (aniq)" name="product_name" />
      <TextInput label="Izoh / qayerda ishlatish" name="note" />
      <TextInput label="Manba" name="source" placeholder="Mijoz bergan, studiya suratga olishi…" />
      <TextInput label="Teglar" name="tags" placeholder="yoz, aksiya" className="sm:col-span-2" />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <StateNotice state={state} />
        <div>
          <SubmitButton>{replaces ? `“${replaces.label}”ni almashtirish` : 'Yuklash'}</SubmitButton>
        </div>
      </div>
    </form>
  );
}

export function CampaignForm({ profileId }: { profileId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveCampaign.bind(null, profileId), idle);
  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2">
      <TextInput label="Kampaniya" name="title" required />
      <TextInput label="Ustuvorlik (0–10)" name="priority" type="number" min={0} max={10} defaultValue={5} />
      <TextInput label="Boshlanish" name="starts_on" type="date" />
      <TextInput label="Tugash" name="ends_on" type="date" />
      <TextArea label="Tasdiqlangan shartlar (narx, chegirma, muddat — faqat haqiqiylari)" name="terms" rows={3} className="sm:col-span-2" />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <StateNotice state={state} />
        <div>
          <SubmitButton>Qo‘shish</SubmitButton>
        </div>
      </div>
    </form>
  );
}

export function TrendForm({ profileId }: { profileId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(addAgentTrend.bind(null, profileId), idle);
  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2">
      <TextInput label="Havola (Instagram post/Reel yoki maqola)" name="url" required placeholder="https://" />
      <TextInput label="Qisqa sarlavha" name="title" required />
      <TextArea label="Nega muhim" name="why" rows={2} />
      <TextArea label="Brendga qanday moslashtirish" name="adaptation" rows={2} />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <StateNotice state={state} />
        <div>
          <SubmitButton>Trend qo‘shish</SubmitButton>
        </div>
      </div>
    </form>
  );
}

export function MetricsForm({ itemId }: { itemId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(addAgentMetrics.bind(null, itemId), idle);
  const fields: [string, string][] = [
    ['reach', 'Qamrov'],
    ['impressions', 'Ko‘rsatilish'],
    ['views', 'Ko‘rishlar'],
    ['likes', 'Layk'],
    ['comments', 'Izoh'],
    ['shares', 'Ulashish'],
    ['saves', 'Saqlash'],
    ['profile_visits', 'Profilga o‘tish'],
    ['website_clicks', 'Saytga o‘tish'],
    ['leads', 'So‘rovlar'],
    ['sales', 'Sotuv (o‘lchangan)'],
  ];
  return (
    <form action={formAction} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {fields.map(([k, l]) => (
        <TextInput key={k} label={l} name={k} inputMode="numeric" />
      ))}
      <SelectInput label="Manba" name="source" defaultValue="instagram_insights">
        <option value="instagram_insights">Instagram Insights</option>
        <option value="meta_business">Meta Business Suite</option>
        <option value="crm">CRM</option>
        <option value="manual_other">Boshqa (izohda)</option>
      </SelectInput>
      <TextInput label="Davr boshi" name="period_start" type="date" />
      <TextInput label="Davr oxiri" name="period_end" type="date" />
      <TextInput label="Izoh" name="note" />
      <div className="col-span-2 flex flex-col gap-2 sm:col-span-4">
        <StateNotice state={state} />
        <div>
          <SubmitButton variant="secondary">Natijani saqlash</SubmitButton>
        </div>
      </div>
    </form>
  );
}

export function SettingsForm({ s }: { s: { automation_enabled: boolean; prepare_lead_hours: number; late_grace_minutes: number; daily_ai_limit: number; daily_image_limit: number; monthly_image_limit: number; monthly_budget_usd: number | null; revision_warn: number; research_weekday: number; story_safe_top: number; story_safe_bottom: number } }) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveAgentSettings, idle);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Card className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <SectionTitle>Avtomatika</SectionTitle>
        </div>
        <Checkbox label="Jadval bo‘yicha avtomatik yaratish" name="automation_enabled" defaultChecked={s.automation_enabled} description="O‘chirilsa faqat “Hozir yaratish” ishlaydi" />
        <TextInput label="Necha soat oldin tayyorlash" name="prepare_lead_hours" type="number" min={1} max={72} defaultValue={s.prepare_lead_hours} />
        <TextInput label="Kechikish chegarasi (daqiqa)" name="late_grace_minutes" type="number" min={5} max={1440} defaultValue={s.late_grace_minutes} />
        <SelectInput label="Trend tadqiqoti kuni" name="research_weekday" defaultValue={s.research_weekday}>
          {WEEKDAYS.map((d, i) => (
            <option key={d} value={i + 1}>
              {d}
            </option>
          ))}
        </SelectInput>
        <TextInput label="Story yuqori xavfsiz zona (px)" name="story_safe_top" type="number" defaultValue={s.story_safe_top} />
        <TextInput label="Story pastki xavfsiz zona (px)" name="story_safe_bottom" type="number" defaultValue={s.story_safe_bottom} />
      </Card>
      <Card className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <SectionTitle>Xarajat nazorati (agentlik bo‘yicha)</SectionTitle>
        </div>
        <TextInput label="Kunlik AI matn chaqiruvlari" name="daily_ai_limit" type="number" min={0} defaultValue={s.daily_ai_limit} />
        <TextInput label="Kunlik rasm limiti" name="daily_image_limit" type="number" min={0} defaultValue={s.daily_image_limit} />
        <TextInput label="Oylik rasm limiti" name="monthly_image_limit" type="number" min={0} defaultValue={s.monthly_image_limit} />
        <TextInput label="Oylik budjet ($)" name="monthly_budget_usd" defaultValue={s.monthly_budget_usd ?? ''} hint="Narxlar .env’da berilsa, shu summadan oshganda to‘xtaydi" />
        <TextInput label="Qayta yaratishlar soni ogohlantirishi" name="revision_warn" type="number" min={1} defaultValue={s.revision_warn} />
      </Card>
      <StateNotice state={state} />
      <div>
        <SubmitButton>Saqlash</SubmitButton>
      </div>
    </form>
  );
}
