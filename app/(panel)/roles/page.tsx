import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/panel/PageHeader';
import { RoleMatrix } from '@/components/roles/RoleMatrix';
import { SectionTitle } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { can, requireStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Rollar va ruxsatlar' };

export default async function RolesPage() {
  const context = await requireStaff();
  if (!can(context, 'roles.manage') && !can(context, 'employees.manage')) redirect('/no-access?reason=permission');
  const supabase = await createClient();
  const [rolesRes, permsRes, grantsRes] = await Promise.all([
    supabase.from('roles').select('id, key, name, scope, rank, is_system').order('rank'),
    supabase.from('permissions').select('key, module, name, scope').order('module').order('key'),
    supabase.from('role_permissions').select('role_id, permission_key'),
  ]);
  if (rolesRes.error) throw rolesRes.error;
  if (permsRes.error) throw permsRes.error;
  if (grantsRes.error) throw grantsRes.error;

  const editable = can(context, 'roles.manage');
  const grants = grantsRes.data.map((g) => `${g.role_id}:${g.permission_key}`);
  const staffRoles = rolesRes.data.filter((r) => r.scope === 'staff').map((r) => ({ id: r.id, key: r.key, name: r.name, locked: r.key === 'owner' }));
  const clientRoles = rolesRes.data.filter((r) => r.scope === 'client').map((r) => ({ id: r.id, key: r.key, name: r.name, locked: false }));

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Tizim"
        title="Rollar va ruxsatlar"
        description="Har bir rol nimani ko‘ra va qila olishi. Ruxsatlar bazada (RLS) majburiy — interfeysni yashirish emas."
      />
      {!editable ? <Notice tone="info" title="Faqat ko‘rish rejimi">Rollarni o‘zgartirish uchun “Rollarni boshqarish” ruxsati kerak.</Notice> : null}
      <section>
        <SectionTitle>SUN MEDIA xodimlari</SectionTitle>
        <p className="mb-4 text-sm text-muted">Owner barcha ruxsatlarga ega va o‘zgartirilmaydi.</p>
        <RoleMatrix roles={staffRoles} permissions={permsRes.data.filter((p) => p.scope === 'staff')} grants={grants} editable={editable} />
      </section>
      <section>
        <SectionTitle>Mijoz foydalanuvchilari</SectionTitle>
        <p className="mb-4 text-sm text-muted">Mijoz xodimiga tasdiqlash huquqini alohida berish — Mijozlar → Loginlar bo‘limida.</p>
        <RoleMatrix roles={clientRoles} permissions={permsRes.data.filter((p) => p.scope === 'client')} grants={grants} editable={editable} />
      </section>
    </div>
  );
}
