# Selection Actions Implementation Plan

> **계획 상태:** 완료
> **상태 갱신:** 2026-07-29 — 선택 컨텍스트 행동과 탐사 연계를 구현했다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement resident/building selection actions with hover feedback, right-click resident commands, and a compact building action popup.

**Architecture:** Add a pure action classifier in `src/game/selectionActions.ts`, then route UI cursor/tooltip/right-click behavior through that classifier. Add manual resident orders to simulation state so ordered residents can move or repeat allowed work without changing jobs.

**Tech Stack:** React, TypeScript, existing canvas renderer, existing Node `.mjs` game tests.

---

### Task 1: Pure Selection Action Model

**Files:**
- Create: `src/game/selectionActions.ts`
- Test: `tools/game/test_selection_actions.mjs`
- Modify: `src/game/types.ts`

- [ ] **Step 1: Add selection and action types**

Add exported types:

```ts
export type SelectedEntity =
  | { kind: 'tile'; x: number; y: number }
  | { kind: 'resident'; id: number }
  | { kind: 'building'; id: number };

export type PointerAction =
  | { kind: 'none'; cursor: 'default'; label: string }
  | { kind: 'move'; cursor: 'move'; label: string; x: number; y: number }
  | { kind: 'work'; cursor: 'work'; label: string; x: number; y: number; buildingId?: number }
  | { kind: 'building'; cursor: 'pointer'; label: string; buildingId: number }
  | { kind: 'invalid'; cursor: 'not-allowed'; label: string };
```

- [ ] **Step 2: Write failing action classifier tests**

`tools/game/test_selection_actions.mjs` should compile game modules and assert:

```js
assert.equal(getPointerAction(state, { kind: 'resident', id: hauler.id }, rockTile).kind, 'work');
assert.equal(getPointerAction(state, { kind: 'resident', id: farmer.id }, rockTile).kind, 'invalid');
assert.equal(getPointerAction(state, { kind: 'resident', id: farmer.id }, emptyPlain).kind, 'move');
assert.equal(getPointerAction(state, { kind: 'building', id: smithy.id }, smithyTile).kind, 'building');
```

- [ ] **Step 3: Implement `getPointerAction`**

Implement job-target checks using existing terrain, habitat, building, rank, and passability data. The function must not mutate state.

- [ ] **Step 4: Verify**

Run:

```bash
node tools/game/test_selection_actions.mjs
```

Expected: action classifier tests pass.

### Task 2: Manual Resident Orders

**Files:**
- Modify: `src/game/types.ts`
- Modify: `src/game/simulation.ts`
- Modify: `src/game/agents.ts`
- Test: `tools/game/test_manual_orders.mjs`

- [ ] **Step 1: Add manual order state**

Add to `Resident`:

```ts
manualOrder:
  | null
  | { kind: 'move'; x: number; y: number }
  | { kind: 'work'; x: number; y: number; buildingId?: number; repeat: boolean };
```

Initialize it to `null` in resident creation and save-load compatibility.

- [ ] **Step 2: Add order issuing helpers**

In `simulation.ts`, add:

```ts
export function issueResidentMoveOrder(state: GameState, residentId: number, x: number, y: number): string | null;
export function issueResidentWorkOrder(state: GameState, residentId: number, action: Extract<PointerAction, { kind: 'work' }>): string | null;
export function clearResidentManualOrder(state: GameState, residentId: number): void;
```

Each helper validates the current action with `getPointerAction` before mutating the resident.

- [ ] **Step 3: Write failing order tests**

Assert:

```js
issueResidentMoveOrder(state, farmer.id, plain.x, plain.y);
advanceTickUntil(state, () => farmer.x === plain.x && farmer.y === plain.y);

issueResidentWorkOrder(state, hauler.id, quarryAction);
advanceTickUntil(state, () => (hauler.carrying.stone ?? 0) > 0);
advanceTickUntil(state, () => state.resources.stone > startingStone);
assert.equal(hauler.manualOrder?.kind, 'work');
```

- [ ] **Step 4: Implement manual order execution**

At the start of `agentsTick`, before job-specific AI:

- move orders path to target and clear on arrival,
- hauler work orders quarry rock, deposit when carrying, and repeat,
- other work orders move to their target and run the existing job behavior when compatible.

- [ ] **Step 5: Verify**

Run:

```bash
node tools/game/test_manual_orders.mjs
node tools/game/test_agent_loiter_farming.mjs
node tools/game/test_pathfinding_collision.mjs
```

Expected: all commands exit 0.

### Task 3: Canvas Hover Feedback And Right-Click

**Files:**
- Modify: `src/components/GameCanvas.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Thread selected entity and pointer action into `GameCanvas`**

Add props:

```ts
selectedEntity: SelectedEntity | null;
pointerAction: PointerAction;
onContextAction: (x: number, y: number) => void;
```

- [ ] **Step 2: Replace static cursor**

Use `pointerAction.cursor` when not placing buildings:

```ts
style={{ cursor: placingType ? 'crosshair' : panning ? 'grabbing' : pointerAction.cursor }}
```

- [ ] **Step 3: Right-click dispatch**

In `onContextMenu`, prevent default and call `onContextAction(tx, ty)` unless placing mode is active, in which case keep existing placement cancel behavior.

- [ ] **Step 4: Tooltip feedback**

Show `pointerAction.label` near the cursor when it is `move`, `work`, or `invalid`.

- [ ] **Step 5: Verify**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build succeed.

### Task 4: Building Action Popup

**Files:**
- Create: `src/components/ActionPopup.tsx`
- Modify: `src/App.tsx`
- Modify: `src/game/simulation.ts`
- Modify: `src/styles/global.css`
- Test: existing build coverage

- [ ] **Step 1: Add housing upgrade helper**

In `simulation.ts`, add:

```ts
export function upgradeHousingBuilding(state: GameState, buildingId: number, targetType: 'ondol' | 'tileHouse'): string | null;
```

Rules:

- `hut` can upgrade to `ondol`,
- `ondol` can upgrade to `tileHouse`,
- target rank and resource costs use the existing building definition checks,
- the building keeps its id and footprint, changes `type`, spends resources, and resets progress if the target has build time.

- [ ] **Step 2: Add popup component**

Render compact buttons for building actions:

- smithy products,
- market/dock trade factions,
- nitre yard pause/resume,
- housing upgrade actions backed by `upgradeHousingBuilding`.

- [ ] **Step 3: Keep Inspector behavior**

Selecting a building still updates the Inspector tile tab. The popup is a shortcut surface, not a replacement.

- [ ] **Step 4: Wire existing handlers**

Reuse existing handlers:

```ts
onSetSmithyProduct(buildingId, product);
onRequestTrade(factionName);
onToggleNitre();
upgradeHousingBuilding(state, buildingId, targetType);
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build succeed.

### Task 5: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused tests**

```bash
node tools/game/test_selection_actions.mjs
node tools/game/test_manual_orders.mjs
```

- [ ] **Step 2: Run game regression tests**

```powershell
$tests = Get-ChildItem -Path tools/game -Filter 'test_*.mjs' | Sort-Object Name
foreach ($test in $tests) { node $test.FullName; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

- [ ] **Step 3: Run build**

```bash
npm run build
git diff --check
```

Expected: all commands exit 0.
