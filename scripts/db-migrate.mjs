// Migrations with checks and fail-safes. Every migration in supabase/migrations
// has a probe (a read-only query that is true once it's live), and some have a
// precondition (something that must be true before it may run).
//
//   node scripts/db-migrate.mjs status            which migrations are live
//   node scripts/db-migrate.mjs preflight         before a push: fails if the code needs a migration that isn't live
//   node scripts/db-migrate.mjs apply <file>      precondition → dry run (rolled back) → apply → probe
//
// The connection string comes from .env.local and is never printed. Data
// changes (like granting a role) are not migrations: do them by hand, with a
// rehearsal in begin … rollback first.
import { readFileSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { spawnSync } from 'node:child_process'

const DIR = 'supabase/migrations'
const SITE = process.env.SITE_URL || 'https://www.finalheaven.shop'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]))
const DB = env.SUPABASE_CONNECTION_STRING
if (!DB) { console.error('SUPABASE_CONNECTION_STRING is missing from .env.local'); process.exit(1) }

// Migrations from before this tool are checked by their newest object; anything
// older than TRACKED_FROM is assumed live (the store runs on it).
const TRACKED_FROM = '20261026'
const PROBES = {
  '20261026100000_free_gifts.sql': `select to_regclass('public.store_gift_offers') is not null or exists (select 1 from information_schema.columns where table_name = 'stores' and column_name like 'gift%')`,
  '20261026120000_marketplace_catalogue.sql': `exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'brands')`,
  '20261026130000_checkout_holds.sql': `exists (select 1 from information_schema.columns where table_name = 'checkouts' and column_name = 'hold_until')`,
  '20261027120000_shipping_engine.sql': `to_regclass('public.product_shipping_profiles') is not null`,
  '20261028100000_product_hype.sql': `to_regclass('public.product_hype') is not null`,
  '20261028120000_delivery_options.sql': `exists (select 1 from information_schema.columns where table_name = 'orders' and column_name = 'delivery_option')`,
  '20261028140000_staff_mfa.sql': `to_regprocedure('private.mfa_verified()') is not null`,
  '20261028150000_products_ships_by_air.sql': `exists (select 1 from information_schema.columns where table_name = 'products' and column_name = 'ships_by_air')`,
}

// Applied after the code that needs it is live (the other way round locks people out).
const AFTER_DEPLOY = {
  '20261028140000_staff_mfa.sql': {
    why: 'admin sign-in must already ask for the authenticator code, or nobody can get into admin',
    async check() {
      const html = await fetch(`${SITE}/studio/login`).then((r) => r.text())
      const chunks = [...new Set(html.match(/\/_next\/static\/chunks\/[^"']+\.js/g) ?? [])]
      for (const c of chunks) if ((await fetch(SITE + c).then((r) => r.text())).includes('one-time-code')) {
        const staff = query(`select count(*) from public.memberships m join public.membership_roles mr on mr.membership_id = m.id join public.roles r on r.id = mr.role_id where m.status = 'active' and r.key = 'owner'`)
        return Number(staff) > 0 ? null : 'no active Owner: grant one first, or nobody will be able to sign in afterwards'
      }
      return `${SITE}/studio/login doesn't ask for a code yet: deploy the two-step sign-in first`
    },
  },
}

function psql(sql, { write = false } = {}) {
  const r = spawnSync('psql', [DB, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], {
    input: sql, encoding: 'utf8',
    env: { ...process.env, PGOPTIONS: write ? '' : '-c default_transaction_read_only=on' },
  })
  if (r.status !== 0) throw new Error((r.stderr || r.stdout).replace(DB, '<connection>').trim())
  return r.stdout.trim()
}
const query = (sql) => psql(`${sql};`).split('\n').pop()
const probe = (file) => (PROBES[file] ? query(`select (${PROBES[file]})`) === 't' : null)
const files = () => readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()

function status({ quiet = false } = {}) {
  const rows = files().filter((f) => f >= TRACKED_FROM).map((f) => ({ f, live: probe(f) }))
  if (!quiet) for (const { f, live } of rows) console.log(`${live === true ? 'live   ' : live === false ? 'MISSING' : 'no probe'} ${f}${AFTER_DEPLOY[f] ? '  (after deploy)' : ''}`)
  return rows
}

async function apply(file) {
  file = basename(file ?? '')
  if (!files().includes(file)) throw new Error(`No migration ${file} in ${DIR}`)
  if (!PROBES[file]) throw new Error(`${file} has no probe: add one to PROBES in this script first, so it can be confirmed`)
  if (probe(file)) { console.log(`${file} is already live: nothing to do`); return }
  // Earlier migrations must be live first (except ones that wait for a deploy: they don't block the rest).
  const before = files().filter((f) => f >= TRACKED_FROM && f < file && PROBES[f] && !AFTER_DEPLOY[f] && !probe(f))
  if (before.length) throw new Error(`apply these first: ${before.join(', ')}`)
  const pre = AFTER_DEPLOY[file]
  if (pre) {
    const problem = await pre.check()
    if (problem) throw new Error(`not yet: ${problem}`)
  }
  const body = readFileSync(join(DIR, file), 'utf8')
  // The files carry their own begin/commit: strip them for the rehearsal, or it really applies.
  const rehearsal = body.replace(/^\s*begin;\s*$/gim, '').replace(/^\s*commit;\s*$/gim, '')
  const dry = psql(`begin;\n${rehearsal}\nselect 'probe:' || (${PROBES[file]})::text;\nrollback;`, { write: true })
  if (!/probe:true/.test(dry)) throw new Error(`the rehearsal ran but its probe isn't true: not applying\n${dry.slice(-400)}`)
  if (probe(file)) throw new Error('the rehearsal left changes behind: stop and look')
  console.log(`rehearsal ok (rolled back): ${file}`)
  psql(body, { write: true })
  if (!probe(file)) throw new Error(`applied, but the probe for ${file} is still false: look at the database`)
  console.log(`applied and confirmed: ${file}`)
}

async function preflight() {
  const missing = status({ quiet: true }).filter((r) => r.live === false && !AFTER_DEPLOY[r.f])
  const unprobed = files().filter((f) => f >= TRACKED_FROM && !PROBES[f])
  for (const f of unprobed) console.log(`no probe: ${f} (add one to scripts/db-migrate.mjs)`)
  if (missing.length) {
    console.log(`not live yet, and the code may need it before deploying:\n${missing.map((r) => `  ${r.f}`).join('\n')}\nRun: node scripts/db-migrate.mjs apply <file>`)
    process.exit(1)
  }
  const later = status({ quiet: true }).filter((r) => r.live === false && AFTER_DEPLOY[r.f]).map((r) => r.f)
  console.log(`preflight ok: every migration the code needs is live${later.length ? `; after the deploy, apply ${later.join(', ')}` : ''}`)
  if (unprobed.length) process.exit(1)
}

const [cmd, arg] = process.argv.slice(2)
try {
  if (cmd === 'status') status()
  else if (cmd === 'preflight') await preflight()
  else if (cmd === 'apply') await apply(arg)
  else { console.error('Usage: node scripts/db-migrate.mjs status | preflight | apply <file>'); process.exit(1) }
} catch (e) {
  console.error(`stopped: ${e.message}`)
  process.exit(1)
}
