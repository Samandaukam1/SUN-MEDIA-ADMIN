'use client';

import { useOptimistic, useState, useTransition } from 'react';

import { Notice } from '@/components/ui/Notice';
import { toggleRolePermission } from '@/lib/actions/access';
import { PERMISSION_LABEL, PERMISSION_MODULE_LABEL } from '@/lib/labels';

type Role = { id: string; key: string; name: string; locked: boolean };
type Permission = { key: string; module: string; name: string };

/** Role × permission grid. Owner is implicit (all permissions); changes apply immediately. */
export function RoleMatrix({ roles, permissions, grants, editable }: { roles: Role[]; permissions: Permission[]; grants: string[]; editable: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const [state, apply] = useOptimistic(new Set(grants), (current: Set<string>, change: { id: string; on: boolean }) => {
    const next = new Set(current);
    if (change.on) next.add(change.id);
    else next.delete(change.id);
    return next;
  });
  const modules = [...new Set(permissions.map((p) => p.module))];

  return (
    <div className="space-y-4">
      {error ? <Notice tone="danger" title={error} /> : null}
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="sticky left-0 z-10 bg-surface px-4 py-3 text-left text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">Ruxsat</th>
              {roles.map((r) => (
                <th key={r.id} className="px-2 py-3 text-center text-xs font-semibold whitespace-nowrap">
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((module) => (
              <ModuleRows
                key={module}
                module={module}
                permissions={permissions.filter((p) => p.module === module)}
                roles={roles}
                granted={state}
                editable={editable}
                onToggle={(role, permission, on) =>
                  start(async () => {
                    setError(null);
                    apply({ id: `${role.id}:${permission}`, on });
                    const result = await toggleRolePermission(role.id, permission, on);
                    if (result.status === 'error') setError(result.message);
                  })
                }
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModuleRows({ module, permissions, roles, granted, editable, onToggle }: {
  module: string;
  permissions: Permission[];
  roles: Role[];
  granted: Set<string>;
  editable: boolean;
  onToggle: (role: Role, permission: string, on: boolean) => void;
}) {
  return (
    <>
      <tr className="bg-surface-2">
        <td colSpan={roles.length + 1} className="sticky left-0 px-4 py-2 text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">
          {PERMISSION_MODULE_LABEL[module] ?? module}
        </td>
      </tr>
      {permissions.map((p) => (
        <tr key={p.key} className="border-b border-line last:border-0">
          <td className="sticky left-0 z-10 bg-surface px-4 py-2.5">
            <span className="block font-medium">{PERMISSION_LABEL[p.key] ?? p.name}</span>
            <span className="block font-mono text-[11px] text-subtle">{p.key}</span>
          </td>
          {roles.map((r) => {
            const on = r.key === 'owner' || granted.has(`${r.id}:${p.key}`);
            return (
              <td key={r.id} className="px-2 py-2.5 text-center">
                <input
                  type="checkbox"
                  aria-label={`${r.name}: ${PERMISSION_LABEL[p.key] ?? p.key}`}
                  className="size-4 accent-[var(--accent)] disabled:opacity-40"
                  checked={on}
                  disabled={!editable || r.locked}
                  onChange={(e) => onToggle(r, p.key, e.target.checked)}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
