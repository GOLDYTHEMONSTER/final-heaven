// Per-campaign email results for the Studio, from Resend's webhook events
// (public.campaign_email_stats). Counts are people, not events. Opens and
// clicks only exist if tracking is on for the domain in Resend.

export type CampaignStats = { delivered: number; opened: number; clicked: number; bounced: number; complained: number }

export type StatsRow = { campaign_id: string; delivered: number | string; opened: number | string; clicked: number | string; bounced: number | string; complained: number | string }

/** The rows the database returns (bigints can arrive as strings), keyed by campaign. */
export function statsByCampaign(rows: StatsRow[] | null | undefined): Record<string, CampaignStats> {
  const n = (v: number | string) => Math.max(0, Number(v) || 0)
  return Object.fromEntries((rows ?? []).map((r) => [r.campaign_id, {
    delivered: n(r.delivered), opened: n(r.opened), clicked: n(r.clicked), bounced: n(r.bounced), complained: n(r.complained),
  }]))
}

/** What the Studio shows, in order, with the words for each. */
export const STAT_LABELS: [keyof CampaignStats, string][] = [
  ['delivered', 'Delivered'], ['opened', 'Opened'], ['clicked', 'Clicked'], ['bounced', 'Bounced'], ['complained', 'Complained'],
]
