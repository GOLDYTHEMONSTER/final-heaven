-- Launch time: checkout opens on the launch day at this time, not at midnight.
--
-- payments_open_on stays the launch DAY (early access codes run 30 days from
-- it, the launch email and reports read it). payments_open_time is the store-time
-- clock time it opens that day ("21:00"); null keeps midnight. lib/catalog
-- paymentsState reads both.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.stores add column payments_open_time text
  check (payments_open_time is null or payments_open_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
comment on column public.stores.payments_open_time is
  'Launch time on payments_open_on, store time zone, HH:MM. Null = midnight.';

-- Staff who can set the launch day can set its time (the same rule as payments_open_on).
grant update (payments_open_time) on public.stores to authenticated;

commit;
