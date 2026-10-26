'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { currentDevice, disablePush, enablePush, isApple, pushState, type PushState } from '@/lib/pwa/client';
import { getBrowserClient } from '@/lib/supabase/client';
import { InstallSteps, type Tone } from './InstallGuide';

/**
 * Notification settings: push on this device, which kinds of notifications come as push, hidden previews, quiet hours,
 * muted chats and the person's devices. Kinds, previews and quiet hours apply to every device of the person (the
 * phone app too, which reads the same settings). Nothing is turned on without the person pressing a button.
 */

const KINDS: { key: string; label: string; hint: string; types: string[] }[] = [
  { key: 'group', label: 'Umumiy chat', hint: 'Jamoa guruhi va loyiha chatlaridagi yangi xabarlar', types: ['chat.group'] },
  { key: 'direct', label: 'Shaxsiy xabarlar', hint: 'Sizga shaxsan yozilgan xabarlar', types: ['chat.direct'] },
  { key: 'directive', label: 'Rahbar topshiriqlari', hint: 'Rahbar chatda topshiriq berganda', types: ['chat.directive'] },
  { key: 'tasks', label: 'Vazifalar', hint: 'Yangi vazifa, vaqti o‘zgardi, bekor qilindi, izoh, bajarildi', types: ['task.assigned', 'task.comment', 'task.completed', 'task.rescheduled', 'task.cancelled'] },
  {
    key: 'approvals',
    label: 'Kontent va tasdiqlash',
    hint: 'Ssenariy va kontent tasdig‘i, yangi kontent biriktirilganda',
    types: ['approval.requested', 'approval.internal_requested', 'approval.approved', 'approval.changes_requested', 'content.assigned', 'content.published'],
  },
  { key: 'reminders', label: 'Eslatmalar', hint: 'Muddat yaqinlashdi yoki o‘tdi, syomka eslatmalari', types: ['deadline.approaching', 'deadline.overdue', 'deadline.approval', 'shooting.assigned', 'shooting.reminder'] },
  { key: 'announcements', label: 'E’lonlar', hint: 'Kompaniya e’lonlari', types: ['announcement'] },
];

type Pref = { type: string; push_enabled: boolean; in_app_enabled: boolean };
type Settings = { hide_preview: boolean; quiet_start: string | null; quiet_end: string | null };
type DeviceRow = { id: string; platform: string; device_name: string | null; token: string; last_seen_at: string; last_success_at?: string | null };
type ChatRow = { room_id: string; name: string; muted: boolean };

const TZ = 'Asia/Tashkent';
const when = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ });

function deniedHelp(): string {
  const d = currentDevice();
  if (isApple(d)) return 'iPhone/iPad: Sozlamalar → Bildirishnomalar → Sun Media → «Bildirishnomalarga ruxsat» ni yoqing.';
  if (d.platform === 'android') return d.standalone ? 'Android: Sozlamalar → Ilovalar → Sun Media → Bildirishnomalar → yoqing.' : 'Manzil satridagi belgi → Ruxsatlar → Bildirishnomalar → Ruxsat berish.';
  if (d.platform === 'mac' && d.browser === 'safari') return 'Safari → Sozlamalar → Veb-saytlar → Bildirishnomalar → Sun Media: Ruxsat berish.';
  return 'Manzil satridagi qulf belgisi → Bildirishnomalar → Ruxsat berish. Kompyuterning o‘z bildirishnoma sozlamalarida ham brauzerga ruxsat bo‘lsin.';
}

function Switch({ on, onChange, label, dark }: { on: boolean; onChange: (v: boolean) => void; label: string; dark: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? (dark ? 'bg-[#d4fc18]' : 'bg-accent') : dark ? 'bg-white/15' : 'bg-surface-2 ring-1 ring-line'}`}
    >
      <span className={`absolute top-1 size-5 rounded-full shadow transition-all ${on ? `left-6 ${dark ? 'bg-[#050506]' : 'bg-accent-fg'}` : 'left-1 bg-white'}`} />
    </button>
  );
}

function Row({ title, hint, children, dark }: { title: string; hint?: ReactNode; children: ReactNode; dark: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 border-t py-3.5 first:border-t-0 ${dark ? 'border-white/[0.08]' : 'border-line'}`}>
      <div className="min-w-0">
        <p className="text-[14px] font-medium">{title}</p>
        {hint ? <p className={`mt-0.5 text-[12.5px] leading-snug ${dark ? 'text-[#a8a8ac]' : 'text-muted'}`}>{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function NotificationSettings({ userId, tone = 'panel' }: { userId: string; tone?: Tone }) {
  const dark = tone === 'dark';
  const c = {
    card: dark ? 'rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5 sm:p-6' : 'rounded-2xl border border-line bg-surface p-5 sm:p-6',
    muted: dark ? 'text-[#a8a8ac]' : 'text-muted',
    line: dark ? 'border-white/[0.08]' : 'border-line',
    accent: dark ? 'text-[#d4fc18]' : 'text-accent',
    button: dark ? 's-btn s-btn-lime' : 'inline-flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg disabled:opacity-60',
    ghost: dark ? 'inline-flex h-10 items-center rounded-full border border-white/15 px-4 text-[13.5px] font-medium text-white disabled:opacity-60' : 'inline-flex h-10 items-center rounded-xl border border-line px-4 text-sm font-medium disabled:opacity-60',
    input: dark ? 'h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[14px] text-white' : 'h-10 rounded-xl border border-line bg-surface px-3 text-sm',
  };

  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [settings, setSettings] = useState<Settings | null | 'missing'>(null);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [chats, setChats] = useState<ChatRow[]>([]);

  const load = useCallback(async () => {
    const db = getBrowserClient();
    const [p, s, d, ch] = await Promise.all([
      db.from('notification_preferences').select('type, push_enabled, in_app_enabled').eq('user_id', userId),
      db.from('push_settings' as never).select('hide_preview, quiet_start, quiet_end').eq('user_id', userId).maybeSingle(),
      db.from('push_tokens').select('id, platform, device_name, token, last_seen_at').eq('user_id', userId).is('revoked_at', null).order('last_seen_at', { ascending: false }),
      db.rpc('get_my_chats'),
    ]);
    setPrefs((p.data ?? []) as Pref[]);
    // Before the server update the table does not exist: those settings are hidden, not broken.
    setSettings(s.error ? 'missing' : ((s.data as Settings | null) ?? { hide_preview: false, quiet_start: null, quiet_end: null }));
    setDevices((d.data ?? []) as DeviceRow[]);
    setChats(((ch.data ?? []) as { room_id: string; kind: string; name: string | null; client_name: string | null; peer_name: string | null; muted: boolean | null; archived: boolean | null }[])
      .filter((r) => !r.archived)
      .map((r) => ({ room_id: r.room_id, name: r.kind === 'direct' ? (r.peer_name ?? 'Shaxsiy') : r.kind === 'project' ? (r.client_name ?? r.name ?? 'Loyiha') : (r.name ?? 'Jamoa'), muted: !!r.muted })));
  }, [userId]);

  useEffect(() => {
    void pushState().then(setPush, () => setPush({ kind: 'unsupported', why: 'api' }));
    void load();
  }, [load]);

  const flash = (text: string) => {
    setNote(text);
    setTimeout(() => setNote((n) => (n === text ? null : n)), 4000);
  };

  const togglePush = async () => {
    if (!push || busy) return;
    setBusy(true);
    try {
      const next = push.kind === 'on' ? await disablePush() : await enablePush();
      setPush(next);
      if (next.kind === 'on') flash('Shu qurilmada bildirishnomalar yoqildi.');
      if (next.kind === 'denied') flash('Ruxsat berilmadi.');
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Xatolik yuz berdi.');
    } finally {
      setBusy(false);
    }
  };

  const kindOn = (types: string[]) => types.every((t) => prefs.find((p) => p.type === t)?.push_enabled ?? true);
  const setKind = async (types: string[], on: boolean) => {
    const rows = types.map((type) => ({ user_id: userId, type, push_enabled: on, in_app_enabled: prefs.find((p) => p.type === type)?.in_app_enabled ?? true }));
    setPrefs((list) => [...list.filter((p) => !types.includes(p.type)), ...rows]);
    const { error } = await getBrowserClient().from('notification_preferences').upsert(rows, { onConflict: 'user_id,type' });
    if (error) {
      flash('Saqlab bo‘lmadi.');
      await load();
    }
  };

  const saveSettings = async (patch: Partial<Settings>) => {
    if (!settings || settings === 'missing') return;
    const next = { ...settings, ...patch };
    setSettings(next);
    const { error } = await getBrowserClient().from('push_settings' as never).upsert({ user_id: userId, ...next } as never, { onConflict: 'user_id' });
    if (error) {
      flash('Saqlab bo‘lmadi.');
      await load();
    }
  };

  const setMuted = async (room: string, muted: boolean) => {
    setChats((list) => list.map((ch) => (ch.room_id === room ? { ...ch, muted } : ch)));
    const { error } = await getBrowserClient().from('chat_members').update({ muted_until: muted ? 'infinity' : null }).eq('room_id', room).eq('user_id', userId);
    if (error) {
      flash('Saqlab bo‘lmadi.');
      await load();
    }
  };

  const removeDevice = async (id: string) => {
    const { error } = await getBrowserClient().rpc('revoke_push_device' as never, { p_id: id } as never);
    if (error) return flash('Qurilmani o‘chirib bo‘lmadi.');
    setDevices((list) => list.filter((d) => d.id !== id));
    if (push?.kind === 'on' && devices.find((d) => d.id === id)?.token === push.endpoint) setPush(await disablePush());
  };

  const test = async () => {
    const { error } = await getBrowserClient().rpc('send_test_notification' as never);
    if (!error) return flash('Yuborildi: bir necha soniyada bildirishnoma keladi.');
    flash(/TEST_TOO_SOON/.test(error.message) ? 'Bir daqiqada bir marta yuborish mumkin.' : 'Test bildirishnomasini yuborib bo‘lmadi.');
  };

  const quietOn = settings && settings !== 'missing' && !!settings.quiet_start;
  return (
    <div className="space-y-5">
      <section className={c.card} aria-labelledby="push-this-device">
        <h2 id="push-this-device" className="text-[16px] font-semibold">Shu qurilmadagi bildirishnomalar</h2>
        <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed">
          {!push ? <p className={c.muted}>Tekshirilmoqda…</p> : null}
          {push?.kind === 'install-first' ? (
            <>
              <p className={c.muted}>iPhone va iPad’da bildirishnomalar faqat bosh ekranga qo‘shilgan Sun Media ilovasida ishlaydi (iOS 16.4+). Avval ilovani o‘rnating, so‘ng uni ochib shu yerda yoqing.</p>
              <InstallSteps tone={tone} />
            </>
          ) : null}
          {push?.kind === 'unsupported' ? (
            <p className={c.muted}>{push.why === 'ios-old' ? 'Bu iOS versiyasi bildirishnomalarni qo‘llab-quvvatlamaydi: iOS 16.4 yoki yangisiga yangilang.' : 'Bu brauzer push bildirishnomalarni qo‘llab-quvvatlamaydi. Chrome, Edge, Safari yoki Firefox’ning yangi versiyasida oching.'}</p>
          ) : null}
          {push?.kind === 'not-ready' ? <p className={c.muted}>Push bildirishnomalar serverda hali yoqilmagan. Yoqilgach shu yerda bitta tugma bilan ishga tushadi.</p> : null}
          {push?.kind === 'denied' ? (
            <>
              <p className={c.muted}>Bu qurilmada bildirishnomalar taqiqlangan. Qayta yoqish uchun:</p>
              <p>{deniedHelp()}</p>
            </>
          ) : null}
          {push?.kind === 'off' || push?.kind === 'on' ? (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void togglePush()} disabled={busy} className={push.kind === 'on' ? c.ghost : c.button}>
                {busy ? 'Kuting…' : push.kind === 'on' ? 'Shu qurilmada o‘chirish' : 'Bildirishnomalarni yoqish'}
              </button>
              {push.kind === 'on' ? (
                <>
                  <span className={`text-[13px] ${c.accent}`}>✓ Yoqilgan</span>
                  <button type="button" onClick={() => void test()} className={`text-[13px] font-medium underline-offset-4 hover:underline ${c.muted}`}>
                    Test bildirishnomasi
                  </button>
                </>
              ) : (
                <span className={`text-[12.5px] ${c.muted}`}>Brauzer ruxsat so‘raydi — «Ruxsat berish» ni bosing.</span>
              )}
            </div>
          ) : null}
          {note ? (
            <p role="status" className={`text-[13px] ${c.accent}`}>
              {note}
            </p>
          ) : null}
        </div>
      </section>

      <section className={c.card} aria-labelledby="push-kinds">
        <h2 id="push-kinds" className="text-[16px] font-semibold">Qaysi xabarlar push bo‘lib kelsin</h2>
        <p className={`mt-1 text-[12.5px] ${c.muted}`}>Barcha qurilmalaringizga (telefon ilovasi ham) tegishli. O‘chirilganlari bildirishnomalar ro‘yxatida qoladi.</p>
        <div className="mt-2">
          {KINDS.map((k) => (
            <Row dark={dark} key={k.key} title={k.label} hint={k.hint}>
              <Switch dark={dark} label={k.label} on={kindOn(k.types)} onChange={(v) => void setKind(k.types, v)} />
            </Row>
          ))}
        </div>
      </section>

      {settings && settings !== 'missing' ? (
        <section className={c.card} aria-labelledby="push-privacy">
          <h2 id="push-privacy" className="text-[16px] font-semibold">Maxfiylik va sokin soatlar</h2>
          <div className="mt-2">
            <Row dark={dark} title="Matnni yashirish" hint="Qulf ekranida faqat «Sun Media — Yangi xabar» ko‘rinadi, kim nima yozgani emas.">
              <Switch dark={dark} label="Matnni yashirish" on={settings.hide_preview} onChange={(v) => void saveSettings({ hide_preview: v })} />
            </Row>
            <Row dark={dark} title="Sokin soatlar" hint="Bu vaqtda push kelmaydi (rahbar topshirig‘i va muddati o‘tgan ishlar bundan mustasno).">
              <Switch dark={dark} label="Sokin soatlar" on={!!quietOn} onChange={(v) => void saveSettings(v ? { quiet_start: '22:00', quiet_end: '08:00' } : { quiet_start: null, quiet_end: null })} />
            </Row>
            {quietOn ? (
              <div className="flex flex-wrap items-center gap-2 pb-2 text-[13.5px]">
                <label className="flex items-center gap-2">
                  dan
                  <input type="time" className={c.input} value={settings.quiet_start?.slice(0, 5) ?? '22:00'} onChange={(e) => e.target.value && void saveSettings({ quiet_start: e.target.value })} />
                </label>
                <label className="flex items-center gap-2">
                  gacha
                  <input type="time" className={c.input} value={settings.quiet_end?.slice(0, 5) ?? '08:00'} onChange={(e) => e.target.value && void saveSettings({ quiet_end: e.target.value })} />
                </label>
                <span className={c.muted}>(Toshkent vaqti)</span>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {chats.length ? (
        <section className={c.card} aria-labelledby="push-mute">
          <h2 id="push-mute" className="text-[16px] font-semibold">Chatlar</h2>
          <p className={`mt-1 text-[12.5px] ${c.muted}`}>Ovozi o‘chirilgan chatdan bildirishnoma kelmaydi (rahbar topshirig‘idan tashqari).</p>
          <div className="mt-2">
            {chats.map((ch) => (
              <Row dark={dark} key={ch.room_id} title={ch.name} hint={ch.muted ? 'Ovozi o‘chirilgan' : undefined}>
                <Switch dark={dark} label={`${ch.name}: bildirishnomalar`} on={!ch.muted} onChange={(v) => void setMuted(ch.room_id, !v)} />
              </Row>
            ))}
          </div>
        </section>
      ) : null}

      {devices.length ? (
        <section className={c.card} aria-labelledby="push-devices">
          <h2 id="push-devices" className="text-[16px] font-semibold">Qurilmalarim</h2>
          <div className="mt-2">
            {devices.map((d) => (
              <Row
                dark={dark}
                key={d.id}
                title={`${d.device_name || (d.platform === 'web' ? 'Brauzer' : d.platform === 'ios' ? 'iPhone ilovasi' : 'Android ilovasi')}${push?.kind === 'on' && push.endpoint === d.token ? ' — shu qurilma' : ''}`}
                hint={`Oxirgi faollik: ${when.format(new Date(d.last_seen_at))}`}
              >
                <button type="button" onClick={() => void removeDevice(d.id)} className={`text-[13px] font-medium ${c.muted} hover:underline`}>
                  O‘chirish
                </button>
              </Row>
            ))}
          </div>
        </section>
      ) : null}

      <section className={c.card} aria-labelledby="app-install">
        <h2 id="app-install" className="text-[16px] font-semibold">Ilova</h2>
        <div className="mt-3">
          <InstallSteps tone={tone} />
        </div>
      </section>
    </div>
  );
}
