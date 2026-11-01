-- Owner approval for marketing email, the send budget, and two service emails.
--
--   email_batches              one held marketing email: its copy, the trigger
--                              that made it, who qualified, and the approval
--                              stamp (who, when). Nothing in a batch is sent
--                              until it is approved; editing the copy of an
--                              approved batch puts it back on hold.
--   email_batch_recipients     who is in it, one row per subscriber (the key
--                              and Resend's idempotency key mean nobody gets
--                              the same batch twice)
--   email_template_approvals   the owner's OK for an automatic template at a
--                              given copy version (the sign-up welcome), so
--                              new sign-ups are welcomed without waiting once
--                              the words are approved
--   email_usage(tenant)        what was sent today (UTC) and this month, for
--                              Resend's free plan (100 a day, 3,000 a month)
--
-- Staff with marketing.send read batches and may approve, skip or edit them
-- through RLS (an approval must carry the approver's own id). Recipients,
-- sending and every status after approval are the server's, with the service key.
--
-- Also: order.delivered and order.refunded join the outbox kinds, queued by the
-- orders trigger whichever path moves the order (admin, webhook, SQL).
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.email_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  trigger text not null check (trigger in (
    'welcome_backfill', 'welcome', 'nurture_3d', 'nurture_7d', 'launch',
    'rt_viewed', 'rt_low_stock', 'review_ask', 'winback_120', 'winback_180')),
  list text check (list is null or list in ('launch_waitlist', 'membership_waitlist', 'footer')),
  reason text not null default '' check (length(reason) <= 500),
  subject text not null default '' check (length(subject) <= 150),
  preheader text not null default '' check (length(preheader) <= 150),
  heading text not null default '' check (length(heading) <= 120),
  body text not null default '' check (length(body) <= 5000),
  cta_label text check (cta_label is null or length(cta_label) between 1 and 40),
  cta_url text check (cta_url is null or (length(cta_url) <= 500 and cta_url ~ '^(https://|/)')),
  product_ids jsonb not null default '[]' check (jsonb_typeof(product_ids) = 'array' and jsonb_array_length(product_ids) <= 6),
  status text not null default 'held' check (status in ('held', 'approved', 'sending', 'sent', 'skipped')),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  check (status not in ('approved', 'sending', 'sent') or approved_at is not null)
);
create index email_batches_tenant_idx on public.email_batches (tenant_id, created_at desc);
-- A trigger adds people to its one held batch (per list) until the owner decides.
create unique index email_batches_one_held_idx on public.email_batches (tenant_id, trigger, coalesce(list, '')) where status = 'held';
create index email_batches_drain_idx on public.email_batches (approved_at) where status in ('approved', 'sending');
create trigger email_batches_touch before update on public.email_batches
  for each row execute function private.touch_updated_at();

-- Changing the words of an approved batch withdraws the approval; a batch that
-- has started going out, or was skipped, can't be reworded at all.
create or replace function private.email_batch_copy_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.subject, new.preheader, new.heading, new.body, new.cta_label, new.cta_url, new.product_ids)
     is distinct from (old.subject, old.preheader, old.heading, old.body, old.cta_label, old.cta_url, old.product_ids) then
    if old.status in ('sending', 'sent', 'skipped') then
      raise exception 'a batch that is sending, sent or skipped can''t be edited' using errcode = '42501';
    end if;
    if old.status = 'approved' then
      new.status := 'held';
      new.approved_by := null;
      new.approved_at := null;
    end if;
  end if;
  return new;
end $$;
create trigger email_batches_copy_guard before update on public.email_batches
  for each row execute function private.email_batch_copy_guard();

create table public.email_batch_recipients (
  batch_id uuid not null references public.email_batches (id) on delete cascade,
  subscriber_id uuid not null references public.newsletter_subscribers (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email text not null,
  trigger text not null,
  product_id text, -- the piece this person's email is about (retargeting, review ask)
  why text check (why is null or length(why) <= 300),
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  provider_message_id text,
  last_error text check (last_error is null or length(last_error) <= 500),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (batch_id, subscriber_id)
);
create index email_batch_recipients_queued_idx on public.email_batch_recipients (batch_id) where status = 'queued';
create index email_batch_recipients_subscriber_idx on public.email_batch_recipients (tenant_id, subscriber_id, created_at desc);
create index email_batch_recipients_sent_idx on public.email_batch_recipients (tenant_id, sent_at) where status = 'sent';

create table public.email_template_approvals (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  template text not null check (length(template) between 1 and 80),
  copy_hash text not null check (length(copy_hash) between 8 and 128),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz not null default now(),
  primary key (tenant_id, template, copy_hash)
);

alter table public.email_batches enable row level security;
alter table public.email_batch_recipients enable row level security;
alter table public.email_template_approvals enable row level security;
revoke all on public.email_batches, public.email_batch_recipients, public.email_template_approvals from anon, authenticated;
grant select, update on public.email_batches to authenticated;
grant select on public.email_batch_recipients to authenticated;
grant select, insert on public.email_template_approvals to authenticated;
grant all on public.email_batches, public.email_batch_recipients, public.email_template_approvals to service_role;

create policy "Marketers read batches" on public.email_batches
  for select to authenticated
  using (tenant_id in (select private.permitted_tenants('marketing.send')));
-- Staff move a waiting batch to approved or skipped (approval carries their own
-- id, so it can't be signed in someone else's name) or reword it. Sending and
-- sent are the server's.
create policy "Marketers decide on batches" on public.email_batches
  for update to authenticated
  using (tenant_id in (select private.permitted_tenants('marketing.send')) and status in ('held', 'approved'))
  with check (tenant_id in (select private.permitted_tenants('marketing.send'))
              and status in ('held', 'approved', 'skipped')
              and (status <> 'approved' or (approved_by = auth.uid() and approved_at is not null)));
create policy "Marketers read batch recipients" on public.email_batch_recipients
  for select to authenticated
  using (tenant_id in (select private.permitted_tenants('marketing.send')));
create policy "Marketers read template approvals" on public.email_template_approvals
  for select to authenticated
  using (tenant_id in (select private.permitted_tenants('marketing.send')));
create policy "Marketers approve templates" on public.email_template_approvals
  for insert to authenticated
  with check (tenant_id in (select private.permitted_tenants('marketing.send')) and approved_by = auth.uid());

-- What went out today (UTC) and this calendar month. Marketing is everything the
-- owner could have held: campaigns, held batches and the sign-up welcome;
-- service is the rest of the outbox (receipts, shipping notices, alerts that
-- were asked for). The staff digest is sent outside the outbox and isn't counted.
create or replace function public.email_usage(p_tenant uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with sends as (
    select sent_at, (kind = 'subscriber.welcome') as marketing from public.email_outbox
     where tenant_id = p_tenant and status = 'sent' and sent_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
    union all
    select sent_at, true from public.email_campaign_recipients
     where tenant_id = p_tenant and status = 'sent' and sent_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
    union all
    select sent_at, true from public.email_batch_recipients
     where tenant_id = p_tenant and status = 'sent' and sent_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
  ), day_start as (select date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' as at)
  select jsonb_build_object(
    'today',   jsonb_build_object('total', count(*) filter (where s.sent_at >= d.at), 'marketing', count(*) filter (where s.sent_at >= d.at and s.marketing)),
    'month',   jsonb_build_object('total', count(*), 'marketing', count(*) filter (where s.marketing)))
  from sends s cross join day_start d
$$;
revoke all on function public.email_usage(uuid) from public, anon, authenticated;
grant execute on function public.email_usage(uuid) to service_role;

-- Delivered and refunded orders email the customer, on top of paid and shipped.
alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox
  add constraint email_outbox_kind_check check (kind in (
    'order.paid', 'order.shipped', 'staff.order_paid', 'staff.message', 'subscriber.welcome', 'product.available', 'order.followup',
    'order.delivered', 'order.refunded'));

create or replace function private.email_from_orders() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    perform private.enqueue_email(new.tenant_id, 'staff.order_paid', new.id, null);
    if new.status <> 'cancelled' then
      perform private.enqueue_email(new.tenant_id, 'order.paid', new.id, null);
    end if;
  end if;
  if new.status = 'shipped' and old.status is distinct from 'shipped' then
    perform private.enqueue_email(new.tenant_id, 'order.shipped', new.id, null);
  end if;
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    perform private.enqueue_email(new.tenant_id, 'order.delivered', new.id, null);
  end if;
  -- One email for each refund state an order reaches (part, then the rest).
  if new.payment_status in ('refunded', 'partially_refunded') and old.payment_status is distinct from new.payment_status then
    insert into public.email_outbox (tenant_id, kind, order_id, dedupe_key)
    values (new.tenant_id, 'order.refunded', new.id, 'order.refunded:' || new.id || ':' || new.payment_status)
    on conflict (dedupe_key) do nothing;
  end if;
  return null;
end $$;

commit;
