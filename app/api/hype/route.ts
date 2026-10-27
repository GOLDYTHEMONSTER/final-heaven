import { NextRequest, NextResponse } from 'next/server'
import { getStorefront } from '@/lib/tenancy'
import { rateLimit } from '@/lib/rate-limit'
import { BadRequest, handle, readJson } from '@/lib/api'
import { VISITOR_COOKIE, hypeEnabled, hypedBy, recordHype, scores, visitorId } from '@/lib/hype-server'

export const dynamic = 'force-dynamic'

const ID = /^[A-Za-z0-9_-]{1,64}$/
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|axios|node-fetch/i
// "Off" is the same for everyone, so the CDN keeps it for a minute: no function call per page view while Hype is off.
const OFF = () => NextResponse.json({ enabled: false }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } })

/**
 * Hype scores for some products (?ids=a,b,c, up to 60), and which of them
 * this browser has hyped. Answers { enabled: false } while Hype is off, so
 * the store shows nothing.
 */
export const GET = handle('hype.get', async (req: NextRequest) => {
  const ids = [...new Set((req.nextUrl.searchParams.get('ids') ?? '').split(',').filter((id) => ID.test(id)))].slice(0, 60)
  const store = await getStorefront()
  if (!(await hypeEnabled(store.storeId))) return OFF()
  const cookie = req.cookies.get(VISITOR_COOKIE)?.value
  const [products, mine] = await Promise.all([scores(store.storeId, ids), cookie ? hypedBy(visitorId(cookie).id, ids) : Promise.resolve([])])
  return NextResponse.json({ enabled: true, products, mine }, { headers: { 'Cache-Control': 'private, no-store' } })
})

/**
 * A hype from this browser. No account: a random id in a first-party cookie,
 * set on the first tap, keeps it to one per product. Rate-limited per
 * address; bots and other sites' pages are refused. The answer says whether it
 * counted, so the page never claims a hype the server didn't accept.
 */
export const POST = handle('hype.post', async (req: NextRequest) => {
  // Only this site's pages may hype (a browser always sends Origin on a cross-site POST).
  const origin = req.headers.get('origin')
  const originHost = (() => { try { return origin ? new URL(origin).host : null } catch { return 'invalid' } })()
  if (originHost && originHost !== req.headers.get('host')) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 })
  const ua = req.headers.get('user-agent') ?? ''
  if (!ua || BOT.test(ua)) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 })
  const limited = await rateLimit(req, 'hype', 30, 600)
  if (limited) return limited

  const body = await readJson(req, 500)
  if (typeof body.productId !== 'string' || !ID.test(body.productId)) throw new BadRequest('Unknown product.')
  const store = await getStorefront()
  const visitor = visitorId(req.cookies.get(VISITOR_COOKIE)?.value)
  const result = await recordHype(store.storeId, body.productId, visitor.id)
  if (result.status === 'off') return OFF()
  if (result.status === 'unknown_product') throw new BadRequest('That product can’t be hyped.')

  const res = NextResponse.json({ enabled: true, ...result }, { headers: { 'Cache-Control': 'private, no-store' } })
  if (visitor.fresh) {
    res.cookies.set(VISITOR_COOKIE, visitor.id, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 400 * 86_400 })
  }
  return res
})
