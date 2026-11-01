// Shared by the Outbox pages: the JSON helper, and sending approved batches in small steps while a page is open.
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || 'Something went wrong. Try again.')
  return data as T
}

export type DrainProgress = { sent: number; failed: number; skipped: number; remaining: number; paused: string | null }

/** Calls the send step again until nothing is left or it pauses (budget, Resend). Returns what was sent and why it stopped. */
export async function drainApproved(onStep?: (p: DrainProgress) => void): Promise<{ sent: number; paused: string | null; remaining: number }> {
  let sent = 0
  for (;;) {
    const { progress } = await api<{ progress: DrainProgress }>('/api/admin/outbox/drain', { method: 'POST', body: '{}' })
    sent += progress.sent
    onStep?.(progress)
    if (progress.paused || progress.remaining === 0 || (progress.sent === 0 && progress.skipped === 0 && progress.failed === 0)) return { sent, paused: progress.paused, remaining: progress.remaining }
  }
}

export const label = 'mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-final-muted'
export const field = 'w-full rounded-lg border border-final-off-white/15 bg-final-black px-3 py-2 text-sm text-final-off-white focus:border-final-off-white/40 focus:outline-none'
export const btn = 'rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-40'
export const date = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
