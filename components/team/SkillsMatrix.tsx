'use client';

import { useOptimistic, useState, useTransition } from 'react';

import { Card } from '@/components/ui/Card';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { toggleEmployeeSkill } from '@/lib/actions/team';

type Person = { id: string; name: string; title: string | null; skills: string[] };
type Skill = { id: string; name: string; workflowRole: string | null };

const ROLE: Record<string, string> = { scriptwriter: 'Ssenarist maydoni', operator: 'Operator maydoni', editor: 'Montajyor maydoni' };

/**
 * "Kim nima qila oladi": every employee against every skill; one click saves (no "save" button). The task form
 * reads the same rows, so a tick here shows up there at once. Nothing is ticked for anyone by guess.
 */
export function SkillsMatrix({ people, skills }: { people: Person[]; skills: Skill[] }) {
  const [rows, setCell] = useOptimistic(people, (state, c: { user: string; skill: string; on: boolean }) =>
    state.map((p) => (p.id === c.user ? { ...p, skills: c.on ? [...p.skills, c.skill] : p.skills.filter((s) => s !== c.skill) } : p)),
  );
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const toggle = (user: string, skill: string, on: boolean) =>
    start(async () => {
      setError(null);
      setCell({ user, skill, on });
      const res = await toggleEmployeeSkill(user, skill, on);
      if (!res.ok) setError(res.message);
    });

  return (
    <Card className="overflow-x-auto p-0">
      {error ? <p className="border-b border-line px-5 py-2.5 text-[13px] text-danger">{error}</p> : null}
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-line">
            <th className="sticky left-0 z-10 bg-surface px-5 py-3 text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">Xodim</th>
            {skills.map((s) => (
              <th key={s.id} className="px-2 py-3 text-center align-bottom">
                <span className="block text-[12.5px] font-semibold">{s.name}</span>
                {s.workflowRole ? <span className="block text-[10.5px] font-normal text-accent-on-soft">{ROLE[s.workflowRole]}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-line last:border-0 hover:bg-surface-2/60">
              <td className="sticky left-0 z-10 bg-surface px-5 py-2.5">
                <span className="block font-medium">{p.name}</span>
                <span className="block text-[12px] text-muted">{p.skills.length ? `${p.skills.length} ta skill` : 'Skill biriktirilmagan'}{p.title ? ` · ${p.title}` : ''}</span>
              </td>
              {skills.map((s) => {
                const on = p.skills.includes(s.id);
                return (
                  <td key={s.id} className="px-2 py-2.5 text-center">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      aria-label={`${p.name}: ${s.name}`}
                      onClick={() => toggle(p.id, s.id, !on)}
                      className={cn(
                        'mx-auto grid size-8 place-items-center rounded-lg border transition-colors',
                        on ? 'border-accent bg-brand text-on-brand' : 'border-line text-transparent hover:border-line-strong hover:bg-surface-2',
                      )}
                    >
                      <Icon name="check" size={15} />
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
