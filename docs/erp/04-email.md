# Transactional email (Resend)

Migration: `supabase/migrations/20261018180000_email_outbox.sql`. Code: `lib/email/`. Tests: `tests/unit/email.test.ts`, `tests/db/email-outbox.test.ts`.

## Emails sent

| Email | To | When |
|---|---|---|
| Payment received (receipt) | customer | order becomes paid: Flutterwave or a payment staff record. Not sent if the order was already cancelled. |
| Order shipped | customer | status becomes shipped. Includes the courier and reference if they're set by then. |
| New paid order | `STAFF_ALERT_EMAIL` | order becomes paid. Flagged "refund needed" if the order was cancelled. Reply-to is the customer. |
| New message | `STAFF_ALERT_EMAIL` | contact form message. Reply-to is the customer, so replying answers them directly. |

No marketing email is sent. Newsletter sign-ups are stored only.

## How it works

1. **Queueing.** Database triggers write a row to `email_outbox` in the same transaction as the change, whichever path made it (redirect, webhook, reconciliation, staff).
   - A unique key (`kind:record id`) means each email is queued at most once.
   - Rows hold ids only. The address and content are read from the order or message at send time.
2. **Sending.** The server claims rows (`claim_email_outbox`, `SKIP LOCKED`) and sends each through Resend, with the row's key as the `Idempotency-Key`. This happens:
   - straight after the change that queued the email;
   - in the daily cron as a catch-up, up to 50 emails.
3. **Failures.**
   - These are retried by later runs, up to 5 attempts: quota, rate limit, a key or domain problem, network errors and 5xx.
   - A rejected address is not retried.
   - Anything still unsent after 3 days is dropped, so a receipt never arrives a week late.
4. **Not configured.** Without `RESEND_API_KEY` and `EMAIL_FROM`, nothing is sent and rows stay queued. Once you configure email, anything queued in the last 3 days is sent.

The outbox is service-role only. `/api/platform/health` shows whether email is configured and how many emails are queued or have failed. Log rows are kept 13 months (`run_retention`).

## Free-plan limits

100 emails a day, 3,000 a month, 2 requests a second. The sender spaces its sends about 0.55 s apart. A paid order uses 2 emails: the receipt and the staff alert. With staff alerts on, the daily cap is reached at roughly 40 orders, counting shipping notices too. Leave `STAFF_ALERT_EMAIL` empty to save quota, because the admin bell already shows these events.
