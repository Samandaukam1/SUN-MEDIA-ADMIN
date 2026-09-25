-- SUN MEDIA — system roles, permission catalogue and default role → permission mapping.
-- This is configuration (not demo data) and is required in every environment.

insert into public.permissions (key, module, name, scope) values
  -- Management
  ('dashboard.view', 'dashboard', 'Daily Command Center', 'staff'),
  ('clients.read_all', 'clients', 'Barcha mijozlarni ko''rish', 'staff'),
  ('clients.manage', 'clients', 'Mijozlarni yaratish va tahrirlash', 'staff'),
  ('employees.read', 'team', 'Xodimlar ro''yxati', 'staff'),
  ('employees.manage', 'team', 'Xodimlarni boshqarish', 'staff'),
  ('roles.manage', 'team', 'Rollar va ruxsatlarni boshqarish', 'staff'),
  ('attendance.read', 'team', 'Davomatni ko''rish', 'staff'),
  ('attendance.manage', 'team', 'Davomatni belgilash', 'staff'),
  ('performance.read', 'team', 'Xodimlar KPI', 'staff'),
  -- Production
  ('projects.manage', 'production', 'Loyihalarni boshqarish', 'staff'),
  ('content.manage', 'production', 'Kontentni yaratish va tahrirlash', 'staff'),
  ('content.edit_copy', 'production', 'Ssenariy, caption va hashtag tahrirlash', 'staff'),
  ('publications.manage', 'production', 'Nashrlarni boshqarish', 'staff'),
  ('shootings.manage', 'production', 'Syomkalarni boshqarish', 'staff'),
  ('tasks.read_all', 'production', 'Barcha vazifalarni ko''rish', 'staff'),
  ('tasks.manage', 'production', 'Vazifalarni yaratish va biriktirish', 'staff'),
  ('approvals.manage', 'production', 'Tasdiqlash va revisionlarni boshqarish', 'staff'),
  ('files.upload', 'files', 'Fayl yuklash', 'staff'),
  ('files.manage', 'files', 'Fayllarni boshqarish', 'staff'),
  -- Commercial
  ('plans.manage', 'commercial', 'Tariflarni boshqarish', 'staff'),
  ('subscriptions.read', 'commercial', 'Mijoz tarifi va limitlarini ko''rish', 'staff'),
  ('subscriptions.manage', 'commercial', 'Tarif biriktirish va limitlarni boshqarish', 'staff'),
  ('contracts.manage', 'commercial', 'Shartnomalarni boshqarish', 'staff'),
  ('finance.read', 'commercial', 'Moliyaviy va resurs ko''rinishi', 'staff'),
  -- Reporting
  ('analytics.manage', 'reporting', 'Ijtimoiy tarmoq statistikasini kiritish', 'staff'),
  ('reports.read', 'reporting', 'Oylik hisobotlarni ko''rish', 'staff'),
  ('reports.manage', 'reporting', 'Oylik hisobot yaratish va nashr qilish', 'staff'),
  -- System
  ('notifications.manage', 'system', 'Bildirishnoma va deadline qoidalari', 'staff'),
  ('chat.manage', 'system', 'Chatlarni moderatsiya qilish', 'staff'),
  ('audit.read', 'system', 'Audit logni ko''rish', 'staff'),
  ('settings.manage', 'system', 'Tizim sozlamalari', 'staff'),
  -- Client portal
  ('client.content.view', 'client', 'Kontent reja va kalendarni ko''rish', 'client'),
  ('client.approve', 'client', 'Kontentni tasdiqlash / o''zgartirish so''rash', 'client'),
  ('client.plan.view', 'client', 'Tarif va foydalanishni ko''rish', 'client'),
  ('client.plan.request_upgrade', 'client', 'Tarifni oshirish so''rovi', 'client'),
  ('client.contracts.view', 'client', 'Shartnomalarni ko''rish', 'client'),
  ('client.reports.view', 'client', 'Oylik hisobotlarni ko''rish', 'client'),
  ('client.files.upload', 'client', 'Brend fayllarini yuklash', 'client');

insert into public.roles (key, name, description, scope, rank, is_system) values
  ('owner', 'Owner', 'Agentlik egasi — hamma narsa', 'staff', 0, true),
  ('director', 'Director', 'Direktor — sozlamalar va rollardan tashqari hamma narsa', 'staff', 10, true),
  ('admin', 'Admin', 'Operatsion boshqaruv', 'staff', 20, true),
  ('project_manager', 'Project Manager', 'Biriktirilgan mijozlar bo''yicha ishlab chiqarish', 'staff', 40, true),
  ('smm_manager', 'SMM Manager', 'Kontent kalendar, caption, nashr va tasdiqlash', 'staff', 50, true),
  ('operator', 'Operator', 'Syomka jadvali, lokatsiya, ssenariy va shot list', 'staff', 60, true),
  ('editor', 'Editor / Montajyor', 'Montaj vazifalari, raw fayllar, final video yuklash', 'staff', 60, true),
  ('designer', 'Designer', 'Dizayn vazifalari', 'staff', 60, true),
  ('copywriter', 'Copywriter', 'Ssenariy va caption', 'staff', 60, true),
  ('client_owner', 'Client Owner', 'Mijoz kompaniyasi rahbari', 'client', 100, true),
  ('client_employee', 'Client Employee', 'Mijoz kompaniyasi xodimi', 'client', 110, true);

-- Owner implicitly holds every permission (see private.has_permission); no rows needed.
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on p.scope = 'staff'
where r.key = 'director' and p.key not in ('roles.manage', 'settings.manage');

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on p.scope = 'staff'
where r.key = 'admin' and p.key not in ('finance.read');

insert into public.role_permissions (role_id, permission_key)
select r.id, x.key
from public.roles r
join (values
  ('project_manager', 'employees.read'),
  ('project_manager', 'projects.manage'),
  ('project_manager', 'content.manage'),
  ('project_manager', 'content.edit_copy'),
  ('project_manager', 'shootings.manage'),
  ('project_manager', 'tasks.manage'),
  ('project_manager', 'approvals.manage'),
  ('project_manager', 'files.upload'),
  ('project_manager', 'files.manage'),
  ('project_manager', 'subscriptions.read'),
  ('project_manager', 'reports.read'),
  ('project_manager', 'reports.manage'),

  ('smm_manager', 'employees.read'),
  ('smm_manager', 'content.manage'),
  ('smm_manager', 'content.edit_copy'),
  ('smm_manager', 'publications.manage'),
  ('smm_manager', 'tasks.manage'),
  ('smm_manager', 'approvals.manage'),
  ('smm_manager', 'files.upload'),
  ('smm_manager', 'subscriptions.read'),
  ('smm_manager', 'analytics.manage'),
  ('smm_manager', 'reports.read'),

  ('operator', 'files.upload'),
  ('editor', 'files.upload'),
  ('designer', 'files.upload'),
  ('copywriter', 'files.upload'),
  ('copywriter', 'content.edit_copy'),

  ('client_owner', 'client.content.view'),
  ('client_owner', 'client.approve'),
  ('client_owner', 'client.plan.view'),
  ('client_owner', 'client.plan.request_upgrade'),
  ('client_owner', 'client.contracts.view'),
  ('client_owner', 'client.reports.view'),
  ('client_owner', 'client.files.upload'),

  ('client_employee', 'client.content.view'),
  ('client_employee', 'client.reports.view'),
  ('client_employee', 'client.files.upload')
) as x (role_key, key) on x.role_key = r.key;

-- Default agency-wide internal chat; every staff member is added automatically.
insert into public.chat_rooms (kind, name, description, is_default)
values ('internal', 'SUN MEDIA jamoasi', 'Faqat SUN MEDIA xodimlari uchun ichki chat', true);
