'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SelectInput, TextInput } from '@/components/ui/Inputs';
import { smmServiceRefillTerms, smmServiceSet } from '@/lib/actions/smm-plans';
import type { Service } from '@/lib/neosmm/catalog';
import { healthOf, type HealthRow } from '@/lib/neosmm/health';
import { formatShortDateTime } from '@/lib/time';

/** The service's evidence-based state, the owner's switch, and the refill terms the owner has verified. */
export function ServiceHealthPanel({ service, row, onChange }: { service: Service; row: HealthRow | null; onChange: (row: HealthRow | null) => void }) {
  const h = healthOf(row);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [days, setDays] = useState(String(row?.refill_days ?? ''));
  const [starts, setStarts] = useState<'accepted' | 'completed'>(row?.refill_starts ?? 'completed');
  const [basis, setBasis] = useState(row?.refill_basis ?? '');
  const meta = { name: service.name, category: service.category };

  const act = async (action: 'disable' | 'enable' | 'clear_block') => {
    setBusy(true);
    try {
      const r = await smmServiceSet(service.id, action, meta);
      setMsg(r.message);
      if (r.ok && r.row) onChange(r.row);
    } catch {
      setMsg('Saqlab bo‘lmadi.');
    } finally {
      setBusy(false);
    }
  };

  const saveTerms = async (clear = false) => {
    setBusy(true);
    try {
      const r = await smmServiceRefillTerms(service.id, clear ? null : { days: Number(days), starts, basis }, meta);
      setMsg(r.message);
      if (r.ok) {
        setEdit(false);
        const now = new Date().toISOString();
        onChange({
          ...(row ?? emptyRow(service)),
          refill_days: clear ? null : Number(days),
          refill_starts: clear ? null : starts,
          refill_basis: clear ? null : basis,
          refill_verified_at: clear ? null : now,
        });
      }
    } catch {
      setMsg('Saqlab bo‘lmadi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-line p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-muted">Holati:</span>
          <Badge tone={h.tone} dot>
            {h.label}
          </Badge>
          {h.at ? <span className="text-[12px] text-muted">{formatShortDateTime(h.at)}</span> : null}
        </p>
        <div className="flex flex-wrap gap-2">
          {h.state === 'blocked' ? (
            <Button variant="secondary" disabled={busy} onClick={() => void act('clear_block')}>
              Blokni olib tashlash
            </Button>
          ) : null}
          {row?.disabled_at ? (
            <Button variant="secondary" disabled={busy} onClick={() => void act('enable')}>
              Yoqish
            </Button>
          ) : (
            <Button variant="ghost" disabled={busy} onClick={() => void act('disable')}>
              Qo‘lda o‘chirish
            </Button>
          )}
        </div>
      </div>
      {h.reason ? <p className="text-[12.5px] text-muted">Sabab: {h.reason}</p> : null}
      {h.state === 'blocked' ? (
        <p className="text-[12.5px] text-muted">Blok olib tashlansa, xizmat “Tekshirilmagan” bo‘ladi (ishlaydi degani emas). Katalogda ko‘rinishi blokni o‘zi olib tashlamaydi.</p>
      ) : null}

      <div className="border-t border-line pt-3">
        <p className="text-muted">
          Kafolat (refill): API — <b className="text-ink">{service.refill ? 'so‘rash mumkin' : 'yo‘q'}</b> ·{' '}
          {row?.refill_verified_at ? (
            <>
              tasdiqlangan: <b className="text-ink">{row.refill_days} kun, {row.refill_starts === 'accepted' ? 'qabul qilingandan' : 'bajarilgandan'}</b>{' '}
              <span className="text-[12px]">({row.refill_basis})</span>
            </>
          ) : (
            <b className="text-ink">Muddat tasdiqlanmagan</b>
          )}
        </p>
        <p className="mt-1 text-[12px] text-muted">Nomidagi “R30” kabi yozuv muddatni tasdiqlamaydi. Shartni provayderdan (bot, xizmat tavsifi) aniqlab, manbasi bilan kiriting.</p>
        {edit ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-[110px_1fr]">
            <TextInput label="Muddat (kun)" type="number" min={1} max={3650} step={1} value={days} onChange={(e) => setDays(e.target.value)} />
            <SelectInput label="Qachondan boshlanadi" value={starts} onChange={(e) => setStarts(e.target.value as 'accepted' | 'completed')}>
              <option value="completed">Buyurtma bajarilgandan</option>
              <option value="accepted">Provayder qabul qilgandan</option>
            </SelectInput>
            <div className="sm:col-span-2">
              <TextInput label="Manba (qayerda tasdiqlandi)" placeholder="Masalan: @neosmmbot, xizmat tavsifi, 7-noyabr" value={basis} onChange={(e) => setBasis(e.target.value)} />
            </div>
            <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
              <Button variant="ghost" onClick={() => setEdit(false)} disabled={busy}>
                Bekor
              </Button>
              <Button onClick={() => void saveTerms()} loading={busy} disabled={!days || basis.trim().length < 5}>
                Saqlash
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex gap-2">
            <Button variant="ghost" onClick={() => setEdit(true)}>
              {row?.refill_verified_at ? 'Shartlarni o‘zgartirish' : 'Tasdiqlangan shartni kiritish'}
            </Button>
            {row?.refill_verified_at ? (
              <Button variant="ghost" onClick={() => void saveTerms(true)} disabled={busy}>
                Olib tashlash
              </Button>
            ) : null}
          </div>
        )}
      </div>
      {msg ? <p className="text-[12.5px] text-muted">{msg}</p> : null}
    </div>
  );
}

export const emptyRow = (s: Pick<Service, 'id' | 'name' | 'category'>): HealthRow => ({
  service_id: s.id,
  service_name: s.name,
  service_category: s.category,
  last_accepted_at: null,
  last_accepted_order: null,
  last_completed_at: null,
  last_completed_order: null,
  blocked_at: null,
  blocked_reason: null,
  missing_since: null,
  last_seen_at: null,
  disabled_at: null,
  cleared_at: null,
  refill_days: null,
  refill_starts: null,
  refill_basis: null,
  refill_verified_at: null,
});
