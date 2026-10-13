-- "Mijoz tahlili": a prospective client is interviewed with a fixed questionnaire (options or own words), then AI
-- reads the answers (and the Instagram profile) and suggests a tariff and next steps. Only the system owner and
-- admins (permission prospects.manage) see any of it. Additive.

insert into public.permissions (key, module, name, description, scope) values
  ('prospects.manage', 'clients', 'Yangi mijoz tahlili', 'Yangi mijozni savollar va AI bilan tahlil qilish, Instagram tahlili', 'staff')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, 'prospects.manage' from public.roles r where r.key = 'admin'
on conflict (role_id, permission_key) do nothing;

create type public.prospect_status as enum ('new', 'analyzed', 'won', 'lost');

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  company text check (char_length(company) <= 160),
  phone text check (char_length(phone) <= 40),
  instagram text check (char_length(instagram) <= 120),
  status public.prospect_status not null default 'new',
  -- { "<question key>": { "options": ["<option key>", …], "custom": "own words" } }
  answers jsonb not null default '{}' check (jsonb_typeof(answers) = 'object'),
  notes text check (char_length(notes) <= 4000),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prospects_created_idx on public.prospects (created_at desc);

create trigger prospects_updated_at before update on public.prospects
  for each row execute function private.set_updated_at();
create trigger audit_prospects after insert or update or delete on public.prospects
  for each row execute function private.audit_row();

create table public.prospect_analyses (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  kind text not null check (kind in ('brief', 'instagram')),
  -- What the AI was given (answers with their labels, or the profile numbers) and what it returned.
  input jsonb not null default '{}',
  result jsonb not null default '{}',
  model text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index prospect_analyses_prospect_idx on public.prospect_analyses (prospect_id, kind, created_at desc);

alter table public.prospects enable row level security;
alter table public.prospect_analyses enable row level security;
revoke all on public.prospects, public.prospect_analyses from anon, authenticated;
grant select, insert, update, delete on public.prospects to authenticated;
grant select, insert, delete on public.prospect_analyses to authenticated;

create policy "prospect people read" on public.prospects
  for select to authenticated using ((select private.has_permission('prospects.manage')));
create policy "prospect people add" on public.prospects
  for insert to authenticated with check ((select private.has_permission('prospects.manage')));
create policy "prospect people edit" on public.prospects
  for update to authenticated
  using ((select private.has_permission('prospects.manage')))
  with check ((select private.has_permission('prospects.manage')));
create policy "prospect people delete" on public.prospects
  for delete to authenticated using ((select private.has_permission('prospects.manage')));

create policy "prospect analyses read" on public.prospect_analyses
  for select to authenticated using ((select private.has_permission('prospects.manage')));
create policy "prospect analyses add" on public.prospect_analyses
  for insert to authenticated with check ((select private.has_permission('prospects.manage')));
create policy "prospect analyses delete" on public.prospect_analyses
  for delete to authenticated using ((select private.has_permission('prospects.manage')));

-- Profile screenshots for the Instagram analysis: private, pictures only, <prospect id>/<file>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prospects', 'prospects', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "prospect screenshots read" on storage.objects
  for select to authenticated using (bucket_id = 'prospects' and (select private.has_permission('prospects.manage')));
create policy "prospect screenshots add" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'prospects'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and (select private.has_permission('prospects.manage'))
  );
create policy "prospect screenshots remove" on storage.objects
  for delete to authenticated using (bucket_id = 'prospects' and (select private.has_permission('prospects.manage')));
