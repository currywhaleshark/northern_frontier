# Map Forest Regrowth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase long-game wood availability by enlarging the map and making forests recover even after local clear-cutting.

**Architecture:** Keep procedural map generation config-driven, but scale terrain blob counts with map area. Rework daily forest regrowth to use the actual `state.map` dimensions so old 44x44 saves do not crash after the configured map grows to 56x56.

**Tech Stack:** TypeScript game simulation, Vite/React canvas renderer, Node-based game tests.

---

### Task 1: Regression Tests

**Files:**
- Create: `tools/game/test_map_forest_regrowth.mjs`

- [ ] **Step 1: Add failing tests**

Cover:
- `CONFIG.map.width` and `CONFIG.map.height` are `56`.
- `generateMap` returns a 56x56 map with substantial initial forest coverage.
- With `forestPioneerChance = 1`, a map with no forest can regrow forest during a spring day.
- A 44x44 state can still advance after `CONFIG.map` is 56x56.

- [ ] **Step 2: Run the test and verify RED**

Run: `node tools/game/test_map_forest_regrowth.mjs`

Expected before implementation: failure on map size and/or regrowth behavior.

### Task 2: Map Size and Generation

**Files:**
- Modify: `src/game/config.ts`
- Modify: `src/game/map.ts`

- [ ] **Step 1: Increase configured map size**

Set `CONFIG.map.width` and `CONFIG.map.height` to `56`.

- [ ] **Step 2: Scale terrain blob counts**

Replace hard-coded mountain and forest blob counts with values multiplied by `width * height / (44 * 44)`.

### Task 3: Forest Regrowth

**Files:**
- Modify: `src/game/config.ts`
- Modify: `src/game/simulation.ts`

- [ ] **Step 1: Add pioneer regrowth config**

Add `forestPioneerChance`, a very low spring/summer daily chance for isolated plain tiles to become forest.

- [ ] **Step 2: Update regrowth logic**

Use actual map dimensions, snapshot existing forest before converting tiles, and allow:
- higher adjacent-forest regrowth,
- low pioneer regrowth when no forest neighbor exists,
- no regrowth on buildings or non-plain terrain.

### Task 4: State-Dimension Safety

**Files:**
- Modify: `src/game/agents.ts`
- Modify: `src/game/raids.ts`
- Modify: `src/render/renderer.ts`
- Modify: `src/components/GameCanvas.tsx`

- [ ] **Step 1: Replace runtime loops that use `CONFIG.map` with `state.map` dimensions**

Keep procedural generation using `CONFIG.map`, but simulation/rendering over a loaded state should use the actual map size.

- [ ] **Step 2: Verify old-save compatibility test**

Run: `node tools/game/test_map_forest_regrowth.mjs`

Expected: PASS.

### Task 5: Verification and Commit

- [ ] **Step 1: Run all game tests**

Run all `tools/game/test_*.mjs`.

- [ ] **Step 2: Run production build**

Run: `npm.cmd run build`

- [ ] **Step 3: Commit**

Commit with message: `Expand map and improve forest regrowth`.
