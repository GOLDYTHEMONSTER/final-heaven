# Heaven hoodie, washed taupe (10 Nov 2026)

This is the HEAVEN tee design (concept tee-17, `brand/designs/concepts-03`) moved onto the washed taupe hoodie, following `../WORKFLOW.md`.

| Placement | Method | Artwork | Size |
|---|---|---|---|
| Back | DTF | Melting outline HEAVEN, "THE CITY ABOVE - WHERE FAITH MEETS TOMORROW", "FINAL HEAVEN - SEE YOU THERE", and the mark in a pill. All in black. | 30.0 × 25.9 cm |
| Front | DTF | Three-star mark, black, top middle | 8.0 × 9.0 cm |
| Both sleeves | Embroidery | "Final Heaven" on one line, black thread, just above the cuff band | 7.0 × 1.9 cm |

## How it was made

- **Black, not white:** white lines would barely show on taupe.
- **HEAVEN lettering:** redrawn as flat line art with GPT Image 2.6 at 2k (1 credit, job 525855be; `heaven-lineart-source.png`). The tee concept's grey drip fill was dropped, because semi-transparent grey prints as haze on DTF.
- **The two lines:** typeset in Bahnschrift Bold Condensed.
- **The pill mark:** comes from `brand/logo/`.
- **Owner's changes, 10 Nov:** a bigger logo, bolder text, and more coverage. The back went from 28 to 30 cm and the lines from 80% to 92% of the width. The badge is about twice the size, and the front mark went from 7 to 9 cm.
- **Blanks:** the pink blanks recoloured to taupe with `pack.mjs recolour #B09E90`. Same cut, no credits.

## Rebuilding

Run these two commands:

```
node brand/print/hoodie-heaven-taupe/art.mjs
node brand/print/pack.mjs brand/print/hoodie-heaven-taupe
```

## Before the run

- The concept's two text lines are now on a product. The owner chose this design, but confirm the wording once more before the first order.
- Check the small mark inside the pill on the sample. The stars' points are the finest detail on the print.
