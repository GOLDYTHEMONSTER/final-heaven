# 00 · Signal: the November teaser

| File | Use |
|---|---|
| `signal.mp4` | Reel, 1080 × 1920, 8 s, with sound effects |
| `signal-feed.mp4` | Feed post, 1080 × 1350 (centre crop) |
| `signal-frames.png` | Eight stills, one a second |
| `signal.html` | The source; re-render after any change |

Every frame is drawn in code, so this cost 0 credits. Timeline, at 120 BPM:

| Time | What happens |
|---|---|
| 0–1.5 s | TV static and a "No signal" label |
| 1.5–2.8 s | The neon mark lights up with the site's own flicker |
| 3.0 s, 3.5 s | Small glitches |
| 4.0 s | The drop: a hard tear and a boom |
| 4.3 s | FINAL HEAVEN / November transmission |
| 5.3 s | CHECKOUT OPENS NOV, "Date drops soon" |
| 6.9 s | The picture switches off like an old TV |
| 7.6 s | Static returns, so the loop runs straight into the start |

The sound is synthesised (hiss, zaps, a boom and beat ticks); there's no music, so nothing needs a licence. Add a track in Instagram when posting and turn the original audio down to about 30%.

**Before posting (Mon 2 Nov):** the video promises only "November", so checkout must open in November. The exact day is kept back on purpose; announce it separately once it's set in Admin → Store.

Caption: Signal incoming. Checkout opens this November. finalheaven.shop

## Rendering

```sh
FFMPEG=path/to/ffmpeg.exe node brand/social/video/_build/render.mjs brand/social/video/00-signal/signal.html brand/social/video/00-signal/signal.mp4 --seconds 8
```

It needs Chrome, ffmpeg and an internet connection (for the fonts), and takes about a minute. The toolkit itself is in `../_build/`:

- `render.mjs` draws each frame in headless Chrome, encodes with ffmpeg, and builds the sound from the page's cues.
- `fx.js` has the glitch helpers: seeded static, torn bands and the timecode.
