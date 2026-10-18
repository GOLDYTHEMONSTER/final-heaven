import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/auth'
import { AdminShell } from '@/components/admin/AdminShell'

export const metadata: Metadata = {
  title: 'Admin - Final Heaven',
  robots: { index: false, follow: false },
}

// Always render per request: the admin check must never be cached.
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Second line of defence after the middleware: nothing under /admin renders without a verified admin.
  const admin = await getAdmin()
  if (!admin) redirect('/login?next=/admin')

  return <AdminShell email={admin.claims.email ?? ''}>{children}</AdminShell>
}
