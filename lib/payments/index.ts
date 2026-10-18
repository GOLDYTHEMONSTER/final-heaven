import 'server-only'
import { logger } from '@/lib/log'
import { flutterwaveFromEnv } from './flutterwave'
import { supabasePaymentStore } from './store'
import type { Deps } from './service'

/** Production wiring: Supabase store, Flutterwave from env, structured logs. */
export function paymentDeps(): Deps {
  return {
    store: supabasePaymentStore(),
    provider: flutterwaveFromEnv(),
    log: (event, fields) => logger.info(event, fields),
  }
}

/** Absolute site origin for provider redirects; configured, not taken from the Host header. */
export function siteUrl(req: Request) {
  return process.env.SITE_URL || new URL(req.url).origin
}
