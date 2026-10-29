import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { BadRequest, email, handle, readJson, text } from '@/lib/api'
import { getStorefront } from '@/lib/tenancy'
import { rateLimit } from '@/lib/rate-limit'
import { ALERT_CONSENT } from '@/lib/consent'

// Per-request only: never cached or prerendered.
export const dynamic = 'force-dynamic'

/**
 * "Email me when it's available" for one product. Like the newsletter, it
 * needs an explicit consent tick and stores the wording agreed to. The reply
 * is the same whether or not this address already asked, so it can't be used
 * to check who has. Asking again re-arms an alert that has already been sent.
 */
export const POST = handle('alerts.subscribe', async (req: NextRequest) => {
  const limited = await rateLimit(req, 'alerts.subscribe', 5, 600)
  if (limited) return limited

  const body = await readJson(req, 2_000)
  const address = email(body.email)
  if (body.consent !== true) throw new BadRequest('Please tick the box to agree to receive this email.')
  const productId = text(body.productId, 'Product', { max: 100, required: true })!

  const store = await getStorefront()
  const db = createSupabaseServiceClient()
  const { data: product, error } = await db.from('products').select('id, category')
    .eq('store_id', store.storeId).eq('id', productId).eq('status', 'active').maybeSingle()
  if (error) throw error
  if (!product || store.hiddenCategories.includes(product.category)) throw new BadRequest('We couldn’t find that piece.')

  const { error: saveError } = await db.rpc('subscribe_product_alert', {
    p_tenant: store.tenantId, p_product: product.id, p_email: address, p_consent: ALERT_CONSENT,
  })
  if (saveError) throw saveError
  return NextResponse.json({ message: 'Thanks. We’ll email you once, when it’s available.' }, { status: 201 })
})
