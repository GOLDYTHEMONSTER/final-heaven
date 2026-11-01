---
name: fh-email
description: Final Heaven email templates and triggers. Use whenever you add, change or review an email the store sends (receipt, shipping, support, welcome, nurture, win-back, campaign, staff alert), add a trigger to the daily cron, or touch lib/email/*. Covers which emails are automatic and which wait for the owner's approval, the Resend free-plan budget, the template helpers, copy rules and the tests each email needs.
---

# Final Heaven emails

The plan behind this is `docs/erp/07-reachout.md`. Read it when you add a trigger. This skill tells you how to build one.

## 1. Classify the email first

Every email is in exactly one class. The class decides everything else.

| Class | Test | Permission | Path |
|---|---|---|---|
| **Service** | The customer did something and expects this reply (paid, shipped, delivered, refunded, asked for a restock alert, wrote to support, has an open checkout) | Automatic, never held | `email_outbox` row, kind `area.event` |
| **Staff** | It goes to the owner (`STAFF_ALERT_EMAIL`) | Automatic | `email_outbox`, kind `staff.*` |
| **Marketing** | We chose to send it (welcome backfill, nurture, retargeting, review ask, win-back, launch, campaign) | **Held** until the owner approves it in Studio → Outbox | held batch (`20261101100000_email_approvals.sql`) or campaign |

If you're unsure, it's Marketing. Never send a marketing email without an approval stamp. If the copy of an approved batch or template changes, it needs approving again.

## 2. Respect the budget (Resend free plan: 100 a day, 3,000 a month)

- Service and staff mail always goes first. The first 40 sends of each day are reserved for it.
- Marketing gets at most **60 a UTC day**, drained oldest approval first. It stops for the month at **2,700**.
- Every automatic sender also has its own daily cap. Look at the `EMAIL CAPS` comment in `app/api/cron/daily/route.ts` and add a line there for any new one. Queue through `queue_email_capped`:
  - use `p_skip_over_cap = true` when a missed email is fine (welcome);
  - use `false` when it should wait for tomorrow (alerts, nudges).
- Marketing frequency: at most **1 marketing email per person every 3 days**.
- A new trigger that could reach more than ~30 people at once must go through a held batch, never straight to the outbox.
- When testing, send ONE email (`node scripts/email-test.mjs send <to> <sample>`). Never loop, and never use `--all` unless asked.

## 3. Build the template

Templates are pure functions returning `RenderedEmail` (`{ subject, html, text }`).
- Service and staff templates go in `lib/email/templates.ts`.
- Lifecycle and marketing templates go in `lib/email/lifecycle.ts`, or a sibling file.

Use only the helpers in `templates.ts` / `lifecycle.ts`:

- `layout({ preheader, heading, body, footer })` is the dark template with the neon mark. It is the only wrapper.
- For the body, use:
  - `p(html)` for paragraphs;
  - `button(href, label)` for the one call to action;
  - `detailRows([[label, value]])` for key/value rows;
  - `itemDetails` and `lineAmount` for order lines;
  - `formatMoney(amount, currency)` for every price;
  - colours from `C` only.
- Footers:
  - service mail uses `customerFooter(site)`;
  - subscriber and marketing mail uses `subscriberFooter({ reason, unsubscribeUrl })`, which says why they got it and gives a one-click unsubscribe.
- Images: absolute URLs through `sized(url, 640)` from `lib/images`. Site paths get prefixed with `site`.
- **Escape everything** that came from a customer, staff member or the catalogue: `escapeHtml()` for text, and `escapeHtml(url)` inside `href`.
- **Always write the `text` version** too, with the same content. It must include the CTA URL and, for marketing, the reason and the unsubscribe URL.
- Marketing sends set the `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers, as `lib/email/campaign-send.ts` does.
- Each send has a stable idempotency/dedupe key: `kind:<ref id>[:occasion]`. A retry must never email twice.

## 4. Copy rules

- The voice is plain, short and warm. Use one idea per email and one button. Lead with what happened or what's in it for them. No exclamation-mark spam, no ALL CAPS, no fake urgency.
- Facts come from the code, never from memory:
  - business name, address and policy from `lib/legal` (`BUSINESS`, `POLICY`);
  - launch wording from `lib/catalog` (`LAUNCH_WINDOW`, `formatDay`);
  - prices from the database.
- Don't invent reviews, stock counts, sell-through or delivery times.
- The launch date stays vague ("November") until `stores.payments_open_on` is set.
- No third-party brand names. No `/studio` links in anything a customer receives.
- Subject lines: ≤ 50 characters, no emoji required. The preheader adds to the subject, it doesn't repeat it.
- Use curly quotes and apostrophes (’ “ ”), as the existing copy does.

## 5. Wire the trigger

1. **Decision.** A pure function that decides who qualifies: input rows plus `now`, output recipients and why they qualify. Unit-test it like `welcomeDecision`.
2. **Store.** A function in `lib/email/<name>-store.ts` (service key, `import 'server-only'`) that finds candidates and queues them:
   - it skips unsubscribed, unconsented and suppressed addresses (`suppressedAmong`);
   - service and staff mail goes to the outbox;
   - marketing mail creates or extends a held batch.
3. **Cron.** Call the store function from `app/api/cron/daily/route.ts` in its own `try/catch` with a `logger.error`. Then update the numbered step list in that file's comment.
4. **Outbox.** For a new outbox kind:
   - add it to `OutboxKind` in `lib/email/outbox.ts`, with a render branch there;
   - add a migration that recreates `email_outbox_kind_check` with **every** existing kind plus the new one;
   - add the migration's probe in `scripts/db-migrate.mjs`.
5. **Approval page.** For marketing, the held batch must carry enough for the approval page: the rendered email, the trigger reason, the list and the recipient count.

## 6. Tests before it's done

- **Render:** add the email to `tests/email-samples.render.test.ts`. Check:
  - the subject;
  - that customer text is escaped (feed it `<script>`);
  - that the text version has the CTA and, for marketing, the unsubscribe link.
- **Decision:** a unit test for the qualify function, covering the edge days (exactly 3, 7, 120, 180 days), unsubscribed, suppressed and already-sent.
- **Database:** a PGlite test in `tests/db/` for any new table or RPC. Staff can use it; a stranger and anon can't.
- **Checks:** `npm run typecheck`, `npm run lint` and `npx vitest run` pass.
- **Real send:** at most one test email, to the owner, only when asked.
