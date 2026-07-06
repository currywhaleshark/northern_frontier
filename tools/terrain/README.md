# Terrain Asset Tools

## River Mask Tiles

Run the deterministic river builder from the repository root:

```powershell
& 'C:\Users\USER\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' tools/terrain/build_river_mask_tiles.py
```

The first pass writes generated preview assets to `docs/assets/terrain/river/generated/`.
The builder owns connector geometry; generated source art only supplies texture and palette.
