'use client';

import { useRouter } from 'next/navigation';
import { Fragment, useState, useTransition } from 'react';

import { SiteIcon } from '@/components/site/SiteIcon';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/components/ui/cn';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { SelectInput, TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { deleteSiteItem, discardSiteUploads, moveSiteItem, saveSiteItem, setSiteItemPublished } from '@/lib/actions/site';
import type { ActionState } from '@/lib/actions/state';
import { blankItem, SITE_COLLECTIONS, type SiteCollectionKey, type SiteField } from '@/lib/site/collections';
import { SITE_ICONS } from '@/lib/site/types';
import { GalleryUpload, ImageUpload } from './ImageUpload';

type Row = Record<string, unknown> & { id: string; is_published: boolean };
type Option = { id: string; name: string };
export type ClientPreset = { name: string; logoUrl: string | null };

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** Lists whose rows have their own page on the site. */
const PUBLIC_PAGE: Partial<Record<SiteCollectionKey, string>> = { partners: '/hamkorlar', cases: '/keyslar' };

/** Add / edit / hide / reorder / delete the rows of one "Sayt" list. */
export function CollectionEditor({
  collection,
  rows,
  partners = [],
  presets = [],
}: {
  collection: SiteCollectionKey;
  rows: Row[];
  partners?: Option[];
  presets?: ClientPreset[];
}) {
  const config = SITE_COLLECTIONS[collection];
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string | null; values: Record<string, unknown> } | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [state, setState] = useState<ActionState>({ status: 'idle' });
  const [listError, setListError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const [pending, start] = useTransition();

  const open = (row: Row | null) => {
    setState({ status: 'idle' });
    setFresh([]);
    setEditing({ id: row?.id ?? null, values: row ? { ...blankItem(config), ...row } : blankItem(config) });
  };
  // Images uploaded in this dialog (not the ones the row already had): removed again if they end up unused.
  const isSiteUpload = (v: unknown): v is string => typeof v === 'string' && v.includes('/storage/v1/object/public/branding/site/');
  const urlsIn = (values: Record<string, unknown>) =>
    Object.values(values).flatMap((v) => (Array.isArray(v) ? v.filter(isSiteUpload) : isSiteUpload(v) ? [v] : []));
  const close = () => {
    if (fresh.length) void discardSiteUploads(fresh);
    setFresh([]);
    setEditing(null);
  };
  const set = (key: string, value: unknown) => {
    const before = new Set(editing ? urlsIn(editing.values) : []);
    const added = (Array.isArray(value) ? value.filter(isSiteUpload) : isSiteUpload(value) ? [value] : []).filter((u) => !before.has(u));
    if (added.length) setFresh((f) => [...f, ...added]);
    setEditing((e) => (e ? { ...e, values: { ...e.values, [key]: value } } : e));
  };

  const save = () =>
    start(async () => {
      if (!editing) return;
      const values = Object.fromEntries(config.fields.map((f) => [f.key, editing.values[f.key]]));
      const result = await saveSiteItem(collection, editing.id, values);
      setState(result);
      if (result.status === 'success') {
        const used = new Set(urlsIn(values));
        const unused = fresh.filter((u) => !used.has(u));
        if (unused.length) void discardSiteUploads(unused);
        setFresh([]);
        setEditing(null);
        router.refresh();
      }
    });

  const act = (fn: () => Promise<ActionState>) =>
    start(async () => {
      const result = await fn();
      setListError(result.status === 'error' ? result.message : null);
      router.refresh();
    });

  const errors = state.status === 'error' ? state.fieldErrors ?? {} : {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">{config.description}</p>
        <Button onClick={() => open(null)} icon={<Icon name="plus" size={16} />}>
          {config.addLabel}
        </Button>
      </div>
      {listError ? <Notice tone="danger" title={listError} /> : null}

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-sm text-subtle">{config.emptyText}</p>
      ) : (
        <Card className="divide-y divide-line p-0">
          {rows.map((row, i) => {
            const thumb = config.thumb ? (row[config.thumb] as string | null) : null;
            return (
              <div key={row.id} className={cn('flex items-center gap-4 px-4 py-3.5', !row.is_published && 'opacity-60')}>
                <div className="flex flex-col">
                  <button
                    type="button"
                    aria-label="Yuqoriga"
                    disabled={pending || i === 0}
                    onClick={() => act(() => moveSiteItem(collection, row.id, -1))}
                    className="rounded p-0.5 text-subtle hover:text-ink disabled:opacity-30"
                  >
                    <Icon name="chevronDown" size={16} className="rotate-180" />
                  </button>
                  <button
                    type="button"
                    aria-label="Pastga"
                    disabled={pending || i === rows.length - 1}
                    onClick={() => act(() => moveSiteItem(collection, row.id, 1))}
                    className="rounded p-0.5 text-subtle hover:text-ink disabled:opacity-30"
                  >
                    <Icon name="chevronDown" size={16} />
                  </button>
                </div>
                {config.thumb ? (
                  <div className={cn('grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-line', collection === 'partners' ? 'bg-white' : 'bg-surface-2')}>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className={cn('size-full', collection === 'partners' ? 'object-contain p-1.5' : 'object-cover')} />
                    ) : (
                      <Icon name="image" size={16} className="text-subtle" />
                    )}
                  </div>
                ) : 'icon' in row ? (
                  <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-on-soft">
                    <SiteIcon name={str(row.icon)} size={20} />
                  </span>
                ) : null}
                <button type="button" onClick={() => open(row)} className="min-w-0 flex-1 text-left">
                  <p className="truncate font-medium">{str(row[config.primary]) || '—'}</p>
                  {config.secondary ? <p className="truncate text-sm text-muted">{str(row[config.secondary])}</p> : null}
                </button>
                <div className="hidden shrink-0 items-center gap-2 sm:flex">
                  {row.is_featured ? <Badge tone="accent">Bosh sahifada</Badge> : null}
                  {collection === 'partners' && row.since_year ? <Badge>{str(row.since_year)}-yildan</Badge> : null}
                  {row.is_published ? <Badge tone="success" dot>Faol</Badge> : <Badge dot>Nofaol</Badge>}
                </div>
                <div className="flex shrink-0 gap-1">
                  {PUBLIC_PAGE[collection] && row.slug && row.is_published ? (
                    <a
                      href={`${PUBLIC_PAGE[collection]}/${str(row.slug)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Saytdagi sahifasini ochish"
                      title="Saytdagi sahifasi"
                      className="grid size-10 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink"
                    >
                      <Icon name="externalLink" size={16} />
                    </a>
                  ) : null}
                  <Button variant="ghost" disabled={pending} onClick={() => act(() => setSiteItemPublished(collection, row.id, !row.is_published))}>
                    <Icon name={row.is_published ? 'eyeOff' : 'eye'} size={16} />
                    <span className="hidden lg:inline">{row.is_published ? 'Nofaol qilish' : 'Faollashtirish'}</span>
                  </Button>
                  <Button variant="ghost" onClick={() => open(row)} aria-label="Tahrirlash">
                    <Icon name="edit" size={16} />
                  </Button>
                  <Button variant="ghost" onClick={() => setDeleting(row)} aria-label="O‘chirish" className="text-danger">
                    <Icon name="x" size={16} />
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <Dialog open={!!editing} onClose={() => !pending && close()} title={editing?.id ? 'Tahrirlash' : config.addLabel} size="lg">
        {editing ? (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
            {collection === 'partners' && !editing.id && presets.length ? (
              <SelectInput
                label="Mijozlardan to‘ldirish"
                hint="Tizimdagi mijozning nomi va logotipini oladi — keyin tahrirlang."
                defaultValue=""
                onChange={(e) => {
                  const preset = presets[Number(e.target.value)];
                  if (!preset) return;
                  set('name', preset.name);
                  if (preset.logoUrl) set('logo_url', preset.logoUrl);
                }}
              >
                <option value="">— Mijozni tanlang —</option>
                {presets.map((p, i) => (
                  <option key={`${p.name}-${i}`} value={i}>
                    {p.name}
                  </option>
                ))}
              </SelectInput>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              {config.fields.map((f) => (
                <Fragment key={f.key}>
                  {f.section ? (
                    <h3 className="mt-2 border-t border-line pt-5 text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase first:mt-0 first:border-0 first:pt-0 sm:col-span-2">
                      {f.section}
                    </h3>
                  ) : null}
                  <div className={f.half ? '' : 'sm:col-span-2'}>
                    <FieldEditor field={f} value={editing.values[f.key]} onChange={(v) => set(f.key, v)} error={errors[f.key]} folder={config.folder} partners={partners} />
                  </div>
                </Fragment>
              ))}
            </div>
            <div className="flex justify-end gap-3 border-t border-line pt-5">
              <Button type="button" variant="secondary" disabled={pending} onClick={close}>
                Bekor qilish
              </Button>
              <Button type="submit" loading={pending}>
                Saqlash
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>

      <Dialog open={!!deleting} onClose={() => !pending && setDeleting(null)} title="O‘chirilsinmi?" description={deleting ? `“${str(deleting[config.primary])}” saytdan butunlay o‘chiriladi. Faqat yashirish uchun “Yashirish”ni bosing.` : undefined}>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" disabled={pending} onClick={() => setDeleting(null)}>
            Bekor qilish
          </Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() =>
              start(async () => {
                if (!deleting) return;
                const result = await deleteSiteItem(collection, deleting.id);
                setListError(result.status === 'error' ? result.message : null);
                setDeleting(null);
                router.refresh();
              })
            }
          >
            O‘chirish
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function FieldEditor({
  field: f,
  value,
  onChange,
  error,
  folder,
  partners,
}: {
  field: SiteField;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
  folder: string;
  partners: Option[];
}) {
  const id = `site-${f.key}`;
  switch (f.type) {
    case 'text':
    case 'slug':
    case 'url':
      return (
        <TextInput
          id={id}
          label={f.label}
          required={f.required}
          maxLength={f.type === 'url' ? 300 : f.max}
          placeholder={f.placeholder}
          hint={f.hint}
          error={error}
          inputMode={f.type === 'url' ? 'url' : undefined}
          value={str(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'textarea':
      return (
        <TextArea id={id} label={f.label} required={f.required} maxLength={f.max} rows={f.rows ?? 3} hint={f.hint} error={error} value={str(value)} onChange={(e) => onChange(e.target.value)} />
      );
    case 'year':
      return (
        <TextInput
          id={id}
          label={f.label}
          type="number"
          min={1990}
          max={2100}
          step={1}
          placeholder={String(new Date().getFullYear())}
          hint={f.hint}
          error={error}
          value={value == null ? '' : str(value)}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        />
      );
    case 'boolean':
      return (
        <label className="flex h-full min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm font-medium">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          {f.label}
        </label>
      );
    case 'partner':
      return (
        <SelectInput id={id} label={f.label} hint={f.hint} error={error} value={str(value)} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">— Tanlanmagan —</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectInput>
      );
    case 'icon':
      return (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">{f.label}</span>
          <div className="flex flex-wrap gap-1.5">
            {SITE_ICONS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={value === key}
                onClick={() => onChange(key)}
                className={cn(
                  'grid size-9 place-items-center rounded-lg border transition-colors',
                  value === key ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-muted hover:text-ink',
                )}
              >
                <SiteIcon name={key} size={17} />
              </button>
            ))}
          </div>
        </div>
      );
    case 'image':
      return (
        <ImageUpload
          label={f.label}
          hint={f.hint}
          error={error}
          folder={folder}
          logo={f.key === 'logo_url'}
          value={typeof value === 'string' ? value : null}
          onChange={onChange}
        />
      );
    case 'gallery':
      return <GalleryUpload label={f.label} folder={folder} max={f.items ?? 12} error={error} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} />;
    case 'list': {
      const items = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">{f.label}</span>
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={item}
                  maxLength={f.max}
                  onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
                  aria-label={`${f.label} ${i + 1}`}
                  className="h-10 flex-1 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none focus:border-accent"
                />
                <Button type="button" variant="ghost" aria-label="Olib tashlash" onClick={() => onChange(items.filter((_, j) => j !== i))}>
                  <Icon name="x" size={15} />
                </Button>
              </div>
            ))}
            {items.length < (f.items ?? 8) ? (
              <Button type="button" variant="secondary" onClick={() => onChange([...items, ''])} icon={<Icon name="plus" size={15} />}>
                Qator qo‘shish
              </Button>
            ) : null}
          </div>
          {error ? <p className="text-[13px] text-danger">{error}</p> : f.hint ? <p className="text-[13px] text-subtle">{f.hint}</p> : null}
        </div>
      );
    }
    case 'timeline': {
      const rows = Array.isArray(value) ? (value as { period: string; title: string; text: string }[]) : [];
      const update = (i: number, key: 'period' | 'title' | 'text', v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
      const move = (i: number, dir: -1 | 1) => {
        const j = i + dir;
        if (j < 0 || j >= rows.length) return;
        const next = [...rows];
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
      };
      return (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">{f.label}</span>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="rounded-xl border border-line bg-surface p-3">
                <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
                  <input
                    value={r.period}
                    maxLength={40}
                    placeholder="2024 · bahor"
                    onChange={(e) => update(i, 'period', e.target.value)}
                    aria-label={`${i + 1}-bosqich davri`}
                    className="h-10 rounded-lg border border-line bg-surface px-3 text-sm font-semibold outline-none focus:border-accent"
                  />
                  <input
                    value={r.title}
                    maxLength={80}
                    placeholder="Hamkorlik boshlandi"
                    onChange={(e) => update(i, 'title', e.target.value)}
                    aria-label={`${i + 1}-bosqich nomi`}
                    className="h-10 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-accent"
                  />
                </div>
                <div className="mt-2 flex gap-2">
                  <textarea
                    value={r.text}
                    maxLength={400}
                    rows={2}
                    placeholder="Nima qilindi, qanday natija bo‘ldi"
                    onChange={(e) => update(i, 'text', e.target.value)}
                    aria-label={`${i + 1}-bosqich matni`}
                    className="min-w-0 flex-1 resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                  <div className="flex flex-col">
                    <Button type="button" variant="ghost" aria-label="Yuqoriga" disabled={i === 0} onClick={() => move(i, -1)}>
                      <Icon name="chevronDown" size={15} className="rotate-180" />
                    </Button>
                    <Button type="button" variant="ghost" aria-label="Pastga" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                      <Icon name="chevronDown" size={15} />
                    </Button>
                  </div>
                  <Button type="button" variant="ghost" aria-label="Bosqichni o‘chirish" className="text-danger" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                    <Icon name="x" size={15} />
                  </Button>
                </div>
              </div>
            ))}
            {rows.length < (f.items ?? 12) ? (
              <Button type="button" variant="secondary" onClick={() => onChange([...rows, { period: '', title: '', text: '' }])} icon={<Icon name="plus" size={15} />}>
                Bosqich qo‘shish
              </Button>
            ) : null}
          </div>
          {error ? <p className="text-[13px] text-danger">{error}</p> : f.hint ? <p className="text-[13px] text-subtle">{f.hint}</p> : null}
        </div>
      );
    }
    case 'results': {
      const rows = Array.isArray(value) ? (value as { value: string; label: string }[]) : [];
      const update = (i: number, key: 'value' | 'label', v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
      return (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">{f.label}</span>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={r.value}
                  maxLength={16}
                  placeholder="+240%"
                  onChange={(e) => update(i, 'value', e.target.value)}
                  aria-label="Qiymat"
                  className="h-10 w-28 rounded-xl border border-line bg-surface px-3.5 text-sm font-semibold outline-none focus:border-accent"
                />
                <input
                  value={r.label}
                  maxLength={60}
                  placeholder="Instagram qamrovi"
                  onChange={(e) => update(i, 'label', e.target.value)}
                  aria-label="Izoh"
                  className="h-10 flex-1 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none focus:border-accent"
                />
                <Button type="button" variant="ghost" aria-label="Olib tashlash" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                  <Icon name="x" size={15} />
                </Button>
              </div>
            ))}
            {rows.length < (f.items ?? 6) ? (
              <Button type="button" variant="secondary" onClick={() => onChange([...rows, { value: '', label: '' }])} icon={<Icon name="plus" size={15} />}>
                Natija qo‘shish
              </Button>
            ) : null}
          </div>
          {error ? <p className="text-[13px] text-danger">{error}</p> : f.hint ? <p className="text-[13px] text-subtle">{f.hint}</p> : null}
        </div>
      );
    }
  }
}
