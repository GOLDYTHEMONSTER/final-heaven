// Email set-up and test sends through Resend, from this machine.
//   node scripts/email-test.mjs status          the sending domain and which DNS records Resend still wants
//   node scripts/email-test.mjs verify          ask Resend to check the DNS again
//   node scripts/email-test.mjs send <to> [campaign|order-paid|order-shipped|--all]   one sample email (campaign by default); --all sends the three
// Reads RESEND_API_KEY and EMAIL_FROM from .env.local; never prints the key.
// Before the domain is verified, Resend only sends from onboarding@resend.dev to
// the account's own email, so `send` falls back to that until then.
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '')]))  // an unquoted value ends at ' #'
const KEY = env.RESEND_API_KEY
const FROM = process.env.EMAIL_FROM || env.EMAIL_FROM || ''
if (!KEY) { console.error('Add RESEND_API_KEY=re_... to .env.local first.'); process.exit(1) }
const domainOf = (from) => (from.match(/@([^>\s]+)/) ?? [])[1] ?? null
const api = async (path, init = {}) => {
  const res = await fetch(`https://api.resend.com${path}`, { ...init, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...init.headers } })
  const body = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, body }
}

async function findDomain() {
  const want = domainOf(FROM)
  const r = await api('/domains')
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'this key can’t read domains: use a "Full access" key for set-up' : `Resend ${r.status}: ${r.body?.message}`)
  const list = r.body?.data ?? []
  return { want, list, d: list.find((x) => x.name === want) ?? null }
}

const [cmd, to, which = 'campaign'] = process.argv.slice(2)
if (cmd === 'status' || cmd === 'verify') {
  const { want, list, d } = await findDomain()
  if (!d) {
    console.log(`No "${want ?? '(EMAIL_FROM has no domain)'}" in this Resend account. Domains here: ${list.map((x) => `${x.name} (${x.status})`).join(', ') || 'none'}`)
    process.exit(1)
  }
  if (cmd === 'verify') { const v = await api(`/domains/${d.id}/verify`, { method: 'POST' }); console.log(v.ok ? 'Asked Resend to check again.' : `verify failed: ${v.body?.message}`) }
  const full = await api(`/domains/${d.id}`)
  console.log(`${d.name}: ${full.body?.status ?? d.status} (region ${full.body?.region ?? '?'})`)
  // Hostinger's Name field wants the part before the zone (finalheaven.shop).
  const zone = d.name.split('.').slice(-2).join('.')
  for (const rec of full.body?.records ?? []) {
    const host = rec.name === zone ? '@' : rec.name.replace(new RegExp(`\\.?${zone.replace('.', '\\.')}$`), '')
    console.log(`  ${rec.status.padEnd(9)} ${rec.type.padEnd(4)} Name: ${host.padEnd(28)} ${rec.priority != null ? `Priority: ${rec.priority}  ` : ''}Value: ${rec.value}`)
  }
} else if (cmd === 'send') {
  if (!to || !/^[^\s@]+@[^\s@]+$/.test(to)) { console.error('Usage: node scripts/email-test.mjs send you@example.com'); process.exit(1) }
  let from = FROM
  try {
    const { d } = await findDomain()
    if (!d || !['verified', 'partially_verified'].includes(d.status)) { from = 'Final Heaven <onboarding@resend.dev>'; console.log('Domain not verified yet: sending from onboarding@resend.dev (only reaches the Resend account’s own email).') }
  } catch { /* a sending-only key can't read domains: try EMAIL_FROM as is */ }
  const out = mkdtempSync(join(tmpdir(), 'fh-email-'))
  const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vitest', 'run', 'tests/email-samples.render.test.ts'], { env: { ...process.env, EMAIL_RENDER_OUT: out }, encoding: 'utf8', shell: process.platform === 'win32' })
  const files = readdirSync(out)
  if (!files.length) { console.error(`Couldn't render the samples:\n${(r.stdout ?? '') + (r.stderr ?? '')}`.slice(0, 1500)); process.exit(1) }
  // One email per test by default: every send counts against the production quota.
  const picked = which === '--all' ? files : files.filter((f) => f === `${which}.json`)
  if (!picked.length) { console.error(`Unknown sample ${which}: campaign, order-paid, order-shipped or --all`); process.exit(1) }
  for (const f of picked) {
    const e = JSON.parse(readFileSync(join(out, f), 'utf8'))
    const s = await api('/emails', { method: 'POST', body: JSON.stringify({ from, to: [to], subject: `[Test] ${e.subject}`, html: e.html, text: e.text }) })
    console.log(`${f.replace('.json', '').padEnd(14)} ${s.ok ? `sent (${s.body.id})` : `failed: Resend ${s.status} ${s.body?.message ?? ''}`}`)
    await new Promise((res) => setTimeout(res, 600))
  }
} else {
  console.error('Usage: node scripts/email-test.mjs status | verify | send <to>')
  process.exit(1)
}
