'use client';

import { useActionState } from 'react';

import { Checkbox, SelectInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { updateStaffAccess } from '@/lib/actions/access';
import { idle, type ActionState } from '@/lib/actions/state';
import { PERMISSION_LABEL } from '@/lib/labels';

type Props = {
  userId: string;
  currentRole: string;
  roles: { key: string; name: string; disabled?: boolean }[];
  /** Permissions the admin holds (the only ones they may grant or remove). */
  delegable: string[];
  granted: string[];
  rolePermissions: Record<string, string[]>;
  canChangeRole: boolean;
};

export function AccessEditor({ userId, currentRole, roles, delegable, granted, rolePermissions, canChangeRole }: Props) {
  const [state, action] = useActionState<ActionState, FormData>(updateStaffAccess, idle);
  const fromRole = new Set(rolePermissions[currentRole] ?? []);
  const all = [...new Set([...delegable, ...granted])].sort();
  return (
    <form action={action} className="space-y-6">
      {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
      {state.status === 'success' ? <Notice tone="success" title={state.message} /> : null}
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="current_role" value={currentRole} />
      <div className="max-w-md">
        <SelectInput label="Rol" name="role_key" defaultValue={currentRole} disabled={!canChangeRole} hint={canChangeRole ? undefined : 'Rolni o‘zgartirish uchun roles.manage ruxsati kerak.'}>
          {roles.map((r) => (
            <option key={r.key} value={r.key} disabled={r.disabled}>
              {r.name}
            </option>
          ))}
        </SelectInput>
        {!canChangeRole ? <input type="hidden" name="role_key" value={currentRole} /> : null}
      </div>
      <div>
        <p className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">Qo‘shimcha ruxsatlar</p>
        <p className="mb-3 text-[13px] text-muted">Rolda allaqachon bor ruxsatlar belgilanmaydi. Faqat o‘zingizda bor ruxsatlarni bera olasiz.</p>
        <div className="grid gap-2 md:grid-cols-2">
          {all.map((p) => {
            const inRole = fromRole.has(p);
            const canTouch = delegable.includes(p);
            return (
              <Checkbox
                key={p}
                name="permissions"
                value={p}
                defaultChecked={granted.includes(p)}
                disabled={!canTouch || inRole}
                label={PERMISSION_LABEL[p] ?? p}
                description={inRole ? `${p} · rolda bor` : p}
              />
            );
          })}
        </div>
      </div>
      <div className="flex justify-end">
        <SubmitButton>Saqlash</SubmitButton>
      </div>
    </form>
  );
}
