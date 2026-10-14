'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { deleteSkill, saveSkill } from '@/lib/actions/team';

type Skill = { id: string; name: string; workflowRole: string | null; people: number };
const ROLES = [
  { value: '', label: 'Oddiy skill' },
  { value: 'scriptwriter', label: 'Vazifada: Ssenarist' },
  { value: 'operator', label: 'Vazifada: Operator' },
  { value: 'editor', label: 'Vazifada: Montajyor' },
];
const field = 'h-10 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-accent';

function Row({ skill }: { skill: Skill | null }) {
  const router = useRouter();
  const [name, setName] = useState(skill?.name ?? '');
  const [role, setRole] = useState(skill?.workflowRole ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = !skill || name !== skill.name || role !== (skill.workflowRole ?? '');
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) return setError(res.message ?? 'Xatolik.');
      after?.();
      router.refresh();
    });
  return (
    <li className="grid gap-2 px-5 py-3 sm:grid-cols-[1fr_210px_auto] sm:items-center">
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Yangi skill nomi" aria-label="Skill nomi" className={field} />
      <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} aria-label="Vazifadagi o‘rni" className={field}>
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <Button
          disabled={!dirty || !name.trim()}
          loading={pending}
          onClick={() => run(() => saveSkill(skill?.id ?? null, { name, workflow_role: role as '' }), () => (skill ? undefined : (setName(''), setRole(''))))}
        >
          {skill ? 'Saqlash' : 'Qo‘shish'}
        </Button>
        {skill ? (
          <Button
            variant="ghost"
            aria-label={`${skill.name} — o‘chirish`}
            onClick={() => {
              if (confirm(`“${skill.name}” skilli o‘chirilsinmi? ${skill.people ? `${skill.people} xodimdan ham olib tashlanadi.` : ''}`)) run(() => deleteSkill(skill.id));
            }}
            icon={<Icon name="x" size={16} />}
          />
        ) : null}
        {skill ? <span className="text-[12px] whitespace-nowrap text-muted">{skill.people} xodim</span> : null}
      </div>
      {error ? <p className="text-[13px] text-danger sm:col-span-3">{error}</p> : null}
    </li>
  );
}

/** Tizim egasi: the skills list. Tagged skills fill the Ssenarist / Operator / Montajyor fields of a task. */
export function SkillsCatalog({ skills }: { skills: Skill[] }) {
  return (
    <Card className="max-w-4xl p-0">
      <ul className="divide-y divide-line">
        {skills.map((s) => (
          <Row key={s.id} skill={s} />
        ))}
        <Row key={`new-${skills.length}`} skill={null} />
      </ul>
    </Card>
  );
}
