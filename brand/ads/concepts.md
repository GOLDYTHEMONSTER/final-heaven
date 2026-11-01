# Meta ads: concept matrix and campaign settings

Built on 1 Nov 2026 from the live catalogue (read-only) and the social packs in `../social/`. Prices are as on the store that day. Re-check them before a launch, and re-render any creative whose price changed.

## Ground rules

- **Only what the store can back up.** No invented reviews, ratings, "sold" counts or "selling fast". A proof slot is marked **needs real reviews** until real ones exist (the store has had no paid orders yet).
- **Prices.** Say "was ₦45,000" only while the store shows that original price on the product.
- **The launch date stays vague.** Say "November". The day is announced separately once `payments_open_on` is set. Until then ads say "Browse now, checkout opens in November", never "buy now".
- **Urgency is real or absent.** "Last one" only when the store has one left. "20 of each" is true of Drop 01 only.
- **Nigeria only.** The store delivers within Nigeria and sells in naira.
- **Never advertised:** the hidden category (Vapes), members-only pieces, anything sold out or not yet released. The catalogue feed already leaves them out.
- **No third-party brand names** in copy, even for the accessories.
- **Safe area.** Reels and Stories keep text between 250 px from the top and 340 px from the bottom.

## What we can say (real, from the store and its policies)

| Topic | Fact |
|---|---|
| Delivery, in stock | 3–7 days after the order, within Nigeria |
| Delivery, ordered in from China | Standard 14–21 days, or Express by air 10–17 days (paid); the product page shows the estimate |
| Returns | 7 days for change of mind; the customer pays the return delivery; faults are reported within 7 days |
| Refunds | Processed within 5 business days of a return arriving and being checked |
| Payment | Online, through our payment partner |
| Sizing | The sizes each product lists. There is no size guide page yet: do not promise one |

## Campaign structure

Three campaigns, named the way the budget helper (Studio → Analytics → Ads) lists them. The split is 70 / 20 / 10.

| Campaign | Who | Audience | Excludes | Budget |
|---|---|---|---|---|
| **Prospecting** | People who don't know us yet | Nigeria, broad, interests as a hypothesis to test | Purchasers, last 180 days | 70% |
| **Retention** | Warm people who haven't bought (subscribers, engaged on Instagram, site visitors) | Warm subscribers who haven't bought (Studio export), plus site and Instagram engagers | Purchasers, last 180 days | 20% |
| **Retargeting** | People who looked at a product | Catalogue ads from the feed `/api/feeds/meta-catalog`: viewed or added to cart, not purchased | Purchasers | 10% |

Retargeting from site visits needs Meta's pixel, which is deliberately not installed (see "Owner decisions"). Until then Retargeting runs on engagers and the catalogue.

## Concept 1: The Rose Line (for her)

Six pieces, ₦17,000 each, was ₦45,000, sizes XS–L: Rose Ringer Baby Tee, Rose Waffle Tank, Heaven Sent Crop Top, Long-Stem Rose Tank, Rose Trio Ringer Baby Tee, Rose Tank. Creative: `../social/rose-line/`, `../social/shoot-02/w-*.jpg`, video `../social/video/01-rose-line`. Landing: `/shop?category=Ladies`.

| # | Persona (hypothesis) | Angle | Offer | Ad type | Hook |
|---|---|---|---|---|---|
| 1.1 | Women who already wear black and want a small detail | One detail, done well | ₦17,000, was ₦45,000 | Single image, 4:5 (Long-Stem Rose Tank on model) | "One rose, growing out of the mark." |
| 1.2 | Women who buy on price but won't settle on quality | The price drop | ₦17,000, was ₦45,000, six pieces | Carousel (cover, six pieces, "the price") | "Six pieces. One price. ₦17,000." |
| 1.3 | Women who shop for the cut | Fitted, ribbed, cropped | Sizes XS–L, in stock | Reel 9:16 (the Rose Line video, 15 s) | "Which one are you? Tee, tank or crop?" |
| 1.4 | Women who shop in pairs or send links to friends | Pick one for your friend | ₦17,000 each, in stock | Story with a poll ("Tee" / "Tank") | "Tee or tank? Vote." |
| 1.5 | Women who read the details | The print is the product | Heaven Sent Crop Top: a rose with wings, ₦17,000 | Single image, close-up of the print, no price | "A rose with wings." |

## Concept 2: The ₦17k back-print tees (for anyone)

Eight tees, ₦17,000, was ₦45,000, relaxed oversized fit, sizes S–XL: Awaken, Celestial Glyphs, Chrome Flames 07, Heaven Blade, Heaven Outline, Holy Ground, Seraph 07 Spec, Seraph Helm. Creative: `../social/17k-tees/`, video `../social/video/04-channel-17`. Landing: `/shop?category=T-Shirts`.

| # | Persona (hypothesis) | Angle | Offer | Ad type | Hook |
|---|---|---|---|---|---|
| 2.1 | Men and women who buy graphic tees for the back print | Eight prints, pick yours | ₦17,000 each | Carousel (the artwork, flat) | "Eight back prints. Which one is yours?" |
| 2.2 | Shoppers who compare prices | The price | ₦17,000, was ₦45,000 | Single image, price-led | "₦17,000. Was ₦45,000." |
| 2.3 | People who like a message on their clothes | The words on the back | Holy Ground Tee, ₦17,000 | Single image, on model | "Fear is loud. Faith is quiet." |
| 2.4 | Scrollers who stop for motion | Channel-flip | Eight tees, ₦17,000 | Reel 9:16 (Channel 17, 12 s) | "Flip the channel. Find yours." |
| 2.5 | Shoppers who want a safe first order | Relaxed fit, in stock, sizes S–XL | ₦17,000, in stock, delivered in 3–7 days | Single image, front-and-back | "Front: the mark. Back: the print." |

## Concept 3: Outerwear (for him, higher ticket)

Broken Star and Double Star tracksuits, ₦65,000 for the jacket and pants (one size, sold as a set). Football Track Jacket, red or black, ₦45,000. Puffer Gilet ₦55,000, Satin Bomber ₦60,000, Varsity Jacket ₦85,000. Sizes S–XL on the jackets. Creative: `../social/outerwear/`, `../social/shoot-02/m-*.jpg`, video `../social/video/02-outerwear`. Landing: `/shop?category=Tracksuits` and `/shop?category=Jackets`.

| # | Persona (hypothesis) | Angle | Offer | Ad type | Hook |
|---|---|---|---|---|---|
| 3.1 | Men who dress in sets | The set | Jacket and pants, ₦65,000 | Single image, 4:5 (Broken Star, on model) | "Sleeve to ankle. The broken-star tape." |
| 3.2 | Men who want one standout piece | The football cut | Red or black, ₦45,000 | Reel 9:16 (Outerwear, 15 s) | "A retro football cut. Crest on the chest." |
| 3.3 | Men who like all black | Double Star, all black | ₦65,000, set | Single image, product on dark background | "All black. A double line, single stars between." |
| 3.4 | Shoppers still choosing | Four outerwear pieces side by side | From ₦45,000 to ₦85,000 | Carousel (cover, set, jacket, "the rest") | "On the rack: gilet, varsity, bomber." |
| 3.5 | Shoppers who read the label | The back says it | Football Track Jacket: FINAL HEAVEN and 07 across the back | Single image of the back, no price | "Final. 07. Heaven." |

## Retention: RT #1 to #5

For warm people who haven't bought: subscribers and engagers. Lead with what stops a first purchase. One ad each, shown in the order below, then rotate. Copy is a draft; every claim is from the table above.

| # | Type | Message | Creative | Hook |
|---|---|---|---|---|
| RT 1 | Objection: delivery time | In-stock pieces arrive 3–7 days after you order, within Nigeria. Pieces ordered in from China show their estimate on the product page. | Product photo with the delivery estimate typeset on it | "How long will it take? 3 to 7 days, in stock." |
| RT 2 | Objection: returns | Seven days to change your mind. You pay the return delivery; faults are reported within seven days. | Plain typeset card, the Returns page link | "Not sure? You have 7 days." |
| RT 3 | Proof | **Needs real reviews.** Use the first verified customer reviews, with permission. Until they exist, show on-model photos only and do not write a review or a number. | On-model photo, review text added when it is real | "[Real review goes here]" |
| RT 4 | Urgency | Only what is true on the day: checkout opens in November; or "last one" on a piece with one left; or the stock count on a Drop 01 piece. | Product photo; "last one" label only when true | "Checkout opens this November." (before launch) / "The last one, size M." (when true) |
| RT 5 | Detail | What the piece actually is: print, trim and fit, from the product description. | Close-up of the print and trim | "Black ribbed racer tank, white trim, one long-stem rose." |

## Campaign settings checklist

Tick each one before turning a campaign on.

### Before launch (checkout still closed)

- [ ] Do not use a Sales or Purchase objective: checkout is closed until `stores.payments_open_on` is set, and no pixel is installed, so Meta can't see purchases anyway. Use **Traffic** (landing page views) or **Engagement** to warm audiences, and read results in Studio → Analytics → Ads.
- [ ] Every ad says "browse now, checkout opens in November".
- [ ] The catalogue feed is added in Commerce Manager as a scheduled feed from `https://www.finalheaven.shop/api/feeds/meta-catalog` (CSV, hourly).

### Structure

- [ ] Three campaigns: Prospecting, Retention, Retargeting. Budget 70 / 20 / 10 (use the budget helper).
- [ ] One ad set per campaign to start. One concept per ad set; the five variants of a concept are its five ads. Test one change at a time.
- [ ] Campaign budget (one budget per campaign) so Meta spreads it across the five ads, not a budget per ad.
- [ ] Do not edit a running ad set for the first 3 to 4 days: every edit restarts learning.

### Audience

- [ ] Location: Nigeria only. Currency: naira.
- [ ] Prospecting and Retention exclude the **purchasers, last 180 days** list (Studio → Analytics → Ads → Audiences for Meta).
- [ ] Retention includes the **warm subscribers who haven't bought** list. Only people who agreed to marketing emails are in it; the file holds SHA-256 hashes of lower-cased emails, uploaded by hand.
- [ ] Refresh both lists before each campaign restarts. Every download is in the audit log.
- [ ] Hidden or restricted categories are never advertised.

### Creative and placements

- [ ] Formats ready for each ad: 4:5 feed (1080 × 1350), 9:16 Reel or Story (1080 × 1920), 1:1 (1080 × 1080).
- [ ] Text clear of the top 250 px and the bottom 340 px of vertical formats.
- [ ] Price on the creative matches the store on the day.
- [ ] The first second shows the product, not a flash or a logo.

### Tracking

- [ ] On every ad, in "URL parameters": `utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{adset.name}}&utm_term={{ad.name}}`.
- [ ] Name campaigns, ad sets and ads in plain words you will recognise in Studio, for example `prospecting-rose-line`, `broad-nigeria`, `1.1-long-stem-rose`.
- [ ] Open Studio → Analytics → Ads after a day of spend: the tagged visitors should appear. If they don't, the link or the parameters are wrong.

### Reading results

- [ ] Compare ads inside one concept, on cost per tagged order (Studio) and visitors, not on likes.
- [ ] Decide the stop rule before spending: for example "pause an ad that has spent the expected cost of two orders with none". The owner sets the number; this file doesn't.
- [ ] Don't change what a concept is called mid-test: Studio matches orders to the names.

## Owner decisions

- **Meta pixel and Conversions API.** Not installed. They would let Meta optimise for purchases and build retargeting from site visits, but they send visitor behaviour to Meta and need a cookie-consent banner. Until decided, Sales objectives can't optimise on purchases.
- **Original prices.** Confirm "was ₦45,000" is a price the pieces were genuinely sold at before using it in ads.
- **Proof.** RT 3 stays empty until there are real customer reviews with permission to use them.
- **Launch day.** The ad copy says "November" until the day is set in the store.
