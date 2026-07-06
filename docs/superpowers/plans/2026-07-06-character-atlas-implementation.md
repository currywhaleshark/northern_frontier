# Historical Character Atlas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent resident gender data, generate a coordinated historical character atlas, and render gendered residents plus mounted `마적` raiders through the existing SpriteAPI boundary.

**Architecture:** Keep simulation changes narrow: residents gain a real `gender` field and old saves are migrated on load. Rendering uses a new generated character metadata module with explicit rectangles so resident cells and wider mounted raider cells can coexist in one sheet. The existing Kenney character image remains the runtime fallback when the generated character sheet is unavailable.

**Tech Stack:** TypeScript, React/Vite canvas rendering, Node `.mjs` smoke tests, Python/Pillow asset normalization.

---

## Scope Check

The approved spec covers one subsystem: character asset production and runtime integration. Marriage, birth, family trees, inheritance, raider simulation data, job renaming, and battle mechanics are outside this implementation.

## File Structure

- Modify: `src/game/types.ts`
  - Add `Gender` type.
  - Add `gender` to `Resident`.
- Modify: `src/game/residents.ts`
  - Assign gender when creating residents.
- Modify: `src/game/saveLoad.ts`
  - Migrate old saves that do not have resident gender values.
- Create: `tools/game/test_resident_gender.mjs`
  - Verify new residents get gender and old saves load with migrated gender.
- Create: `src/render/generatedCharacterAssets.ts`
  - Own all source rectangle metadata for the generated character sheet.
- Create: `tools/render/test_generated_character_assets.mjs`
  - Verify sheet constants and source rectangle mapping.
- Create: `tools/render/source_images/generated-characters-v1.png`
  - Store the raw generated 22-subject source sheet.
- Create: `tools/render/compose_generated_character_assets_v1.py`
  - Normalize the generated source sheet into runtime cells.
- Create: `public/assets/folk-characters-generated-v1.png`
  - Store the runtime character atlas.
- Create: `tools/render/test_generated_character_asset_pixels.py`
  - Verify the runtime atlas has the expected dimensions and non-empty cells.
- Modify: `src/render/sprites.ts`
  - Add resident gender to `ResidentDrawParams`.
- Modify: `src/render/renderer.ts`
  - Pass resident gender into `sprites.drawResident`.
- Modify: `src/render/atlas.ts`
  - Load the generated character sheet and use explicit source rectangles for residents and mounted raiders.

## Task 1: Add Persistent Resident Gender

**Files:**
- Modify: `src/game/types.ts`
- Modify: `src/game/residents.ts`
- Modify: `src/game/saveLoad.ts`
- Create: `tools/game/test_resident_gender.mjs`

- [ ] **Step 1: Write the failing resident gender test**

Create `tools/game/test_resident_gender.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-resident-gender-tests-'));
  const files = readdirSync(srcDir).filter(file => file.endsWith('.ts'));
  for (const file of files) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) => {
      if (/\.[cm]?js$/.test(spec)) return `${start}${spec}${end}`;
      return `${start}${spec}.mjs${end}`;
    });
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function isGender(value) {
  return value === 'male' || value === 'female';
}

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const residents = await import(pathToFileURL(join(compiledDir, 'residents.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);

{
  const state = simulation.newGame(123);
  assert.ok(state.residents.length > 0);
  assert.ok(state.residents.every(r => isGender(r.gender)));
}

{
  const state = simulation.newGame(456);
  const createdFemale = residents.createResident(state, () => 0.25, 'farmer');
  const createdMale = residents.createResident(state, () => 0.75, 'hunter');
  assert.equal(createdFemale.gender, 'female');
  assert.equal(createdMale.gender, 'male');
}

{
  globalThis.localStorage = new MemoryStorage();
  const oldState = simulation.newGame(789);
  for (const resident of oldState.residents) delete resident.gender;
  localStorage.setItem('buksae-save-v3', JSON.stringify(oldState));

  const loaded = saveLoad.loadGame();
  assert.ok(loaded);
  assert.ok(loaded.residents.every(r => isGender(r.gender)));

  localStorage.setItem('buksae-save-v3', JSON.stringify(oldState));
  const loadedAgain = saveLoad.loadGame();
  assert.ok(loadedAgain);
  assert.deepEqual(
    loadedAgain.residents.map(r => r.gender),
    loaded.residents.map(r => r.gender),
  );
}

console.log('resident gender tests passed');
```

- [ ] **Step 2: Run the resident gender test and verify it fails**

Run:

```bash
node tools/game/test_resident_gender.mjs
```

Expected: FAIL because `Resident` objects do not have `gender` yet.

- [ ] **Step 3: Add `Gender` and `Resident.gender`**

Modify `src/game/types.ts` by adding the type near `JobId` and adding the field to `Resident`:

```ts
export type Gender = 'male' | 'female';

export interface Resident {
  id: number;
  name: string;
  age: number;
  gender: Gender;
  job: JobId;
  hunger: number;
  warmth: number;
  health: number;
  morale: number;
  skills: Partial<Record<JobId, number>>;
  task: string;
  alive: boolean;
  sick: boolean;
  x: number;
  y: number;
  px: number;
  py: number;
  phase: AgentPhase;
  path: { x: number; y: number }[];
  workTimer: number;
  targetId: number | null;
  carrying: Partial<Record<ResourceId, number>>;
}
```

- [ ] **Step 4: Assign gender in `createResident`**

Modify the type import and add a small helper in `src/game/residents.ts`:

```ts
import type { GameState, Gender, JobId, Resident } from './types';

export function rollResidentGender(rng: () => number): Gender {
  return rng() < 0.5 ? 'female' : 'male';
}
```

Add the field in the returned resident:

```ts
return {
  id: state.nextResidentId++,
  name,
  age: 16 + Math.floor(rng() * 34),
  gender: rollResidentGender(rng),
  job,
  hunger: 80,
  warmth: 80,
  health: 100,
  morale: 60,
  skills: {},
  task: JOB_NAMES[job],
  alive: true,
  sick: false,
  x: cx,
  y: cy,
  px: cx,
  py: cy,
  phase: 'rest',
  path: [],
  workTimer: 0,
  targetId: null,
  carrying: {},
};
```

- [ ] **Step 5: Migrate old saves**

Modify the type import in `src/game/saveLoad.ts`:

```ts
import type { GameState, Gender, Resident } from './types';
```

Add these helpers below `SAVE_KEY`:

```ts
function isGender(value: unknown): value is Gender {
  return value === 'male' || value === 'female';
}

function stableGenderForResident(resident: Pick<Resident, 'id' | 'name'>): Gender {
  let hash = (resident.id * 2166136261) >>> 0;
  for (let i = 0; i < resident.name.length; i++) {
    hash ^= resident.name.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return (hash & 1) === 0 ? 'female' : 'male';
}

function migrateResidentGender(state: GameState): void {
  for (const resident of state.residents as Array<Resident & { gender?: unknown }>) {
    if (!isGender(resident.gender)) {
      resident.gender = stableGenderForResident(resident);
    }
  }
}
```

Call the migration before returning from `loadGame`:

```ts
migrateResidentGender(parsed);
return parsed;
```

- [ ] **Step 6: Run the resident gender test and verify it passes**

Run:

```bash
node tools/game/test_resident_gender.mjs
```

Expected: PASS with `resident gender tests passed`.

- [ ] **Step 7: Commit resident gender changes**

Run:

```bash
git add src/game/types.ts src/game/residents.ts src/game/saveLoad.ts tools/game/test_resident_gender.mjs
git commit -m "Add resident gender field"
```

## Task 2: Add Generated Character Atlas Metadata

**Files:**
- Create: `src/render/generatedCharacterAssets.ts`
- Create: `tools/render/test_generated_character_assets.mjs`

- [ ] **Step 1: Write the failing metadata test**

Create `tools/render/test_generated_character_assets.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/render/generatedCharacterAssets.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const {
  GENERATED_CHARACTER_SHEET,
  generatedMountedRaiderSourceRect,
  generatedResidentSourceRect,
} = await import(moduleUrl);

assert.equal(GENERATED_CHARACTER_SHEET.residentWidth, 28);
assert.equal(GENERATED_CHARACTER_SHEET.mountedWidth, 56);
assert.equal(GENERATED_CHARACTER_SHEET.spriteHeight, 40);
assert.equal(GENERATED_CHARACTER_SHEET.residentColumns, 10);
assert.equal(GENERATED_CHARACTER_SHEET.rows, 2);
assert.equal(GENERATED_CHARACTER_SHEET.src, '/assets/folk-characters-generated-v1.png');

assert.deepEqual(generatedResidentSourceRect('idle', 'male'), { sx: 0, sy: 0, sw: 28, sh: 40 });
assert.deepEqual(generatedResidentSourceRect('woodcutter', 'male'), { sx: 28, sy: 0, sw: 28, sh: 40 });
assert.deepEqual(generatedResidentSourceRect('militia', 'female'), { sx: 252, sy: 40, sw: 28, sh: 40 });

assert.deepEqual(generatedMountedRaiderSourceRect(0), { sx: 280, sy: 0, sw: 56, sh: 40 });
assert.deepEqual(generatedMountedRaiderSourceRect(1), { sx: 280, sy: 40, sw: 56, sh: 40 });
assert.deepEqual(generatedMountedRaiderSourceRect(2), { sx: 280, sy: 0, sw: 56, sh: 40 });

console.log('generated character asset tests passed');
```

- [ ] **Step 2: Run the metadata test and verify it fails**

Run:

```bash
node tools/render/test_generated_character_assets.mjs
```

Expected: FAIL because `src/render/generatedCharacterAssets.ts` does not exist.

- [ ] **Step 3: Create character metadata**

Create `src/render/generatedCharacterAssets.ts`:

```ts
import type { Gender, JobId } from '../game/types';

export const GENERATED_CHARACTER_SHEET = {
  residentWidth: 28,
  mountedWidth: 56,
  spriteHeight: 40,
  residentColumns: 10,
  rows: 2,
  src: '/assets/folk-characters-generated-v1.png',
} as const;

const RESIDENT_COLUMNS: Record<JobId, number> = {
  idle: 0,
  woodcutter: 1,
  hunter: 2,
  farmer: 3,
  builder: 4,
  hauler: 5,
  herbalist: 6,
  smith: 7,
  watchman: 8,
  militia: 9,
};

const GENDER_ROWS: Record<Gender, number> = {
  male: 0,
  female: 1,
};

export function generatedResidentSourceRect(job: JobId, gender: Gender) {
  const col = RESIDENT_COLUMNS[job];
  const row = GENDER_ROWS[gender];
  return {
    sx: col * GENERATED_CHARACTER_SHEET.residentWidth,
    sy: row * GENERATED_CHARACTER_SHEET.spriteHeight,
    sw: GENERATED_CHARACTER_SHEET.residentWidth,
    sh: GENERATED_CHARACTER_SHEET.spriteHeight,
  };
}

export function generatedMountedRaiderSourceRect(index: number) {
  const row = Math.abs(Math.trunc(index)) % GENERATED_CHARACTER_SHEET.rows;
  return {
    sx: GENERATED_CHARACTER_SHEET.residentColumns * GENERATED_CHARACTER_SHEET.residentWidth,
    sy: row * GENERATED_CHARACTER_SHEET.spriteHeight,
    sw: GENERATED_CHARACTER_SHEET.mountedWidth,
    sh: GENERATED_CHARACTER_SHEET.spriteHeight,
  };
}
```

- [ ] **Step 4: Run the metadata test and verify it passes**

Run:

```bash
node tools/render/test_generated_character_assets.mjs
```

Expected: PASS with `generated character asset tests passed`.

- [ ] **Step 5: Commit metadata**

Run:

```bash
git add src/render/generatedCharacterAssets.ts tools/render/test_generated_character_assets.mjs
git commit -m "Add character atlas metadata"
```

## Task 3: Generate and Normalize the Character Sheet

**Files:**
- Create: `tools/render/source_images/generated-characters-v1.png`
- Create: `tools/render/compose_generated_character_assets_v1.py`
- Create: `public/assets/folk-characters-generated-v1.png`
- Create: `tools/render/test_generated_character_asset_pixels.py`

- [ ] **Step 1: Generate the raw 22-subject source image**

Use image generation with this prompt, then save the returned image as `tools/render/source_images/generated-characters-v1.png`:

```text
Pixel art production contact sheet on a solid magenta background (#ff00ff), late-Joseon northern frontier folk-warm style, transparent-ready sprite subjects, two rows and eleven columns.

Rows:
1 male
2 female

Columns 1-10 are compact standing villagers, centered, full body, readable at 28px wide by 40px tall:
1 idle settler in practical muted hanbok
2 woodcutter with small axe
3 hunter with bow and quiver
4 farmer with hoe and straw hat
5 builder with hammer and wood bundle
6 hauler with pack frame or crate
7 herbalist with herb bundle
8 smith with dark apron and small hammer
9 watchman with polearm and small watch marker
10 local defender, 수비병 mood, darker guard outerwear and spear

Column 11 is wider: mounted 마적 raider on horseback, centered, horse and rider visible, rough colder-toned outerwear, small weapon, no fantasy armor.

Keep all subjects separated with clear magenta space. No grid lines, no labels, no text, no shadows, no scenery, no modern clothing, no anime proportions, no decorative royal costume. Consistent palette, lighting, outline weight, and scale across the whole sheet.
```

- [ ] **Step 2: Create the normalizer script**

Create `tools/render/compose_generated_character_assets_v1.py`:

```python
from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "tools" / "render" / "source_images" / "generated-characters-v1.png"
OUTPUT = ROOT / "public" / "assets" / "folk-characters-generated-v1.png"

RESIDENT_WIDTH = 28
MOUNTED_WIDTH = 56
SPRITE_HEIGHT = 40
RESIDENT_COLUMNS = 10
TOTAL_COLUMNS = 11
ROWS = 2


def is_key_pixel(r: int, g: int, b: int) -> bool:
  return r > 190 and g < 100 and b > 170


def remove_key(image: Image.Image) -> Image.Image:
  rgba = image.convert("RGBA")
  pixels = rgba.load()
  for y in range(rgba.height):
    for x in range(rgba.width):
      r, g, b, a = pixels[x, y]
      if is_key_pixel(r, g, b):
        pixels[x, y] = (0, 0, 0, 0)
      elif a > 0:
        pixels[x, y] = (r, g, b, a)
  return rgba


def contiguous_runs(values: list[int], gap: int = 2) -> list[tuple[int, int]]:
  if not values:
    return []
  runs: list[tuple[int, int]] = []
  start = previous = values[0]
  for value in values[1:]:
    if value <= previous + gap:
      previous = value
    else:
      runs.append((start, previous))
      start = previous = value
  runs.append((start, previous))
  return runs


def detect_contact_sheet_boxes(image: Image.Image) -> list[list[tuple[int, int, int, int]]]:
  rgb = image.convert("RGB")
  row_pixels = [
    y
    for y in range(rgb.height)
    if any(not is_key_pixel(*rgb.getpixel((x, y))) for x in range(rgb.width))
  ]
  row_runs = [run for run in contiguous_runs(row_pixels) if run[1] - run[0] > 16]
  if len(row_runs) != ROWS:
    raise ValueError(f"expected {ROWS} rows, found {len(row_runs)}: {row_runs}")

  rows: list[list[tuple[int, int, int, int]]] = []
  for top, bottom in row_runs:
    column_pixels = [
      x
      for x in range(rgb.width)
      if any(not is_key_pixel(*rgb.getpixel((x, y))) for y in range(top, bottom + 1))
    ]
    column_runs = [run for run in contiguous_runs(column_pixels) if run[1] - run[0] > 10]
    if len(column_runs) != TOTAL_COLUMNS:
      raise ValueError(
        f"expected {TOTAL_COLUMNS} columns in row {top}-{bottom}, "
        f"found {len(column_runs)}: {column_runs}",
      )
    rows.append([(left, top, right + 1, bottom + 1) for left, right in column_runs])
  return rows


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
  bbox = image.getchannel("A").getbbox()
  if bbox is None:
    raise ValueError("cell contains no non-key pixels")
  return bbox


def fit_to_cell(sprite: Image.Image, cell_width: int, cell_height: int, max_width: int, max_height: int) -> Image.Image:
  bbox = alpha_bbox(sprite)
  cropped = sprite.crop(bbox)
  scale = min(max_width / cropped.width, max_height / cropped.height)
  resized = cropped.resize(
    (
      max(1, round(cropped.width * scale)),
      max(1, round(cropped.height * scale)),
    ),
    Image.Resampling.LANCZOS,
  )
  cell = Image.new("RGBA", (cell_width, cell_height), (0, 0, 0, 0))
  x = (cell_width - resized.width) // 2
  y = cell_height - resized.height - 1
  cell.alpha_composite(resized, (x, y))
  return cell


def paste_cell(output: Image.Image, source: Image.Image, box: tuple[int, int, int, int], row: int, col: int) -> None:
  crop = remove_key(source.crop(box))
  if col < RESIDENT_COLUMNS:
    cell = fit_to_cell(crop, RESIDENT_WIDTH, SPRITE_HEIGHT, 24, 34)
    output.alpha_composite(cell, (col * RESIDENT_WIDTH, row * SPRITE_HEIGHT))
  else:
    cell = fit_to_cell(crop, MOUNTED_WIDTH, SPRITE_HEIGHT, 54, 38)
    output.alpha_composite(cell, (RESIDENT_COLUMNS * RESIDENT_WIDTH, row * SPRITE_HEIGHT))


def main() -> None:
  source = Image.open(SOURCE).convert("RGB")
  rows = detect_contact_sheet_boxes(source)
  output = Image.new(
    "RGBA",
    (RESIDENT_COLUMNS * RESIDENT_WIDTH + MOUNTED_WIDTH, ROWS * SPRITE_HEIGHT),
    (0, 0, 0, 0),
  )
  for row_index, boxes in enumerate(rows):
    for col_index, box in enumerate(boxes):
      paste_cell(output, source, box, row_index, col_index)
  OUTPUT.parent.mkdir(parents=True, exist_ok=True)
  output.save(OUTPUT)
  print(f"wrote {OUTPUT}")


if __name__ == "__main__":
  main()
```

- [ ] **Step 3: Run the normalizer**

Run:

```bash
python tools/render/compose_generated_character_assets_v1.py
```

Expected: PASS with `wrote ... public\assets\folk-characters-generated-v1.png`.

- [ ] **Step 4: Add the pixel asset test**

Create `tools/render/test_generated_character_asset_pixels.py`:

```python
from pathlib import Path
import re

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "src" / "render" / "generatedCharacterAssets.ts"
RESIDENT_WIDTH = 28
MOUNTED_WIDTH = 56
SPRITE_HEIGHT = 40
RESIDENT_COLUMNS = 10
ROWS = 2


def sheet_path() -> Path:
  source = SOURCE.read_text(encoding="utf-8")
  match = re.search(r"src:\s*'(/assets/[^']+)'", source)
  assert match, "generated character sheet src was not found"
  return ROOT / "public" / match.group(1).lstrip("/")


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
  bbox = image.getchannel("A").getbbox()
  assert bbox is not None, "cell is empty"
  return bbox


def test_sheet_dimensions() -> None:
  image = Image.open(sheet_path()).convert("RGBA")
  assert image.size == (RESIDENT_COLUMNS * RESIDENT_WIDTH + MOUNTED_WIDTH, ROWS * SPRITE_HEIGHT)


def test_resident_cells_are_not_empty() -> None:
  image = Image.open(sheet_path()).convert("RGBA")
  for row in range(ROWS):
    for col in range(RESIDENT_COLUMNS):
      cell = image.crop((
        col * RESIDENT_WIDTH,
        row * SPRITE_HEIGHT,
        (col + 1) * RESIDENT_WIDTH,
        (row + 1) * SPRITE_HEIGHT,
      ))
      left, top, right, bottom = alpha_bbox(cell)
      assert right - left >= 8
      assert bottom - top >= 16
      assert right - left <= RESIDENT_WIDTH
      assert bottom - top <= SPRITE_HEIGHT


def test_mounted_raider_cells_are_wide() -> None:
  image = Image.open(sheet_path()).convert("RGBA")
  x0 = RESIDENT_COLUMNS * RESIDENT_WIDTH
  for row in range(ROWS):
    cell = image.crop((x0, row * SPRITE_HEIGHT, x0 + MOUNTED_WIDTH, (row + 1) * SPRITE_HEIGHT))
    left, top, right, bottom = alpha_bbox(cell)
    assert right - left >= 30
    assert bottom - top >= 18


if __name__ == "__main__":
  test_sheet_dimensions()
  test_resident_cells_are_not_empty()
  test_mounted_raider_cells_are_wide()
  print("generated character asset pixel tests passed")
```

- [ ] **Step 5: Run the pixel asset test**

Run:

```bash
python tools/render/test_generated_character_asset_pixels.py
```

Expected: PASS with `generated character asset pixel tests passed`.

- [ ] **Step 6: Commit generated asset pipeline**

Run:

```bash
git add tools/render/source_images/generated-characters-v1.png tools/render/compose_generated_character_assets_v1.py public/assets/folk-characters-generated-v1.png tools/render/test_generated_character_asset_pixels.py
git commit -m "Add generated character atlas asset"
```

## Task 4: Integrate Generated Characters in the Atlas Renderer

**Files:**
- Modify: `src/render/atlas.ts`
- Modify: `src/render/sprites.ts`
- Modify: `src/render/renderer.ts`

- [ ] **Step 1: Add resident gender to the SpriteAPI params**

Modify the type import in `src/render/sprites.ts`:

```ts
import type { BuildingTypeId, Gender, JobId, Season, Terrain } from '../game/types';
```

Add `gender` to `ResidentDrawParams`:

```ts
export interface ResidentDrawParams {
  job: JobId;
  gender: Gender;
  x: number;
  y: number;
  sick: boolean;
  carrying: boolean;
  selected: boolean;
  moving?: boolean;
  facing?: 1 | -1;
}
```

- [ ] **Step 2: Pass resident gender from the scene renderer**

Modify the resident draw call in `src/render/renderer.ts`:

```ts
sprites.drawResident(ctx, {
  job: r.job,
  gender: r.gender,
  x: p.x,
  y: p.y,
  sick: r.sick,
  carrying: Object.keys(r.carrying).length > 0,
  selected: r.id === o.selectedResidentId,
  moving: r.px !== r.x || r.py !== r.y,
  facing: r.x < r.px ? -1 : 1,
});
```

- [ ] **Step 3: Import character metadata in `atlas.ts`**

Modify the `sprites` import and add generated character metadata imports:

```ts
import {
  placeholderSprites,
  type BuildingDrawParams,
  type RaiderDrawParams,
  type ResidentDrawParams,
  type SpriteAPI,
  type TerrainDrawParams,
} from './sprites';
import {
  GENERATED_CHARACTER_SHEET,
  generatedMountedRaiderSourceRect,
  generatedResidentSourceRect,
} from './generatedCharacterAssets';
```

- [ ] **Step 4: Load the generated character sheet**

Add a new image variable near the other image variables:

```ts
let generatedCharacterSheet: HTMLImageElement | null = null;
```

Add this block to `ensureLoaded` after `buildingSheet`:

```ts
generatedCharacterSheet = new Image();
generatedCharacterSheet.onload = () => { loaded++; };
generatedCharacterSheet.src = GENERATED_CHARACTER_SHEET.src;
```

Keep `atlasReady()` returning `loaded >= 6` so terrain and buildings can still use the atlas while generated characters fall back until their image loads.

- [ ] **Step 5: Add rectangle blit helpers**

Add these helpers near the existing `blitGeneratedBuilding` helper:

```ts
interface SourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

function drawGeneratedCharacterRect(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  rect: SourceRect,
  x: number,
  y: number,
  facing: 1 | -1 | undefined,
  bob: number,
): void {
  const scale = CHAR / GENERATED_CHARACTER_SHEET.residentWidth;
  const dw = rect.sw * scale;
  const dh = rect.sh * scale;
  ctx.save();
  ctx.translate(x, y - bob);
  if (facing === -1) ctx.scale(-1, 1);
  ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, -dw / 2, CHALF - dh, dw, dh);
  ctx.restore();
}

function drawGeneratedResident(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  p: ResidentDrawParams,
  bob: number,
): void {
  drawGeneratedCharacterRect(ctx, img, generatedResidentSourceRect(p.job, p.gender), p.x, p.y, p.facing, bob);
}

function drawGeneratedMountedRaider(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  p: RaiderDrawParams,
  index: number,
  bob: number,
  ox: number,
  oy: number,
): void {
  drawGeneratedCharacterRect(
    ctx,
    img,
    generatedMountedRaiderSourceRect(index),
    p.x + ox,
    p.y + oy,
    p.facing,
    bob,
  );
}
```

- [ ] **Step 6: Use generated resident sprites with Kenney fallback**

At the start of `atlasSprites.drawResident`, compute `bob` once and branch:

```ts
drawResident(ctx, p) {
  if (!chars) return;
  ctx.imageSmoothingEnabled = false;
  const half = CHALF;
  const bob = (p.moving ? Math.floor(performance.now() / 130) % 2 : 0) * CF;

  if (generatedCharacterSheet) {
    drawGeneratedResident(ctx, generatedCharacterSheet, p, bob);
  } else {
    ctx.save();
    ctx.translate(p.x, p.y - bob);
    if (p.facing === -1) ctx.scale(-1, 1);
    blit(ctx, chars, CHAR_BY_JOB[p.job], -half, -half, CHAR);
    ctx.restore();
  }

  ctx.fillStyle = JOB_COLORS[p.job];
  const dot = Math.max(3, Math.round(3 * CF));
  ctx.fillRect(p.x - dot / 2, p.y - half - 3 * CF - bob, dot, dot);
```

Leave the sickness, carrying, and selected overlays below that block intact.

- [ ] **Step 7: Use generated mounted raiders with Kenney fallback**

At the start of `atlasSprites.drawRaiders`, branch on `generatedCharacterSheet`:

```ts
drawRaiders(ctx, p) {
  if (!chars) return;
  ctx.imageSmoothingEnabled = false;
  const visible = generatedCharacterSheet ? Math.min(p.count, 4) : p.count;
  for (let i = 0; i < visible; i++) {
    const ox = ((i * 17) % 15 - 7) * 1.1 * CF;
    const oy = ((i * 29) % 11 - 5) * 1.1 * CF;
    const bob = (p.moving ? Math.floor(performance.now() / 130 + i) % 2 : 0) * CF;
    if (generatedCharacterSheet) {
      drawGeneratedMountedRaider(ctx, generatedCharacterSheet, p, i, bob, ox, oy);
    } else {
      ctx.save();
      ctx.translate(p.x + ox, p.y + oy - bob);
      if (p.facing === -1) ctx.scale(-1, 1);
      blit(ctx, chars, CHAR_RAIDER, -CHALF, -CHALF, CHAR);
      ctx.restore();
    }
  }
```

Leave the spotted alert drawing below the loop intact.

- [ ] **Step 8: Run TypeScript build and focused tests**

Run:

```bash
node tools/game/test_resident_gender.mjs
node tools/render/test_generated_character_assets.mjs
python tools/render/test_generated_character_asset_pixels.py
npm run build
```

Expected: all commands pass.

- [ ] **Step 9: Commit renderer integration**

Run:

```bash
git add src/render/sprites.ts src/render/renderer.ts src/render/atlas.ts
git commit -m "Render generated character sprites"
```

## Task 5: Final Regression Verification

**Files:**
- No code changes unless a regression is found.

- [ ] **Step 1: Run game logic regression tests**

Run:

```bash
node tools/game/test_resident_gender.mjs
node tools/game/test_forest_habitats.mjs
node tools/game/test_battles.mjs
```

Expected: all commands pass.

- [ ] **Step 2: Run render metadata and asset tests**

Run:

```bash
node tools/render/test_generated_character_assets.mjs
python tools/render/test_generated_character_asset_pixels.py
node tools/render/test_generated_building_assets.mjs
node tools/render/test_generated_terrain_objects.mjs
node tools/render/test_historical_terrain.mjs
node tools/render/test_river_autotile.mjs
node tools/render/test_terrain_visuals.mjs
python tools/render/test_generated_building_asset_pixels.py
python tools/render/test_generated_terrain_object_pixels.py
```

Expected: all commands pass.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build complete successfully.

- [ ] **Step 4: Start the local app for visual QA**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL.

- [ ] **Step 5: Verify in browser**

Open the Vite local URL and check:

- Residents render with historical gendered sprites.
- Job color dots, sickness marker, carried goods marker, selection ellipse, and walking bob remain visible.
- A raid band renders as horse-riding `마적` units rather than walking raiders.
- Terrain and building assets still render from the existing generated sheets.

- [ ] **Step 6: Capture final status**

Run:

```bash
git status --short --branch
```

Expected: only unrelated pre-existing untracked planning documents remain.
