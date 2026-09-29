import { RoleMatrix } from '@/components/roles/RoleMatrix';
import { SectionTitle } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { createClient } from '@/lib/supabase/server';

/**
 * Who may do what, per role. Only the Tizim egasi edits it (Tizim boshqaruvi → Global ruxsatlar);
 * admins see the same matrix read-only and give individual extras on an employee's page.
 */
export async function RolesView({ editable }: { editable: boolean }) {
  const supabase = await createClient();
  const [rolesRes, permsRes, grantsRes] = await Promise.all([
    supabase.from('roles').select('id, key, name, scope, rank, is_system').order('rank'),
    supabase.from('permissions').select('key, module, name, scope').order('module').order('key'),
    supabase.from('role_permissions').select('role_id, permission_key'),
  ]);
  if (rolesRes.error) throw rolesRes.error;
  if (permsRes.error) throw permsRes.error;
  if (grantsRes.error) throw grantsRes.error;

  const grants = grantsRes.data.map((g) => `${g.role_id}:${g.permission_key}`);
  const staffRoles = rolesRes.data.filter((r) => r.scope === 'staff').map((r) => ({ id: r.id, key: r.key, name: r.name, locked: r.key === 'system_owner' }));
  const clientRoles = rolesRes.data.filter((r) => r.scope === 'client').map((r) => ({ id: r.id, key: r.key, name: r.name, locked: false }));

  return (
    <div className="space-y-10">
      {!editable ? (
        <Notice tone="info" title="Faqat ko‘rish">
          Rollarning umumiy ruxsatlarini Tizim egasi o‘zgartiradi. Bitta xodimga qo‘shimcha ruxsat berish — xodim sahifasidagi “Rol va ruxsatlar” bo‘limida.
        </Notice>
      ) : null}
      <section>
        <SectionTitle>SUN MEDIA xodimlari</SectionTitle>
        <p className="mb-4 text-sm text-muted">Tizim egasi barcha ruxsatlarga ega va uni o‘zgartirib bo‘lmaydi.</p>
        <RoleMatrix roles={staffRoles} permissions={permsRes.data.filter((p) => p.scope === 'staff')} grants={grants} editable={editable} />
      </section>
      <section>
        <SectionTitle>Mijozlar</SectionTitle>
        <p className="mb-4 text-sm text-muted">Mijozlar faqat kuzatadi: kontent, kalendar, tarif va hisobotni ko‘radi, SUN MEDIA bilan yozishadi.</p>
        <RoleMatrix roles={clientRoles} permissions={permsRes.data.filter((p) => p.scope === 'client' && p.key !== 'client.approve')} grants={grants} editable={editable} />
      </section>
    </div>
  );
}
