// Isolated Postgres for tests: PGlite (Postgres compiled to WebAssembly) with a
// minimal stand-in for Supabase's roles and auth schema. Never touches a real
// database. Each call to createTestDb() returns a fresh, empty instance.
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations')

// The parts of Supabase the migrations rely on: API roles, auth.users,
// auth.uid()/auth.jwt() reading request.jwt.claims exactly as PostgREST sets it.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_app_meta_data jsonb not null default '{}'
  );
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
`

export const migrationFiles = () =>
  readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()

export const readMigration = (file: string) => readFileSync(join(MIGRATIONS_DIR, file), 'utf8')

/**
 * Fresh database with the baseline schema and migrations applied.
 * `stopBefore` leaves out that migration and everything after it, so tests can
 * seed legacy data and then apply the rest themselves.
 */
export async function createTestDb({ stopBefore }: { stopBefore?: string } = {}) {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(SUPABASE_STUB)
  await db.exec(readFileSync(join(ROOT, 'supabase', 'schema.sql'), 'utf8'))
  for (const file of migrationFiles()) {
    if (stopBefore && file >= stopBefore) break
    await db.exec(readMigration(file))
  }
  return db
}

export type Actor =
  | { kind: 'anon' }
  | { kind: 'user'; id: string }
  | { kind: 'service' }

/**
 * Runs `fn` inside a transaction as the given API role, the way PostgREST
 * does (SET LOCAL ROLE plus request.jwt.claims). Commits on success, rolls
 * back if `fn` throws.
 */
export async function as<T>(db: PGlite, actor: Actor, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const role = actor.kind === 'anon' ? 'anon' : actor.kind === 'service' ? 'service_role' : 'authenticated'
    const claims = actor.kind === 'user' ? { sub: actor.id, role: 'authenticated' } : { role }
    await tx.query(`set local role ${role}`)
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    return fn(tx)
  })
}

/** Like `as`, but always rolls back: for probing what an actor could do. */
export async function probe<T>(db: PGlite, actor: Actor, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  let result: T
  try {
    await as(db, actor, async (tx) => {
      result = await fn(tx)
      throw ROLLBACK
    })
  } catch (e) {
    if (e !== ROLLBACK) throw e
  }
  return result!
}
const ROLLBACK = Symbol('rollback')

/** Resolves to the Postgres error message if `promise` rejects, or null. */
export async function errorOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise
    return null
  } catch (e) {
    return (e as Error).message
  }
}

export async function one<T = Record<string, unknown>>(db: PGlite | Transaction, sql: string, params: unknown[] = []) {
  const { rows } = await db.query<T>(sql, params)
  return rows[0]
}
