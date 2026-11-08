# DTF print rules for Final Heaven designs (5 Nov 2026)

Read this before generating a design. Most sources are transfer vendors' guides, so the numbers are starting points. Our printer's limits and a test print override them.

## The one idea

DTF can't print semi-transparent ink. Any pixel that isn't fully solid or fully transparent gets white underbase behind it, which shows as a chalky haze or halo. **Every pixel in a print file is either 100% solid or 100% transparent.** Shading is made from solid dots, never from opacity.

## Avoid

| Element | What goes wrong | Use instead |
|---|---|---|
| Glows, light beams, soft shadows, blur, smoke, mist, feathered edges | Chalky ring or haze | Halftone dots, or hard-edged steps of solid colour |
| Fades to transparent | Haze and silvering | A dot pattern that thins out, or a fade into another solid colour |
| Lowered opacity | Same haze, even though it looks soft on screen | Discrete solid tones |
| Hairlines and tiny isolated specks | Break up, or the white shows past the colour | Thicker lines (see below) |
| Small thin or script text | Fills in or breaks | Heavier type, or make it bigger |
| Background boxes, leftover backgrounds | Prints as a visible box or halo | Real transparency (a checkerboard preview doesn't prove it) |
| Near-white stray pixels around edges | Faint halo | Check edges at 400–800% and remove them |
| Big unbroken solid fills | Stiff, plastic feel, doesn't breathe | Distress, knockouts, dots or lines through them |
| Black ink on a black shirt | Extra film, stiffness and ink for nothing | Remove the black so the shirt shows through |
| JPG print files, enlarged low-res art | No transparency, soft edges | Transparent PNG at print size |

## Numbers to start from

- **Resolution:** 300 DPI at final print size. A 12 × 16 in back print is 3600 × 4800 px. Our 1k concept renders are for choosing only.
- **File:** transparent PNG with a real alpha channel, RGB unless the printer says otherwise.
- **Lines:** sources range from 0.5 mm to 2 mm. Our working rule (a judgement, to confirm on a test print): never under 0.5 mm (6 px at 300 DPI), 1 mm (12 px) for ordinary line work, 2 mm (24 px) for small isolated details.
- **Text:** no source gives a minimum size, only "use bold or semi-bold". Prove the smallest text on the test print.
- **Underbase choke:** the printer's setting, usually about 2–5 px if a white halo appears. Ask, and test.

## What prints best

- Engraving, woodcut, etching and ink line art: shading built from solid lines.
- Halftone or grain portraits: solid dots with the shirt showing through. Softer to wear as well.
- Heavy type with distress or knockouts through it.
- Limited palettes of flat colours.
- Halftone only the shading and keep key details (faces, text, the mark) solid.

Photo-realistic greyscale is the risky case. It needs converting to dots and a grey test chart before production.

## How we make a design

1. **Concept:** generate on the garment to judge the idea, but with printable art language only.
2. **Artwork:** regenerate the chosen print flat at high resolution, without the garment. Put this in the prompt: "hard-edged ink only, bold lines, halftone dots for shading, no gradients, no glow, no soft shadows, no blur, isolated on a plain background".
3. **Clean up:** upscale first if small, then remove the background, force edges to fully solid or fully transparent, remove black for black shirts, and turn remaining greys into dots.
4. **Logo:** place the real `brand/logo/` mark. Never keep the model's redrawn one.
5. **Check:** zoom to 400–800% and view on black and on white to catch halos, and confirm inside the letters is transparent.
6. **Test print:** one sample on the real blank before an order. Wash it and check the feel.

## Sources

- [Halos, knockouts and choke (Best Price DTF)](https://bestpricedtf.com/blogs/news/transparency-knockouts-and-strokes-in-dtf-artwork-prevent-halos-and-choke-failures)
- [Vector gradients and transparency (Iris DTF)](https://irisdtf.com/blogs/news/dtf-print-file)
- [What a DTF halftone is (DTF Dallas)](https://dtfdallas.com/blogs/news/what-is-a-dtf-halftone)
- [Resolution requirements (DTF Sheet)](https://dtfsheet.com/blogs/blog/dtf-transfer-resolution-requirements)
- [Artwork preparation guide (Kolormatrix)](https://kolormatrix.com/pages/dtf-artwork-preparation-guide)
- [AI artwork for DTF (Kolormatrix)](https://kolormatrix.com/pages/chatgpt-ai-artwork-for-dtf-printing)
- [Using AI for DTF artwork (Transfer Superstars)](https://www.transfersuperstars.com/blogs/news/how-to-use-ai-to-create-dtf-transfer-artwork-step-by-step)
- [Black knockout and halftoning (Transfer Superstars)](https://www.transfersuperstars.com/blogs/dtf-transfer-printing/dtf-decoded-the-ultimate-guide-to-black-knockout-halftoning-graphics-for-dtf-transfer)
- [Thick or stiff prints (DTF Sheet)](https://dtfsheet.com/blogs/blog/dtf-transfer-thickness-fix)
- [Reducing plastic feel (Ninja Transfers)](https://ninjatransfers.com/pages/tips-to-reduce-plastic-feel-of-dtf-transfers)
- [Knockout tool (Caldera)](https://www.caldera.com/why-do-you-need-the-knockout-tool-in-dtf-printing/)
