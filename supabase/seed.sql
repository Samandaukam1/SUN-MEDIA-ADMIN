-- ============================================================================
-- LOCAL DEVELOPMENT SEED ONLY.
-- Loaded by `supabase db reset` on the local stack. Never pushed to the cloud
-- project (`supabase db push` does not run seeds). Do not copy into migrations.
--
-- Every account below uses the password: SunMedia2026!
-- ============================================================================

create function pg_temp.seed_user(p_email text, p_name text) returns uuid language plpgsql as $$
declare
  v uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email,
    extensions.crypt('SunMedia2026!', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', p_name), now(), now(),
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v, v::text, jsonb_build_object('sub', v::text, 'email', p_email, 'email_verified', true),
          'email', now(), now(), now());
  return v;
end $$;

create function pg_temp.at_local(p_day_offset integer, p_time time) returns timestamptz language sql stable as $$
  select (((now() at time zone 'Asia/Tashkent')::date + p_day_offset) + p_time) at time zone 'Asia/Tashkent'
$$;

do $$
declare
  u_owner uuid := pg_temp.seed_user('owner@sunmedia.local', 'Owner');
  u_admin uuid := pg_temp.seed_user('admin@sunmedia.local', 'Admin');
  u_pm uuid := pg_temp.seed_user('pm@sunmedia.local', 'Project Manager');
  u_smm uuid := pg_temp.seed_user('smm@sunmedia.local', 'SMM Manager');
  u_operator uuid := pg_temp.seed_user('operator@sunmedia.local', 'Anisjon Abdullayev');
  u_editor uuid := pg_temp.seed_user('editor@sunmedia.local', 'Jasur');
  u_designer uuid := pg_temp.seed_user('designer@sunmedia.local', 'Designer');
  u_safi uuid := pg_temp.seed_user('safi@client.local', 'SAFI');
  u_wd uuid := pg_temp.seed_user('wedrink@client.local', 'WeDrink');
  c_safi uuid;
  c_wd uuid;
  p_premium uuid;
  s_today uuid;
  s_week uuid;
  ct_today uuid;
  ct_review uuid;
  t_edit uuid;
  month_start date := date_trunc('month', (now() at time zone 'Asia/Tashkent')::date)::date;
begin
  insert into public.user_roles (user_id, role_id)
  select x.u, r.id from (values
    (u_owner, 'owner'), (u_admin, 'admin'), (u_pm, 'project_manager'), (u_smm, 'smm_manager'),
    (u_operator, 'operator'), (u_editor, 'editor'), (u_designer, 'designer')
  ) x (u, k) join public.roles r on r.key = x.k;

  insert into public.employees (user_id, job_title) values
    (u_owner, 'Asoschi'), (u_admin, 'Administrator'), (u_pm, 'Project Manager'), (u_smm, 'SMM Manager'),
    (u_operator, 'Operator'), (u_editor, 'Montajyor'), (u_designer, 'Dizayner');

  insert into public.clients (name, code, industry, created_by) values ('SAFI', 'SAFI', 'Restoran', u_owner) returning id into c_safi;
  insert into public.clients (name, code, industry, created_by) values ('WeDrink', 'WEDRINK', 'Ichimliklar', u_owner) returning id into c_wd;

  insert into public.client_members (client_id, user_id, role_id)
  select c_safi, u_safi, id from public.roles where key = 'client_owner';
  insert into public.client_members (client_id, user_id, role_id)
  select c_wd, u_wd, id from public.roles where key = 'client_owner';

  insert into public.client_team_members (client_id, user_id, team_role) values
    (c_safi, u_pm, 'account_manager'), (c_safi, u_smm, 'smm_manager'), (c_safi, u_operator, 'operator'),
    (c_safi, u_editor, 'editor'), (c_safi, u_designer, 'designer'),
    (c_wd, u_pm, 'project_manager'), (c_wd, u_smm, 'smm_manager');

  insert into public.social_accounts (client_id, platform, handle, url) values
    (c_safi, 'instagram', 'safi.uz', 'https://instagram.com/safi.uz'),
    (c_wd, 'instagram', 'wedrink.uz', 'https://instagram.com/wedrink.uz');

  -- Tariffs
  insert into public.plans (name, slug, price, position, created_by) values
    ('Basic', 'basic', 6000000, 10, u_owner),
    ('Standard', 'standard', 10000000, 20, u_owner),
    ('Premium', 'premium', 15000000, 30, u_owner);
  select id into p_premium from public.plans where slug = 'premium';
  insert into public.plan_features (plan_id, service_key, quantity, is_included)
  select pl.id, f.k, f.q, true
  from public.plans pl
  join (values
    ('basic', 'reels', 4), ('basic', 'posts', 4), ('basic', 'stories', 15), ('basic', 'shooting_days', 1), ('basic', 'designs', 2),
    ('standard', 'reels', 8), ('standard', 'posts', 6), ('standard', 'stories', 25), ('standard', 'shooting_days', 2), ('standard', 'designs', 4),
    ('premium', 'reels', 12), ('premium', 'posts', 8), ('premium', 'stories', 40), ('premium', 'shooting_days', 4), ('premium', 'designs', 6)
  ) f (slug, k, q) on f.slug = pl.slug;
  insert into public.plan_features (plan_id, service_key, quantity, is_included)
  select p_premium, k, null, true from unnest(array['report', 'account_manager', 'strategy']) k;

  insert into public.client_subscriptions (client_id, plan_id, starts_on, ends_on, price, created_by)
  values (c_safi, p_premium, month_start, (month_start + interval '1 month - 1 day')::date, 15000000, u_owner);

  -- Today's shooting (spec example)
  insert into public.shootings (client_id, title, starts_at, ends_at, location_name, location_address, responsible_manager_id,
                                shot_list, status, created_by)
  values (c_safi, 'SAFI Yunusobod syomkasi', pg_temp.at_local(0, '11:00'), pg_temp.at_local(0, '14:00'),
          'SAFI Yunusobod filiali', 'Toshkent, Yunusobod tumani', u_pm,
          '[{"title":"Oshxona umumiy plan","done":false},{"title":"Taom yaqin plan","done":false},{"title":"Mijoz reaksiyasi","done":false}]',
          'confirmed', u_pm)
  returning id into s_today;
  insert into public.shooting_members (shooting_id, user_id, role) values (s_today, u_operator, 'operator');

  insert into public.shootings (client_id, title, starts_at, ends_at, location_name, responsible_manager_id, status, created_by)
  values (c_safi, 'SAFI Chilonzor syomkasi', pg_temp.at_local(2, '10:00'), pg_temp.at_local(2, '13:00'),
          'SAFI Chilonzor filiali', u_pm, 'planned', u_pm)
  returning id into s_week;
  insert into public.shooting_members (shooting_id, user_id, role) values (s_week, u_operator, 'operator');

  insert into public.content_items (client_id, shooting_id, title, content_type, status, priority, script, description,
                                    due_at, client_approval_due_at, created_by)
  values (c_safi, s_today, '5 ta eng qimmat tovuq taomi', 'reel', 'shooting', 'high',
          'Kirish: "SAFI''dagi eng qimmat 5 ta tovuq taomi..."', 'Instagram Reels 9:16',
          pg_temp.at_local(0, '17:00'), pg_temp.at_local(0, '18:00'), u_pm)
  returning id into ct_today;
  insert into public.content_assignments (content_id, user_id, role) values
    (ct_today, u_operator, 'operator'), (ct_today, u_editor, 'editor'), (ct_today, u_smm, 'smm_manager');
  insert into public.content_publications (content_id, client_id, platform, scheduled_at, status)
  values (ct_today, c_safi, 'instagram', pg_temp.at_local(0, '19:00'), 'planned');

  insert into public.tasks (client_id, content_id, title, task_type, priority, due_at, created_by)
  values (c_safi, ct_today, 'SAFI Reel — montaj', 'editing', 'high', pg_temp.at_local(0, '17:00'), u_pm)
  returning id into t_edit;
  insert into public.task_assignments (task_id, user_id) values (t_edit, u_editor);

  insert into public.content_items (client_id, shooting_id, title, content_type, status, script, due_at, created_by)
  values (c_safi, s_week, 'Mahsulot qanday tayyorlanadi?', 'reel', 'script', 'Oshpaz bilan intervyu', pg_temp.at_local(2, '17:00'), u_pm)
  returning id into ct_review;
  insert into public.content_assignments (content_id, user_id, role) values (ct_review, u_editor, 'editor');
  insert into public.content_publications (content_id, client_id, platform, scheduled_at, status)
  values (ct_review, c_safi, 'instagram', pg_temp.at_local(3, '19:30'), 'planned');

  insert into public.content_items (client_id, title, content_type, status, created_by)
  values
    (c_safi, 'Yangi menyu karuseli', 'carousel', 'idea', u_smm),
    (c_safi, 'Haftalik aksiya stories', 'story', 'script', u_smm),
    (c_wd, 'WeDrink yozgi kolleksiya', 'reel', 'editing', u_pm);
end $$;
