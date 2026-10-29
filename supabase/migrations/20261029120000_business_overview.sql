-- Business overview and launch signals for Studio (read-only, additive).
--
-- Two functions, both checking the caller's permission for the tenant:
--   public.business_overview(tenant, from, to)  needs analytics.read
--   public.launch_signals(tenant)               needs settings.manage
-- They run as the definer because they read tables staff cannot read directly
-- (the email outbox, supplier costs for analytics-only roles, the MFA lock
-- function in the private schema). They return counts and short lists only;
-- never supplier costs per product, emails or secrets.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function private.business_overview(p_tenant uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_from timestamptz := p_from::timestamp at time zone 'Africa/Lagos';
  v_to timestamptz := (p_to + 1)::timestamp at time zone 'Africa/Lagos';
  v_hype boolean;
  v_out jsonb;
begin
  if not private.has_permission(p_tenant, 'analytics.read') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select coalesce(bool_or(enabled), false) into v_hype from public.hype_settings where tenant_id = p_tenant;

  with
  audience as (
    select source,
           count(*) filter (where unsubscribed_at is null) as subscribed,
           count(*) filter (where subscribed_at >= v_from and subscribed_at < v_to and unsubscribed_at is null) as new_in_range,
           count(*) filter (where unsubscribed_at >= v_from and unsubscribed_at < v_to) as unsubscribed_in_range
      from public.newsletter_subscribers where tenant_id = p_tenant group by source
  ),
  prod as (
    select p.id, p.name, p.price, p.status, p.category, p.stock, p.fulfilment, p.source_type, p.colors, p.images
      from public.products p where p.tenant_id = p_tenant
  ),
  landed as (
    select p.id, p.name, p.price,
           s.unit_cost * case when s.cost_currency = 'NGN' then 1 else s.fx_rate end
             + coalesce(s.shipping_cost_ngn, 0) + coalesce(s.customs_cost_ngn, 0) + coalesce(s.other_cost_ngn, 0) as cost
      from prod p join public.product_sources s on s.product_id = p.id
     where p.status = 'active' and p.price > 0 and s.unit_cost is not null
       and (s.cost_currency = 'NGN' or s.fx_rate is not null)
  ),
  margins as (select id, name, round(((price - cost) / price * 100)::numeric, 1) as margin from landed),
  gaps as (
    select p.id, p.name,
           array_remove(array[
             case when s.unit_cost is null then 'no supplier cost' end,
             case when p.source_type <> 'original'
                   and not exists (select 1 from public.product_shipping_profiles sp
                                    where sp.product_id = p.id and sp.tenant_id = p_tenant and sp.weight_kg > 0)
                  then 'no packed weight' end,
             case when s.supplier_id is null then 'no supplier' end,
             case when jsonb_typeof(p.images) <> 'array' or jsonb_array_length(p.images) = 0 then 'no photo'
                  when jsonb_typeof(p.colors) = 'array' and jsonb_array_length(p.colors) > 0
                   and exists (select 1 from jsonb_array_elements_text(p.colors) c
                                where not exists (select 1 from jsonb_array_elements(p.images) i
                                                   where lower(i ->> 'color') = lower(c)))
                   and exists (select 1 from jsonb_array_elements(p.images) i where coalesce(i ->> 'color', '') <> '')
                  then 'a colour has no photo' end
           ], null) as issues
      from prod p left join public.product_sources s on s.product_id = p.id
     where p.status = 'active'
  )
  select jsonb_build_object(
    'audience', coalesce((select jsonb_agg(jsonb_build_object('source', coalesce(source, 'other'), 'subscribed', subscribed,
                 'newInRange', new_in_range, 'unsubscribedInRange', unsubscribed_in_range) order by subscribed desc) from audience), '[]'),
    'catalogue', jsonb_build_object(
      'active', (select count(*) from prod where status = 'active'),
      'draft', (select count(*) from prod where status = 'draft'),
      'archived', (select count(*) from prod where status = 'archived'),
      'byCategory', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'products', n) order by n desc, category)
                                from (select category, count(*) n from prod where status = 'active' group by category) c), '[]'),
      'lowStock', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'stock', stock) order by stock, name)
                              from (select * from prod where status = 'active' and fulfilment = 'stock' and stock <= 2 order by stock, name limit 12) l), '[]'),
      'lowStockCount', (select count(*) from prod where status = 'active' and fulfilment = 'stock' and stock <= 2),
      'missingData', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'issues', to_jsonb(issues)) order by name)
                                 from (select * from gaps where cardinality(issues) > 0 order by name limit 12) g), '[]'),
      'missingDataCount', (select count(*) from gaps where cardinality(issues) > 0)),
    'margins', jsonb_build_object(
      'products', (select count(*) from margins),
      'average', (select round(avg(margin), 1) from margins),
      'lowest', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'margin', margin) order by margin, name)
                            from (select * from margins order by margin, name limit 5) m), '[]')),
    'hype', case when v_hype then jsonb_build_object(
      'total', (select count(*) from public.hype_events where tenant_id = p_tenant and created_at >= v_from and created_at < v_to),
      'top', coalesce((select jsonb_agg(jsonb_build_object('id', product_id, 'name', name, 'hypes', n) order by n desc, name)
                         from (select e.product_id, p.name, count(*) n from public.hype_events e
                                 join public.products p on p.id = e.product_id and p.tenant_id = e.tenant_id
                                where e.tenant_id = p_tenant and e.created_at >= v_from and e.created_at < v_to
                                group by e.product_id, p.name order by n desc, p.name limit 5) h), '[]')) else null end,
    'email', jsonb_build_object(
      'sent', (select count(*) from public.email_outbox where tenant_id = p_tenant and status = 'sent' and created_at >= v_from and created_at < v_to),
      'failed', (select count(*) from public.email_outbox where tenant_id = p_tenant and status = 'failed' and created_at >= v_from and created_at < v_to),
      'skipped', (select count(*) from public.email_outbox where tenant_id = p_tenant and status = 'skipped' and created_at >= v_from and created_at < v_to),
      'campaignsSent', (select count(*) from public.email_campaigns where tenant_id = p_tenant and status = 'sent' and sent_at >= v_from and sent_at < v_to),
      'campaignRecipients', (select coalesce(sum(recipients), 0) from public.email_campaigns where tenant_id = p_tenant and status = 'sent' and sent_at >= v_from and sent_at < v_to)),
    'suppliers', jsonb_build_object(
      'count', (select count(*) from public.suppliers where tenant_id = p_tenant),
      'top', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'products', n) order by n desc, name)
                         from (select sp.name, count(s.product_id) n from public.suppliers sp
                                 left join public.product_sources s on s.supplier_id = sp.id
                                where sp.tenant_id = p_tenant group by sp.id, sp.name order by n desc, sp.name limit 5) t), '[]'))
  ) into v_out;
  return v_out;
end $$;

create or replace function public.business_overview(p_tenant uuid, p_from date, p_to date) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.business_overview(p_tenant, p_from, p_to) $$;
revoke all on function public.business_overview(uuid, date, date) from public, anon;
grant execute on function public.business_overview(uuid, date, date) to authenticated;
revoke all on function private.business_overview(uuid, date, date) from public, anon;
grant execute on function private.business_overview(uuid, date, date) to authenticated;

create or replace function private.launch_signals(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_permission(p_tenant, 'settings.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'paymentsOpenOn', (select to_char(max(payments_open_on), 'YYYY-MM-DD') from public.stores where tenant_id = p_tenant),
    'purchasesPaused', (select coalesce(bool_or(purchases_paused), false) from public.stores where tenant_id = p_tenant),
    'activeOwners', (select count(distinct m.id) from public.memberships m
                       join public.membership_roles mr on mr.membership_id = m.id
                       join public.roles r on r.id = mr.role_id and r.key = 'owner'
                      where m.tenant_id = p_tenant and m.status = 'active'),
    'mfaLockApplied', to_regprocedure('private.mfa_verified()') is not null,
    'activeProducts', (select count(*) from public.products where tenant_id = p_tenant and status = 'active'),
    'activeWithoutPhoto', (select count(*) from public.products where tenant_id = p_tenant and status = 'active'
                              and (jsonb_typeof(images) <> 'array' or jsonb_array_length(images) = 0))
  );
end $$;

create or replace function public.launch_signals(p_tenant uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.launch_signals(p_tenant) $$;
revoke all on function public.launch_signals(uuid) from public, anon;
grant execute on function public.launch_signals(uuid) to authenticated;
revoke all on function private.launch_signals(uuid) from public, anon;
grant execute on function private.launch_signals(uuid) to authenticated;

commit;
