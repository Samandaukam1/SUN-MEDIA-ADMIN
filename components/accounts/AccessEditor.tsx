'use client';

import { useActionState, useState, useTransition } from 'react';

import { Checkbox, SelectInput } from '@/components/ui/Inputs';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { createRoleAction, updateStaffAccess } from '@/lib/actions/access';
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
  /** Tizim egasi: may type a new role right here (it starts with the selected role's permissions). */
  canCreateRole?: boolean;
};

export function AccessEditor({ userId, currentRole, roles, delegable, granted, rolePermissions, canChangeRole, canCreateRole = false }: Props) {
  const [state, action] = useActionState<ActionState, FormData>(updateStaffAccess, idle);
  const [options, setOptions] = useState(roles);
  const [selected, setSelected] = useState(currentRole);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newError, setNewError] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();
  const fromRole = new Set(rolePermissions[currentRole] ?? []);
  const all = [...new Set([...delegable, ...granted])].sort();
  return (
    <form action={action} className="space-y-6">
      {state.status === 'error' ? <Notice tone="danger" title={state.message} /> : null}
      {state.status === 'success' ? <Notice tone="success" title={state.message} /> : null}
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="current_role" value={currentRole} />
      <div className="max-w-md">
        <SelectInput
          label="Rol"
          name="role_key"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={!canChangeRole}
          hint={canChangeRole ? undefined : 'Rolni o‘zgartirish uchun roles.manage ruxsati kerak.'}
        >
          {options.map((r) => (
            <option key={r.key} value={r.key} disabled={r.disabled}>
              {r.name}
            </option>
          ))}
        </SelectInput>
        {!canChangeRole ? <input type="hidden" name="role_key" value={currentRole} /> : null}
        {canCreateRole && canChangeRole ? (
          adding ? (
            <div className="mt-3 rounded-xl border border-line bg-surface-2 p-3">
              <label htmlFor="new-role-name" className="text-[13px] font-medium text-muted">
                Yangi rol nomi (ruxsatlari “{options.find((r) => r.key === selected)?.name}” rolidan olinadi)
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="new-role-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={80}
                  placeholder="Masalan: Targetolog"
                  className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-[15px] outline-none focus:border-accent"
                />
                <button
                  type="button"
                  disabled={creating || !newName.trim() || selected === 'system_owner'}
                  onClick={() =>
                    startCreate(async () => {
                      const res = await createRoleAction(newName, selected);
                      if (res.status === 'error') return setNewError(res.message);
                      setOptions([...options, { key: res.key, name: res.name }]);
                      setSelected(res.key);
                      setNewName('');
                      setNewError(null);
                      setAdding(false);
                    })
                  }
                  className="h-10 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50"
                >
                  {creating ? 'Yaratilmoqda…' : 'Yaratish'}
                </button>
              </div>
              {newError ? <p className="mt-2 text-[13px] text-danger">{newError}</p> : null}
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="mt-2 text-[13px] font-medium text-accent hover:underline">
              + Yangi rol (nomini o‘zingiz yozasiz)
            </button>
          )
        ) : null}
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
