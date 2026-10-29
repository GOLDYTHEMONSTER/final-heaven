-- Resend webhooks: delivery events, and bounce / spam-complaint protection.
--
--   email_events        what Resend tells us happened to each email (delivered,
--                       bounced, complained, and opened / clicked when those
--                       are switched on in Resend). One row per webhook
--                       delivery, keyed by Svix's message id, so Resend
--                       retrying a delivery is a no-op. The payload is trimmed
--                       by the server (no subject, no body).
--   email_suppressions  addresses we must not email again: a hard bounce
--                       keeps hurting our sender reputation, a spam complaint
--                       is the recipient saying no. Every send path checks it.
--
-- record_email_event does the whole job in one transaction, so a replayed
-- event can never half-apply: it stores the event and, for a bounce or
-- complaint, suppresses the address and unsubscribes it from every list.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.email_suppressions (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email text not null check (email = lower(email) and length(email) between 3 and 254),
  reason text not null check (reason in ('bounced', 'complained')),
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create table public.email_events (
  id bigint generated always as identity primary key,
  svix_id text not null unique check (length(svix_id) <= 100),
  provider_message_id text check (provider_message_id is null or length(provider_message_id) <= 100),
  type text not null check (length(type) <= 60),
  created_at timestamptz not null default now(),
  payload jsonb not null default '{}' check (pg_column_size(payload) <= 4000)
);
create index email_events_message_idx on public.email_events (provider_message_id, type);
create index email_events_created_idx on public.email_events (created_at);

alter table public.email_suppressions enable row level security;
alter table public.email_events enable row level security;
revoke all on public.email_suppressions, public.email_events from anon, authenticated;
grant all on public.email_suppressions, public.email_events to service_role;

-- Stores one event; returns false when it was already stored (a replay).
-- p_reason is 'bounced' or 'complained' for events that suppress p_emails.
-- The tenant is wherever we know the address from: its sign-ups, orders and
-- checkouts, or the email's own record.
create or replace function public.record_email_event(
  p_svix_id text, p_message_id text, p_type text, p_at timestamptz, p_payload jsonb,
  p_emails text[], p_reason text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_rows int;
  v_email text;
begin
  insert into public.email_events (svix_id, provider_message_id, type, created_at, payload)
  values (p_svix_id, p_message_id, p_type, coalesce(p_at, now()), coalesce(p_payload, '{}'))
  on conflict (svix_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return false; end if;

  if p_reason in ('bounced', 'complained') then
    foreach v_email in array coalesce(p_emails, '{}') loop
      v_email := lower(btrim(v_email));
      continue when v_email = '' or length(v_email) > 254;
      insert into public.email_suppressions (tenant_id, email, reason)
      select t.tenant_id, v_email, p_reason
        from (
          select tenant_id from public.newsletter_subscribers where lower(email) = v_email
          union select tenant_id from public.orders where lower(email) = v_email
          union select tenant_id from public.checkouts where lower(email) = v_email
          union select tenant_id from public.email_campaign_recipients where provider_message_id = p_message_id
          union select tenant_id from public.email_outbox where provider_message_id = p_message_id
        ) t
      on conflict (tenant_id, email) do update set reason = excluded.reason where excluded.reason = 'complained';

      update public.newsletter_subscribers set unsubscribed_at = now()
       where lower(email) = v_email and unsubscribed_at is null;
    end loop;
  end if;
  return true;
end $$;
revoke all on function public.record_email_event(text, text, text, timestamptz, jsonb, text[], text) from public, anon, authenticated;
grant execute on function public.record_email_event(text, text, text, timestamptz, jsonb, text[], text) to service_role;

commit;
