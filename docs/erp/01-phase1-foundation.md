# Final Heaven: Phase 1 foundation report

Branch `phase-1-foundation`, based on `master` at `1786125`. Not merged, not deployed, and the Phase 1 migration has **not** been applied to the live database. Everything below was validated in an isolated in-process Postgres.

## 1. What changed

**Tenancy.** Final Heaven is now tenant #1 with one store. New tables: `tenants`, `stores`, `memberships`, `roles`, `permissions`, `role_permissions`, `membership_roles`, `platform_admins`, `integration_configs`. Existing `products`, `drops`, `orders` and `newsletter_subscribers` gained `tenant_id` and `store_id`, backfilled, `NOT NULL`, with a composite foreign key that stops a row pointing at another tenant's store. A trigger stops rows from ever moving between tenants.

**RBAC.** 18 granular permissions and 9 starter roles (Owner, Administrator, Finance manager, Sales manager, Inventory manager, Customer support, Fulfilment staff, Analyst, Read-only). Tenants can add their own roles. Staff management can't escalate privileges: you can only grant roles whose permissions you hold, never to yourself, and only to members you outrank. So an Administrator can't make themselves Owner or Finance manager.

**Order and payment state.** Order status (fulfilment) and payment status are separate columns, both constrained. Transitions are enforced by a trigger against the `order_status_transitions` table. `confirmed` requires a verified payment. Every change is recorded in `order_events` (who, when, from, to). Staff can only update `status` and `tracking_number`: totals, items, addresses and payment status are column-protected.

**Payments (Flutterwave v3).** A provider interface (`lib/payments/types.ts`) with a Flutterwave adapter, checked against the official docs on 18 Oct 2026:
- server-side initiation, unique `FHP-` references, amounts in integer minor units
- verification by transaction ID and by reference; redirects and webhook bodies are never trusted
- the `verif-hash` webhook signature compared in constant time
- a durable, deduplicated event inbox (`payment_events`)
- idempotent, out-of-order-safe application in the database (`apply_verified_payment`): amount and currency must match, a success is terminal, and successful payments can't be rewritten or deleted
- a reconciliation job for missed or failed webhooks
- customer "pay now" retry, with no automatic re-initiation
- offline payment recording (`payments.record`), exact amount plus a note, audited

**Audit log.** `audit_events` is append-only for everyone, the service role included. Order transitions, payments, offline payments, catalogue edits and the reconciliation job are all recorded. Tenants see only their own audit trail, and only with `audit.read`.

**Platform plumbing.** Shared error handling (database rule violations become 4xx with readable messages), request IDs on every API response, structured JSON logs with secret redaction and email masking, Postgres-backed rate limiting on checkout, tracking, payment and newsletter endpoints, `/api/health` (public) and `/api/platform/health` (platform admins only), ESLint, Vitest.

**UI.** Checkout says "Order placed" (it used to say "Order Confirmed" before payment) and links to Flutterwave. A new `/checkout/complete` page verifies on return. Track Order shows payment status separately and offers "Pay now". Admin orders shows payment status, offers only valid next statuses, and has an offline payment form. Admin navigation is filtered by permission. A "no access" page appears for signed-in non-staff. The false "Secure checkout powered by Stripe" line is gone.

## 2. What was reused

The storefront, cart, checkout form, admin pages and product APIs; Supabase Auth with `@supabase/ssr`; the RLS model from 18 Oct, generalised rather than replaced; `lib/api.ts` validators; the existing `orders.timeline`, now maintained by a trigger, so the tracking page keeps working; the existing order and product columns. No new framework, queue or service: background work runs on Vercel Cron, rate limits and the event inbox live in Postgres.

## 3. Files and tables

| Area | Files |
| --- | --- |
| Migration | `supabase/migrations/20261018130000_phase1_tenancy_rbac_payments.sql` |
| Domain libraries | `lib/auth.ts`, `lib/tenancy.ts`, `lib/audit.ts`, `lib/rate-limit.ts`, `lib/log.ts`, `lib/money.ts`, `lib/checkout/` (was `lib/orders.ts`), `lib/api.ts`, `lib/payments/{types,flutterwave,service,store,index}.ts`, `lib/supabase/middleware.ts` |
| API | `app/api/orders`, `app/api/payments/{start,verify}`, `app/api/webhooks/flutterwave`, `app/api/cron/payments`, `app/api/health`, `app/api/platform/health`, `app/api/admin/{products,drops,orders,orders/payments}`, `app/api/{products,products/[id],products/suggestions,drops,newsletter}` |
| UI | `app/checkout/page.tsx`, `app/checkout/complete/page.tsx`, `app/track-order/page.tsx`, `app/cart/page.tsx`, `app/studio/(panel)/layout.tsx`, `app/studio/(panel)/orders/page.tsx`, `components/admin/AdminShell.tsx`, `app/studio/login/LoginForm.tsx` |
| Config | `vercel.json` (daily cron), `.eslintrc.json`, `vitest.config.ts`, `tsconfig.json` (`lib: esnext`), `.env.local.example`, `package.json` (`test`, `typecheck`) |
| Tests | `tests/db/*` (PGlite), `tests/unit/*` |

**New tables:** tenants, stores, platform_admins, permissions, roles, role_permissions, memberships, membership_roles, audit_events, order_status_transitions, order_events, payments, payment_events, integration_configs, private.rate_limits.
**Altered:** products, drops, orders (status values, payment_status, currency), newsletter_subscribers (unique per tenant).

## 4. Security decisions

- **Tenant from the server, never the browser.** The storefront tenant comes from `STOREFRONT_SLUG`; the staff tenant from their memberships (a cookie may pick one, but only if they're an active member).
- **Defence in depth.** Middleware checks for a session. The admin layout and every admin route check permissions. RLS enforces the same permissions on every query, and that's the real boundary.
- **Platform admins get no tenant data.** Platform health shows counts and timestamps only.
- **The service key** is used only for flows with no user session (checkout, tracking, webhooks, cron, rate limits), always after server-side validation, and never reaches a browser (`server-only`).
- **Payments**: provider-verified values only; reference must match (so a customer can't claim someone else's transaction ID); successful payments are immutable; overpayments are accepted and flagged; payments arriving for cancelled orders are recorded and flagged, without reviving the order.
- **Secrets** live in environment variables. `integration_configs` stores only references like `env:FLW_SECRET_KEY` (a check constraint rejects anything else).
- **Privileged SQL functions** live in an unexposed `private` schema, with execute grants set explicitly at the end of the migration.

## 5. Deployment requirements

The migration and the code **must go live together**: the old code can't insert orders without `tenant_id`, and the new code needs the `stores` table. Recommended order, for a window of seconds:

1. **Environment variables in Vercel** (Production and Preview): `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`, `FLW_SECRET_KEY`, `FLW_SECRET_HASH`, `CRON_SECRET`, `RATE_LIMIT_SECRET`, optionally `STOREFRONT_SLUG`. Start with Flutterwave **test** keys.
2. **Push the branch** and let Vercel build a Preview deployment. Don't promote it yet.
3. **Apply the migration** to the live database. It's transactional: on any error nothing changes. It was tested against data shaped like the live 4 orders and 5 products.
4. **Promote the Preview to Production** straight away.
5. **Flutterwave dashboard**: webhook URL `{SITE_URL}/api/webhooks/flutterwave`, secret hash = `FLW_SECRET_HASH`, retries on.
6. **Create the owner.** Add the user in Supabase Auth, then run:
   ```sql
   with m as (
     insert into public.memberships (tenant_id, user_id)
     select t.id, u.id from public.tenants t, auth.users u
      where t.slug = 'final-heaven' and u.email = 'owner@example.com'
     returning id)
   insert into public.membership_roles (membership_id, role_id)
   select m.id, r.id from m, public.roles r where r.key = 'owner' and r.tenant_id is null;
   ```
   To also see platform health: `insert into public.platform_admins (user_id) select id from auth.users where email = 'owner@example.com';`
7. **Turn off public sign-ups** in Supabase Auth.
8. **Check**: `/api/health` returns ok, sign in at `/studio/login`, place a test order, pay with a Flutterwave test card, and confirm the order shows Paid and Confirmed, `payment_events` shows `processed`, and `/api/platform/health` has no backlog.

Rollback: the migration is additive apart from the order status rename and the policy swap. Reversing it needs a written down-migration. I'd rather fix forward, and none was written because the live data is small.

## 6. Tests executed

| Check | Result |
| --- | --- |
| `npm test` (Vitest) | **94 passed**: 60 database tests on real Postgres (PGlite), 34 unit tests |
| Tenant isolation | Reads, writes, updates, deletes, forged `tenant_id`, moving rows between tenants, cross-tenant store pairing, outsiders, platform admins, suspended members |
| RBAC | Read-only can't write; nobody edits totals or payment status; privilege escalation blocked (5 cases) |
| Payments | Exact, duplicate, underpaid, wrong currency, missing amount, overpaid, failed-then-success, success-then-late-failure, cancelled order, unknown reference, immutability, provider ID reuse, inbox dedupe, offline payment permission, amount and note |
| Webhooks (service layer) | Bad signature rejected and nothing stored; body not trusted; duplicates processed once; provider outage leaves the event for reconcile; storage outage returns 500 so Flutterwave retries; unknown references ignored |
| Migration on legacy data | All rows kept and scoped; statuses mapped without claiming unverified payments as paid; prices and items byte-identical; legacy orders can still progress |
| Mutation checks | Removing the role-subset check and the underpayment check each made tests fail. This also exposed a real bug (cross-tenant role trigger ineffective under RLS), now fixed |
| `npm run typecheck` | Pass |
| `npm run lint` | 0 errors, 6 warnings (`<img>` in admin previews of arbitrary URLs; intentional) |
| `next build` | Pass; secret-key client confirmed absent from browser bundles |
| Security diff review | No server modules in client components; secrets referenced only server-side; every admin handler checks a permission; no raw errors returned |

**Not run, and why:**
- **HTTP end-to-end tests** of the routes against a real Supabase API: these need Supabase running locally (Docker isn't running) or a separate dev project, and the live database doesn't have the Phase 1 schema. Routes are covered through their service layer and the database tests.
- **A real Flutterwave sandbox call**: no test keys were provided. The adapter is tested against recorded response shapes from the docs.
- **Supabase Auth itself** (sign-in, JWT issuance) isn't covered by PGlite, which stubs `auth.uid()` and `auth.jwt()` exactly as PostgREST sets them.

## 7. Known limitations

- **Overselling is still possible.** Stock is checked but not reserved or decremented. That's Phase 2 (inventory reservations, movements, and protection against double deduction from duplicate webhooks).
- **Offline payments have a single approver.** Maker-checker comes with refunds in Phase 2.
- **The reconciliation cron runs daily**, so it works on Vercel Hobby. Webhooks and the return-page check are the primary path. More frequent runs need Vercel Pro or `pg_cron` with `pg_net` (both available in the project).
- **`private.rate_limits` rows aren't cleaned up yet.** Small, but grows. Belongs with the data-lifecycle jobs.
- **Rate limiting fails open** if Postgres is unreachable, so checkout stays up.
- **Still open from the audit:**
  - Admin Drops is still in-memory and Admin Tracking is browser-only.
  - The product field-name mismatch hides badges and sale prices.
  - Members-only isn't enforced.
  - The fake reviews remain.
  - Next.js 14 is end-of-life.
- **No customers table yet**: orders are keyed by email until Phase 2 adds authoritative customer records.
- **No tenant-switcher UI**: the cookie is supported, and only one tenant exists.

## 8. Recommended next phase (Phase 2: commerce and operations)

1. `customers` as the single customer record, linked from orders (backfilled by email, with no automatic merging of uncertain matches).
2. Product variants and SKUs; move images from base64 rows to Supabase Storage; fix the field mapping.
3. Inventory: `stock_movements` ledger, reservations at checkout with expiry, deduction once on payment (idempotent per payment), release on cancel, no automatic restock on refund.
4. Fulfilment records and shipment tracking references.
5. Refunds: request (`refunds.request`), approve (`refunds.approve`) by a different person, Flutterwave refund API, refund status separate from payment status.
6. Reconciliation views (payments vs orders vs Flutterwave settlements).
7. HTTP end-to-end tests against an isolated Supabase (local Docker or a dev project), plus a Flutterwave sandbox run.

Separately and soon: the Next 15/16 upgrade.
