# The Product Worker

A Claude Code subagent that prepares products while the main session keeps working on the website. It is defined in `.claude/agents/final-heaven-product-worker.md`, and this page is its manual.

## The quickest way

Type `/product` followed by the 1688 title and link (attach the screenshots and photos as usual). The main session hands everything to the worker in the background and goes back to development. When the worker has questions (price, sizes, the shop's name), they come back to you as quick choices.

Every bought-in product is logged against its supplier (Admin → Suppliers). When the shop's name isn't known yet, the worker names it after what it sells, adds "(name to confirm)", and asks you for the real name.

## Asking for it

Send the product the way you do now (screenshots, photos, the 1688 link, a price if you have one), and start with "product worker". For example:

- "Product worker: prepare this product." It makes the photos, writes the listing, validates it, and asks you what's missing. Nothing is saved to the store.
- "Product worker: prepare these and save them as drafts." Same, then each is saved as a draft (not on sale), status AWAITING_APPROVAL.
- "Product worker: what's waiting for approval?" It lists the queue.
- "Product worker: approve and publish striped-track-pants and seamless-gym-shorts." Only the products you name go on sale, and each is checked live.
- "Product worker: retry the failed ones." It re-validates and re-drafts; work already done (uploaded photos, saved ids) isn't repeated.
- "Product worker: reject the beech bat, return rate too high."

The main session hands your message, the image paths and any prices to the worker, then passes its report back to you. Each run is a normal Claude Code task: it runs while you're in the session and uses your plan's usage. Nothing runs in the background on its own.

## Statuses

| Status | Meaning |
|---|---|
| RECEIVED | Folder started |
| PROCESSING | Being saved to the store right now |
| NEEDS_INFORMATION | A question for you blocks it (price, sizes, supplier cost) |
| DRAFT_READY | Passed validation, not saved to the store yet |
| AWAITING_APPROVAL | Saved as a draft in the store, not on sale |
| APPROVED | You said yes; ready to publish |
| PUBLISHING | Going on sale right now |
| PUBLISHED | On sale, and the live page answered |
| FAILED | Something went wrong; the error is recorded, retry is safe |
| REJECTED | You said no; reopen it with `status <slug> RECEIVED` |

## Where things are

- `brand/catalog/<slug>/product.json` is the record. Its `queue` block holds the status, the last validation, the pricing and the history (in git).
- `brand/catalog/<slug>/*.jpg` are the store photos, and `supplier/` holds the untouched originals. Both stay out of git; the store copies live in Supabase Storage.
- `brand/catalog/_worker/log.jsonl` has every status change with its time (not in git).
- `brand/catalog/worker-rules.json` holds the pricing targets, categories, sized categories, and the claims and brand names that need a second look. Edit it freely.
- `tools/product-photos/` holds the photo scripts. Their libraries (~350 MB) live outside the repo, in `%LOCALAPPDATA%\final-heaven\photo-tools`. On a new machine, run `node tools/product-photos/setup.mjs` once.

## The queue by hand

```sh
node scripts/product-queue.mjs list                  # everything, then the batch summary
node scripts/product-queue.mjs list AWAITING_APPROVAL
node scripts/product-queue.mjs validate --all        # re-check every product (writes nothing to the store)
node scripts/product-queue.mjs review <slug>         # big photo review sheet: brand/catalog/_worker/review/<slug>.jpg
node scripts/product-queue.mjs photos-ok <slug>      # the owner has seen the photos and they're fine
node scripts/product-queue.mjs approve <slug>
node scripts/product-queue.mjs publish <slug>
```

## Pricing

Owner's rule, 13 Nov 2026: **every price carries its own freight and card fee, and still keeps at least 45%.** Delivery stays free for customers, so the price has to pay for the trip from China.

Landed cost = supplier price × the rate on the day, plus China domestic shipping, international freight, and customs and clearing.
- **International freight** is the product's own figure (`source.shipping_cost_ngn`) when there is one. Otherwise it is worked out from the packed weight (`shipping.weight_kg`) and the rates in `worker-rules.json`: air is $9/kg × ₦1,550 × 1.1 for the box. Sea-only products (batteries) use the sea rate, which is not set yet, so their margin stays provisional.
- **Every product needs a packed weight.** Without one the freight is missing and the margin is only on the goods.

Margin = (selling price − landed cost − card fee) ÷ selling price. The card fee is 1.4%, capped at ₦2,000. Returns and overheads are not in it, which is why the floor is 45%.

- The suggested price keeps the 50% target, rounded up to ₦500.
- **A price under the 45% floor blocks the draft.** The report gives the lowest price that keeps the floor. Only the owner can let a product go below it, by saying so for that product (recorded as `queue.below_floor_approved`, with the reason in the notes).

The worker never invents a rate or a freight cost. While those are missing, the margin is marked provisional and the missing costs are listed. You set the real price.

## Safety

- Publishing needs your approval of each product by name. The queue itself refuses to publish anything you haven't approved.
- **Photos are reviewed before anything goes on sale.** `review` makes a sheet with one big tile per photo. You look at it, and only after you say the photos are fine does `photos-ok` unlock `approve` and `publish`. Change a photo afterwards and the OK is void: review again.
- The worker is told to stay in `brand/catalog/` and `tools/product-photos/`, and it checks itself at the end of every run. `guard check` lists anything it changed outside those folders.
- Claude Code subagents share the main session's working folder: the limits come from the agent's instructions and that check, not from a sandbox.
- It never commits, pushes, deploys, runs SQL or reads `.env.local` out loud. Saving drafts and publishing go through `scripts/add-product.mjs`, which uses the service key without printing it.

## Still manual

- **Your answers:** prices, size charts, battery capacities, packed weights, and freight and customs costs.
- **Reading 1688 listings:** pages need a login, so the worker works from your screenshots.
- **Committing** the product records now and then (they're content only and don't trigger a deploy).
