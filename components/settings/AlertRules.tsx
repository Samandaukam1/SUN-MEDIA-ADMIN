'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { Checkbox, SelectInput, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { saveAlertRule, toggleAlertRule } from '@/lib/actions/access';
import { idle, type ActionState } from '@/lib/actions/state';

export type AlertRule = { id: string; name: string; target: string; offset_minutes: number; recipients: string[]; task_types: string[] | null; is_active: boolean };

const RECIPIENT_LABEL: Record<string, string> = {
  assignees: 'Mas’ul xodimlar',
  managers: 'Mijoz menejerlari',
  admins: 'Adminlar',
  owners: 'Owner va direktor',
  client_approvers: 'Tasdiqlovchi mijoz',
};

function describeOffset(minutes: number): string {
  if (minutes === 0) return 'Muddat o‘tganda';
  const abs = Math.abs(minutes);
  const text = abs >= 60 ? `${Math.floor(abs / 60)} soat${abs % 60 ? ` ${abs % 60} daq` : ''}` : `${abs} daq`;
  return minutes < 0 ? `${text} oldin` : `${text} keyin`;
}

/** Smart deadline alerts: when and to whom reminders go (processed every minute by pg_cron). */
export function AlertRules({ rules, editable }: { rules: AlertRule[]; editable: boolean }) {
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">
              <th className="px-4 py-2.5">Qoida</th>
              <th className="px-4 py-2.5">Qachon</th>
              <th className="px-4 py-2.5">Kimga</th>
              <th className="px-4 py-2.5">Holat</th>
              {editable ? <th className="w-16 px-4 py-2.5" /> : null}
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-[12px] text-muted">{r.target === 'task' ? 'Vazifa muddati' : 'Mijoz tasdig‘i muddati'}</p>
                </td>
                <td className="tabular px-4 py-3">{describeOffset(r.offset_minutes)}</td>
                <td className="px-4 py-3 text-muted">{r.recipients.map((x) => RECIPIENT_LABEL[x] ?? x).join(', ')}</td>
                <td className="px-4 py-3">{editable ? <ActiveToggle rule={r} /> : <Badge tone={r.is_active ? 'success' : 'neutral'}>{r.is_active ? 'Yoqilgan' : 'O‘chirilgan'}</Badge>}</td>
                {editable ? (
                  <td className="px-4 py-3">
                    <RuleDialog rule={r} />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable ? <RuleDialog /> : null}
    </div>
  );
}

function ActiveToggle({ rule }: { rule: AlertRule }) {
  const [on, setOn] = useState(rule.is_active);
  const [pending, start] = useTransition();
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        className="size-4 accent-[var(--accent)]"
        checked={on}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          start(async () => {
            const res = await toggleAlertRule(rule.id, next);
            if (res.status === 'error') setOn(!next);
          });
        }}
      />
      {on ? 'Yoqilgan' : 'O‘chirilgan'}
    </label>
  );
}

function RuleDialog({ rule }: { rule?: AlertRule }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(saveAlertRule, idle);
  const formRef = useRef<HTMLFormElement>(null);
  const offset = rule?.offset_minutes ?? -60;
  const [when, setWhen] = useState(offset < 0 ? 'before' : offset > 0 ? 'after' : 'at');
  useEffect(() => {
    if (state.status === 'success') setOpen(false);
  }, [state]);
  return (
    <>
      {rule ? (
        <button type="button" onClick={() => setOpen(true)} aria-label="Tahrirlash" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink">
          <Icon name="edit" size={16} />
        </button>
      ) : (
        <Button variant="secondary" size="md" icon={<Icon name="plus" size={16} />} onClick={() => setOpen(true)}>
          Eslatma qoidasi qo‘shish
        </Button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={rule ? 'Eslatma qoidasi' : 'Yangi eslatma qoidasi'}>
        <form ref={formRef} action={action} className="space-y-5">
          {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
          {rule ? <input type="hidden" name="id" value={rule.id} /> : null}
          <TextInput label="Nomi" name="name" required defaultValue={rule?.name} placeholder="Masalan: Montaj: 1 soat qoldi" />
          <SelectInput label="Nimaning muddati" name="target" defaultValue={rule?.target ?? 'task'}>
            <option value="task">Vazifa muddati</option>
            <option value="content_approval">Mijoz tasdig‘i muddati</option>
          </SelectInput>
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectInput label="Qachon" name="when" value={when} onChange={(e) => setWhen(e.target.value)}>
              <option value="before">Muddatdan oldin</option>
              <option value="at">Muddat o‘tganda</option>
              <option value="after">Muddatdan keyin</option>
            </SelectInput>
            {when !== 'at' ? (
              <>
                <TextInput label="Soat" name="hours" type="number" min={0} max={168} defaultValue={Math.floor(Math.abs(offset) / 60)} />
                <TextInput label="Daqiqa" name="minutes" type="number" min={0} max={59} defaultValue={Math.abs(offset) % 60} />
              </>
            ) : null}
          </div>
          <div>
            <p className="mb-2 text-[13px] font-medium text-muted">Kimga yuboriladi</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(RECIPIENT_LABEL).map(([key, label]) => (
                <Checkbox key={key} name="recipients" value={key} label={label} defaultChecked={rule?.recipients.includes(key) ?? key === 'assignees'} />
              ))}
            </div>
          </div>
          <Checkbox name="is_active" label="Yoqilgan" defaultChecked={rule?.is_active ?? true} />
          <div className="flex justify-end gap-3 border-t border-line pt-5">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Bekor qilish
            </Button>
            <SubmitButton>Saqlash</SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
