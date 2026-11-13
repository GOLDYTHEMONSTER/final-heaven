# Product carousel

An Instagram carousel for a single product, in the house style:

- Slides are 1080 × 1350 (4:5, the tallest feed post).
- Studio paper background.
- The mark and FINAL HEAVEN at the top left, and the slide number at the top right.
- Crop marks in the corners.
- Archivo extended for the name, JetBrains Mono for small labels.

## Slides

| # | Slide | Shows |
|---|---|---|
| 01 | Cover | Front and back together, then the name, colour and price |
| 02 | Back | The back print, as large as the box allows |
| 03 | Front | The front on its own (the mark) |
| 04 | Shop | Both views (smaller), colour, sizes, price, "Within Nigeria" delivery, Shop now, link in bio |

A product with only a back shot gets two slides: the cover (back view) and the shop slide.

## Placement

The script cuts each garment out of its mockup:

- It measures the backdrop colour and trims to the garment.
- For a spread, it splits the front from the back, even when the sleeves touch.
- When the two garments overlap, each one hides the tip of the other's sleeve, and nothing is rebuilt, because a rebuilt sleeve shows. Slides 02 and 03 instead become a closer full-bleed framing of the original photo, centred on that garment. The other garment's sleeve runs off the slide edge, as in any photo crop, and every pixel is untouched.

Each garment is then fitted to the same box on every slide:

| Slide | Box |
|---|---|
| Cover | 936 × 820 from y 168 |
| Back or front | 860 × 960 from y 150 |
| Shop | 760 × 500 from y 168 |

Every product therefore sits at the same size and height, whatever padding the mockup had. The slide background is the mockup's own backdrop, so there's no visible edge around the garment.

## Making one

1. Put the mockup in `source/`. Use a front-and-back spread (front on the left) on the studio backdrop, ideally 1600 px wide or more. A 896 px mockup works but is softer.
2. Add a line to `carousel.json`:

   ```json
   { "slug": "eagle-washed-hoodie", "id": "p1794119989099", "spread": "source/eagle-washed-hoodie.png" }
   ```

   - `id` is the store product id (in `brand/catalog/<slug>/product.json`).
   - Add `"back": "source/…png"` for a sharper back-only shot on slide 02.
   - Use `"back"` alone when there is no spread.

3. Run `node brand/social/carousel/carousel.mjs <slug>`. It needs Chrome and the internet. Leave out the slug to rebuild them all.

## Output

The slides are written to `<slug>/01-cover.png` and onwards, with `_sheet.jpg` as a contact sheet for review.

The name, colour, price and sizes are read from the live store on every build, so they always match the shop. Rebuild after a price change. If the product isn't live, the build stops; if it's sold out, the build warns.

Don't commit the mockups or the PNGs; commit only `carousel.mjs`, `carousel.json` and this file.

## Editorial template (one post, several products)

`editorial.mjs` is a second look, on ink. It suits a drop of two or three pieces in a single post:

| # | Slide |
|---|---|
| 01 | Cover: every product's back side by side, with a headline (`"headline"` in the config) |
| per product | Hero: the back, large, with name, colour and price |
| per product | Details: the front (A), a close-up of the back print (B) and of the sleeve (C), each with a caption |
| last | Shop: the fronts, prices, sizes, "Within Nigeria", Link in bio |

- The photos are the store photos in `brand/catalog/<slug>/front.jpg` and `back.jpg`.
- The close-ups are crops of those photos, so nothing is edited.
- Crops are `[x, y, width, height]` as fractions of the photo. Close-up B's frame is wider than it is tall, so frame it on purpose (a tight macro, or the whole print if the print is wide).

To make one, copy `editorial.json`, set `"post"` (the output folder), the headline and the products, then run `node brand/social/carousel/editorial.mjs <your.json>`. The name, colour, price and sizes are read from the live store.
