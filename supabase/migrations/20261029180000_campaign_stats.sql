-- Email stats per campaign (Studio → Campaigns): delivered, opened, clicked,
-- bounced, complained. Resend's webhook events (email_events) are joined to the
-- campaign's recipients by Resend's message id. Each count is people, not
-- events: someone who opens it five times counts once. Opens and clicks only
-- arrive if tracking is switched on for the domain in Resend.
--
-- Called by the server with the service key after it has checked the staff
-- member's marketing.send permission, and scoped to that tenant here too.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create index email_campaign_recipients_message_idx on public.email_campaign_recipients (provider_message_id)
  where provider_message_id is not null;

create or replace function public.campaign_email_stats(p_tenant uuid)
returns table (campaign_id uuid, delivered bigint, opened bigint, clicked bigint, bounced bigint, complained bigint)
language sql stable security invoker set search_path = '' as $$
  select r.campaign_id,
         count(distinct r.subscriber_id) filter (where e.type = 'email.delivered'),
         count(distinct r.subscriber_id) filter (where e.type = 'email.opened'),
         count(distinct r.subscriber_id) filter (where e.type = 'email.clicked'),
         count(distinct r.subscriber_id) filter (where e.type = 'email.bounced'),
         count(distinct r.subscriber_id) filter (where e.type = 'email.complained')
    from public.email_campaign_recipients r
    join public.email_events e on e.provider_message_id = r.provider_message_id
   where r.tenant_id = p_tenant
   group by r.campaign_id
$$;
revoke all on function public.campaign_email_stats(uuid) from public, anon, authenticated;
grant execute on function public.campaign_email_stats(uuid) to service_role;

commit;
