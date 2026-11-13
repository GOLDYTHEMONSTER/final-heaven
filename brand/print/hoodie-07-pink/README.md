# Pink 07 hoodie: production pack (10 Nov 2026)

These are the files for the washed pink hoodie, with the "Final 07 Heaven" design on the back.

## The design

| Placement | Method | Artwork | Size |
|---|---|---|---|
| Back | DTF | "Final 07 Heaven": white letters and numbers, with a black outline round the 07 (the pink version of the design) | 26.0 × 34.7 cm |
| Front | DTF | The three-star mark in white, at the top middle of the chest (owner's call) | 6.2 × 7.0 cm |
| Both sleeves | Embroidery | "Final Heaven" in white thread: one line, slim script, just above the cuff band | 7.0 × 1.9 cm |

The owner asked for embroidery on the sleeves only; everything else is DTF.

## Files and rebuilding

This folder follows `../WORKFLOW.md`. To rebuild it, run:

```
node brand/print/hoodie-07-pink/art.mjs
node brand/print/pack.mjs brand/print/hoodie-07-pink
```

- `art.mjs` makes the back file. The black outline is the one in use; the ember (orange) outline is kept for comparison, with a mock-up in `compare-back-ember-outline.jpg`.
- `pack.mjs` makes the front mark and the sleeve script, checks every file, and writes the mock-ups, `previews/` and `final-heaven-pink-07-hoodie-spec.pdf`.
- `blank-*.png` are the owner's pink hoodie photos with the old prints removed (GPT Image 2.6 edit). They are also the source for `pack.mjs recolour`. Keep them out of git.

The old `../png/varsity-07-hoodie-back.png` had 92–99% alpha everywhere, which DTF prints as a chalky haze. The new files are fully solid.
