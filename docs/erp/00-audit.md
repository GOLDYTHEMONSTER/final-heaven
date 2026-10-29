# Final Heaven: Phase 0 audit

Audited 18 October 2026 against the code on `master` at commit `1786125` and the live Supabase project (`tdornzctuleymhbctsyy`), read-only. No production data was modified during the audit.

## 1. Current architecture

| Layer | What exists |
| --- | --- |
| Frontend | Next.js 14.2.35 App Router, React 18, Tailwind 3, framer-motion, zustand. Every page is a Client Component that fetches its own data. |
| Backend | Next.js route handlers under `app/api/*`. No separate service, no server actions. Shared helpers: `lib/api.ts` (validation, generic errors), `lib/auth.ts` (admin check). |
| Database | Supabase Postgres 17.6. Four tables: `products` (5 rows), `orders` (4), `drops` (0), `newsletter_subscribers` (0). Schema in `supabase/schema.sql`, one migration (RLS). No foreign keys between tables, no tenant column. |
| Auth | Supabase Auth via `@supabase/ssr`. One role only: `app_metadata.role = 'admin'`. **No users exist yet**, so no one can sign in to admin. |
| Payments | Paystack, initiation only (`POST /transaction/initialize`). No verification, no webhook, and no `PAYSTACK_SECRET_KEY` configured, so no payment link has ever been generated. Products also carry hand-pasted Paystack "buy" page URLs that are unconnected to orders. **No Flutterwave code exists.** |
| Email, notifications, shipping | None. Membership sign-up is simulated (`setTimeout` and an `alert`). |
| Background jobs | None. `pg_cron` and `pg_net` are available in the project but not enabled. |
| Logging | `console.error` with a context label (`lib/api.ts`). No request IDs, no structured logs. |
| Caching | `/api/drops` revalidates every 60s; everything else is dynamic. |
| Deployment | Vercel (inferred from your standard; no `vercel.json` or CI workflow in the repo). The live site runs an older version of the code. |
| Tests | None. No test runner, no ESLint config. |

Other projects on this machine (fayfort-ops, fayfort-hub, schoolos, seecore, faysource, landed, lume) were checked for reusable tenant, RBAC and audit patterns. None have them, so Phase 1 follows the principles in the brief directly.

## 2. Features that work

- Storefront: home, shop with search and filters, product pages, new drops, cart (browser storage), checkout form, track order.
- Order creation with server-side totals from database prices, stock check, random references (hardened 18 Oct).
- Admin: product create, edit and delete; order list and status updates. Locked behind Supabase Auth plus RLS.
- RLS on all four tables, applied to the live database and verified.

## 3. Partially implemented

| Area | State |
| --- | --- |
| Payments | Initiation only, wrong provider for the brief, never verified. Orders are never marked paid by the system. |
| Order lifecycle | One free-text `status` column mixing payment and fulfilment (`ordered`, `processing`, `shipped`, `delivered`). Any value can be set; no transition rules. History is a JSONB `timeline` array appended by the API. |
| Inventory | `products.stock` is checked at checkout but never decremented. Overselling is possible. |
| Admin Drops | UI edits a hardcoded in-memory list; nothing is saved. The API exists but the page doesn't use it. |
| Admin Tracking | Reads the visitor's own browser storage (`interest-store`), so it only ever shows the admin's own browsing. |
| Product data mapping | API returns `is_new`, `members_only` and `original_price`; the UI reads `isNew`, `membersOnly` and `originalPrice`. Badges and sale prices never show. |
| Members-only products | Flag exists; nothing enforces it. |
| Reviews | Hard-coded "verified" reviews shown on every product page. |

## 4. Missing ERP/CRM capabilities

Tenancy and organisations, granular permissions, audit log, customers (orders store an email only), payments ledger, refunds, inventory movements and reservations, fulfilment records, accounting, suppliers, CRM (leads, pipeline, tickets), notifications, analytics, health monitoring, data retention, rate limiting, tests.

## 5. Security and data-integrity concerns

Fixed already (commit `1786125`): open admin, RLS disabled with public DELETE/TRUNCATE grants, client-supplied totals, order lookup by email, guessable order numbers, error leakage, middleware bypass CVE.

Still open, in priority order:

1. **Live checkout is down** until `1786125` is deployed with `SUPABASE_SERVICE_ROLE_KEY` set. The deployed (old) code writes orders with the public key, which RLS now refuses.
2. **No payment verification.** Nothing ties money received to an order.
3. **Next.js 14 is end-of-life** with unpatched critical advisories (image optimizer RCE, which is mitigated by disabling it; Windows-host RCE, which doesn't apply on Vercel; several DoS and SSRF issues). Fix: upgrade to Next 15.5.24+ or 16.
4. **No rate limiting** on checkout, tracking or newsletter.
5. **Overselling**: stock never decremented, no reservations.
6. **Product images are base64 data URLs inside rows**: 1.1MB for five products.
7. Credential hygiene: an (expired) GitHub token was in the git remote URL (removed 18 Oct); the database password was briefly in `.env.local.example` (never committed). Rotating the DB password is recommended.
8. Misleading UI: "Secure checkout powered by Stripe" in the cart, fake membership sign-up, fake reviews.

## 6. Database changes required (Phase 1)

| Change | Why |
| --- | --- |
| `tenants`, `stores`, `memberships`, `roles`, `permissions`, `role_permissions`, `membership_roles`, `platform_admins` | Tenant boundary and RBAC |
| `tenant_id` (and `store_id` where relevant) on `products`, `drops`, `orders`, `newsletter_subscribers`, backfilled to the Final Heaven tenant | Every tenant-owned row is scoped |
| `audit_events` (append-only) | Sensitive actions are auditable |
| `orders`: `currency`, `payment_status`, constrained `status`, transition trigger; `order_events` | Separate payment from fulfilment; enforce valid transitions |
| `payments`, `payment_events` | Payment attempts in integer minor units; durable, idempotent webhook inbox |
| `integration_configs` | Trusted, server-side mapping from provider account to tenant |
| `rate_limits` | Abuse protection that works across serverless instances |
| RLS rewritten from "is admin" to "has permission in this tenant" | Tenant isolation enforced in the database |

## 7. Recommended implementation sequence

1. **Phase 1 (this phase):** tenancy and RBAC, tenant columns, audit log, order and payment state model, Flutterwave adapter (initiate, verify, webhook, reconciliation job), rate limiting, request IDs and structured logs, health checks, test harness (Vitest and PGlite), ESLint.
2. **Phase 2:** customers table (authoritative), product variants and SKUs, inventory movements and reservations, fulfilment, refunds with maker-checker, reconciliation views. Fix the product field mapping and move images to Storage.
3. **Phase 3:** CRM (profiles, leads, pipeline, follow-ups, tickets) on top of the Phase 2 customers table.
4. **Phase 4:** double-entry ledger, reporting, KPIs.
5. **Phase 5:** notifications, retention jobs (pg_cron), more providers.
6. **Separately, soon:** Next 15/16 upgrade.

## 8. Breaking changes and migration risks

| Risk | Mitigation |
| --- | --- |
| Adding `tenant_id NOT NULL` to existing tables | Add nullable, backfill to the default tenant, then set NOT NULL, in one transaction. 9 existing rows. |
| Renaming order status `ordered` to `pending_payment` | One live row affected. The track-order and admin UIs are updated in the same change. |
| RLS policies replaced (admin role becomes permission-based) | No users exist yet, so no one loses access. The first owner is bootstrapped by SQL. |
| Paystack replaced by Flutterwave | No Paystack payment was ever generated, so there's no history to migrate. Product `product_url` values are kept. |
| Phase 1 code requires the Phase 1 migration | Deploy order: apply the migration, then deploy the code. The branch must not be merged before the migration runs. |
| Old deployed code vs new RLS | Already live. See concern 1. |

## Dependency map

```mermaid
graph TD
  subgraph Browser
    SF[Storefront pages] --> CS[cartStore<br/>localStorage]
    SF --> IS[interestStore<br/>localStorage]
    ADM[Admin pages] --> IS
    LOGIN[/studio/login/] --> SBA[Supabase Auth]
  end

  subgraph "Next.js server"
    MW[middleware.ts] --> AUTH[lib/auth.ts]
    ALAY[admin/layout.tsx] --> AUTH
    PAPI[/api/products, /api/drops/] --> PUB[public client<br/>publishable key + RLS]
    OAPI[/api/orders/] --> SVC[service client<br/>bypasses RLS]
    NAPI[/api/newsletter/] --> SVC
    AAPI[/api/admin/*] --> AUTH
    AAPI --> USR[user client<br/>session + RLS]
    OAPI --> PAY[Paystack initialize]
    ALL[all routes] --> API[lib/api.ts]
  end

  subgraph Supabase
    PROD[(products)]
    ORD[(orders)]
    DROP[(drops)]
    NEWS[(newsletter_subscribers)]
    SBA
  end

  SF --> PAPI
  SF --> OAPI
  SF --> NAPI
  ADM --> AAPI
  PUB --> PROD & DROP
  SVC --> PROD & ORD & NEWS
  USR --> PROD & ORD & DROP
  ORD -. order_items JSON copies .-> PROD
```

There are no foreign keys: orders copy product data into JSON, so a deleted product leaves orders intact but unlinked.
