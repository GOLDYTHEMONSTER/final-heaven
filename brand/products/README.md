# Product images: Gothic Angel Print hoodie and T-shirt

**Store photos** (4:5, 1200 × 1500, neutral `#ECEAE6` background) are in `public/products/`, so the site serves them at `/products/...` once deployed. The store uses the `-v2` set:

| | Black | White |
|---|---|---|
| Hoodie | `gothic-angel-hoodie-black-front-v2.jpg`, `-black-back-v2.jpg` | `gothic-angel-hoodie-white-front-v2.jpg`, `-white-back-v2.jpg` |
| T-shirt | `gothic-angel-tee-black-front-v2.jpg`, `-black-back-v2.jpg` | `gothic-angel-tee-white-front-v2.jpg`, `-white-back-v2.jpg` |

- `cutouts/`: the first-version garments on a transparent background. Their fronts still show a faint outline of the old FH monogram behind the mark (and the white tee back a grey "II"), so don't use them where that would show; they were kept only as shape references.
- `source/`: the store's original images (copied from the product records as they were on 22 Oct 2026), plus the back-print artwork. They are kept unchanged.

## v2 (22 Oct 2026): generated with Higgsfield

Each photo was generated with GPT Image 2.5 (2k, medium quality) on Higgsfield as a ghost-mannequin product shot, then resized to 1200 × 1500. References: the garment cut-out for shape, plus the clean mark (`brand/logo/mark-*.png`) for fronts or the back-print artwork for backs. The prompts told the model to leave out the old-monogram outline in the cut-outs.

Checks on every image: the front shows only the three-star mark on plain fabric, verified on crops with contrast boosted 5×; the back print matches the artwork, including the "-DylanUnsual" tag spelled as printed. The white T-shirt back has the print in black ink (confirmed by the owner).

These are generated images, not photographs of the real garments.

## v1: edited mockups (superseded)

The files without `-v2` are edits of the store's mockups: each garment was cut out, and on the fronts the old FH monogram was painted over and the current mark placed on top. The cover-up didn't fully hide the monogram, which is why v2 was made. They were also enlarged about 1.6× from 1280 × 914 sources. They are kept so the store can be rolled back.
