'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { SelectInput, TextInput } from '@/components/ui/Inputs';
import { createRoleAction, deleteRoleAction, renameRoleAction } from '@/lib/actions/access';

type Role = { id: string; key: string; name: string; isSystem: boolean; holders: number };

function RoleRow({ role }: { role: Role }) {
  const router = useRouter();
  const [name, setName] = useState(role.name);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, start] = useTransition();
  const changed = name.trim() !== role.name;
  return (
    <li className="flex flex-wrap items-center gap-2 py-2.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        aria-label={`${role.name} — nomi`}
        className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-[15px] outline-none focus:border-accent sm:max-w-sm"
      />
      <span className="text-[12px] text-subtle">{role.isSystem ? 'asosiy rol' : 'yangi rol'} · {role.holders} kishi</span>
      <div className="ml-auto flex gap-2">
        {changed ? (
          <Button
            type="button"
            loading={pending}
            onClick={() =>
              start(async () => {
                const res = await renameRoleAction(role.id, name);
                setMessage(res.status === 'error' ? { text: res.message, error: true } : { text: 'Saqlandi', error: false });
                if (res.status === 'success') router.refresh();
              })
            }
          >
            Saqlash
          </Button>
        ) : null}
        {!role.isSystem ? (
          <Button
            type="button"
            variant="ghost"
            className="text-danger"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`“${role.name}” rolini o‘chirasizmi?`)) return;
              start(async () => {
                const res = await deleteRoleAction(role.id);
                setMessage(res.status === 'error' ? { text: res.message, error: true } : null);
                if (res.status === 'success') router.refresh();
              });
            }}
          >
            O‘chirish
          </Button>
        ) : null}
      </div>
      {message ? <p className={`w-full text-[13px] ${message.error ? 'text-danger' : 'text-success'}`}>{message.text}</p> : null}
    </li>
  );
}

/** Tizim egasi: role names in their own words, and new roles built on an existing one. */
export function RoleNames({ staff, client }: { staff: Role[]; client: Role[] }) {
  const router = useRouter();
  const bases = staff.filter((r) => r.key !== 'system_owner');
  const [name, setName] = useState('');
  const [base, setBase] = useState(bases.find((r) => r.key === 'editor')?.key ?? bases[0]?.key ?? '');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="font-semibold">Yangi rol</p>
        <p className="mt-1 text-[13px] text-muted">Nomini o‘zingiz yozasiz; ruxsatlari tanlangan roldan olinadi va keyin pastdagi jadvalda o‘zgartiriladi.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
          <TextInput label="Rol nomi" name="new_role" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Masalan: Targetolog" />
          <SelectInput label="Asos qilib olinadigan rol" name="base_role" value={base} onChange={(e) => setBase(e.target.value)}>
            {bases.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </SelectInput>
          <Button
            type="button"
            loading={pending}
            disabled={!name.trim()}
            onClick={() =>
              start(async () => {
                const res = await createRoleAction(name, base);
                if (res.status === 'error') setMessage({ text: res.message, error: true });
                else {
                  setMessage({ text: `“${res.name}” roli yaratildi. Endi uni xodimga berishingiz mumkin.`, error: false });
                  setName('');
                  router.refresh();
                }
              })
            }
          >
            Yaratish
          </Button>
        </div>
        {message ? <p className={`mt-3 text-[13px] ${message.error ? 'text-danger' : 'text-success'}`}>{message.text}</p> : null}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">SUN MEDIA rollari — nomlari</p>
          <ul className="divide-y divide-line">
            {staff.map((r) => (
              <RoleRow key={r.id} role={r} />
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">Mijoz rollari — nomlari</p>
          <ul className="divide-y divide-line">
            {client.map((r) => (
              <RoleRow key={r.id} role={r} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
