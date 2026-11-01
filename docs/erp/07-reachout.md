# 07 · Reachout, approvals and support

How Final Heaven reaches people, by email and through Meta ads, and how it answers them. It follows the three-campaign structure from the Meta ads guide the owner chose:

- **Prospecting** finds new people.
- **Retention** converts warm people who haven't bought.
- **Retargeting** closes on the exact product someone looked at.

Email does the same three jobs for people who gave us their address. Ads do them for everyone else.

## The rule: who needs the owner's permission

| Class | Examples | Permission |
|---|---|---|
| **Service**: the customer caused it and expects it | receipts, shipped, delivered, refund, support replies, support acknowledgement, "email me when it's back" | **Sent automatically**, never held |
| **Staff**: to the owner | new order alert, new message alert, daily digest | **Sent automatically** |
| **Marketing**: we chose to send it | campaigns, welcome backfill, nurture series, win-back, launch announcement, review ask | **Held for approval** in Studio → Outbox |

Held emails wait in **Studio → Outbox → Waiting for you**. Each batch is its own page and shows:

- the rendered email, exactly as it will arrive;
- the subject and preheader;
- who gets it: the count, which list, and a sample of addresses;
- why each person qualifies (the trigger);
- what it costs in quota: "uses 16 of today's 60 marketing sends, finishes today" or "spreads over 3 days".

The owner presses **Approve**, **Skip** or **Edit copy**. Nothing marketing is sent without an approval stamp (who, when). An approved batch that is later edited needs approving again.

## Resend free plan budget

The plan allows 100 emails a day and 3,000 a month, shared by everything.

| Pool | Daily | Monthly | Notes |
|---|---|---|---|
| Service + staff | first 40 reserved | ~1,200 | never capped; always sent first |
| Marketing (approved) | up to 60 | ~1,800 | an approved batch drains at ≤ 60/day, oldest approval first |

- The ledger counts sends per UTC day and per calendar month in `email_outbox`.
- The monthly figure is shown in the Outbox header, for example "1,240 of 3,000 used this month".
- Marketing pauses at 2,700 for the month, leaving 300 for receipts.
- Existing per-kind caps stay in place (checkout reminder 30, alerts 30, follow-up 30).
- Over 2,000 a month for two months running is the sign to move to a paid Resend plan, and Studio says so.

## Email triggers

In the Permission column: **A** = automatic, **H** = held for approval.

### Service (already built unless marked new)
| # | Trigger | Email | When | Permission |
|---|---|---|---|---|
| S1 | payment confirmed | Order receipt | at once | A |
| S2 | order marked shipped | Shipped + tracking | at once | A |
| S3 | order marked delivered | **new** Delivered | at once | A |
| S4 | refund recorded | **new** Refund confirmation | at once | A |
| S5 | delivered 3–14 days ago | "How's it fitting?" follow-up | daily cron, cap 30 | A |
| S6 | product they asked about becomes available | Back in stock / drop is live | daily cron, cap 30 | A (they asked) |
| S7 | contact form sent | **new** "We've got your message" + reference | at once | A |
| S8 | staff replies in Studio → Messages | **new** Support reply (threaded) | at once | A (staff wrote it) |
| S9 | checkout opened, not paid after 2 h | Checkout reminder, once | cap 30, 1 per address/24 h | A (their own cart) |

### Staff (already built unless marked new)
| # | Trigger | Email | Permission |
|---|---|---|---|
| T1 | order paid | New order alert | A |
| T2 | contact form sent | New message alert | A |
| T3 | daily 06:00 UTC | Digest (skipped when nothing happened) | A |
| T4 | **new** a held batch is waiting | Line in the digest: "2 emails waiting for your OK" | A |

### Marketing: Retention (warm, haven't bought)
| # | Trigger | Email | When | Permission |
|---|---|---|---|---|
| M1 | **new** subscriber never welcomed (backfill: the 16 current subscribers) | Welcome, worded for their list | once, after approval | H |
| M2 | new sign-up | Welcome | at once, cap 40 | A once the owner approves the welcome **template** (one approval covers future sign-ups until the copy changes) |
| M3 | **new** subscribed 3 days, no order | Nurture 1: the story, best sellers | daily cron | H (template + daily batch) |
| M4 | **new** subscribed 7 days, no order | Nurture 2: proof and objections (fit, sizing, delivery time, returns) | daily cron | H |
| M5 | launch day arrives (`payments_open_on`) | "We're open", to the launch waitlist, once | daily cron | H (change: it is a bulk send) |
| M6 | owner writes one in Studio → Campaigns | Campaign | when approved | H |

### Marketing: Retargeting (showed intent)
| # | Trigger | Email | When | Permission |
|---|---|---|---|---|
| R1 | **new** subscriber viewed the same product twice in 7 days, didn't buy | "Still thinking about it?" with that product | daily, 1 per person per 14 days | H |
| R2 | **new** low stock (≤ 3) on a product a subscriber viewed | "Almost gone" | daily | H |

### Marketing: Win-back (bought before)
| # | Trigger | Email | When | Permission |
|---|---|---|---|---|
| W1 | **new** delivered 21 days ago | Review ask (one question, link to the product) | daily | H |
| W2 | **new** last order 120 days ago | "New since you last shopped" | daily | H |
| W3 | **new** last order 180 days ago | Win-back; they also become eligible for Prospecting ads again (180-day rule) | daily | H |

Rules for every marketing trigger:

- consented subscribers only;
- skip anyone suppressed (bounce or complaint) or unsubscribed;
- at most one marketing email per person every 3 days;
- every email has a one-click unsubscribe;
- views are only joined to a subscriber after they've given us their email (first-party, same rule as analytics).

## Early access (before checkout opens)

Everyone who subscribes before `stores.payments_open_on` gets a personal code (`FH` + 6 characters), made on sign-up. Everyone on the list when this shipped got one too, in the migration.

- **The code:** 25% off their first order, plus 2 months of membership free when membership opens. The free months are recorded on the subscriber (`free_membership_months`).
- **Who can use it:** their own email only, once, until the end of the 30th day after launch day.
- **Invites:** each friend who joins through their link (`/?invite=CODE`) adds 5%. Another 5% is added when that friend's first paid order comes in, credited by the daily job. The total is capped at 35%.
- **Where the code goes:** the welcome email, as `{percent}`, `{code}` and `{invite_link}`, filled in per person when it is sent. Held welcome batches that still have the plain wording pick up the early access version.
- **Rules in code:** `lib/early-access.ts`. Data: `20261101400000_early_access.sql`. Studio → Promos shows the totals; the personal codes themselves aren't listed.
- **Abuse:** a fake email that "joins" earns at most the subscribe credit, and the 35% cap limits the damage.

## Support

- **Contact form** (`contact_messages`) gets a reference number. The customer gets an acknowledgement (S7) that says when they'll hear back.
- **Studio → Messages** becomes an inbox:
  - open / replied / closed;
  - each message shows the customer's orders when the email matches;
  - **Reply** sends S8 from `hello@`, with Reply-To set to the store address;
  - replies are kept with the thread.
- **Saved replies** cover the common questions: where's my order, sizing, delivery time, returns, payment failed. Staff can edit one before sending it.
- **Order-status self-service**: the "where's my order" saved reply links to the existing order tracking page.
- **Inbound email** (customers replying to hello@): Resend receiving is not on (the root MX is left pending). Until it is, replies go to the store's real inbox. Turning on inbound later threads replies into Messages.

## Ads (Meta), from the guide

The store supplies the parts that Meta needs. The campaigns themselves run in Meta Ads Manager. Admin stays the source of truth, and results are shown in Studio.

| Part | What we build | Data sent to Meta |
|---|---|---|
| Catalog feed for Retargeting | `/api/feeds/meta-catalog`: active, buyable products, price in NGN, image, link, availability. Sold-out items are filtered out. Drop and preorder sets are labelled. | Public product data only |
| Attribution | `utm_*` and `fbclid` are stored first-party on the visit, then the checkout, then the order. Studio → Analytics → **Ads** shows orders and revenue per campaign / ad set / ad. | None |
| Audiences for exclusions | Studio exports (CSV, SHA-256 hashed emails): **purchasers in the last 180 days** (excluded from Prospecting and Retention) and **warm subscribers who haven't bought** (included in Retention) | Hashed emails, uploaded by the owner by hand, of people who consented to marketing |
| Concept matrix | `brand/ads/concepts.md`: 3 concepts × 5 variants (persona, angle, offer, ad type) and RT #1–#5 (objections, proof, urgency, detail), built from the existing social packs | None |
| Budget helper | Studio → Analytics → Ads: daily budget = target conversions × expected CPA ÷ test days, and the 70 / 20 / 10 split | None |

Deliberately **not** built yet: the Meta Pixel and the Conversions API. Both send visitor behaviour to Meta and need a cookie-consent banner. They are for the owner to decide later. The CSV audiences plus attribution cover the guide's exclusions without them.

## Build order

1. **Outbox approvals + welcome backfill** (M1 first, so the 16 subscribers can be welcomed as soon as the owner approves them), the budget ledger, then the remaining marketing triggers.
2. **Support inbox**: S7, S8, saved replies, order lookup.
3. **Ads**: feed, attribution, audience exports, concept matrix.
4. **Service additions**: S3, S4.

Migrations are additive. Each gets a probe in `scripts/db-migrate.mjs` and is applied before the code that reads it.
