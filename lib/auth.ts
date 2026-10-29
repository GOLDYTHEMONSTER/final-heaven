import 'server-only'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type Permission =
  | 'products.read' | 'products.write' | 'inventory.read' | 'inventory.adjust'
  | 'orders.read' | 'orders.update' | 'payments.read' | 'payments.record'
  | 'refunds.request' | 'refunds.approve' | 'finance.read' | 'finance.export'
  | 'customers.read' | 'customers.update' | 'analytics.read' | 'audit.read'
  | 'users.manage' | 'settings.manage'
  | 'shipping.read' | 'shipping.manage' | 'finance.adjust'
  | 'marketing.send'

export type TenantAccess = {
  tenantId: string
  tenantSlug: string
  tenantName: string
  storeId: string | null
  permissions: Permission[]
}

export type StaffContext = {
  supabase: SupabaseClient
  userId: string
  email: string | null
  /** The tenant this request acts in, validated against the user's memberships. */
  tenant: TenantAccess
  /** Every tenant the user belongs to, for a tenant switcher. */
  tenants: TenantAccess[]
  can: (permission: Permission) => boolean
}

export const TENANT_COOKIE = 'fh_tenant'

/**
 * The signed-in staff member and the tenant they are acting in, or null.
 * The JWT is verified with getClaims(); memberships and permissions come from
 * the database (my_tenant_access), so a role change applies on the next
 * request. The tenant comes from a cookie but is only honoured if the user is
 * an active member of it: a tenant id from the client is never trusted alone.
 */
export async function getStaffContext(): Promise<StaffContext | null> {
  const supabase = createSupabaseServerClient()
  const { data: auth, error } = await supabase.auth.getClaims()
  const claims = auth?.claims as { sub?: string; email?: string; aal?: string } | undefined
  // Staff must have passed MFA. The database enforces the same (private.mfa_verified).
  if (error || !claims?.sub || claims.aal !== 'aal2') return null

  const { data, error: accessError } = await supabase.rpc('my_tenant_access')
  if (accessError) throw accessError
  const tenants: TenantAccess[] = (data ?? []).map((row: Record<string, unknown>) => ({
    tenantId: row.tenant_id as string,
    tenantSlug: row.tenant_slug as string,
    tenantName: row.tenant_name as string,
    storeId: (row.store_id as string) ?? null,
    permissions: (row.permissions as Permission[]) ?? [],
  }))
  if (!tenants.length) return null

  const wanted = cookies().get(TENANT_COOKIE)?.value
  const tenant = tenants.find((t) => t.tenantId === wanted) ?? tenants[0]
  return {
    supabase,
    userId: claims.sub,
    email: claims.email ?? null,
    tenant,
    tenants,
    can: (p) => tenant.permissions.includes(p),
  }
}

/**
 * Guard for /api/admin route handlers. Returns 401 when signed out (or not
 * staff anywhere) and 403 when signed in without the permission. This is the
 * early, friendly check: RLS enforces the same rule again on every query.
 */
export async function requirePermission(permission: Permission) {
  const staff = await getStaffContext()
  if (!staff) {
    return { staff: null, denied: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) } as const
  }
  if (!staff.can(permission)) {
    return { staff: null, denied: NextResponse.json({ error: 'You don’t have permission to do that.' }, { status: 403 }) } as const
  }
  return { staff, denied: null } as const
}

/** True for platform operators (platform health only; grants no tenant data). */
export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) return false
  const { data } = await supabase.rpc('am_platform_admin')
  return data === true
}
