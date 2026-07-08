# Wall Family Sprite Generation Design

## Goal

Replace the temporary procedural drawings for the wall family with generated, connected sprite assets.

The wall family includes:

- `palisade` / 목책
- `earthFort` / 토성
- `stoneWall` / 석벽
- `gate` / 성문

The visual result should read as one continuous defensive line. A wall segment, corner, T-junction, cross, endpoint, isolated piece, and gate should all use sprite art instead of canvas-drawn placeholder geometry.

## Approved Generation Order

1. Generate the connected `palisade` sheet first.
2. Generate the wooden `gate` sheet to match the approved palisade sheet.
3. Use the approved palisade sheet as the main reference to edit-generate the `earthFort` sheet.
4. Use the approved palisade sheet as the main reference to edit-generate the `stoneWall` sheet.
5. Use the approved wall sheets plus gate reference to edit-generate earth and stone gate variants.
6. Use each approved normal-season sheet as its own reference to edit-generate winter versions.

The palisade is the shape reference. Earth fort and stone wall should preserve the same tile footprint, connection language, and silhouette family while changing material: packed earth for 토성, dressed stone for 석벽.

## Sprite Structure

Use a 4-bit connection mask for every wall-family tile:

- Bit 0: north
- Bit 1: east
- Bit 2: south
- Bit 3: west

This creates 16 sprite variants per visual material. The mask index is `n + e*2 + s*4 + w*8`.

Final shipped sheet:

- File: `public/assets/wall-family-generated-v1.png`
- Cell size: `28x40`
- Columns: `16`
- Rows: `12`

Rows are:

1. Palisade wall, normal
2. Earth fort wall, normal
3. Stone wall, normal
4. Wooden gate, normal
5. Earth gate, normal
6. Stone gate, normal
7. Palisade wall, winter
8. Earth fort wall, winter
9. Stone wall, winter
10. Wooden gate, winter
11. Earth gate, winter
12. Stone gate, winter

Only one in-game building type named `gate` remains. At render time, the gate chooses a visual material from adjacent solid wall segments:

1. If adjacent to any `stoneWall`, draw the stone gate.
2. Else if adjacent to any `earthFort`, draw the earth gate.
3. Else draw the wooden gate.

This keeps gameplay simple while making gates match the wall line around them.

## Source Assets

Keep generation source images in `tools/render/source_images/`:

- `wall-family-palisade-normal-source-v1.png`
- `wall-family-gate-wood-normal-source-v1.png`
- `wall-family-earthfort-normal-source-v1.png`
- `wall-family-stonewall-normal-source-v1.png`
- `wall-family-gate-earth-normal-source-v1.png`
- `wall-family-gate-stone-normal-source-v1.png`
- Winter equivalents with `winter` in the filename

Keep review previews in `docs/assets/walls/`:

- Contact sheet previews at 4x scale
- In-game layout previews with straight lines, corners, junctions, closed enclosures, and gates
- Notes documenting which generated candidate was selected

Generated source sheets should use a flat chroma-key background and no labels. The composition script will remove the key color and normalize cells into the final shipped sprite sheet.

## Prompt Direction

All prompts should request:

- top-down 2D game sprites
- late-Joseon northern frontier material language
- readable pixel-art clusters at small size
- exact 4x4 contact sheet of the 16 connection masks
- consistent anchor, thickness, tile footprint, and lighting
- flat chroma-key background
- no text, labels, scenery, people, shadows, watermarks, UI, or perspective camera angle

Palisade style:

- rough timber posts and horizontal braces
- practical frontier construction
- warm dark wood, worn edges, restrained highlights

Earth fort style:

- packed earth wall body
- timber reinforcement where useful
- brown earth mass, compacted surface, slightly heavier than palisade

Stone wall style:

- stacked/dressed stone blocks
- colder gray material
- heavier and more durable than earth fort, but still same footprint

Gate style:

- central readable opening or door leaf
- side posts aligned with neighboring wall sprites
- material should match wood, earth, or stone variant
- must still read as a passable resident entrance, not a broken wall

Winter style:

- preserve the normal sheet silhouette exactly
- add snow caps and cold desaturation
- avoid covering connection readability

## Rendering Changes

Create `src/render/wallFamilyAssets.ts` with:

- `WALL_FAMILY_SHEET`
- `WallVisualMaterial`
- `wallConnectionMask(connections)`
- `wallFamilySourceRect(type, connections, season, adjacentTypes)`

Extend the render path so `BuildingDrawParams` can carry adjacent wall-family building types, not only boolean connections. `renderer.ts` should compute both from the same built wall lookup:

- connection booleans decide the 4-bit sprite mask
- adjacent solid wall types decide which gate material row to use

Replace `drawWallFamilyBuilding()` in `src/render/atlas.ts` so it blits from `wall-family-generated-v1.png` instead of drawing procedural shapes.

Keep `src/game/walls.ts` as the gameplay source of truth for wall-family membership and connection detection.

## Tests

Add or extend render tests to cover:

- Source rects for all 16 masks
- Normal and winter row mapping
- Gate visual material selection from adjacent wall types
- Existing wall gameplay tests still passing
- Build still passing

Required verification commands:

```powershell
node tools/game/test_walls_and_gate.mjs
node tools/render/test_wall_family_assets.mjs
npm.cmd run build
```

Image QA should include generated preview sheets and at least one in-game preview arrangement for:

- isolated segment
- horizontal and vertical line
- four corners
- T-junctions
- cross junction
- enclosed wall with one gate
- mixed palisade, earth fort, stone wall, and gate adjacency

## Out Of Scope

- New gameplay behavior for walls
- Separate gate building types
- Changing wall defense values, build costs, unlock ranks, or passability rules
- Regenerating non-wall building sprites
- Replacing terrain or resident assets
