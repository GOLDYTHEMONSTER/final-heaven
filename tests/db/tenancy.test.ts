// Tenant isolation and RBAC, enforced by the database itself.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb, errorOf, one, probe } from './harness'
import { seedTwoTenants, type Fixture } from './fixtures'

let db: PGlite
let f: Fixture
const user = (id: string) => ({ kind: 'user' as const, id })
const count = (tx: { query: PGlite['query'] }, sql: string, params: unknown[] = []) =>
  tx.query<{ n: number }>(sql, params).then((r) => r.rows[0].n)

beforeAll(async () => {
  db = await createTestDb()
  f = await seedTwoTenants(db)
})
afterAll(() => db.close())

describe('public (anon key)', () => {
  it('cannot read orders, payments, audit, memberships or subscribers', async () => {
    for (const table of ['orders', 'payments', 'audit_events', 'memberships', 'newsletter_subscribers', 'payment_events']) {
      expect(await errorOf(probe(db, { kind: 'anon' }, (tx) => tx.query(`select 1 from public.${table}`))), table)
        .toMatch(/permission denied/)
    }
  })

  it('sees only active products, never drafts', async () => {
    const ids = await probe(db, { kind: 'anon' }, (tx) =>
      tx.query<{ id: string }>(`select id from public.products order by id`).then((r) => r.rows.map((x) => x.id)))
    expect(ids).toEqual(['pA1', 'pB1'])
  })

  it('cannot write products', async () => {
    expect(await errorOf(probe(db, { kind: 'anon' }, (tx) =>
      tx.query(`update public.products set price = 1`)))).toMatch(/permission denied/)
  })
})

describe('reads are tenant-scoped', () => {
  it('a tenant A owner sees A orders and none of B', async () => {
    const [a, b] = await probe(db, user(f.users.ownerA), async (tx) => [
      await count(tx, `select count(*)::int n from public.orders where tenant_id = $1`, [f.tenantA]),
      await count(tx, `select count(*)::int n from public.orders where tenant_id = $1`, [f.tenantB]),
    ])
    expect(a).toBe(2)
    expect(b).toBe(0)
  })

  it('asking for another tenant by id returns nothing', async () => {
    const rows = await probe(db, user(f.users.ownerA), (tx) =>
      tx.query(`select * from public.orders where id = $1`, [f.orders.b1]).then((r) => r.rows))
    expect(rows).toHaveLength(0)
  })

  it('a user with no membership sees no tenant data', async () => {
    const n = await probe(db, user(f.users.outsider), (tx) => count(tx, `select count(*)::int n from public.orders`))
    expect(n).toBe(0)
  })

  it('platform admins get no tenant business data automatically', async () => {
    const res = await probe(db, user(f.users.platform), async (tx) => ({
      orders: await count(tx, `select count(*)::int n from public.orders`),
      drafts: await count(tx, `select count(*)::int n from public.products where status <> 'active'`),
      access: (await tx.query(`select * from public.my_tenant_access()`)).rows.length,
      isPlatform: (await tx.query<{ v: boolean }>(`select public.am_platform_admin() as v`)).rows[0].v,
    }))
    expect(res).toEqual({ orders: 0, drafts: 0, access: 0, isPlatform: true })
  })
})

describe('writes are tenant-scoped', () => {
  it('cannot update or delete another tenant’s rows (0 rows affected)', async () => {
    const res = await probe(db, user(f.users.ownerA), async (tx) => ({
      upd: (await tx.query(`update public.products set price = 1 where id = 'pB1'`)).affectedRows,
      del: (await tx.query(`delete from public.products where id = 'pB1'`)).affectedRows,
      ord: (await tx.query(`update public.orders set status = 'cancelled' where id = $1`, [f.orders.b1])).affectedRows,
    }))
    expect(res).toEqual({ upd: 0, del: 0, ord: 0 })
    expect((await one<{ price: string }>(db, `select price from public.products where id = 'pB1'`)).price).toBe('24999.90')
  })

  it('cannot create a row in another tenant by supplying its tenant_id', async () => {
    const err = await errorOf(probe(db, user(f.users.ownerA), (tx) =>
      tx.query(`insert into public.products (id, name, price, category, tenant_id, store_id)
                values ('forged', 'x', 1, 'x', $1, $2)`, [f.tenantB, f.storeB])))
    expect(err).toMatch(/row-level security/)
  })

  it('cannot move a row to another tenant', async () => {
    const err = await errorOf(probe(db, user(f.users.ownerA), (tx) =>
      tx.query(`update public.products set tenant_id = $1, store_id = $2 where id = 'pA1'`, [f.tenantB, f.storeB])))
    expect(err).toMatch(/tenant_id and store_id cannot be changed|row-level security/)
  })

  it('cannot pair a tenant with another tenant’s store', async () => {
    const err = await errorOf(probe(db, { kind: 'service' }, (tx) =>
      tx.query(`insert into public.products (id, name, price, category, tenant_id, store_id)
                values ('mismatch', 'x', 1, 'x', $1, $2)`, [f.tenantA, f.storeB])))
    expect(err).toMatch(/foreign key/)
  })
})

describe('role restrictions', () => {
  it('read-only staff can read orders but not change them', async () => {
    const res = await probe(db, user(f.users.readonlyA), async (tx) => ({
      read: await count(tx, `select count(*)::int n from public.orders`),
      upd: (await tx.query(`update public.orders set status = 'cancelled' where id = $1`, [f.orders.a1])).affectedRows,
      prod: (await tx.query(`update public.products set price = 1 where id = 'pA1'`)).affectedRows,
    }))
    expect(res).toEqual({ read: 2, upd: 0, prod: 0 })
  })

  it('nobody can edit order totals or payment status directly, not even the owner', async () => {
    for (const col of [`payment_status = 'paid'`, `total = 1`, `order_items = '[]'`, `email = 'x@x.co'`]) {
      expect(await errorOf(probe(db, user(f.users.ownerA), (tx) =>
        tx.query(`update public.orders set ${col} where id = $1`, [f.orders.a1]))), col).toMatch(/permission denied/)
    }
  })

  it('reports each user’s permissions per tenant', async () => {
    const access = async (id: string) =>
      probe(db, user(id), (tx) => tx.query<{ tenant_slug: string; permissions: string[] }>(
        `select tenant_slug, permissions from public.my_tenant_access()`).then((r) => r.rows))
    const owner = await access(f.users.ownerA)
    expect(owner).toHaveLength(1)
    expect(owner[0].tenant_slug).toBe('final-heaven')
    expect(owner[0].permissions).toHaveLength(18)
    const support = (await access(f.users.supportA))[0].permissions
    expect(support).toContain('refunds.request')
    expect(support).not.toContain('refunds.approve')
    expect((await access(f.users.ownerB))[0].tenant_slug).toBe('rival-store')
  })

  it('a suspended membership loses access immediately', async () => {
    await db.query(`update public.memberships set status = 'suspended' where id = $1`, [f.memberships.readonlyA])
    const n = await probe(db, user(f.users.readonlyA), (tx) => count(tx, `select count(*)::int n from public.orders`))
    await db.query(`update public.memberships set status = 'active' where id = $1`, [f.memberships.readonlyA])
    expect(n).toBe(0)
  })
})

describe('staff management cannot escalate privileges', () => {
  const roleId = (key: string) => one<{ id: string }>(db, `select id from public.roles where key = $1 and tenant_id is null`, [key]).then((r) => r.id)
  const grant = (actor: string, membership: string, role: string) =>
    probe(db, user(actor), (tx) => tx.query(`insert into public.membership_roles values ($1, $2)`, [membership, role]))

  it('an administrator cannot make themselves owner', async () => {
    expect(await errorOf(grant(f.users.adminA, f.memberships.adminA, await roleId('owner')))).toMatch(/row-level security/)
  })

  it('an administrator cannot grant permissions they lack (finance manager approves refunds)', async () => {
    expect(await errorOf(grant(f.users.adminA, f.memberships.supportA, await roleId('finance_manager')))).toMatch(/row-level security/)
  })

  it('an administrator can grant a role whose permissions they hold', async () => {
    expect(await errorOf(grant(f.users.adminA, f.memberships.supportA, await roleId('fulfilment_staff')))).toBeNull()
  })

  it('an administrator cannot strip or remove the owner', async () => {
    const res = await probe(db, user(f.users.adminA), async (tx) => ({
      unassign: (await tx.query(`delete from public.membership_roles where membership_id = $1`, [f.memberships.ownerA])).affectedRows,
      suspend: (await tx.query(`update public.memberships set status = 'suspended' where id = $1`, [f.memberships.ownerA])).affectedRows,
    }))
    expect(res).toEqual({ unassign: 0, suspend: 0 })
  })

  it('the owner can grant finance manager', async () => {
    expect(await errorOf(grant(f.users.ownerA, f.memberships.supportA, await roleId('finance_manager')))).toBeNull()
  })

  it('a role from another tenant cannot be assigned', async () => {
    const custom = await one<{ id: string }>(db,
      `insert into public.roles (tenant_id, key, name) values ($1, 'b_custom', 'B custom') returning id`, [f.tenantB])
    expect(await errorOf(grant(f.users.ownerA, f.memberships.supportA, custom.id))).not.toBeNull()
  })

  it('owners of one tenant cannot see or manage another tenant’s staff', async () => {
    const res = await probe(db, user(f.users.ownerB), async (tx) => ({
      seen: await count(tx, `select count(*)::int n from public.memberships where tenant_id = $1`, [f.tenantA]),
      removed: (await tx.query(`delete from public.memberships where tenant_id = $1`, [f.tenantA])).affectedRows,
    }))
    expect(res).toEqual({ seen: 0, removed: 0 })
  })
})

describe('audit log', () => {
  it('is visible only to audit readers of the same tenant', async () => {
    await db.query(`update public.orders set status = 'cancelled' where id = $1`, [f.orders.a2])
    const ownerSees = await probe(db, user(f.users.ownerA), (tx) =>
      count(tx, `select count(*)::int n from public.audit_events where action = 'order.status_changed'`))
    const readonlySees = await probe(db, user(f.users.readonlyA), (tx) => count(tx, `select count(*)::int n from public.audit_events`))
    const otherTenantSees = await probe(db, user(f.users.ownerB), (tx) =>
      count(tx, `select count(*)::int n from public.audit_events where tenant_id = $1`, [f.tenantA]))
    expect(ownerSees).toBeGreaterThan(0)
    expect(readonlySees).toBe(0)
    expect(otherTenantSees).toBe(0)
  })

  it('is append-only for everyone, including the service role', async () => {
    expect(await errorOf(probe(db, { kind: 'service' }, (tx) => tx.query(`update public.audit_events set action = 'x.y'`)))).toMatch(/append-only/)
    expect(await errorOf(probe(db, { kind: 'service' }, (tx) => tx.query(`delete from public.audit_events`)))).toMatch(/append-only/)
  })
})

describe('integration settings and payment inbox', () => {
  it('integration configs are visible to settings managers of their own tenant only', async () => {
    const own = await probe(db, user(f.users.ownerA), (tx) => count(tx, `select count(*)::int n from public.integration_configs`))
    const readOnly = await probe(db, user(f.users.readonlyA), (tx) => count(tx, `select count(*)::int n from public.integration_configs`))
    const other = await probe(db, user(f.users.ownerB), (tx) => count(tx, `select count(*)::int n from public.integration_configs`))
    expect({ own, readOnly, other }).toEqual({ own: 1, readOnly: 0, other: 0 })
  })

  it('no secrets can be stored in integration configs, only references', async () => {
    expect(await errorOf(db.query(`update public.integration_configs set secret_ref = 'FLWSECK-abc123'`))).toMatch(/check constraint/)
  })

  it('signed-in staff cannot read the raw payment event inbox', async () => {
    expect(await errorOf(probe(db, user(f.users.ownerA), (tx) => tx.query(`select 1 from public.payment_events`)))).toMatch(/permission denied/)
  })
})

describe('store selling switches (launch day, pause all purchases)', () => {
  const pause = (tx: { query: PGlite['query'] }, storeId: string) =>
    tx.query<{ id: string }>(`update public.stores set purchases_paused = true, payments_open_on = '2026-11-01' where id = $1 returning id`, [storeId])
      .then((r) => r.rows.length)

  it('owners and administrators change them for their own store', async () => {
    expect(await probe(db, user(f.users.ownerA), (tx) => pause(tx, f.storeA))).toBe(1)
    expect(await probe(db, user(f.users.adminA), (tx) => pause(tx, f.storeA))).toBe(1)
  })

  it('staff without settings.manage, other tenants and outsiders change nothing', async () => {
    for (const who of [f.users.financeA, f.users.supportA, f.users.readonlyA, f.users.ownerB, f.users.outsider]) {
      expect(await probe(db, user(who), (tx) => pause(tx, f.storeA)), who).toBe(0)
    }
  })

  it('cannot be used to change anything else on the store', async () => {
    expect(await errorOf(probe(db, user(f.users.ownerA), (tx) =>
      tx.query(`update public.stores set name = 'Renamed' where id = $1`, [f.storeA])))).toMatch(/permission denied/)
  })

  it('the public can read them but not change them', async () => {
    const row = await probe(db, { kind: 'anon' }, (tx) =>
      tx.query<{ paused: boolean }>(`select purchases_paused as paused from public.stores where id = $1`, [f.storeA]).then((r) => r.rows[0]))
    expect(row).toEqual({ paused: false })
    expect(await errorOf(probe(db, { kind: 'anon' }, (tx) => pause(tx, f.storeA)))).toMatch(/permission denied/)
  })
})

describe('free gift with orders (store setting, gift pieces kept out of the store)', () => {
  beforeAll(async () => {
    await db.query(`insert into public.products (id, name, price, category, status, tenant_id, store_id)
                    values ('gift1', 'Heart Pendant', 15000, 'Gifts', 'active', $1, $2)`, [f.tenantA, f.storeA])
    await db.query(`update public.stores set gift_category = 'Gifts' where id = $1`, [f.storeA])
  })
  afterAll(async () => {
    await db.query(`update public.stores set gift_category = null, gift_min_subtotal = 0 where id = $1`, [f.storeA])
    await db.query(`delete from public.products where id = 'gift1'`)
  })
  const setGift = (tx: { query: PGlite['query'] }, storeId: string) =>
    tx.query<{ id: string }>(`update public.stores set gift_category = 'Gifts', gift_min_subtotal = 20000 where id = $1 returning id`, [storeId])
      .then((r) => r.rows.length)

  it('gift pieces never show to the public, but staff still see them', async () => {
    const pub = await probe(db, { kind: 'anon' }, (tx) => count(tx, `select count(*)::int as n from public.products where id = 'gift1'`))
    const staff = await probe(db, user(f.users.ownerA), (tx) => count(tx, `select count(*)::int as n from public.products where id = 'gift1'`))
    expect([pub, staff]).toEqual([0, 1])
  })

  it('only staff with settings.manage change the setting, for their own store', async () => {
    expect(await probe(db, user(f.users.ownerA), (tx) => setGift(tx, f.storeA))).toBe(1)
    for (const who of [f.users.financeA, f.users.supportA, f.users.ownerB, f.users.outsider]) {
      expect(await probe(db, user(who), (tx) => setGift(tx, f.storeA)), who).toBe(0)
    }
    expect(await errorOf(probe(db, { kind: 'anon' }, (tx) => setGift(tx, f.storeA)))).toMatch(/permission denied/)
  })

  it('the minimum order can’t be negative', async () => {
    expect(await errorOf(probe(db, user(f.users.ownerA), (tx) =>
      tx.query(`update public.stores set gift_min_subtotal = -1 where id = $1`, [f.storeA])))).toMatch(/check constraint/)
  })
})

describe('suppliers and product sourcing (staff only)', () => {
  const addSupplier = (tx: { query: PGlite['query'] }, tenantId: string) =>
    tx.query<{ id: string }>(`insert into public.suppliers (tenant_id, name, url) values ($1, 'Test Factory', 'https://example.com') returning id`, [tenantId])
      .then((r) => r.rows[0].id)

  it('the public can read neither suppliers nor product sourcing', async () => {
    for (const table of ['suppliers', 'product_sources']) {
      expect(await errorOf(probe(db, { kind: 'anon' }, (tx) => tx.query(`select 1 from public.${table}`))), table).toMatch(/permission denied/)
    }
  })

  it('product writers add suppliers and sourcing for their own business', async () => {
    const n = await probe(db, user(f.users.ownerA), async (tx) => {
      const supplierId = await addSupplier(tx, f.tenantA)
      await tx.query(`insert into public.product_sources (product_id, tenant_id, supplier_id, unit_cost) values ('pA1', $1, $2, 12.5)`, [f.tenantA, supplierId])
      return tx.query<{ n: number }>(`select count(*)::int n from public.product_sources where product_id = 'pA1'`).then((r) => r.rows[0].n)
    })
    expect(n).toBe(1)
  })

  it('nobody adds suppliers to another business, and staff without products.write add none', async () => {
    expect(await errorOf(probe(db, user(f.users.ownerB), (tx) => addSupplier(tx, f.tenantA)))).toMatch(/row-level security/)
    expect(await errorOf(probe(db, user(f.users.supportA), (tx) => addSupplier(tx, f.tenantA)))).toMatch(/row-level security/)
  })

  it('another business sees none of this one\'s suppliers', async () => {
    await one(db, `insert into public.suppliers (tenant_id, name) values ($1, 'Only A')`, [f.tenantA])
    const n = await probe(db, user(f.users.ownerB), (tx) =>
      tx.query<{ n: number }>(`select count(*)::int n from public.suppliers where tenant_id = $1`, [f.tenantA]).then((r) => r.rows[0].n))
    expect(n).toBe(0)
  })

  it('products no longer carry a public sourcing link', async () => {
    const cols = await db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'product_url'`)
    expect(cols.rows).toHaveLength(0)
  })
})
