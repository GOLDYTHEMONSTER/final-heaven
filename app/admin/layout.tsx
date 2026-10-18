import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getStaffContext } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { AdminShell, NoAccess } from '@/components/admin/AdminShell'

export const metadata: Metadata = {
  title: 'Admin - Final Heaven',
  robots: { index: false, follow: false },
}

// Always render per request: the access check must never be cached.
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Second line of defence after the middleware: nothing under /admin renders
  // without a verified session AND an active staff membership.
  const staff = await getStaffContext()
  if (!staff) {
    const { data } = await createSupabaseServerClient().auth.getClaims()
    if (!data?.claims?.sub) redirect('/login?next=/admin')
    return <NoAccess email={(data.claims.email as string) ?? ''} />
  }

  return (
    <AdminShell
      email={staff.email ?? ''}
      tenantName={staff.tenant.tenantName}
      permissions={staff.tenant.permissions}
    >
      {children}
    </AdminShell>
  )
}
