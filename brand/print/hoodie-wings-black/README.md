# Wings hoodie, washed black (sample, 10 Nov 2026)

This is one of three new samples in the house format (`../WORKFLOW.md`). The owner asked for "3 more hoodies samples with this format and brand identity".

| Placement | Method | Artwork |
|---|---|---|
| Back | DTF | Engraved angel wings with a halo and FINAL HEAVEN set wide underneath, white, 30 cm wide (job 7d4c3b9d) |
| Front | DTF | Three-star mark in white, 9 cm, top middle |
| Both sleeves | Embroidery | "Final Heaven" on one line in white thread, just above the cuff bands |

- **The illustration:** GPT Image 2.6, 2k, flat black line art with no text. It is converted to one ink, and the fine hatching is thickened (`ink(..., { fatten })` in `../art-kit.mjs`).
- **The words:** set in Bahnschrift, never drawn by the model.
- **The blanks:** the pink blanks, recoloured with `pack.mjs recolour`.

Rebuild:

```
node brand/print/hoodie-wings-black/art.mjs
node brand/print/pack.mjs brand/print/hoodie-wings-black
```

This is not listed in the store yet: it's a sample. Check the fine engraving lines on a test print before the first run.
