# Building Worker Slots Implementation Plan

> **계획 상태:** 완료
> **상태 갱신:** 2026-07-29 — 배정 모델·저장 마이그레이션·UI·생산 연결을 완료했다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add building-level worker slots so selected production buildings only operate when residents are assigned to their slots, with visible occupancy and both resident-to-building and building-to-resident assignment controls.

**Architecture:** Store assignment only on residents via `assignedBuildingId`; buildings stay ownership-free. Add a focused `src/game/workerSlots.ts` module for slot config, validation, derived occupants, assignment, unassignment, and auto-pick helpers, then have simulation, selection, renderer, and React UI call that single module. Move tannery output from daily automatic processing into a new `tanner` job loop so clothes production depends on assigned tannery workers.

**Tech Stack:** TypeScript game simulation, React UI, canvas renderer, Node ESM test scripts using the existing TypeScript transpile harness, Vite build.

---

## Current Workspace Note

The branch currently has unrelated uncommitted raid-balance files:

- `src/game/config.ts`
- `src/game/raids.ts`
- `tools/game/test_threat_balance.mjs`

During this plan, stage only the worker-slot files listed in each task commit. Leave the raid-balance files untouched unless the user explicitly asks to combine them.

## File Structure

- Create `src/game/workerSlots.ts`
  - Owns the slot table, assignment validation, derived occupant lists, unassignment, cleanup, and nearest-worker auto assignment.
  - Imports only low-level game modules (`buildings`, `constants`, `types`) to avoid cycles with `agents.ts` and `simulation.ts`.
- Modify `src/game/types.ts`
  - Add `tanner` to `JobId`.
  - Add `assignedBuildingId: number | null` to `Resident`.
- Modify `src/game/constants.ts`
  - Add Korean job name `무두장이`, order entry, description, and color for `tanner`.
- Modify `src/game/residents.ts`
  - Initialize `assignedBuildingId: null` in new residents.
- Modify `src/game/saveLoad.ts`
  - Normalize old saves so residents without `assignedBuildingId` load with `null`.
- Modify `src/game/buildings.ts`
  - Align visible building `slots` with the design: field 1, smithy 2, ferry 2, stable 2, nitre yard 2, tannery 2.
- Modify `src/game/simulation.ts`
  - Clear incompatible assignments on job changes.
  - Route slotted work orders into assignment.
  - Remove daily automatic tannery processing.
  - Export assignment wrappers for UI use.
- Modify `src/game/selectionActions.ts`
  - When a resident targets a slotted building, return an assignment work action even if the resident currently has a different job.
- Modify `src/game/agents.ts`
  - Require assigned buildings for farmer, smith, fisher, herder, powder maker, and tanner.
  - Add `tannerTick`.
- Modify `src/render/renderer.ts`
  - Draw compact slot dots above supported buildings.
  - Draw expanded badges above the selected building.
- Modify `src/components/GameCanvas.tsx`
  - Pass selected building ID into the renderer.
  - Pass slot-control callbacks into `ActionPopup`.
- Modify `src/components/ActionPopup.tsx`
  - Show slot rows for slotted buildings.
  - Empty row assigns nearest eligible worker.
  - Filled row selects the worker and offers unassign.
- Modify `src/App.tsx`
  - Add handlers for assign nearest, unassign, and selected worker focus.
- Modify `src/styles/global.css`
  - Style slot rows and small slot controls.
- Create `tools/game/test_worker_slots.mjs`
  - Core slot config and assignment tests.
- Create `tools/game/test_worker_slot_save_load.mjs`
  - Save migration test for `assignedBuildingId`.
- Create `tools/game/test_worker_slot_production.mjs`
  - Production gating and tanner production tests.
- Modify existing tests that depend on production workers:
  - `tools/game/test_selection_actions.mjs`
  - `tools/game/test_farm_food_yield.mjs`
  - `tools/game/test_smithy_products.mjs`
  - Any other failing `tools/game/test_*.mjs` scripts after the production change.

## Implementation Tasks

### Task 1: Core Slot Model And Assignment Helper

**Files:**
- Create: `src/game/workerSlots.ts`
- Create: `tools/game/test_worker_slots.mjs`
- Modify: `src/game/types.ts`
- Modify: `src/game/constants.ts`
- Modify: `src/game/residents.ts`
- Modify: `src/game/buildings.ts`

- [ ] **Step 1: Write the failing core worker-slot test**

Create `tools/game/test_worker_slots.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-game-tests-'));
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
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const constants = await import(pathToFileURL(join(compiledDir, 'constants.mjs')).href);
const workerSlots = await import(pathToFileURL(join(compiledDir, 'workerSlots.mjs')).href);

function clearMapToPlain(state) {
  for (const row of state.map) {
    for (const tile of row) {
      tile.terrain = 'plain';
      tile.hasIron = false;
      tile.buildingId = null;
    }
  }
  state.buildings = [];
  state.exploration = { explored: state.map.map(row => row.map(() => true)) };
}

function addBuilt(state, type, x, y, extra = {}) {
  const building = {
    id: 8000 + state.buildings.length,
    type,
    x,
    y,
    progress: buildings.BUILDING_DEFS[type].buildDays,
    built: true,
    fieldGrowth: 0,
    ...extra,
  };
  state.buildings.push(building);
  buildings.occupyBuildingTiles(state, building);
  return building;
}

function resetResident(resident, job, x, y) {
  Object.assign(resident, {
    alive: true,
    sick: false,
    health: 100,
    hunger: 100,
    warmth: 100,
    morale: 70,
    job,
    x,
    y,
    px: x,
    py: y,
    phase: 'rest',
    path: [],
    workTimer: 0,
    targetId: null,
    carrying: {},
    manualOrder: null,
    assignedBuildingId: null,
  });
}

{
  assert.deepEqual(workerSlots.workerSlotConfig('field'), { job: 'farmer', slots: 1 });
  assert.deepEqual(workerSlots.workerSlotConfig('smithy'), { job: 'smith', slots: 2 });
  assert.deepEqual(workerSlots.workerSlotConfig('stable'), { job: 'herder', slots: 2 });
  assert.deepEqual(workerSlots.workerSlotConfig('nitreYard'), { job: 'powderMaker', slots: 2 });
  assert.deepEqual(workerSlots.workerSlotConfig('ferry'), { job: 'fisher', slots: 2 });
  assert.deepEqual(workerSlots.workerSlotConfig('tannery'), { job: 'tanner', slots: 2 });
  assert.equal(workerSlots.workerSlotConfig('center'), null);
  assert.equal(constants.JOB_NAMES.tanner, '무두장이');
}

{
  const state = simulation.newGame(2026070901);
  clearMapToPlain(state);
  state.rank = 'bu';
  const field = addBuilt(state, 'field', 10, 10);
  const [first, second] = state.residents;
  resetResident(first, 'idle', 9, 10);
  resetResident(second, 'farmer', 9, 11);

  assert.equal(workerSlots.assignResidentToBuilding(state, first.id, field.id), null);
  assert.equal(first.job, 'farmer', 'assignment switches an idle resident to the required job');
  assert.equal(first.assignedBuildingId, field.id);
  assert.deepEqual(workerSlots.assignedWorkers(state, field).map(r => r.id), [first.id]);
  assert.equal(workerSlots.availableWorkerSlots(state, field), 0);

  const err = workerSlots.assignResidentToBuilding(state, second.id, field.id);
  assert.ok(err, 'field rejects a second worker');
  assert.equal(second.assignedBuildingId, null);
}

{
  const state = simulation.newGame(2026070902);
  clearMapToPlain(state);
  state.rank = 'bu';
  const smithy = addBuilt(state, 'smithy', 12, 12);
  const [a, b, c] = state.residents;
  resetResident(a, 'idle', 11, 12);
  resetResident(b, 'smith', 11, 13);
  resetResident(c, 'smith', 11, 14);

  assert.equal(workerSlots.assignResidentToBuilding(state, a.id, smithy.id), null);
  assert.equal(workerSlots.assignResidentToBuilding(state, b.id, smithy.id), null);
  assert.equal(workerSlots.availableWorkerSlots(state, smithy), 0);
  assert.ok(workerSlots.assignResidentToBuilding(state, c.id, smithy.id), 'third smith is rejected');
  assert.deepEqual(workerSlots.assignedWorkers(state, smithy).map(r => r.id), [a.id, b.id]);
}

{
  const state = simulation.newGame(2026070903);
  clearMapToPlain(state);
  state.rank = 'settlement';
  const yard = addBuilt(state, 'nitreYard', 14, 14);
  const resident = state.residents[0];
  resetResident(resident, 'idle', 13, 14);

  const err = workerSlots.assignResidentToBuilding(state, resident.id, yard.id);
  assert.ok(err, 'locked job/building assignment fails');
  assert.equal(resident.job, 'idle');
  assert.equal(resident.assignedBuildingId, null);
}

{
  const state = simulation.newGame(2026070904);
  clearMapToPlain(state);
  state.rank = 'bu';
  const tannery = addBuilt(state, 'tannery', 16, 16);
  const resident = state.residents[0];
  resetResident(resident, 'idle', 15, 16);

  assert.equal(workerSlots.assignResidentToBuilding(state, resident.id, tannery.id), null);
  assert.equal(resident.job, 'tanner');
  assert.equal(resident.assignedBuildingId, tannery.id);
  workerSlots.unassignResidentFromBuilding(state, resident.id);
  assert.equal(resident.assignedBuildingId, null);
}

{
  const state = simulation.newGame(2026070905);
  clearMapToPlain(state);
  state.rank = 'bu';
  const stable = addBuilt(state, 'stable', 18, 18);
  const resident = state.residents[0];
  resetResident(resident, 'idle', 17, 18);

  assert.equal(workerSlots.assignNearestWorkerToBuilding(state, stable.id), null);
  assert.equal(resident.job, 'herder');
  assert.equal(resident.assignedBuildingId, stable.id);
}

console.log('worker slot tests passed');
```

- [ ] **Step 2: Run the test to verify the missing module failure**

Run:

```powershell
node tools/game/test_worker_slots.mjs
```

Expected: FAIL with an import error for `workerSlots.mjs`.

- [ ] **Step 3: Add the `tanner` job type and resident assignment field**

Modify `src/game/types.ts`:

```ts
export type JobId =
  | 'idle'
  | 'woodcutter'
  | 'hunter'
  | 'farmer'
  | 'builder'
  | 'hauler'
  | 'herbalist'
  | 'smith'
  | 'miner'
  | 'fisher'
  | 'charcoalBurner'
  | 'herder'
  | 'tanner'
  | 'powderMaker'
  | 'clerk'
  | 'watchman'
  | 'militia';
```

In `Resident`, add the field near `job`:

```ts
  job: JobId;
  assignedBuildingId: number | null;
```

Modify `src/game/residents.ts` inside `createResident`:

```ts
    job,
    assignedBuildingId: null,
```

- [ ] **Step 4: Add the `tanner` constants**

Modify `src/game/constants.ts`:

```ts
export const JOB_NAMES: Record<JobId, string> = {
  idle: '무직', woodcutter: '벌목꾼', hunter: '사냥꾼', farmer: '농부',
  builder: '건축가', hauler: '운반꾼', herbalist: '약초꾼', smith: '대장장이',
  miner: '채광꾼', fisher: '어부',
  charcoalBurner: '숯장이', herder: '목동', tanner: '무두장이',
  powderMaker: '염초장이', clerk: '아전',
  watchman: '파수꾼', militia: '수비병',
};
```

Ensure `JOB_ORDER` places `tanner` with other midgame production jobs:

```ts
export const JOB_ORDER: JobId[] = [
  'idle', 'woodcutter', 'hunter', 'farmer', 'builder',
  'hauler', 'herbalist', 'smith', 'miner', 'fisher', 'charcoalBurner', 'herder', 'tanner',
  'powderMaker', 'clerk',
  'watchman', 'militia',
];
```

Add a description:

```ts
  tanner: '가죽공방에 배정되어 가죽을 다듬고 옷을 만듭니다.',
```

Add a color:

```ts
  charcoalBurner: '#d66f3f', herder: '#c7a85b', tanner: '#b9825a',
```

Do not add `tanner` to `JOB_MIN_RANK`; tannery exists before rank-gated industry.

- [ ] **Step 5: Align building slot counts**

Modify these `slots` values in `src/game/buildings.ts`:

```ts
field: slots: 1
smithy: slots: 2
ferry: slots: 2
stable: slots: 2
nitreYard: slots: 2
tannery: slots: 2
```

- [ ] **Step 6: Implement the core worker-slot module**

Create `src/game/workerSlots.ts`:

```ts
import {
  BUILDING_DEFS, getBuilding, isBuildingUnlocked,
} from './buildings';
import { isJobUnlocked, JOB_NAMES, RANK_NAMES } from './constants';
import type { Building, BuildingTypeId, GameState, JobId, Resident } from './types';

export interface WorkerSlotConfig {
  job: JobId;
  slots: number;
}

export const SLOTTED_BUILDING_CONFIG = {
  field: { job: 'farmer', slots: 1 },
  smithy: { job: 'smith', slots: 2 },
  stable: { job: 'herder', slots: 2 },
  nitreYard: { job: 'powderMaker', slots: 2 },
  ferry: { job: 'fisher', slots: 2 },
  tannery: { job: 'tanner', slots: 2 },
} satisfies Partial<Record<BuildingTypeId, WorkerSlotConfig>>;

export function workerSlotConfig(type: BuildingTypeId): WorkerSlotConfig | null {
  return SLOTTED_BUILDING_CONFIG[type] ?? null;
}

export function isSlottedProductionBuilding(type: BuildingTypeId): boolean {
  return workerSlotConfig(type) != null;
}

function livingWorkableResident(resident: Resident): boolean {
  return resident.alive && !resident.sick && resident.health >= 20;
}

function residentDistanceToBuilding(resident: Resident, building: Building): number {
  return Math.abs(resident.x - building.x) + Math.abs(resident.y - building.y);
}

function assignedCandidateWorkers(state: GameState, building: Building): Resident[] {
  const config = workerSlotConfig(building.type);
  if (!config || !building.built) return [];
  if (!isBuildingUnlocked(state.rank, building.type)) return [];
  if (!isJobUnlocked(state.rank, config.job)) return [];
  return state.residents
    .filter(resident =>
      resident.assignedBuildingId === building.id &&
      livingWorkableResident(resident) &&
      resident.job === config.job)
    .sort((a, b) => a.id - b.id);
}

export function assignedWorkers(state: GameState, building: Building): Resident[] {
  const config = workerSlotConfig(building.type);
  if (!config) return [];
  return assignedCandidateWorkers(state, building).slice(0, config.slots);
}

export function isResidentInAssignedSlot(state: GameState, resident: Resident, building: Building): boolean {
  return assignedWorkers(state, building).some(worker => worker.id === resident.id);
}

export function availableWorkerSlots(state: GameState, building: Building): number {
  const config = workerSlotConfig(building.type);
  if (!config || !building.built) return 0;
  return Math.max(0, config.slots - assignedWorkers(state, building).length);
}

export function assignedBuildingForResident(state: GameState, resident: Resident): Building | null {
  if (resident.assignedBuildingId == null) return null;
  const building = getBuilding(state, resident.assignedBuildingId);
  if (!building) return null;
  return isResidentInAssignedSlot(state, resident, building) ? building : null;
}

export function canAssignResidentToBuilding(state: GameState, residentId: number, buildingId: number): string | null {
  const resident = state.residents.find(item => item.id === residentId);
  if (!resident || !resident.alive) return '배정할 주민이 없습니다.';
  if (resident.sick || resident.health < 20) return '아픈 주민은 작업장에 배정할 수 없습니다.';

  const building = getBuilding(state, buildingId);
  if (!building) return '건물을 찾을 수 없습니다.';
  if (!building.built) return '완공된 건물에만 배정할 수 있습니다.';

  const config = workerSlotConfig(building.type);
  if (!config) return '작업 슬롯이 있는 생산 건물이 아닙니다.';

  if (!isBuildingUnlocked(state.rank, building.type)) {
    const minRank = BUILDING_DEFS[building.type].minRank;
    const rankName = minRank ? RANK_NAMES[minRank] : RANK_NAMES.bo;
    return `${rankName} 승격 후 배정할 수 있습니다.`;
  }
  if (!isJobUnlocked(state.rank, config.job)) {
    return `${JOB_NAMES[config.job]} 직업이 아직 열리지 않았습니다.`;
  }

  if (resident.assignedBuildingId === building.id && resident.job === config.job) return null;
  if (availableWorkerSlots(state, building) <= 0) return '빈 작업 슬롯이 없습니다.';
  return null;
}

export function assignResidentToBuilding(state: GameState, residentId: number, buildingId: number): string | null {
  const err = canAssignResidentToBuilding(state, residentId, buildingId);
  if (err) return err;

  const resident = state.residents.find(item => item.id === residentId)!;
  const building = getBuilding(state, buildingId)!;
  const config = workerSlotConfig(building.type)!;
  resident.job = config.job;
  resident.assignedBuildingId = building.id;
  return null;
}

export function unassignResidentFromBuilding(state: GameState, residentId: number): void {
  const resident = state.residents.find(item => item.id === residentId);
  if (resident) resident.assignedBuildingId = null;
}

export function clearAssignmentsForBuilding(state: GameState, buildingId: number): void {
  for (const resident of state.residents) {
    if (resident.assignedBuildingId === buildingId) resident.assignedBuildingId = null;
  }
}

export function clearIncompatibleAssignment(state: GameState, resident: Resident): void {
  if (resident.assignedBuildingId == null) return;
  const building = getBuilding(state, resident.assignedBuildingId);
  const config = building ? workerSlotConfig(building.type) : null;
  if (!building || !config || !building.built || resident.job !== config.job) {
    resident.assignedBuildingId = null;
  }
}

export function assignNearestWorkerToBuilding(state: GameState, buildingId: number): string | null {
  const building = getBuilding(state, buildingId);
  if (!building) return '건물을 찾을 수 없습니다.';
  const config = workerSlotConfig(building.type);
  if (!config) return '작업 슬롯이 있는 생산 건물이 아닙니다.';
  if (availableWorkerSlots(state, building) <= 0) return '빈 작업 슬롯이 없습니다.';

  const candidates = state.residents
    .filter(resident =>
      livingWorkableResident(resident) &&
      (resident.job === 'idle' || resident.job === config.job) &&
      resident.assignedBuildingId == null &&
      canAssignResidentToBuilding(state, resident.id, building.id) == null)
    .sort((a, b) => {
      const jobBias = (a.job === config.job ? 0 : 1) - (b.job === config.job ? 0 : 1);
      if (jobBias !== 0) return jobBias;
      return residentDistanceToBuilding(a, building) - residentDistanceToBuilding(b, building) || a.id - b.id;
    });

  const selected = candidates[0];
  if (!selected) return '배정 가능한 주민이 없습니다.';
  return assignResidentToBuilding(state, selected.id, building.id);
}
```

- [ ] **Step 7: Run the worker-slot core test**

Run:

```powershell
node tools/game/test_worker_slots.mjs
```

Expected: PASS and prints `worker slot tests passed`.

- [ ] **Step 8: Commit Task 1**

```powershell
git add src/game/types.ts src/game/constants.ts src/game/residents.ts src/game/buildings.ts src/game/workerSlots.ts tools/game/test_worker_slots.mjs
git commit -m "feat: add worker slot assignment model"
```

### Task 2: Save Migration For Assigned Building IDs

**Files:**
- Create: `tools/game/test_worker_slot_save_load.mjs`
- Modify: `src/game/saveLoad.ts`

- [ ] **Step 1: Write the failing save migration test**

Create `tools/game/test_worker_slot_save_load.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-game-tests-'));
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

const store = new Map();
globalThis.localStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, value),
  removeItem: key => store.delete(key),
};

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);

{
  const state = simulation.newGame(2026070911);
  for (const resident of state.residents) delete resident.assignedBuildingId;

  saveLoad.saveGame(state);
  const loaded = saveLoad.loadGame();

  assert.ok(loaded, 'old save loads');
  assert.ok(loaded.residents.length > 0, 'residents remain present');
  assert.ok(loaded.residents.every(resident => resident.assignedBuildingId === null));
}

{
  const state = simulation.newGame(2026070912);
  state.residents[0].assignedBuildingId = 'bad-value';

  saveLoad.saveGame(state);
  const loaded = saveLoad.loadGame();

  assert.equal(loaded.residents[0].assignedBuildingId, null, 'invalid assignment values are normalized');
}

console.log('worker slot save-load tests passed');
```

- [ ] **Step 2: Run the save migration test to verify it fails**

Run:

```powershell
node tools/game/test_worker_slot_save_load.mjs
```

Expected: FAIL because missing or invalid `assignedBuildingId` is not normalized.

- [ ] **Step 3: Add save migration**

Modify `src/game/saveLoad.ts`:

```ts
function migrateResidentBuildingAssignments(state: GameState): void {
  for (const resident of state.residents as Array<Resident & { assignedBuildingId?: unknown }>) {
    if (!Number.isInteger(resident.assignedBuildingId)) {
      resident.assignedBuildingId = null;
    }
  }
}
```

Call it after `migrateResidentManualOrders(parsed);`:

```ts
    migrateResidentGender(parsed);
    migrateResidentManualOrders(parsed);
    migrateResidentBuildingAssignments(parsed);
```

- [ ] **Step 4: Run the save migration test**

Run:

```powershell
node tools/game/test_worker_slot_save_load.mjs
```

Expected: PASS and prints `worker slot save-load tests passed`.

- [ ] **Step 5: Commit Task 2**

```powershell
git add src/game/saveLoad.ts tools/game/test_worker_slot_save_load.mjs
git commit -m "feat: migrate worker slot assignments in saves"
```

### Task 3: Resident-To-Building Assignment Controls

**Files:**
- Modify: `tools/game/test_selection_actions.mjs`
- Modify: `src/game/selectionActions.ts`
- Modify: `src/game/simulation.ts`

- [ ] **Step 1: Extend selection-action tests for resident right-click assignment**

Add this block to `tools/game/test_selection_actions.mjs` before the final `console.log`:

```js
{
  const state = simulation.newGame(2026070921);
  clearMapToPlain(state);
  state.rank = 'bu';
  const smithy = addBuilt(state, 'smithy', 15, 15);
  const smithyTile = state.map[15][15];
  const resident = onlyResident(state, 'idle', 14, 15);

  const action = selectionActions.getPointerAction(state, { kind: 'resident', id: resident.id }, smithyTile);
  assert.equal(action.kind, 'work', 'idle resident can target a slotted smithy assignment');
  assert.equal(action.buildingId, smithy.id);

  assert.equal(simulation.issueResidentWorkOrder(state, resident.id, action), null);
  assert.equal(resident.job, 'smith');
  assert.equal(resident.assignedBuildingId, smithy.id);
}

{
  const state = simulation.newGame(2026070922);
  clearMapToPlain(state);
  state.rank = 'bu';
  const field = addBuilt(state, 'field', 17, 17);
  const fieldTile = state.map[17][17];
  const [first, second] = state.residents;
  resetResident(first, 'farmer', 16, 17);
  resetResident(second, 'idle', 16, 18);

  await workerSlots.assignResidentToBuilding(state, first.id, field.id);
  const action = selectionActions.getPointerAction(state, { kind: 'resident', id: second.id }, fieldTile);
  assert.equal(action.kind, 'invalid', 'full slotted field rejects another resident');
}
```

Add the missing import after the current imports:

```js
const workerSlots = await import(pathToFileURL(join(compiledDir, 'workerSlots.mjs')).href);
```

Add this helper near `onlyResident` so the new block can reset the second resident:

```js
function resetResident(resident, job, x, y) {
  Object.assign(resident, {
    alive: true,
    sick: false,
    health: 100,
    hunger: 100,
    warmth: 100,
    morale: 70,
    job,
    x,
    y,
    px: x,
    py: y,
    phase: 'rest',
    path: [],
    workTimer: 0,
    targetId: null,
    carrying: {},
    manualOrder: null,
    assignedBuildingId: null,
  });
}
```

- [ ] **Step 2: Run the selection-action test to verify it fails**

Run:

```powershell
node tools/game/test_selection_actions.mjs
```

Expected: FAIL because idle residents cannot yet assign to slotted production buildings.

- [ ] **Step 3: Return slot assignment actions from selection logic**

Modify `src/game/selectionActions.ts` imports:

```ts
import {
  canAssignResidentToBuilding, workerSlotConfig,
} from './workerSlots';
```

Add this helper near `workLabel`:

```ts
function slottedAssignmentAction(state: GameState, residentId: number, tile: Tile): PointerAction | null {
  const building = tileBuilding(state, tile);
  if (!building || !building.built || !workerSlotConfig(building.type)) return null;
  const err = canAssignResidentToBuilding(state, residentId, building.id);
  if (err) return actionInvalid(err);
  return {
    kind: 'work',
    cursor: 'copy',
    label: `${BUILDING_DEFS[building.type].name} 배정`,
    x: tile.x,
    y: tile.y,
    buildingId: building.id,
  };
}
```

In `getPointerAction`, before `const work = canResidentWorkTarget(...)`, insert:

```ts
  const assignment = slottedAssignmentAction(state, resident.id, tile);
  if (assignment) return assignment;
```

- [ ] **Step 4: Route slotted work orders into assignment**

Modify `src/game/simulation.ts` imports:

```ts
import {
  assignNearestWorkerToBuilding as assignNearestWorkerToSlot,
  assignResidentToBuilding as assignResidentToSlot,
  unassignResidentFromBuilding as unassignResidentFromSlot,
  workerSlotConfig,
} from './workerSlots';
```

Add exported wrappers near `issueResidentWorkOrder`:

```ts
export function assignResidentToBuilding(state: GameState, residentId: number, buildingId: number): string | null {
  const resident = state.residents.find(res => res.id === residentId && res.alive);
  const err = assignResidentToSlot(state, residentId, buildingId);
  if (err) return err;
  if (resident) resetAgent(state, resident);
  return null;
}

export function assignNearestWorkerToBuilding(state: GameState, buildingId: number): string | null {
  const before = new Map(state.residents.map(resident => [resident.id, resident.assignedBuildingId]));
  const err = assignNearestWorkerToSlot(state, buildingId);
  if (err) return err;
  const changed = state.residents.find(resident => before.get(resident.id) !== resident.assignedBuildingId);
  if (changed) resetAgent(state, changed);
  return null;
}

export function unassignResidentFromBuilding(state: GameState, residentId: number): void {
  const resident = state.residents.find(res => res.id === residentId);
  unassignResidentFromSlot(state, residentId);
  if (resident) resetAgent(state, resident);
}
```

In `issueResidentWorkOrder`, after `const action = getPointerAction(...)`, add:

```ts
  const targetBuilding = action.kind === 'work' && action.buildingId != null
    ? getBuilding(state, action.buildingId)
    : undefined;
  if (targetBuilding && workerSlotConfig(targetBuilding.type)) {
    const err = assignResidentToBuilding(state, residentId, targetBuilding.id);
    if (!err) resident.task = action.label;
    return err;
  }
```

- [ ] **Step 5: Run the selection-action test**

Run:

```powershell
node tools/game/test_selection_actions.mjs
```

Expected: PASS and prints `selection action tests passed`.

- [ ] **Step 6: Commit Task 3**

```powershell
git add src/game/selectionActions.ts src/game/simulation.ts tools/game/test_selection_actions.mjs
git commit -m "feat: assign residents to slotted buildings"
```

### Task 4: Production Requires Assigned Workplaces

**Files:**
- Create: `tools/game/test_worker_slot_production.mjs`
- Modify: `src/game/agents.ts`
- Modify: `src/game/simulation.ts`
- Modify: `tools/game/test_farm_food_yield.mjs`
- Modify: `tools/game/test_smithy_products.mjs`

- [ ] **Step 1: Write production-gating tests**

Create `tools/game/test_worker_slot_production.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-game-tests-'));
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
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const workerSlots = await import(pathToFileURL(join(compiledDir, 'workerSlots.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function clearMapToPlain(state) {
  for (const row of state.map) {
    for (const tile of row) {
      tile.terrain = 'plain';
      tile.hasIron = false;
      tile.buildingId = null;
    }
  }
  state.buildings = [];
  state.exploration = { explored: state.map.map(row => row.map(() => true)) };
}

function addBuilt(state, type, x, y, extra = {}) {
  const building = {
    id: 8100 + state.buildings.length,
    type,
    x,
    y,
    progress: buildings.BUILDING_DEFS[type].buildDays,
    built: true,
    fieldGrowth: 0,
    ...extra,
  };
  state.buildings.push(building);
  buildings.occupyBuildingTiles(state, building);
  return building;
}

function onlyWorkerAt(state, job, x, y) {
  const worker = state.residents[0];
  for (const resident of state.residents) resident.alive = resident.id === worker.id;
  Object.assign(worker, {
    alive: true,
    sick: false,
    health: 100,
    hunger: 100,
    warmth: 100,
    morale: 70,
    skills: {},
    job,
    assignedBuildingId: null,
    x,
    y,
    px: x,
    py: y,
    phase: 'rest',
    path: [],
    workTimer: 0,
    targetId: null,
    carrying: {},
    manualOrder: null,
  });
  state.weather = 'clear';
  state.resources.tools = 100;
  return worker;
}

{
  const state = simulation.newGame(2026070931);
  clearMapToPlain(state);
  state.day = 10;
  const field = addBuilt(state, 'field', 10, 10, { fieldGrowth: 0 });
  onlyWorkerAt(state, 'farmer', field.x, field.y);

  simulation.advanceTick(state);

  assert.equal(field.fieldGrowth, 0, 'unassigned farmer does not grow a field');
}

{
  const state = simulation.newGame(2026070932);
  clearMapToPlain(state);
  state.day = 10;
  const field = addBuilt(state, 'field', 11, 11, { fieldGrowth: 0 });
  const farmer = onlyWorkerAt(state, 'farmer', field.x, field.y);
  assert.equal(workerSlots.assignResidentToBuilding(state, farmer.id, field.id), null);

  simulation.advanceTick(state);

  assert.ok(field.fieldGrowth > 0, 'assigned farmer grows the assigned field');
}

{
  const state = simulation.newGame(2026070933);
  clearMapToPlain(state);
  const tannery = addBuilt(state, 'tannery', 12, 12);
  state.resources.hide = 10;
  state.resources.clothes = 0;
  onlyWorkerAt(state, 'idle', tannery.x, tannery.y);

  simulation.advanceDay(state);

  assert.equal(state.resources.clothes, 0, 'tannery no longer produces clothes automatically');
}

{
  const state = simulation.newGame(2026070934);
  clearMapToPlain(state);
  const tannery = addBuilt(state, 'tannery', 13, 13);
  const tanner = onlyWorkerAt(state, 'tanner', tannery.x, tannery.y);
  state.resources.hide = 10;
  state.resources.clothes = 0;
  state.processingReserves.hide = 0;
  assert.equal(workerSlots.assignResidentToBuilding(state, tanner.id, tannery.id), null);

  simulation.advanceTick(state);

  assert.ok(state.resources.hide < 10, 'assigned tanner consumes hide');
  assert.ok(state.resources.clothes > 0, 'assigned tanner produces clothes');
}

{
  const state = simulation.newGame(2026070935);
  clearMapToPlain(state);
  state.rank = 'bo';
  const smithy = addBuilt(state, 'smithy', 14, 14);
  simulation.setSmithyProduct(state, smithy.id, 'spears');
  const smith = onlyWorkerAt(state, 'smith', smithy.x, smithy.y);
  state.resources.tools = 100;
  state.resources.iron = 10;
  state.resources.wood = 10;
  state.resources.spears = 0;
  state.processingReserves.iron = 0;
  state.processingReserves.wood = 0;
  assert.equal(workerSlots.assignResidentToBuilding(state, smith.id, smithy.id), null);

  simulation.advanceTick(state);

  assert.ok(state.resources.spears > 0, 'assigned smith produces the assigned smithy product');
}

console.log('worker slot production tests passed');
```

- [ ] **Step 2: Run the production test to verify it fails**

Run:

```powershell
node tools/game/test_worker_slot_production.mjs
```

Expected: FAIL because unassigned farmers still work and tanner job has no loop.

- [ ] **Step 3: Add assignment helpers to agent logic**

Modify `src/game/agents.ts` imports:

```ts
import {
  assignedBuildingForResident, isResidentInAssignedSlot,
} from './workerSlots';
```

Add `tanner` to `PRODUCING_JOBS`:

```ts
const PRODUCING_JOBS = [
  'woodcutter', 'hunter', 'farmer', 'builder', 'smith', 'miner', 'fisher',
  'charcoalBurner', 'herder', 'tanner', 'powderMaker', 'herbalist', 'hauler',
];
```

Add this helper near `loiterNearBuilding`:

```ts
function assignedWorkplace(
  state: GameState,
  r: Resident,
  ctx: Ctx,
  type: BuildingTypeId,
  waitTask: string,
): Building | null {
  const building = assignedBuildingForResident(state, r);
  if (!building || building.type !== type || !isResidentInAssignedSlot(state, r, building)) {
    loiterNearCenter(state, r, ctx, waitTask);
    return null;
  }
  return building;
}
```

- [ ] **Step 4: Require assigned fields for farmers**

In `farmerTick`, replace the free `fields` selection with a single assigned field:

```ts
  const field = assignedWorkplace(state, r, ctx, 'field', '밭 배정 대기');
  const fields = field ? [field] : [];
```

Keep the existing winter and carry-deposit branches, but ensure unassigned farmers with carried grain deposit before waiting:

```ts
  if (!field && carryTotal(r) > 0) {
    r.phase = 'toDeposit';
    r.task = '곡물 운반';
    const st = goTo(state, r, ctx, depositGoal(state, []));
    if (st === 'arrived' || st === 'stuck') { depositAll(state, r); r.phase = 'rest'; }
    return;
  }
  if (!field) return;
```

For autumn and growing-season targets, use `field` directly instead of `nearestBuilding(...)`:

```ts
  const target = field.fieldGrowth > 0.5 ? field : null;
```

and:

```ts
  const target = field.fieldGrowth < 100 ? field : null;
```

- [ ] **Step 5: Require assigned smithies for smiths**

Change `findSmithWork` signature:

```ts
function findSmithWork(state: GameState, smithy: Building, r: Resident, ctx: Ctx, pop: number): SmithWork | null {
  const product = smithyProductOf(smithy);
  if (!isSmithyProductUnlocked(state.rank, product)) return null;
  if (!smithNeedsOutput(state, product, pop)) return null;
  const def = SMITHY_PRODUCT_DEFS[product];
  const target = (def.ratePerDay / 5) * effOf(r) * ctx.mMod;
  const made = Math.min(target, smithMaxCraftable(state, product));
  return made > 0.02 ? { smithy, product, made } : null;
}
```

Change `smithWantsIron` to accept the assigned smithy:

```ts
function smithWantsIron(state: GameState, smithy: Building, pop: number): boolean {
  const product = smithyProductOf(smithy);
  if (!isSmithyProductUnlocked(state.rank, product)) return false;
  if (!smithNeedsOutput(state, product, pop)) return false;
  return (SMITHY_PRODUCT_DEFS[product].inputPerUnit.iron ?? 0) > 0 &&
    processableAmount(state, 'iron') <= 0.02;
}
```

At the top of `smithTick`, require the assignment:

```ts
  const assignedSmithy = assignedWorkplace(state, r, ctx, 'smithy', '대장간 배정 대기');
  if (!assignedSmithy) {
    if (carryTotal(r) > 0) {
      r.phase = 'toDeposit';
      const st = goTo(state, r, ctx, depositGoal(state, ['smithy']));
      if (st === 'arrived' || st === 'stuck') { depositAll(state, r); r.phase = 'rest'; }
    }
    return;
  }
```

Use `assignedSmithy` as `waitSmithy`, call `findSmithWork(state, assignedSmithy, r, ctx, pop)`, and call `smithWantsIron(state, assignedSmithy, pop)`.

- [ ] **Step 6: Require assigned ferry, stable, and nitre yard workers**

In `fisherTick`, replace the ferry search with:

```ts
  const ferry = assignedWorkplace(state, r, ctx, 'ferry', '나루터 배정 대기');
  if (!ferry) return;
```

Then change the `goal`:

```ts
    goal: t => isBuildingInteractionTile(state, t, ferry.id),
```

In `herderTick`, replace `stables` with:

```ts
  const stable = assignedWorkplace(state, r, ctx, 'stable', '목장 배정 대기');
  if (!stable) return;
```

Then change the `goal`:

```ts
    goal: t => isBuildingInteractionTile(state, t, stable.id),
```

In `powderMakerTick`, after the paused/hidden guard, replace nearest yard selection with:

```ts
  const yard = assignedWorkplace(state, r, ctx, 'nitreYard', '염초장 배정 대기');
  if (!yard) return;
```

- [ ] **Step 7: Move tannery production into `tannerTick`**

In `src/game/simulation.ts`, remove the `runTannery(state);` call from `endOfDay`, delete the `runTannery` function, and change the processing import:

```ts
import { defaultProcessingReserves } from './processing';
```

In `src/game/agents.ts`, add:

```ts
function tannerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const p = CONFIG.production;
  const tannery = assignedWorkplace(state, r, ctx, 'tannery', '가죽공방 배정 대기');
  if (!tannery) return;

  const st = goTo(state, r, ctx, buildingGoal(state, tannery.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '가죽공방으로 이동';
    return;
  }

  const hideUsed = Math.min(
    processableAmount(state, 'hide'),
    (p.tanneryHidePerDay / 5) * effOf(r) * ctx.mMod,
  );
  if (hideUsed <= 0.02) {
    r.phase = 'rest';
    loiterNearBuilding(state, r, ctx, tannery, 3, '가죽 대기');
    return;
  }

  state.resources.hide -= hideUsed;
  state.resources.clothes += hideUsed / 2;
  r.phase = 'working';
  r.task = '가죽 가공';
  gainSkillTick(r);
}
```

Add the switch case:

```ts
      case 'tanner': tannerTick(state, r, ctx); break;
```

- [ ] **Step 8: Update production tests that now require assignment**

In `tools/game/test_farm_food_yield.mjs`, import worker slots:

```js
const workerSlots = await import(pathToFileURL(join(compiledDir, 'workerSlots.mjs')).href);
```

After creating the farmer in the harvest test:

```js
  assert.equal(workerSlots.assignResidentToBuilding(state, farmer.id, field.id), null);
```

In `tools/game/test_smithy_products.mjs`, import worker slots:

```js
const workerSlots = await import(pathToFileURL(join(compiledDir, 'workerSlots.mjs')).href);
```

After each production smith is positioned at a smithy, assign them:

```js
  assert.equal(workerSlots.assignResidentToBuilding(state, state.residents[0].id, spearSmithy.id), null);
```

and:

```js
  assert.equal(workerSlots.assignResidentToBuilding(state, state.residents[0].id, smithy.id), null);
```

- [ ] **Step 9: Run focused production tests**

Run:

```powershell
node tools/game/test_worker_slot_production.mjs
node tools/game/test_farm_food_yield.mjs
node tools/game/test_smithy_products.mjs
```

Expected: all PASS.

- [ ] **Step 10: Commit Task 4**

```powershell
git add src/game/agents.ts src/game/simulation.ts tools/game/test_worker_slot_production.mjs tools/game/test_farm_food_yield.mjs tools/game/test_smithy_products.mjs
git commit -m "feat: require assigned workers for production slots"
```

### Task 5: Job Change Cleanup And Building Assignment Utilities

**Files:**
- Modify: `tools/game/test_worker_slots.mjs`
- Modify: `src/game/simulation.ts`

- [ ] **Step 1: Add cleanup tests**

Append these blocks to `tools/game/test_worker_slots.mjs` before the final `console.log`:

```js
{
  const state = simulation.newGame(2026070941);
  clearMapToPlain(state);
  state.rank = 'bu';
  const field = addBuilt(state, 'field', 20, 20);
  const resident = state.residents[0];
  resetResident(resident, 'farmer', 19, 20);
  assert.equal(workerSlots.assignResidentToBuilding(state, resident.id, field.id), null);

  simulation.setResidentJob(state, resident.id, 'woodcutter');

  assert.equal(resident.job, 'woodcutter');
  assert.equal(resident.assignedBuildingId, null, 'manual job changes clear incompatible building assignment');
}

{
  const state = simulation.newGame(2026070942);
  clearMapToPlain(state);
  state.rank = 'bu';
  const smithy = addBuilt(state, 'smithy', 21, 21);
  const resident = state.residents[0];
  resetResident(resident, 'smith', 20, 21);
  assert.equal(workerSlots.assignResidentToBuilding(state, resident.id, smithy.id), null);

  workerSlots.clearAssignmentsForBuilding(state, smithy.id);

  assert.equal(resident.assignedBuildingId, null, 'building assignment cleanup clears residents');
}
```

- [ ] **Step 2: Run the cleanup test to verify it fails**

Run:

```powershell
node tools/game/test_worker_slots.mjs
```

Expected: FAIL because `setResidentJob` does not clear incompatible assignment.

- [ ] **Step 3: Clear incompatible assignments on job changes**

In `src/game/simulation.ts`, extend the existing worker-slot import:

```ts
  clearAssignmentsForBuilding,
  clearIncompatibleAssignment,
```

In `src/game/simulation.ts`, modify `reassignJob`:

```ts
  r.job = to;
  clearIncompatibleAssignment(state, r);
  resetAgent(state, r);
```

Modify `setResidentJob`:

```ts
    r.job = job;
    clearIncompatibleAssignment(state, r);
    resetAgent(state, r);
```

In `demolishBuilding`, after `clearBuildingTiles(state, building.id);`, add:

```ts
  clearAssignmentsForBuilding(state, building.id);
```

This keeps the cleanup path correct for any future slotted demolition flow, while current UI demolition remains wall-limited.

- [ ] **Step 4: Run the cleanup test**

Run:

```powershell
node tools/game/test_worker_slots.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```powershell
git add src/game/simulation.ts tools/game/test_worker_slots.mjs
git commit -m "fix: clear stale worker slot assignments"
```

### Task 6: Slot Overlays And Building Popup Controls

**Files:**
- Modify: `src/render/renderer.ts`
- Modify: `src/components/GameCanvas.tsx`
- Modify: `src/components/ActionPopup.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Add renderer support for compact dots and selected badges**

Modify `src/render/renderer.ts` imports:

```ts
import { JOB_COLORS } from '../game/constants';
import { assignedWorkers, workerSlotConfig } from '../game/workerSlots';
```

Extend `SceneOptions`:

```ts
  selectedBuildingId?: number | null;
```

Add these draw helpers before `renderScene`:

```ts
function drawWorkerSlotDots(ctx: CanvasRenderingContext2D, state: GameState, selectedBuildingId: number | null | undefined): void {
  ctx.save();
  for (const building of state.buildings) {
    if (!building.built || !isBuildingFootprintExplored(state, building.type, building.x, building.y)) continue;
    const config = workerSlotConfig(building.type);
    if (!config) continue;
    const workers = assignedWorkers(state, building);
    const footprint = buildingFootprintSize(building.type);
    const cx = (building.x + footprint / 2) * TILE;
    const y = building.y * TILE - (building.id === selectedBuildingId ? 18 : 7);

    if (building.id === selectedBuildingId) {
      const badgeW = 18;
      const gap = 3;
      const totalW = config.slots * badgeW + (config.slots - 1) * gap;
      const startX = cx - totalW / 2;
      for (let i = 0; i < config.slots; i++) {
        const worker = workers[i];
        const x = startX + i * (badgeW + gap);
        ctx.fillStyle = worker ? JOB_COLORS[worker.job] : 'rgba(12,18,24,0.72)';
        ctx.strokeStyle = worker ? 'rgba(255,255,255,0.72)' : 'rgba(210,220,226,0.58)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, badgeW, 14, 3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = worker ? '#101418' : '#d0d8de';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(worker ? '●' : '+', x + badgeW / 2, y + 7);
      }
      continue;
    }

    const dotR = 3;
    const gap = 4;
    const totalW = config.slots * dotR * 2 + (config.slots - 1) * gap;
    const startX = cx - totalW / 2 + dotR;
    for (let i = 0; i < config.slots; i++) {
      const worker = workers[i];
      const x = startX + i * (dotR * 2 + gap);
      ctx.beginPath();
      ctx.arc(x, y, dotR, 0, Math.PI * 2);
      if (worker) {
        ctx.fillStyle = JOB_COLORS[worker.job];
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(210,220,226,0.72)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}
```

After the building draw loop and before resident draw, call:

```ts
  drawWorkerSlotDots(ctx, state, o.selectedBuildingId);
```

- [ ] **Step 2: Pass selected building ID from `GameCanvas`**

In `src/components/GameCanvas.tsx`, compute:

```ts
  const selectedBuildingId = selectedEntity?.kind === 'building' ? selectedEntity.id : null;
```

Pass it to `renderScene`:

```ts
      selectedBuildingId,
```

- [ ] **Step 3: Add slot controls to `ActionPopup`**

Modify imports in `src/components/ActionPopup.tsx`:

```ts
import { JOB_NAMES } from '../game/constants';
import {
  assignedWorkers, availableWorkerSlots, workerSlotConfig,
} from '../game/workerSlots';
```

Extend props:

```ts
  onAssignNearestWorker: (buildingId: number) => void;
  onUnassignWorker: (residentId: number) => void;
  onSelectResident: (residentId: number) => void;
```

Inside the component after `actions`, compute:

```ts
  const slotConfig = workerSlotConfig(building.type);
  if (actions.length === 0 && !slotConfig) return null;
  const workers = slotConfig ? assignedWorkers(state, building) : [];
```

Add this JSX after the header:

```tsx
      {slotConfig && (
        <div className="worker-slot-panel">
          {Array.from({ length: slotConfig.slots }, (_, index) => {
            const worker = workers[index];
            return worker ? (
              <div className="worker-slot-row filled" key={index}>
                <button className="worker-slot-main" type="button" onClick={() => onSelectResident(worker.id)}>
                  <span className="worker-slot-dot" style={{ background: 'currentColor' }} />
                  <span>{worker.name}</span>
                  <span className="muted">{JOB_NAMES[worker.job]}</span>
                </button>
                <button className="icon-btn" type="button" onClick={() => onUnassignWorker(worker.id)} aria-label="배정 해제">-</button>
              </div>
            ) : (
              <button
                className="worker-slot-row empty"
                key={index}
                type="button"
                disabled={availableWorkerSlots(state, building) <= 0}
                onClick={() => onAssignNearestWorker(building.id)}
              >
                <span>빈 슬롯</span>
                <span className="muted">{JOB_NAMES[slotConfig.job]}</span>
              </button>
            );
          })}
        </div>
      )}
```

- [ ] **Step 4: Wire callbacks through `GameCanvas` and `App`**

In `src/components/GameCanvas.tsx`, extend props:

```ts
  onAssignNearestWorker: (buildingId: number) => void;
  onUnassignWorker: (residentId: number) => void;
```

Destructure the props and pass them to `ActionPopup`:

```tsx
          onAssignNearestWorker={onAssignNearestWorker}
          onUnassignWorker={onUnassignWorker}
          onSelectResident={onResidentClick}
```

In `src/App.tsx`, import the wrappers:

```ts
  assignNearestWorkerToBuilding, assignResidentToBuilding, unassignResidentFromBuilding,
```

The `assignResidentToBuilding` import is used by the console hook in the next snippet. Add handlers near the nitre handler:

```ts
  const handleAssignNearestWorker = (buildingId: number) => {
    const err = assignNearestWorkerToBuilding(stateRef.current, buildingId);
    if (err) addLog(stateRef.current, err, 'info');
    bump();
  };

  const handleUnassignWorker = (residentId: number) => {
    unassignResidentFromBuilding(stateRef.current, residentId);
    bump();
  };
```

Expose direct assignment in the development console hook:

```ts
      assign: (residentId: number, buildingId: number) => assignResidentToBuilding(stateRef.current, residentId, buildingId),
```

Pass handlers into `GameCanvas`:

```tsx
            onAssignNearestWorker={handleAssignNearestWorker}
            onUnassignWorker={handleUnassignWorker}
```

- [ ] **Step 5: Style slot controls**

Append to `src/styles/global.css`:

```css
.worker-slot-panel {
  display: grid;
  gap: 6px;
  margin-bottom: 8px;
}

.worker-slot-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 30px;
  gap: 6px;
  border: 1px solid var(--line);
  background: rgba(8, 12, 16, 0.45);
  color: var(--text);
  border-radius: 6px;
  padding: 4px 6px;
  font: inherit;
}

.worker-slot-row.empty {
  width: 100%;
  cursor: pointer;
}

.worker-slot-row.empty:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.worker-slot-main {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.worker-slot-main span:nth-child(2) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.worker-slot-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
```

- [ ] **Step 6: Run the build**

Run:

```powershell
npm.cmd run build
```

Expected: PASS. If sandbox blocks build output or dependency access, rerun with escalation.

- [ ] **Step 7: Commit Task 6**

```powershell
git add src/render/renderer.ts src/components/GameCanvas.tsx src/components/ActionPopup.tsx src/App.tsx src/styles/global.css
git commit -m "feat: show and manage worker slots in UI"
```

### Task 7: Full Regression And Browser Verification

**Files:**
- Modify: any `tools/game/test_*.mjs` file that fails because a slotted production worker now needs an assignment.

- [ ] **Step 1: Run all game tests**

Run:

```powershell
Get-ChildItem tools/game/test_*.mjs | Sort-Object Name | ForEach-Object { node $_.FullName }
```

Expected: every script prints its success line.

- [ ] **Step 2: Fix tests with explicit assignments**

For each failing production test, import worker slots:

```js
const workerSlots = await import(pathToFileURL(join(compiledDir, 'workerSlots.mjs')).href);
```

Assign the worker to the exact building involved in the assertion:

```js
assert.equal(workerSlots.assignResidentToBuilding(state, worker.id, building.id), null);
```

Use this rule:

- Farmer assertions assign to `field`.
- Smith assertions assign to `smithy`.
- Fisher assertions assign to `ferry`.
- Herder assertions assign to `stable`.
- Powder maker assertions assign to `nitreYard`.
- Tanner assertions assign to `tannery`.

- [ ] **Step 3: Run full build**

Run:

```powershell
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 4: Browser verification**

With the dev server running, verify these flows in the in-app browser:

- Normal map view shows compact slot dots over fields, smithies, stables, nitre yards, ferries, and tanneries.
- Selecting one of those buildings expands the overlay into badges.
- Empty slot click assigns an idle or matching-job resident.
- Filled slot click focuses the resident in the people inspector.
- Resident selected plus right-click on eligible building assigns the resident and switches job.
- Full field shows no second empty slot.
- Unassigned farmer standing on a field does not grow or harvest it.
- Assigned tanner converts hide into clothes.

- [ ] **Step 5: Final test run**

Run:

```powershell
node tools/game/test_worker_slots.mjs
node tools/game/test_worker_slot_save_load.mjs
node tools/game/test_worker_slot_production.mjs
node tools/game/test_selection_actions.mjs
npm.cmd run build
```

Expected: all PASS.

- [ ] **Step 6: Commit regression updates**

If Task 7 changed tests or source files, commit only those files:

```powershell
git add <changed-worker-slot-files>
git commit -m "test: cover worker slot regressions"
```

If Task 7 made no file changes, skip this commit.

## Out Of Scope

- Raid damage, battle consequences, and combat threat tuning.
- Resident picker modal for empty slots.
- Slot assignment for woodcutter, hunter, herbalist, miner, charcoal burner, clerk, watchman, militia, builder, and hauler.
- Production-yield rebalance after slot enforcement.

## Verification Commands

Run before handing back:

```powershell
node tools/game/test_worker_slots.mjs
node tools/game/test_worker_slot_save_load.mjs
node tools/game/test_worker_slot_production.mjs
node tools/game/test_selection_actions.mjs
Get-ChildItem tools/game/test_*.mjs | Sort-Object Name | ForEach-Object { node $_.FullName }
npm.cmd run build
```

## Self-Review Checklist

- Spec coverage:
  - Building slot capacities are implemented in Task 1.
  - `assignedBuildingId` data model and save migration are implemented in Tasks 1 and 2.
  - Resident right-click assignment is implemented in Task 3.
  - Building-selected empty-slot assignment and filled-slot focus/unassign are implemented in Task 6.
  - Canvas slot dots and selected badges are implemented in Task 6.
  - Production gating for farmer, smith, fisher, herder, powder maker, and tanner is implemented in Task 4.
  - Automatic tannery processing is removed in Task 4.
  - Job-change and building cleanup are implemented in Task 5.
- Type consistency:
  - `assignedBuildingId` uses `number | null` everywhere.
  - `workerSlotConfig` returns `WorkerSlotConfig | null`.
  - `assignResidentToBuilding` returns `string | null` in both helper and simulation wrapper.
  - `assignedWorkers` returns `Resident[]`.
  - UI callbacks use `buildingId: number` and `residentId: number`.
