# Wall Family Gate Implementation Plan

> **계획 상태:** 완료
> **상태 갱신:** 2026-07-29 — 성벽 계열 문 통행·습격 차단·철거·UI를 구현했다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one shared `gate` building that connects to the whole wall family, lets residents pass, blocks raiders, supports wall-family demolition, and renders connected wall lines.

**Architecture:** Put wall-family membership and connection logic in `src/game/walls.ts` so pathing, raids, rendering, and demolition share one source of truth. Add behavior through focused changes in the game layer first, then wire UI and rendering on top. Use a new Node game test file for red/green coverage and `npm run build` for TypeScript and React wiring.

**Tech Stack:** TypeScript, React 18, Vite, HTML Canvas, Node ESM test scripts using `typescript.transpileModule`.

---

## File Structure

- Create: `src/game/walls.ts`
  - Owns wall-family predicates and 4-way connection helpers.
- Create: `tools/game/test_walls_and_gate.mjs`
  - Compiles `src/game/*.ts` into temporary ESM modules and tests the new behavior.
- Modify: `src/game/types.ts`
  - Adds `gate` to `BuildingTypeId`.
- Modify: `src/game/buildings.ts`
  - Adds the gate definition, menu order entry, single-tile footprint entry, and uses existing footprint helpers.
- Modify: `src/game/agents.ts`
  - Makes `gate` resident-passable while other wall-family buildings remain blocked by existing collision logic.
- Modify: `src/game/raids.ts`
  - Uses `isWallBuilding()` for raider barriers and siege target selection.
- Modify: `src/game/simulation.ts`
  - Adds `demolishBuilding()` for wall-family buildings.
- Modify: `src/render/sprites.ts`
  - Adds optional `connections` to `BuildingDrawParams`.
- Modify: `src/render/renderer.ts`
  - Computes built wall-family connection masks and passes them to `drawBuilding()`.
- Modify: `src/render/atlas.ts`
  - Bypasses generated building sheets for wall-family buildings and draws connected procedural wall/gate shapes.
- Modify: `src/components/BuildMenu.tsx`
  - Adds `gate` to the defense category.
- Modify: `src/components/InspectorPanel.tsx`
  - Shows a wall-family-only demolition button.
- Modify: `src/App.tsx`
  - Wires `demolishBuilding()` into InspectorPanel.
- Modify: `README.md`
  - Updates play notes for walls, gates, and demolition.

---

### Task 1: Add Wall Helpers And Gate Definition

**Files:**
- Create: `tools/game/test_walls_and_gate.mjs`
- Create: `src/game/walls.ts`
- Modify: `src/game/types.ts`
- Modify: `src/game/buildings.ts`

- [ ] **Step 1: Write the failing test**

Create `tools/game/test_walls_and_gate.mjs` with this exact initial content:

```js
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-wall-tests-'));
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

const compiledDir = compileGameModules();
const agents = await import(pathToFileURL(join(compiledDir, 'agents.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const raids = await import(pathToFileURL(join(compiledDir, 'raids.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const walls = await import(pathToFileURL(join(compiledDir, 'walls.mjs')).href);

function clearMapToPlain(state) {
  for (const row of state.map) {
    for (const tile of row) {
      tile.terrain = 'plain';
      tile.hasIron = false;
      tile.buildingId = null;
    }
  }
  state.buildings = [];
}

function boostResources(state) {
  for (const key of Object.keys(state.resources)) state.resources[key] = 1000;
  state.rank = 'bu';
  state.cannonsGranted = 10;
}

function addBuilt(state, type, x, y, built = true) {
  const building = {
    id: 9000 + state.buildings.length,
    type,
    x,
    y,
    progress: built ? buildings.BUILDING_DEFS[type].buildDays : 0,
    built,
    fieldGrowth: 0,
  };
  state.buildings.push(building);
  buildings.occupyBuildingTiles(state, building);
  return building;
}

function addWallRing(state, left, top, right, bottom, gateAt = null) {
  const addSegment = (x, y) => {
    const type = gateAt && gateAt.x === x && gateAt.y === y ? 'gate' : 'palisade';
    addBuilt(state, type, x, y);
  };
  for (let x = left; x <= right; x++) {
    addSegment(x, top);
    addSegment(x, bottom);
  }
  for (let y = top + 1; y <= bottom - 1; y++) {
    addSegment(left, y);
    addSegment(right, y);
  }
}

{
  assert.equal(buildings.BUILDING_DEFS.gate.name, '성문', 'gate definition exists');
  assert.equal(buildings.BUILDING_DEFS.gate.defense, 2, 'gate is weaker than palisade');
  assert.ok(buildings.BUILD_MENU_ORDER.includes('gate'), 'gate is in build menu order');
  assert.equal(buildings.buildingFootprintSize('gate'), 1, 'gate is a single-tile building');

  assert.equal(walls.isWallBuilding('palisade'), true, 'palisade is a wall-family building');
  assert.equal(walls.isWallBuilding('earthFort'), true, 'earthFort is a wall-family building');
  assert.equal(walls.isWallBuilding('stoneWall'), true, 'stoneWall is a wall-family building');
  assert.equal(walls.isWallBuilding('gate'), true, 'gate is a wall-family building');
  assert.equal(walls.isSolidWallBuilding('gate'), false, 'gate is not a solid resident wall');
  assert.equal(walls.isGateBuilding('gate'), true, 'gate helper identifies gate');
  assert.equal(walls.isWallBuilding('watchtower'), false, 'watchtower is not a wall-family connector');
}

{
  const state = simulation.newGame(2026070801);
  clearMapToPlain(state);
  addBuilt(state, 'palisade', 10, 10);
  assert.deepEqual(
    walls.wallConnectionsAt(state, 10, 10),
    { n: false, e: false, s: false, w: false },
    'isolated wall has no connections',
  );

  addBuilt(state, 'earthFort', 10, 9);
  addBuilt(state, 'gate', 11, 10);
  addBuilt(state, 'stoneWall', 10, 11);
  addBuilt(state, 'palisade', 9, 10);
  assert.deepEqual(
    walls.wallConnectionsAt(state, 10, 10),
    { n: true, e: true, s: true, w: true },
    'wall connects to every wall-family type',
  );
}

console.log('wall and gate tests passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node tools/game/test_walls_and_gate.mjs
```

Expected: FAIL because `walls.mjs` does not exist, or because `BUILDING_DEFS.gate` is missing.

- [ ] **Step 3: Add `gate` to the building type union**

Modify `src/game/types.ts` so the wall portion of `BuildingTypeId` becomes:

```ts
  | 'beacon'     // 봉수대
  | 'palisade'   // 목책
  | 'earthFort'  // 토성
  | 'stoneWall'  // 석벽
  | 'gate'       // 성문
  | 'watchtower' // 망루
```

- [ ] **Step 4: Add gate definition and menu placement**

In `src/game/buildings.ts`, add this object immediately after `stoneWall`:

```ts
  gate: {
    id: 'gate', name: '성문', emoji: '🚪',
    desc: '성벽 사이의 출입구. 주민은 드나들 수 있지만 습격자는 막힌다.',
    cost: { wood: 6 }, buildDays: 2, slots: 0, capacity: 0, defense: 2,
    winterBonus: false, placement: 'land', unique: false,
  },
```

Update `BUILD_MENU_ORDER` so the wall cluster reads:

```ts
  'palisade', 'earthFort', 'stoneWall', 'gate', 'watchtower', 'beacon', 'garrison',
```

Update `SINGLE_TILE_BUILDINGS` so the wall cluster reads:

```ts
  'palisade',
  'earthFort',
  'stoneWall',
  'gate',
  'watchtower',
```

- [ ] **Step 5: Add shared wall helpers**

Create `src/game/walls.ts`:

```ts
import type { BuildingTypeId, GameState } from './types';

export interface WallConnections {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
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

export function builtWallTileSet(state: Pick<GameState, 'buildings'>): Set<string> {
  const tiles = new Set<string>();
  for (const building of state.buildings) {
    if (building.built && isWallBuilding(building.type)) {
      tiles.add(wallTileKey(building.x, building.y));
    }
  }
  return tiles;
}

export function wallConnectionsFromSet(wallTiles: ReadonlySet<string>, x: number, y: number): WallConnections {
  return {
    n: wallTiles.has(wallTileKey(x, y - 1)),
    e: wallTiles.has(wallTileKey(x + 1, y)),
    s: wallTiles.has(wallTileKey(x, y + 1)),
    w: wallTiles.has(wallTileKey(x - 1, y)),
  };
}

export function wallConnectionsAt(state: Pick<GameState, 'buildings'>, x: number, y: number): WallConnections {
  return wallConnectionsFromSet(builtWallTileSet(state), x, y);
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run:

```bash
node tools/game/test_walls_and_gate.mjs
```

Expected: PASS with `wall and gate tests passed`.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/game/types.ts src/game/buildings.ts src/game/walls.ts tools/game/test_walls_and_gate.mjs
git commit -m "feat: add wall family gate model"
```

---

### Task 2: Make Gate Resident-Passable

**Files:**
- Modify: `tools/game/test_walls_and_gate.mjs`
- Modify: `src/game/agents.ts`

- [ ] **Step 1: Add the failing resident passability test**

Insert this block before the final `console.log()` in `tools/game/test_walls_and_gate.mjs`:

```js
{
  const state = simulation.newGame(2026070802);
  clearMapToPlain(state);

  addBuilt(state, 'palisade', 5, 5);
  addBuilt(state, 'earthFort', 6, 5);
  addBuilt(state, 'stoneWall', 7, 5);
  addBuilt(state, 'gate', 8, 5);

  assert.equal(agents.isPassable(state, 5, 5), false, 'palisade blocks residents');
  assert.equal(agents.isPassable(state, 6, 5), false, 'earthFort blocks residents');
  assert.equal(agents.isPassable(state, 7, 5), false, 'stoneWall blocks residents');
  assert.equal(agents.isPassable(state, 8, 5), true, 'gate lets residents pass');
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node tools/game/test_walls_and_gate.mjs
```

Expected: FAIL on `gate lets residents pass` because `gate` is not in resident passability yet.

- [ ] **Step 3: Implement resident gate passability**

In `src/game/agents.ts`, add the import:

```ts
import { isGateBuilding } from './walls';
```

Change `isPassableBuilding()` to:

```ts
function isPassableBuilding(type: BuildingTypeId): boolean {
  return PASSABLE_BUILDING_TYPES.has(type) || isGateBuilding(type);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
node tools/game/test_walls_and_gate.mjs
```

Expected: PASS with `wall and gate tests passed`.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/game/agents.ts tools/game/test_walls_and_gate.mjs
git commit -m "feat: let residents pass through gates"
```

---

### Task 3: Make Raiders Treat Gates As Wall Barriers

**Files:**
- Modify: `tools/game/test_walls_and_gate.mjs`
- Modify: `src/game/raids.ts`

- [ ] **Step 1: Add failing pathing and siege tests**

Insert this block before the final `console.log()` in `tools/game/test_walls_and_gate.mjs`:

```js
{
  const state = simulation.newGame(2026070803);
  clearMapToPlain(state);
  addWallRing(state, 8, 8, 12, 12, { x: 10, y: 8 });

  const path = agents.findPath(state, 10, 6, tile => tile.x === 10 && tile.y === 10);
  assert.ok(path, 'resident path exists through the gate');
  assert.ok(
    path.some(step => step.x === 10 && step.y === 8),
    'resident path uses the gate tile',
  );
}

{
  const state = simulation.newGame(2026070804);
  clearMapToPlain(state);
  addWallRing(state, 8, 8, 12, 12);

  const path = agents.findPath(state, 10, 6, tile => tile.x === 10 && tile.y === 10);
  assert.equal(path, null, 'resident path is blocked by a ring with no gate');
}

{
  const state = simulation.newGame(2026070805);
  clearMapToPlain(state);
  addBuilt(state, 'center', 10, 10);
  addWallRing(state, 8, 8, 13, 13, { x: 10, y: 8 });

  raids.spawnRaiders(state, () => 0.4, false);
  assert.ok(state.raiders, 'raiders spawn near enclosed center');
  assert.equal(state.raiders.siege, true, 'raiders siege instead of passing through the gate');
  assert.ok(
    state.raiders.path.length > 0,
    'raiders still get a path to a siege position',
  );
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node tools/game/test_walls_and_gate.mjs
```

Expected: FAIL on `raiders siege instead of passing through the gate`, because `raids.ts` does not yet include `gate` as a barrier.

- [ ] **Step 3: Replace raid barrier logic with wall helper**

In `src/game/raids.ts`, add:

```ts
import { isWallBuilding } from './walls';
```

Delete the local `isRaidBarrier()` function.

Change the raider passability check from:

```ts
    if (b && b.built && isRaidBarrier(b.type)) return false;
```

to:

```ts
    if (b && b.built && isWallBuilding(b.type)) return false;
```

Change the barrier set creation in `spawnRaiders()` from:

```ts
  const barrierTiles = new Set(
    state.buildings.filter(b => b.built && isRaidBarrier(b.type)).map(b => b.y * w + b.x));
```

to:

```ts
  const barrierTiles = new Set(
    state.buildings.filter(b => b.built && isWallBuilding(b.type)).map(b => b.y * w + b.x));
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
node tools/game/test_walls_and_gate.mjs
```

Expected: PASS with `wall and gate tests passed`.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/game/raids.ts tools/game/test_walls_and_gate.mjs
git commit -m "feat: block raiders with gates"
```

---

### Task 4: Add Wall-Family Demolition

**Files:**
- Modify: `tools/game/test_walls_and_gate.mjs`
- Modify: `src/game/simulation.ts`

- [ ] **Step 1: Add failing demolition tests**

Insert this block before the final `console.log()` in `tools/game/test_walls_and_gate.mjs`:

```js
{
  const state = simulation.newGame(2026070806);
  clearMapToPlain(state);
  boostResources(state);
  state.resources.wood = 0;
  const gate = addBuilt(state, 'gate', 5, 5);
  state.resources.defense = buildings.computeDefense(state);

  assert.equal(simulation.demolishBuilding(state, 5, 5), null, 'demolishing gate succeeds');
  assert.equal(state.resources.wood, 3, 'demolishing gate refunds half wood cost');
  assert.equal(state.map[5][5].buildingId, null, 'demolishing gate clears tile occupancy');
  assert.equal(state.buildings.some(building => building.id === gate.id), false, 'demolished gate is removed');
  assert.equal(state.resources.defense, buildings.computeDefense(state), 'defense is recalculated');
}

{
  const state = simulation.newGame(2026070807);
  clearMapToPlain(state);
  boostResources(state);
  state.resources.wood = 0;
  addBuilt(state, 'storehouse', 5, 5);

  const err = simulation.demolishBuilding(state, 5, 5);
  assert.equal(err, '성벽 계열만 철거할 수 있습니다.', 'non-wall demolition is rejected');
  assert.notEqual(state.map[5][5].buildingId, null, 'rejected demolition keeps building occupancy');
  assert.equal(state.resources.wood, 0, 'rejected demolition does not refund resources');
}

{
  const state = simulation.newGame(2026070808);
  clearMapToPlain(state);

  assert.equal(simulation.demolishBuilding(state, 2, 2), '철거할 건물이 없습니다.');
  assert.equal(simulation.demolishBuilding(state, -1, 2), '지도 밖입니다.');
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node tools/game/test_walls_and_gate.mjs
```

Expected: FAIL because `simulation.demolishBuilding` is not defined.

- [ ] **Step 3: Implement demolition**

In the import from `./buildings` at the top of `src/game/simulation.ts`, add `clearBuildingTiles` and `getBuilding`:

```ts
  BUILDING_DEFS, buildingFootprintTiles, canAfford, cannonPlacementsUsed, canPlaceBuildingAt, canPlaceOn,
  clearBuildingTiles, computeDefense, countBuilt, getBuilding, housingCapacity, isBuildingUnlocked,
  isSmithyProductUnlocked, occupyBuildingTiles, SMITHY_PRODUCT_DEFS,
```

Add this import:

```ts
import { isWallBuilding } from './walls';
```

Add this function after `tryPlaceBuilding()`:

```ts
export function demolishBuilding(state: GameState, x: number, y: number): string | null {
  const tile = state.map[y]?.[x];
  if (!tile) return '지도 밖입니다.';
  const building = getBuilding(state, tile.buildingId);
  if (!building) return '철거할 건물이 없습니다.';
  if (!isWallBuilding(building.type)) return '성벽 계열만 철거할 수 있습니다.';

  const def = BUILDING_DEFS[building.type];
  for (const [res, amount] of Object.entries(def.cost)) {
    const refund = Math.max(1, Math.floor((amount ?? 0) / 2));
    state.resources[res as ResourceId] += refund;
  }

  clearBuildingTiles(state, building.id);
  state.buildings = state.buildings.filter(b => b.id !== building.id);
  state.resources.defense = computeDefense(state);
  addLog(state, `${def.name}을(를) 철거했습니다.`, 'info');
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
node tools/game/test_walls_and_gate.mjs
```

Expected: PASS with `wall and gate tests passed`.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/game/simulation.ts tools/game/test_walls_and_gate.mjs
git commit -m "feat: demolish wall family buildings"
```

---

### Task 5: Wire Build Menu And Inspector Demolition UI

**Files:**
- Modify: `src/components/BuildMenu.tsx`
- Modify: `src/components/InspectorPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Run build before UI edits**

Run:

```bash
npm run build
```

Expected: PASS before the UI wiring starts. If it fails, stop and fix the current branch first.

- [ ] **Step 2: Add `gate` to BuildMenu defense category**

In `src/components/BuildMenu.tsx`, change the defense category to:

```ts
  {
    name: '방어·군사',
    types: ['palisade', 'earthFort', 'stoneWall', 'gate', 'watchtower', 'beacon', 'garrison', 'cannonEmplacement'],
  },
```

- [ ] **Step 3: Add demolition prop and wall helper to InspectorPanel**

In `src/components/InspectorPanel.tsx`, add:

```ts
import { isWallBuilding } from '../game/walls';
```

Add this prop to `Props`:

```ts
  onDemolishBuilding: (x: number, y: number) => void;
```

Add it to the component destructuring:

```ts
  onDemolishBuilding,
```

Inside the building info table, immediately before the description row, add:

```tsx
                    {isWallBuilding(building.type) && (
                      <tr>
                        <td>정비</td>
                        <td>
                          <button
                            className="btn small"
                            type="button"
                            onClick={() => onDemolishBuilding(tile.x, tile.y)}
                          >
                            철거
                          </button>
                        </td>
                      </tr>
                    )}
```

- [ ] **Step 4: Wire App handler**

In `src/App.tsx`, add `demolishBuilding` to the simulation import:

```ts
  advanceDay, advanceTick, continueAfterVictory, demolishBuilding, newGame, reassignJob, resolveChoice,
```

Add this handler near the other game action handlers:

```ts
  const handleDemolishBuilding = (x: number, y: number) => {
    const err = demolishBuilding(stateRef.current, x, y);
    if (err) {
      addLog(stateRef.current, err, 'info');
    } else {
      playSfx('hammer');
      setSelected(null);
      setSelectedEntity(null);
    }
    bump();
  };
```

Pass it to `InspectorPanel`:

```tsx
            onDemolishBuilding={handleDemolishBuilding}
```

- [ ] **Step 5: Run build to verify UI types**

Run:

```bash
npm run build
```

Expected: PASS. Fix any missing prop or import errors before continuing.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/components/BuildMenu.tsx src/components/InspectorPanel.tsx src/App.tsx
git commit -m "feat: wire gate and wall demolition UI"
```

---

### Task 6: Render Connected Wall-Family Buildings

**Files:**
- Modify: `src/render/sprites.ts`
- Modify: `src/render/renderer.ts`
- Modify: `src/render/atlas.ts`

- [ ] **Step 1: Run the existing connection tests before render edits**

Run:

```bash
node tools/game/test_walls_and_gate.mjs
```

Expected: PASS. The connection mask tests from Task 1 prove the game-layer connection helper is already correct.

- [ ] **Step 2: Extend BuildingDrawParams**

In `src/render/sprites.ts`, add this field to `BuildingDrawParams`:

```ts
  connections?: { n: boolean; e: boolean; s: boolean; w: boolean }; // 성벽 계열 연결 렌더링
```

- [ ] **Step 3: Pass wall connections from renderer**

In `src/render/renderer.ts`, add:

```ts
import { builtWallTileSet, isWallBuilding, wallConnectionsFromSet } from '../game/walls';
```

Before sorting buildings, add:

```ts
  const wallTiles = builtWallTileSet(state);
```

Change the main building draw call to include connections:

```ts
      connections: b.built && isWallBuilding(b.type)
        ? wallConnectionsFromSet(wallTiles, b.x, b.y)
        : undefined,
```

Leave the placement preview call without connections; ghost buildings can render as isolated previews.

- [ ] **Step 4: Add procedural wall drawing helper**

In `src/render/atlas.ts`, add:

```ts
import { isGateBuilding, isWallBuilding } from '../game/walls';
```

Add these helpers before `export const atlasSprites`:

```ts
function drawProgressBar(ctx: CanvasRenderingContext2D, p: BuildingDrawParams): void {
  if (p.built || p.ghost) return;
  ctx.fillStyle = '#10141a';
  ctx.fillRect(p.x + 2, p.y + p.size - 4, p.size - 4, 3);
  ctx.fillStyle = '#d9a441';
  ctx.fillRect(p.x + 2, p.y + p.size - 4, (p.size - 4) * p.progress01, 3);
}

function drawWallFamilyBuilding(ctx: CanvasRenderingContext2D, p: BuildingDrawParams): boolean {
  if (!isWallBuilding(p.type)) return false;

  const c = p.connections ?? { n: false, e: false, s: false, w: false };
  const x = p.x;
  const y = p.y;
  const s = p.size;
  const midX = x + s / 2;
  const midY = y + s / 2;
  const unit = Math.max(1, Math.round(s / 14));
  const post = Math.max(4, Math.round(s * 0.26));
  const rail = Math.max(3, Math.round(s * 0.15));

  const palette = p.type === 'stoneWall'
    ? { body: '#8b8d86', dark: '#5f625d', light: '#c7c2ae' }
    : p.type === 'earthFort'
      ? { body: '#9b744d', dark: '#66442e', light: '#c89a62' }
      : { body: '#7b4e2f', dark: '#4a2f1f', light: '#b87943' };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (isGateBuilding(p.type)) {
    ctx.strokeStyle = palette.dark;
    ctx.lineWidth = rail;
    if (c.w) {
      ctx.beginPath();
      ctx.moveTo(x + 2, midY - rail);
      ctx.lineTo(midX - post * 0.45, midY - rail);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 2, midY + rail);
      ctx.lineTo(midX - post * 0.45, midY + rail);
      ctx.stroke();
    }
    if (c.e) {
      ctx.beginPath();
      ctx.moveTo(midX + post * 0.45, midY - rail);
      ctx.lineTo(x + s - 2, midY - rail);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(midX + post * 0.45, midY + rail);
      ctx.lineTo(x + s - 2, midY + rail);
      ctx.stroke();
    }
    if (c.n || c.s) {
      ctx.strokeStyle = palette.dark;
      ctx.lineWidth = rail;
      ctx.beginPath();
      ctx.moveTo(midX - rail, c.n ? y + 2 : midY - post * 0.5);
      ctx.lineTo(midX - rail, c.s ? y + s - 2 : midY + post * 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(midX + rail, c.n ? y + 2 : midY - post * 0.5);
      ctx.lineTo(midX + rail, c.s ? y + s - 2 : midY + post * 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = palette.dark;
    ctx.fillRect(midX - post * 0.55, y + s * 0.2, unit * 3, s * 0.6);
    ctx.fillRect(midX + post * 0.35, y + s * 0.2, unit * 3, s * 0.6);
    ctx.fillStyle = '#c99552';
    ctx.fillRect(midX - post * 0.28, y + s * 0.28, post * 0.56, s * 0.44);
    ctx.strokeStyle = '#3d291c';
    ctx.lineWidth = unit;
    ctx.strokeRect(midX - post * 0.28, y + s * 0.28, post * 0.56, s * 0.44);
  } else {
    ctx.strokeStyle = palette.dark;
    ctx.lineWidth = rail;
    if (c.w || c.e) {
      ctx.beginPath();
      ctx.moveTo(c.w ? x + 1 : midX, midY - rail);
      ctx.lineTo(c.e ? x + s - 1 : midX, midY - rail);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c.w ? x + 1 : midX, midY + rail);
      ctx.lineTo(c.e ? x + s - 1 : midX, midY + rail);
      ctx.stroke();
    }
    if (c.n || c.s) {
      ctx.beginPath();
      ctx.moveTo(midX - rail, c.n ? y + 1 : midY);
      ctx.lineTo(midX - rail, c.s ? y + s - 1 : midY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(midX + rail, c.n ? y + 1 : midY);
      ctx.lineTo(midX + rail, c.s ? y + s - 1 : midY);
      ctx.stroke();
    }
    ctx.fillStyle = palette.body;
    ctx.fillRect(midX - post / 2, midY - post / 2, post, post);
    ctx.strokeStyle = palette.dark;
    ctx.lineWidth = unit;
    ctx.strokeRect(midX - post / 2, midY - post / 2, post, post);
    ctx.fillStyle = palette.light;
    ctx.fillRect(midX - post / 2 + unit, midY - post / 2 + unit, post - unit * 2, unit * 2);
  }

  if (p.season === 'winter') {
    ctx.fillStyle = 'rgba(245, 240, 220, 0.72)';
    ctx.fillRect(x + s * 0.2, y + s * 0.18, s * 0.6, unit * 2);
  }

  ctx.restore();
  return true;
}
```

In `drawBuilding(ctx, p: BuildingDrawParams)`, after `ctx.globalAlpha = alpha;`, add:

```ts
    if (drawWallFamilyBuilding(ctx, p)) {
      ctx.globalAlpha = 1;
      drawProgressBar(ctx, p);
      return;
    }
```

This must come before generated building sheet branches so wall-family buildings bypass generated sprites.

- [ ] **Step 5: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add src/render/sprites.ts src/render/renderer.ts src/render/atlas.ts
git commit -m "feat: render connected wall family"
```

---

### Task 7: Update README Play Notes

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update construction and raid notes**

In the "플레이 방법" construction section, add this sentence after the building placement paragraph:

```md
   목책·토성·석벽은 주민 동선을 막는 성벽이며, 성문은 주민만 통과할 수 있는 출입구입니다. 성벽 계열은 타일 인스펙터에서 철거할 수 있습니다.
```

In the raid system table row, replace `완공된 목책` with:

```md
완공된 성벽 계열(목책·토성·석벽·성문)
```

- [ ] **Step 2: Verify README diff**

Run:

```bash
git diff -- README.md
```

Expected: diff shows only the two documentation updates above.

- [ ] **Step 3: Commit Task 7**

```bash
git add README.md
git commit -m "docs: explain gates and wall demolition"
```

---

### Task 8: Full Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run the new focused test**

Run:

```bash
node tools/game/test_walls_and_gate.mjs
```

Expected: PASS with `wall and gate tests passed`.

- [ ] **Step 2: Run all game tests**

Run in PowerShell:

```powershell
Get-ChildItem tools\game\test_*.mjs | ForEach-Object { node $_.FullName }
```

Expected: every game test exits 0. Existing tests should not regress, especially `test_pathfinding_collision.mjs`, `test_building_footprints.mjs`, `test_jin_rank_unlocks.mjs`, and `test_bu_rank_unlocks.mjs`.

- [ ] **Step 3: Run render tests that touch generated assets and terrain**

Run in PowerShell:

```powershell
Get-ChildItem tools\render\test_*.mjs | ForEach-Object { node $_.FullName }
```

Expected: every `.mjs` render test exits 0.

- [ ] **Step 4: Run TypeScript and production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git status --short
git log --oneline -8
```

Expected: clean working tree after Task 7 commit, with the task commits visible on the current branch.
