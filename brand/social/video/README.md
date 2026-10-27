# FH · TX: the November videos

Eight short vertical videos for the launch in **November** (the exact day is kept back on purpose). The plan behind them is in `november-plan.md`.

Each video comes as:

- a Reel (`.mp4`, 1080 × 1920, 30 fps, with synthesised sound effects);
- a feed cut (`-feed.mp4`, 1080 × 1350);
- a frame sheet (`-frames.png`).

The sound is effects only: hiss, glitch zaps and a boom on the end card. Add a track from Instagram's library when you post and turn the original audio down to about 30%.

Prices and names were checked against the live store on 27 Oct 2026. **If a price changes, re-render** (see the end of this file).

## Two versions of every sales video

- **Before launch (now to Thu 12 Nov):** the files as listed. The end cards say "checkout opens this November" / "NOV · Date drops soon".
- **From launch day:** render the same video with `&live=1`. Its end card says checkout is open (browse clips: "OPEN · card, bank transfer, USSD").

The videos name no day, only November: checkout must open in November for them to tell the truth. When the day is set in Admin → Store, announce it separately.

## The videos

| File | What it is | Length |
|---|---|---|
| `00-signal/signal.mp4` | Teaser: static, the neon mark lights up, the date | 8 s |
| `01-rose-line/rose-line.mp4` | Rose Line: hero clip, then five looks with prices, end card ₦17,000 each | 13.6 s |
| `02-outerwear/outerwear.mp4` | Broken Star hero clip on the stairs, Double Star, Football jacket, price list | 10.8 s |
| `03-ice/ice.mp4` | Heart Pendant Set, Iced Ghost Pendant (silver then gold), Cuban bracelet, Fang grillz, on black with a light sweep | 11.8 s |
| `04-channel-17/channel-17.mp4` | Eight back prints flicking like TV channels, Heaven Outline hero clip, Holy Ground | 12.4 s |
| `05-browse/browse-home.mp4` | The real homepage on a phone: hero, Shop by mood, the feed | 8.2 s |
| `05-browse/browse-mood.mp4` | Shop by mood: tap The Rose Line, scroll the pieces | 8.7 s |
| `05-browse/browse-swipe.mp4` | Swipe the Heart Pendant Set photo and the colour follows; price and Add to cart | 8.7 s |
| `05-browse/browse-cart.mp4` | Size M, add the Long-Stem Rose Tank, open the cart: ₦17,000 | 9.2 s |

### Hero clips (Higgsfield Cinema Studio, 5 s, sound off, 5 credits each)

Each clip was checked against the store photo.

| Clip | Start frame | Check |
|---|---|---|
| `01-rose-line/hero-raw-5s.mp4` | `shoot-02/w-longstem-black.jpg` | Passed (see `01-rose-line/README.md`) |
| `02-outerwear/hero-raw-5s.mp4` | `shoot-02/m-brokenstar.jpg` | Passed: cream body, chocolate yoke, chest mark, star tape on sleeves and legs, brown cuffs, all as in `public/products/broken-star-tracksuit` |
| `04-channel-17/hero-raw-5s.mp4` | `shoot-02/w-heaven-outline.jpg` | Passed: the HEAVEN outline, both text lines and the mark pill hold through the push-in; she only glances over her shoulder |

The browsing clips are real screen captures of the live store (`_build/capture.mjs`). Analytics were blocked, nobody signed in and nothing was bought. The cart item was added in a throwaway browser.

## Posting calendar

| Date | Post | Where |
|---|---|---|
| Mon 2 Nov | `00-signal` | Reel + Story |
| Tue 3 Nov | `browse-home` | Story |
| Thu 5 Nov | `01-rose-line` | Reel |
| Sat 7 Nov | `browse-swipe` | Story |
| Mon 9 Nov | `02-outerwear` | Reel |
| Wed 11 Nov | `browse-mood` | Story |
| **Launch day** | `browse-cart` (live) + `00-signal` as a Story | Reel + Story |
| Sun 15 Nov | `04-channel-17` (live) | Reel |
| Wed 18 Nov | `03-ice` (live) | Reel |
| Sat 21 Nov | `01-rose-line` (live), re-post | Story |
| Fri 27 Nov | Black Friday slot, only if there's an offer | |

## Captions and links

Use tagged links so Admin → Analytics shows which video brought visitors. Base: `https://www.finalheaven.shop`; append `?utm_source=instagram&utm_medium=social&utm_campaign=<campaign>`.

| Video | Campaign | Link to | Caption |
|---|---|---|---|
| 00 Signal | `nov-signal` | `/` | Signal incoming. Checkout opens this November. finalheaven.shop |
| 01 Rose Line | `nov-rose-line` | `/collections` | The Rose Line. Six pieces for her, ₦17,000 each (was ₦45,000). Sizes XS–L. Link in bio. |
| 02 Outerwear | `nov-outerwear` | `/shop?category=Tracksuits` | Broken-star tape, sleeve to ankle. Tracksuits ₦65,000, Football Track Jacket ₦45,000. Sizes S–XL. |
| 03 Ice | `nov-ice` | `/shop?category=Pendants` | Ice. All ten hearts ₦25,000, the Iced Ghost Pendant ₦25,000, the Cuban bracelet ₦20,000, grillz ₦10,000 a set. |
| 04 Channel 17 | `nov-channel-17` | `/shop?category=T-Shirts` | Eight back prints. Change the channel. ₦17,000 each, down from ₦45,000. |
| Browse clips | `nov-browse` | `/` | Shop the feed. finalheaven.shop, link in bio. |

For paid ads, use `utm_medium=paid` and one campaign per test.

## Re-rendering

You need Chrome, ffmpeg (set `FFMPEG` to its path) and an internet connection for the fonts.

```sh
# A collection Reel (add &live=1 for the launch-day version)
node brand/social/video/_build/render.mjs "brand/social/video/_build/reel.html?dir=01-rose-line" brand/social/video/01-rose-line/rose-line.mp4

# Browsing clips: capture the live store, then cut
node brand/social/video/_build/capture.mjs https://www.finalheaven.shop brand/social/video/05-browse/shots.mjs brand/social/video/05-browse/_frames
node brand/social/video/_build/render.mjs "brand/social/video/05-browse/browse.html?clip=cart" brand/social/video/05-browse/browse-cart.mp4
```

- **Prices and names** live in each `reel.json` and in the captions inside `browse.html`.
- **Rendered `.mp4` files are not in git** (about 350 MB together). They live in this folder on disk (synced by OneDrive) and can be re-made with the commands above. The Higgsfield hero clips (`hero-raw-5s.mp4`) are committed, since they cost credits to make again.
- **Frames** of hero clips and captures (`_frames/`) are git-ignored. Re-make the hero frames with:
  ```sh
  ffmpeg -i hero-raw-5s.mp4 -vf scale=1080:-2 -q:v 2 _frames/hero/%04d.jpg
  ```
