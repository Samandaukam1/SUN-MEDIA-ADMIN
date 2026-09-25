-- SUN MEDIA — notification center, push delivery queue, configurable deadline alerts.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  title text not null check (char_length(title) <= 200),
  body text check (char_length(body) <= 1000),
  -- { "route": "/content/<id>", ... } — used by the apps for deep links
  data jsonb not null default '{}',
  entity_type text,
  entity_id uuid,
  client_id uuid references public.clients (id) on delete cascade,
  priority public.notification_priority not null default 'normal',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique check (token ~ '^Expo(nent)?PushToken\[.+\]$'),
  platform text not null check (platform in ('ios', 'android')),
  device_name text,
  app_version text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index push_tokens_user_idx on public.push_tokens (user_id) where revoked_at is null;

create table public.notification_deliveries (
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.notifications (id) on delete cascade,
  push_token_id uuid not null references public.push_tokens (id) on delete cascade,
  status public.delivery_status not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  ticket_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index notification_deliveries_pending_idx on public.notification_deliveries (next_attempt_at) where status = 'pending';

create table public.notification_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  push_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, type)
);

create trigger notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function private.set_updated_at();

create table public.deadline_alert_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target text not null check (target in ('task', 'content_approval')),
  -- NULL = every task type
  task_types public.task_type[],
  -- Minutes relative to the deadline: -120 = two hours before, 0 = at the deadline (overdue)
  offset_minutes integer not null check (offset_minutes between -10080 and 1440),
  recipients text[] not null
    check (recipients <@ array['assignees', 'managers', 'admins', 'owners', 'client_approvers'] and cardinality(recipients) > 0),
  -- Placeholders: {task} {content} {client} {due_time}
  title_template text not null check (char_length(title_template) <= 200),
  body_template text check (char_length(body_template) <= 1000),
  priority public.notification_priority not null default 'normal',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger deadline_alert_rules_updated_at
  before update on public.deadline_alert_rules
  for each row execute function private.set_updated_at();

create table public.deadline_alert_log (
  rule_id uuid not null references public.deadline_alert_rules (id) on delete cascade,
  entity_id uuid not null,
  due_at timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (rule_id, entity_id, due_at)
);

insert into public.deadline_alert_rules (name, target, task_types, offset_minutes, recipients, title_template, body_template, priority) values
  ('Montaj: 2 soat qoldi', 'task', '{editing}', -120, '{assignees}',
   'Montaj deadline''iga 2 soat qoldi', '{task} — {client}. Deadline: {due_time}', 'normal'),
  ('Montaj: 30 daqiqa qoldi', 'task', '{editing}', -30, '{assignees,admins}',
   'Montaj deadline''iga 30 daqiqa qoldi', '{task} — {client}. Deadline: {due_time}', 'high'),
  ('Vazifa: 1 soat qoldi', 'task', '{shooting,design,copywriting,publishing,review,strategy,meeting,other}', -60, '{assignees}',
   'Vazifa deadline''iga 1 soat qoldi', '{task} — {client}. Deadline: {due_time}', 'normal'),
  ('Vazifa muddati o''tdi', 'task', null, 0, '{assignees,admins,owners}',
   'OVERDUE: {task}', '{client} — deadline {due_time} edi', 'high'),
  ('Mijoz tasdig''i: 2 soat qoldi', 'content_approval', null, -120, '{client_approvers}',
   'Kontent tasdiqlashingizni kutmoqda', '{content}. Tasdiqlash muddati: {due_time}', 'normal'),
  ('Mijoz tasdig''i o''tib ketdi', 'content_approval', null, 0, '{managers,admins}',
   '{content} hali tasdiqlanmadi', '{client}: tasdiqlash muddati {due_time} edi', 'high');

-- ---------------------------------------------------------------------------
-- Recipient helpers
-- ---------------------------------------------------------------------------
create or replace function private.users_with_permission(p_permission text)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct x.user_id), '{}')
  from (
    select ur.user_id
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where r.scope = 'staff'
      and (r.key = 'owner' or exists (
        select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_key = p_permission
      ))
    union all
    select up.user_id from public.user_permissions up where up.permission_key = p_permission
  ) x
  join public.profiles p on p.id = x.user_id and p.status = 'active' and p.deleted_at is null;
$$;

create or replace function private.users_with_roles(p_roles text[])
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct ur.user_id), '{}')
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  join public.profiles p on p.id = ur.user_id and p.status = 'active' and p.deleted_at is null
  where r.key = any (p_roles);
$$;

create or replace function private.client_team_ids(p_client uuid, p_roles public.team_role[] default null)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct user_id), '{}')
  from public.client_team_members
  where client_id = p_client and (p_roles is null or team_role = any (p_roles));
$$;

create or replace function private.client_users_with_permission(p_client uuid, p_permission text)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct cm.user_id), '{}')
  from public.client_members cm
  join public.role_permissions rp on rp.role_id = cm.role_id and rp.permission_key = p_permission
  join public.clients c on c.id = cm.client_id and c.status in ('active', 'paused') and c.deleted_at is null
  where cm.client_id = p_client;
$$;

create or replace function private.content_assignee_ids(p_content uuid, p_roles public.team_role[] default null)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct user_id), '{}')
  from public.content_assignments
  where content_id = p_content and (p_roles is null or role = any (p_roles));
$$;

create or replace function private.content_label(p_content uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select cl.code || ' ' || initcap(replace(c.content_type::text, '_', ' ')) || ' #' || c.number || ' — ' || c.title
  from public.content_items c
  join public.clients cl on cl.id = c.client_id
  where c.id = p_content;
$$;

create or replace function private.format_local(p_at timestamptz, p_format text default 'DD.MM HH24:MI')
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(p_at at time zone private.agency_timezone(), p_format);
$$;

-- Managers responsible for a client; falls back to admins when nobody is assigned.
create or replace function private.client_manager_ids(p_client uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case when cardinality(t.ids) > 0 then t.ids else private.users_with_roles(array['admin']) end
  from (select private.client_team_ids(p_client, array['account_manager', 'project_manager', 'smm_manager']::public.team_role[]) as ids) t;
$$;

-- ---------------------------------------------------------------------------
-- Core notify + push queue
-- ---------------------------------------------------------------------------
create or replace function private.request_push_dispatch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'sunmedia_functions_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'sunmedia_push_dispatch_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url || '/push-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
exception when others then
  -- Push infrastructure must never break the business transaction; the cron sweep retries.
  raise warning 'push dispatch request failed: %', sqlerrm;
end;
$$;

create or replace function private.notify(
  p_user_ids uuid[],
  p_type text,
  p_title text,
  p_body text default null,
  p_data jsonb default '{}',
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_client uuid default null,
  p_priority public.notification_priority default 'normal',
  p_include_actor boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_push integer;
begin
  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    return 0;
  end if;

  with recipients as (
    select distinct p.id
    from public.profiles p
    where p.id = any (p_user_ids)
      and p.status = 'active'
      and p.deleted_at is null
      and (p_include_actor or p.id is distinct from auth.uid())
      and not exists (
        select 1 from public.notification_preferences np
        where np.user_id = p.id and np.type = p_type and not np.in_app_enabled
      )
  ),
  inserted as (
    insert into public.notifications (user_id, type, title, body, data, entity_type, entity_id, client_id, priority)
    select r.id, p_type, left(p_title, 200), left(p_body, 1000), coalesce(p_data, '{}'), p_entity_type, p_entity_id, p_client, p_priority
    from recipients r
    returning id, user_id
  ),
  queued as (
    insert into public.notification_deliveries (notification_id, push_token_id)
    select i.id, t.id
    from inserted i
    join public.push_tokens t on t.user_id = i.user_id and t.revoked_at is null
    where not exists (
      select 1 from public.notification_preferences np
      where np.user_id = i.user_id and np.type = p_type and not np.push_enabled
    )
    returning 1
  )
  select (select count(*) from inserted), (select count(*) from queued) into v_count, v_push;

  if v_push > 0 then
    perform private.request_push_dispatch();
  end if;
  return v_count;
end;
$$;

-- Service-role API used by the push-dispatch Edge Function.
create or replace function public.claim_push_deliveries(p_limit integer default 100)
returns table (
  delivery_id bigint,
  token text,
  title text,
  body text,
  data jsonb,
  priority public.notification_priority,
  badge integer
)
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.notification_deliveries d
    set attempts = d.attempts + 1,
        next_attempt_at = now() + make_interval(mins => least(60, 2 ^ d.attempts)::integer)
    where d.id in (
      select id from public.notification_deliveries
      where status = 'pending' and next_attempt_at <= now()
      order by id
      limit least(greatest(p_limit, 1), 500)
      for update skip locked
    )
    returning d.id, d.notification_id, d.push_token_id
  )
  select c.id, t.token, n.title, n.body,
         n.data || jsonb_build_object('notification_id', n.id, 'type', n.type),
         n.priority,
         (select count(*)::integer from public.notifications u where u.user_id = n.user_id and u.read_at is null)
  from claimed c
  join public.notifications n on n.id = c.notification_id
  join public.push_tokens t on t.id = c.push_token_id;
$$;

-- p_results: [{ "delivery_id": 1, "status": "sent"|"failed", "ticket_id": "...", "error": "...", "device_not_registered": true }]
create or replace function public.complete_push_deliveries(p_results jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
begin
  for v_item in select * from jsonb_array_elements(p_results) loop
    update public.notification_deliveries
    set status = case
          when v_item ->> 'status' = 'sent' then 'sent'
          when attempts >= 5 or coalesce((v_item ->> 'device_not_registered')::boolean, false) then 'failed'
          else 'pending'
        end::public.delivery_status,
        ticket_id = v_item ->> 'ticket_id',
        error = left(v_item ->> 'error', 500),
        sent_at = case when v_item ->> 'status' = 'sent' then now() end
    where id = (v_item ->> 'delivery_id')::bigint;

    if coalesce((v_item ->> 'device_not_registered')::boolean, false) then
      update public.push_tokens set revoked_at = now()
      where id = (select push_token_id from public.notification_deliveries where id = (v_item ->> 'delivery_id')::bigint);
    end if;
  end loop;
end;
$$;

revoke all on function public.claim_push_deliveries(integer), public.complete_push_deliveries(jsonb) from public, authenticated;
grant execute on function public.claim_push_deliveries(integer), public.complete_push_deliveries(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- User-facing RPCs
-- ---------------------------------------------------------------------------
create or replace function public.register_push_token(
  p_token text,
  p_platform text,
  p_device_name text default null,
  p_app_version text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active_user() then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  insert into public.push_tokens (user_id, token, platform, device_name, app_version)
  values (auth.uid(), p_token, p_platform, p_device_name, p_app_version)
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        device_name = excluded.device_name,
        app_version = excluded.app_version,
        last_seen_at = now(),
        revoked_at = null;
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.push_tokens set revoked_at = now()
  where token = p_token and user_id = auth.uid();
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notifications
  set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function
  public.register_push_token(text, text, text, text),
  public.unregister_push_token(text),
  public.mark_notifications_read(uuid[])
to authenticated;

-- ---------------------------------------------------------------------------
-- Event notifications
-- ---------------------------------------------------------------------------
create or replace function private.notify_content_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.content_items;
begin
  select * into v_item from public.content_items where id = new.content_id;
  perform private.notify(
    array[new.user_id],
    'content.assigned',
    case new.role
      when 'editor' then 'Yangi montaj vazifasi biriktirildi'
      when 'operator' then 'Yangi syomka kontenti biriktirildi'
      when 'designer' then 'Yangi dizayn vazifasi biriktirildi'
      when 'copywriter' then 'Yangi ssenariy/caption vazifasi'
      else 'Sizga yangi kontent biriktirildi'
    end,
    private.content_label(new.content_id),
    jsonb_build_object('route', '/content/' || new.content_id),
    'content_items', new.content_id, v_item.client_id
  );
  return null;
end;
$$;

create trigger content_assignments_notify
  after insert on public.content_assignments
  for each row execute function private.notify_content_assignment();

create or replace function private.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = new.task_id;
  perform private.notify(
    array[new.user_id],
    'task.assigned',
    case v_task.task_type when 'editing' then 'Yangi montaj vazifasi biriktirildi' else 'Yangi vazifa biriktirildi' end,
    v_task.title || coalesce('. Deadline: ' || private.format_local(v_task.due_at), ''),
    jsonb_build_object('route', '/tasks/' || new.task_id),
    'tasks', new.task_id, v_task.client_id,
    case when v_task.priority in ('high', 'urgent') then 'high' else 'normal' end::public.notification_priority
  );
  return null;
end;
$$;

create trigger task_assignments_notify
  after insert on public.task_assignments
  for each row execute function private.notify_task_assignment();

create or replace function private.notify_shooting_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shooting public.shootings;
  v_client text;
begin
  select * into v_shooting from public.shootings where id = new.shooting_id;
  select name into v_client from public.clients where id = v_shooting.client_id;
  perform private.notify(
    array[new.user_id],
    'shooting.assigned',
    'Syomka: ' || v_client || ', ' || private.format_local(v_shooting.starts_at),
    v_shooting.title || coalesce('. Lokatsiya: ' || v_shooting.location_name, ''),
    jsonb_build_object('route', '/shootings/' || new.shooting_id),
    'shootings', new.shooting_id, v_shooting.client_id
  );
  return null;
end;
$$;

create trigger shooting_members_notify
  after insert on public.shooting_members
  for each row execute function private.notify_shooting_member();

create or replace function private.notify_content_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.content_items;
  v_label text;
begin
  if tg_op = 'UPDATE' and new.status = old.status then
    return null;
  end if;
  select * into v_item from public.content_items where id = new.content_id;
  v_label := private.content_label(new.content_id);

  if new.status = 'client_review' then
    perform private.notify(
      private.client_users_with_permission(new.client_id, 'client.approve'),
      'approval.requested',
      case when v_item.content_type in ('reel', 'video', 'story', 'ad_creative')
        then 'Yangi video tasdiqlash uchun tayyor.'
        else 'Yangi kontent tasdiqlash uchun tayyor.' end,
      v_label,
      jsonb_build_object('route', '/approvals/' || new.id, 'content_id', new.content_id),
      'content_versions', new.id, new.client_id, 'high'
    );
  elsif new.status = 'internal_review' then
    perform private.notify(
      private.client_manager_ids(new.client_id),
      'approval.internal_requested',
      'Ichki tekshiruv kutilmoqda',
      v_label || ' (v' || new.version_number || ')',
      jsonb_build_object('route', '/approvals/' || new.id, 'content_id', new.content_id),
      'content_versions', new.id, new.client_id
    );
  end if;
  return null;
end;
$$;

create trigger content_versions_notify
  after insert or update of status on public.content_versions
  for each row execute function private.notify_content_version();

create or replace function private.notify_approval_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := private.content_label(new.content_id);
begin
  if new.decision = 'approved' and new.stage = 'client' then
    perform private.notify(
      private.content_assignee_ids(new.content_id)
        || private.client_manager_ids(new.client_id)
        || private.users_with_roles(array['admin']),
      'approval.approved',
      'Mijoz tasdiqladi',
      v_label,
      jsonb_build_object('route', '/content/' || new.content_id),
      'content_items', new.content_id, new.client_id
    );
  elsif new.decision = 'changes_requested' then
    perform private.notify(
      private.content_assignee_ids(new.content_id, array['editor', 'designer', 'copywriter']::public.team_role[])
        || private.client_manager_ids(new.client_id),
      'approval.changes_requested',
      case when new.stage = 'client' then 'Mijoz o''zgartirish so''radi' else 'Ichki tekshiruv: o''zgartirish kerak' end,
      v_label || coalesce(': ' || new.comment, ''),
      jsonb_build_object('route', '/content/' || new.content_id),
      'content_items', new.content_id, new.client_id, 'high'
    );
  end if;
  return null;
end;
$$;

create trigger client_approvals_notify
  after insert on public.client_approvals
  for each row execute function private.notify_approval_decision();

create or replace function private.notify_content_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and old.status <> 'published' and new.is_client_visible then
    perform private.notify(
      private.client_users_with_permission(new.client_id, 'client.content.view'),
      'content.published',
      'Kontent joylandi',
      private.content_label(new.id),
      jsonb_build_object('route', '/content/' || new.id),
      'content_items', new.id, new.client_id, 'low'
    );
  end if;
  return null;
end;
$$;

create trigger content_items_notify_published
  after update of status on public.content_items
  for each row execute function private.notify_content_published();

create or replace function private.notify_task_done()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'done' and old.status <> 'done' and new.created_by is not null then
    perform private.notify(
      array[new.created_by], 'task.completed', 'Vazifa bajarildi', new.title,
      jsonb_build_object('route', '/tasks/' || new.id), 'tasks', new.id, new.client_id, 'low'
    );
  end if;
  return null;
end;
$$;

create trigger tasks_notify_done
  after update of status on public.tasks
  for each row execute function private.notify_task_done();

create or replace function private.notify_upgrade_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client text;
  v_plan text;
begin
  select name into v_client from public.clients where id = new.client_id;
  select name into v_plan from public.plans where id = new.requested_plan_id;
  if tg_op = 'INSERT' then
    perform private.notify(
      private.users_with_permission('subscriptions.manage'),
      'plan.upgrade_requested',
      v_client || ': tarifni o''zgartirish so''rovi',
      'So''ralgan tarif: ' || v_plan || coalesce('. ' || new.message, ''),
      jsonb_build_object('route', '/plans/requests/' || new.id),
      'plan_upgrade_requests', new.id, new.client_id
    );
  elsif new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    perform private.notify(
      array[new.requested_by],
      'plan.upgrade_' || new.status,
      case when new.status = 'approved' then 'Tarif so''rovingiz tasdiqlandi' else 'Tarif so''rovingiz rad etildi' end,
      coalesce(new.response, v_plan),
      jsonb_build_object('route', '/plan'),
      'plan_upgrade_requests', new.id, new.client_id
    );
  end if;
  return null;
end;
$$;

create trigger plan_upgrade_requests_notify
  after insert or update of status on public.plan_upgrade_requests
  for each row execute function private.notify_upgrade_request();

create or replace function private.notify_report_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and old.status <> 'published' then
    perform private.notify(
      private.client_users_with_permission(new.client_id, 'client.reports.view'),
      'report.published',
      to_char(new.period_month, 'FMMonth YYYY') || ' hisobotingiz tayyor',
      new.title,
      jsonb_build_object('route', '/reports/' || new.id),
      'monthly_reports', new.id, new.client_id
    );
  end if;
  return null;
end;
$$;

create trigger monthly_reports_notify
  after update of status on public.monthly_reports
  for each row execute function private.notify_report_published();

create or replace function private.notify_chat_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.chat_rooms;
  v_sender text;
begin
  if new.is_system then
    return null;
  end if;
  select * into v_room from public.chat_rooms where id = new.room_id;
  select full_name into v_sender from public.profiles where id = new.sender_id;
  perform private.notify(
    (select coalesce(array_agg(m.user_id), '{}') from public.chat_members m
     where m.room_id = new.room_id and m.user_id <> new.sender_id
       and (m.muted_until is null or m.muted_until < now())),
    'chat.message',
    v_room.name,
    coalesce(v_sender, 'SUN MEDIA') || ': ' || case when new.body = '' then '📎 Fayl' else left(new.body, 200) end,
    jsonb_build_object('route', '/chat/' || new.room_id),
    'chat_rooms', new.room_id, v_room.client_id, 'low'
  );
  return null;
end;
$$;

create trigger messages_notify
  after insert on public.messages
  for each row execute function private.notify_chat_message();

-- ---------------------------------------------------------------------------
-- Scheduled processing
-- ---------------------------------------------------------------------------
create or replace function private.render_template(p_template text, p_values jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_result text := p_template;
  v_key text;
begin
  if v_result is null then
    return null;
  end if;
  for v_key in select jsonb_object_keys(p_values) loop
    v_result := replace(v_result, '{' || v_key || '}', coalesce(p_values ->> v_key, ''));
  end loop;
  return v_result;
end;
$$;

create or replace function private.resolve_alert_recipients(
  p_recipients text[],
  p_client uuid,
  p_task uuid default null,
  p_content uuid default null
)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct u), '{}') from (
    select unnest(case when 'assignees' = any (p_recipients) then
      coalesce((select array_agg(user_id) from public.task_assignments where task_id = p_task), '{}')
      || case when p_content is not null then private.content_assignee_ids(p_content) else '{}'::uuid[] end
    else '{}'::uuid[] end) as u
    union all
    select unnest(case when 'managers' = any (p_recipients) and p_client is not null
      then private.client_manager_ids(p_client) else '{}'::uuid[] end)
    union all
    select unnest(case when 'admins' = any (p_recipients) then private.users_with_roles(array['admin']) else '{}'::uuid[] end)
    union all
    select unnest(case when 'owners' = any (p_recipients) then private.users_with_roles(array['owner', 'director']) else '{}'::uuid[] end)
    union all
    select unnest(case when 'client_approvers' = any (p_recipients) and p_client is not null
      then private.client_users_with_permission(p_client, 'client.approve') else '{}'::uuid[] end)
  ) s;
$$;

create or replace function private.process_deadline_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule public.deadline_alert_rules;
  v_row record;
  v_sent integer := 0;
  v_values jsonb;
begin
  update public.tasks
  set overdue_at = now()
  where deleted_at is null
    and status not in ('done', 'cancelled')
    and due_at is not null
    and due_at <= now()
    and overdue_at is null;

  for v_rule in select * from public.deadline_alert_rules where is_active loop
    if v_rule.target = 'task' then
      for v_row in
        select t.id, t.title, t.client_id, t.content_id, t.due_at, c.name as client_name
        from public.tasks t
        left join public.clients c on c.id = t.client_id
        where t.deleted_at is null
          and t.status not in ('done', 'cancelled')
          and t.due_at is not null
          and (v_rule.task_types is null or t.task_type = any (v_rule.task_types))
          and t.due_at + make_interval(mins => v_rule.offset_minutes) <= now()
          and t.due_at + make_interval(mins => v_rule.offset_minutes) > now() - interval '6 hours'
          and not exists (
            select 1 from public.deadline_alert_log l
            where l.rule_id = v_rule.id and l.entity_id = t.id and l.due_at = t.due_at
          )
      loop
        insert into public.deadline_alert_log (rule_id, entity_id, due_at) values (v_rule.id, v_row.id, v_row.due_at);
        v_values := jsonb_build_object(
          'task', v_row.title, 'client', coalesce(v_row.client_name, 'SUN MEDIA'),
          'due_time', private.format_local(v_row.due_at, 'HH24:MI'), 'content', ''
        );
        v_sent := v_sent + private.notify(
          private.resolve_alert_recipients(v_rule.recipients, v_row.client_id, v_row.id, null),
          case when v_rule.offset_minutes >= 0 then 'deadline.overdue' else 'deadline.approaching' end,
          private.render_template(v_rule.title_template, v_values),
          private.render_template(v_rule.body_template, v_values),
          jsonb_build_object('route', '/tasks/' || v_row.id),
          'tasks', v_row.id, v_row.client_id, v_rule.priority, true
        );
      end loop;
    else
      for v_row in
        select ci.id, ci.client_id, ci.client_approval_due_at as due_at, c.name as client_name
        from public.content_items ci
        join public.clients c on c.id = ci.client_id
        where ci.deleted_at is null
          and ci.status = 'client_review'
          and ci.client_approval_due_at is not null
          and ci.client_approval_due_at + make_interval(mins => v_rule.offset_minutes) <= now()
          and ci.client_approval_due_at + make_interval(mins => v_rule.offset_minutes) > now() - interval '6 hours'
          and not exists (
            select 1 from public.deadline_alert_log l
            where l.rule_id = v_rule.id and l.entity_id = ci.id and l.due_at = ci.client_approval_due_at
          )
      loop
        insert into public.deadline_alert_log (rule_id, entity_id, due_at) values (v_rule.id, v_row.id, v_row.due_at);
        v_values := jsonb_build_object(
          'task', '', 'client', v_row.client_name, 'content', private.content_label(v_row.id),
          'due_time', private.format_local(v_row.due_at, 'HH24:MI')
        );
        v_sent := v_sent + private.notify(
          private.resolve_alert_recipients(v_rule.recipients, v_row.client_id, null, v_row.id),
          'deadline.approval',
          private.render_template(v_rule.title_template, v_values),
          private.render_template(v_rule.body_template, v_values),
          jsonb_build_object('route', '/content/' || v_row.id),
          'content_items', v_row.id, v_row.client_id, v_rule.priority, true
        );
      end loop;
    end if;
  end loop;
  return v_sent;
end;
$$;

-- Evening reminder about tomorrow's shootings ("Ertaga soat 10:00 da SAFI syomkasi.")
create or replace function private.send_shooting_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_sent integer := 0;
  v_tomorrow date := private.agency_today() + 1;
begin
  for v_row in
    select s.id, s.client_id, s.starts_at, s.location_name, c.name as client_name,
           array_agg(sm.user_id) as members
    from public.shootings s
    join public.clients c on c.id = s.client_id
    join public.shooting_members sm on sm.shooting_id = s.id
    where s.deleted_at is null
      and s.status in ('planned', 'confirmed')
      and (s.starts_at at time zone private.agency_timezone())::date = v_tomorrow
    group by s.id, c.name
  loop
    v_sent := v_sent + private.notify(
      v_row.members,
      'shooting.reminder',
      'Ertaga soat ' || private.format_local(v_row.starts_at, 'HH24:MI') || ' da ' || v_row.client_name || ' syomkasi.',
      coalesce('Lokatsiya: ' || v_row.location_name, null),
      jsonb_build_object('route', '/shootings/' || v_row.id),
      'shootings', v_row.id, v_row.client_id, 'normal', true
    );
  end loop;
  return v_sent;
end;
$$;

create or replace function private.push_sweep()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.notification_deliveries where status = 'pending' and next_attempt_at <= now()) then
    perform private.request_push_dispatch();
  end if;
end;
$$;

create or replace function private.housekeeping()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.files set status = 'failed'
  where status = 'pending' and created_at < now() - interval '2 days';
  delete from public.notification_deliveries where created_at < now() - interval '30 days';
  delete from public.deadline_alert_log where sent_at < now() - interval '60 days';
$$;

select cron.schedule('sunmedia-deadline-alerts', '* * * * *', $$select private.process_deadline_alerts()$$);
select cron.schedule('sunmedia-push-sweep', '* * * * *', $$select private.push_sweep()$$);
-- 13:00 UTC = 18:00 Asia/Tashkent
select cron.schedule('sunmedia-shooting-reminders', '0 13 * * *', $$select private.send_shooting_reminders()$$);
select cron.schedule('sunmedia-housekeeping', '30 21 * * *', $$select private.housekeeping()$$);

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
create trigger audit_deadline_alert_rules after insert or update or delete on public.deadline_alert_rules
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.deadline_alert_rules enable row level security;
alter table public.deadline_alert_log enable row level security;

create policy "read own notifications" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "mark own notifications" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "delete own notifications" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));
revoke insert, update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy "read own push tokens" on public.push_tokens
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.push_tokens from authenticated;

revoke all on public.notification_deliveries from authenticated;
revoke all on public.deadline_alert_log from authenticated;

create policy "own notification preferences" on public.notification_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy "set own notification preferences" on public.notification_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "change own notification preferences" on public.notification_preferences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "staff read alert rules" on public.deadline_alert_rules
  for select to authenticated using ((select private.is_staff()));
create policy "add alert rules" on public.deadline_alert_rules
  for insert to authenticated with check ((select private.has_permission('notifications.manage')));
create policy "change alert rules" on public.deadline_alert_rules
  for update to authenticated
  using ((select private.has_permission('notifications.manage')))
  with check ((select private.has_permission('notifications.manage')));
create policy "delete alert rules" on public.deadline_alert_rules
  for delete to authenticated using ((select private.has_permission('notifications.manage')));
