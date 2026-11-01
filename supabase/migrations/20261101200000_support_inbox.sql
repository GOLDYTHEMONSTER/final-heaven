-- Support inbox (docs/erp/07-reachout.md, S7 and S8).
--
--   contact_messages.reference   a short human reference (FH-7K2Q), unique per
--                                tenant, made by the server when the form is sent
--   support_replies              what staff wrote back, kept with the thread
--   support_saved_replies        editable templates for common questions
--   email_outbox                 gains kinds support.ack (to the customer, when
--                                the form is sent) and support.reply, and a
--                                reply_id column for the latter
--
-- Replies are sent only through send_support_reply: it stores the reply, queues
-- the email and marks the message replied in one transaction, so a reply can't
-- exist without its email. It is server-only (service role) after the server
-- has checked customers.update; staff read replies through RLS but cannot write
-- them directly. The kind check lists every kind now allowed, including
-- order.delivered and order.refunded from 20261101100000_email_approvals.sql.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.contact_messages
  add column reference text check (reference is null or reference ~ '^FH-[A-Z0-9]{4}$');
create unique index contact_messages_reference_idx on public.contact_messages (tenant_id, reference)
  where reference is not null;

create table public.support_replies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  message_id uuid not null references public.contact_messages (id) on delete cascade,
  body text not null check (length(body) between 1 and 5000),
  author uuid references auth.users (id) on delete set null,
  author_email text check (author_email is null or length(author_email) <= 254),
  created_at timestamptz not null default now()
);
create index support_replies_message_idx on public.support_replies (message_id, created_at);
create index support_replies_tenant_idx on public.support_replies (tenant_id);

create table public.support_saved_replies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- Set when this edits one of the built-in replies (lib/support.ts); null for a reply staff made.
  key text check (key is null or key ~ '^[a-z_]{1,30}$'),
  title text not null check (length(title) between 1 and 80),
  body text not null check (length(body) between 1 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index support_saved_replies_key_idx on public.support_saved_replies (tenant_id, key) where key is not null;
create trigger support_saved_replies_touch before update on public.support_saved_replies
  for each row execute function private.touch_updated_at();

alter table public.support_replies enable row level security;
alter table public.support_saved_replies enable row level security;
revoke all on public.support_replies, public.support_saved_replies from anon, authenticated;
grant select on public.support_replies to authenticated;
grant select, insert, update, delete on public.support_saved_replies to authenticated;
grant all on public.support_replies, public.support_saved_replies to service_role;

create policy "Customer readers see their tenant's replies" on public.support_replies
  for select to authenticated
  using (tenant_id in (select private.permitted_tenants('customers.read')));

create policy "Customer readers see saved replies" on public.support_saved_replies
  for select to authenticated
  using (tenant_id in (select private.permitted_tenants('customers.read')));
create policy "Customer updaters add saved replies" on public.support_saved_replies
  for insert to authenticated
  with check (tenant_id in (select private.permitted_tenants('customers.update')));
create policy "Customer updaters edit saved replies" on public.support_saved_replies
  for update to authenticated
  using (tenant_id in (select private.permitted_tenants('customers.update')))
  with check (tenant_id in (select private.permitted_tenants('customers.update')));
create policy "Customer updaters delete saved replies" on public.support_saved_replies
  for delete to authenticated
  using (tenant_id in (select private.permitted_tenants('customers.update')));

alter table public.email_outbox add column reply_id uuid references public.support_replies (id) on delete cascade;
alter table public.email_outbox drop constraint email_outbox_one_reference;
alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox
  add constraint email_outbox_one_reference check (num_nonnulls(order_id, message_id, subscriber_id, alert_id, reply_id) = 1),
  add constraint email_outbox_kind_check check (kind in (
    'order.paid', 'order.shipped', 'staff.order_paid', 'staff.message', 'subscriber.welcome', 'product.available', 'order.followup',
    'order.delivered', 'order.refunded', 'support.ack', 'support.reply'));

-- A contact message alerts staff and acknowledges the customer.
create or replace function private.email_from_messages() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.enqueue_email(new.tenant_id, 'staff.message', null, new.id);
  perform private.enqueue_email(new.tenant_id, 'support.ack', null, new.id);
  return null;
end $$;

create or replace function public.send_support_reply(p_tenant uuid, p_message uuid, p_author uuid, p_author_email text, p_body text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_reply uuid;
begin
  if not exists (select 1 from public.contact_messages where id = p_message and tenant_id = p_tenant) then
    raise exception 'message not found' using errcode = 'P0002';
  end if;
  insert into public.support_replies (tenant_id, message_id, body, author, author_email)
  values (p_tenant, p_message, p_body, p_author, p_author_email) returning id into v_reply;
  insert into public.email_outbox (tenant_id, kind, reply_id, dedupe_key)
  values (p_tenant, 'support.reply', v_reply, 'support.reply:' || v_reply);
  update public.contact_messages set status = 'replied' where id = p_message;
  -- The stamp trigger records auth.uid(), which is empty for the server: record who wrote it.
  update public.contact_messages set handled_by = p_author, handled_at = now() where id = p_message;
  return v_reply;
end $$;
revoke all on function public.send_support_reply(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.send_support_reply(uuid, uuid, uuid, text, text) to service_role;

revoke all on function private.email_from_messages() from authenticated;

commit;
