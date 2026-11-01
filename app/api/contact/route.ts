import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { BadRequest, email, handle, readJson, text } from '@/lib/api'
import { getStorefront } from '@/lib/tenancy'
import { rateLimit } from '@/lib/rate-limit'
import { sendQueuedEmails } from '@/lib/email'
import { newSupportReference } from '@/lib/support'

export const dynamic = 'force-dynamic'

const TOPICS = ['order', 'return', 'privacy', 'other']

/** Contact form. Stored for staff in Admin → Messages, and emailed to STAFF_ALERT_EMAIL when set. */
export const POST = handle('contact.create', async (req: NextRequest) => {
  const limited = await rateLimit(req, 'contact.create', 5, 3600)
  if (limited) return limited

  const body = await readJson(req, 8_000)
  // Honeypot: real people never fill the hidden "website" field.
  if (typeof body.website === 'string' && body.website.trim()) return NextResponse.json({ ok: true }, { status: 201 })

  const name = text(body.name, 'Name', { max: 120, required: true })!
  const from = email(body.email)
  const topic = typeof body.topic === 'string' && TOPICS.includes(body.topic) ? body.topic : 'other'
  const orderNumber = text(body.orderNumber, 'Order number', { max: 40 })?.toUpperCase() ?? null
  if (orderNumber && !/^[A-Z0-9-]{4,40}$/.test(orderNumber)) throw new BadRequest('That doesn’t look like an order number.')
  const message = text(body.message, 'Message', { max: 5000, required: true })!
  if (message.length < 10) throw new BadRequest('Please tell us a little more (at least 10 characters).')

  const store = await getStorefront()
  // The reference is unique per store: on the rare clash, draw another.
  for (let attempt = 1; ; attempt++) {
    const { error } = await createSupabaseServiceClient().from('contact_messages').insert({
      tenant_id: store.tenantId, store_id: store.storeId, name, email: from, topic, order_number: orderNumber, message, reference: newSupportReference(),
    })
    if (!error) break
    if (error.code !== '23505' || attempt >= 5) throw error
  }
  await sendQueuedEmails() // staff alert (reply-to is the customer) and the customer's acknowledgement
  return NextResponse.json({ ok: true }, { status: 201 })
})
