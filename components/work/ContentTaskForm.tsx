'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { SelectInput, TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { createContentTask } from '@/lib/actions/workflow';
import { CONTENT_TYPE } from '@/lib/labels';
import { WORKFLOW_ROLE_LABEL, type WorkflowRole } from '@/lib/workflow-shared';

type Person = { id: string; name: string; jobTitle: string | null; skills: { id: string; name: string; workflowRole: WorkflowRole | null }[] };
type Option = { id: string; name: string };

const Label = ({ children }: { children: React.ReactNode }) => <p className="text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">{children}</p>;

/** People as toggles; `role` limits the list to those with that skill. */
function PeoplePicker({
  people,
  selected,
  onChange,
  role,
  single = false,
  marks,
}: {
  people: Person[];
  selected: string[];
  onChange: (ids: string[]) => void;
  role?: WorkflowRole;
  single?: boolean;
  marks?: (id: string) => string | null;
}) {
  const list = role ? people.filter((p) => p.skills.some((s) => s.workflowRole === role)) : people;
  if (!list.length) {
    return (
      <p className="rounded-xl border border-dashed border-line px-3 py-3 text-[13px] text-muted">
        {role ? `Hali hech kimda “${WORKFLOW_ROLE_LABEL[role]}” skilli yo‘q.` : 'Faol xodim yo‘q.'}{' '}
        <Link href="/team" className="font-medium text-ink underline underline-offset-2">
          Jamoa → xodim → Skilllar
        </Link>
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((p) => {
        const on = selected.includes(p.id);
        const mark = marks?.(p.id);
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(single ? (on ? [] : [p.id]) : on ? selected.filter((x) => x !== p.id) : [...selected, p.id])}
            className={cn(
              'group flex max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
              on ? 'border-accent bg-accent-soft text-accent-on-soft' : 'border-line bg-surface hover:bg-surface-2',
            )}
            title={p.skills.map((s) => s.name).join(', ') || undefined}
          >
            <span className={cn('grid size-4 shrink-0 place-items-center rounded border', on ? 'border-current bg-current' : 'border-line-strong')}>
              {on ? <Icon name="check" size={11} className="text-surface" /> : null}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{p.name}</span>
              <span className="block truncate text-[11.5px] opacity-70">{p.skills.map((s) => s.name).join(' · ') || p.jobTitle || 'Skill yo‘q'}</span>
            </span>
            {mark ? <span className="ml-1 shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold text-muted">{mark}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function ContentTaskForm({ clients, people, equipment, defaultClient }: { clients: Option[]; people: Person[]; equipment: Option[]; defaultClient?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    title: '',
    clientId: defaultClient ?? '',
    contentType: 'reel',
    topic: '',
    description: '',
    shootDate: '',
    shootTime: '11:00',
    location: '',
    postDate: '',
    postTime: '19:00',
    note: '',
  });
  const [responsible, setResponsible] = useState<string[]>([]);
  const [writer, setWriter] = useState<string[]>([]);
  const [operators, setOperators] = useState<string[]>([]);
  const [goers, setGoers] = useState<string[]>([]);
  const [gear, setGear] = useState<string[]>([]);
  const [newGear, setNewGear] = useState<string[]>([]);
  const [gearName, setGearName] = useState('');
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [key]: e.target.value });

  const nameOf = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  const hasShoot = !!f.shootDate;

  // Picking an operator usually means they go to the shoot too; it stays a separate, editable choice.
  const pickOperators = (ids: string[]) => {
    const added = ids.filter((id) => !operators.includes(id));
    setOperators(ids);
    if (added.length) setGoers([...new Set([...goers, ...added])]);
  };

  const addGear = () => {
    const name = gearName.trim();
    if (!name) return;
    const existing = equipment.find((e) => e.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!gear.includes(existing.id)) setGear([...gear, existing.id]);
    } else if (!newGear.some((g) => g.toLowerCase() === name.toLowerCase())) {
      setNewGear([...newGear, name.slice(0, 80)]);
    }
    setGearName('');
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await createContentTask({
        ...f,
        contentType: f.contentType as 'reel',
        responsibleIds: responsible,
        scriptwriterId: writer[0] ?? '',
        operatorIds: operators,
        shootMemberIds: hasShoot ? goers : [],
        equipmentIds: hasShoot ? gear : [],
        newEquipment: hasShoot ? newGear : [],
        shootDate: f.shootDate,
      });
      if (!res.ok) {
        setError(res.message);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      router.push(`/work/content/${res.id}`);
    });

  const summary = [
    writer[0] ? `Ssenarist: ${nameOf.get(writer[0])}` : null,
    operators.length ? `Operator: ${operators.map((id) => nameOf.get(id)).join(', ')}` : null,
    hasShoot && goers.length ? `Syomkaga: ${goers.map((id) => nameOf.get(id)).join(', ')}` : null,
    responsible.length ? `Mas’ul: ${responsible.map((id) => nameOf.get(id)).join(', ')}` : null,
  ].filter(Boolean);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="grid gap-6 xl:grid-cols-[1.35fr_1fr]"
    >
      <div className="space-y-6">
        {error ? <Notice tone="danger" title={error} /> : null}
        <Card className="space-y-4">
          <Label>Kontent</Label>
          <TextInput label="Vazifa nomi" name="title" required maxLength={200} value={f.title} onChange={set('title')} placeholder="SAFI — Yangi mahsulot reklamasi" />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectInput label="Mijoz" name="client" required value={f.clientId} onChange={set('clientId')}>
              <option value="">Mijozni tanlang</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectInput>
            <SelectInput label="Kontent turi" name="type" required value={f.contentType} onChange={set('contentType')}>
              {Object.entries(CONTENT_TYPE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </SelectInput>
          </div>
          <TextInput label="Kontent mavzusi" name="topic" required maxLength={300} value={f.topic} onChange={set('topic')} placeholder="Yangi tovuq mahsulotlari" />
          <TextArea label="Kontent haqida ma’lumot" name="description" maxLength={4000} value={f.description} onChange={set('description')} placeholder="G‘oya, uslub, referenslar…" />
        </Card>

        <Card className="space-y-4">
          <Label>Syomka va post</Label>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextInput label="Syomka sanasi" name="shootDate" type="date" value={f.shootDate} onChange={set('shootDate')} />
            <TextInput label="Syomka vaqti" name="shootTime" type="time" value={f.shootTime} onChange={set('shootTime')} disabled={!hasShoot} />
            <TextInput label="Syomka manzili" name="location" maxLength={200} value={f.location} onChange={set('location')} disabled={!hasShoot} placeholder="Studiya / manzil" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextInput label="Post sanasi" name="postDate" type="date" value={f.postDate} onChange={set('postDate')} />
            <TextInput label="Post vaqti" name="postTime" type="time" value={f.postTime} onChange={set('postTime')} disabled={!f.postDate} />
          </div>
          {!hasShoot ? <p className="text-[13px] text-subtle">Syomka sanasi kiritilmasa, syomka va jihozlar bosqichi yaratilmaydi.</p> : null}
        </Card>

        {hasShoot ? (
          <Card className="space-y-4">
            <Label>Syomkaga olinadigan jihozlar</Label>
            <div className="flex flex-wrap gap-2">
              {equipment.map((e) => {
                const on = gear.includes(e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setGear(on ? gear.filter((x) => x !== e.id) : [...gear, e.id])}
                    className={cn('flex items-center gap-2 rounded-xl border px-3 py-2 text-sm', on ? 'border-accent bg-accent-soft text-accent-on-soft' : 'border-line hover:bg-surface-2')}
                  >
                    <span className={cn('grid size-4 place-items-center rounded border', on ? 'border-current bg-current' : 'border-line-strong')}>
                      {on ? <Icon name="check" size={11} className="text-surface" /> : null}
                    </span>
                    {e.name}
                  </button>
                );
              })}
              {newGear.map((g) => (
                <span key={g} className="flex items-center gap-1.5 rounded-xl border border-accent bg-accent-soft py-2 pr-2 pl-3 text-sm text-accent-on-soft">
                  {g} <span className="text-[11px] opacity-70">yangi</span>
                  <button type="button" onClick={() => setNewGear(newGear.filter((x) => x !== g))} aria-label={`${g} — olib tashlash`} className="grid size-5 place-items-center rounded-full hover:bg-black/10">
                    <Icon name="x" size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={gearName}
                onChange={(e) => setGearName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addGear();
                  }
                }}
                maxLength={80}
                placeholder="Yangi jihoz, masalan: Dron"
                aria-label="Yangi jihoz nomi"
                className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none placeholder:text-subtle focus:border-accent"
              />
              <Button type="button" variant="secondary" onClick={addGear} icon={<Icon name="plus" size={16} />}>
                Qo‘shish
              </Button>
            </div>
            <p className="text-[12.5px] text-subtle">Jihozlarni admin tayyorlab, “Syomka jihozlari” bo‘limida tasdiqlaydi.</p>
          </Card>
        ) : null}

        <Card className="space-y-3">
          <TextArea label="Qo‘shimcha izoh" name="note" maxLength={4000} value={f.note} onChange={set('note')} placeholder="Ssenarist va jamoa uchun izoh" />
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="space-y-3">
          <Label>Ssenarist</Label>
          <PeoplePicker people={people} selected={writer} onChange={setWriter} role="scriptwriter" single />
          <p className="text-[12.5px] text-subtle">Ssenaristga mijoz, mavzu, izoh va muddat bilan alohida vazifa avtomatik beriladi.</p>
        </Card>
        <Card className="space-y-3">
          <Label>Operator</Label>
          <PeoplePicker people={people} selected={operators} onChange={pickOperators} role="operator" />
        </Card>
        <Card className="space-y-3">
          <Label>Syomkaga boradigan xodimlar</Label>
          {hasShoot ? (
            <PeoplePicker
              people={people}
              selected={goers}
              onChange={setGoers}
              marks={(id) => [operators.includes(id) ? 'Operator' : null, writer.includes(id) ? 'Ssenarist' : null].filter(Boolean).join(', ') || null}
            />
          ) : (
            <p className="text-[13px] text-muted">Avval syomka sanasini kiriting.</p>
          )}
        </Card>
        <Card className="space-y-3">
          <Label>Mas’ul xodimlar</Label>
          <PeoplePicker people={people} selected={responsible} onChange={setResponsible} />
          <p className="text-[12.5px] text-subtle">Mas’ullar postni joylash bosqichini oladi va jarayonni kuzatadi. Montajyorni keyin admin belgilaydi.</p>
        </Card>
        <Card className="space-y-3">
          <Label>Yaratilganda</Label>
          <ul className="space-y-1.5 text-[13.5px] text-muted">
            <li>• Kontent va bosqichlar: ssenariy, {hasShoot && (gear.length || newGear.length) ? 'jihozlar, ' : ''}{hasShoot ? 'syomka, ' : ''}{!['post', 'carousel', 'design'].includes(f.contentType) ? 'montaj, ' : ''}post</li>
            <li>• Har bir xodimga bitta bildirishnoma — o‘z roli bilan</li>
            {summary.map((s) => (
              <li key={s}>• {s}</li>
            ))}
          </ul>
        </Card>
        <div className="flex justify-end gap-3">
          <Link href="/work/tasks" className="inline-flex h-12 items-center rounded-xl px-4 text-sm font-medium text-ink hover:bg-surface-2">
            Bekor qilish
          </Link>
          <Button type="submit" size="lg" loading={pending} icon={<Icon name="plus" size={18} />}>
            Vazifa yaratish
          </Button>
        </div>
      </div>
    </form>
  );
}
