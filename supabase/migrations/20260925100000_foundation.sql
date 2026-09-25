-- SUN MEDIA — foundation: extensions, private schema, default privileges, shared enums and utilities.

create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Security-definer helpers live here; the schema is not exposed through the Data API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- anon never touches application tables; every screen requires a signed-in user.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon, public;
alter default privileges for role postgres in schema private revoke all on functions from public;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_kind as enum ('staff', 'client');
create type public.account_status as enum ('active', 'disabled');
create type public.visibility_level as enum ('internal', 'client');
create type public.priority_level as enum ('low', 'normal', 'high', 'urgent');

create type public.client_status as enum ('active', 'paused', 'disabled', 'archived');
create type public.team_role as enum (
  'account_manager', 'project_manager', 'smm_manager', 'operator', 'editor', 'designer', 'copywriter', 'assistant'
);
create type public.employment_type as enum ('full_time', 'part_time', 'contractor', 'intern');
create type public.employee_status as enum ('active', 'on_leave', 'terminated');

create type public.project_kind as enum ('retainer', 'campaign', 'one_off');
create type public.project_status as enum ('planning', 'active', 'on_hold', 'completed', 'cancelled');

create type public.content_type as enum ('reel', 'video', 'post', 'carousel', 'story', 'design', 'ad_creative', 'other');
create type public.content_status as enum (
  'idea', 'script', 'shooting', 'editing', 'internal_review', 'client_review',
  'revision', 'approved', 'scheduled', 'published', 'cancelled'
);
create type public.social_platform as enum (
  'instagram', 'tiktok', 'youtube', 'facebook', 'telegram', 'linkedin', 'x', 'website', 'other'
);
create type public.publication_status as enum ('planned', 'scheduled', 'published', 'failed', 'cancelled');

create type public.shooting_status as enum ('planned', 'confirmed', 'in_progress', 'completed', 'postponed', 'cancelled');

create type public.task_type as enum (
  'shooting', 'editing', 'design', 'copywriting', 'publishing', 'review', 'strategy', 'meeting', 'other'
);
create type public.task_status as enum ('todo', 'in_progress', 'in_review', 'revision', 'done', 'cancelled');

create type public.attendance_status as enum ('present', 'absent', 'late', 'excused', 'vacation', 'remote');
create type public.shooting_attendance_status as enum ('pending', 'arrived', 'absent', 'late');

create type public.folder_kind as enum (
  'raw', 'edited', 'approved', 'logos', 'brandbook', 'music', 'photos', 'documents', 'contracts', 'custom'
);
create type public.file_kind as enum ('video', 'image', 'audio', 'pdf', 'document', 'archive', 'other');
create type public.file_status as enum ('pending', 'uploaded', 'failed');

create type public.version_status as enum (
  'internal_review', 'client_review', 'changes_requested', 'approved', 'superseded'
);
create type public.approval_stage as enum ('internal', 'client');
create type public.approval_decision as enum ('approved', 'changes_requested');
create type public.revision_status as enum ('open', 'in_progress', 'resolved', 'cancelled');

create type public.chat_room_kind as enum ('project', 'internal', 'direct');

create type public.notification_priority as enum ('low', 'normal', 'high');
create type public.delivery_status as enum ('pending', 'sent', 'failed', 'skipped');

create type public.subscription_status as enum ('scheduled', 'active', 'expired', 'cancelled');
create type public.usage_source as enum ('auto', 'manual');
create type public.request_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.contract_status as enum ('draft', 'active', 'expired', 'terminated');

create type public.social_connection as enum ('manual', 'connected', 'error', 'disconnected');
create type public.metric_source as enum ('manual', 'api');
create type public.report_status as enum ('draft', 'published', 'archived');

-- ---------------------------------------------------------------------------
-- Utilities
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- True when the statement runs inside a security-definer RPC, a migration, or the service role —
-- i.e. not as a signed-in user issuing SQL through the Data API.
create or replace function private.is_privileged_context()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user not in ('authenticated', 'anon');
$$;

create table public.app_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_.]*$'),
  value jsonb not null,
  description text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create trigger app_settings_updated_at
  before update on public.app_settings
  for each row execute function private.set_updated_at();

insert into public.app_settings (key, value, description) values
  ('agency.name', '"SUN MEDIA"', 'Agentlik nomi'),
  ('agency.timezone', '"Asia/Tashkent"', 'Barcha kunlik hisob-kitoblar uchun vaqt zonasi'),
  ('attendance.late_grace_minutes', '10', 'Necha daqiqadan keyin kechikish hisoblanadi'),
  ('uploads.max_file_bytes', '5368709120', 'Bitta fayl uchun maksimal hajm (5 GB)');

create or replace function private.agency_timezone()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select value #>> '{}' from public.app_settings where key = 'agency.timezone'), 'Asia/Tashkent');
$$;

create or replace function private.agency_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone private.agency_timezone())::date;
$$;

grant execute on function private.agency_timezone() to authenticated;
grant execute on function private.agency_today() to authenticated;
grant execute on function private.is_privileged_context() to authenticated;
