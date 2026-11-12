'use client';

import { useActionState } from 'react';

import { Card, SectionTitle } from '@/components/ui/Card';
import { Checkbox, SelectInput, TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createAgentProfile, editAgentItem, saveAgentSettings, updateAgentProfile } from '@/lib/actions/agents';
import { idle, type ActionState } from '@/lib/actions/state';

export type ProfileValues = {
  id?: string;
  name: string;
  instagram_username: string | null;
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
  good_examples: string | null;
  bad_examples: string | null;
  colors: Record<string, string>;
  stories_per_day: number;
  story_time: string;
  post_time: string;
  post_start_date: string;
  approval_mode: string;
  auto_publish: boolean;
  research_enabled: boolean;
};

function StateNotice({ state }: { state: ActionState }) {
  if (state.status === 'idle') return null;
  return <Notice tone={state.status === 'success' ? 'success' : 'danger'}>{state.message}</Notice>;
}

/** Profil ko'rsatmalari. Majburiy — faqat nom; qolganini keyin to'ldirsa ham bo'ladi. */
export function ProfileForm({ initial, today, igConnected }: { initial?: ProfileValues; today: string; igConnected?: boolean }) {
  const action = initial?.id ? updateAgentProfile.bind(null, initial.id) : createAgentProfile;
  const [state, formAction] = useActionState<ActionState, FormData>(action, idle);
  const e = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  const v = initial;
  const c = v?.colors ?? {};
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Card>
        <SectionTitle>Asosiy</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Profil (brend) nomi" name="name" required defaultValue={v?.name} error={e.name} placeholder="Masalan: Comfort Camera" />
          <TextInput label="Instagram sahifasi" name="instagram" defaultValue={v?.instagram_username ? `@${v.instagram_username}` : ''} error={e.instagram_username} placeholder="@brend yoki instagram.com/brend" hint="Nashr faqat shu hisobga ulanganda ishlaydi" />
          <TextInput label="Telefon raqami" name="phone" type="tel" defaultValue={v?.phone ?? ''} placeholder="+998 90 123 45 67" hint="Rasmlarning pastida ko‘rsatiladi" />
          <TextInput label="Telegram" name="telegram" defaultValue={v?.telegram ?? ''} placeholder="@brend" />
          <TextInput label="Manzil" name="address" defaultValue={v?.address ?? ''} />
          <TextInput label="Sayt" name="website" defaultValue={v?.website ?? ''} />
          <TextInput label="Biznes yo‘nalishi" name="business" defaultValue={v?.business ?? ''} placeholder="Xavfsizlik kameralari do‘koni" />
          <TextInput label="Hudud" name="region" defaultValue={v?.region ?? ''} placeholder="Toshkent" />
          <SelectInput label="Kontent tili" name="language" defaultValue={v?.language ?? 'uz'}>
            <option value="uz">O‘zbek (lotin)</option>
            <option value="uz-cyrl">O‘zbek (kirill)</option>
            <option value="ru">Rus</option>
          </SelectInput>
          <TextInput label="Harakatga chaqiriq (CTA)" name="cta" defaultValue={v?.cta ?? ''} placeholder="Bepul maslahat: Telegram’ga yozing" error={e.cta} />
        </div>
        {!v ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="logo" className="text-[13px] font-medium text-muted">
                Logotip (PNG, shaffof fon tavsiya)
              </label>
              <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="product_files" className="text-[13px] font-medium text-muted">
                Haqiqiy mahsulot rasmlari (bir nechta)
              </label>
              <input id="product_files" name="product_files" type="file" accept="image/png,image/jpeg,image/webp" multiple className="text-sm" />
            </div>
          </div>
        ) : null}
      </Card>

      <Card>
        <SectionTitle>Agentlar uchun ko‘rsatmalar</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextArea label="Mahsulot va xizmatlar" name="products_text" defaultValue={v?.products ?? ''} rows={3} placeholder="Vergul bilan: IP kameralar, domofonlar, o‘rnatish…" />
          <TextArea label="Maqsadli auditoriya" name="audience" defaultValue={v?.audience ?? ''} rows={3} />
          <TextArea label="Asosiy biznes maqsadi" name="goal" defaultValue={v?.goal ?? ''} rows={2} placeholder="Masalan: Telegram orqali so‘rov olish" />
          <TextArea label="Brend afzalliklari" name="advantages" defaultValue={v?.advantages ?? ''} rows={2} />
          <TextInput label="Yozish ohangi" name="tone" defaultValue={v?.tone ?? ''} placeholder="Samimiy, hazilomuz, mutaxassisona…" />
          <TextArea label="Erkin ko‘rsatmalar" name="instructions" defaultValue={v?.instructions ?? ''} rows={2} placeholder="Har doim “siz” deb murojaat qil; ruscha so‘z ishlatma…" />
          <TextArea label="Foydalanish mumkin bo‘lgan faktlar" name="facts" defaultValue={v?.facts ?? ''} rows={3} hint="Agentlar raqam va da’voni faqat shu yerdan oladi" />
          <TextArea label="Narx va aksiyalar manbasi" name="price_source" defaultValue={v?.price_source ?? ''} rows={3} hint="Bo‘sh bo‘lsa — narx, chegirma va muddat yozilmaydi" />
          <TextArea label="Taqiqlangan mavzu va iboralar" name="forbidden" defaultValue={v?.forbidden ?? ''} rows={2} placeholder="Vergul bilan: eng arzon, siyosat…" />
          <div />
          <TextArea label="Yaxshi kontent namunalari" name="good_examples" defaultValue={v?.good_examples ?? ''} rows={3} />
          <TextArea label="Yomon kontent namunalari" name="bad_examples" defaultValue={v?.bad_examples ?? ''} rows={3} />
        </div>
      </Card>

      <Card>
        <SectionTitle>Dizayn ranglari</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-4">
          <TextInput label="Asosiy (aksent)" name="color_primary" defaultValue={c.primary ?? ''} placeholder="#D4FC18" />
          <TextInput label="Ikkinchi" name="color_secondary" defaultValue={c.secondary ?? ''} placeholder="#1B2A4A" />
          <TextInput label="Fon" name="color_bg" defaultValue={c.bg ?? ''} placeholder="#0B1220" />
          <TextInput label="Matn" name="color_text" defaultValue={c.text ?? ''} placeholder="#FFFFFF" />
        </div>
        <p className="mt-3 text-[13px] text-subtle">Shriftlar: Unbounded (sarlavha) va Inter (matn) — oʻzbekcha ʻ ʼ harflari bilan. Kontrast past bo‘lsa matn rangi avtomatik tuzatiladi.</p>
      </Card>

      <Card>
        <SectionTitle>Jadval va tasdiqlash</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextInput label="Kunlik story kadrlari" name="stories_per_day" type="number" min={1} max={10} defaultValue={v?.stories_per_day ?? 3} error={e.stories_per_day} />
          <TextInput label="Story vaqti (har kuni)" name="story_time" type="time" defaultValue={v?.story_time ?? '09:00'} error={e.story_time} />
          <TextInput label="Post vaqti (kunora)" name="post_time" type="time" defaultValue={v?.post_time ?? '08:00'} error={e.post_time} />
          <TextInput label="Kunora post boshlanish sanasi" name="post_start_date" type="date" defaultValue={v?.post_start_date ?? today} error={e.post_start_date} />
          <SelectInput label="Tasdiqlash" name="approval_mode" defaultValue={v?.approval_mode ?? 'manual'}>
            <option value="manual">Avval inson tasdig‘i (tavsiya)</option>
            <option value="auto">Sifatdan o‘tsa — avtomatik tasdiq</option>
          </SelectInput>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <Checkbox
            name="auto_publish"
            label="Avtomatik joylash"
            description={igConnected ? 'Tasdiqlangan materiallar belgilangan vaqtda Instagram’ga chiqadi.' : 'Instagram ulangandan keyin ishlaydi. Hozircha yoqilsa ham hech narsa chiqmaydi.'}
            defaultChecked={v?.auto_publish ?? false}
          />
          <Checkbox name="research_enabled" label="Haftalik soha kuzatuvi" description="Haftada bir marta internetdan (manbali) soha yangiliklari — g‘oyalar uchun ilhom." defaultChecked={v?.research_enabled ?? true} />
        </div>
      </Card>

      <StateNotice state={state} />
      <div>
        <SubmitButton size="lg">{v ? 'Saqlash' : 'Profilni yaratish'}</SubmitButton>
      </div>
    </form>
  );
}

export function EditItemForm({ itemId, frames, caption, hashtags, isPost }: { itemId: string; frames: { role: string; headline: string; body: string; cta: string }[]; caption: string; hashtags: string; isPost: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(editAgentItem.bind(null, itemId), idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="frames" value={frames.length} />
      {frames.map((f, i) => (
        <div key={i} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-[1fr_1.4fr_0.8fr]">
          <input type="hidden" name={`role_${i}`} value={f.role} />
          <TextInput label={`${i + 1}-kadr sarlavha`} name={`headline_${i}`} defaultValue={f.headline} maxLength={90} />
          <TextArea label="Matn" name={`body_${i}`} defaultValue={f.body} rows={2} maxLength={260} />
          <TextInput label="CTA" name={`cta_${i}`} defaultValue={f.cta} maxLength={48} />
        </div>
      ))}
      <TextArea label={isPost ? 'Caption' : 'Ichki izoh (story’ga chiqmaydi)'} name="caption" defaultValue={caption} rows={isPost ? 6 : 2} maxLength={2200} />
      {isPost ? <TextInput label="Heshteglar" name="hashtags" defaultValue={hashtags} /> : <input type="hidden" name="hashtags" value="" />}
      <StateNotice state={state} />
      <div>
        <SubmitButton variant="secondary">Saqlash va qayta chizish</SubmitButton>
      </div>
    </form>
  );
}

export function SettingsForm({ s }: { s: { publishing_enabled: boolean; simulate: boolean; prepare_lead_hours: number; late_grace_minutes: number; daily_ai_limit: number; regen_limit: number; research_weekday: number } }) {
  const [state, action] = useActionState<ActionState, FormData>(saveAgentSettings, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Checkbox name="simulate" label="Sinov rejimi" description="Yoqilgan bo‘lsa Instagram’ga hech narsa yuborilmaydi — nashr simulyatsiya qilinadi (“Sinov nashri”)." defaultChecked={s.simulate} />
      <Checkbox name="publishing_enabled" label="Avtomatik nashrlar" description="O‘chirilsa barcha profillar uchun avtomatik joylash to‘xtaydi (tayyorlash davom etadi)." defaultChecked={s.publishing_enabled} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextInput label="Nashrdan necha soat oldin tayyorlansin" name="prepare_lead_hours" type="number" min={1} max={72} defaultValue={s.prepare_lead_hours} />
        <TextInput label="Kechikishga ruxsat (daqiqa)" name="late_grace_minutes" type="number" min={5} max={1440} defaultValue={s.late_grace_minutes} hint="Undan keyin avtomatik chiqmaydi" />
        <TextInput label="Kunlik AI chaqiruv limiti" name="daily_ai_limit" type="number" min={0} max={5000} defaultValue={s.daily_ai_limit} />
        <TextInput label="Bitta material uchun qayta yaratish limiti" name="regen_limit" type="number" min={1} max={20} defaultValue={s.regen_limit} />
        <SelectInput label="Soha kuzatuvi kuni" name="research_weekday" defaultValue={String(s.research_weekday)}>
          {['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'].map((d, i) => (
            <option key={d} value={i + 1}>
              {d}
            </option>
          ))}
        </SelectInput>
      </div>
      <StateNotice state={state} />
      <div>
        <SubmitButton>Saqlash</SubmitButton>
      </div>
    </form>
  );
}
