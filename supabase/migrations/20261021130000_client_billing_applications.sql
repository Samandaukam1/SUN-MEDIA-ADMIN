-- Client billing (the agreed price for this client only, payment period, next payment date and status) visible
-- only to people with finance rights; the Rahbar edits it. The site application form asks for name, surname,
-- brand, phone, Instagram or Telegram and a budget. Additive: older applications keep their fields.

-- The Rahbar manages client subscriptions and billing.
insert into public.role_permissions (role_id, permission_key)
select r.id, 'subscriptions.manage' from public.roles r where r.key = 'owner'
on conflict (role_id, permission_key) do nothing;

create table public.client_billing (
  client_id uuid primary key references public.clients (id) on delete cascade,
  agreed_price numeric(14, 2) check (agreed_price >= 0),
  currency text not null default 'UZS' check (currency in ('UZS', 'USD')),
  billing_period text not null default 'monthly' check (billing_period in ('monthly', 'quarterly', 'yearly', 'one_time')),
  next_payment_on date,
  next_payment_amount numeric(14, 2) check (next_payment_amount >= 0),
  payment_status text not null default 'pending' check (payment_status in ('paid', 'pending', 'partial')),
  last_paid_on date,
  note text check (char_length(note) <= 1000),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger client_billing_updated_at before update on public.client_billing for each row execute function private.set_updated_at();
create trigger audit_client_billing after insert or update or delete on public.client_billing
  for each row execute function private.audit_row('client_id');

create function private.client_billing_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger client_billing_10_stamp before insert or update on public.client_billing for each row execute function private.client_billing_stamp();

alter table public.client_billing enable row level security;
revoke all on public.client_billing from anon, authenticated;
grant select, insert, update on public.client_billing to authenticated;
create policy "finance reads billing" on public.client_billing for select to authenticated
  using ((select private.has_permission('finance.read')) or (select private.has_permission('subscriptions.manage')));
create policy "managers add billing" on public.client_billing for insert to authenticated
  with check ((select private.has_permission('subscriptions.manage')));
create policy "managers edit billing" on public.client_billing for update to authenticated
  using ((select private.has_permission('subscriptions.manage'))) with check ((select private.has_permission('subscriptions.manage')));

-- ---------------------------------------------------------------------------------------------------------------
-- Site applications: the new form.
-- ---------------------------------------------------------------------------------------------------------------
alter table public.site_applications
  add column first_name text check (char_length(first_name) <= 60),
  add column last_name text check (char_length(last_name) <= 60),
  add column instagram text check (char_length(instagram) <= 60),
  add column telegram text check (char_length(telegram) <= 60),
  add column budget_amount numeric(14, 2) check (budget_amount >= 0),
  add column budget_label text check (char_length(budget_label) <= 120);

create function public.site_apply(
  p_first_name text,
  p_last_name text,
  p_brand text,
  p_phone text,
  p_instagram text,
  p_telegram text,
  p_budget_amount numeric,
  p_budget_label text,
  p_source_path text,
  p_fingerprint text,
  p_user_agent text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
  v_brand text := btrim(coalesce(p_brand, ''));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  v_ig text := nullif(regexp_replace(btrim(coalesce(p_instagram, '')), '^@', ''), '');
  v_tg text := nullif(regexp_replace(btrim(coalesce(p_telegram, '')), '^@', ''), '');
begin
  if p_fingerprint is null or char_length(p_fingerprint) not between 16 and 128 then
    raise exception 'Invalid fingerprint' using errcode = '22023';
  end if;
  if char_length(v_first) not between 2 and 60 or char_length(v_last) not between 2 and 60 or char_length(v_brand) not between 1 and 120
     or v_phone !~ '^\+[0-9]{9,15}$' or (v_ig is null and v_tg is null) or coalesce(p_budget_amount, 0) <= 0 then
    raise exception 'APPLICATION_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('site_application:' || p_fingerprint, 0));
  if (select count(*) from public.site_applications a where a.fingerprint = p_fingerprint and a.created_at > now() - interval '10 minutes') >= 3
     or (select count(*) from public.site_applications a where a.created_at > now() - interval '1 hour') >= 120 then
    raise exception 'SITE_RATE_LIMITED' using errcode = 'P0001';
  end if;

  insert into public.site_applications (full_name, first_name, last_name, phone, company, instagram, telegram, budget_amount, budget_label,
                                        link_url, service, message, source_path, fingerprint, user_agent)
  values (v_first || ' ' || v_last, v_first, v_last, v_phone, v_brand, left(v_ig, 60), left(v_tg, 60), p_budget_amount,
          nullif(left(btrim(coalesce(p_budget_label, '')), 120), ''),
          case when v_ig is not null then 'https://instagram.com/' || v_ig when v_tg is not null then 'https://t.me/' || v_tg end,
          '', '', coalesce(nullif(p_source_path, ''), '/'), p_fingerprint, left(coalesce(p_user_agent, ''), 300))
  returning id into v_id;

  perform private.notify(
    private.users_with_permission('site.manage') || private.leadership_ids(),
    'site.application',
    'Saytdan yangi ariza: ' || v_brand,
    v_first || ' ' || v_last || ' · ' || v_phone || ' · byudjet ' || to_char(p_budget_amount, 'FM999G999G999G999') || ' so‘m',
    jsonb_build_object('application_id', v_id, 'href', '/site/applications'),
    'site_applications', v_id, null, 'high'
  );
  return v_id;
end;
$$;
revoke all on function public.site_apply(text, text, text, text, text, text, numeric, text, text, text, text) from public, anon, authenticated;
grant execute on function public.site_apply(text, text, text, text, text, text, numeric, text, text, text, text) to service_role;
