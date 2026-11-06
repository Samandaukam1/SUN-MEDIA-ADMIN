'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectInput, TextInput } from '@/components/ui/Inputs';
import { smmCatalog } from '@/lib/actions/smm';
import type { DonatProduct, Gift } from '@/lib/neosmm/catalog';
import { decCmp, formatSom, parseDec } from '@/lib/neosmm/decimal';
import type { Balance, Catalog } from '@/lib/neosmm/server';

import { OrderDialog } from './OrderDialog';
import { Freshness } from './SmmApi';

type Ok = Extract<Balance, { ok: true }> | null;
const byPrice = (a: { price: string }, b: { price: string }) => decCmp(parseDec(a.price) ?? { n: 0n, s: 0 }, parseDec(b.price) ?? { n: 0n, s: 0 });

function useCatalog<K extends 'gifts' | 'donat_services'>(kind: K, initial: Catalog<K>) {
  const [catalog, setCatalog] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const reload = async () => {
    setRefreshing(true);
    try {
      setCatalog((await smmCatalog(kind, true)) as Catalog<K>);
    } catch {
      setCatalog((c) => ({ ...c, error: 'Ro‘yxatni yangilab bo‘lmadi.', stale: c.items.length > 0 }));
    } finally {
      setRefreshing(false);
    }
  };
  return { catalog, refreshing, reload };
}

/** Game donat: every product, by game, with its fixed price and the fields it asks for. */
export function DonatView({ catalog: initial, balance }: { catalog: Catalog<'donat_services'>; balance: Ok }) {
  const { catalog, refreshing, reload } = useCatalog('donat_services', initial);
  const [game, setGame] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<DonatProduct | null>(null);
  const games = useMemo(() => [...new Set(catalog.items.map((p) => p.game))].sort((a, b) => a.localeCompare(b)), [catalog.items]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return catalog.items
      .filter((p) => (!game || p.game === game) && (!t || String(p.id) === t || p.name.toLowerCase().includes(t) || p.game.toLowerCase().includes(t)))
      .sort((a, b) => a.game.localeCompare(b.game) || byPrice(a, b) || a.id - b.id);
  }, [catalog.items, game, q]);

  return (
    <div className="space-y-4">
      <Freshness catalog={catalog} onRefresh={() => void reload()} refreshing={refreshing} />
      <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
        <TextInput label="Qidirish" placeholder="Nomi yoki ID" value={q} onChange={(e) => setQ(e.target.value)} />
        <SelectInput label="O‘yin" value={game} onChange={(e) => setGame(e.target.value)}>
          <option value="">Barcha o‘yinlar ({games.length})</option>
          {games.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </SelectInput>
      </div>
      <p className="text-sm text-muted">
        {list.length} ta mahsulot (jami {catalog.items.length})
      </p>
      {list.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <li key={p.id}>
              <Card className="flex h-full flex-col gap-2 p-4">
                <p className="text-[12px] text-muted">
                  #{p.id} · {p.game}
                </p>
                <p className="font-medium break-words">{p.name}</p>
                <div className="flex flex-wrap gap-1.5 text-[12px]">
                  <Badge>{p.type}</Badge>
                  {p.requires.map((r) => (
                    <Badge key={r} tone="info">
                      {r === 'server_id' ? 'Server ID' : r === 'player_id' ? 'O‘yinchi ID' : r}
                    </Badge>
                  ))}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <span className="font-semibold tabular-nums">{formatSom(p.price, p.currency)}</span>
                  <Button variant="secondary" onClick={() => setOpen(p)}>
                    Sotib olish
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card className="p-8 text-center text-sm text-muted">{catalog.items.length ? 'Bu filtr bo‘yicha mahsulot yo‘q.' : 'Donat ro‘yxati bo‘sh yoki yuklanmadi.'}</Card>
      )}
      {open ? <OrderDialog target={{ kind: 'donat', product: open }} balance={balance} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

/** Telegram gifts: every gift with its fixed price (and Stars). */
export function GiftsView({ catalog: initial, balance }: { catalog: Catalog<'gifts'>; balance: Ok }) {
  const { catalog, refreshing, reload } = useCatalog('gifts', initial);
  const [open, setOpen] = useState<Gift | null>(null);
  const list = useMemo(() => [...catalog.items].sort((a, b) => byPrice(a, b) || a.id - b.id), [catalog.items]);
  return (
    <div className="space-y-4">
      <Freshness catalog={catalog} onRefresh={() => void reload()} refreshing={refreshing} />
      <p className="text-sm text-muted">{list.length} ta sovg‘a</p>
      {list.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((g) => (
            <li key={g.id}>
              <Card className="flex h-full flex-col gap-2 p-4">
                <p className="text-[12px] text-muted">#{g.id}</p>
                <p className="font-medium break-words">{g.name}</p>
                {g.stars ? <p className="text-[12.5px] text-muted">{g.stars} Stars</p> : null}
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <span className="font-semibold tabular-nums">{formatSom(g.price)}</span>
                  <Button variant="secondary" onClick={() => setOpen(g)}>
                    Yuborish
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card className="p-8 text-center text-sm text-muted">Sovg‘alar ro‘yxati bo‘sh yoki yuklanmadi.</Card>
      )}
      {open ? <OrderDialog target={{ kind: 'gift', gift: open }} balance={balance} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
