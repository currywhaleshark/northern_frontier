# Resource Logistics And Trade Overhaul Implementation Plan

> **계획 상태:** 완료
> **상태 갱신:** 2026-07-29 — 자원·물류·소비·연료·작물·의복·가치 교역 범위가 후속 구현에 반영됐다.

**Status:** Implemented and verified on 2026-07-10. The review amendments below are the final contracts used by the code.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current direct-to-stock resource model with production-site storage, hauler logistics, richer food/fuel/clothing categories, luxury goods, and value-based faction trade.

**Architecture:** Keep `state.resources` as the settlement's usable stock stored at the center/storehouses, and add local `building.inventory` for production-site stock waiting for haulers. Put category math, consumption rules, inventory helpers, and trade value quoting in small game modules so UI and simulation use the same rules.

**Tech Stack:** React 18, TypeScript, Vite, deterministic `.mjs` game tests under `tools/game`.

---

## Scope Check

This is five related subsystems, not a single balance tweak:

1. Production-site storage and hauler logistics.
2. Court tribute reserve and partial payment.
3. Resource taxonomy and consumption effects.
4. New processing chains for fuel, clothing, crops, hunting, and luxuries.
5. Value-based trade.

Implement in the order below. Each task must leave the game buildable and the relevant tests green. Do not batch all tasks into one unreviewed change.

## Review Amendments (Implemented)

These decisions override any older example later in this document that conflicts with them:

- The resource taxonomy migration is atomic across all consumers. Removing `food`, `clothes`, and `game` is not considered complete until agents, consumption, processing, tribute, petitions, raids, trade, UI, and existing tests compile against the new IDs.
- Save migration covers settlement resources, resident cargo, building inventories, processing reserves, active court tribute items, tribute reserves, and pending resource-based choices. Legacy trade, tribute, and petition modals are closed and regenerated under current rules.
- Field cereals produce edible `grain`. Paddies produce non-edible `rice`; only an assigned watermill worker converts settlement-stock `rice` into local mill `grain` inventory.
- Production and processing outputs remain in local building inventory until hauled. Haulers persist `{ sourceBuildingId, resource, amount }` tasks and subtract other haulers' reservations before claiming stock.
- Clothing coverage and winter wear are separate calculations. Coverage uses clothing values; physical wear consumes clothing units so clothing stock is not permanent.
- Refusing tribute or announcing a new year's tribute releases every unconsumed reserved item. Multi-item partial payment uses the average fulfillment ratio of each requested line, rather than adding unlike item units.
- Trade requests require a positive finite integer amount, distinct resources, faction import/export membership, and non-abstract resources. Quotes below one received unit are rejected; there is no unconditional minimum-one payout. Applying a quote recalculates it to reject stale or forged terms.
- Incoming merchant offers may continue using deterministic fixed templates. Player-initiated trade uses the validated value quote engine and preserves reputation, relationship, cooldown, and suspicion side effects.

## Current Structure Notes

- `src/game/types.ts` currently has flat `ResourceId`, `Building`, and `GameState.resources`.
- `src/game/agents.ts` currently deposits resident cargo straight into `state.resources` via `depositAll`.
- Production jobs already have useful boundaries: `farmerTick`, `woodcutterTick`, `hunterTick`, `fisherTick`, `herbalistTick`, `haulerTick`, `millerTick`, `charcoalBurnerTick`, `tannerTick`.
- `src/game/resources.ts` currently owns edible food total and consumption helpers.
- `src/game/events.ts` currently models trade as fixed `TradeOffer` options.
- `src/components/TopBar.tsx`, `InspectorPanel.tsx`, and `ProcessingPanel.tsx` will need grouped resource display.

## File Structure

Create:

- `src/game/resourceCatalog.ts`: resource definitions, categories, display labels, consumption weights, fuel heat values, clothing warmth values, trade base values.
- `src/game/inventory.ts`: settlement stock and building inventory helpers.
- `src/game/tributeReserve.ts`: court tribute reserve helpers for locking settlement stock at the center.
- `src/game/consumption.ts`: food/fuel/clothing category totals, balanced consumption, shortage effects.
- `src/game/tradeValues.ts`: faction-specific value tables, relationship margin, quote validation, exchange settlement.
- `src/components/ResourceBreakdownPopover.tsx`: hover/pinned breakdown panel for aggregate top-bar resources.
- `tools/game/test_building_inventory_logistics.mjs`: production-site inventory and hauler movement tests.
- `tools/game/test_resource_category_consumption.mjs`: food/fuel/clothing aggregation and shortage effects.
- `tools/game/test_fuel_and_clothing_chains.mjs`: wood, fuel, cotton, and clothing production tests.
- `tools/game/test_trade_values.mjs`: value-based trade quote and relationship margin tests.

Modify:

- `src/game/types.ts`: add new resources, resource categories, `Building.inventory`, trade request types, and new jobs/buildings/crops.
- `src/game/constants.ts`: derive `RESOURCE_NAMES`, `RESOURCE_ICONS`, `RESOURCE_ORDER`, and faction trade profiles from the catalog.
- `src/game/config.ts`: starting resource values, production rates, consumption weights, shortage penalties, trade margins.
- `src/game/saveLoad.ts`: migrate new resource IDs and building inventories.
- `src/game/resources.ts`: either re-export category helpers from `consumption.ts` or shrink to primitive add/spend helpers.
- `src/game/processing.ts`: make unmilled rice, not edible grain, the watermill processing input.
- `src/game/agents.ts`: route producers into building inventories, make haulers move inventory to stock, move processing to dedicated jobs.
- `src/game/crops.ts`: add `vegetables` and `cotton` crop definitions.
- `src/game/buildings.ts`: add wood shed, weaving house, and storage metadata.
- `src/game/workerSlots.ts`: add job slots for new buildings.
- `src/game/simulation.ts`: daily consumption, building placement cost checks, end conditions, and seasonal messaging.
- `src/game/courtTribute.ts`: tribute reserve requirements, full payment, partial payment, and scaled penalties.
- `src/game/petition.ts`: luxury goods as actual resources, not only instant morale.
- `src/game/events.ts`: replace fixed player-initiated offers with value quotes.
- `src/components/TopBar.tsx`: grouped resource category display.
- `src/components/ProcessingPanel.tsx`: replace the obsolete grain milling reserve with an unmilled-rice reserve.
- `src/styles/global.css`: hover/pinned resource breakdown styling.
- `src/components/InspectorPanel.tsx`: building inventory display and trade controls.
- `src/components/ActionPopup.tsx`: market/dock trade entry if needed.
- Existing tests under `tools/game`: update expectations for renamed resources and changed hauler duties.

## Resource Model

Use these visible resources after the taxonomy step:

```ts
export type ResourceId =
  | 'grain'
  | 'rice'
  | 'meat'
  | 'fish'
  | 'vegetables'
  | 'brushwood'
  | 'firewood'
  | 'charcoal'
  | 'wood'
  | 'stone'
  | 'iron'
  | 'tools'
  | 'hide'
  | 'hideClothes'
  | 'cotton'
  | 'cottonClothes'
  | 'herbs'
  | 'gunpowder'
  | 'spears'
  | 'hornBows'
  | 'muskets'
  | 'porcelain'
  | 'brassware'
  | 'lacquerware'
  | 'silk'
  | 'preciousMetal'
  | 'reputation'
  | 'defense';
```

Category display:

- Food total: `grain + meat + fish + vegetables`.
- `rice` means harvested, unmilled paddy rice (`벼`). It is not edible and is excluded from `FOOD_RESOURCES`; a watermill converts it into edible `grain`.
- Fuel total: `brushwood * 0.6 + firewood * 1.0 + charcoal * 1.5`.
- Clothing coverage: `hideClothes * 1.1 + cottonClothes * 1.0`.
- Luxury stock: `porcelain + brassware + lacquerware + silk + preciousMetal`.

Tribute reserve:

- `state.resources` remains usable settlement stock.
- `state.tributeReserve` is a locked stockpile at the center for the current court tribute.
- Only resources listed in the current `state.courtTribute.items` can be moved into `tributeReserve`.
- Daily consumption, building costs, processing, trade, and petitions cannot spend `tributeReserve`.
- Full tribute consumes the required reserve and gives the full reward.
- Partial tribute consumes the prepared reserve and scales reputation loss, threat gain, and suspicion relief by the delivered ratio.

Do not keep generic `food`, `clothes`, or `game` as player-facing resources after the migration. `grain` remains the edible court tribute and trade grain resource. Field cereals harvest directly as `grain`; only paddies harvest `rice`, which must be milled before consumption or tribute.

## Task 1: Resource Catalog And Migration

**Files:**

- Create: `src/game/resourceCatalog.ts`
- Modify: `src/game/types.ts`
- Modify: `src/game/constants.ts`
- Modify: `src/game/config.ts`
- Modify: `src/game/saveLoad.ts`
- Test: `tools/game/test_resource_category_consumption.mjs`

- [ ] **Step 1: Write the failing resource catalog test**

Create the test file with this first block:

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
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_m, start, spec, end) =>
      /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const catalog = await import(pathToFileURL(join(compiledDir, 'resourceCatalog.mjs')).href);
const constants = await import(pathToFileURL(join(compiledDir, 'constants.mjs')).href);

{
  assert.deepEqual(catalog.FOOD_RESOURCES, ['grain', 'meat', 'fish', 'vegetables']);
  assert.deepEqual(catalog.FUEL_RESOURCES, ['brushwood', 'firewood', 'charcoal']);
  assert.deepEqual(catalog.CLOTHING_RESOURCES, ['hideClothes', 'cottonClothes']);
  assert.equal(catalog.RESOURCE_DEFS.grain.category, 'food');
  assert.equal(catalog.RESOURCE_DEFS.rice.category, 'material');
  assert.equal(catalog.FOOD_RESOURCES.includes('rice'), false, 'unmilled paddy rice is not edible');
  assert.equal(catalog.RESOURCE_DEFS.charcoal.fuelValue, 1.5);
  assert.equal(constants.RESOURCE_NAMES.hideClothes, '가죽옷');
  assert.equal(constants.RESOURCE_NAMES.cottonClothes, '무명옷');
}

{
  const state = simulation.newGame(2026071001);
  for (const id of catalog.RESOURCE_IDS) {
    assert.equal(typeof state.resources[id], 'number', `${id} is initialized`);
  }
  assert.equal(Object.prototype.hasOwnProperty.call(state.resources, 'food'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(state.resources, 'clothes'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(state.resources, 'game'), false);
}

console.log('resource category tests passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tools\game\test_resource_category_consumption.mjs
```

Expected: fail because `resourceCatalog.ts` does not exist or old resource IDs remain.

- [ ] **Step 3: Add catalog and types**

Add `src/game/resourceCatalog.ts` with these exports:

```ts
import type { ResourceId } from './types';

export type ResourceCategory =
  | 'food'
  | 'fuel'
  | 'clothing'
  | 'material'
  | 'military'
  | 'luxury'
  | 'abstract';

export interface ResourceDef {
  id: ResourceId;
  name: string;
  icon: string;
  category: ResourceCategory;
  foodWeight?: number;
  fuelValue?: number;
  clothingValue?: number;
  tradeBaseValue: number;
}

export const FOOD_RESOURCES = ['grain', 'meat', 'fish', 'vegetables'] as const satisfies readonly ResourceId[];
export const FUEL_RESOURCES = ['brushwood', 'firewood', 'charcoal'] as const satisfies readonly ResourceId[];
export const CLOTHING_RESOURCES = ['hideClothes', 'cottonClothes'] as const satisfies readonly ResourceId[];
export const LUXURY_RESOURCES = ['porcelain', 'brassware', 'lacquerware', 'silk', 'preciousMetal'] as const satisfies readonly ResourceId[];

export const RESOURCE_DEFS: Record<ResourceId, ResourceDef> = {
  grain: { id: 'grain', name: '곡물', icon: '🌾', category: 'food', foodWeight: 2, tradeBaseValue: 1.0 },
  rice: { id: 'rice', name: '벼', icon: '🌾', category: 'material', tradeBaseValue: 0.8 },
  meat: { id: 'meat', name: '고기', icon: '🥩', category: 'food', foodWeight: 1, tradeBaseValue: 1.6 },
  fish: { id: 'fish', name: '생선', icon: '🐟', category: 'food', foodWeight: 1, tradeBaseValue: 1.3 },
  vegetables: { id: 'vegetables', name: '채소', icon: '🥬', category: 'food', foodWeight: 1, tradeBaseValue: 1.1 },
  brushwood: { id: 'brushwood', name: '땔나무', icon: '🪵', category: 'fuel', fuelValue: 0.6, tradeBaseValue: 0.5 },
  firewood: { id: 'firewood', name: '장작', icon: '🔥', category: 'fuel', fuelValue: 1.0, tradeBaseValue: 0.9 },
  charcoal: { id: 'charcoal', name: '숯', icon: '⚫', category: 'fuel', fuelValue: 1.5, tradeBaseValue: 1.4 },
  wood: { id: 'wood', name: '목재', icon: '🪵', category: 'material', tradeBaseValue: 1.0 },
  stone: { id: 'stone', name: '돌', icon: '🪨', category: 'material', tradeBaseValue: 0.8 },
  iron: { id: 'iron', name: '철', icon: '⛏️', category: 'material', tradeBaseValue: 2.4 },
  tools: { id: 'tools', name: '도구', icon: '🔨', category: 'material', tradeBaseValue: 4.0 },
  hide: { id: 'hide', name: '가죽', icon: '🦌', category: 'material', tradeBaseValue: 1.8 },
  hideClothes: { id: 'hideClothes', name: '가죽옷', icon: '🧥', category: 'clothing', clothingValue: 1.1, tradeBaseValue: 3.4 },
  cotton: { id: 'cotton', name: '목화', icon: '☁️', category: 'material', tradeBaseValue: 1.7 },
  cottonClothes: { id: 'cottonClothes', name: '무명옷', icon: '👕', category: 'clothing', clothingValue: 1.0, tradeBaseValue: 3.0 },
  herbs: { id: 'herbs', name: '약초', icon: '🌿', category: 'material', tradeBaseValue: 1.5 },
  gunpowder: { id: 'gunpowder', name: '화약', icon: '🧨', category: 'military', tradeBaseValue: 5.0 },
  spears: { id: 'spears', name: '창', icon: '槍', category: 'military', tradeBaseValue: 3.8 },
  hornBows: { id: 'hornBows', name: '각궁', icon: '弓', category: 'military', tradeBaseValue: 5.0 },
  muskets: { id: 'muskets', name: '조총', icon: '🔫', category: 'military', tradeBaseValue: 8.0 },
  porcelain: { id: 'porcelain', name: '자기', icon: '🏺', category: 'luxury', tradeBaseValue: 6.0 },
  brassware: { id: 'brassware', name: '유기', icon: '🥣', category: 'luxury', tradeBaseValue: 5.0 },
  lacquerware: { id: 'lacquerware', name: '칠기', icon: '📦', category: 'luxury', tradeBaseValue: 5.5 },
  silk: { id: 'silk', name: '비단', icon: '🧶', category: 'luxury', tradeBaseValue: 7.0 },
  preciousMetal: { id: 'preciousMetal', name: '귀금속', icon: '💍', category: 'luxury', tradeBaseValue: 9.0 },
  reputation: { id: 'reputation', name: '명성', icon: '📜', category: 'abstract', tradeBaseValue: 0 },
  defense: { id: 'defense', name: '방어도', icon: '🛡️', category: 'abstract', tradeBaseValue: 0 },
};

export const RESOURCE_IDS = Object.keys(RESOURCE_DEFS) as ResourceId[];
export const RESOURCE_ORDER: ResourceId[] = [
  'grain', 'rice', 'meat', 'fish', 'vegetables',
  'brushwood', 'firewood', 'charcoal',
  'wood', 'stone', 'iron', 'tools', 'hide', 'cotton', 'herbs',
  'hideClothes', 'cottonClothes',
  'porcelain', 'brassware', 'lacquerware', 'silk', 'preciousMetal',
  'gunpowder', 'spears', 'hornBows', 'muskets', 'reputation', 'defense',
];
```

Update `ResourceId` in `src/game/types.ts` to match the list above. In `constants.ts`, export names/icons/orders from `RESOURCE_DEFS` instead of hand-maintaining a second list.

- [ ] **Step 4: Migrate start resources**

In `CONFIG.start.resources`, use:

```ts
resources: {
  grain: 100, rice: 0, meat: 0, fish: 0, vegetables: 0,
  brushwood: 12, firewood: 45, charcoal: 0,
  wood: 30, stone: 12, iron: 4, tools: 10,
  hide: 6, cotton: 0, hideClothes: 12, cottonClothes: 0, herbs: 5,
  porcelain: 0, brassware: 0, lacquerware: 0, silk: 0, preciousMetal: 0,
  gunpowder: 0, spears: 0, hornBows: 0, muskets: 0,
  reputation: 50, defense: 0,
}
```

In `saveLoad.ts`, map old saves:

```ts
if (parsed.resources.food != null) {
  parsed.resources.grain = (parsed.resources.grain ?? 0) + parsed.resources.food;
  delete parsed.resources.food;
}
if (parsed.resources.clothes != null) {
  parsed.resources.hideClothes = (parsed.resources.hideClothes ?? 0) + parsed.resources.clothes;
  delete parsed.resources.clothes;
}
if (parsed.resources.game != null) {
  parsed.resources.meat = (parsed.resources.meat ?? 0) + parsed.resources.game * CONFIG.production.foodPerGame;
  parsed.resources.hide = (parsed.resources.hide ?? 0) + parsed.resources.game * CONFIG.production.hidePerGame;
  delete parsed.resources.game;
}
for (const id of RESOURCE_IDS) {
  if (parsed.resources[id] == null) parsed.resources[id] = 0;
}
```

- [ ] **Step 5: Run test and build**

Run:

```powershell
node tools\game\test_resource_category_consumption.mjs
npm run build
```

Expected: both pass.

## Task 2: Building Inventory And Hauler Logistics

**Files:**

- Create: `src/game/inventory.ts`
- Modify: `src/game/types.ts`
- Modify: `src/game/agents.ts`
- Modify: `src/game/simulation.ts`
- Modify: `src/game/saveLoad.ts`
- Modify: `src/components/InspectorPanel.tsx`
- Test: `tools/game/test_building_inventory_logistics.mjs`

- [ ] **Step 1: Write failing logistics test**

Create `tools/game/test_building_inventory_logistics.mjs` with assertions:

```js
// compile helper same as other tools/game tests
// imports: simulation, buildings, workerSlots, inventory

{
  const state = simulation.newGame(2026071002);
  for (const id of Object.keys(state.resources)) state.resources[id] = 0;
  const field = state.buildings.find(b => b.type === 'field') ??
    { id: state.nextBuildingId++, type: 'field', x: 8, y: 8, progress: 3, built: true, fieldGrowth: 100, cropId: 'millet', queuedCropId: null, inventory: {} };
  if (!state.buildings.includes(field)) state.buildings.push(field);
  state.day = 25;
  const farmer = state.residents[0];
  Object.assign(farmer, { alive: true, sick: false, health: 100, job: 'farmer', x: field.x, y: field.y, px: field.x, py: field.y, carrying: {}, phase: 'rest', path: [], workTimer: 0, assignedBuildingId: field.id });

  simulation.advanceTick(state);

  assert.equal(state.resources.grain, 0, 'harvested grain is not immediately usable settlement stock');
  assert.ok((field.inventory?.grain ?? 0) > 0, 'field stores harvested grain locally');
}

{
  const state = simulation.newGame(2026071003);
  for (const id of Object.keys(state.resources)) state.resources[id] = 0;
  const storehouse = state.buildings.find(b => b.type === 'center');
  const field = { id: state.nextBuildingId++, type: 'field', x: 8, y: 8, progress: 3, built: true, fieldGrowth: 0, cropId: 'millet', queuedCropId: null, inventory: { grain: 6 } };
  state.buildings.push(field);
  const hauler = state.residents[0];
  Object.assign(hauler, { alive: true, sick: false, health: 100, job: 'hauler', x: field.x, y: field.y, px: field.x, py: field.y, carrying: {}, phase: 'rest', path: [], workTimer: 0, assignedBuildingId: null });

  for (let i = 0; i < 20; i++) simulation.advanceTick(state);

  assert.ok((field.inventory?.grain ?? 0) < 6, 'hauler removes grain from production site');
  assert.ok(state.resources.grain > 0, 'hauler deposits grain into usable settlement stock');
  assert.ok(storehouse, 'center exists as settlement storage');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tools\game\test_building_inventory_logistics.mjs
```

Expected: fail because buildings do not have local inventories and farmers deposit to `state.resources`.

- [ ] **Step 3: Add inventory primitives**

Add `Building.inventory?: Partial<Record<ResourceId, number>>` in `types.ts`.

Create `src/game/inventory.ts`:

```ts
import type { Building, GameState, ResourceId } from './types';

export const STORAGE_BUILDINGS = ['center', 'storehouse'] as const;

export function ensureBuildingInventory(building: Building): Partial<Record<ResourceId, number>> {
  if (!building.inventory) building.inventory = {};
  return building.inventory;
}

export function buildingStock(building: Building, resource: ResourceId): number {
  return building.inventory?.[resource] ?? 0;
}

export function addBuildingStock(building: Building, resource: ResourceId, amount: number): void {
  const inventory = ensureBuildingInventory(building);
  inventory[resource] = Math.max(0, (inventory[resource] ?? 0) + amount);
}

export function takeBuildingStock(building: Building, resource: ResourceId, amount: number): number {
  const inventory = ensureBuildingInventory(building);
  const taken = Math.min(inventory[resource] ?? 0, Math.max(0, amount));
  inventory[resource] = Math.max(0, (inventory[resource] ?? 0) - taken);
  return taken;
}

export function isStorageBuilding(building: Building): boolean {
  return building.built && (building.type === 'center' || building.type === 'storehouse');
}

export function addSettlementStock(state: GameState, resource: ResourceId, amount: number): void {
  state.resources[resource] = Math.max(0, (state.resources[resource] ?? 0) + amount);
}

export function takeSettlementStock(state: GameState, resource: ResourceId, amount: number): number {
  const taken = Math.min(state.resources[resource] ?? 0, Math.max(0, amount));
  state.resources[resource] = Math.max(0, (state.resources[resource] ?? 0) - taken);
  return taken;
}
```

- [ ] **Step 4: Change producer deposit destinations**

In `agents.ts`:

- Replace `depositAll(state, r)` with two helpers:
  - `depositCarryingToSettlement(state, r)` for storage buildings and emergency cleanup.
  - `depositCarryingToBuilding(building, r)` for production buildings.
- `farmerTick`: harvested crop goes into the field/paddy inventory. Farmer should no longer carry harvested grain to center.
- `woodcutterTick`: wood and brushwood go to lumber camp inventory if assigned or nearest lumber camp; otherwise to settlement stock for early fallback.
- `hunterTick`: meat and hide go to hunt lodge inventory.
- `fisherTick`: fish goes to ferry inventory.
- `herbalistTick`: herbs and vegetables go to herb hut inventory.

- [ ] **Step 5: Add hauler pickup loop**

In `agents.ts`, make `haulerTick` first look for production building inventory:

```ts
interface HaulTask {
  source: Building;
  resource: ResourceId;
  amount: number;
}
```

Pick the nearest built non-storage building with positive inventory. Move to it, withdraw up to carry cap, then move to center/storehouse and add to `state.resources`.

Priority order:

```ts
const HAUL_PRIORITY: ResourceId[] = [
  'grain', 'rice', 'vegetables', 'meat', 'fish',
  'firewood', 'brushwood', 'charcoal',
  'wood', 'hide', 'cotton', 'herbs', 'stone', 'iron',
];
```

If no hauling exists, continue with current fallback quarry behavior.

- [ ] **Step 6: Show building inventory in inspector**

In `InspectorPanel.tsx`, under building state, add:

```tsx
{building.inventory && Object.values(building.inventory).some(v => (v ?? 0) > 0.05) && (
  <tr>
    <td>현장 재고</td>
    <td>
      {Object.entries(building.inventory)
        .filter(([, amt]) => (amt ?? 0) > 0.05)
        .map(([res, amt]) => `${RESOURCE_NAMES[res as ResourceId]} ${(amt ?? 0).toFixed(1)}`)
        .join(', ')}
    </td>
  </tr>
)}
```

- [ ] **Step 7: Migrate saves**

In `saveLoad.ts`, after buildings are validated:

```ts
for (const building of parsed.buildings ?? []) {
  if (!building.inventory) building.inventory = {};
}
```

- [ ] **Step 8: Verify**

Run:

```powershell
node tools\game\test_building_inventory_logistics.mjs
npm run build
```

Expected: test and build pass.

## Task 3: Court Tribute Reserve And Partial Payment

**Files:**

- Create: `src/game/tributeReserve.ts`
- Modify: `src/game/types.ts`
- Modify: `src/game/config.ts`
- Modify: `src/game/courtTribute.ts`
- Modify: `src/game/saveLoad.ts`
- Modify: `src/components/InspectorPanel.tsx`
- Test: `tools/game/test_court_tribute.mjs`

- [ ] **Step 1: Write failing tribute reserve tests**

Add these cases to `tools/game/test_court_tribute.mjs`:

```js
const tributeReserve = await import(pathToFileURL(join(compiledDir, 'tributeReserve.mjs')).href);

{
  const state = simulation.newGame(2026071018);
  state.resources.grain = 40;
  state.courtTribute = { year: 1, items: { grain: 25 }, dueDay: 37, resolved: false, paid: false };

  assert.equal(tributeReserve.setTributeReserve(state, 'grain', 20), null);
  assert.equal(state.resources.grain, 20, 'reserved grain is removed from usable stock');
  assert.equal(state.tributeReserve.grain, 20, 'grain is locked at the center for tribute');

  assert.equal(tributeReserve.setTributeReserve(state, 'grain', 5), null);
  assert.equal(state.resources.grain, 35, 'lowering reserve releases stock back to usable storage');
  assert.equal(state.tributeReserve.grain, 5);
}

{
  const state = simulation.newGame(2026071019);
  state.resources.grain = 25;
  state.courtTribute = { year: 1, items: { grain: 25 }, dueDay: 37, resolved: false, paid: false };
  tributeReserve.setTributeReserve(state, 'grain', 25);
  courtTribute.openCourtTributeChoice(state);
  courtTribute.resolveCourtTribute(state, 'pay-full');

  assert.equal(state.courtTribute.paid, true);
  assert.equal(state.tributePaidStreak, 1);
  assert.equal(state.tributeReserve.grain, 0);
}

{
  const state = simulation.newGame(2026071020);
  state.resources.grain = 15;
  state.resources.reputation = 50;
  state.threat = 20;
  state.tributeFailStreak = 1;
  state.courtTribute = { year: 1, items: { grain: 25 }, dueDay: 37, resolved: false, paid: false };
  tributeReserve.setTributeReserve(state, 'grain', 15);
  courtTribute.openCourtTributeChoice(state);
  courtTribute.resolveCourtTribute(state, 'pay-partial');

  assert.equal(state.courtTribute.paid, false, 'partial tribute is not a full paid year');
  assert.equal(state.tributePaidStreak, 0, 'partial tribute does not advance promotion payment streak');
  assert.equal(state.tributeFailStreak, 0, 'paying at least half prevents consecutive nonpayment');
  assert.ok(state.resources.reputation < 50, 'partial tribute still has a reputation cost');
  assert.ok(state.threat > 20, 'partial tribute still raises threat, but less than total refusal');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tools\game\test_court_tribute.mjs
```

Expected: fail because `tributeReserve.ts`, `state.tributeReserve`, and partial payment options do not exist.

- [ ] **Step 3: Add state and config**

In `GameState`, add:

```ts
tributeReserve: Partial<Record<ResourceId, number>>;
```

In `newGame`, initialize:

```ts
tributeReserve: {},
```

In `CONFIG.tribute`, add:

```ts
partialFailStreakAvoidRatio: 0.5,
partialSuspicionDecayMult: 0.5,
```

In `saveLoad.ts`, initialize missing saves:

```ts
if (!parsed.tributeReserve) parsed.tributeReserve = {};
for (const [res, amount] of Object.entries(parsed.tributeReserve)) {
  parsed.tributeReserve[res] = Math.max(0, Number(amount) || 0);
}
```

- [ ] **Step 4: Add tribute reserve helpers**

Create `src/game/tributeReserve.ts`:

```ts
import type { CourtTribute, GameState, ResourceId } from './types';

export function tributeRequirement(tribute: CourtTribute | null, resource: ResourceId): number {
  return tribute?.items[resource] ?? 0;
}

export function tributeReserved(state: GameState, resource: ResourceId): number {
  return state.tributeReserve?.[resource] ?? 0;
}

export function tributeReserveRatio(state: GameState, tribute: CourtTribute): number {
  let required = 0;
  let prepared = 0;
  for (const [res, amount] of Object.entries(tribute.items) as [ResourceId, number][]) {
    required += amount;
    prepared += Math.min(amount, tributeReserved(state, res));
  }
  return required > 0 ? Math.min(1, prepared / required) : 1;
}

export function setTributeReserve(state: GameState, resource: ResourceId, requestedAmount: number): string | null {
  const required = tributeRequirement(state.courtTribute, resource);
  if (required <= 0) return '올해 세공 품목이 아닙니다.';
  if (!state.tributeReserve) state.tributeReserve = {};
  const current = tributeReserved(state, resource);
  const target = Math.max(0, Math.min(required, Math.floor(requestedAmount)));
  if (target > current) {
    const move = Math.min(target - current, state.resources[resource] ?? 0);
    state.resources[resource] = Math.max(0, (state.resources[resource] ?? 0) - move);
    state.tributeReserve[resource] = current + move;
    return move === target - current ? null : '사용 가능한 재고만큼만 세공고에 옮겼습니다.';
  }
  const release = current - target;
  state.resources[resource] = (state.resources[resource] ?? 0) + release;
  state.tributeReserve[resource] = target;
  return null;
}

export function consumeTributeReserve(state: GameState, tribute: CourtTribute, ratioLimit = 1): number {
  let required = 0;
  let delivered = 0;
  for (const [res, amount] of Object.entries(tribute.items) as [ResourceId, number][]) {
    required += amount;
    const cap = amount * ratioLimit;
    const used = Math.min(cap, tributeReserved(state, res));
    state.tributeReserve[res] = Math.max(0, tributeReserved(state, res) - used);
    delivered += used;
  }
  return required > 0 ? Math.min(1, delivered / required) : 1;
}
```

- [ ] **Step 5: Change court tribute modal**

In `openCourtTributeChoice`, calculate reserve status instead of checking only `state.resources`.

Options:

```ts
{
  id: 'pay-full',
  label: '세공을 모두 바친다',
  disabled: tributeReserveRatio(state, tribute) < 1,
}
{
  id: 'pay-partial',
  label: '준비한 만큼 바친다',
  disabled: tributeReserveRatio(state, tribute) <= 0,
}
{
  id: 'refuse',
  label: '올해는 바치지 못한다',
}
```

Keep `pay` as a compatibility alias for old tests:

```ts
if (optionId === 'pay') optionId = 'pay-full';
```

- [ ] **Step 6: Implement full and partial resolution**

In `resolveCourtTribute`:

```ts
if (optionId === 'pay-full' && tributeReserveRatio(state, tribute) >= 1) {
  consumeTributeReserve(state, tribute);
  tribute.paid = true;
  state.tributeFailStreak = 0;
  state.tributePaidStreak += 1;
  state.resources.reputation = Math.min(100, state.resources.reputation + t.repPaid);
  lowerSuspicion(state, CONFIG.suspicion.tributeDecay);
  addLog(state, '세공을 온전히 바쳤습니다. 조정이 개척지의 공을 기억할 것입니다.', 'good');
  return;
}

if (optionId === 'pay-partial') {
  const ratio = consumeTributeReserve(state, tribute);
  tribute.paid = false;
  state.tributePaidStreak = 0;
  if (ratio >= t.partialFailStreakAvoidRatio) state.tributeFailStreak = 0;
  else state.tributeFailStreak += 1;
  const missing = 1 - ratio;
  const repLoss = Math.round((t.repFail + (state.tributeFailStreak >= 2 ? t.repFailStreakExtra : 0)) * missing);
  const threatGain = Math.round(t.threatFail * missing);
  state.resources.reputation = Math.max(0, state.resources.reputation - repLoss);
  state.threat = Math.min(100, state.threat + threatGain);
  lowerSuspicion(state, CONFIG.suspicion.tributeDecay * ratio * t.partialSuspicionDecayMult);
  addLog(state, `준비한 만큼 세공을 바쳤습니다. 납부율 ${(ratio * 100).toFixed(0)}%. 조정의 불만은 줄었지만 성실 납부로 인정되지는 않습니다.`, 'bad');
  return;
}
```

Refusal keeps the current full failure behavior.

- [ ] **Step 7: Add CourtTab reserve controls**

In `InspectorPanel.tsx` court tribute section, show for each demanded item:

- required amount
- center tribute reserve amount
- usable settlement stock amount
- `-5`, `-1`, input, `+1`, `+5` controls calling `onSetTributeReserve(res, amount)`

Wire through `App.tsx`:

```ts
setTributeReserve: (resource: ResourceId, amount: number) =>
  setState(s => mutate(s, state => setTributeReserve(state, resource, amount)))
```

- [ ] **Step 8: Verify**

Run:

```powershell
node tools\game\test_court_tribute.mjs
npm run build
```

Expected: pass.

## Task 4: Balanced Category Consumption

**Files:**

- Create: `src/game/consumption.ts`
- Modify: `src/game/resources.ts`
- Modify: `src/game/residents.ts`
- Modify: `src/game/simulation.ts`
- Create: `src/components/ResourceBreakdownPopover.tsx`
- Modify: `src/components/TopBar.tsx`
- Modify: `src/components/AlertsPanel.tsx`
- Modify: `src/styles/global.css`
- Test: `tools/game/test_resource_category_consumption.mjs`

- [ ] **Step 1: Extend failing test**

Add these cases to `test_resource_category_consumption.mjs`:

```js
const consumption = await import(pathToFileURL(join(compiledDir, 'consumption.mjs')).href);

{
  const state = simulation.newGame(2026071004);
  for (const id of Object.keys(state.resources)) state.resources[id] = 0;
  state.resources.grain = 20;
  state.resources.rice = 10;
  state.resources.meat = 10;
  state.resources.fish = 10;
  state.resources.vegetables = 10;
  const result = consumption.consumeFoodByDiet(state, 5);
  assert.equal(result.totalConsumed, 5);
  assert.ok(result.byResource.grain > result.byResource.meat, 'grain has 2 weight in the 2:1:1:1 diet');
  assert.equal(consumption.foodTotal(state), 45, 'unmilled rice is excluded from edible food');
}

{
  const state = simulation.newGame(2026071005);
  for (const id of Object.keys(state.resources)) state.resources[id] = 0;
  state.resources.grain = 30;
  const result = consumption.consumeFoodByDiet(state, 5);
  assert.equal(result.varietyScore < 1, true, 'single-food diet has variety penalty');
  assert.equal(result.totalConsumed, 5);
}

{
  const state = simulation.newGame(2026071006);
  state.resources.brushwood = 10;
  state.resources.firewood = 10;
  state.resources.charcoal = 10;
  assert.equal(consumption.fuelHeatTotal(state), 31);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tools\game\test_resource_category_consumption.mjs
```

Expected: fail because `consumption.ts` does not exist.

- [ ] **Step 3: Implement category totals and weighted consumption**

Create `src/game/consumption.ts`:

```ts
import { CLOTHING_RESOURCES, FOOD_RESOURCES, FUEL_RESOURCES, RESOURCE_DEFS } from './resourceCatalog';
import type { GameState, ResourceId } from './types';

export interface ConsumptionResult {
  totalConsumed: number;
  byResource: Partial<Record<ResourceId, number>>;
  shortageRatio: number;
  varietyScore: number;
}

export function foodTotal(state: GameState): number {
  return FOOD_RESOURCES.reduce((sum, id) => sum + (state.resources[id] ?? 0), 0);
}

export function fuelHeatTotal(state: GameState): number {
  return FUEL_RESOURCES.reduce((sum, id) => sum + (state.resources[id] ?? 0) * (RESOURCE_DEFS[id].fuelValue ?? 0), 0);
}

export function clothingCoverageTotal(state: GameState): number {
  return CLOTHING_RESOURCES.reduce((sum, id) => sum + (state.resources[id] ?? 0) * (RESOURCE_DEFS[id].clothingValue ?? 0), 0);
}

export function consumeFoodByDiet(state: GameState, amount: number): ConsumptionResult {
  const byResource: Partial<Record<ResourceId, number>> = {};
  let remaining = Math.max(0, amount);
  const totalWeight = FOOD_RESOURCES.reduce((sum, id) => sum + (RESOURCE_DEFS[id].foodWeight ?? 1), 0);

  for (const id of FOOD_RESOURCES) {
    const desired = amount * ((RESOURCE_DEFS[id].foodWeight ?? 1) / totalWeight);
    const taken = Math.min(state.resources[id] ?? 0, desired);
    state.resources[id] = Math.max(0, (state.resources[id] ?? 0) - taken);
    byResource[id] = taken;
    remaining -= taken;
  }

  if (remaining > 0) {
    for (const id of FOOD_RESOURCES) {
      if (remaining <= 0) break;
      const taken = Math.min(state.resources[id] ?? 0, remaining);
      state.resources[id] = Math.max(0, (state.resources[id] ?? 0) - taken);
      byResource[id] = (byResource[id] ?? 0) + taken;
      remaining -= taken;
    }
  }

  const totalConsumed = amount - remaining;
  const presentTypes = FOOD_RESOURCES.filter(id => (byResource[id] ?? 0) > 0.001).length;
  return {
    totalConsumed,
    byResource,
    shortageRatio: amount > 0 ? totalConsumed / amount : 1,
    varietyScore: presentTypes / FOOD_RESOURCES.length,
  };
}

export function consumeFuelHeat(state: GameState, heatNeed: number): number {
  let remaining = Math.max(0, heatNeed);
  let heatProvided = 0;
  for (const id of ['brushwood', 'firewood', 'charcoal'] as const) {
    if (remaining <= 0) break;
    const value = RESOURCE_DEFS[id].fuelValue ?? 1;
    const units = Math.min(state.resources[id] ?? 0, remaining / value);
    state.resources[id] = Math.max(0, (state.resources[id] ?? 0) - units);
    remaining -= units * value;
    heatProvided += units * value;
  }
  return heatProvided;
}
```

- [ ] **Step 4: Wire simulation effects**

In `simulation.ts`:

- Replace `edibleFoodTotal` with `foodTotal`.
- Replace `consumeEdibleFood` with `consumeFoodByDiet`.
- Replace direct `firewood` consumption with `consumeFuelHeat`.
- Replace direct `clothes` coverage with `clothingCoverageTotal`.
- Pass `dietVarietyScore` into `updateResidentNeeds`.

In `residents.ts`, update signature:

```ts
export function updateResidentNeeds(
  state: GameState,
  rng: () => number,
  fedRatio: number,
  firewoodRatio: number,
  clothesCoverage: number,
  dietVarietyScore: number,
): void
```

Apply effects:

```ts
if (dietVarietyScore < 0.5 && r.hunger > 25) {
  r.health = Math.max(0, r.health - CONFIG.health.poorDietDamage);
}
```

In `updateMorale`, add a `dietVarietyScore` parameter and subtract `CONFIG.needs.monotonyMoralePenalty` when below `0.5`.

- [ ] **Step 5: Add hover/pinned resource breakdown UI**

Create `src/components/ResourceBreakdownPopover.tsx`:

```tsx
import type { ResourceId } from '../game/types';

export interface ResourceBreakdownItem {
  id: ResourceId;
  label: string;
  amount: number;
  note?: string;
}

interface Props {
  title: string;
  items: ResourceBreakdownItem[];
  pinned: boolean;
  onTogglePinned: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function ResourceBreakdownPopover({
  title, items, pinned, onTogglePinned, onMouseEnter, onMouseLeave,
}: Props) {
  return (
    <div
      className="resource-breakdown-popover"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="resource-breakdown-head">
        <strong>{title}</strong>
        <button
          className={`icon-btn${pinned ? ' active' : ''}`}
          type="button"
          title={pinned ? '목록 고정 해제' : '목록 고정'}
          onClick={onTogglePinned}
        >
          📌
        </button>
      </div>
      {items.map(item => (
        <div key={item.id} className="resource-breakdown-row">
          <span>{item.label}</span>
          <span>{Math.floor(item.amount)}</span>
          {item.note && <small>{item.note}</small>}
        </div>
      ))}
    </div>
  );
}
```

In `TopBar.tsx`, do not render every subresource as a permanent top-bar item. Show these aggregate entries by default:

- `식량`: total from `foodTotal`, breakdown `grain`, `meat`, `fish`, `vegetables`.
- `땔감`: heat total from `fuelHeatTotal`, breakdown `brushwood`, `firewood`, `charcoal`.
- `옷`: coverage total from `clothingCoverageTotal`, breakdown `hideClothes`, `cottonClothes`.
- `사치품`: unit total from `LUXURY_RESOURCES`, breakdown `porcelain`, `brassware`, `lacquerware`, `silk`, `preciousMetal`.

Show essential non-subcategory resources as normal compact entries: `rice`, `wood`, `stone`, `iron`, `tools`, `hide`, `cotton`, `herbs`, `gunpowder`, `spears`, `hornBows`, `muskets`, `reputation`, `defense`.

Add local UI state:

```tsx
type ResourceGroupId = 'food' | 'fuel' | 'clothing' | 'luxury';

const [hoveredGroup, setHoveredGroup] = useState<ResourceGroupId | null>(null);
const [pinnedGroups, setPinnedGroups] = useState<Partial<Record<ResourceGroupId, boolean>>>({});

const togglePinnedGroup = (id: ResourceGroupId) => {
  setPinnedGroups(prev => ({ ...prev, [id]: !prev[id] }));
};

const isGroupOpen = (id: ResourceGroupId) => hoveredGroup === id || !!pinnedGroups[id];
```

For each aggregate entry, render the popover when `isGroupOpen(id)` is true. Hovering opens the breakdown; clicking the pin button keeps it open after the mouse leaves. Pinned lists must render below or over the top bar without changing top-bar row height.

Add CSS in `src/styles/global.css`:

```css
.res-item.grouped {
  position: relative;
}

.resource-breakdown-popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 20;
  min-width: 180px;
  padding: 6px;
  border: 1px solid #39434e;
  border-radius: 6px;
  background: #171c22;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.35);
}

.resource-breakdown-head,
.resource-breakdown-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.resource-breakdown-head .icon-btn {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #39434e;
  border-radius: 4px;
  background: #20262d;
  color: #d8dee5;
  cursor: pointer;
}

.resource-breakdown-head .icon-btn.active {
  border-color: #d9a441;
  color: #d9a441;
}

.resource-breakdown-row small {
  color: #9aa5ad;
}
```

The acceptance check is visual and build-based: on desktop width, top bar shows only aggregate labels for subcategories; hover reveals subitems; pin keeps the list visible; no top-bar text wraps over adjacent controls.

- [ ] **Step 6: Verify**

Run:

```powershell
node tools\game\test_resource_category_consumption.mjs
npm run build
```

Expected: pass.

## Task 5: Fuel Chain

**Files:**

- Modify: `src/game/types.ts`
- Modify: `src/game/buildings.ts`
- Modify: `src/game/constants.ts`
- Modify: `src/game/config.ts`
- Modify: `src/game/agents.ts`
- Modify: `src/game/workerSlots.ts`
- Test: `tools/game/test_fuel_and_clothing_chains.mjs`

- [ ] **Step 1: Write failing fuel tests**

Add these cases to `test_fuel_and_clothing_chains.mjs`:

```js
{
  const state = simulation.newGame(2026071007);
  for (const id of Object.keys(state.resources)) state.resources[id] = 0;
  const lumberCamp = addBuilt(state, 'lumberCamp', 8, 8);
  const woodcutter = workerAt(state, 'woodcutter', 8, 8);
  workerSlots.assignResidentToBuilding(state, woodcutter.id, lumberCamp.id);
  runTicks(state, 12);
  assert.ok((lumberCamp.inventory?.wood ?? 0) > 0, 'woodcutter stores wood at lumber camp');
  assert.ok((lumberCamp.inventory?.brushwood ?? 0) > 0, 'woodcutter also creates low-efficiency brushwood');
}

{
  const state = simulation.newGame(2026071008);
  state.resources.wood = 20;
  state.resources.firewood = 0;
  const shed = addBuilt(state, 'woodShed', 9, 9);
  const splitter = workerAt(state, 'woodSplitter', 9, 9);
  workerSlots.assignResidentToBuilding(state, splitter.id, shed.id);
  runTicks(state, 8);
  assert.ok(state.resources.firewood > 0, 'wood splitter converts wood to firewood');
}

{
  const state = simulation.newGame(2026071009);
  state.rank = 'jin';
  state.resources.wood = 20;
  state.resources.charcoal = 0;
  const kiln = addBuilt(state, 'charcoalKiln', 10, 10);
  const burner = workerAt(state, 'charcoalBurner', 10, 10);
  workerSlots.assignResidentToBuilding(state, burner.id, kiln.id);
  runTicks(state, 8);
  assert.ok(state.resources.charcoal > 0, 'charcoal kiln makes charcoal, not generic firewood');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tools\game\test_fuel_and_clothing_chains.mjs
```

Expected: fail because `woodShed`, `woodSplitter`, and `charcoal` output do not exist.

- [ ] **Step 3: Add wood shed and job**

In `types.ts`, add:

```ts
| 'woodSplitter'
```

to `JobId`, and:

```ts
| 'woodShed'
```

to `BuildingTypeId`.

In `constants.ts`:

```ts
woodSplitter: '장작꾼'
```

In `buildings.ts`:

```ts
woodShed: {
  id: 'woodShed', name: '장작마당', emoji: '🪓',
  desc: '목재를 장작으로 패는 작업장. 장작꾼이 겨울 연료를 안정적으로 준비한다.',
  cost: { wood: 8, stone: 2, tools: 1 }, buildDays: 5, slots: 2, capacity: 0, defense: 0,
  winterBonus: false, placement: 'land', unique: false,
}
```

In `workerSlots.ts`:

```ts
woodShed: { job: 'woodSplitter', slots: 2 }
```

- [ ] **Step 4: Change outputs**

In `woodcutterTick`, each successful chop adds both:

```ts
addCarry(r, 'wood', woodAmount);
addCarry(r, 'brushwood', woodAmount * CONFIG.production.brushwoodPerWood);
```

and deposits to lumber camp inventory.

Add `woodSplitterTick`:

```ts
const wood = Math.min(processableAmount(state, 'wood'), (p.firewoodWoodPerDay / 5) * effOf(r) * ctx.mMod);
state.resources.wood -= wood;
state.resources.firewood += wood * p.firewoodPerWood;
```

Change `charcoalBurnerTick` to:

```ts
state.resources.charcoal += wood * p.charcoalPerWood;
```

not `state.resources.firewood`.

- [ ] **Step 5: Verify**

Run:

```powershell
node tools\game\test_fuel_and_clothing_chains.mjs
npm run build
```

Expected: pass.

## Task 6: Hunting, Fish, Vegetables, Cotton, And Clothing

**Files:**

- Modify: `src/game/types.ts`
- Modify: `src/game/crops.ts`
- Modify: `src/game/buildings.ts`
- Modify: `src/game/constants.ts`
- Modify: `src/game/config.ts`
- Modify: `src/game/agents.ts`
- Modify: `src/game/processing.ts`
- Modify: `src/game/saveLoad.ts`
- Modify: `src/game/workerSlots.ts`
- Modify: `src/components/ProcessingPanel.tsx`
- Test: `tools/game/test_fuel_and_clothing_chains.mjs`
- Test: `tools/game/test_crop_paddy_milling.mjs`

- [ ] **Step 1: Extend failing chain tests**

Add cases:

```js
{
  const state = simulation.newGame(2026071010);
  for (const id of Object.keys(state.resources)) state.resources[id] = 0;
  const lodge = addBuilt(state, 'huntLodge', 8, 8);
  const hunter = workerAt(state, 'hunter', 8, 8);
  workerSlots.assignResidentToBuilding(state, hunter.id, lodge.id);
  runTicks(state, 24);
  assert.equal(state.resources.game ?? 0, 0, 'game is no longer a settlement resource');
  assert.ok((lodge.inventory?.meat ?? 0) > 0 || (lodge.inventory?.hide ?? 0) > 0, 'hunter butchers game into meat and hide before hauling');
}

{
  const state = simulation.newGame(2026071011);
  state.resources.hide = 10;
  state.resources.hideClothes = 0;
  const tannery = addBuilt(state, 'tannery', 9, 9);
  const tanner = workerAt(state, 'tanner', 9, 9);
  workerSlots.assignResidentToBuilding(state, tanner.id, tannery.id);
  runTicks(state, 8);
  assert.ok(state.resources.hideClothes > 0, 'tannery makes hide clothes');
}

{
  const state = simulation.newGame(2026071012);
  state.resources.cotton = 10;
  state.resources.cottonClothes = 0;
  const weaving = addBuilt(state, 'weavingHouse', 9, 9);
  const weaver = workerAt(state, 'weaver', 9, 9);
  workerSlots.assignResidentToBuilding(state, weaver.id, weaving.id);
  runTicks(state, 8);
  assert.ok(state.resources.cottonClothes > 0, 'weaver makes cotton clothes');
}
```

Update `tools/game/test_crop_paddy_milling.mjs` so the paddy and watermill contract is explicit:

```js
{
  assert.equal(crops.CROP_DEFS.millet.output, 'grain', 'field cereals harvest as edible grain');
  assert.equal(crops.CROP_DEFS.rice.output, 'rice', 'paddies harvest unmilled rice');
}

{
  const state = prepareState();
  state.day = 25;
  const paddy = addBuilt(state, 'paddy', 9, 9, { cropId: 'rice', fieldGrowth: 100, inventory: {} });
  const farmer = workableResident(state, 0, 'farmer', 9, 9);
  workerSlots.assignResidentToBuilding(state, farmer.id, paddy.id);
  runTicks(state, 1);
  assert.ok((paddy.inventory?.rice ?? 0) > 0, 'paddy harvest stays as unmilled rice at the production site');
  assert.equal(paddy.inventory?.grain ?? 0, 0, 'paddy does not produce edible grain directly');
}

{
  const state = prepareState();
  const mill = addBuilt(state, 'watermill', 12, 12);
  const miller = workableResident(state, 0, 'miller', 11, 12);
  state.resources.rice = 10;
  state.resources.grain = 0;
  state.processingReserves.rice = 0;
  workerSlots.assignResidentToBuilding(state, miller.id, mill.id);
  runTicks(state, 1);
  const milled = CONFIG.production.millerRicePerDay / 5;
  assert.ok(Math.abs(state.resources.rice - (10 - milled)) < 0.001, 'watermill consumes only unmilled rice');
  assert.ok(Math.abs(state.resources.grain - (milled * CONFIG.production.grainPerRice)) < 0.001, 'watermill produces edible grain');
}

{
  const state = prepareState();
  const mill = addBuilt(state, 'watermill', 12, 12);
  const miller = workableResident(state, 0, 'miller', 11, 12);
  state.resources.rice = 0;
  state.resources.grain = 10;
  workerSlots.assignResidentToBuilding(state, miller.id, mill.id);
  runTicks(state, 1);
  assert.equal(state.resources.grain, 10, 'watermill never consumes field grain');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tools\game\test_fuel_and_clothing_chains.mjs
node tools\game\test_crop_paddy_milling.mjs
```

Expected: fail because paddy rice still goes straight to `grain`, the mill still consumes `grain`, hunter still produces `game`, tannery makes generic clothes, and weaving does not exist.

- [ ] **Step 3: Add crops**

In `CropId`, add:

```ts
| 'vegetables'
| 'cotton'
```

In `crops.ts`:

```ts
vegetables: {
  id: 'vegetables',
  name: '채소',
  desc: '여름과 가을 식단을 보완하는 밭 작물입니다.',
  buildingTypes: ['field'],
  plantSeasons: ['spring', 'summer'],
  growSeasons: ['spring', 'summer', 'autumn'],
  harvestSeasons: ['summer', 'autumn'],
  output: 'vegetables',
  yield: CONFIG.production.fieldGrainYield * 0.45,
  survivesWinter: false,
},
cotton: {
  id: 'cotton',
  name: '목화',
  desc: '무명옷 재료. 식량은 아니지만 겨울 대비에 중요합니다.',
  buildingTypes: ['field'],
  plantSeasons: ['spring'],
  growSeasons: ['spring', 'summer'],
  harvestSeasons: ['autumn'],
  output: 'cotton',
  yield: CONFIG.production.fieldGrainYield * 0.35,
  survivesWinter: false,
},
```

Change the existing `rice` crop definition to output unmilled rice:

```ts
rice: {
  // existing seasons, building type, and yield stay unchanged
  output: 'rice',
}
```

All field cereals (`millet`, `sorghum`, `buckwheat`, and `barley`) continue to output edible `grain`.

- [ ] **Step 4: Make the watermill rice-only**

In `types.ts`, remove obsolete milling inputs and make rice the only food-processing reserve:

```ts
export type ProcessingInputId = 'wood' | 'rice' | 'hide' | 'iron';
```

In `processing.ts` and `ProcessingPanel.tsx`, replace the `grain` and removed `game` entries with `rice`. Existing save values for `processingReserves.grain` and `processingReserves.game` are legacy controls and must be discarded; initialize `processingReserves.rice` to `0` rather than transferring those amounts.

Rename the production settings:

```ts
millerRicePerDay: 4,
grainPerRice: 1.5,
```

Change `millerTick` to consume only settlement-stock rice and produce edible grain:

```ts
const rice = Math.min(
  processableAmount(state, 'rice'),
  (p.millerRicePerDay / 5) * effOf(r) * ctx.mMod,
);
state.resources.rice -= rice;
state.resources.grain += rice * p.grainPerRice;
```

Raw `rice` is excluded from `foodTotal` and `consumeFoodByDiet`, cannot satisfy grain tribute, and must reach settlement stock through a hauler before the watermill can process it.

- [ ] **Step 5: Change hunter responsibility**

Remove normal `game` output. In `hunterTick`, successful hunt should add:

```ts
addCarry(r, 'meat', gameAmount * CONFIG.production.meatPerGame);
addCarry(r, 'hide', gameAmount * CONFIG.production.hidePerGame);
```

Deposit to hunt lodge inventory.

- [ ] **Step 6: Add weaving house and weaver**

In `types.ts`, add `weaver` job and `weavingHouse` building.

In `buildings.ts`:

```ts
weavingHouse: {
  id: 'weavingHouse', name: '베틀집', emoji: '🧶',
  desc: '목화를 무명옷으로 짜는 작업장.',
  cost: { wood: 14, tools: 2 }, buildDays: 8, slots: 2, capacity: 0, defense: 0,
  winterBonus: false, placement: 'land', unique: false, minRank: 'bo',
}
```

In `agents.ts`, add `weaverTick`:

```ts
const cotton = Math.min(processableAmount(state, 'cotton'), (p.weaverCottonPerDay / 5) * effOf(r) * ctx.mMod);
state.resources.cotton -= cotton;
state.resources.cottonClothes += cotton * p.cottonClothesPerCotton;
```

Change `tannerTick` to output `hideClothes`.

- [ ] **Step 7: Verify**

Run:

```powershell
node tools\game\test_fuel_and_clothing_chains.mjs
node tools\game\test_crop_paddy_milling.mjs
npm run build
```

Expected: pass.

## Task 7: Luxury Goods And Morale Use

**Files:**

- Modify: `src/game/petition.ts`
- Modify: `src/game/events.ts`
- Modify: `src/game/simulation.ts`
- Modify: `src/components/InspectorPanel.tsx`
- Test: `tools/game/test_petition.mjs`
- Test: `tools/game/test_resource_category_consumption.mjs`

- [ ] **Step 1: Write failing luxury tests**

Add to `test_petition.mjs`:

```js
{
  const state = simulation.newGame(2026071013);
  state.rank = 'jin';
  state.resources.reputation = 80;
  petition.requestPetition(state);
  petition.resolvePetition(state, 'silk');
  assert.ok(state.resources.silk > 0, 'petition grants silk as a stored luxury resource');
  assert.ok(state.residents.every(r => r.morale <= 60), 'granting silk does not auto-consume it for morale');
}

{
  const state = simulation.newGame(2026071014);
  state.resources.silk = 1;
  const before = state.residents[0].morale;
  simulation.useLuxuryGood(state, 'silk');
  assert.equal(state.resources.silk, 0);
  assert.ok(state.residents[0].morale > before, 'using luxury goods raises morale');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tools\game\test_petition.mjs
```

Expected: fail because luxury petition is currently instant morale and `useLuxuryGood` does not exist.

- [ ] **Step 3: Add luxury petition offers**

Replace the current single `luxury` morale offer with separate stored goods:

```ts
{ id: 'porcelain', minRank: 'jin', repMin: 45, repCost: 6, label: '자기를 청한다', desc: '자기 2. 교역과 사기 진작에 쓸 수 있다.', gives: { porcelain: 2 } },
{ id: 'brassware', minRank: 'jin', repMin: 45, repCost: 6, label: '유기를 청한다', desc: '유기 2. 교역과 사기 진작에 쓸 수 있다.', gives: { brassware: 2 } },
{ id: 'lacquerware', minRank: 'jin', repMin: 45, repCost: 6, label: '칠기를 청한다', desc: '칠기 2. 교역과 사기 진작에 쓸 수 있다.', gives: { lacquerware: 2 } },
{ id: 'silk', minRank: 'jin', repMin: 50, repCost: 8, label: '비단을 청한다', desc: '비단 2. 고가 교역품이자 사치품이다.', gives: { silk: 2 } },
{ id: 'preciousMetal', minRank: 'bu', repMin: 65, repCost: 12, label: '귀금속을 청한다', desc: '귀금속 1. 매우 높은 가치의 사치품이다.', gives: { preciousMetal: 1 } },
```

- [ ] **Step 4: Add luxury use action**

In `simulation.ts`, export:

```ts
export function useLuxuryGood(state: GameState, resource: ResourceId): string | null {
  if (!LUXURY_RESOURCES.includes(resource as typeof LUXURY_RESOURCES[number])) return '사치품이 아닙니다.';
  if ((state.resources[resource] ?? 0) < 1) return '사치품이 부족합니다.';
  state.resources[resource] -= 1;
  const morale = CONFIG.petition.luxuryMorale;
  for (const r of livingResidents(state)) {
    if (r.alive) r.morale = Math.min(100, r.morale + morale);
  }
  addLog(state, `${RESOURCE_NAMES[resource]}을(를) 나누어 주민들의 사기를 북돋았습니다.`, 'good');
  return null;
}
```

Expose this in `App.tsx` and `InspectorPanel.tsx` under court or resources.

- [ ] **Step 5: Verify**

Run:

```powershell
node tools\game\test_petition.mjs
npm run build
```

Expected: pass.

## Task 8: Value-Based Trade

**Files:**

- Create: `src/game/tradeValues.ts`
- Modify: `src/game/constants.ts`
- Modify: `src/game/events.ts`
- Modify: `src/game/types.ts`
- Modify: `src/components/InspectorPanel.tsx`
- Modify: `src/components/ActionPopup.tsx`
- Test: `tools/game/test_trade_values.mjs`
- Test: `tools/game/test_trades.mjs`

- [ ] **Step 1: Write failing trade value tests**

Create `tools/game/test_trade_values.mjs`:

```js
import assert from 'node:assert/strict';
// compile helper same as other tools/game tests

const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const tradeValues = await import(pathToFileURL(join(compiledDir, 'tradeValues.mjs')).href);
const { FACTIONS } = await import(pathToFileURL(join(compiledDir, 'constants.mjs')).href);

{
  const state = simulation.newGame(2026071015);
  const faction = FACTIONS.find(f => f.trades.length > 0).name;
  state.relations[faction] = 80;
  const quote = tradeValues.quoteTrade(state, faction, { give: 'grain', giveAmt: 10, get: 'hide' });
  assert.equal(quote.ok, true);
  assert.ok(quote.getAmt > 0);
  assert.equal(quote.margin, 1, 'good relation allows equal-value trade');
}

{
  const state = simulation.newGame(2026071016);
  const faction = FACTIONS.find(f => f.trades.length > 0).name;
  state.relations[faction] = 36;
  const quote = tradeValues.quoteTrade(state, faction, { give: 'grain', giveAmt: 10, get: 'hide' });
  assert.equal(quote.ok, true);
  assert.ok(quote.margin > 1, 'bad relation demands extra value');
}

{
  const state = simulation.newGame(2026071017);
  const faction = FACTIONS.find(f => f.trades.length > 0).name;
  state.resources.grain = 10;
  const quote = tradeValues.quoteTrade(state, faction, { give: 'grain', giveAmt: 10, get: 'hide' });
  tradeValues.applyQuotedTrade(state, quote);
  assert.equal(state.resources.grain, 0);
  assert.ok(state.resources.hide > 0);
}

console.log('trade value tests passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tools\game\test_trade_values.mjs
```

Expected: fail because `tradeValues.ts` does not exist.

- [ ] **Step 3: Add trade profile types**

In `types.ts`:

```ts
export interface TradeRequest {
  give: ResourceId;
  giveAmt: number;
  get: ResourceId;
}

export interface TradeQuote {
  ok: boolean;
  reason?: string;
  faction: string;
  give: ResourceId;
  giveAmt: number;
  get: ResourceId;
  getAmt: number;
  margin: number;
}
```

In `constants.ts`, add to `Faction`:

```ts
tradeValues: Partial<Record<ResourceId, number>>;
exports: ResourceId[];
imports: ResourceId[];
```

Keep `trades` during migration for incoming events, then remove fixed offers after tests are updated.

- [ ] **Step 4: Implement quote math**

Create `src/game/tradeValues.ts`:

```ts
import { FACTIONS, RESOURCE_NAMES } from './constants';
import { RESOURCE_DEFS } from './resourceCatalog';
import { getRelation } from './relations';
import type { GameState, ResourceId, TradeQuote, TradeRequest } from './types';

export function relationMargin(relation: number): number {
  if (relation >= 75) return 1;
  if (relation >= 60) return 1.1;
  if (relation >= 45) return 1.25;
  return 1.5;
}

export function factionValue(factionName: string, resource: ResourceId): number {
  const faction = FACTIONS.find(f => f.name === factionName);
  return faction?.tradeValues?.[resource] ?? RESOURCE_DEFS[resource].tradeBaseValue;
}

export function quoteTrade(state: GameState, factionName: string, request: TradeRequest): TradeQuote {
  const faction = FACTIONS.find(f => f.name === factionName);
  if (!faction) return { ok: false, reason: '세력을 찾을 수 없습니다.', faction: factionName, give: request.give, giveAmt: request.giveAmt, get: request.get, getAmt: 0, margin: 1 };
  if ((state.resources[request.give] ?? 0) < request.giveAmt) {
    return { ok: false, reason: `${RESOURCE_NAMES[request.give]}이(가) 부족합니다`, faction: factionName, give: request.give, giveAmt: request.giveAmt, get: request.get, getAmt: 0, margin: 1 };
  }
  const relation = getRelation(state, factionName);
  const margin = relationMargin(relation);
  const giveValue = request.giveAmt * factionValue(factionName, request.give);
  const getValue = factionValue(factionName, request.get) * margin;
  const getAmt = Math.max(1, Math.floor(giveValue / Math.max(0.01, getValue)));
  return { ok: getAmt > 0, faction: factionName, give: request.give, giveAmt: request.giveAmt, get: request.get, getAmt, margin };
}

export function applyQuotedTrade(state: GameState, quote: TradeQuote): string | null {
  if (!quote.ok) return quote.reason ?? '거래할 수 없습니다.';
  if ((state.resources[quote.give] ?? 0) < quote.giveAmt) return `${RESOURCE_NAMES[quote.give]}이(가) 부족합니다`;
  state.resources[quote.give] -= quote.giveAmt;
  state.resources[quote.get] += quote.getAmt;
  return null;
}
```

- [ ] **Step 5: Replace player-initiated UI**

In `InspectorPanel.tsx`, replace fixed offer list with controls:

- Select give resource from settlement stock excluding `reputation` and `defense`.
- Numeric give amount.
- Select get resource from faction exports.
- Show quote result and relation margin.
- Submit calls `requestTrade(state, factionName, request)`.

In `events.ts`, change `requestTrade` to accept `TradeRequest`, store `TradeQuote` in pending choice, and `resolveInitiatedTrade` to apply quote.

- [ ] **Step 6: Keep incoming trade simple**

For randomly arriving merchants, either:

- use the same quote engine to generate one offer from their preferred imports/exports, or
- leave fixed `trades` for incoming offers until player-initiated trade is stable.

Use the first option after `test_trade_values.mjs` is green; use the second option if UI work is already large.

- [ ] **Step 7: Verify**

Run:

```powershell
node tools\game\test_trade_values.mjs
node tools\game\test_trades.mjs
npm run build
```

Expected: pass.

## Task 9: Integration Sweep And Balance Hooks

**Files:**

- Modify: `src/game/config.ts`
- Modify: `src/game/raidDamage.ts`
- Modify: `src/game/raids.ts`
- Modify: `src/game/promotion.ts`
- Modify: `src/components/AlertsPanel.tsx`
- Modify: `tools/game/test_promotion.mjs`
- Modify: `tools/game/test_suspicion.mjs`
- Modify: `tools/game/test_court_tribute.mjs`

- [ ] **Step 1: Update consumers of old aggregate resources**

Replace old direct checks:

- `state.resources.firewood` -> `fuelHeatTotal(state)` for survival duration alerts.
- `state.resources.clothes` -> `clothingCoverageTotal(state)` for winter coverage.
- `edibleFoodTotal(state)` -> `foodTotal(state)`.
- raid loot targets should include category resources instead of `food/clothes/game`.

- [ ] **Step 2: Update promotion requirements**

Promotion food stock uses `foodTotal(state)`.

Promotion fuel stock uses `fuelHeatTotal(state)`.

Promotion clothing checks should use clothing coverage when added to future rank requirements.

- [ ] **Step 3: Add balance config values**

In `CONFIG.needs`:

```ts
monotonyMoralePenalty: 8,
vegetableShortageHealthPenalty: 1,
```

In `CONFIG.health`:

```ts
poorDietDamage: 1,
```

In `CONFIG.production`:

```ts
brushwoodPerWood: 0.35,
firewoodWoodPerDay: 2.5,
charcoalPerWood: 1.4,
meatPerGame: 4,
weaverCottonPerDay: 2,
cottonClothesPerCotton: 0.5,
```

- [ ] **Step 4: Run full verification**

Run:

```powershell
$failed = @()
Get-ChildItem -Path tools\game -Filter 'test_*.mjs' | Sort-Object Name | ForEach-Object {
  Write-Host "Running $($_.Name)"
  node $_.FullName
  if ($LASTEXITCODE -ne 0) { $failed += $_.Name }
}
if ($failed.Count -gt 0) {
  Write-Error ("Failed: " + ($failed -join ', '))
  exit 1
}
npm run build
```

Expected: every game test passes, then build passes.

## Implementation Notes

- Keep `state.resources` as usable settlement stock. This avoids rewriting every cost, tribute, raid, and promotion consumer at the same time.
- Local inventories only gate production-site output before hauling. Building costs, trade, petition, daily consumption, and raids use settlement stock.
- Court tribute uses `state.tributeReserve`, which is filled only from settlement stock after haulers have brought resources to storage.
- Use save migration aggressively. Old saves must not crash if they contain `food`, `clothes`, `game`, or buildings without `inventory`.
- Avoid introducing per-storehouse inventory in this pass. That can come after hauler behavior feels good.
- UI should show aggregate categories by default and detailed breakdown in tooltips or inspector rows. The top bar cannot carry every resource as a separate always-visible item without becoming noisy.
- Trade values must be deterministic and testable. Do not randomize quotes.

## Self-Review

- Spec coverage: the plan covers production-site storage, hauler hauling, center-locked tribute reserves, partial tribute payment, food/fuel/clothing subcategories, wood-to-fuel chains, cotton clothing, hunter butchering, luxury resources, morale use, and value-based trade.
- Placeholder scan: no task relies on an unspecified file path, command, or unnamed helper. Incoming merchant conversion has two explicit implementation choices with a decision rule.
- Type consistency: resource IDs match the catalog list; new helper names are reused consistently by later tasks.
- Risk: this plan intentionally keeps `state.resources` as settlement stock rather than adding separate per-storehouse inventories. That is the narrowest implementation that satisfies “production buildings store output until haulers bring it to storage” without turning this into a full warehouse simulation rewrite.
