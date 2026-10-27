-- SUN MEDIA — Sunny's memory and personality (docs/SUNNY_ROADMAP.md, phase 5).
--
--   * assistant_memories: what Sunny remembers, in three scopes —
--       personal: one person's notes ("eslab qol: …"); only that person sees, changes or deletes them;
--       company:  approved Sun Media standards; every active staff member reads them, only the system owner writes;
--       partner:  notes about one client company; its own members and the staff who see that client read them; staff
--                 who may manage that client (the same rule as for the client itself) write them.
--     Notes are short and never secrets: card numbers and "parol: …" are refused by the table itself.
--   * assistant_style_examples: the Personality Learning Studio — the owner's own answers ("I would have said …"),
--     used as style examples. Only the system owner reads and writes them here; the server reads them with its key.
--   * assistant_personality: one row of the owner's dials (humour, mischief, formality, brevity, …).
-- Public visitors have no memory at all: every policy is for signed-in users.

create table public.assistant_memories (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('personal', 'company', 'partner')),
  user_id uuid references public.profiles (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 2 and 400),
  -- The same note twice is one note (case and spacing ignored).
  body_key text generated always as (lower(regexp_replace(btrim(body), '\s+', ' ', 'g'))) stored,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_memories_owner_check check (
    (scope = 'personal' and user_id is not null and client_id is null)
    or (scope = 'company' and user_id is null and client_id is null)
    or (scope = 'partner' and user_id is null and client_id is not null)
  ),
  constraint assistant_memories_no_secrets check (
    body !~ '\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}' and body !~* '(parol|password|пароль)\s*[:=]'
  )
);
create unique index assistant_memories_once on public.assistant_memories (
  scope,
  coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid),
  body_key
);
create index assistant_memories_user_idx on public.assistant_memories (user_id) where user_id is not null;
create index assistant_memories_client_idx on public.assistant_memories (client_id) where client_id is not null;

create trigger assistant_memories_updated_at
  before update on public.assistant_memories
  for each row execute function private.set_updated_at();

alter table public.assistant_memories enable row level security;

create policy "read own, company and partner notes" on public.assistant_memories for select to authenticated using (
  (scope = 'personal' and user_id = (select auth.uid()))
  or (scope = 'company' and (select private.is_staff()))
  or (
    scope = 'partner'
    and ((select private.sees_all_clients()) or client_id = any ((select private.staff_client_ids())::uuid[]) or client_id = any ((select private.member_client_ids())::uuid[]))
  )
);
create policy "write own, company and partner notes" on public.assistant_memories for insert to authenticated with check (
  (scope = 'personal' and user_id = (select auth.uid()) and (select private.is_active_user()))
  or (scope = 'company' and (select private.has_role('system_owner')))
  -- Partner notes follow the agency's own rule for managing that client.
  or (scope = 'partner' and private.can_manage_client(client_id, 'clients.manage'))
);
create policy "change own, company and partner notes" on public.assistant_memories for update to authenticated
  using (
    (scope = 'personal' and user_id = (select auth.uid()))
    or (scope = 'company' and (select private.has_role('system_owner')))
    or (scope = 'partner' and private.can_manage_client(client_id, 'clients.manage'))
  )
  with check (
    (scope = 'personal' and user_id = (select auth.uid()))
    or (scope = 'company' and (select private.has_role('system_owner')))
    or (scope = 'partner' and private.can_manage_client(client_id, 'clients.manage'))
  );
create policy "forget own, company and partner notes" on public.assistant_memories for delete to authenticated using (
  (scope = 'personal' and user_id = (select auth.uid()))
  or (scope = 'company' and (select private.has_role('system_owner')))
  or (scope = 'partner' and private.can_manage_client(client_id, 'clients.manage'))
);

-- ---------------------------------------------------------------------------
-- Personality Learning Studio
-- ---------------------------------------------------------------------------
create table public.assistant_style_examples (
  id uuid primary key default gen_random_uuid(),
  situation text not null check (char_length(btrim(situation)) between 2 and 300),
  answer text not null check (char_length(btrim(answer)) between 2 and 600),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.assistant_style_examples enable row level security;
create policy "owner reads style examples" on public.assistant_style_examples for select to authenticated using ((select private.has_role('system_owner')));
create policy "owner teaches style" on public.assistant_style_examples for insert to authenticated with check ((select private.has_role('system_owner')));
create policy "owner removes style examples" on public.assistant_style_examples for delete to authenticated using ((select private.has_role('system_owner')));

create table public.assistant_personality (
  id smallint primary key default 1 check (id = 1),
  humor real not null default 0.5 check (humor between 0 and 1),
  mischief real not null default 0.4 check (mischief between 0 and 1),
  formality real not null default 0.4 check (formality between 0 and 1),
  brevity real not null default 0.6 check (brevity between 0 and 1),
  expressiveness real not null default 0.5 check (expressiveness between 0 and 1),
  directness real not null default 0.6 check (directness between 0 and 1),
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.assistant_personality default values;
create trigger assistant_personality_updated_at
  before update on public.assistant_personality
  for each row execute function private.set_updated_at();
alter table public.assistant_personality enable row level security;
create policy "owner reads personality" on public.assistant_personality for select to authenticated using ((select private.has_role('system_owner')));
create policy "owner tunes personality" on public.assistant_personality for update to authenticated
  using ((select private.has_role('system_owner'))) with check ((select private.has_role('system_owner')));
