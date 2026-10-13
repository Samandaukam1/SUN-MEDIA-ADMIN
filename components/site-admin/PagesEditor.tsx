'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/components/ui/cn';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { moveSiteOrder, saveSitePage, saveSiteSection } from '@/lib/actions/site';
import type { ActionState } from '@/lib/actions/state';
import type { SitePage, SiteSection } from '@/lib/site/types';

/** What each landing block shows, so the manager knows what they are switching. */
export const SECTION_INFO: Record<SiteSection['key'], { label: string; source: string }> = {
  marquee: { label: 'Hamkor logolari lentasi', source: 'Hamkorlar' },
  stats: { label: 'Raqamlar', source: 'Raqamlar va afzalliklar' },
  services: { label: 'Xizmatlar', source: 'Xizmatlar' },
  cases: { label: 'Keyslar', source: 'Keyslar (“Bosh sahifada” belgilanganlar)' },
  benefits: { label: 'Nega SUN MEDIA', source: 'Raqamlar va afzalliklar' },
  process: { label: 'Ish jarayoni', source: 'Jarayon va savollar' },
  partners: { label: 'Hamkorlar kartalari', source: 'Hamkorlar' },
  plans: { label: 'Tariflar', source: 'Tariflar' },
  testimonials: { label: 'Fikrlar', source: 'Fikrlar' },
  faq: { label: 'Savol-javoblar', source: 'Jarayon va savollar' },
  cta: { label: 'Ariza formasi (yakuniy blok)', source: 'Matnlar va aloqa' },
};

function OrderButtons({ disabledUp, disabledDown, onMove, pending }: { disabledUp: boolean; disabledDown: boolean; onMove: (d: -1 | 1) => void; pending: boolean }) {
  return (
    <div className="flex flex-col">
      <button type="button" aria-label="Yuqoriga" disabled={pending || disabledUp} onClick={() => onMove(-1)} className="rounded p-0.5 text-subtle hover:text-ink disabled:opacity-30">
        <Icon name="chevronDown" size={16} className="rotate-180" />
      </button>
      <button type="button" aria-label="Pastga" disabled={pending || disabledDown} onClick={() => onMove(1)} className="rounded p-0.5 text-subtle hover:text-ink disabled:opacity-30">
        <Icon name="chevronDown" size={16} />
      </button>
    </div>
  );
}

export function PagesEditor({ pages, sections, counts }: { pages: SitePage[]; sections: SiteSection[]; counts: Partial<Record<SitePage['key'], number>> }) {
  const router = useRouter();
  const [page, setPage] = useState<SitePage | null>(null);
  const [section, setSection] = useState<SiteSection | null>(null);
  const [state, setState] = useState<ActionState>({ status: 'idle' });
  const [listError, setListError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const errors = state.status === 'error' ? state.fieldErrors ?? {} : {};

  const run = (fn: () => Promise<ActionState>, onDone?: () => void) =>
    start(async () => {
      const result = await fn();
      if (onDone) {
        setState(result);
        if (result.status === 'success') onDone();
      } else {
        setListError(result.status === 'error' ? result.message : null);
      }
      router.refresh();
    });

  return (
    <div className="space-y-10">
      {listError ? <Notice tone="danger" title={listError} /> : null}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Sahifalar va menyu</h2>
          <p className="text-sm text-muted">Sarlavha, Google uchun matn, menyudagi nomi va tartibi. O‘chirilgan sahifa saytdan yo‘qoladi.</p>
        </div>
        <Card className="divide-y divide-line p-0">
          {pages.map((p, i) => {
            const empty = counts[p.key] === 0;
            return (
              <div key={p.key} className={cn('flex items-center gap-4 px-4 py-3.5', !p.is_published && 'opacity-60')}>
                {p.key === 'home' ? (
                  <span className="w-5" />
                ) : (
                  <OrderButtons
                    pending={pending}
                    disabledUp={i <= 1}
                    disabledDown={i === pages.length - 1}
                    onMove={(d) => run(() => moveSiteOrder('pages', p.key, d))}
                  />
                )}
                <button type="button" onClick={() => (setState({ status: 'idle' }), setPage(p))} className="min-w-0 flex-1 text-left">
                  <p className="font-medium">
                    {p.nav_label} <span className="ml-1 text-sm font-normal text-subtle">{p.path}</span>
                  </p>
                  <p className="truncate text-sm text-muted">{p.title.replaceAll('*', '')}</p>
                </button>
                <div className="hidden shrink-0 gap-2 sm:flex">
                  {empty ? <Badge tone="warning">Kontent yo‘q — menyuda ko‘rinmaydi</Badge> : null}
                  {p.key !== 'home' && !p.show_in_nav ? <Badge>Menyuda yo‘q</Badge> : null}
                  {p.is_published ? <Badge tone="success" dot>Ochiq</Badge> : <Badge dot>O‘chirilgan</Badge>}
                </div>
                <a href={p.path} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Saytda ochish">
                  <Icon name="externalLink" size={16} />
                </a>
                <Button variant="ghost" onClick={() => (setState({ status: 'idle' }), setPage(p))} aria-label="Tahrirlash">
                  <Icon name="edit" size={16} />
                </Button>
              </div>
            );
          })}
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Bosh sahifa bloklari</h2>
          <p className="text-sm text-muted">Landing sahifadagi bloklar tartibi, sarlavhasi va ko‘rinishi. Ichida kontent bo‘lmagan blok saytda o‘zi yashirinadi.</p>
        </div>
        <Card className="divide-y divide-line p-0">
          {sections.map((s, i) => (
            <div key={s.key} className={cn('flex items-center gap-4 px-4 py-3.5', !s.is_visible && 'opacity-60')}>
              <OrderButtons pending={pending} disabledUp={i === 0} disabledDown={i === sections.length - 1} onMove={(d) => run(() => moveSiteOrder('sections', s.key, d))} />
              <button type="button" onClick={() => (setState({ status: 'idle' }), setSection(s))} className="min-w-0 flex-1 text-left">
                <p className="font-medium">{SECTION_INFO[s.key].label}</p>
                <p className="truncate text-sm text-muted">{s.title ? s.title.replaceAll('*', '') : `Kontent: ${SECTION_INFO[s.key].source}`}</p>
              </button>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => saveSiteSection(s.key, { eyebrow: s.eyebrow, title: s.title, subtitle: s.subtitle, is_visible: !s.is_visible }))}
              >
                <Icon name={s.is_visible ? 'eye' : 'eyeOff'} size={16} />
                <span className="hidden lg:inline">{s.is_visible ? 'Ko‘rinadi' : 'Yashirin'}</span>
              </Button>
              <Button variant="ghost" onClick={() => (setState({ status: 'idle' }), setSection(s))} aria-label="Tahrirlash">
                <Icon name="edit" size={16} />
              </Button>
            </div>
          ))}
        </Card>
      </section>

      <Dialog open={!!page} onClose={() => !pending && setPage(null)} title={page ? `Sahifa: ${page.nav_label}` : ''} description={page?.path} size="lg">
        {page ? (
          <PageForm
            key={page.key}
            page={page}
            errors={errors}
            state={state}
            pending={pending}
            onCancel={() => setPage(null)}
            onSave={(values) => run(() => saveSitePage(page.key, values), () => setPage(null))}
          />
        ) : null}
      </Dialog>

      <Dialog open={!!section} onClose={() => !pending && setSection(null)} title={section ? `Blok: ${SECTION_INFO[section.key].label}` : ''} description={section ? `Kontent: ${SECTION_INFO[section.key].source}` : undefined} size="lg">
        {section ? (
          <SectionForm
            key={section.key}
            section={section}
            errors={errors}
            state={state}
            pending={pending}
            onCancel={() => setSection(null)}
            onSave={(values) => run(() => saveSiteSection(section.key, values), () => setSection(null))}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

type FormProps<T> = {
  errors: Record<string, string>;
  state: ActionState;
  pending: boolean;
  onCancel: () => void;
  onSave: (values: Record<string, unknown>) => void;
} & T;

function PageForm({ page, errors, state, pending, onCancel, onSave }: FormProps<{ page: SitePage }>) {
  const [v, setV] = useState({
    nav_label: page.nav_label,
    title: page.title,
    subtitle: page.subtitle,
    seo_title: page.seo_title,
    seo_description: page.seo_description,
    is_published: page.is_published,
    show_in_nav: page.show_in_nav,
  });
  const home = page.key === 'home';
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
      {home ? <Notice tone="info" title="Bosh sahifa sarlavhasi “Matnlar va aloqa → Bosh ekran”da tahrirlanadi." /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Menyudagi nomi" required maxLength={30} value={v.nav_label} error={errors.nav_label} onChange={(e) => setV({ ...v, nav_label: e.target.value })} />
        {!home ? (
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-3 text-sm font-medium">
              <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={v.is_published} onChange={(e) => setV({ ...v, is_published: e.target.checked })} />
              Sahifa ochiq
            </label>
            <label className="flex items-center gap-3 text-sm font-medium">
              <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={v.show_in_nav} onChange={(e) => setV({ ...v, show_in_nav: e.target.checked })} />
              Menyuda ko‘rsatish
            </label>
          </div>
        ) : (
          <span />
        )}
        <div className="sm:col-span-2">
          <TextInput label="Sahifa sarlavhasi" required maxLength={160} value={v.title} error={errors.title} hint="*yulduzcha* ichidagi so‘zlar lime rangda" onChange={(e) => setV({ ...v, title: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <TextArea label="Sarlavha osti matni" maxLength={400} rows={3} value={v.subtitle} error={errors.subtitle} onChange={(e) => setV({ ...v, subtitle: e.target.value })} />
        </div>
        <TextInput label="Google sarlavhasi" maxLength={80} value={v.seo_title} error={errors.seo_title} hint="Bo‘sh bo‘lsa sahifa sarlavhasi" onChange={(e) => setV({ ...v, seo_title: e.target.value })} />
        <TextInput label="Google tavsifi" maxLength={200} value={v.seo_description} error={errors.seo_description} onChange={(e) => setV({ ...v, seo_description: e.target.value })} />
      </div>
      <div className="flex justify-end gap-3 border-t border-line pt-5">
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Bekor qilish
        </Button>
        <Button type="submit" loading={pending}>
          Saqlash
        </Button>
      </div>
    </form>
  );
}

function SectionForm({ section, errors, state, pending, onCancel, onSave }: FormProps<{ section: SiteSection }>) {
  const [v, setV] = useState({ eyebrow: section.eyebrow, title: section.title, subtitle: section.subtitle, is_visible: section.is_visible });
  const cta = section.key === 'cta';
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
      {cta ? <Notice tone="info" title="Bo‘sh qolsa “Matnlar va aloqa → Yakuniy blok” matni ishlatiladi." /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {!cta && section.key !== 'marquee' ? (
          <TextInput label="Kichik yozuv (sarlavha ustida)" maxLength={40} value={v.eyebrow} error={errors.eyebrow} onChange={(e) => setV({ ...v, eyebrow: e.target.value })} />
        ) : null}
        <label className="flex items-center gap-3 self-end pb-3 text-sm font-medium">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={v.is_visible} onChange={(e) => setV({ ...v, is_visible: e.target.checked })} />
          Bosh sahifada ko‘rinadi
        </label>
        <div className="sm:col-span-2">
          <TextInput label="Sarlavha" maxLength={160} value={v.title} error={errors.title} hint="*yulduzcha* ichidagi so‘zlar lime rangda" onChange={(e) => setV({ ...v, title: e.target.value })} />
        </div>
        {section.key !== 'marquee' ? (
          <div className="sm:col-span-2">
            <TextArea label="Sarlavha osti matni" maxLength={400} rows={3} value={v.subtitle} error={errors.subtitle} onChange={(e) => setV({ ...v, subtitle: e.target.value })} />
          </div>
        ) : null}
      </div>
      <div className="flex justify-end gap-3 border-t border-line pt-5">
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Bekor qilish
        </Button>
        <Button type="submit" loading={pending}>
          Saqlash
        </Button>
      </div>
    </form>
  );
}
