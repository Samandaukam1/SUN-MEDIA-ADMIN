-- SUN MEDIA — client approval center: versions, internal/client review, revisions with timecoded comments.

create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null,
  client_id uuid not null,
  version_number integer not null check (version_number > 0),
  file_id uuid not null references public.files (id) on delete restrict,
  notes text check (char_length(notes) <= 2000),
  status public.version_status not null,
  submitted_by uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz not null default now(),
  sent_to_client_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_id, version_number),
  foreign key (content_id, client_id) references public.content_items (id, client_id) on delete cascade
);

create index content_versions_client_status_idx on public.content_versions (client_id, status);

create trigger content_versions_updated_at
  before update on public.content_versions
  for each row execute function private.set_updated_at();

create table public.client_approvals (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null,
  client_id uuid not null,
  version_id uuid not null references public.content_versions (id) on delete cascade,
  stage public.approval_stage not null,
  decision public.approval_decision not null,
  comment text check (char_length(comment) <= 2000),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz not null default now(),
  foreign key (content_id, client_id) references public.content_items (id, client_id) on delete cascade
);

create index client_approvals_content_idx on public.client_approvals (content_id, decided_at);
create index client_approvals_client_idx on public.client_approvals (client_id, decided_at);

create table public.revisions (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null,
  client_id uuid not null,
  version_id uuid references public.content_versions (id) on delete set null,
  revision_number integer not null check (revision_number > 0),
  stage public.approval_stage not null,
  status public.revision_status not null default 'open',
  summary text check (char_length(summary) <= 2000),
  requested_by uuid references public.profiles (id) on delete set null,
  requested_at timestamptz not null default now(),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_id, revision_number),
  foreign key (content_id, client_id) references public.content_items (id, client_id) on delete cascade
);

create index revisions_client_idx on public.revisions (client_id, requested_at);
create index revisions_open_idx on public.revisions (content_id) where status in ('open', 'in_progress');

create trigger revisions_updated_at
  before update on public.revisions
  for each row execute function private.set_updated_at();

create table public.revision_comments (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.revisions (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  -- Position in the video the comment refers to, e.g. 13000 = 00:13
  timecode_ms integer check (timecode_ms >= 0),
  body text not null check (char_length(body) between 1 and 2000),
  is_resolved boolean not null default false,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index revision_comments_revision_idx on public.revision_comments (revision_id, timecode_ms nulls last, created_at);

create trigger revision_comments_updated_at
  before update on public.revision_comments
  for each row execute function private.set_updated_at();

-- Authors edit their own text; staff resolve. Clients cannot mark comments resolved.
create or replace function private.revision_comments_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not private.is_privileged_context() then
      new.author_id := auth.uid();
      new.is_resolved := false;
    end if;
    return new;
  end if;
  if private.is_privileged_context() then
    return new;
  end if;
  if (new.body is distinct from old.body or new.deleted_at is distinct from old.deleted_at)
     and old.author_id is distinct from auth.uid() then
    raise exception 'Only the author can edit this comment' using errcode = '42501';
  end if;
  if new.is_resolved is distinct from old.is_resolved then
    if not private.is_staff() then
      raise exception 'Only SUN MEDIA staff resolve revision comments' using errcode = '42501';
    end if;
    new.resolved_by := case when new.is_resolved then auth.uid() end;
    new.resolved_at := case when new.is_resolved then now() end;
  end if;
  return new;
end;
$$;

create trigger revision_comments_10_before_write
  before insert or update on public.revision_comments
  for each row execute function private.revision_comments_before_write();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Editor/designer (or a manager) submits a new cut. Internal review first unless a manager sends it straight to the client.
create or replace function public.submit_content_version(
  p_content_id uuid,
  p_file_id uuid,
  p_notes text default null,
  p_stage public.approval_stage default 'internal'
)
returns public.content_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.content_items;
  v_file public.files;
  v_version public.content_versions;
  v_is_manager boolean;
begin
  select * into v_item from public.content_items where id = p_content_id and deleted_at is null for update;
  if not found then
    raise exception 'Content not found' using errcode = 'P0002';
  end if;

  v_is_manager := private.can_manage_client(v_item.client_id, 'approvals.manage');
  if not v_is_manager and not (p_content_id = any (private.assigned_content_ids())) then
    raise exception 'Not assigned to this content' using errcode = '42501';
  end if;
  if p_stage = 'client' and not v_is_manager then
    raise exception 'Only managers can send a version directly to the client' using errcode = '42501';
  end if;
  if v_item.status in ('approved', 'scheduled', 'published', 'cancelled') then
    raise exception 'Content is already %', v_item.status using errcode = '22023';
  end if;

  select * into v_file from public.files where id = p_file_id;
  if not found or v_file.client_id is distinct from v_item.client_id or v_file.status <> 'uploaded' or v_file.deleted_at is not null then
    raise exception 'File must be an uploaded file of the same client' using errcode = '22023';
  end if;

  update public.content_versions
  set status = 'superseded'
  where content_id = p_content_id and status in ('internal_review', 'client_review');

  update public.revisions
  set status = 'resolved', resolved_by = auth.uid(), resolved_at = now()
  where content_id = p_content_id and status in ('open', 'in_progress');

  insert into public.content_versions (content_id, client_id, version_number, file_id, notes, status, submitted_by, sent_to_client_at)
  values (
    p_content_id, v_item.client_id,
    coalesce((select max(version_number) from public.content_versions where content_id = p_content_id), 0) + 1,
    p_file_id, p_notes,
    case when p_stage = 'client' then 'client_review' else 'internal_review' end::public.version_status,
    auth.uid(),
    case when p_stage = 'client' then now() end
  )
  returning * into v_version;

  update public.files
  set content_id = p_content_id,
      visibility = case when p_stage = 'client' then 'client'::public.visibility_level else visibility end
  where id = p_file_id;

  update public.content_items
  set status = case when p_stage = 'client' then 'client_review' else 'internal_review' end::public.content_status,
      status_changed_at = now()
  where id = p_content_id;

  perform private.audit_event(
    'content.version_submitted', 'content_items', p_content_id::text, v_item.client_id,
    null, jsonb_build_object('version', v_version.version_number, 'stage', p_stage)
  );
  return v_version;
end;
$$;

-- Internal reviewer or client decides on a version.
-- p_comments: [{ "timecode_ms": 13000, "body": "Logo kattaroq bo'lsin" }, ...]
create or replace function public.review_content_version(
  p_version_id uuid,
  p_decision public.approval_decision,
  p_summary text default null,
  p_comments jsonb default '[]'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version public.content_versions;
  v_item public.content_items;
  v_stage public.approval_stage;
  v_revision public.revisions;
  v_comment jsonb;
  v_approved_folder uuid;
begin
  select * into v_version from public.content_versions where id = p_version_id for update;
  if not found then
    raise exception 'Version not found' using errcode = 'P0002';
  end if;
  select * into v_item from public.content_items where id = v_version.content_id for update;

  if v_version.status = 'internal_review' then
    v_stage := 'internal';
    if not private.can_manage_client(v_item.client_id, 'approvals.manage') then
      raise exception 'Not allowed to review internally' using errcode = '42501';
    end if;
  elsif v_version.status = 'client_review' then
    v_stage := 'client';
    if not (
      private.has_client_permission(v_item.client_id, 'client.approve')
      or private.can_manage_client(v_item.client_id, 'approvals.manage')
    ) then
      raise exception 'Not allowed to approve for this client' using errcode = '42501';
    end if;
  else
    raise exception 'Version is not awaiting review (status: %)', v_version.status using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_comments, '[]')) <> 'array' then
    raise exception 'p_comments must be an array' using errcode = '22023';
  end if;
  if p_decision = 'changes_requested' and coalesce(nullif(trim(p_summary), ''), '') = '' and jsonb_array_length(p_comments) = 0 then
    raise exception 'Describe the requested changes' using errcode = '22023';
  end if;

  insert into public.client_approvals (content_id, client_id, version_id, stage, decision, comment, decided_by)
  values (v_item.id, v_item.client_id, v_version.id, v_stage, p_decision, nullif(trim(p_summary), ''), auth.uid());

  if p_decision = 'approved' then
    if v_stage = 'internal' then
      update public.content_versions set status = 'client_review', sent_to_client_at = now() where id = v_version.id;
      update public.files set visibility = 'client' where id = v_version.file_id;
      update public.content_items set status = 'client_review', status_changed_at = now() where id = v_item.id;
    else
      update public.content_versions set status = 'approved', decided_at = now() where id = v_version.id;
      select id into v_approved_folder from public.folders where client_id = v_item.client_id and kind = 'approved' and is_system;
      update public.files set folder_id = coalesce(v_approved_folder, folder_id), visibility = 'client' where id = v_version.file_id;
      update public.content_items
      set status = 'approved', status_changed_at = now(), approved_at = now()
      where id = v_item.id;
    end if;
  else
    update public.content_versions set status = 'changes_requested', decided_at = now() where id = v_version.id;

    insert into public.revisions (content_id, client_id, version_id, revision_number, stage, summary, requested_by)
    values (v_item.id, v_item.client_id, v_version.id, v_item.revision_count + 1, v_stage, nullif(trim(p_summary), ''), auth.uid())
    returning * into v_revision;

    for v_comment in select * from jsonb_array_elements(p_comments) loop
      insert into public.revision_comments (revision_id, author_id, timecode_ms, body)
      values (
        v_revision.id, auth.uid(),
        nullif(v_comment ->> 'timecode_ms', '')::integer,
        v_comment ->> 'body'
      );
    end loop;

    update public.content_items
    set status = 'revision', status_changed_at = now(), revision_count = revision_count + 1
    where id = v_item.id;
  end if;

  perform private.audit_event(
    case when p_decision = 'approved' then 'content.approved' else 'content.changes_requested' end,
    'content_items', v_item.id::text, v_item.client_id,
    null, jsonb_build_object('stage', v_stage, 'version', v_version.version_number, 'revision_id', v_revision.id)
  );

  return jsonb_build_object('stage', v_stage, 'decision', p_decision, 'revision_id', v_revision.id);
end;
$$;

grant execute on function
  public.submit_content_version(uuid, uuid, text, public.approval_stage),
  public.review_content_version(uuid, public.approval_decision, text, jsonb)
to authenticated;

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
create trigger audit_revisions after update or delete on public.revisions
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- Row Level Security: clients only see what has been sent to them
-- ---------------------------------------------------------------------------
alter table public.content_versions enable row level security;
alter table public.client_approvals enable row level security;
alter table public.revisions enable row level security;
alter table public.revision_comments enable row level security;

create policy "read versions" on public.content_versions
  for select to authenticated using (
    exists (select 1 from public.content_items c where c.id = content_id)
    and ((select private.is_staff()) or sent_to_client_at is not null)
  );
revoke insert, update, delete on public.content_versions from authenticated;

create policy "read approvals" on public.client_approvals
  for select to authenticated using (
    exists (select 1 from public.content_items c where c.id = content_id)
    and ((select private.is_staff()) or stage = 'client')
  );
revoke insert, update, delete on public.client_approvals from authenticated;

create policy "read revisions" on public.revisions
  for select to authenticated using (
    exists (select 1 from public.content_items c where c.id = content_id)
    and ((select private.is_staff()) or stage = 'client')
  );
create policy "staff progress revisions" on public.revisions
  for update to authenticated
  using (
    (select private.is_staff())
    and (private.can_manage_content(content_id) or content_id = any ((select private.assigned_content_ids())::uuid[]))
  )
  with check (
    (select private.is_staff())
    and (private.can_manage_content(content_id) or content_id = any ((select private.assigned_content_ids())::uuid[]))
  );
revoke insert, delete, update on public.revisions from authenticated;
grant update (status) on public.revisions to authenticated;

create policy "read revision comments" on public.revision_comments
  for select to authenticated using (
    exists (select 1 from public.revisions r where r.id = revision_id)
    and (deleted_at is null or (select private.is_staff()))
  );
create policy "add revision comments" on public.revision_comments
  for insert to authenticated with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.revisions r
      where r.id = revision_id
        and r.status in ('open', 'in_progress')
        and (
          (select private.is_staff())
          or (r.stage = 'client' and private.has_client_permission(r.client_id, 'client.approve'))
        )
    )
  );
create policy "update revision comments" on public.revision_comments
  for update to authenticated
  using (exists (select 1 from public.revisions r where r.id = revision_id))
  with check (exists (select 1 from public.revisions r where r.id = revision_id));
revoke update, delete on public.revision_comments from authenticated;
grant update (body, is_resolved, deleted_at) on public.revision_comments to authenticated;
