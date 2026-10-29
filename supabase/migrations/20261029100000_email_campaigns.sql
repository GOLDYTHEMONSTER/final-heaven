-- Email campaigns to the store's subscribers (Studio → Campaigns).
--
--   email_campaigns            one email: subject, words, an optional button
--                              and product cards, and which lists it goes to
--   email_campaign_recipients  who it went to, one row per subscriber, taken
--                              when sending starts; its key (campaign,
--                              subscriber) and Resend's idempotency key mean
--                              nobody gets the same campaign twice
--
-- Staff with marketing.send write drafts through RLS. Sending (status changes,
-- recipient rows) is done by the server with the service key after the same
-- permission check, so a draft can't be marked sent from the browser.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

insert into public.permissions (key, description) values
  ('marketing.send', 'Write and send email campaigns to subscribers');

insert into public.role_permissions (role_id, permission_key)
select r.id, 'marketing.send' from public.roles r
 where r.tenant_id is null and r.key in ('owner', 'administrator')
on conflict do nothing;

create table public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  subject text not null default '' check (length(subject) <= 150),
  preheader text not null default '' check (length(preheader) <= 150),
  heading text not null default '' check (length(heading) <= 120),
  body text not null default '' check (length(body) <= 5000),
  cta_label text check (cta_label is null or length(cta_label) between 1 and 40),
  cta_url text check (cta_url is null or (length(cta_url) <= 500 and cta_url ~ '^(https://|/)')),
  product_ids jsonb not null default '[]' check (jsonb_typeof(product_ids) = 'array' and jsonb_array_length(product_ids) <= 6),
  audience text[] not null default '{}' check (audience <@ array['launch_waitlist', 'membership_waitlist', 'footer']::text[]),
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent')),
  recipients integer not null default 0 check (recipients >= 0),
  sent integer not null default 0 check (sent >= 0),
  failed integer not null default 0 check (failed >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sending_at timestamptz,
  sent_at timestamptz
);
create index email_campaigns_tenant_idx on public.email_campaigns (tenant_id, created_at desc);
create trigger email_campaigns_touch before update on public.email_campaigns
  for each row execute function private.touch_updated_at();

create table public.email_campaign_recipients (
  campaign_id uuid not null references public.email_campaigns (id) on delete cascade,
  subscriber_id uuid not null references public.newsletter_subscribers (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  provider_message_id text,
  last_error text check (last_error is null or length(last_error) <= 500),
  sent_at timestamptz,
  primary key (campaign_id, subscriber_id)
);
create index email_campaign_recipients_queued_idx on public.email_campaign_recipients (campaign_id) where status = 'queued';
create index email_campaign_recipients_tenant_idx on public.email_campaign_recipients (tenant_id);

alter table public.email_campaigns enable row level security;
alter table public.email_campaign_recipients enable row level security;
revoke all on public.email_campaigns, public.email_campaign_recipients from anon, authenticated;
grant select, insert, update on public.email_campaigns to authenticated;
grant select on public.email_campaign_recipients to authenticated;
grant all on public.email_campaigns, public.email_campaign_recipients to service_role;

create policy "Marketers read campaigns" on public.email_campaigns
  for select to authenticated
  using (tenant_id in (select private.permitted_tenants('marketing.send')));
-- Only drafts can be written from the browser; sending is the server's job.
create policy "Marketers create drafts" on public.email_campaigns
  for insert to authenticated
  with check (tenant_id in (select private.permitted_tenants('marketing.send')) and status = 'draft'
              and recipients = 0 and sent = 0 and failed = 0 and sending_at is null and sent_at is null);
create policy "Marketers edit drafts" on public.email_campaigns
  for update to authenticated
  using (tenant_id in (select private.permitted_tenants('marketing.send')) and status = 'draft')
  with check (tenant_id in (select private.permitted_tenants('marketing.send')) and status = 'draft'
              and recipients = 0 and sent = 0 and failed = 0 and sending_at is null and sent_at is null);
create policy "Marketers read recipients" on public.email_campaign_recipients
  for select to authenticated
  using (tenant_id in (select private.permitted_tenants('marketing.send')));

commit;
