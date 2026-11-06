'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectInput, TextInput } from '@/components/ui/Inputs';
import { smmCatalog } from '@/lib/actions/smm';
import { adapterOf, platformOf, type Service } from '@/lib/neosmm/catalog';
import { decCmp, formatSom, parseDec } from '@/lib/neosmm/decimal';
import type { Balance, Catalog } from '@/lib/neosmm/server';

import { OrderDialog } from './OrderDialog';
import { Freshness, type SmmConfig } from './SmmApi';

const PAGE = 60;
type Sort = 'id' | 'cheap' | 'dear';

const priceOf = (s: Service) => parseDec(s.rate) ?? { n: 0n, s: 0 };

/** Every SMM service of the account, Instagram first in the filters; nothing is dropped without being counted. */
export function ServicesView({ catalog: initial, config, balance }: { catalog: Catalog<'services'>; config: SmmConfig; balance: Extract<Balance, { ok: true }> | null }) {
  const [catalog, setCatalog] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const [platform, setPlatform] = useState('Hammasi');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<Sort>('id');
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<Service | null>(null);

  const withPlatform = useMemo(() => catalog.items.map((s) => ({ s, platform: platformOf(s) })), [catalog.items]);
  const platforms = useMemo(() => {
    const counts = new Map<string, number>();
    for (const x of withPlatform) counts.set(x.platform, (counts.get(x.platform) ?? 0) + 1);
    const order = [...counts.entries()].sort((a, b) => (a[0] === 'Instagram' ? -1 : b[0] === 'Instagram' ? 1 : a[0] === 'Boshqa' ? 1 : b[0] === 'Boshqa' ? -1 : b[1] - a[1]));
    return [['Hammasi', withPlatform.length] as [string, number], ...order];
  }, [withPlatform]);
  const categories = useMemo(
    () => [...new Set(withPlatform.filter((x) => platform === 'Hammasi' || x.platform === platform).map((x) => x.s.category))].sort((a, b) => a.localeCompare(b)),
    [withPlatform, platform],
  );

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const out = withPlatform
      .filter((x) => platform === 'Hammasi' || x.platform === platform)
      .filter((x) => !category || x.s.category === category)
      .filter((x) => !term || String(x.s.id) === term.replace(/^#/, '') || x.s.name.toLowerCase().includes(term) || x.s.category.toLowerCase().includes(term))
      .map((x) => x.s);
    if (sort === 'cheap') out.sort((a, b) => decCmp(priceOf(a), priceOf(b)) || a.id - b.id);
    else if (sort === 'dear') out.sort((a, b) => decCmp(priceOf(b), priceOf(a)) || a.id - b.id);
    else out.sort((a, b) => a.id - b.id);
    return out;
  }, [withPlatform, platform, category, q, sort]);

  const reload = async () => {
    setRefreshing(true);
    try {
      setCatalog(await smmCatalog('services', true));
    } catch {
      setCatalog((c) => ({ ...c, error: 'Ro‘yxatni yangilab bo‘lmadi.', stale: c.items.length > 0 }));
    } finally {
      setRefreshing(false);
    }
  };

  const unit = config.rateUnit;
  return (
    <div className="space-y-4">
      <Freshness catalog={catalog} onRefresh={() => void reload()} refreshing={refreshing} />

      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Platforma">
        {platforms.map(([name, count]) => (
          <button
            key={name}
            type="button"
            onClick={() => {
              setPlatform(name);
              setCategory('');
              setShown(PAGE);
            }}
            aria-pressed={platform === name}
            className={`h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap ${
              platform === name ? 'border-ink bg-ink text-bg' : name === 'Instagram' ? 'border-accent/50 bg-accent-soft text-accent-on-soft' : 'border-line bg-surface text-muted hover:text-ink'
            }`}
          >
            {name} · {count}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_220px_180px]">
        <TextInput
          label="Qidirish"
          placeholder="Nomi yoki ID (masalan: followers, 123)"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setShown(PAGE);
          }}
        />
        <SelectInput
          label="Kategoriya"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setShown(PAGE);
          }}
        >
          <option value="">Barchasi ({categories.length})</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </SelectInput>
        <SelectInput label="Saralash" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="id">ID bo‘yicha</option>
          <option value="cheap">Arzonidan</option>
          <option value="dear">Qimmatidan</option>
        </SelectInput>
      </div>

      <p className="text-sm text-muted" aria-live="polite">
        {list.length} ta xizmat topildi (jami {catalog.items.length})
        {list.length > shown ? ` · ${shown} tasi ko‘rsatilmoqda` : ''}
      </p>

      {!unit ? (
        <p className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-[13px]">
          <b>API tarifi</b> — provayder bergan qiymat. U qaysi miqdor uchun ekani (masalan 1 000 ta) hali tasdiqlanmagan, shuning uchun jami narx hisoblanmaydi va SMM buyurtma
          yuborilmaydi.
        </p>
      ) : null}

      {list.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">{catalog.items.length ? 'Bu filtrlar bo‘yicha xizmat yo‘q.' : 'Xizmatlar ro‘yxati bo‘sh yoki yuklanmadi.'}</Card>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.slice(0, shown).map((s) => {
            const adapter = adapterOf(s.type);
            return (
              <li key={s.id}>
                <Card className="flex h-full flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12px] text-muted">
                        #{s.id} · {s.category}
                      </p>
                      <p className="mt-0.5 font-medium break-words">{s.name}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums">{formatSom(s.rate)}</p>
                      <p className="text-[11.5px] text-muted">{unit ? `${unit.toLocaleString('ru-RU')} ta uchun` : 'API tarifi'}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                    <Badge tone={adapter ? 'neutral' : 'warning'}>{s.type}</Badge>
                    <span className="text-muted">
                      {s.min?.toLocaleString('ru-RU') ?? '?'} – {s.max?.toLocaleString('ru-RU') ?? '?'}
                    </span>
                    {s.refill ? <Badge tone="success">Refill</Badge> : null}
                    {s.cancel ? <Badge tone="info">Bekor qilish</Badge> : null}
                    {s.dripfeed ? <Badge tone="violet">Drip-feed</Badge> : null}
                  </div>
                  <div className="mt-auto flex justify-end">
                    <Button variant="secondary" onClick={() => setOpen(s)}>
                      {adapter ? 'Buyurtma berish' : 'Batafsil'}
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {list.length > shown ? (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => setShown((n) => n + PAGE)}>
            Yana {Math.min(PAGE, list.length - shown)} ta ko‘rsatish
          </Button>
        </div>
      ) : null}

      {open ? <OrderDialog target={{ kind: 'smm', service: open }} rateUnit={unit} balance={balance} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
