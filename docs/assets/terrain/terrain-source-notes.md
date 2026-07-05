# Folk Warm Terrain Source Notes

## Goal

Generate the first production-source terrain candidates for the selected **B. Folk Warm** art direction.

The target is a 6 columns x 4 rows source sheet:

- columns: plain, forest, river, low rocky ridge, fertile ground, hunting scrub
- rows: spring, summer, autumn, winter

These images are not yet final atlas assets. They are source candidates for cropping, downscaling, cleanup, and eventual integration through a historical `SpriteAPI` implementation.

## Generated Candidates

- `folk-warm-terrain-source-v1.png`
  First balanced pass. Good seasonal readability, but slightly generic RPG terrain mood.
- `folk-warm-terrain-source-v2.png`
  Stronger tile-sheet structure. More usable as a game source, but mountains read too much like tall RPG icons.
- `folk-warm-terrain-source-v3.png`
  Best current production candidate. Cleaner top-down cells, better 28px readability, and less tall-icon mountain language.

## 28px Probe

`folk-warm-terrain-v3-28px-sheet.png` is a direct 6x4 extraction from v3 downscaled to 28px per tile.

`folk-warm-terrain-v3-28px-preview-4x.png` is the same sheet enlarged 4x with nearest-neighbor scaling for review.

## Current Judgment

Use v3 as the base candidate for the first terrain extraction experiment.

Carry forward:

- clear seasonal rows
- readable plain, river, forest, and cultivated ground
- warmer folk direction than the current public asset set

Improve in the next pass:

- make mountain/rock tiles less generic
- make hunting ground more distinct from plain and forest
- strengthen Korean folk-art color identity without adding noise
