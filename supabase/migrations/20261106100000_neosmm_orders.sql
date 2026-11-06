-- SUN MEDIA — "Smm Api": the owner's NeoSMM orders and catalogue copies, in the app's own database. Additive.
--   * neosmm_orders: one row per submission; its id is the submission token, written before the provider is called,
--     so one token can never be sent twice. Provider numbers are unique per (provider, kind): SMM, gift and donat
--     order numbers overlap. The tariff, its quantity basis and the estimate are kept as they were at submission
--     (later catalogue changes do not rewrite history); the provider's actual charge is stored beside them.
--   * neosmm_catalog_cache: the last good copy of each catalogue, shown as old data while the provider is down.
--   * Row-level security on, no policies, no grants to anon / authenticated: nobody reaches these through the API.
--     Only the server touches them, after checking the signed-in person is the configured owner (NEOSMM_OWNER_USER_ID).

create table public.neosmm_orders (
  id uuid primary key,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  provider text not null default 'neosmm' check (provider = 'neosmm'),
  kind text not null check (kind in ('smm', 'gift', 'donat')),
  state text not null default 'submitting' check (state in ('submitting', 'accepted', 'rejected', 'unknown', 'not_placed')),
  provider_order_id bigint check (provider_order_id > 0),
  item_id bigint not null,
  item_name text not null check (char_length(item_name) <= 500),
  item_category text check (char_length(item_category) <= 200),
  item_type text check (char_length(item_type) <= 80),
  price text not null check (price ~ '^\d+(\.\d+)?$'),
  price_unit integer check (price_unit > 0),
  currency text not null default 'UZS' check (currency ~ '^[A-Z]{3}$'),
  target text not null check (char_length(target) <= 500),
  params jsonb not null default '{}',
  quantity integer check (quantity > 0),
  estimate text check (estimate ~ '^\d+(\.\d+)?$'),
  charge text check (charge ~ '^-?\d+(\.\d+)?$'),
  can_cancel boolean not null default false,
  can_refill boolean not null default false,
  status text check (char_length(status) <= 80),
  remains text check (char_length(remains) <= 40),
  start_count text check (char_length(start_count) <= 40),
  code text check (char_length(code) <= 500),
  cancel_requested_at timestamptz,
  refill_id bigint check (refill_id > 0),
  refill_status text check (char_length(refill_status) <= 80),
  error text check (char_length(error) <= 1000),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  accepted_at timestamptz,
  checked_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (provider, kind, provider_order_id)
);

create index neosmm_orders_owner_idx on public.neosmm_orders (owner_id, created_at desc);
create index neosmm_orders_open_idx on public.neosmm_orders (owner_id, kind) where state = 'accepted';

create trigger neosmm_orders_updated_at
  before update on public.neosmm_orders
  for each row execute function private.set_updated_at();

create table public.neosmm_catalog_cache (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('services', 'donat_services', 'gifts')),
  data jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (owner_id, kind)
);

alter table public.neosmm_orders enable row level security;
alter table public.neosmm_catalog_cache enable row level security;
revoke all on public.neosmm_orders from public, anon, authenticated;
revoke all on public.neosmm_catalog_cache from public, anon, authenticated;
grant all on public.neosmm_orders to service_role;
grant all on public.neosmm_catalog_cache to service_role;
