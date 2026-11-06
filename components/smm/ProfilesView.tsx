'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { smmObservationAdd, smmObservationDelete, smmProfile, smmProfiles } from '@/lib/actions/smm-plans';
import { isFinal } from '@/lib/neosmm/catalog';
import { decText, formatSom, parseDec } from '@/lib/neosmm/decimal';
import { followerSeries, profileStats, type Observation } from '@/lib/neosmm/profiles';
import { formatDateKey, formatShortDateTime, fromLocalInput } from '@/lib/time';

import { FollowerChart, signed, SourceBadge } from './bits';
import { OrderCard } from './OrdersView';

export type SmmProfileCard = Awaited<ReturnType<typeof smmProfiles>>[number];
type Detail = NonNullable<Awaited<ReturnType<typeof smmProfile>>>;

const nf = (n: number) => n.toLocaleString('ru-RU');
const sumCharges = (orders: { charge: string | null }[]) => {
  let total: { n: bigint; s: number } = { n: 0n, s: 2 };
  let missing = 0;
  for (const o of orders) {
    const c = parseDec(o.charge);
    if (!c) {
      missing++;
      continue;
    }
    const s = Math.max(total.s, c.s);
    total = { n: total.n * 10n ** BigInt(s - total.s) + c.n * 10n ** BigInt(s - c.s), s };
  }
  return { total: decText(total), missing };
};

/**
 * Instagram profile cards: one per account, its measured history shared by all its orders. NeoSMM gives order facts
 * (start_count, remains, status, charge), not the profile's name, photo or current count — those are observations,
 * each with its source and time; none means "Ma’lumot olinmagan".
 */
export function ProfilesView({ initial, openId }: { initial: SmmProfileCard[]; openId: string | null }) {
  const router = useRouter();
  const [profiles, setProfiles] = useState(initial);
  const [open, setOpen] = useState<string | null>(openId);

  const reload = useCallback(async () => {
    try {
      setProfiles(await smmProfiles());
    } catch {
      /* keep the last list */
    }
  }, []);

  const close = () => {
    setOpen(null);
    router.replace('/smm-api?bolim=profillar', { scroll: false });
    void reload();
  };

  return (
    <div className="space-y-4">
      <Notice tone="info" title="Profil ma’lumotlari manbai">
        Instagram ma’lumot ulanishi (Meta) hozir sozlanmagan, NeoSMM esa profil ismi, rasmi va joriy obunachilar sonini bermaydi. Shuning uchun sonlar faqat siz qo‘lda kiritgan kuzatuvlardan
        olinadi — har birida manba va vaqt bor. Kuzatuv bo‘lmasa “Ma’lumot olinmagan”.
      </Notice>
      {profiles.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">Hali profil kartasi yo‘q. Instagram profil havolasiga buyurtma berilganda karta o‘zi yaratiladi.</Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {profiles.map((p) => (
            <li key={p.id}>
              <ProfileCard profile={p} onOpen={() => setOpen(p.id)} />
            </li>
          ))}
        </ul>
      )}
      {open ? <ProfileDialog id={open} onClose={close} /> : null}
    </div>
  );
}

function ProfileCard({ profile: p, onOpen }: { profile: SmmProfileCard; onOpen: () => void }) {
  const stats = useMemo(() => profileStats(p.observations as Observation[]), [p.observations]);
  const points = useMemo(() => followerSeries(p.observations as Observation[]), [p.observations]);
  const spend = sumCharges(p.orders.filter((o) => o.state === 'accepted'));
  const active = p.orders.filter((o) => o.state === 'unknown' || (o.state === 'accepted' && !isFinal(o.status))).length;
  const last = p.observations.length ? (p.observations[p.observations.length - 1] as Observation) : null;

  return (
    <button type="button" onClick={onOpen} className="block h-full w-full text-left">
      <Card className="flex h-full flex-col gap-3 p-4 text-sm transition-colors hover:border-line-strong">
        <div className="flex items-center gap-3">
          <Avatar name={p.display_name ?? p.username} url={p.avatar_url} size={44} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{p.display_name ?? <span className="font-normal text-muted">Ism: ma’lumot olinmagan</span>}</p>
            <p className="truncate text-[12.5px] text-muted">@{p.username}</p>
          </div>
        </div>
        <div>
          <p className="text-[12px] text-muted">Obunachilar (o‘lchangan)</p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">{stats.latest ? nf(stats.latest.followers) : <span className="text-base font-medium text-muted">Ma’lumot olinmagan</span>}</p>
          {stats.latest ? (
            <p className="text-[12px] text-muted">
              {stats.latest.source === 'manual' ? 'Qo‘lda' : 'Instagram API'} · {formatShortDateTime(stats.latest.at)}
            </p>
          ) : last ? (
            <p className="text-[12px] text-muted">Oxirgi kuzatuv: {formatShortDateTime(last.observed_at)}</p>
          ) : null}
        </div>
        {points.length > 1 ? <FollowerChart points={points} height={56} compact /> : null}
        <div className="grid grid-cols-2 gap-2 text-[12.5px]">
          <span>Birinchi: {stats.first ? nf(stats.first.followers) : '—'}</span>
          <span>Jami sof: {stats.overall !== null ? signed(stats.overall) : '—'}</span>
          <span>Kunlik sof: {stats.lastDay ? signed(stats.lastDay.change) : '—'}</span>
          <span>Buyurtmalar: {p.orders.length}</span>
          <span>Faol / navbat: {active + p.plans.filter((x) => x.status === 'active' || x.status === 'paused').length}</span>
          <span>
            Yechilgan: {formatSom(spend.total)}
            {spend.missing ? '*' : ''}
          </span>
        </div>
      </Card>
    </button>
  );
}

function ProfileDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ followers: '', following: '', media: '', name: '', at: '', note: '' });
  const [formMsg, setFormMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await smmProfile(id));
    } catch {
      setDetail(null);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  const observations = useMemo(() => (detail?.observations ?? []) as Observation[], [detail]);
  const stats = useMemo(() => profileStats(observations), [observations]);
  const points = useMemo(() => followerSeries(observations), [observations]);

  const n = (v: string) => (v.trim() === '' ? null : Number(v));
  const addObs = async () => {
    setBusy('obs');
    setFormMsg(null);
    try {
      const r = await smmObservationAdd(id, {
        followers: n(form.followers),
        following: n(form.following),
        mediaCount: n(form.media),
        displayName: form.name.trim() || null,
        observedAt: form.at ? fromLocalInput(form.at) : null,
        note: form.note.trim() || null,
      });
      setFormMsg({ ok: r.ok, text: r.message });
      if (r.ok) {
        setForm({ followers: '', following: '', media: '', name: '', at: '', note: '' });
        await load();
      }
    } catch {
      setFormMsg({ ok: false, text: 'Saqlab bo‘lmadi.' });
    } finally {
      setBusy(null);
    }
  };

  const act = async (oid: string, run: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(oid);
    try {
      const r = await run();
      setMessages((m) => ({ ...m, [oid]: r.message }));
      await load();
    } catch {
      setMessages((m) => ({ ...m, [oid]: 'Amalni bajarib bo‘lmadi.' }));
    } finally {
      setBusy(null);
    }
  };

  const p = detail?.profile;
  const orderProfile = p ? { id: p.id, username: p.username, display_name: p.display_name, observations } : null;
  const spend = sumCharges((detail?.orders ?? []).filter((o) => o.state === 'accepted'));
  const activeQueue = (detail?.queue ?? []).length;

  return (
    <Dialog open onClose={onClose} title={p ? (p.display_name ?? `@${p.username}`) : 'Profil'} description={p ? `@${p.username} · instagram.com/${p.username}` : undefined} size="lg">
      {detail === undefined ? (
        <p className="text-sm text-muted">Yuklanmoqda…</p>
      ) : !detail || !p ? (
        <Notice tone="warning">Profil topilmadi.</Notice>
      ) : (
        <div className="space-y-5 text-sm">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Hozirgi (o‘lchangan)" value={stats.latest ? nf(stats.latest.followers) : 'Ma’lumot olinmagan'} hint={stats.latest ? formatShortDateTime(stats.latest.at) : undefined} />
            <Stat label="Birinchi o‘lchov" value={stats.first ? nf(stats.first.followers) : '—'} hint={stats.first ? formatShortDateTime(stats.first.at) : undefined} />
            <Stat
              label="Kunlik sof o‘zgarish"
              value={stats.lastDay ? signed(stats.lastDay.change) : '—'}
              hint={stats.lastDay ? `${formatDateKey(stats.lastDay.previousDay)} → ${formatDateKey(stats.lastDay.day)}` : 'Ikki kunlik kuzatuv kerak'}
            />
            <Stat label="Jami sof o‘zgarish" value={stats.overall !== null ? signed(stats.overall) : '—'} hint="Birinchi va oxirgi o‘lchov orasida" />
          </div>
          <div>
            <p className="mb-2 font-medium">Obunachilar soni (o‘lchangan kuzatuvlar)</p>
            <FollowerChart points={points} />
            <p className="mt-2 text-[12px] text-muted">
              Sof o‘sish / kamayish — ikki haqiqiy kuzatuv orasidagi farq. U kim obuna bo‘lgani yoki chiqqanini, qaysi buyurtma ta’sir qilganini ko‘rsatmaydi. Provayderning “Bajarildi” holati yoki
              start_count bu yerga qo‘shilmaydi.
            </p>
          </div>

          <div className="grid gap-x-5 gap-y-1 text-[12.5px] sm:grid-cols-3">
            <span>Bog‘langan buyurtmalar: {detail.orders.length}</span>
            <span>Rejalar: {detail.plans.length}</span>
            <span>Faol navbat: {activeQueue ? `${activeQueue} ta` : 'yo‘q'}</span>
            <span>
              Yechilgan (provayder): {formatSom(spend.total)}
              {spend.missing ? ` · ${spend.missing} tasida summa hali yo‘q` : ''}
            </span>
          </div>

          <div className="space-y-3 rounded-xl border border-line p-4">
            <p className="font-medium">Kuzatuv qo‘shish (qo‘lda)</p>
            <p className="text-[12px] text-muted">Instagram’da ko‘rganingizni kiriting. Bo‘sh maydon — “olinmagan” (nol emas). Vaqt bo‘sh bo‘lsa — hozir.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <TextInput label="Obunachilar" type="number" min={0} step={1} value={form.followers} onChange={(e) => setForm({ ...form, followers: e.target.value })} />
              <TextInput label="Obunalar" type="number" min={0} step={1} value={form.following} onChange={(e) => setForm({ ...form, following: e.target.value })} />
              <TextInput label="Postlar" type="number" min={0} step={1} value={form.media} onChange={(e) => setForm({ ...form, media: e.target.value })} />
              <TextInput label="Profil ismi" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={150} />
              <TextInput label="Kuzatuv vaqti" type="datetime-local" value={form.at} onChange={(e) => setForm({ ...form, at: e.target.value })} />
              <TextInput label="Izoh" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={500} />
            </div>
            {formMsg ? <p className={`text-[12.5px] ${formMsg.ok ? 'text-success' : 'text-danger'}`}>{formMsg.text}</p> : null}
            <div className="flex justify-end">
              <Button onClick={() => void addObs()} loading={busy === 'obs'} disabled={!form.followers && !form.following && !form.media && !form.name.trim()}>
                Saqlash
              </Button>
            </div>
          </div>

          {observations.length ? (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-left text-[12.5px]">
                <thead className="bg-surface-2 text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Vaqt</th>
                    <th className="px-3 py-2 font-medium">Obunachilar</th>
                    <th className="px-3 py-2 font-medium">Obunalar</th>
                    <th className="px-3 py-2 font-medium">Postlar</th>
                    <th className="px-3 py-2 font-medium">Manba</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {[...observations].reverse().map((o) => (
                    <tr key={o.id} className="border-t border-line">
                      <td className="px-3 py-2">{formatShortDateTime(o.observed_at)}</td>
                      <td className="px-3 py-2 tabular-nums">{o.followers !== null ? nf(o.followers) : 'olinmagan'}</td>
                      <td className="px-3 py-2 tabular-nums">{o.following !== null ? nf(o.following) : '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{o.media_count !== null ? nf(o.media_count) : '—'}</td>
                      <td className="px-3 py-2">
                        <SourceBadge source={o.source} />
                        {o.display_name ? <span className="ml-1 text-muted">“{o.display_name}”</span> : null}
                        {o.note ? <span className="block text-muted">{o.note}</span> : null}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {o.source === 'manual' ? (
                          <button
                            type="button"
                            className="text-[12px] text-muted hover:text-danger"
                            onClick={() => {
                              if (confirm('Bu kuzatuv o‘chirilsinmi?')) void smmObservationDelete(o.id).then(load);
                            }}
                          >
                            O‘chirish
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {detail.plans.length ? (
            <div className="space-y-2">
              <p className="font-medium">Rejalar</p>
              <ul className="space-y-1 text-[12.5px]">
                {detail.plans.map((x) => (
                  <li key={x.id} className="flex flex-wrap gap-2">
                    <Badge>{x.origin === 'queued' ? 'Navbat' : 'Bo‘lib yuborish'}</Badge>
                    <span>
                      {x.service_name} · {x.total_quantity.toLocaleString('ru-RU')} ta, {x.part_count} qism · {x.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="space-y-3">
            <p className="font-medium">Buyurtmalar</p>
            {detail.orders.length ? (
              <ul className="space-y-3">
                {detail.orders.map((o) => (
                  <li key={o.id}>
                    <OrderCard order={o} busy={busy} message={messages[o.id]} onAct={act} profile={orderProfile} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">Bog‘langan buyurtma yo‘q.</p>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-[12px] text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-[11.5px] text-muted">{hint}</p> : null}
    </div>
  );
}
