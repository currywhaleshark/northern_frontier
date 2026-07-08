# Modular Wall Sprite Design

## Goal

Replace the abandoned 16-mask wall-family route with a compact modular wall sprite system.

Normal wall rendering uses only three source sprites per wall material and season:

- `pillar`: square post/block for endpoints, isolated tiles, short runs, corners, T-junctions, and crosses.
- `horizontal`: straight horizontal span used only inside longer horizontal runs.
- `vertical`: straight vertical span used only inside longer vertical runs.

The first material to generate is `palisade` / 목책. Once approved, use that result as the visual reference for `earthFort` / 토성 and `stoneWall` / 석벽, then produce winter variants.

## Scope

Base modular wall assets cover:

- `palisade`
- `earthFort`
- `stoneWall`

`gate` remains a wall-family gameplay connector, but it is not part of the three-piece base wall sheet. Gates should be handled by a separate asset and render path after the base wall rule is stable.

## Rendering Rule

For each wall-family tile:

- If the tile has both east and west connections, and no north or south connection, it renders as `horizontal`.
- If the tile has both north and south connections, and no east or west connection, it renders as `vertical`.
- All other cases render as `pillar`.

This covers the desired network behavior:

- isolated tile -> `pillar`
- two-tile straight run -> `pillar`, `pillar`
- three-or-more horizontal run -> `pillar`, `horizontal` interior, `pillar`
- three-or-more vertical run -> `pillar`, `vertical` interior, `pillar`
- corner, T-junction, cross -> `pillar`

The tile's own building type decides material. Mixed-material adjacency should not force a neighboring material onto the current tile.

## Asset Sheet

Final modular base-wall sheet:

- File: `public/assets/wall-family-modular-v1.png`
- Cell size: `28x40`
- Columns: `3`
- Rows: `6`

Columns:

1. `pillar`
2. `horizontal`
3. `vertical`

Rows:

1. Palisade normal
2. Earth fort normal
3. Stone wall normal
4. Palisade winter
5. Earth fort winter
6. Stone wall winter

Generation source sheets live in `tools/render/source_images/`. Each source sheet is a three-cell row in the same `pillar`, `horizontal`, `vertical` order.

## Source Filenames

- `wall-family-palisade-normal-source-v1.png`
- `wall-family-earthfort-normal-source-v1.png`
- `wall-family-stonewall-normal-source-v1.png`
- `wall-family-palisade-winter-source-v1.png`
- `wall-family-earthfort-winter-source-v1.png`
- `wall-family-stonewall-winter-source-v1.png`

## Prompt Direction

All prompts should request:

- top-down 2D game sprites
- late-Joseon northern frontier material language
- readable pixel-art clusters at 28px tile size
- exactly three separate sprites in one row: pillar, horizontal, vertical
- consistent anchor, thickness, footprint, and lighting
- flat chroma-key background
- no text, labels, scenery, people, shadows, watermarks, UI, or perspective camera angle

Material notes:

- Palisade: rough timber posts and braces, practical frontier construction, warm dark wood.
- Earth fort: compacted brown earth mass with subtle timber reinforcement.
- Stone wall: gray stacked or dressed stone blocks, heavier and colder than earth fort.
- Winter: preserve the normal silhouette and endpoints, then add snow caps and cold desaturation.

## Code Changes

`src/render/wallFamilyAssets.ts` owns:

- modular sheet metadata
- wall type narrowing for the three base materials
- material lookup
- `modularWallPiece(connections)`
- source rect lookup by piece or by connections

`tools/render/compose_wall_family_assets_v1.py` normalizes six three-cell source rows into one shipped modular sprite sheet and preview.

Keep `src/game/walls.ts` as the gameplay source of truth for wall-family membership and connection detection. Gate remains there because it still connects, blocks raiders, and allows residents through.

## Tests

Required focused checks:

```powershell
node tools/render/test_wall_family_assets.mjs
python tools/render/test_wall_family_asset_pixels.py
node tools/game/test_walls_and_gate.mjs
npm.cmd run build
```

The render asset test must cover:

- sheet dimensions and filename
- material mapping
- `pillar` / `horizontal` / `vertical` classification
- gate exclusion from the base modular sheet
- source rect rows and columns
- TypeScript narrowing for wall-family wall types

## Out Of Scope

- Returning to 16-mask or bitmask sprite sheets
- Folding gates into the base three-piece wall sheet
- Changing wall gameplay values, passability, or demolition
- Generating earth, stone, or winter assets before the palisade normal set is approved
