-- "How's it fitting?" email, three days after an order is delivered.
--
-- orders_due_followup finds delivered orders whose delivery was recorded
-- (order_events, the record of status changes) between p_min_days and
-- p_max_days ago and that haven't been followed up. The upper bound matters:
-- the first run must not email everyone delivered months ago. The daily job
-- queues each through queue_email_capped (dedupe key order.followup:<order>,
-- so one per order, and a daily cap).
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox
  add constraint email_outbox_kind_check check (kind in ('order.paid', 'order.shipped', 'staff.order_paid', 'staff.message', 'subscriber.welcome', 'product.available', 'order.followup'));

create or replace function public.orders_due_followup(p_tenant uuid, p_min_days int, p_max_days int, p_limit int)
returns table (order_id uuid) language sql stable security invoker set search_path = '' as $$
  select o.id
    from public.orders o
    cross join lateral (
      select max(e.occurred_at) as at from public.order_events e
       where e.order_id = o.id and e.event_type = 'status_changed' and e.to_value = 'delivered') d
   where o.tenant_id = p_tenant and o.status = 'delivered'
     and d.at <= now() - make_interval(days => p_min_days)
     and d.at > now() - make_interval(days => p_max_days)
     and not exists (select 1 from public.email_outbox x where x.dedupe_key = 'order.followup:' || o.id)
   order by d.at
   limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;
revoke all on function public.orders_due_followup(uuid, int, int, int) from public, anon, authenticated;
grant execute on function public.orders_due_followup(uuid, int, int, int) to service_role;

commit;
