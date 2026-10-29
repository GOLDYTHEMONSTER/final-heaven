import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { getStorefront } from '@/lib/tenancy'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/log'

export const dynamic = 'force-dynamic'

const EVENTS = new Set(['page_view', 'product_view', 'add_to_cart', 'checkout_started', 'order_placed', 'payment_completed'])
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|axios|node-fetch/i
const NO_CONTENT = () => new Response(null, { status: 204 })

function device(ua: string): 'mobile' | 'tablet' | 'desktop' {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return 'tablet'
  if (/mobi|iphone|android/i.test(ua)) return 'mobile'
  return 'desktop'
}

const clean = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max).replace(/[^\w.\- ]/g, '') || null : null

/**
 * Privacy-first analytics. No cookies, nothing stored in the browser, no IP
 * or user agent kept: the database turns them into a hash with a salt that
 * rotates daily and is then destroyed. Visitors sending Do Not Track or
 * Global Privacy Control are not counted at all. Always answers 204 so it
 * never affects the page.
 */
export async function POST(req: NextRequest) {
  try {
    if (req.headers.get('dnt') === '1' || req.headers.get('sec-gpc') === '1') return NO_CONTENT()
    const ua = req.headers.get('user-agent') ?? ''
    if (!ua || BOT.test(ua)) return NO_CONTENT()
    if (await rateLimit(req, 'track', 300, 600)) return NO_CONTENT()

    const raw = await req.text()
    if (raw.length > 4_000) return NO_CONTENT()
    const body = JSON.parse(raw || '{}') as Record<string, unknown>
    if (typeof body.type !== 'string' || !EVENTS.has(body.type)) return NO_CONTENT()

    // Path only: query strings can carry personal data. UTM tags are read from it first.
    let path: string | null = null
    let utm: Record<string, string | null> = { source: null, medium: null, campaign: null }
    if (typeof body.url === 'string') {
      try {
        const u = new URL(body.url, 'https://placeholder.invalid')
        if (/^\/(studio|admin|login)(\/|$)/.test(u.pathname)) return NO_CONTENT()
        path = u.pathname.slice(0, 300)
        utm = {
          source: clean(u.searchParams.get('utm_source'), 100),
          medium: clean(u.searchParams.get('utm_medium'), 100),
          campaign: clean(u.searchParams.get('utm_campaign'), 100),
        }
      } catch {}
    }

    // Referring site's host name only, and not our own site.
    let referrerHost: string | null = null
    if (typeof body.referrer === 'string' && body.referrer) {
      try {
        const host = new URL(body.referrer).hostname.replace(/^www\./, '')
        if (host && host !== req.nextUrl.hostname.replace(/^www\./, '')) referrerHost = host.slice(0, 200)
      } catch {}
    }

    const productId = typeof body.productId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.productId) ? body.productId : null
    const country = req.headers.get('x-vercel-ip-country')
    const store = await getStorefront()

    const { error } = await createSupabaseServiceClient().rpc('track_event', {
      p_store: store.storeId,
      p_event: body.type,
      p_visitor_seed: `${clientIp(req)}|${ua}`,
      p_path: path,
      p_product: productId,
      p_referrer_host: referrerHost,
      p_utm_source: utm.source,
      p_utm_medium: utm.medium,
      p_utm_campaign: utm.campaign,
      p_device: device(ua),
      p_country: country && /^[A-Z]{2}$/.test(country) ? country : null,
    })
    if (error) logger.warn('track.failed', { error })
  } catch (error) {
    logger.warn('track.failed', { error })
  }
  return NO_CONTENT()
}
