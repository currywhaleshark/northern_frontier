# Bo Rank Unlocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first `보(堡)` promotion unlock tier with rank-gated buildings, rank-gated jobs, bridge movement, mining, fishing, and build/job UI filtering.

**Architecture:** Add a shared rank-unlock model in constants/building helpers, then enforce it in both UI and game actions. Keep the first pass small by using existing resource types and the current resident agent loop: bridges affect passability, mining/fishing are new agent jobs, and new buildings render through the existing emoji placeholder building renderer.

**Tech Stack:** TypeScript game modules, React 18 UI, Vite build, Node-based `.mjs` game tests compiled from `src/game`.

---

## File Structure

- Create `tools/game/test_bo_rank_unlocks.mjs`: focused TDD coverage for `보` unlocks, placement rules, bridge passability, and new job production.
- Modify `src/game/types.ts`: add `miner` and `fisher` job ids; add `bridge`, `mine`, `tileHouse`, and `ferry` building ids; extend `BuildingDef.placement`; add optional `BuildingDef.minRank`.
- Modify `src/game/constants.ts`: add `RANK_ORDER`, `rankAtLeast`, new job names/descriptions/colors/order entries, and `JOB_MIN_RANK`.
- Modify `src/game/buildings.ts`: add new building definitions, rank unlock helpers, new placement modes, and building menu order entries.
- Modify `src/game/config.ts`: add carry/work/yield/season tuning for miners and fishers.
- Modify `src/game/simulation.ts`: enforce building and job locks in player actions.
- Modify `src/game/agents.ts`: bridge passability and new `minerTick` / `fisherTick` behaviors.
- Modify `src/game/promotion.ts`: reuse shared rank ordering and mention the new unlocks in the `보` promotion log.
- Modify `src/components/BuildMenu.tsx`: show only rank-unlocked buildings and place new buildings in existing categories.
- Modify `src/components/JobPanel.tsx`: show only rank-unlocked jobs.
- Modify `src/components/InspectorPanel.tsx`: include new job ids in resident job selection via existing `JOB_ORDER` filtering after constants update.
- Modify `src/render/renderer.ts`: pass `state` into placement validation so riverbank placement previews are accurate.

---

### Task 1: Rank Unlock Tests

**Files:**
- Create: `tools/game/test_bo_rank_unlocks.mjs`

- [ ] **Step 1: Write the failing unlock and placement test file**

Create `tools/game/test_bo_rank_unlocks.mjs` with this content:

```js
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-bo-unlock-tests-'));
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
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const agents = await import(pathToFileURL(join(compiledDir, 'agents.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const constants = await import(pathToFileURL(join(compiledDir, 'constants.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function setResources(state) {
  state.resources.wood = 500;
  state.resources.stone = 500;
  state.resources.iron = 500;
  state.resources.tools = 500;
  state.resources.food = 500;
}

function centerOf(state) {
  const center = state.buildings.find(b => b.type === 'center');
  assert.ok(center, 'center exists');
  return center;
}

function clearArea(state) {
  for (const row of state.map) {
    for (const tile of row) {
      tile.terrain = 'plain';
      tile.hasIron = false;
      tile.buildingId = null;
    }
  }
  const center = centerOf(state);
  state.map[center.y][center.x].buildingId = center.id;
}

function placeBuilt(state, type, x, y) {
  const id = state.nextBuildingId++;
  state.buildings.push({ id, type, x, y, progress: 99, built: true, fieldGrowth: 0 });
  state.map[y][x].buildingId = id;
  return id;
}

{
  const state = simulation.newGame(101);
  clearArea(state);
  setResources(state);
  const center = centerOf(state);
  state.map[center.y][center.x + 1].terrain = 'river';

  assert.equal(constants.rankAtLeast('bo', 'settlement'), true);
  assert.equal(constants.rankAtLeast('settlement', 'bo'), false);
  assert.equal(buildings.isBuildingUnlocked(state.rank, 'bridge'), false);
  assert.equal(simulation.tryPlaceBuilding(state, 'bridge', center.x + 1, center.y), '보(堡) 승격 후 지을 수 있습니다.');
}

{
  const state = simulation.newGame(102);
  clearArea(state);
  setResources(state);
  state.rank = 'bo';
  const center = centerOf(state);
  state.map[center.y][center.x + 1].terrain = 'river';
  state.map[center.y][center.x + 2].terrain = 'rock';
  state.map[center.y + 1][center.x].terrain = 'river';
  state.map[center.y + 1][center.x + 1].terrain = 'plain';

  assert.equal(simulation.tryPlaceBuilding(state, 'bridge', center.x + 1, center.y), null);
  assert.equal(simulation.tryPlaceBuilding(state, 'mine', center.x + 2, center.y), null);
  assert.equal(simulation.tryPlaceBuilding(state, 'ferry', center.x + 1, center.y + 1), null);
  assert.equal(simulation.tryPlaceBuilding(state, 'tileHouse', center.x - 1, center.y), null);
}

{
  const state = simulation.newGame(103);
  clearArea(state);
  setResources(state);
  state.rank = 'bo';
  const center = centerOf(state);

  assert.equal(simulation.tryPlaceBuilding(state, 'bridge', center.x + 1, center.y), '이곳에는 지을 수 없습니다.');
  assert.equal(simulation.tryPlaceBuilding(state, 'mine', center.x + 1, center.y), '이곳에는 지을 수 없습니다.');
  assert.equal(simulation.tryPlaceBuilding(state, 'ferry', center.x + 2, center.y), '이곳에는 지을 수 없습니다.');
}

{
  const state = simulation.newGame(104);
  const idle = state.residents.find(r => r.alive && r.job === 'idle') ?? state.residents[0];
  for (const resident of state.residents) resident.job = resident.id === idle.id ? 'idle' : 'woodcutter';

  assert.equal(constants.isJobUnlocked(state.rank, 'miner'), false);
  assert.equal(simulation.reassignJob(state, 'idle', 'miner'), false);
  assert.equal(idle.job, 'idle');
  simulation.setResidentJob(state, idle.id, 'fisher');
  assert.equal(idle.job, 'idle');

  state.rank = 'bo';
  assert.equal(constants.isJobUnlocked(state.rank, 'miner'), true);
  assert.equal(simulation.reassignJob(state, 'idle', 'miner'), true);
  assert.equal(idle.job, 'miner');
  simulation.setResidentJob(state, idle.id, 'fisher');
  assert.equal(idle.job, 'fisher');
}

{
  const state = simulation.newGame(105);
  clearArea(state);
  const center = centerOf(state);
  const riverX = center.x + 1;
  const riverY = center.y;
  state.map[riverY][riverX].terrain = 'river';
  state.weather = 'clear';
  state.day = 1;

  assert.equal(agents.isPassable(state, riverX, riverY), false);
  placeBuilt(state, 'bridge', riverX, riverY);
  assert.equal(agents.isPassable(state, riverX, riverY), true);
}

console.log('bo rank unlock tests passed');
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
node tools/game/test_bo_rank_unlocks.mjs
```

Expected: FAIL during TypeScript transpile/runtime because `bridge`, `mine`, `ferry`, `tileHouse`, `miner`, `fisher`, `rankAtLeast`, `isJobUnlocked`, and `isBuildingUnlocked` do not exist yet.

---

### Task 2: Shared Rank Unlock Model

**Files:**
- Modify: `src/game/types.ts`
- Modify: `src/game/constants.ts`
- Modify: `src/game/buildings.ts`
- Modify: `src/game/promotion.ts`
- Modify: `src/game/simulation.ts`

- [ ] **Step 1: Add new ids and min-rank type fields**

In `src/game/types.ts`, extend `JobId`:

```ts
  | 'watchman'   // 파수꾼
  | 'militia'    // 수비병 (내부 id는 저장 호환을 위해 유지)
  | 'miner'      // 채광꾼
  | 'fisher';    // 어부
```

Extend `BuildingTypeId`:

```ts
  | 'market'     // 장터
  | 'bridge'     // 다리
  | 'mine'       // 채광장
  | 'tileHouse'  // 기와집
  | 'ferry'      // 나루터
  | 'cannonEmplacement'; // 불랑기포대 (부 승격 후 조정 청원으로만 배치)
```

Extend `BuildingDef`:

```ts
  placement: 'land' | 'field' | 'river' | 'rock' | 'riverbank' | 'any';
  unique: boolean;
  minRank?: Rank;
```

- [ ] **Step 2: Add shared rank and job unlock constants**

In `src/game/constants.ts`, add near `RANK_NAMES`:

```ts
export const RANK_ORDER: Rank[] = ['settlement', 'bo', 'jin', 'bu'];

export function rankAtLeast(rank: Rank | undefined, min: Rank | undefined): boolean {
  if (!min) return true;
  const current = rank ?? 'settlement';
  return RANK_ORDER.indexOf(current) >= RANK_ORDER.indexOf(min);
}
```

Extend `JOB_NAMES`, `JOB_ORDER`, `JOB_DESC`, and `JOB_COLORS`:

```ts
miner: '채광꾼', fisher: '어부',
```

```ts
  'hauler', 'herbalist', 'smith', 'miner', 'fisher', 'watchman', 'militia',
```

```ts
miner: '보(堡) 승격 후 배치할 수 있습니다. 채광장에서 돌과 철을 안정적으로 캡니다.',
fisher: '보(堡) 승격 후 배치할 수 있습니다. 나루터에서 강고기를 잡아 식량을 보탭니다.',
```

```ts
miner: '#9a8f7a', fisher: '#5ba7d8',
```

Add:

```ts
export const JOB_MIN_RANK: Partial<Record<JobId, Rank>> = {
  miner: 'bo',
  fisher: 'bo',
};

export function isJobUnlocked(rank: Rank | undefined, job: JobId): boolean {
  return rankAtLeast(rank, JOB_MIN_RANK[job]);
}
```

- [ ] **Step 3: Move promotion rank ordering to constants**

In `src/game/promotion.ts`, replace local `RANK_ORDER` with an import:

```ts
import { RANK_NAMES, RANK_ORDER } from './constants';
```

Keep exporting it for existing tests by adding:

```ts
export { RANK_ORDER };
```

Keep `nextRank` behavior unchanged.

- [ ] **Step 4: Add building unlock helper**

In `src/game/buildings.ts`, import `rankAtLeast`:

```ts
import { rankAtLeast } from './constants';
```

Add:

```ts
export function isBuildingUnlocked(rank: GameState['rank'] | undefined, type: BuildingTypeId): boolean {
  return rankAtLeast(rank, BUILDING_DEFS[type].minRank);
}
```

- [ ] **Step 5: Enforce locks in player actions**

In `src/game/simulation.ts`, import `isBuildingUnlocked` and `isJobUnlocked`:

```ts
import { SEASON_NAMES, isJobUnlocked } from './constants';
import {
  BUILDING_DEFS, canAfford, cannonPlacementsUsed, canPlaceOn, computeDefense, countBuilt, housingCapacity,
  isBuildingUnlocked,
} from './buildings';
```

In `tryPlaceBuilding`, after the tile lookup:

```ts
if (!isBuildingUnlocked(state.rank, type)) return '보(堡) 승격 후 지을 수 있습니다.';
```

In `reassignJob`, before finding a resident:

```ts
if (!isJobUnlocked(state.rank, to)) return false;
```

In `setResidentJob`, before mutating:

```ts
if (!isJobUnlocked(state.rank, job)) return;
```

- [ ] **Step 6: Run unlock test to verify partial GREEN**

Run:

```bash
node tools/game/test_bo_rank_unlocks.mjs
```

Expected: still FAIL because the new buildings and placement modes are not implemented, but rank/job helper references should now resolve.

---

### Task 3: New Building Definitions and Placement Modes

**Files:**
- Modify: `src/game/buildings.ts`
- Modify: `src/game/simulation.ts`
- Modify: `src/components/BuildMenu.tsx`
- Modify: `src/render/renderer.ts`

- [ ] **Step 1: Add the four `보` building definitions**

In `src/game/buildings.ts`, add entries before `cannonEmplacement`:

```ts
  bridge: {
    id: 'bridge', name: '다리', emoji: '🌉',
    desc: '보(堡) 승격 후 건설. 강 위에 놓아 사계절 주민 통행을 가능하게 한다.',
    cost: { wood: 16, stone: 10 }, buildDays: 8, slots: 0, capacity: 0, defense: 0,
    winterBonus: false, placement: 'river', unique: false, minRank: 'bo',
  },
  mine: {
    id: 'mine', name: '채광장', emoji: '⛏️',
    desc: '보(堡) 승격 후 건설. 채광꾼이 돌과 철을 캐는 거점.',
    cost: { wood: 10, stone: 8, tools: 2 }, buildDays: 8, slots: 4, capacity: 0, defense: 0,
    winterBonus: false, placement: 'rock', unique: false, minRank: 'bo',
  },
  tileHouse: {
    id: 'tileHouse', name: '기와집', emoji: '🏘️',
    desc: '보(堡) 승격 후 건설. 온돌을 갖춘 상위 주거. 7명 수용.',
    cost: { wood: 18, stone: 16, tools: 2 }, buildDays: 14, slots: 0, capacity: 7, defense: 0,
    winterBonus: true, placement: 'land', unique: false, minRank: 'bo',
  },
  ferry: {
    id: 'ferry', name: '나루터', emoji: '⛵',
    desc: '보(堡) 승격 후 건설. 강가에 두어 어부가 식량을 얻는 거점.',
    cost: { wood: 14, stone: 4, tools: 1 }, buildDays: 7, slots: 4, capacity: 0, defense: 0,
    winterBonus: false, placement: 'riverbank', unique: false, minRank: 'bo',
  },
```

Add them to `BUILD_MENU_ORDER`:

```ts
  'hut', 'ondol', 'tileHouse', 'storehouse', 'bridge', 'field', 'lumberCamp', 'huntLodge', 'herbHut',
  'smithy', 'mine', 'ferry', 'tannery', 'market', 'palisade', 'watchtower', 'beacon', 'garrison',
```

- [ ] **Step 2: Extend placement validation**

In `src/game/buildings.ts`, change `canPlaceOn` signature:

```ts
export function canPlaceOn(def: BuildingDef, tile: Tile, state?: GameState): boolean {
```

Use this implementation:

```ts
export function canPlaceOn(def: BuildingDef, tile: Tile, state?: GameState): boolean {
  if (tile.buildingId != null) return false;
  if (def.placement === 'river') return tile.terrain === 'river';
  if (def.placement === 'rock') return tile.terrain === 'rock';
  if (def.placement === 'riverbank') {
    if (tile.terrain === 'river' || tile.terrain === 'mountain' || tile.terrain === 'rock' || tile.terrain === 'center') {
      return false;
    }
    if (!state) return false;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
      state.map[tile.y + dy]?.[tile.x + dx]?.terrain === 'river');
  }
  if (tile.terrain === 'river' || tile.terrain === 'mountain' || tile.terrain === 'rock' || tile.terrain === 'center') {
    return false;
  }
  if (def.placement === 'field') {
    return tile.terrain === 'fertile' || tile.terrain === 'plain';
  }
  return true;
}
```

In `src/game/simulation.ts`, call:

```ts
if (!canPlaceOn(def, tile, state)) return '이곳에는 지을 수 없습니다.';
```

Leave the existing forest-clearing block in place; it will only affect land buildings.

- [ ] **Step 3: Update build menu filtering and categories**

In `src/components/BuildMenu.tsx`, import `isBuildingUnlocked`:

```ts
import { BUILDING_DEFS, canAfford, cannonPlacementsUsed, isBuildingUnlocked } from '../game/buildings';
```

Change categories:

```ts
const CATEGORIES: { name: string; types: BuildingTypeId[] }[] = [
  { name: '주거·기반', types: ['hut', 'ondol', 'tileHouse', 'storehouse', 'bridge'] },
  { name: '생산', types: ['field', 'lumberCamp', 'huntLodge', 'herbHut', 'smithy', 'mine', 'ferry', 'tannery', 'market'] },
  { name: '방어·군사', types: ['palisade', 'watchtower', 'beacon', 'garrison', 'cannonEmplacement'] },
];
```

Change `visibleTypes`:

```ts
const visibleTypes = cat.types.filter(type =>
  isBuildingUnlocked(state.rank, type) &&
  (type !== 'cannonEmplacement' || state.cannonsGranted > 0),
);
```

- [ ] **Step 4: Update placement preview validation**

In `src/render/renderer.ts`, update the preview line:

```ts
const ok = tile && canPlaceOn(def, tile, state) && canAfford(state, def);
```

- [ ] **Step 5: Run unlock test**

Run:

```bash
node tools/game/test_bo_rank_unlocks.mjs
```

Expected: PASS through placement sections, then FAIL at bridge passability or production sections if job behavior is not done yet.

---

### Task 4: Bridge Passability and New Production Jobs

**Files:**
- Modify: `src/game/config.ts`
- Modify: `src/game/agents.ts`

- [ ] **Step 1: Add production tuning**

In `src/game/config.ts`, extend `production`:

```ts
    fishPerDay: 1.4,
```

Extend `agents.carryCap`:

```ts
    carryCap: { wood: 4, game: 2, herbs: 1.5, iron: 3, stone: 3, grain: 6, food: 5 },
```

Extend `agents.work`:

```ts
      fish: 4,
```

Extend `agents.yields`:

```ts
      wood: 1.1, game: 0.75, herbs: 0.55, iron: 1.2, mineStone: 0.4, stone: 1.1, fish: 1.2,
```

Extend `seasons`:

```ts
    fishMult:     { spring: 1.2, summer: 1.15, autumn: 0.9, winter: 0.45 },
```

- [ ] **Step 2: Include new jobs in agent sets**

In `src/game/agents.ts`, change:

```ts
const PRODUCING_JOBS = ['woodcutter', 'hunter', 'farmer', 'builder', 'smith', 'herbalist', 'hauler', 'miner', 'fisher'];
const OUTDOOR_JOBS = ['woodcutter', 'hunter', 'herbalist', 'farmer', 'builder', 'miner', 'fisher'];
```

- [ ] **Step 3: Add bridge passability**

In `isPassable`, replace the river block:

```ts
  if (t.terrain === 'river') {
    const hasBridge = t.buildingId != null && state.buildings.some(b =>
      b.id === t.buildingId && b.built && b.type === 'bridge');
    if (hasBridge) return true;
    return getSeason(state.day) === 'winter' && state.weather !== 'thawFlood';
  }
```

- [ ] **Step 4: Add `minerTick`**

Add before `watchmanTick`:

```ts
function minerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const mineGoal = (t: Tile) => t.buildingId != null && state.buildings.some(b =>
    b.id === t.buildingId && b.built && b.type === 'mine');
  const tile = state.map[r.y][r.x];
  const yieldRes: ResourceId = tile?.hasIron ? 'iron' : 'stone';
  gatherJob(state, r, ctx, {
    goal: mineGoal,
    workTicks: CONFIG.agents.work.mine,
    yieldRes,
    yieldAmt: tile?.hasIron ? CONFIG.agents.yields.iron : CONFIG.agents.yields.stone,
    cap: yieldRes === 'iron' ? CONFIG.agents.carryCap.iron : CONFIG.agents.carryCap.stone,
    depositExtra: ['mine'],
    taskWork: '채광 중', taskMove: '채광장으로 이동', taskHaul: '광물 운반',
    onHarvest: (workTile, worker) => {
      if (workTile.hasIron) addCarry(worker, 'stone', CONFIG.agents.yields.mineStone);
    },
  });
}
```

- [ ] **Step 5: Add `fisherTick`**

Add before `watchmanTick`:

```ts
function fisherTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
  const floodMult = state.weather === 'thawFlood' ? 0.25 : 1;
  gatherJob(state, r, ctx, {
    goal: t => t.buildingId != null && state.buildings.some(b =>
      b.id === t.buildingId && b.built && b.type === 'ferry'),
    workTicks: a.work.fish,
    yieldRes: 'food',
    yieldAmt: a.yields.fish * CONFIG.seasons.fishMult[ctx.season] * floodMult,
    cap: a.carryCap.food,
    depositExtra: ['ferry'],
    taskWork: '고기잡이 중', taskMove: '나루터로 이동', taskHaul: '물고기 운반',
  });
}
```

- [ ] **Step 6: Dispatch jobs in `agentsTick`**

Add switch cases:

```ts
      case 'miner': minerTick(state, r, ctx); break;
      case 'fisher': fisherTick(state, r, ctx); break;
```

- [ ] **Step 7: Run unlock test**

Run:

```bash
node tools/game/test_bo_rank_unlocks.mjs
```

Expected: PASS bridge passability. Production assertions are not in the file yet, so add them in Task 5.

---

### Task 5: Production Tests and Final Gameplay Wiring

**Files:**
- Modify: `tools/game/test_bo_rank_unlocks.mjs`
- Modify: `src/game/agents.ts`
- Modify: `src/game/promotion.ts`
- Modify: `src/components/JobPanel.tsx`

- [ ] **Step 1: Add failing miner and fisher production assertions**

Append these blocks before `console.log('bo rank unlock tests passed');`:

```js
function setupSingleWorker(job, seed) {
  const state = simulation.newGame(seed);
  clearArea(state);
  setResources(state);
  state.rank = 'bo';
  const center = centerOf(state);
  const worker = state.residents[0];
  for (const resident of state.residents) resident.alive = resident.id === worker.id;
  worker.alive = true;
  worker.sick = false;
  worker.health = 100;
  worker.morale = 50;
  worker.job = job;
  worker.x = center.x;
  worker.y = center.y;
  worker.px = center.x;
  worker.py = center.y;
  worker.phase = 'rest';
  worker.path = [];
  worker.workTimer = 0;
  worker.targetId = null;
  worker.carrying = {};
  state.weather = 'clear';
  return { state, center, worker };
}

{
  const { state, center } = setupSingleWorker('miner', 106);
  state.map[center.y][center.x + 1].terrain = 'rock';
  state.map[center.y][center.x + 1].hasIron = true;
  placeBuilt(state, 'mine', center.x + 1, center.y);
  state.resources.iron = 0;
  state.resources.stone = 0;
  for (let i = 0; i < 20; i++) simulation.advanceTick(state);
  assert.ok(state.resources.iron > 0, 'miner deposited iron from an iron mine');
  assert.ok(state.resources.stone > 0, 'iron mining also yielded stone');
}

{
  const { state, center } = setupSingleWorker('fisher', 107);
  state.map[center.y + 1][center.x].terrain = 'river';
  placeBuilt(state, 'ferry', center.x + 1, center.y);
  state.resources.food = 0;
  for (let i = 0; i < 20; i++) simulation.advanceTick(state);
  assert.ok(state.resources.food > 0, 'fisher deposited food through the ferry');
}
```

- [ ] **Step 2: Run test to verify RED if production is incomplete**

Run:

```bash
node tools/game/test_bo_rank_unlocks.mjs
```

Expected: FAIL if `minerTick` or `fisherTick` does not deposit resources correctly. If it passes immediately, production code from Task 4 already satisfies the behavior.

- [ ] **Step 3: Update promotion log**

In `src/game/promotion.ts`, after the existing `bo` info log, add:

```ts
    addLog(state, '보 승격으로 다리·채광장·기와집·나루터와 채광꾼·어부가 열렸습니다.', 'good');
```

- [ ] **Step 4: Filter job panel**

In `src/components/JobPanel.tsx`, import `isJobUnlocked`:

```ts
import { JOB_DESC, JOB_NAMES, JOB_ORDER, isJobUnlocked } from '../game/constants';
```

Change the map source:

```tsx
      {JOB_ORDER.filter(j => j !== 'idle' && isJobUnlocked(state.rank, j)).map(job => {
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
node tools/game/test_bo_rank_unlocks.mjs
node tools/game/test_promotion.mjs
node tools/game/test_hauler_priority.mjs
```

Expected: all print success messages.

---

### Task 6: Build Verification and Commit

**Files:**
- All files modified above

- [ ] **Step 1: Run build**

Run:

```bash
npm.cmd run build
```

Expected: `tsc && vite build` exits 0. If the sandbox blocks Vite with `Cannot read directory "../../.."`, rerun the same command with required escalation.

- [ ] **Step 2: Run additional smoke tests**

Run:

```bash
node tools/game/test_petition.mjs
node tools/game/test_battles.mjs
```

Expected: both print success messages.

- [ ] **Step 3: Inspect diff**

Run:

```bash
git diff --stat
git diff --check
git status --short
```

Expected: only planned files changed and `git diff --check` has no whitespace errors.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add tools/game/test_bo_rank_unlocks.mjs src/game/types.ts src/game/constants.ts src/game/buildings.ts src/game/config.ts src/game/simulation.ts src/game/agents.ts src/game/promotion.ts src/components/BuildMenu.tsx src/components/JobPanel.tsx src/render/renderer.ts docs/superpowers/plans/2026-07-07-bo-rank-unlocks.md
git commit -m "Add bo rank building and job unlocks"
```

Expected: commit succeeds.

---

## Self-Review Notes

- Spec coverage: rank unlocks, four buildings, two jobs, bridge passability, UI filtering, production, and non-goals are covered.
- Deferred by design: `진`, `부`, `부두`, livestock, charcoal, saltpeter, and administration.
- Risk to watch during implementation: `minerTick` needs dynamic resource output; if `gatherJob` proves awkward, keep a small custom branch rather than broad refactoring.
