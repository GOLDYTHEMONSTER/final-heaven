import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/admin'
import { BadRequest, email, handle, readJson } from '@/lib/api'
import { getStorefront } from '@/lib/tenancy'
import { rateLimit } from '@/lib/rate-limit'
import { LAUNCH_CONSENT, NEWSLETTER_CONSENT, WAITLIST_CONSENT } from '@/lib/consent'
import { sendQueuedEmails } from '@/lib/email'
import { WELCOME_DAILY_CAP, welcomeDecision } from '@/lib/email/lifecycle'
import { addToHeldBatch, templateApproved, welcomeTemplate } from '@/lib/email/batches-store'
import { TRIGGERS, triggerContent } from '@/lib/email/reachout'
import { logger } from '@/lib/log'
import { storeMoment } from '@/lib/catalog'
import { isEarly, parseInvite } from '@/lib/early-access'
import { joinEarly } from '@/lib/early-access-store'

// Per-request only: never cached or prerendered.
export const dynamic = 'force-dynamic'

const SOURCES: Record<string, string> = { footer: NEWSLETTER_CONSENT, membership_waitlist: WAITLIST_CONSENT, launch_waitlist: LAUNCH_CONSENT }

/**
 * Opt-in sign-up. Requires an explicit consent tick, and stores the exact
 * wording agreed to and when. Someone who unsubscribed and signs up again is
 * re-subscribed with fresh consent. A new subscriber gets one welcome email
 * (queued, then sent at once) once the owner has approved the welcome wording;
 * until then it waits in Studio → Outbox. It is capped store-wide per day, and
 * over the cap it is skipped rather than queued.
 */
export const POST = handle('newsletter.subscribe', async (req: NextRequest) => {
  const limited = await rateLimit(req, 'newsletter.subscribe', 5, 600)
  if (limited) return limited

  const body = await readJson(req, 2_000)
  const address = email(body.email)
  if (body.consent !== true) throw new BadRequest('Please tick the box to agree to receive emails.')
  const source = typeof body.source === 'string' && body.source in SOURCES ? body.source : 'footer'
  const store = await getStorefront()
  const db = createSupabaseServiceClient()

  const { data: existing, error: findError } = await db.from('newsletter_subscribers')
    .select('unsubscribed_at').eq('tenant_id', store.tenantId).eq('email', address).maybeSingle()
  if (findError) throw findError

  const { data: saved, error } = await db
    .from('newsletter_subscribers')
    .upsert(
      {
        email: address, source, tenant_id: store.tenantId, store_id: store.storeId,
        consent_text: SOURCES[source], consented_at: new Date().toISOString(), unsubscribed_at: null,
      },
      { onConflict: 'tenant_id,email' }
    )
    .select('id').single()
  if (error) throw error

  // Early access (lib/early-access): before checkout opens, everyone on a list gets a personal code,
  // and a new subscriber who came with a friend's code earns that friend a credit. A bonus, like the welcome.
  let early = false
  try {
    const { data: shop, error: se } = await db.from('stores').select('payments_open_on, payments_open_time').eq('id', store.storeId).single()
    if (se) throw se
    if (isEarly(shop.payments_open_on ?? null, storeMoment(store.timeZone, new Date()), shop.payments_open_time ?? null)) {
      early = Boolean(await joinEarly(db, { subscriberId: saved.id, isNew: !existing, invite: parseInvite(body.invite) }))
    }
  } catch (e) {
    logger.warn('newsletter.early_access_failed', { error: e })
  }

  // The welcome is a bonus: whatever goes wrong here, the sign-up itself stands.
  const decision = welcomeDecision(existing ? { unsubscribedAt: existing.unsubscribed_at } : null, new Date())
  if (decision.welcome) {
    try {
      const content = triggerContent('welcome', source, early)
      if (await templateApproved(db, store.tenantId, welcomeTemplate(source), content)) {
        const { error: queueError } = await db.rpc('queue_email_capped', {
          p_tenant: store.tenantId, p_kind: 'subscriber.welcome', p_ref_col: 'subscriber_id', p_ref: saved.id,
          p_cap: WELCOME_DAILY_CAP, p_skip_over_cap: true, p_key_suffix: decision.keySuffix,
        })
        if (queueError) throw queueError
        await sendQueuedEmails(3)
      } else {
        // The owner hasn't approved this welcome's wording yet: hold it for Studio → Outbox.
        await addToHeldBatch(db, {
          tenantId: store.tenantId, trigger: 'welcome', list: source, content, reason: TRIGGERS.welcome.why,
          recipients: [{ subscriberId: saved.id, email: address, why: 'Just signed up' }],
        })
      }
    } catch (e) {
      logger.warn('newsletter.welcome_failed', { error: e })
    }
  }

  // Same reply for new and existing addresses, so this can't be used to check who is subscribed.
  return NextResponse.json({ message: 'Thanks. You’re on the list.' }, { status: 201 })
})
