'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { Card } from '@/components/ui/Card';
import { Checkbox, SelectInput, TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { saveTaskAction } from '@/lib/actions/work';
import { idle } from '@/lib/actions/state';
import type { ClientOption, StaffOption } from '@/lib/directory';
import { PRIORITY, TASK_TYPE } from '@/lib/labels';

/** A task: what, who, until when. Everything else is optional. */
export function TaskForm({ clients, staff, defaultDue }: { clients: ClientOption[]; staff: StaffOption[]; defaultDue: string }) {
  const [state, action] = useActionState(saveTaskAction, idle);
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={action} className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
      <div className="space-y-6">
        {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
        <Card className="space-y-4">
          <TextInput label="Vazifa" name="title" required placeholder="Masalan: SAFI reels montaji" error={errors.title} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectInput label="Turi" name="task_type" defaultValue="editing">
              {Object.entries(TASK_TYPE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </SelectInput>
            <SelectInput label="Mijoz (ixtiyoriy)" name="client_id" defaultValue="">
              <option value="">Mijozsiz (ichki ish)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectInput>
            <TextInput label="Muddat" name="due_at" type="datetime-local" defaultValue={defaultDue} />
            <SelectInput label="Muhimlik" name="priority" defaultValue="normal">
              {Object.entries(PRIORITY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </SelectInput>
          </div>
          <TextArea label="Izoh" name="description" maxLength={4000} placeholder="Nima qilish kerak, qayerda fayllar…" />
        </Card>
      </div>
      <div className="space-y-6">
        <Card className="space-y-3">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">Kim bajaradi</p>
          {errors.assignees ? <p className="text-[13px] text-danger">{errors.assignees}</p> : null}
          <div className="grid max-h-96 gap-2 overflow-y-auto">
            {staff.map((s) => (
              <Checkbox key={s.id} name="assignees" value={s.id} label={s.name} description={s.jobTitle ?? undefined} />
            ))}
          </div>
        </Card>
        <div className="flex justify-end gap-3">
          <Link href="/work/tasks" className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-ink hover:bg-surface-2">
            Bekor qilish
          </Link>
          <SubmitButton>Vazifani berish</SubmitButton>
        </div>
      </div>
    </form>
  );
}
