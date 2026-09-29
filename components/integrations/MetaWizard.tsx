'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { listMetaAssets, saveMetaSetup, startMetaConnect, type MetaAssets } from '@/lib/actions/integrations';

type Connection = { id: string; name: string; status: string; token_expires_at: string | null };
type AssetType = 'business' | 'page' | 'instagram' | 'ad_account' | 'lead_form';
type Picked = { type: AssetType; external_id: string; name: string; parent_external_id?: string | null; details?: Record<string, unknown> };

const STEPS = ['Meta bilan ulanish', 'Biznes / akkaunt', 'Sahifa, Instagram, reklama', 'CRM shabloni', 'Saqlash'];

const key = (type: AssetType, id: string) => `${type}:${id}`;

/**
 * Mijoz → Integratsiyalar → Meta → Ulash. Facebook Login happens on Meta's site; afterwards this wizard lists what
 * that login can reach and the admin ticks what belongs to this client. Tokens never reach the browser.
 */
export function MetaWizard({
  clientId,
  clientName,
  connections,
  initialConnectionId,
  existing,
  template: initialTemplate,
  autoDeliver: initialAuto,
}: {
  clientId: string;
  clientName: string;
  connections: Connection[];
  initialConnectionId: string | null;
  existing: string[];
  template: 'standard' | 'full';
  autoDeliver: boolean;
}) {
  const router = useRouter();
  const [connectionId, setConnectionId] = useState<string | null>(initialConnectionId);
  const [assets, setAssets] = useState<MetaAssets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set(existing));
  const [template, setTemplate] = useState(initialTemplate);
  const [autoDeliver, setAutoDeliver] = useState(initialAuto);
  const [result, setResult] = useState<{ message: string; warnings: string[] } | null>(null);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();
  const [connecting, startConnecting] = useTransition();

  useEffect(() => {
    if (!connectionId) return;
    setAssets(null);
    setError(null);
    startLoading(async () => {
      const r = await listMetaAssets(connectionId);
      if (r.error) setError(r.error);
      else setAssets(r.assets ?? null);
    });
  }, [connectionId]);

  const step = !connectionId ? 0 : !assets ? 1 : result ? 4 : 2;

  const toggle = (type: AssetType, id: string, on?: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const k = key(type, id);
      if (on ?? !next.has(k)) next.add(k);
      else next.delete(k);
      return next;
    });

  // Everything chosen, with names and parents, as the database expects it.
  const picked = useMemo<Picked[]>(() => {
    if (!assets) return [];
    const out: Picked[] = [];
    for (const b of assets.businesses) if (selected.has(key('business', b.id))) out.push({ type: 'business', external_id: b.id, name: b.name });
    for (const p of assets.pages) {
      const pageOn = selected.has(key('page', p.id));
      if (pageOn) out.push({ type: 'page', external_id: p.id, name: p.name, details: { picture: p.picture } });
      if (p.instagram && selected.has(key('instagram', p.instagram.id))) {
        out.push({
          type: 'instagram',
          external_id: p.instagram.id,
          name: p.instagram.username ?? p.instagram.id,
          parent_external_id: p.id,
          details: { username: p.instagram.username, picture: p.instagram.picture },
        });
      }
      for (const f of p.lead_forms) if (selected.has(key('lead_form', f.id))) out.push({ type: 'lead_form', external_id: f.id, name: f.name, parent_external_id: p.id });
    }
    for (const a of assets.ad_accounts) if (selected.has(key('ad_account', a.id))) out.push({ type: 'ad_account', external_id: a.id, name: a.name, details: { currency: a.currency } });
    return out;
  }, [assets, selected]);

  // Instagram and lead forms are read with their page's token: choosing them selects the page too.
  const needsPage = picked.filter((a) => (a.type === 'instagram' || a.type === 'lead_form') && !selected.has(key('page', a.parent_external_id ?? '')));

  return (
    <Card className="space-y-6">
      <ol className="flex flex-wrap gap-2 text-[13px]" aria-label="Qadamlar">
        {STEPS.map((s, i) => (
          <li key={s} className={cn('rounded-full border px-3 py-1', i === step ? 'border-ink bg-ink text-bg' : i < step ? 'border-line text-ink' : 'border-line text-subtle')}>
            {`${i + 1}. ${s}`}
          </li>
        ))}
      </ol>

      {error ? <Notice tone="danger" title={error} /> : null}

      {step === 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {`${clientName} sahifasi, Instagram hisobi va reklama akkauntiga kirish huquqi bor Facebook profili bilan kiring. Meta sizdan ruxsatlarni so‘raydi — sahifalarni tanlashda ${clientName} sahifasini belgilang.`}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              loading={connecting}
              icon={<Icon name="link" size={16} />}
              onClick={() =>
                startConnecting(async () => {
                  const r = await startMetaConnect(clientId);
                  if (r.url) window.location.href = r.url;
                  else setError(r.error ?? 'Meta ulanishini boshlab bo‘lmadi.');
                })
              }
            >
              Facebook orqali ulash
            </Button>
            {connections.length > 0 ? (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted">yoki mavjud ulanish:</span>
                <select className="h-10 rounded-xl border border-line bg-surface px-3" defaultValue="" onChange={(e) => e.target.value && setConnectionId(e.target.value)}>
                  <option value="" disabled>
                    Tanlang
                  </option>
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || 'Meta profili'}
                      {c.status !== 'active' ? ' (qayta ulash kerak)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === 1 ? <p className="text-sm text-muted">{loading ? 'Meta’dan sahifalar va akkauntlar olinmoqda…' : 'Meta ulanishi tanlandi.'}</p> : null}

      {assets && !result ? (
        <div className="space-y-6">
          {assets.businesses.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Biznes (ixtiyoriy)</h3>
              <div className="flex flex-wrap gap-2">
                {assets.businesses.map((b) => (
                  <Pick key={b.id} checked={selected.has(key('business', b.id))} onChange={() => toggle('business', b.id)} label={b.name} />
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Sahifalar, Instagram va lid formalar</h3>
            {assets.pages.length === 0 ? (
              <Notice tone="warning" title="Bu profil hech qaysi Facebook sahifasiga ruxsat bermadi. Qayta ulab, sahifani tanlang." />
            ) : (
              assets.pages.map((p) => (
                <div key={p.id} className="rounded-xl border border-line p-4">
                  <Pick checked={selected.has(key('page', p.id))} onChange={() => toggle('page', p.id)} label={p.name} hint="Facebook sahifasi — lidlar shu sahifadan keladi" strong />
                  <div className="mt-3 flex flex-col gap-2 pl-7">
                    {p.instagram ? (
                      <Pick
                        checked={selected.has(key('instagram', p.instagram.id))}
                        onChange={() => {
                          const on = !selected.has(key('instagram', p.instagram!.id));
                          toggle('instagram', p.instagram!.id, on);
                          if (on) toggle('page', p.id, true);
                        }}
                        label={`Instagram: @${p.instagram.username ?? p.instagram.id}`}
                        hint={p.instagram.followers != null ? `${p.instagram.followers.toLocaleString('ru-RU')} obunachi — statistika har kuni yig‘iladi` : 'Statistika har kuni yig‘iladi'}
                      />
                    ) : (
                      <p className="text-[13px] text-subtle">Bu sahifaga Instagram Professional hisobi bog‘lanmagan.</p>
                    )}
                    {p.lead_forms.map((f) => (
                      <Pick
                        key={f.id}
                        checked={selected.has(key('lead_form', f.id))}
                        onChange={() => {
                          const on = !selected.has(key('lead_form', f.id));
                          toggle('lead_form', f.id, on);
                          if (on) toggle('page', p.id, true);
                        }}
                        label={`Lid forma: ${f.name}`}
                        hint={f.status && f.status !== 'ACTIVE' ? 'Forma faol emas' : undefined}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>

          {assets.ad_accounts.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Reklama akkauntlari</h3>
              <div className="flex flex-col gap-2">
                {assets.ad_accounts.map((a) => (
                  <Pick key={a.id} checked={selected.has(key('ad_account', a.id))} onChange={() => toggle('ad_account', a.id)} label={a.name} hint={[a.id, a.currency].filter(Boolean).join(' · ')} />
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-3 border-t border-line pt-5">
            <h3 className="text-sm font-semibold">CRM shabloni</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <Choice checked={template === 'standard'} onChange={() => setTemplate('standard')} title="Standart" text="Mijoz ism, telefon, email, kampaniya va vaqtni ko‘radi." />
              <Choice checked={template === 'full'} onChange={() => setTemplate('full')} title="To‘liq" text="Qo‘shimcha forma javoblari ham (filial, budjet, izoh…)." />
            </div>
            <Pick
              checked={autoDeliver}
              onChange={() => setAutoDeliver((v) => !v)}
              label="Lidlarni mijozga avtomatik yuborish"
              hint="Odatda o‘chiq: admin lidni tekshiradi va o‘zi yuboradi."
            />
          </section>

          {needsPage.length > 0 ? <Notice tone="warning" title="Instagram va lid formalar o‘z sahifasi bilan birga ulanadi." /> : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              loading={saving}
              disabled={picked.length === 0}
              onClick={() =>
                startSaving(async () => {
                  const r = await saveMetaSetup({ client_id: clientId, connection_id: connectionId!, assets: picked, template, auto_deliver: autoDeliver });
                  if (r.status === 'success') {
                    setResult({ message: r.message ?? 'Saqlandi', warnings: r.warnings ?? [] });
                    router.refresh();
                  } else if (r.status === 'error') setError(r.message);
                })
              }
            >
              {`Saqlash (${picked.length})`}
            </Button>
            <Button variant="ghost" onClick={() => setConnectionId(null)}>
              Boshqa Meta profili
            </Button>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="space-y-3">
          <Notice tone="success" title={result.message} />
          {result.warnings.map((w) => (
            <Notice key={w} tone="warning" title={w} />
          ))}
          <Button variant="secondary" onClick={() => setResult(null)}>
            Tanlovni o‘zgartirish
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function Pick({ checked, onChange, label, hint, strong }: { checked: boolean; onChange: () => void; label: string; hint?: string; strong?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" checked={checked} onChange={onChange} className="mt-0.5 size-4 accent-[var(--accent)]" />
      <span>
        <span className={cn('block text-sm', strong && 'font-medium')}>{label}</span>
        {hint ? <span className="block text-[13px] text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

function Choice({ checked, onChange, title, text }: { checked: boolean; onChange: () => void; title: string; text: string }) {
  return (
    <label className={cn('flex cursor-pointer gap-3 rounded-xl border p-4', checked ? 'border-ink' : 'border-line')}>
      <input type="radio" checked={checked} onChange={onChange} className="mt-0.5" />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-[13px] text-muted">{text}</span>
      </span>
    </label>
  );
}
