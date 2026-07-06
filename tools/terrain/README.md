# Terrain Asset Tools

## River Mask Tiles

Run the deterministic river builder from the repository root:

```powershell
& 'C:\Users\USER\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' tools/terrain/build_river_mask_tiles.py
```

The first pass writes generated preview assets to `docs/assets/terrain/river/generated/`.
The builder owns connector geometry; generated source art only supplies texture and palette.

The sheet has 17 columns: 16 connector shapes plus a final full-tile water fill column.
The renderer (`src/render/atlas.ts`) draws rivers area-based — land texture underneath,
water cropped from the fill column, banks drawn procedurally — so only the fill column
and season rows are load-bearing at runtime; connector columns remain for previews.

After rebuilding, copy the sheet into the runtime assets:

```powershell
Copy-Item docs/assets/terrain/river/generated/river-mask-autotile-28px-sheet.png public/assets/river-mask-autotile-28px-sheet.png -Force
```
