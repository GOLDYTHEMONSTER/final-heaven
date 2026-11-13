# Character stickers: concepts (10 Nov 2026)

These are illustrated die-cut sticker concepts in the style of the phone sticker the owner sent. The characters are original and were drawn with GPT Image 2.6 on Higgsfield. The garments were drawn blank, and the real logo files from `brand/logo/` were composited on afterwards. The AI did not draw any text or logo.

| File | Character | Brand placement |
|---|---|---|
| `c1-tee-guy-branded.png` | Guy with twists, black hoodie, ripped black denim, holding a cream tee on a hanger | Mark on hoodie chest; stacked lockup on the tee |
| `c2-braids-girl-branded.png` | Girl with box braids, burnt-orange cropped jacket, black cargos, shopping bag | Small mark on top; stacked lockup on the bag |
| `c3-halo-kid-branded.png` | Hooded chibi kid with glowing eyes, cracked halo, small wings | Mark on hoodie chest |
| `concepts-sheet.jpg` | All three side by side | |

The un-branded originals sit next to them (`c1-tee-guy.png` and so on).

## Print files (owner chose all three, logo only on the tee)

- `*-branded-cut.png` are the die-cut files: transparent background, cut along the white border, 1760 px wide. That holds about 300 dpi up to roughly 150 mm wide.
- The c2 and c3 sneakers were redrawn as plain sneakers (`*-v2.png`) because the first versions carried a swoosh-like mark and a well-known low-top colourway.
- To rebuild, run `node brand/print/stickers/characters/build.mjs`. It upscales the drawings 2x first and then places the logo files, so the type on the tee and bag stays sharp.
- Any slogan on the tee would have to be approved by the owner and set as type, not drawn by the model.
