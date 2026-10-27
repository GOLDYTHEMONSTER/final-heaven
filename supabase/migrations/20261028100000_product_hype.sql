-- Hype: anonymous community scores for products (lib/hype.ts, app/api/hype).
--
--   hype_settings   per store: Hype on or off (off until staff switch it on)
--   hype_events     one accepted hype per anonymous visitor per product; the
--                   visitor is a keyed hash of a random cookie id, never an
--                   account, an IP or a device fingerprint
--   product_hype    each product's current score and rank, its peak, and when
--                   it took its rank (for the rank rules in lib/hype.ts)
--
-- Nothing here is readable with the public key: the storefront reads scores
-- through /api/hype, which only answers while Hype is on. Staff with
-- analytics.read see scores; settings.manage switches Hype on or off.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.hype_settings (
  store_id uuid primary key references public.stores (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  enabled boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, store_id) references public.stores (tenant_id, id)
);

create table public.hype_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  product_id text not null,
  visitor_hash text not null check (visitor_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (product_id, visitor_hash),
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade
);
create index hype_events_product_time_idx on public.hype_events (product_id, created_at desc);

create table public.product_hype (
  product_id text primary key,
  tenant_id uuid not null,
  score numeric(5,1) not null default 0 check (score between 0 and 100),
  rank text not null default 'unseen' check (rank in ('unseen', 'emerging', 'buzzing', 'trending', 'elite', 'iconic', 'legendary')),
  early boolean not null default false,
  hypes integer not null default 0 check (hypes >= 0),
  hypes_7d integer not null default 0 check (hypes_7d >= 0),
  peak_score numeric(5,1) not null default 0,
  peak_rank text not null default 'unseen',
  rank_since timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade
);
create index product_hype_tenant_idx on public.product_hype (tenant_id, score desc);

-- Records a hype if Hype is on for the store, the product is on sale there and
-- this visitor hasn't hyped it before. Returns whether it was accepted and the
-- counts the score is worked out from (with the product's current rank).
create or replace function public.record_hype(p_store uuid, p_product text, p_visitor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid;
  v_accepted boolean;
  v_row public.product_hype;
begin
  if not exists (select 1 from public.hype_settings where store_id = p_store and enabled) then
    return jsonb_build_object('status', 'off');
  end if;
  select tenant_id into v_tenant from public.products where id = p_product and store_id = p_store and status = 'active';
  if v_tenant is null then return jsonb_build_object('status', 'unknown_product'); end if;
  insert into public.hype_events (tenant_id, product_id, visitor_hash) values (v_tenant, p_product, p_visitor)
  on conflict (product_id, visitor_hash) do nothing;
  get diagnostics v_accepted = row_count;
  select * into v_row from public.product_hype where product_id = p_product;
  return jsonb_build_object(
    'status', case when v_accepted then 'accepted' else 'duplicate' end,
    'tenant_id', v_tenant,
    'total', (select count(*) from public.hype_events where product_id = p_product),
    'last7', (select count(*) from public.hype_events where product_id = p_product and created_at > now() - interval '7 days'),
    'rank', coalesce(v_row.rank, 'unseen'), 'rank_since', v_row.rank_since);
end $$;

-- Saves a product's score and rank as lib/hype.ts worked them out; keeps the peak and when the rank changed.
create or replace function public.save_hype(p_product text, p_tenant uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.product_hype as h (product_id, tenant_id, score, rank, early, hypes, hypes_7d, peak_score, peak_rank, rank_since, updated_at)
  values (p_product, p_tenant, (p ->> 'score')::numeric, p ->> 'rank', (p ->> 'early')::boolean, (p ->> 'total')::int, (p ->> 'last7')::int,
          (p ->> 'score')::numeric, p ->> 'rank', now(), now())
  on conflict (product_id) do update set
    score = excluded.score, rank = excluded.rank, early = excluded.early, hypes = excluded.hypes, hypes_7d = excluded.hypes_7d,
    peak_score = greatest(h.peak_score, excluded.score),
    peak_rank = case when excluded.score > h.peak_score then excluded.rank else h.peak_rank end,
    rank_since = case when h.rank is distinct from excluded.rank then now() else h.rank_since end,
    updated_at = now();
end $$;

-- Counts for every product with hypes, for the daily refresh (momentum fades as hypes age).
create or replace function public.hype_counts() returns table (product_id text, tenant_id uuid, total bigint, last7 bigint, rank text, rank_since timestamptz)
language sql stable security definer set search_path = '' as $$
  select e.product_id, e.tenant_id, count(*), count(*) filter (where e.created_at > now() - interval '7 days'), h.rank, h.rank_since
    from public.hype_events e left join public.product_hype h on h.product_id = e.product_id
   group by e.product_id, e.tenant_id, h.rank, h.rank_since
$$;

alter table public.hype_settings enable row level security;
alter table public.hype_events enable row level security;
alter table public.product_hype enable row level security;
revoke all on public.hype_settings, public.hype_events, public.product_hype from anon, authenticated;
grant all on public.hype_settings, public.hype_events, public.product_hype to service_role;
grant select, insert, update on public.hype_settings to authenticated;
grant select on public.product_hype to authenticated;

create policy "Staff read the Hype switch" on public.hype_settings for select to authenticated
  using (tenant_id in (select private.permitted_tenants('settings.manage')) or tenant_id in (select private.permitted_tenants('analytics.read')));
create policy "Settings managers turn Hype on" on public.hype_settings for insert to authenticated
  with check (tenant_id in (select private.permitted_tenants('settings.manage')));
create policy "Settings managers switch Hype" on public.hype_settings for update to authenticated
  using (tenant_id in (select private.permitted_tenants('settings.manage')))
  with check (tenant_id in (select private.permitted_tenants('settings.manage')));
create policy "Analytics readers see hype scores" on public.product_hype for select to authenticated
  using (tenant_id in (select private.permitted_tenants('analytics.read')));

revoke all on function public.record_hype(uuid, text, text), public.save_hype(text, uuid, jsonb), public.hype_counts() from public, anon, authenticated;
grant execute on function public.record_hype(uuid, text, text), public.save_hype(text, uuid, jsonb), public.hype_counts() to service_role;

commit;
