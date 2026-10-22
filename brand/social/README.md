# Social creatives: Gothic Angel Print drop

Instagram first. Every creative is built from the product images in `../products`, with prices as on the store on 22 Oct 2026:
- Hoodie ₦20,000, down from ₦40,000.
- T-shirt ₦15,000.

Re-render these if the prices change.

| File | Size | Use | What it's for |
|---|---|---|---|
| `feed-square/01-new-drop-hoodie-black.png` | 1080 × 1080 | Feed post, ad | Launch announcement, price-led |
| `feed-square/02-front-back-hoodie-white.png` | 1080 × 1080 | Feed, carousel | Front-and-back presentation |
| `feed-square/03-colourway-tee.png` | 1080 × 1080 | Feed, ad | Colourway comparison |
| `feed-square/04-brand-awareness.png` | 1080 × 1080 | Feed, profile highlight | Brand awareness, no price |
| `feed-square/05-clean-hoodie-black-back.png` | 1080 × 1080 | Feed, carousel, ad | Clean product photo, no text |
| `feed-portrait/01-showcase-hoodie-black-back.png` | 1080 × 1350 | Feed ad (best feed size) | Product showcase with "Shop now" |
| `feed-portrait/02-front-back-tee-black.png` | 1080 × 1350 | Feed ad | Front-and-back presentation |
| `feed-portrait/03-colourway-hoodie.png` | 1080 × 1350 | Feed ad | Colourway comparison |
| `story/01-new-drop-hoodie-black.png` | 1080 × 1920 | Story, Reel cover | Launch, "Shop the drop" |
| `story/02-colourway-tee.png` | 1080 × 1920 | Story | Colourway poll ("Black or white?") |
| `story/03-showcase-hoodie-white-back.png` | 1080 × 1920 | Story ad | Showcase on black, "Shop now" |

In the Stories, all text and buttons sit between 250 px from the top and 340 px from the bottom, clear of Instagram's own interface.

## Links

Use tagged links, so Admin → Analytics shows which post brought visitors (analytics keeps the `utm_source`, `utm_medium` and `utm_campaign` tags):

- Hoodie: `https://www.finalheaven.shop/product/p1778969625006?utm_source=instagram&utm_medium=social&utm_campaign=gothic-angel-drop`
- T-shirt: `https://www.finalheaven.shop/product/p1779109863726?utm_source=instagram&utm_medium=social&utm_campaign=gothic-angel-drop`
- For paid ads, use `utm_medium=paid` and a campaign name per test, e.g. `utm_campaign=gothic-angel-price-vs-clean`.

## Caption starters

- **Launch:** "New drop: the Gothic Angel Print hoodie, black or white. Limited run. ₦20,000 (was ₦40,000). Link in bio."
- **Colourway:** "Black or white? Gothic Angel Print tee, ₦15,000. Vote in our story."
- **Front and back:** "Front: the mark. Back: the Gothic Angel. Limited-run streetwear, released in small drops."

## Testing (one change per pair, product unchanged)

| Test | A | B |
|---|---|---|
| Price vs clean | `feed-square/01` (price-led) | `feed-square/05` (no text) |
| Single view vs both views | `feed-portrait/01` | `feed-portrait/02` |
| Light vs dark background | `story/01` | `story/03` |
| One colour vs both | `feed-square/01` | `feed-portrait/03` |
