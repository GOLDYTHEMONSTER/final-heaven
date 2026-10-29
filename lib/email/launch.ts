// The launch-day email, sent from the daily job once payments open.
// Pure flow over a small store seam, so it can be tested with fakes; the
// Supabase side is ./launch-store.ts. The sending itself is sendCampaignStep:
// per-subscriber keys in the database and in Resend mean nobody gets it twice,
// however often this runs.
import { LAUNCH_WINDOW, paymentsState } from '@/lib/catalog'
import type { CampaignContent } from './campaign'

/** Fixed words, built on the public launch wording (lib/catalog LAUNCH_WINDOW). */
export function launchCampaignContent(): CampaignContent {
  return {
    subject: 'Final Heaven is open',
    preheader: 'Checkout is live. Come and get yours.',
    heading: "We're open",
    body: [
      `The wait is over. You joined the Final Heaven waitlist ahead of the ${LAUNCH_WINDOW} launch, and checkout is open now.`,
      'Every piece is in the shop. Pick yours, pay securely, and we’ll email your receipt and your tracking details as your order moves.',
      'Thank you for being early.',
    ].join('\n\n'),
    ctaLabel: 'Shop now',
    ctaUrl: '/shop',
  }
}

export interface LaunchStore {
  state(): Promise<{ paymentsOpenOn: string | null; purchasesPaused: boolean; campaignId: string | null; sentAt: string | null }>
  /** The launch campaign, made on first call (exactly once). */
  ensureCampaign(content: CampaignContent): Promise<string>
  markSent(): Promise<void>
}

export type LaunchResult =
  | { state: 'not_open' | 'already_sent' | 'continuing' | 'sent' }
  | { state: 'paused'; reason: string }

/**
 * Carries the launch email one step further. `step` sends one small batch and
 * reports what's left (sendCampaignStep). Loops while there is time; whatever
 * is left (time, or Resend's quota) is picked up by the next daily run.
 */
export async function runLaunchEmail(deps: {
  store: LaunchStore
  step: (campaignId: string) => Promise<{ status: string; remaining: number; paused: string | null }>
  today: string
  /** Epoch ms after which no new step starts. */
  deadline: number
  /** A step takes a few seconds: don't start one that can't finish. */
  stepMs?: number
  now?: () => number
}): Promise<LaunchResult> {
  const now = deps.now ?? Date.now
  const s = await deps.store.state()
  if (s.sentAt) return { state: 'already_sent' }
  if (!paymentsState({ paymentsOpenOn: s.paymentsOpenOn, purchasesPaused: s.purchasesPaused }, deps.today).open) return { state: 'not_open' }

  const id = s.campaignId ?? await deps.store.ensureCampaign(launchCampaignContent())
  while (now() + (deps.stepMs ?? 6000) < deps.deadline) {
    const p = await deps.step(id)
    if (p.status === 'sent') {
      await deps.store.markSent()
      return { state: 'sent' }
    }
    if (p.paused) return { state: 'paused', reason: p.paused }
  }
  return { state: 'continuing' }
}
