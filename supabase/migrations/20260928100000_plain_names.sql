-- SUN MEDIA — plain Uzbek names for everything people read: system roles, permissions and the system
-- folders every client gets. Keys and kinds (what the code checks) do not change.

update public.roles r
set name = v.name, description = coalesce(v.description, r.description)
from (values
  ('owner', 'Rahbar', 'Agentlik rahbari — hamma narsa'),
  ('director', 'Direktor', 'Sozlamalar va rollardan tashqari hamma narsa'),
  ('admin', 'Administrator', 'Kundalik boshqaruv: jamoa, mijozlar, davomat'),
  ('project_manager', 'Loyiha menejeri', 'Biriktirilgan mijozlar bo‘yicha ishlab chiqarish'),
  ('smm_manager', 'SMM menejer', 'Kontent kalendari, matn, post va tasdiqlash'),
  ('operator', 'Operator', 'Syomka jadvali, manzil, ssenariy va kadrlar ro‘yxati'),
  ('editor', 'Montajyor', 'Montaj, xom materiallar va tayyor videoni yuklash'),
  ('designer', 'Dizayner', 'Dizayn vazifalari'),
  ('copywriter', 'Kopirayter', 'Ssenariy va post matni'),
  ('client_owner', 'Mijoz rahbari', 'Mijoz kompaniyasi rahbari'),
  ('client_employee', 'Mijoz xodimi', 'Mijoz kompaniyasi xodimi')
) v(key, name, description)
where r.key = v.key and r.is_system;

update public.permissions p
set name = v.name
from (values
  ('dashboard.view', 'Agentlik bosh sahifasi (bugungi holat)'),
  ('approvals.manage', 'Tasdiqlash va o‘zgartirishlarni boshqarish'),
  ('content.edit_copy', 'Ssenariy, post matni va heshteglarni tahrirlash'),
  ('publications.manage', 'Postlarni joylash va rejalashtirish'),
  ('audit.read', 'Faoliyat tarixini ko‘rish'),
  ('notifications.manage', 'Bildirishnoma va muddat eslatmalari'),
  ('performance.read', 'Xodimlar samaradorligini ko‘rish'),
  ('workspace.manage', 'E’lonlar, tadbirlar va hujjatlarni boshqarish'),
  ('analytics.manage', 'Ijtimoiy tarmoq natijalarini kiritish')
) v(key, name)
where p.key = v.key;

-- System folders: rename only where nobody has renamed them already.
update public.folders f
set name = v.name
from (values
  ('raw', 'RAW', 'Xom materiallar'),
  ('edited', 'EDITED', 'Montaj versiyalari'),
  ('approved', 'APPROVED', 'Tasdiqlangan'),
  ('logos', 'LOGOS', 'Logotiplar'),
  ('brandbook', 'BRANDBOOK', 'Brendbuk'),
  ('music', 'MUSIC', 'Musiqa'),
  ('photos', 'PHOTOS', 'Rasmlar'),
  ('documents', 'DOCUMENTS', 'Hujjatlar'),
  ('contracts', 'CONTRACTS', 'Shartnomalar')
) v(kind, old_name, name)
where f.is_system and f.kind::text = v.kind and f.name = v.old_name;

create or replace function private.provision_client()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.folders (client_id, kind, name, visibility, is_system, created_by)
  values
    (new.id, 'raw', 'Xom materiallar', 'internal', true, new.created_by),
    (new.id, 'edited', 'Montaj versiyalari', 'internal', true, new.created_by),
    (new.id, 'approved', 'Tasdiqlangan', 'client', true, new.created_by),
    (new.id, 'logos', 'Logotiplar', 'client', true, new.created_by),
    (new.id, 'brandbook', 'Brendbuk', 'client', true, new.created_by),
    (new.id, 'music', 'Musiqa', 'client', true, new.created_by),
    (new.id, 'photos', 'Rasmlar', 'client', true, new.created_by),
    (new.id, 'documents', 'Hujjatlar', 'client', true, new.created_by),
    (new.id, 'contracts', 'Shartnomalar', 'client', true, new.created_by);

  insert into public.chat_rooms (kind, client_id, name, is_default, created_by)
  values ('project', new.id, new.name, true, new.created_by);
  return null;
end;
$$;
