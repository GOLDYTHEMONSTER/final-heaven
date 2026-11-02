-- Fix: ticket tiers couldn't be edited at all.
--
-- 20261102100000_event_tickets.sql gave ticket_types the shared
-- private.prevent_tenant_change() trigger, which also compares store_id, a
-- column ticket_types doesn't have, so every UPDATE failed. Tiers get their own
-- guard instead: a tier stays in its tenant and its event (moving it would
-- carry tickets already sold to another event). Name, price, capacity and
-- on-sale still change as before.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

drop trigger ticket_types_tenant_immutable on public.ticket_types;

create or replace function private.ticket_type_stays_put() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.tenant_id is distinct from old.tenant_id or new.event_id is distinct from old.event_id then
    raise exception 'a ticket tier can''t move to another event' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.ticket_type_stays_put() from public, anon;

create trigger ticket_types_stay_put before update on public.ticket_types
  for each row execute function private.ticket_type_stays_put();

commit;
