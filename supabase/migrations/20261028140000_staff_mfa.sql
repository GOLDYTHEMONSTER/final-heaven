-- Staff access needs a second factor.
--
-- Memberships and platform admin only count when the session's token says it
-- passed an authenticator-app code (Supabase sets the JWT claim aal = 'aal2'
-- after an MFA verify). With a password alone (aal1) the user is a member of
-- nothing: every RLS policy, my_tenant_access() and am_platform_admin() follow.
--
-- Recovery if a phone is lost: delete the user's row in auth.mfa_factors
-- (Supabase dashboard → Authentication → Users → the user → remove the
-- factor), then sign in and scan a new QR code.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function private.mfa_verified() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
$$;

create or replace function private.permitted_tenants(p_permission text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.tenant_id
    from public.memberships m
    join public.tenants t on t.id = m.tenant_id and t.status = 'active'
    join public.membership_roles mr on mr.membership_id = m.id
    join public.role_permissions rp on rp.role_id = mr.role_id and rp.permission_key = p_permission
   where m.user_id = (select auth.uid()) and m.status = 'active' and private.mfa_verified()
$$;

create or replace function private.member_tenants() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.tenant_id from public.memberships m
   where m.user_id = (select auth.uid()) and m.status = 'active' and private.mfa_verified()
$$;

create or replace function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.mfa_verified()
     and exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
$$;

revoke all on function private.mfa_verified() from public, anon, authenticated, service_role;

commit;
