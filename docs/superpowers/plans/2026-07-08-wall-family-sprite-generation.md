# Wall Family Sprite Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the temporary procedural wall-family rendering with generated connected sprites for palisade, earth fort, stone wall, and gate, including winter variants.

**Architecture:** Keep gameplay wall membership in `src/game/walls.ts`. Add a render-only wall-family asset module that maps wall connections and adjacent wall material to sheet source rectangles. Generate source sheets in the approved order, compose them into one shipped sprite sheet, then route `atlas.ts` through that sheet.

**Tech Stack:** TypeScript, React/Vite canvas renderer, Node render tests, Python + Pillow asset composition, built-in image generation for source sprite sheets.

---

## File Structure

- Modify: `src/game/walls.ts`
  - Adds built wall tile maps and adjacent wall-type helpers.
- Create: `src/render/wallFamilyAssets.ts`
  - Owns sheet metadata, 4-bit connection masks, gate material selection, and source rectangles.
- Modify: `src/render/sprites.ts`
  - Adds adjacent wall-family type data to `BuildingDrawParams`.
- Modify: `src/render/renderer.ts`
  - Computes wall connections and adjacent wall types from the same built wall lookup.
- Modify: `src/render/atlas.ts`
  - Loads `wall-family-generated-v1.png` and blits wall-family buildings from it.
- Create: `tools/render/test_wall_family_assets.mjs`
  - Tests source rects, mask mapping, and gate material selection.
- Create: `tools/render/compose_wall_family_assets_v1.py`
  - Normalizes 12 generated 4x4 source sheets into one shipped sprite sheet.
- Create: `tools/render/test_wall_family_asset_pixels.py`
  - Tests dimensions, non-empty cells, bottom alignment, and alpha.
- Add: `tools/render/source_images/wall-family-*.png`
  - Generated source contact sheets.
- Add: `public/assets/wall-family-generated-v1.png`
  - Shipped sprite sheet consumed by the renderer.
- Add: `docs/assets/walls/*`
  - 4x preview sheets, layout previews, and generation notes.

---

### Task 1: Wall Adjacency Helpers

**Files:**
- Modify: `src/game/walls.ts`
- Modify: `tools/game/test_walls_and_gate.mjs`

- [ ] **Step 1: Add failing adjacency tests**

Insert this block in `tools/game/test_walls_and_gate.mjs` before the final `console.log()`:

```js
{
  const state = makeState();
  addBuilt(state, 'gate', 10, 10);
  addBuilt(state, 'earthFort', 10, 9);
  addBuilt(state, 'gate', 11, 10);
  addBuilt(state, 'stoneWall', 10, 11);
  addBuilt(state, 'palisade', 9, 10);
  addBuilt(state, 'watchtower', 10, 8);

  const map = walls.builtWallTileMap(state);
  assert.deepEqual(
    [...map.entries()].sort(),
    [
      ['10,10', 'gate'],
      ['10,11', 'stoneWall'],
      ['10,9', 'earthFort'],
      ['11,10', 'gate'],
      ['9,10', 'palisade'],
    ],
    'builtWallTileMap includes built wall-family tiles only',
  );
  assert.deepEqual(
    walls.wallConnectionsFromMap(map, 10, 10),
    { n: true, e: true, s: true, w: true },
    'wallConnectionsFromMap detects every adjacent wall-family tile',
  );
  assert.deepEqual(
    walls.wallAdjacentTypesFromMap(map, 10, 10),
    { n: 'earthFort', e: 'gate', s: 'stoneWall', w: 'palisade' },
    'wallAdjacentTypesFromMap returns adjacent wall-family building types',
  );
}
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node tools/game/test_walls_and_gate.mjs
```

Expected: FAIL because `builtWallTileMap`, `wallConnectionsFromMap`, and `wallAdjacentTypesFromMap` do not exist yet.

- [ ] **Step 3: Implement adjacency helpers**

Update `src/game/walls.ts` to include these exports while preserving the existing functions:

```ts
import type { BuildingTypeId, GameState } from './types';

export interface WallConnections {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

export interface WallAdjacentTypes {
  n?: BuildingTypeId;
  e?: BuildingTypeId;
  s?: BuildingTypeId;
  w?: BuildingTypeId;
}

export const WALL_BUILDING_TYPES = [
  'palisade',
  'earthFort',
  'stoneWall',
  'gate',
] as const satisfies readonly BuildingTypeId[];

const WALL_BUILDING_SET: ReadonlySet<BuildingTypeId> = new Set(WALL_BUILDING_TYPES);
const SOLID_WALL_BUILDING_SET: ReadonlySet<BuildingTypeId> = new Set([
  'palisade',
  'earthFort',
  'stoneWall',
]);

export function isWallBuilding(type: BuildingTypeId): boolean {
  return WALL_BUILDING_SET.has(type);
}

export function isSolidWallBuilding(type: BuildingTypeId): boolean {
  return SOLID_WALL_BUILDING_SET.has(type);
}

export function isGateBuilding(type: BuildingTypeId): boolean {
  return type === 'gate';
}

export function wallTileKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function builtWallTileMap(state: Pick<GameState, 'buildings'>): Map<string, BuildingTypeId> {
  const tiles = new Map<string, BuildingTypeId>();
  for (const building of state.buildings) {
    if (building.built && isWallBuilding(building.type)) {
      tiles.set(wallTileKey(building.x, building.y), building.type);
    }
  }
  return tiles;
}

export function builtWallTileSet(state: Pick<GameState, 'buildings'>): Set<string> {
  return new Set(builtWallTileMap(state).keys());
}

export function wallConnectionsFromMap(
  wallTiles: ReadonlyMap<string, BuildingTypeId>,
  x: number,
  y: number,
): WallConnections {
  return {
    n: wallTiles.has(wallTileKey(x, y - 1)),
    e: wallTiles.has(wallTileKey(x + 1, y)),
    s: wallTiles.has(wallTileKey(x, y + 1)),
    w: wallTiles.has(wallTileKey(x - 1, y)),
  };
}

export function wallConnectionsFromSet(wallTiles: ReadonlySet<string>, x: number, y: number): WallConnections {
  return {
    n: wallTiles.has(wallTileKey(x, y - 1)),
    e: wallTiles.has(wallTileKey(x + 1, y)),
    s: wallTiles.has(wallTileKey(x, y + 1)),
    w: wallTiles.has(wallTileKey(x - 1, y)),
  };
}

export function wallAdjacentTypesFromMap(
  wallTiles: ReadonlyMap<string, BuildingTypeId>,
  x: number,
  y: number,
): WallAdjacentTypes {
  return {
    n: wallTiles.get(wallTileKey(x, y - 1)),
    e: wallTiles.get(wallTileKey(x + 1, y)),
    s: wallTiles.get(wallTileKey(x, y + 1)),
    w: wallTiles.get(wallTileKey(x - 1, y)),
  };
}

export function wallConnectionsAt(state: Pick<GameState, 'buildings'>, x: number, y: number): WallConnections {
  return wallConnectionsFromMap(builtWallTileMap(state), x, y);
}

export function wallAdjacentTypesAt(state: Pick<GameState, 'buildings'>, x: number, y: number): WallAdjacentTypes {
  return wallAdjacentTypesFromMap(builtWallTileMap(state), x, y);
}
```

- [ ] **Step 4: Verify wall tests pass**

Run:

```powershell
node tools/game/test_walls_and_gate.mjs
```

Expected: PASS with `wall and gate tests passed`.

- [ ] **Step 5: Commit**

```powershell
git add src/game/walls.ts tools/game/test_walls_and_gate.mjs
git commit -m "feat: expose wall adjacency types"
```

---

### Task 2: Wall Family Asset Mapping

**Files:**
- Create: `src/render/wallFamilyAssets.ts`
- Create: `tools/render/test_wall_family_assets.mjs`

- [ ] **Step 1: Write the failing render asset test**

Create `tools/render/test_wall_family_assets.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/render/wallFamilyAssets.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const assets = await import(moduleUrl);

assert.deepEqual(assets.WALL_FAMILY_SHEET, {
  tileSize: 28,
  spriteHeight: 40,
  columns: 16,
  rows: 12,
  src: '/assets/wall-family-generated-v1.png',
});

assert.equal(assets.wallConnectionMask({ n: false, e: false, s: false, w: false }), 0);
assert.equal(assets.wallConnectionMask({ n: true, e: false, s: false, w: false }), 1);
assert.equal(assets.wallConnectionMask({ n: false, e: true, s: false, w: false }), 2);
assert.equal(assets.wallConnectionMask({ n: false, e: false, s: true, w: false }), 4);
assert.equal(assets.wallConnectionMask({ n: false, e: false, s: false, w: true }), 8);
assert.equal(assets.wallConnectionMask({ n: true, e: true, s: true, w: true }), 15);

assert.deepEqual(
  assets.wallFamilySourceRect('palisade', { n: true, e: false, s: true, w: false }, 'summer'),
  { sx: 5 * 28, sy: 0, sw: 28, sh: 40 },
);
assert.deepEqual(
  assets.wallFamilySourceRect('earthFort', { n: false, e: true, s: false, w: true }, 'summer'),
  { sx: 10 * 28, sy: 40, sw: 28, sh: 40 },
);
assert.deepEqual(
  assets.wallFamilySourceRect('stoneWall', { n: true, e: true, s: true, w: true }, 'winter'),
  { sx: 15 * 28, sy: 8 * 40, sw: 28, sh: 40 },
);

assert.equal(assets.gateVisualMaterial({ n: 'palisade' }), 'wood');
assert.equal(assets.gateVisualMaterial({ n: 'earthFort', s: 'palisade' }), 'earth');
assert.equal(assets.gateVisualMaterial({ e: 'stoneWall', w: 'earthFort' }), 'stone');
assert.equal(assets.gateVisualMaterial({ n: 'gate', s: 'gate' }), 'wood');

assert.deepEqual(
  assets.wallFamilySourceRect('gate', { n: false, e: true, s: false, w: true }, 'summer', { e: 'earthFort' }),
  { sx: 10 * 28, sy: 4 * 40, sw: 28, sh: 40 },
);
assert.deepEqual(
  assets.wallFamilySourceRect('gate', { n: false, e: true, s: false, w: true }, 'winter', { w: 'stoneWall' }),
  { sx: 10 * 28, sy: 11 * 40, sw: 28, sh: 40 },
);

console.log('wall family asset tests passed');
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node tools/render/test_wall_family_assets.mjs
```

Expected: FAIL because `src/render/wallFamilyAssets.ts` does not exist.

- [ ] **Step 3: Implement the asset module**

Create `src/render/wallFamilyAssets.ts`:

```ts
import type { BuildingTypeId, Season } from '../game/types';
import type { WallAdjacentTypes, WallConnections } from '../game/walls';

export type WallVisualMaterial = 'wood' | 'earth' | 'stone';

export const WALL_FAMILY_SHEET = {
  tileSize: 28,
  spriteHeight: 40,
  columns: 16,
  rows: 12,
  src: '/assets/wall-family-generated-v1.png',
} as const;

const NORMAL_WALL_ROWS: Record<'palisade' | 'earthFort' | 'stoneWall', number> = {
  palisade: 0,
  earthFort: 1,
  stoneWall: 2,
};

const NORMAL_GATE_ROWS: Record<WallVisualMaterial, number> = {
  wood: 3,
  earth: 4,
  stone: 5,
};

const WINTER_ROW_OFFSET = 6;

export function wallConnectionMask(connections?: WallConnections): number {
  if (!connections) return 0;
  return (
    (connections.n ? 1 : 0) +
    (connections.e ? 2 : 0) +
    (connections.s ? 4 : 0) +
    (connections.w ? 8 : 0)
  );
}

export function gateVisualMaterial(adjacentTypes?: WallAdjacentTypes): WallVisualMaterial {
  const adjacent = [
    adjacentTypes?.n,
    adjacentTypes?.e,
    adjacentTypes?.s,
    adjacentTypes?.w,
  ];
  if (adjacent.includes('stoneWall')) return 'stone';
  if (adjacent.includes('earthFort')) return 'earth';
  return 'wood';
}

function rowFor(type: BuildingTypeId, season: Season, adjacentTypes?: WallAdjacentTypes): number {
  const seasonOffset = season === 'winter' ? WINTER_ROW_OFFSET : 0;
  if (type === 'gate') {
    return NORMAL_GATE_ROWS[gateVisualMaterial(adjacentTypes)] + seasonOffset;
  }
  if (type === 'palisade' || type === 'earthFort' || type === 'stoneWall') {
    return NORMAL_WALL_ROWS[type] + seasonOffset;
  }
  return NORMAL_WALL_ROWS.palisade + seasonOffset;
}

export function wallFamilySourceRect(
  type: BuildingTypeId,
  connections: WallConnections | undefined,
  season: Season,
  adjacentTypes?: WallAdjacentTypes,
) {
  const col = wallConnectionMask(connections);
  const row = rowFor(type, season, adjacentTypes);
  return {
    sx: col * WALL_FAMILY_SHEET.tileSize,
    sy: row * WALL_FAMILY_SHEET.spriteHeight,
    sw: WALL_FAMILY_SHEET.tileSize,
    sh: WALL_FAMILY_SHEET.spriteHeight,
  };
}
```

- [ ] **Step 4: Verify the render asset test passes**

Run:

```powershell
node tools/render/test_wall_family_assets.mjs
```

Expected: PASS with `wall family asset tests passed`.

- [ ] **Step 5: Commit**

```powershell
git add src/render/wallFamilyAssets.ts tools/render/test_wall_family_assets.mjs
git commit -m "feat: map wall family sprite rects"
```

---

### Task 3: Asset Composition Pipeline

**Files:**
- Create: `tools/render/compose_wall_family_assets_v1.py`
- Create: `tools/render/test_wall_family_asset_pixels.py`

- [ ] **Step 1: Write the composition and pixel test**

Create `tools/render/test_wall_family_asset_pixels.py`:

```python
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image, ImageDraw

from compose_wall_family_assets_v1 import (
    SOURCE_FILENAMES,
    TILE_SIZE,
    SPRITE_HEIGHT,
    compose_wall_family_assets,
)


def make_source(path: Path, row_index: int) -> None:
    image = Image.new("RGB", (512, 512), (255, 0, 255))
    draw = ImageDraw.Draw(image)
    cell = image.width // 4
    for index in range(16):
        col = index % 4
        row = index // 4
        left = col * cell + 18
        top = row * cell + 44
        right = (col + 1) * cell - 18
        bottom = (row + 1) * cell - 18
        color = (
            40 + (index * 11) % 180,
            40 + (row_index * 19) % 180,
            40 + (index * 7 + row_index * 13) % 180,
        )
        draw.rectangle((left, top, right, bottom), fill=color)
    image.save(path)


def alpha_bbox(image: Image.Image, col: int, row: int):
    crop = image.crop((
        col * TILE_SIZE,
        row * SPRITE_HEIGHT,
        (col + 1) * TILE_SIZE,
        (row + 1) * SPRITE_HEIGHT,
    ))
    bbox = crop.getchannel("A").getbbox()
    assert bbox is not None, f"cell {col},{row} is empty"
    return bbox


def test_compose_wall_family_assets() -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        for row_index, name in enumerate(SOURCE_FILENAMES):
            make_source(root / name, row_index)

        output = root / "wall-family-generated-v1.png"
        preview = root / "wall-family-generated-v1-preview-4x.png"
        compose_wall_family_assets(root, output, preview)

        image = Image.open(output).convert("RGBA")
        assert image.size == (16 * TILE_SIZE, 12 * SPRITE_HEIGHT)
        assert Image.open(preview).size == (16 * TILE_SIZE * 4, 12 * SPRITE_HEIGHT * 4)

        for row in range(12):
            for col in range(16):
                left, top, right, bottom = alpha_bbox(image, col, row)
                assert right - left >= 12
                assert bottom - top >= 12
                assert bottom >= SPRITE_HEIGHT - 2
                assert image.getpixel((col * TILE_SIZE, row * SPRITE_HEIGHT))[3] == 0


if __name__ == "__main__":
    test_compose_wall_family_assets()
    print("wall family asset pixel tests passed")
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
python tools/render/test_wall_family_asset_pixels.py
```

Expected: FAIL because `compose_wall_family_assets_v1.py` does not exist.

- [ ] **Step 3: Implement the composition script**

Create `tools/render/compose_wall_family_assets_v1.py`:

```python
from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "tools" / "render" / "source_images"
OUTPUT = ROOT / "public" / "assets" / "wall-family-generated-v1.png"
PREVIEW = ROOT / "docs" / "assets" / "walls" / "wall-family-generated-v1-preview-4x.png"

TILE_SIZE = 28
SPRITE_HEIGHT = 40
SOURCE_COLUMNS = 4
SOURCE_ROWS = 4
OUTPUT_COLUMNS = 16
OUTPUT_ROWS = 12

SOURCE_FILENAMES = [
    "wall-family-palisade-normal-source-v1.png",
    "wall-family-earthfort-normal-source-v1.png",
    "wall-family-stonewall-normal-source-v1.png",
    "wall-family-gate-wood-normal-source-v1.png",
    "wall-family-gate-earth-normal-source-v1.png",
    "wall-family-gate-stone-normal-source-v1.png",
    "wall-family-palisade-winter-source-v1.png",
    "wall-family-earthfort-winter-source-v1.png",
    "wall-family-stonewall-winter-source-v1.png",
    "wall-family-gate-wood-winter-source-v1.png",
    "wall-family-gate-earth-winter-source-v1.png",
    "wall-family-gate-stone-winter-source-v1.png",
]


def is_key_pixel(r: int, g: int, b: int) -> bool:
    magenta = r > 190 and g < 90 and b > 170
    green = r < 90 and g > 190 and b < 90
    return magenta or green


def remove_key(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            if a > 0 and is_key_pixel(r, g, b):
                pixels[x, y] = (0, 0, 0, 0)
    return rgba


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("source cell contains no non-key pixels")
    return bbox


def grid_crop(image: Image.Image, index: int) -> Image.Image:
    col = index % SOURCE_COLUMNS
    row = index // SOURCE_COLUMNS
    left = round((image.width * col) / SOURCE_COLUMNS)
    top = round((image.height * row) / SOURCE_ROWS)
    right = round((image.width * (col + 1)) / SOURCE_COLUMNS)
    bottom = round((image.height * (row + 1)) / SOURCE_ROWS)
    return image.crop((left, top, right, bottom))


def fit_to_cell(sprite: Image.Image) -> Image.Image:
    cropped = sprite.crop(alpha_bbox(sprite))
    scale = min(TILE_SIZE / cropped.width, 28 / cropped.height)
    resized = cropped.resize(
        (
            max(1, round(cropped.width * scale)),
            max(1, round(cropped.height * scale)),
        ),
        Image.Resampling.LANCZOS,
    )
    cell = Image.new("RGBA", (TILE_SIZE, SPRITE_HEIGHT), (0, 0, 0, 0))
    x = (TILE_SIZE - resized.width) // 2
    y = SPRITE_HEIGHT - resized.height
    cell.alpha_composite(resized, (x, y))
    return cell


def compose_wall_family_assets(
    source_dir: Path = SOURCE_DIR,
    output_path: Path = OUTPUT,
    preview_path: Path = PREVIEW,
) -> None:
    output = Image.new(
        "RGBA",
        (OUTPUT_COLUMNS * TILE_SIZE, OUTPUT_ROWS * SPRITE_HEIGHT),
        (0, 0, 0, 0),
    )

    for row, filename in enumerate(SOURCE_FILENAMES):
        source_path = source_dir / filename
        if not source_path.exists():
            raise FileNotFoundError(source_path)
        image = Image.open(source_path).convert("RGB")
        for index in range(16):
            crop = remove_key(grid_crop(image, index))
            cell = fit_to_cell(crop)
            output.alpha_composite(cell, (index * TILE_SIZE, row * SPRITE_HEIGHT))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output.save(output_path)
    print(f"wrote {output_path}")

    preview_path.parent.mkdir(parents=True, exist_ok=True)
    preview = output.resize((output.width * 4, output.height * 4), Image.Resampling.NEAREST)
    preview.save(preview_path)
    print(f"wrote {preview_path}")


def main() -> None:
    compose_wall_family_assets()


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Verify the composition test passes**

Run:

```powershell
python tools/render/test_wall_family_asset_pixels.py
```

Expected: PASS with `wall family asset pixel tests passed`.

- [ ] **Step 5: Commit**

```powershell
git add tools/render/compose_wall_family_assets_v1.py tools/render/test_wall_family_asset_pixels.py
git commit -m "feat: compose wall family sprite sheet"
```

---

### Task 4: Generate Source Sprite Sheets

**Files:**
- Add: `tools/render/source_images/wall-family-*.png`
- Add: `docs/assets/walls/wall-family-generation-notes.md`

- [ ] **Step 1: Generate palisade normal source**

Use the built-in image generation path. Prompt:

```text
Use case: game asset
Asset type: 2D top-down connected wall sprite source sheet
Primary request: Create a 4 by 4 contact sheet of connected wooden palisade wall tiles for a late-Joseon northern frontier survival game.
Subject: rough timber palisade wall segments, practical frontier construction, warm dark wood, worn edges, restrained highlights.
Composition/framing: exactly 16 separate top-down tile sprites arranged in a clean 4x4 grid. The variants must be ordered by connection mask index 0 through 15, reading left to right and top to bottom. Bit 0 north, bit 1 east, bit 2 south, bit 3 west. Each tile must preserve the same footprint, thickness, anchor, and lighting.
Style/medium: readable pixel-art clusters, production game asset, not concept art.
Background: perfectly flat solid #ff00ff chroma-key background.
Constraints: no text, labels, people, scenery, UI, watermarks, shadows, perspective camera angle, or floor plane. Keep generous padding inside each grid cell. Do not use #ff00ff anywhere in the sprites.
```

Save the selected result as:

```text
tools/render/source_images/wall-family-palisade-normal-source-v1.png
```

- [ ] **Step 2: Review palisade before continuing**

Open the saved image and check:

- all 16 masks are visually distinct
- endpoints, straight lines, corners, T-junctions, and cross junction read correctly
- thickness is consistent
- grid is usable by the composition script

If the palisade does not pass, regenerate only this source before continuing.

- [ ] **Step 3: Generate wooden gate normal source from palisade reference**

Load the approved palisade source image as the reference image, then prompt:

```text
Use case: game asset
Asset type: 2D top-down connected gate sprite source sheet
Input image: use the wooden palisade sheet as the shape, palette, footprint, lighting, and connection reference.
Primary request: Create a matching 4 by 4 contact sheet of wooden gate tiles for the same wall family. Preserve the connection mask order 0 through 15, left to right and top to bottom.
Subject: wooden frontier gate with side posts aligned to the palisade, central readable opening or door leaf, still clearly passable for residents.
Style/medium: readable pixel-art clusters, production game asset.
Background: perfectly flat solid #ff00ff chroma-key background.
Constraints: keep the same footprint, tile anchor, wall thickness, lighting direction, and grid structure as the palisade reference. No text, labels, scenery, people, UI, watermarks, shadows, perspective camera angle, or floor plane.
```

Save as:

```text
tools/render/source_images/wall-family-gate-wood-normal-source-v1.png
```

- [ ] **Step 4: Generate earth fort normal source from palisade reference**

Load the approved palisade source image as reference, then prompt:

```text
Use case: game asset
Asset type: 2D top-down connected wall sprite source sheet
Input image: use the wooden palisade sheet as the exact connection, footprint, anchor, and silhouette-family reference.
Primary request: Edit the wall material into packed earth fort segments while preserving the same 4 by 4 connection mask sheet and tile order.
Subject: compacted brown earth wall body with subtle timber reinforcement, heavier than palisade but still matching the same wall line footprint.
Style/medium: readable pixel-art clusters, production game asset.
Background: perfectly flat solid #ff00ff chroma-key background.
Constraints: preserve all 16 connection variants, same grid, same lighting, same connection endpoints. Do not add buildings, people, labels, UI, scenery, shadows, or perspective.
```

Save as:

```text
tools/render/source_images/wall-family-earthfort-normal-source-v1.png
```

- [ ] **Step 5: Generate stone wall normal source from palisade reference**

Load the approved palisade source image as reference, then prompt:

```text
Use case: game asset
Asset type: 2D top-down connected wall sprite source sheet
Input image: use the wooden palisade sheet as the exact connection, footprint, anchor, and silhouette-family reference.
Primary request: Edit the wall material into dressed stone wall segments while preserving the same 4 by 4 connection mask sheet and tile order.
Subject: gray stacked stone blocks, heavier and more durable than earth fort, cold restrained highlights, same wall line footprint.
Style/medium: readable pixel-art clusters, production game asset.
Background: perfectly flat solid #ff00ff chroma-key background.
Constraints: preserve all 16 connection variants, same grid, same lighting, same connection endpoints. Do not add buildings, people, labels, UI, scenery, shadows, or perspective.
```

Save as:

```text
tools/render/source_images/wall-family-stonewall-normal-source-v1.png
```

- [ ] **Step 6: Generate earth and stone gate normal sources**

Use both the approved wooden gate source and the matching wall material source as references.

Earth gate prompt:

```text
Use case: game asset
Asset type: 2D top-down connected gate sprite source sheet
Input images: wooden gate sheet for gate silhouette and connection order; earth fort sheet for material palette and texture.
Primary request: Create an earth-fort gate variant that keeps the wooden gate's 4 by 4 connection mask layout, footprint, and passable entrance readability while matching the earth fort material.
Background: perfectly flat solid #ff00ff chroma-key background.
Constraints: preserve all 16 connection variants, same grid, same lighting, same tile anchor. No text, labels, people, scenery, UI, watermarks, shadows, or perspective.
```

Stone gate prompt:

```text
Use case: game asset
Asset type: 2D top-down connected gate sprite source sheet
Input images: wooden gate sheet for gate silhouette and connection order; stone wall sheet for material palette and texture.
Primary request: Create a stone-wall gate variant that keeps the wooden gate's 4 by 4 connection mask layout, footprint, and passable entrance readability while matching the stone wall material.
Background: perfectly flat solid #ff00ff chroma-key background.
Constraints: preserve all 16 connection variants, same grid, same lighting, same tile anchor. No text, labels, people, scenery, UI, watermarks, shadows, or perspective.
```

Save as:

```text
tools/render/source_images/wall-family-gate-earth-normal-source-v1.png
tools/render/source_images/wall-family-gate-stone-normal-source-v1.png
```

- [ ] **Step 7: Generate winter variants from each approved normal source**

For each normal source, load that source as the reference and use this prompt, replacing `{material}`:

```text
Use case: game asset
Asset type: winter 2D top-down connected wall-family sprite source sheet
Input image: use the approved normal-season {material} sheet as the exact silhouette, connection, grid, footprint, and anchor reference.
Primary request: Create a winter version of the same 4 by 4 contact sheet. Preserve every connection shape exactly, but add readable snow caps, cold desaturation, and subtle frost.
Background: perfectly flat solid #ff00ff chroma-key background.
Constraints: keep the same 16 mask order, same grid, same tile anchor, same silhouette, and same connection readability. Do not cover openings or endpoints with snow. No text, labels, people, scenery, UI, watermarks, shadows, or perspective.
```

Save as:

```text
tools/render/source_images/wall-family-palisade-winter-source-v1.png
tools/render/source_images/wall-family-earthfort-winter-source-v1.png
tools/render/source_images/wall-family-stonewall-winter-source-v1.png
tools/render/source_images/wall-family-gate-wood-winter-source-v1.png
tools/render/source_images/wall-family-gate-earth-winter-source-v1.png
tools/render/source_images/wall-family-gate-stone-winter-source-v1.png
```

- [ ] **Step 8: Record selected prompts and notes**

Create `docs/assets/walls/wall-family-generation-notes.md`:

```md
# Wall Family Generation Notes

## Selected Sources

- Palisade normal: `tools/render/source_images/wall-family-palisade-normal-source-v1.png`
- Wood gate normal: `tools/render/source_images/wall-family-gate-wood-normal-source-v1.png`
- Earth fort normal: `tools/render/source_images/wall-family-earthfort-normal-source-v1.png`
- Stone wall normal: `tools/render/source_images/wall-family-stonewall-normal-source-v1.png`
- Earth gate normal: `tools/render/source_images/wall-family-gate-earth-normal-source-v1.png`
- Stone gate normal: `tools/render/source_images/wall-family-gate-stone-normal-source-v1.png`
- Palisade winter: `tools/render/source_images/wall-family-palisade-winter-source-v1.png`
- Earth fort winter: `tools/render/source_images/wall-family-earthfort-winter-source-v1.png`
- Stone wall winter: `tools/render/source_images/wall-family-stonewall-winter-source-v1.png`
- Wood gate winter: `tools/render/source_images/wall-family-gate-wood-winter-source-v1.png`
- Earth gate winter: `tools/render/source_images/wall-family-gate-earth-winter-source-v1.png`
- Stone gate winter: `tools/render/source_images/wall-family-gate-stone-winter-source-v1.png`

## QA Notes

- Palisade approved before material edits.
- Earth fort and stone wall preserve palisade footprint and connection order.
- Winter variants preserve normal silhouettes and endpoints.
- Gate variants preserve passable entrance readability.
```

- [ ] **Step 9: Commit source selections**

```powershell
git add tools/render/source_images/wall-family-*.png docs/assets/walls/wall-family-generation-notes.md
git commit -m "art: add wall family source sheets"
```

---

### Task 5: Compose Shipped Sheet

**Files:**
- Add: `public/assets/wall-family-generated-v1.png`
- Add: `docs/assets/walls/wall-family-generated-v1-preview-4x.png`

- [ ] **Step 1: Compose the final sheet**

Run:

```powershell
python tools/render/compose_wall_family_assets_v1.py
```

Expected:

```text
wrote ...\public\assets\wall-family-generated-v1.png
wrote ...\docs\assets\walls\wall-family-generated-v1-preview-4x.png
```

- [ ] **Step 2: Verify pixel properties**

Run:

```powershell
python tools/render/test_wall_family_asset_pixels.py
```

Expected: PASS with `wall family asset pixel tests passed`.

- [ ] **Step 3: Inspect the preview sheet**

Open:

```text
docs/assets/walls/wall-family-generated-v1-preview-4x.png
```

Check:

- every row has 16 non-empty cells
- normal rows and winter rows align
- gates match the material rows
- no magenta or green chroma-key remnants remain
- no labels or scenery are present

- [ ] **Step 4: Commit composed assets**

```powershell
git add public/assets/wall-family-generated-v1.png docs/assets/walls/wall-family-generated-v1-preview-4x.png
git commit -m "art: compose wall family sprite sheet"
```

---

### Task 6: Route Renderer Through Generated Wall Sprites

**Files:**
- Modify: `src/render/sprites.ts`
- Modify: `src/render/renderer.ts`
- Modify: `src/render/atlas.ts`
- Test: `tools/render/test_wall_family_assets.mjs`
- Test: `tools/game/test_walls_and_gate.mjs`

- [ ] **Step 1: Extend draw params**

Modify `BuildingDrawParams` in `src/render/sprites.ts`:

```ts
import type { WallAdjacentTypes, WallConnections } from '../game/walls';
```

Then replace the current `connections` property with:

```ts
connections?: WallConnections;
wallAdjacentTypes?: WallAdjacentTypes;
```

- [ ] **Step 2: Pass adjacent wall types from the renderer**

Modify imports in `src/render/renderer.ts`:

```ts
import {
  builtWallTileMap,
  isWallBuilding,
  wallAdjacentTypesFromMap,
  wallConnectionsFromMap,
} from '../game/walls';
```

Replace:

```ts
const wallTiles = builtWallTileSet(state);
```

with:

```ts
const wallTiles = builtWallTileMap(state);
```

Replace the `connections` assignment in `sprites.drawBuilding()` with:

```ts
connections: b.built && isWallBuilding(b.type)
  ? wallConnectionsFromMap(wallTiles, b.x, b.y)
  : undefined,
wallAdjacentTypes: b.built && isWallBuilding(b.type)
  ? wallAdjacentTypesFromMap(wallTiles, b.x, b.y)
  : undefined,
```

- [ ] **Step 3: Load the wall family sheet**

Modify imports in `src/render/atlas.ts`:

```ts
import {
  WALL_FAMILY_SHEET,
  wallFamilySourceRect,
} from './wallFamilyAssets';
```

Add image state:

```ts
let wallFamilySheet: HTMLImageElement | null = null;
```

In `ensureLoaded()`, after `promotionLargeBuildingSheet` is initialized, add:

```ts
wallFamilySheet = new Image();
wallFamilySheet.onload = () => { loaded++; };
wallFamilySheet.src = WALL_FAMILY_SHEET.src;
```

Update `atlasReady()`:

```ts
return loaded >= 13;
```

- [ ] **Step 4: Replace procedural wall drawing with sheet blit**

Delete `drawWallFamilyBuilding()` from `src/render/atlas.ts`.

Add this helper near the other generated building blitters:

```ts
function blitWallFamilyBuilding(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  p: BuildingDrawParams,
): void {
  const rect = wallFamilySourceRect(p.type, p.connections, p.season, p.wallAdjacentTypes);
  const scale = p.size / WALL_FAMILY_SHEET.tileSize;
  const destHeight = WALL_FAMILY_SHEET.spriteHeight * scale;
  ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, p.x, p.y + p.size - destHeight, p.size, destHeight);
}
```

Then replace:

```ts
if (drawWallFamilyBuilding(ctx, p)) {
  ctx.globalAlpha = 1;
  drawProgressBar(ctx, p);
  return;
}
```

with:

```ts
if (wallFamilySheet && isWallBuilding(p.type)) {
  blitWallFamilyBuilding(ctx, wallFamilySheet, p);
  ctx.globalAlpha = 1;
  drawProgressBar(ctx, p);
  return;
}
```

Remove the now-unused `isGateBuilding` import.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
node tools/render/test_wall_family_assets.mjs
node tools/game/test_walls_and_gate.mjs
```

Expected:

```text
wall family asset tests passed
wall and gate tests passed
```

- [ ] **Step 6: Run build**

Run:

```powershell
npm.cmd run build
```

Expected: PASS with Vite build output ending in `built in ...`.

- [ ] **Step 7: Commit renderer routing**

```powershell
git add src/render/sprites.ts src/render/renderer.ts src/render/atlas.ts
git commit -m "feat: render generated wall family sprites"
```

---

### Task 7: In-Game Preview QA

**Files:**
- Add: `docs/assets/walls/wall-family-layout-preview-4x.png`

- [ ] **Step 1: Start the dev server**

Run:

```powershell
npm.cmd run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL.

- [ ] **Step 2: Use browser QA**

Open the local URL and create or load a map section with:

- isolated wall segment
- horizontal and vertical line
- all four corners
- T-junction
- cross junction
- enclosed wall with one gate
- gate next to palisade
- gate next to earth fort
- gate next to stone wall
- normal season
- winter season

Capture a screenshot and save it as:

```text
docs/assets/walls/wall-family-layout-preview-4x.png
```

- [ ] **Step 3: Check visual criteria**

Confirm:

- no procedural placeholder wall remains visible
- connection masks line up without gaps
- gate material changes based on neighboring wall material
- winter versions preserve connections
- wall art does not overlap residents or buildings incoherently

- [ ] **Step 4: Commit QA preview**

```powershell
git add docs/assets/walls/wall-family-layout-preview-4x.png
git commit -m "docs: add wall family visual QA preview"
```

---

### Task 8: Final Verification

**Files:**
- No edits unless verification reveals a bug.

- [ ] **Step 1: Run all focused commands**

Run:

```powershell
node tools/game/test_walls_and_gate.mjs
node tools/render/test_wall_family_assets.mjs
python tools/render/test_wall_family_asset_pixels.py
npm.cmd run build
```

Expected:

```text
wall and gate tests passed
wall family asset tests passed
wall family asset pixel tests passed
vite ... built in ...
```

- [ ] **Step 2: Check git status**

Run:

```powershell
git status --short --branch
```

Expected: clean working tree on `codex/wall-family-gate` after all commits.

- [ ] **Step 3: Summarize shipped assets**

Final response should mention:

- `public/assets/wall-family-generated-v1.png`
- `docs/assets/walls/wall-family-generated-v1-preview-4x.png`
- `docs/assets/walls/wall-family-layout-preview-4x.png`
- tests and build actually run
