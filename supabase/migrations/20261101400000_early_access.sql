-- Early access offer (docs/erp/07-reachout.md, "Early access"). Additive.
--
-- Everyone who subscribes before checkout opens gets a personal code: 25% off
-- their first order, plus 2 months of membership free when membership opens.
-- Each friend they invite adds 5% when the friend subscribes and 5% more when
-- the friend's first order is paid, up to 35% in all. The code works only for
-- its owner's email, once, until 30 days after launch day (lib/early-access.ts
-- holds the numbers; the checkout works the percent out from the credits).
--
--   promo_codes.subscriber_id            a personal code: only that subscriber's email can use it
--   newsletter_subscribers.invited_by    who invited them (set once, on sign-up)
--   newsletter_subscribers.free_membership_months
--   invite_credits                       one row per friend per step (subscribed, paid)
--   ensure_early_access(subscriber)      makes the personal code if it's missing
--   record_invite(friend, code)          credits the inviter when a new friend subscribes
--   credit_paid_invites(tenant)          credits inviters whose friends have paid (daily job)
--
-- Backfill: everyone subscribed now gets a code, since checkout hasn't opened.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.promo_codes
  add column subscriber_id uuid references public.newsletter_subscribers (id) on delete cascade;
create unique index promo_codes_subscriber_idx on public.promo_codes (subscriber_id) where subscriber_id is not null;

alter table public.newsletter_subscribers
  add column invited_by uuid references public.newsletter_subscribers (id) on delete set null,
  add column free_membership_months smallint not null default 0 check (free_membership_months between 0 and 12),
  add constraint newsletter_subscribers_not_self_invited check (invited_by is distinct from id);

create table public.invite_credits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  inviter_id uuid not null references public.newsletter_subscribers (id) on delete cascade,
  friend_id uuid not null references public.newsletter_subscribers (id) on delete cascade,
  step text not null check (step in ('subscribed', 'paid')),
  order_id uuid references public.orders (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (friend_id, step),
  check (inviter_id <> friend_id)
);
create index invite_credits_inviter_idx on public.invite_credits (inviter_id);

alter table public.invite_credits enable row level security;
revoke all on public.invite_credits from anon, authenticated;
grant select on public.invite_credits to authenticated;
grant all on public.invite_credits to service_role;
create policy "Customer readers see invite credits" on public.invite_credits
  for select to authenticated
  using (tenant_id in (select private.permitted_tenants('customers.read')));

-- The personal code for a subscriber, made if missing. FH + 6 characters.
create or replace function public.ensure_early_access(p_subscriber uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_sub record;
  v_code text;
begin
  select id, tenant_id, store_id into v_sub from public.newsletter_subscribers where id = p_subscriber;
  if v_sub.id is null then return null; end if;
  select code into v_code from public.promo_codes where subscriber_id = p_subscriber;
  if v_code is not null then return v_code; end if;
  loop
    v_code := 'FH' || upper(substr(translate(md5(gen_random_uuid()::text), '01', 'XY'), 1, 6));
    begin
      insert into public.promo_codes (tenant_id, code, description, kind, value, min_subtotal, max_uses, once_per_customer, active, subscriber_id)
      values (v_sub.tenant_id, v_code, 'Early access: your first order', 'percent', 25, 0, 1, true, true, p_subscriber);
      exit;
    exception when unique_violation then
      -- A code clash: try another. The subscriber already having one means another call won.
      select code into v_code from public.promo_codes where subscriber_id = p_subscriber;
      if v_code is not null then return v_code; end if;
    end;
  end loop;
  update public.newsletter_subscribers set free_membership_months = greatest(free_membership_months, 2) where id = p_subscriber;
  return v_code;
end $$;

-- A new subscriber who came with someone's code: remember who invited them and credit the inviter once.
create or replace function public.record_invite(p_friend uuid, p_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_friend record;
  v_inviter record;
begin
  select id, tenant_id, email, invited_by into v_friend from public.newsletter_subscribers where id = p_friend;
  if v_friend.id is null or v_friend.invited_by is not null then return false; end if;
  select s.id, s.email into v_inviter
    from public.promo_codes c join public.newsletter_subscribers s on s.id = c.subscriber_id
   where c.tenant_id = v_friend.tenant_id and c.code = upper(p_code);
  if v_inviter.id is null or v_inviter.id = v_friend.id or lower(v_inviter.email) = lower(v_friend.email) then return false; end if;
  update public.newsletter_subscribers set invited_by = v_inviter.id where id = v_friend.id;
  insert into public.invite_credits (tenant_id, inviter_id, friend_id, step)
  values (v_friend.tenant_id, v_inviter.id, v_friend.id, 'subscribed') on conflict (friend_id, step) do nothing;
  return true;
end $$;

-- Invited friends whose first paid order has come in: one more credit for the inviter each. Returns how many were added.
create or replace function public.credit_paid_invites(p_tenant uuid) returns integer
language sql security definer set search_path = '' as $$
  with firsts as (
    select distinct on (s.id) s.id as friend_id, s.invited_by as inviter_id, o.id as order_id
      from public.newsletter_subscribers s
      join public.orders o on o.tenant_id = s.tenant_id and lower(o.email) = lower(s.email)
     where s.tenant_id = p_tenant and s.invited_by is not null
       and o.payment_status in ('paid', 'partially_refunded') and o.status <> 'cancelled'
     order by s.id, o.created_at
  ), added as (
    insert into public.invite_credits (tenant_id, inviter_id, friend_id, step, order_id)
    select p_tenant, inviter_id, friend_id, 'paid', order_id from firsts
    on conflict (friend_id, step) do nothing
    returning 1
  )
  select count(*)::integer from added
$$;

revoke all on function public.ensure_early_access(uuid), public.record_invite(uuid, text), public.credit_paid_invites(uuid) from public, anon, authenticated;
grant execute on function public.ensure_early_access(uuid), public.record_invite(uuid, text), public.credit_paid_invites(uuid) to service_role;

-- Backfill: checkout isn't open yet, so everyone on a list now is early.
select public.ensure_early_access(s.id)
  from public.newsletter_subscribers s
  join public.stores st on st.id = s.store_id
 where s.unsubscribed_at is null and s.consented_at is not null
   and (st.payments_open_on is null or st.payments_open_on > (now() at time zone 'Africa/Lagos')::date);

commit;
