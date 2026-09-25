'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { Checkbox, SelectInput, TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idle, type ActionState } from '@/lib/actions/state';
import { archiveWorkspaceItem, createAnnouncement, createCompanyEvent, createSharedDocument } from '@/lib/actions/workspace';

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

function FormDialog({ label, title, action, children }: { label: string; title: string; action: Action; children: (errors: Record<string, string>) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(action, idle);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state]);
  const errors = state.status === 'error' ? state.fieldErrors ?? {} : {};
  return (
    <>
      <Button size="md" icon={<Icon name="plus" size={16} />} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} size="lg">
        <form ref={formRef} action={formAction} className="space-y-5">
          {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
          {children(errors)}
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

const ROLE_OPTIONS = [
  ['director', 'Direktor'],
  ['admin', 'Administrator'],
  ['project_manager', 'Project manager'],
  ['smm_manager', 'SMM manager'],
  ['operator', 'Operator'],
  ['editor', 'Montajyor'],
  ['designer', 'Dizayner'],
  ['copywriter', 'Kopirayter'],
] as const;

export function NewAnnouncement() {
  return (
    <FormDialog label="E’lon" title="Yangi e’lon" action={createAnnouncement}>
      {(errors) => (
        <>
          <TextInput label="Sarlavha" name="title" required maxLength={160} error={errors.title} />
          <TextArea label="Matn" name="body" required maxLength={4000} rows={6} error={errors.body} />
          <div>
            <p className="mb-2 text-[13px] font-medium text-muted">Kimlar uchun (belgilanmasa — barcha xodimlar)</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {ROLE_OPTIONS.map(([key, name]) => (
                <Checkbox key={key} name="audience_roles" value={key} label={name} />
              ))}
            </div>
          </div>
          <Checkbox name="is_pinned" label="Tepaga mahkamlash" description="Muhim e’lon sifatida yuboriladi." />
        </>
      )}
    </FormDialog>
  );
}

export function NewCompanyEvent() {
  return (
    <FormDialog label="Tadbir" title="Kompaniya tadbiri" action={createCompanyEvent}>
      {(errors) => (
        <>
          <TextInput label="Nomi" name="title" required maxLength={160} error={errors.title} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectInput label="Turi" name="kind" defaultValue="meeting">
              <option value="meeting">Umumiy yig‘ilish</option>
              <option value="holiday">Bayram</option>
              <option value="day_off">Dam olish kuni</option>
              <option value="company_event">Kompaniya tadbiri</option>
              <option value="training">Trening</option>
              <option value="birthday">Tug‘ilgan kun</option>
            </SelectInput>
            <TextInput label="Sana" name="date" type="date" required error={errors.date} />
            <TextInput label="Boshlanishi" name="start" type="time" defaultValue="10:00" />
            <TextInput label="Tugashi" name="end" type="time" defaultValue="11:00" error={errors.end} />
          </div>
          <Checkbox name="all_day" label="Butun kun" description="Bayram yoki dam olish kuni uchun." />
          <TextInput label="Joy" name="location" maxLength={200} />
          <TextArea label="Izoh" name="description" maxLength={2000} rows={3} />
        </>
      )}
    </FormDialog>
  );
}

export function NewSharedDocument() {
  return (
    <FormDialog label="Hujjat" title="Umumiy hujjat" action={createSharedDocument}>
      {(errors) => (
        <>
          <TextInput label="Nomi" name="title" required maxLength={160} error={errors.title} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectInput label="Toifa" name="category" defaultValue="sop">
              <option value="sop">SOP</option>
              <option value="guide">Qo‘llanma</option>
              <option value="brand">Brend aktivlari</option>
              <option value="policy">Qoidalar</option>
              <option value="template">Shablonlar</option>
              <option value="other">Boshqa</option>
            </SelectInput>
            <TextInput label="Havola" name="url" type="url" required placeholder="https://" error={errors.url} />
          </div>
          <TextArea label="Qisqacha" name="description" maxLength={1000} rows={3} />
          <Checkbox name="is_pinned" label="Muhim (tepada)" />
        </>
      )}
    </FormDialog>
  );
}

export function ArchiveButton({ table, id, label }: { table: 'announcements' | 'company_events' | 'shared_documents'; id: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={label}
      title={label}
      onClick={() => {
        if (window.confirm(`${label}?`)) start(async () => void (await archiveWorkspaceItem(table, id)));
      }}
      className="rounded-lg p-2 text-subtle hover:bg-danger-soft hover:text-danger disabled:opacity-50"
    >
      <Icon name="x" size={16} />
    </button>
  );
}
