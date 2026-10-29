// "Email me when it's available". The daily job finds waiting alerts whose
// product can now be bought and queues one email each, at most ALERT_DAILY_CAP
// a day (queue_email_capped), so alerts can't eat Resend's free quota. Anyone
// over the cap simply waits for tomorrow: their alert is still there.
import { canBuy, purchaseState, type CatalogueProduct } from '@/lib/catalog'

export const ALERT_DAILY_CAP = 30
/** Waiting alerts looked at per run; the rest wait for the next. */
export const ALERT_SCAN_LIMIT = 300

export type AlertCandidate = { id: string; product: (Partial<CatalogueProduct> & { category?: string | null }) | null }

/**
 * The alerts to send now: the product exists in the store, isn't in a hidden
 * category, and purchaseState says it can be bought (available or pre-order).
 * Sold out, coming soon, members-only, paused and delisted all keep waiting.
 */
export function readyAlerts(candidates: AlertCandidate[], today: string, hiddenCategories: string[] = []): string[] {
  return candidates
    .filter((c) => c.product
      && !(c.product.category && hiddenCategories.includes(c.product.category))
      && canBuy(purchaseState(c.product as CatalogueProduct, today)))
    .map((c) => c.id)
}
