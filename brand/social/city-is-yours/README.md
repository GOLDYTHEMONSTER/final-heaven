# THE CITY IS YOURS: what to post

All files are in `edit/`. Each film is 9:16, for Stories and Reels. Every film except the signature montage also has a 4:5 `-feed.mp4` crop for the grid. Add music in Instagram when posting; the films carry only their own sound effects.

| Order | File | Copy on screen | Caption idea |
|---|---|---|---|
| 1 | `teaser-t1.mp4` | SOMETHING IS COMING. / NOVEMBER | Something is coming. November. |
| 2 | `teaser-t2.mp4` | YOU KNOW THE FEELING. | You know the feeling. |
| 3 | `teaser-t3.mp4` | WHAT IF EVERYTHING YOU FOUND ONLINE WAS CLOSER? / FINAL HEAVEN / OPENING THIS NOVEMBER | What if it was closer? |
| 4 | `hero-45s.mp4` | The full film. It ends on OPENING THIS NOVEMBER · WAITLIST DISCOUNT · FREE STANDARD DELIVERY | The city is yours. Join the waitlist: 25% off your first order. Link in bio. |
| 5 | `signature-montage.mp4` | EVERYONE HAS THEIR OWN TASTE. THERE’S ROOM FOR ALL OF IT. | Sign your name. |

Posts 1 to 3 can go out a day or two apart, with the hero film after them. The raw clips in `clips/` work as single Reels too. Check every clip by eye before posting it alone; these parts are cut out of the films:
- S3: after 3.5 s
- S5: the last half-second
- S10: after the first second

## Claims to keep true

- **November:** checkout must open in November. Don't name a day until `payments_open_on` is set.
- **Waitlist discount:** the early access offer (25%, up to 35% with invites).
- **Free standard delivery:** Express by air is paid, so never say just "free delivery".

## How it's made

- `_build/film.html` cuts every film from the clips; `_build/signature.html` draws the dripping tag.
- Render with `node brand/social/video/_build/render.mjs "<page>?cut=…" out.mp4`, with `FFMPEG` set to the path of `ffmpeg.exe`.
- The plan and every shot's prompt are in `PLAN.md`.
