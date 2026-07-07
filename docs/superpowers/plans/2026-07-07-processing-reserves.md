# Processing Reserves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the player reserve raw resources so automatic processing does not consume tribute or construction stockpiles.

**Architecture:** Add a saved `processingReserves` map to `GameState`, with helpers in a small `src/game/processing.ts` module. Existing processing sites read the same helper before consuming raw resources, and a compact React panel updates the reserve values through `App`.

**Tech Stack:** TypeScript, React, Vite, existing Node `.mjs` game tests.

---

### Task 1: Regression Tests

**Files:**
- Create: `tools/game/test_processing_reserves.mjs`

- [ ] **Step 1: Write the failing test**

Test these behaviors in one focused file:
- new games start with wood reserved at the current `CONFIG.production.woodReserve`
- `setProcessingReserve(state, 'grain', 10)` prevents haulers from milling grain below 10
- `setProcessingReserve(state, 'wood', 40)` prevents haulers from chopping wood below 40
- `setProcessingReserve(state, 'iron', 8)` prevents smiths from using the last 8 iron for tools
- `setProcessingReserve(state, 'hide', 6)` prevents tanneries from using the last 6 hide
- old loaded saves get default processing reserves

- [ ] **Step 2: Run the test to verify RED**

Run: `node tools/game/test_processing_reserves.mjs`
Expected: fail because processing reserve helpers and state do not exist.

### Task 2: State and Helpers

**Files:**
- Modify: `src/game/types.ts`
- Modify: `src/game/config.ts`
- Create: `src/game/processing.ts`
- Modify: `src/game/simulation.ts`
- Modify: `src/game/saveLoad.ts`

- [ ] **Step 1: Add `ProcessingInputId` and `processingReserves`**

Add `export type ProcessingInputId = 'wood' | 'grain' | 'game' | 'hide' | 'iron';` and `processingReserves: Record<ProcessingInputId, number>` to `GameState`.

- [ ] **Step 2: Add defaults**

Add `processingReserves` defaults under `CONFIG.production`, using `{ wood: CONFIG.production.woodReserve, grain: 0, game: 0, hide: 0, iron: 0 }` shape in code.

- [ ] **Step 3: Add helper module**

Create helpers:
- `defaultProcessingReserves()`
- `ensureProcessingReserves(state)`
- `processingReserve(state, resource)`
- `processableAmount(state, resource)`
- `setProcessingReserve(state, resource, amount)`

- [ ] **Step 4: Initialize and migrate**

Call `defaultProcessingReserves()` in `newGame()` and `ensureProcessingReserves(parsed)` in `loadGame()`.

### Task 3: Processing Logic

**Files:**
- Modify: `src/game/agents.ts`
- Modify: `src/game/simulation.ts`

- [ ] **Step 1: Apply reserves to hauler processing**

Use `processableAmount(state, 'game' | 'grain' | 'wood')` when deciding whether there is processing work and how much to consume.

- [ ] **Step 2: Apply reserves to smith processing**

Use `processableAmount(state, 'iron')` for iron and `processableAmount(state, 'wood')` for wood before making tools.

- [ ] **Step 3: Apply reserves to tannery processing**

Use `processableAmount(state, 'hide')` and consume only whole hide pairs above the reserve.

### Task 4: UI Controls

**Files:**
- Create: `src/components/ProcessingPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add panel**

Create a left-side panel with rows for 목재, 곡물, 사냥감, 가죽, 철. Each row shows current stock, reserve value, and small `-5`, `-1`, `+1`, `+5` controls.

- [ ] **Step 2: Wire state updates**

Import `setProcessingReserve` in `App`, pass an update callback to the panel, and call `bump()` after changes.

### Task 5: Verification and Commit

**Files:**
- All changed files

- [ ] **Step 1: Run focused tests**

Run:
- `node tools/game/test_processing_reserves.mjs`
- `node tools/game/test_hauler_priority.mjs`
- `node tools/game/test_promotion.mjs`

- [ ] **Step 2: Run all game tests**

Run all `tools/game/test_*.mjs` tests.

- [ ] **Step 3: Run build**

Run: `npm.cmd run build`

- [ ] **Step 4: Commit**

Commit message: `Add processing reserve controls`
