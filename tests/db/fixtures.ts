import type { PGlite } from '@electric-sql/pglite'
import { one } from './harness'

/**
 * Two independent businesses on one platform, seeded as the database owner:
 *  A = Final Heaven (created by the migration), B = a rival store.
 * Each user's role is in the name. `outsider` has no membership;
 * `platform` is a platform admin with no tenant membership.
 */
export async function seedTwoTenants(db: PGlite) {
  const tenantA = (await one<{ id: string }>(db, `select id from public.tenants where slug = 'final-heaven'`)).id
  const storeA = (await one<{ id: string }>(db, `select id from public.stores where tenant_id = $1`, [tenantA])).id
  const tenantB = (await one<{ id: string }>(db, `insert into public.tenants (slug, name) values ('rival-store', 'Rival Store') returning id`)).id
  const storeB = (await one<{ id: string }>(db,
    `insert into public.stores (tenant_id, slug, name) values ($1, 'rival-store', 'Rival Store') returning id`, [tenantB])).id

  const user = async (email: string) =>
    (await one<{ id: string }>(db, `insert into auth.users (email) values ($1) returning id`, [email])).id

  const assign = async (userId: string, tenantId: string, roleKey: string) => {
    const m = await one<{ id: string }>(db,
      `insert into public.memberships (tenant_id, user_id) values ($1, $2)
       on conflict (tenant_id, user_id) do update set status = 'active' returning id`, [tenantId, userId])
    await db.query(
      `insert into public.membership_roles (membership_id, role_id)
       select $1, id from public.roles where tenant_id is null and key = $2`, [m.id, roleKey])
    return m.id
  }

  const users = {
    ownerA: await user('owner@a.test'),
    adminA: await user('admin@a.test'),
    financeA: await user('finance@a.test'),
    supportA: await user('support@a.test'),
    fulfilA: await user('fulfil@a.test'),
    readonlyA: await user('readonly@a.test'),
    ownerB: await user('owner@b.test'),
    outsider: await user('outsider@test'),
    platform: await user('platform@test'),
  }
  const memberships = {
    ownerA: await assign(users.ownerA, tenantA, 'owner'),
    adminA: await assign(users.adminA, tenantA, 'administrator'),
    financeA: await assign(users.financeA, tenantA, 'finance_manager'),
    supportA: await assign(users.supportA, tenantA, 'customer_support'),
    fulfilA: await assign(users.fulfilA, tenantA, 'fulfilment_staff'),
    readonlyA: await assign(users.readonlyA, tenantA, 'read_only'),
    ownerB: await assign(users.ownerB, tenantB, 'owner'),
  }
  await db.query(`insert into public.platform_admins (user_id) values ($1)`, [users.platform])

  const product = async (id: string, tenantId: string, storeId: string, status: string, price = 24999.9) =>
    db.query(`insert into public.products (id, name, price, category, stock, status, tenant_id, store_id)
              values ($1, $2, $3, 'Shoes', 10, $4, $5, $6)`, [id, `Product ${id}`, price, status, tenantId, storeId])
  await product('pA1', tenantA, storeA, 'active')
  await product('pA2', tenantA, storeA, 'draft')
  await product('pB1', tenantB, storeB, 'active')

  const order = async (num: string, tenantId: string, storeId: string, total = 24999.9) =>
    (await one<{ id: string }>(db,
      `insert into public.orders (order_number, email, tracking_number, shipping_address, subtotal, total,
                                  order_items, tenant_id, store_id)
       values ($1, $2, $3, '1 Test St', $4, $4, '[]', $5, $6) returning id`,
      [num, `${num.toLowerCase()}@customer.test`, `TRK-${num}`, total, tenantId, storeId])).id
  const orders = {
    a1: await order('FH-A1', tenantA, storeA),
    a2: await order('FH-A2', tenantA, storeA),
    b1: await order('FH-B1', tenantB, storeB),
  }

  return { tenantA, storeA, tenantB, storeB, users, memberships, orders }
}

export type Fixture = Awaited<ReturnType<typeof seedTwoTenants>>
