// Resend adapter, per the official docs checked 18 Oct 2026:
//   send: POST https://api.resend.com/emails  {from, to, subject, html, text, reply_to, tags} -> {id}
//   `Idempotency-Key` header: the same key within 24 hours returns the first
//   result instead of sending again, so a retried send can't double-deliver.
// Free plan: 100 emails/day, 3,000/month, 2 requests/second.

const ENDPOINT = 'https://api.resend.com/emails'
const TIMEOUT_MS = 10_000

export type OutgoingEmail = {
  from: string
  to: string[]
  subject: string
  html: string
  text: string
  replyTo?: string | null
  tags?: { name: string; value: string }[]
}

export class EmailError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly status?: number) {
    super(message)
  }
}

export type EmailSender = { send(email: OutgoingEmail, idempotencyKey: string): Promise<{ id: string }> }

export function createResendSender({ apiKey, fetchImpl, timeoutMs = TIMEOUT_MS }: {
  apiKey: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): EmailSender {
  const doFetch = fetchImpl ?? fetch
  return {
    async send(email, idempotencyKey) {
      let res: Response
      try {
        res = await doFetch(ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey.slice(0, 256),
          },
          body: JSON.stringify({
            from: email.from,
            to: email.to,
            subject: email.subject,
            html: email.html,
            text: email.text,
            ...(email.replyTo ? { reply_to: email.replyTo } : {}),
            ...(email.tags?.length ? { tags: email.tags } : {}),
          }),
          signal: AbortSignal.timeout(timeoutMs),
          cache: 'no-store',
        })
      } catch (e) {
        throw new EmailError(`Resend request failed: ${(e as Error).name}`, true)
      }
      const body = await res.json().catch(() => null)
      if (!res.ok || typeof body?.id !== 'string') {
        // 429 is the rate or daily quota; 401/403 are a key or unverified-domain
        // problem the owner can fix, so those wait for a later run too. Other
        // 4xx (bad address, invalid request) won't succeed on retry.
        const retryable = res.status >= 500 || [401, 403, 429].includes(res.status)
        throw new EmailError(`Resend ${res.status}: ${body?.message ?? 'unexpected response'}`, retryable, res.status)
      }
      return { id: body.id }
    },
  }
}
