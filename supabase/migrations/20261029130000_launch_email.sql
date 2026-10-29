-- The launch-day email to the launch waitlist.
--
-- The daily job sends it once payments_open_on has arrived. The store carries
-- the marker: launch_campaign_id is the email_campaigns row made for it (made
-- exactly once, under a row lock, so two overlapping jobs can't make two), and
-- launch_email_sent_at is set when every recipient has been dealt with. If the
-- job runs out of time or Resend's daily quota, the next run carries on with
-- the same campaign; the campaign's own per-subscriber keys stop anyone getting
-- it twice.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.stores
  add column launch_campaign_id uuid references public.email_campaigns (id) on delete set null,
  add column launch_email_sent_at timestamptz;

-- The store's launch campaign, made on first call from the given words and
-- returned on every later call.
create or replace function public.ensure_launch_campaign(
  p_store uuid, p_subject text, p_preheader text, p_heading text, p_body text, p_cta_label text, p_cta_url text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_store public.stores;
  v_id uuid;
begin
  select * into v_store from public.stores where id = p_store for update;
  if not found then raise exception 'no such store'; end if;
  if v_store.launch_campaign_id is not null then return v_store.launch_campaign_id; end if;
  insert into public.email_campaigns (tenant_id, subject, preheader, heading, body, cta_label, cta_url, audience)
  values (v_store.tenant_id, p_subject, p_preheader, p_heading, p_body, p_cta_label, p_cta_url, array['launch_waitlist'])
  returning id into v_id;
  update public.stores set launch_campaign_id = v_id where id = p_store;
  return v_id;
end $$;
revoke all on function public.ensure_launch_campaign(uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.ensure_launch_campaign(uuid, text, text, text, text, text, text) to service_role;

commit;
