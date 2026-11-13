# Crest hoodie, washed burgundy (sample, 10 Nov 2026)

This is one of three new samples in the house format (`../WORKFLOW.md`). The owner asked for "3 more hoodies samples with this format and brand identity".

| Placement | Method | Artwork |
|---|---|---|
| Back | DTF | A laurel crest around the real mark with 07, FINAL HEAVEN arched over the top, cream, 28 cm wide (job d8c16e0d) |
| Front | DTF | Three-star mark in cream, 9 cm, top middle |
| Both sleeves | Embroidery | "Final Heaven" on one line in cream thread, just above the cuff bands |

- **The illustration:** GPT Image 2.6, 2k, flat black line art with no text. It is converted to one ink, and the fine hatching is thickened (`ink(..., { fatten })` in `../art-kit.mjs`).
- **The words:** set in Bahnschrift, never drawn by the model.
- **The blanks:** the pink blanks, recoloured with `pack.mjs recolour`.

Rebuild:

```
node brand/print/hoodie-crest-burgundy/art.mjs
node brand/print/pack.mjs brand/print/hoodie-crest-burgundy
```

This is not listed in the store yet: it's a sample. Check the fine engraving lines on a test print before the first run.
