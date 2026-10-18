-- Contact form inbox: customers reach the store without a published email or
-- phone. Messages are written by the server (service role) after validation and
-- read by staff with customers.read; status changes need customers.update.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  store_id uuid not null,
  created_at timestamptz not null default now(),
  name text not null check (length(name) between 1 and 120),
  email text not null check (length(email) between 3 and 254),
  order_number text check (order_number is null or order_number ~ '^[A-Za-z0-9-]{4,40}$'),
  topic text not null check (topic in ('order', 'return', 'privacy', 'other')),
  message text not null check (length(message) between 10 and 5000),
  status text not null default 'open' check (status in ('open', 'replied', 'closed')),
  handled_by uuid,
  handled_at timestamptz,
  foreign key (tenant_id, store_id) references public.stores (tenant_id, id)
);
create index contact_messages_tenant_status_idx on public.contact_messages (tenant_id, status, created_at desc);

-- Staff can change status only; the message itself is never edited.
create or replace function private.stamp_contact_message() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    new.handled_by := (select auth.uid());
    new.handled_at := now();
  end if;
  return new;
end $$;
create trigger contact_messages_stamp before update on public.contact_messages
  for each row execute function private.stamp_contact_message();

alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from anon, authenticated;
grant select on public.contact_messages to authenticated;
grant update (status) on public.contact_messages to authenticated;
grant all on public.contact_messages to service_role;

create policy "Customer readers see their tenant's messages" on public.contact_messages
  for select to authenticated
  using (tenant_id in (select private.permitted_tenants('customers.read')));
create policy "Customer updaters change message status" on public.contact_messages
  for update to authenticated
  using (tenant_id in (select private.permitted_tenants('customers.update')))
  with check (tenant_id in (select private.permitted_tenants('customers.update')));

revoke all on function private.stamp_contact_message() from public, anon, authenticated;

commit;
