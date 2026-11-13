# Print workflow (from 10 Nov 2026)

This is how a chosen design becomes print files, mock-ups and a spec PDF for the DTF printer and the embroiderer. Read it with `../designs/DTF-RULES.md` (why every pixel must be solid) and `../designs/WORKFLOW.md` (how concepts are made).

Worked examples:
- `hoodie-07-pink/`: an existing print file, recoloured.
- `hoodie-heaven-taupe/`: AI lettering redrawn flat, plus typeset lines.

## The house format (owner, 10 Nov 2026)

| Placement | Method | Default |
|---|---|---|
| Back | DTF | The design, 26–30 cm wide (owner: "cover more space", so lean to 30 cm). Top edge 5–7 cm below the hood seam, centred. |
| Front | DTF | Three-star mark, top middle of the chest, 7–9 cm tall. Top edge 6 cm below the hood crossover. |
| Sleeves | Embroidery | "Final Heaven" on one line, slim script, 7 cm wide, on both sleeves, 1.5 cm above the cuff band. Not mirrored. |

Ink and thread colours follow the blank:
- White on dark or bright blanks (pink, black).
- Black on light blanks (taupe, grey).

When a design's own colour fights the blank, recolour that element. The orange 07 outline on pink became black.

## Steps

1. **Folder.** Make `brand/print/<garment>-<design>-<colour>/`.
2. **Blank photos.** You need `blank-front.png` and `blank-back.png`, with no print on them.
   - **Washed hoodie in another colour (same cut):** run `node brand/print/pack.mjs recolour <#hex> <folder>`. It recolours the pink blanks and costs no credits. Sample the hex from a supplier photo of that colour.
   - **Other garments:** use the supplier's photo. If it carries a print, remove it with one GPT Image 2.6 edit (1k, 0.5 credit): "remove the print, keep everything else exactly the same".
   - Note the photo's width, and where the hood seam, neck and cuff rib sit in pixels.
3. **Back art.** Write `art.mjs` in the folder and save the back file at final size, 300 dpi.
   - **Reuse a print file** when one exists (`brand/print/png/`), and recolour it with `solidify` from `pack.mjs`.
   - **Lettering or illustration:** regenerate it flat at 2k on plain white, with "solid black line art, no fill, no shading, no gradients, no glow". Use the concept image as the reference. Then threshold it to ink (see `hoodie-heaven-taupe/art.mjs`).
   - **Words** are typeset, never drawn by the model. Use Bahnschrift Condensed (Windows) for small caps lines, or the varsity script from `png/varsity-07-hoodie-back.png`. Bold text keeps strokes near 1 mm. The minimum is 0.5 mm.
   - **Logos** come from `brand/logo/`, never the model's redraw.
4. **`pack.json`.** Copy one from an example folder and edit it:
   - title, slug, garment, `garmentHex`, ink colours;
   - one entry per placement: file, method, size, where it goes in words, and where it sits in the photo.
   - Standard pieces are made for you: `"make": "mark"` (front mark, any colour and height) and `"make": "sleeve-script"` (the sleeve embroidery art, any colour).
5. **Build:** run `node brand/print/pack.mjs <folder>`. It:
   - makes the standard pieces;
   - refuses any file with semi-transparent pixels or the wrong size;
   - lays everything on the blanks (`mockup-front.jpg`, `mockup-back.jpg`, with embroidery drawn as raised thread);
   - writes previews on black and on the garment colour in `previews/` (white art can't be seen on a phone's white viewer);
   - renders `final-heaven-<slug>-spec.pdf`, two pages: placements, files, colours, underbase, press settings, stitches, backing and hooping.
6. **Owner review.** Send the two mock-ups. Change `art.mjs` or `pack.json` and rebuild until the owner says it's right. Note each change of mind as a comment in `art.mjs`.
7. **Send to the printer.** Send these together:
   - the DTF PNGs and the embroidery PNG from the folder root (not the previews);
   - the spec PDF.
   - The printer prints at 100%. The embroiderer digitises from the PNG and sends a stitch-out first.
8. **Sample.** Make one piece, wash it once at 30 °C inside out, then check it for halos, small text and the stitching before the run.

## Rules the script enforces

- Every pixel is fully solid or fully transparent, and the build fails otherwise. The old `png/varsity-07-hoodie-back.png` was 92–99% opaque everywhere, which DTF prints as haze.
- The file width matches `widthCm` in `pack.json` within 1.5 mm.
- DTF files are at 300 dpi and embroidery art at 600 dpi.

## Keep out of git

Blank photos, mock-ups, previews and PDFs are media (see the "no media in commits" rule). Commit `art.mjs`, `pack.json`, `README.md` and this file.
