'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import { Card } from '@/components/ui/Card';
import { Checkbox, SelectInput, TextArea, TextInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idle, type ActionState } from '@/lib/actions/state';
import { CONTENT_TEAM_ROLES } from '@/lib/content';
import type { ClientOption, StaffOption } from '@/lib/directory';
import { CONTENT_TYPE, PLATFORM_LABEL, PRIORITY, TEAM_ROLE_LABEL } from '@/lib/labels';

export type ContentDefaults = {
  clientId?: string;
  projectId?: string | null;
  title?: string;
  contentType?: string;
  priority?: string;
  platforms?: string[];
  dueAt?: string;
  approvalDueAt?: string;
  publishAt?: string;
  description?: string | null;
  script?: string | null;
  caption?: string | null;
  isClientVisible?: boolean;
  team?: Record<string, string | undefined>;
};

type Props = {
  action: (state: ActionState, data: FormData) => Promise<ActionState>;
  clients: ClientOption[];
  staff: StaffOption[];
  defaults?: ContentDefaults;
  editing?: boolean;
  cancelHref: string;
};

// Suggest people whose role fits the slot first; everyone stays selectable.
const ROLE_FOR: Record<string, string[]> = { operator: ['operator'], editor: ['editor'], designer: ['designer'], smm_manager: ['smm_manager'], copywriter: ['copywriter'] };

/** New or existing content: the essentials first, the script and team below. */
export function ContentForm({ action, clients, staff, defaults = {}, editing = false, cancelHref }: Props) {
  const [state, formAction] = useActionState(action, idle);
  const [clientId, setClientId] = useState(defaults.clientId ?? '');
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  const projects = clients.find((c) => c.id === clientId)?.projects ?? [];

  return (
    <form action={formAction} className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
      <div className="space-y-6">
        {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
        <Card className="space-y-4">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">Asosiy</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectInput label="Mijoz" name="client_id" required={!editing} disabled={editing} value={clientId} onChange={(e) => setClientId(e.target.value)} error={errors.client_id}>
              <option value="">Mijozni tanlang</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectInput>
            <SelectInput label="Loyiha (ixtiyoriy)" name="project_id" defaultValue={defaults.projectId ?? ''} disabled={!projects.length}>
              <option value="">{projects.length ? 'Loyihasiz' : 'Loyiha yo‘q'}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SelectInput>
          </div>
          <TextInput label="Nomi" name="title" required defaultValue={defaults.title} placeholder="Masalan: Oshxona sahna ortida" error={errors.title} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectInput label="Turi" name="content_type" defaultValue={defaults.contentType ?? 'reel'}>
              {Object.entries(CONTENT_TYPE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </SelectInput>
            <SelectInput label="Muhimlik" name="priority" defaultValue={defaults.priority ?? 'normal'}>
              {Object.entries(PRIORITY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </SelectInput>
          </div>
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium text-muted">Qayerga chiqadi</legend>
            <div className="flex flex-wrap gap-2">
              {(['instagram', 'tiktok', 'youtube', 'telegram', 'facebook'] as const).map((p) => (
                <Checkbox key={p} name="platforms" value={p} label={PLATFORM_LABEL[p]} defaultChecked={defaults.platforms?.includes(p) ?? p === 'instagram'} className="py-2" />
              ))}
            </div>
          </fieldset>
        </Card>

        <Card className="space-y-4">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">Ssenariy va matn</p>
          <TextArea label="Qisqa tavsif" name="description" defaultValue={defaults.description ?? ''} maxLength={4000} placeholder="Maqsad, g‘oya, muhim eslatmalar" />
          <TextArea label="Ssenariy" name="script" defaultValue={defaults.script ?? ''} maxLength={20000} className="min-h-40" placeholder="Kadrlar, matn, ovoz…" />
          <TextArea label="Post matni" name="caption" defaultValue={defaults.caption ?? ''} maxLength={4000} />
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="space-y-4">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">Muddatlar</p>
          <TextInput label="Montaj muddati" name="due_at" type="datetime-local" defaultValue={defaults.dueAt} error={errors.due_at} />
          <TextInput label="Mijoz javob berish muddati" name="client_approval_due_at" type="datetime-local" defaultValue={defaults.approvalDueAt} />
          <TextInput label="Post vaqti" name="publish_at" type="datetime-local" defaultValue={defaults.publishAt} hint="Belgilansa, kalendarda ko‘rinadi." />
        </Card>

        <Card className="space-y-4">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">Jamoa</p>
          {CONTENT_TEAM_ROLES.map((role) => {
            const fits = staff.filter((s) => s.roles.some((r) => ROLE_FOR[role]?.includes(r)));
            const others = staff.filter((s) => !fits.includes(s));
            return (
              <SelectInput key={role} label={TEAM_ROLE_LABEL[role]} name={`team_${role}`} defaultValue={defaults.team?.[role] ?? ''}>
                <option value="">Biriktirilmagan</option>
                {fits.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                {others.length ? (
                  <optgroup label="Boshqa xodimlar">
                    {others.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </SelectInput>
            );
          })}
          <Checkbox name="is_client_visible" label="Mijoz ko‘ra oladi" description="O‘chirilsa, kontent faqat jamoa uchun bo‘ladi." defaultChecked={defaults.isClientVisible ?? true} />
        </Card>

        <div className="flex justify-end gap-3">
          <Link href={cancelHref} className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-ink hover:bg-surface-2">
            Bekor qilish
          </Link>
          <SubmitButton>{editing ? 'Saqlash' : 'Kontentni yaratish'}</SubmitButton>
        </div>
      </div>
    </form>
  );
}
