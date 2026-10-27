# November videos: FH · TX

Short videos for the November launch, in a cinematic style with glitchy, high-contrast motion graphics. They follow the workflow from *The Art of Discovery* (`../art-of-discovery/README.md`):

- Stills are typeset, never generated.
- On-model photos come from the real product photos.
- Higgsfield Cinema Studio animates a still used as the start frame.
- Store screens are real phone recordings.
- Transitions are cut to the beat.

Status (27 Oct):

- The motion toolkit (`_build/`) is built.
- **All videos are made (27 Oct):** 00 Signal, 01 Rose Line, 02 Outerwear, 03 Ice, 04 Channel 17, and four browsing clips (05) in place of the single "Checkout open" film.
- Every sales video also has a launch-day version (`&live=1`).
- Posting guide, captions and links: `README.md`.
- Credits spent: 15 for three hero clips, about 5 for the Ice cutouts.

## The idea

**FH · TX: Final Heaven, transmitting.** Every video plays as a broadcast breaking through interference. The signal tears, the colours split, then it locks onto the product and holds still long enough to read the name and the price. This gives the glitch a reason to be there: the noise is the signal arriving, and the clear moment is always the product.

- **Look:** crushed blacks and hard highlights, with film grain and scanlines. Two colour-split tones, pink and cyan, taken from the neon logo on the site. Ember is used for the REC dot only.
- **Cinematic moments:** each hero clip starts letterboxed (2.39:1 bars inside the 9:16 frame). The bars open to full frame on the drop of the beat.
- **Type:** Archivo extended for the headlines, JetBrains Mono for the timecode and labels, matching the Instagram packs. Headlines get the pink/cyan split. Prices are always clean and sharp.
- **Style frames** (static, 0 credits): `style/style-rose.png`, `style/style-outerwear.png` and `style/style-ice.png`. The source is `style/style-frame.html` (`?look=rose|outerwear|ice`).

## The videos

Each video is delivered as:

- a 9:16 Reel (1080 × 1920, 30 fps);
- a 4:5 feed cut (1080 × 1350);
- a cover image;
- a frame sheet;
- a README with captions and tagged links (`utm_campaign=nov-<slug>`).

Text stays inside Instagram's safe area: 250 px from the top and 340 px from the bottom.

| # | Video | Kind | Length | Source | Higgsfield |
|---|---|---|---|---|---|
| 00 | **Signal**: teaser | Inspo | 8 s | Static, then the neon mark lights through the noise (the site's own flicker), then the date | None |
| 01 | **The Rose Line** | Sales, for her | 15 s | Hero clip from `shoot-02/w-longstem-black.jpg`, then glitch cuts through the other five women's looks | 1 clip |
| 02 | **Outerwear** | Sales, for him | 15 s | Hero clip from `shoot-02/m-brokenstar.jpg` (he comes down the stairs towards the lens), then the double-star suit and the football jacket | 1 clip |
| 03 | **Ice** | Sales | 12 s | The product photos cut out onto black, with a light sweep across the stones and hard cuts on the beat | Background removal only |
| 04 | **Channel 17**: the ₦17k tees | Inspo and sales | 12 s | The eight back prints flicking past like changing TV channels ("CH 01–08"), then a hero clip from `shoot-02/w-heaven-outline.jpg` | 1 clip |
| 05 | **Checkout open** | Launch day | 20 s | A real phone recording of the store: browse, pick a size, add to cart, pay. Same cut as *How I copped the whole fit* | None |

### What each one says (prices as on the store, 26 Oct)

- **01 Rose Line:**
  - Six pieces, ₦17,000 each, down from ₦45,000, sizes XS–L.
  - One beat per piece: Rose Ringer Baby Tee, Rose Waffle Tank, Heaven Sent Crop Top, Long-Stem Rose Tank, Rose Trio Ringer Tee, Rose Tank.
- **02 Outerwear:**
  - Broken Star and Double Star tracksuits, ₦65,000 for the jacket and pants.
  - Football Track Jacket, red or black, ₦45,000.
  - Sizes S–XL.
- **03 Ice:**
  - Heart Pendant Set, all 10, ₦25,000 (red or black). Single pendants ₦7,500.
  - Iced Ghost Pendant, ₦25,000, gold or silver, on a 24" rope chain.
  - Iced Cuban Bracelet, ₦20,000.
  - Grillz, ₦10,000 a set.
- **04 Channel 17:** eight back prints, ₦17,000, down from ₦45,000, sizes S–XL.
- **05 Checkout open:** whatever the store shows on the day of the recording. Recorded only once checkout is really open, with analytics blocked and no order placed.

## How each one is made

1. **Hero clips (Higgsfield Cinema Studio Video).**
   - Start frame is the shoot-02 photo. One 5-second shot, no multi-shot (multi-shot warped the text and the products last time).
   - Sound off; music is added in the edit.
   - The prompt moves the camera and the light only: a slow push-in, a dolly back, hair and fabric in the wind. It does not ask the model to turn around, because the AI would invent a back print that isn't real.
2. **Check every clip against the store photo** frame by frame:
   - print, trim, colour and logo must match;
   - any warp means the clip is rejected or trimmed.
   - The frame sheet is saved with each video as the record.
3. **Motion graphics, in code (0 credits).** Each video is one HTML composition with a time control. Headless Chrome renders it frame by frame and ffmpeg joins the frames. It is the same system as `_build/build.mjs`, so a price change is a re-render, not a redo. The effects:
   - colour split;
   - torn bands;
   - scanlines and grain;
   - zoom punch;
   - light sweep;
   - channel-change static;
   - frame stutter;
   - letterbox open;
   - the timecode HUD.
4. **Product shots (Ice):** the product photos cut out with Higgsfield background removal (about 1 credit each), so the stones glow on black instead of sitting on a light studio wall. The style frame shows why: on the light wall the grade turns grey.
5. **Sound:**
   - Every cut sits on a 120 BPM grid (one beat every 0.5 s), so most tracks in Instagram's library line up.
   - The music is added in Instagram when posting, which keeps it licensed and on-trend.
   - Static hiss and glitch zaps are made in ffmpeg and baked in.
   - Each video is also exported silent.
6. **Safety:**
   - At most three full-screen flashes per second (the WCAG photosensitivity limit). Strobes are kept to part of the screen.
   - The first frame isn't a flash, because Reels autoplay.

## Rules (from the earlier packs)

- Prices, names and sizes come from the store on the day of the render. If they change, re-render.
- No invented numbers: no likes, no "500 sold". "Last one" appears only when the store really has one left.
- No trademarked names. The ghost pendant is "Iced Ghost Pendant", nothing else.
- Sales videos link to products people can buy. Before checkout opens, posts say "browse now, checkout opens <date>", never "buy now".

## November calendar (proposed)

Checkout is closed for now (the store has no opening date set). So the plan works back from a launch day in November. The day was first agreed as Fri 13 Nov (26 Oct); on 27 Oct it was kept vague in public: videos say only "November". The date suits the ghost pendant and the gothic hearts.

| Date | Post | Note |
|---|---|---|
| Mon 2 Nov | 00 Signal (teaser) | Reveals the date |
| Thu 5 Nov | 01 Rose Line, 6 s preview | "Browse now, checkout opens this November" |
| Mon 9 Nov | 02 Outerwear, 6 s preview | Same |
| **Launch day** | **05 Checkout open + 01 Rose Line (full)** | Launch day; checkout opens that morning |
| Sun 15 Nov | 02 Outerwear (full) | |
| Wed 18 Nov | 03 Ice | |
| Sat 21 Nov | 04 Channel 17 | |
| Fri 27 Nov | Black Friday slot | Only if there's an offer; the templates take it |

Each video is ready at least three days before its date, so there's time to check it and make changes.

## Budget

Balance on 26 Oct: **38.5 credits**. Cinema Studio Video costs **5 credits** for a 5-second clip with sound off (quoted 26 Oct); with sound on it was 8.

| Item | Credits |
|---|---|
| 3 hero clips (Rose Line, Outerwear, Channel 17), 5 s each, sound off | 15 |
| Background removal, about 5 Ice products | about 5 |
| Two retries | 10 |
| **Total** | **about 30** |

To keep spending safe, start with the Rose Line clip alone (5 credits, generated 26 Oct) and check it. If it holds up, do the other two. If a clip doesn't pass the frame check, the video can still be made fully in code from the still photo (camera moves, glitch and type), at no cost.

## Order of work

1. Build the motion toolkit and render **00 Signal** (0 credits) as the test of the system.
2. **01 Rose Line**: one hero clip, checked, then cut.
3. **02 Outerwear** and **04 Channel 17**.
4. **03 Ice** (cutouts).
5. **05 Checkout open**, recorded once checkout is open on the live site.
