# Building Footprints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all non-excluded buildings occupy and render as 2x2 tile structures.

**Architecture:** Add one footprint helper layer in `src/game/buildings.ts`, then route placement, prebuilt buildings, save repair, damage cleanup, and rendering through it. Keep existing `Building` save shape unchanged by deriving size from `type`.

**Tech Stack:** TypeScript game logic, React canvas renderer, Node `.mjs` test scripts, Vite build.

---

### Task 1: Footprint Logic

**Files:**
- Modify: `src/game/buildings.ts`
- Modify: `src/game/simulation.ts`
- Modify: `src/game/saveLoad.ts`
- Modify: `src/game/raidDamage.ts`
- Test: `tools/game/test_building_footprints.mjs`

- [ ] Write failing tests for footprint size, 2x2 placement, collision, bounds rejection, and rebuild.
- [ ] Add `SINGLE_TILE_BUILDINGS`, `buildingFootprintSize`, `buildingFootprintTiles`, `canPlaceBuildingAt`, `occupyBuildingTiles`, `clearBuildingTiles`, and `rebuildBuildingFootprints`.
- [ ] Update prebuilt and player placement to mark every footprint tile.
- [ ] Update load repair and destroyed-building cleanup to use footprint helpers.
- [ ] Run `node tools/game/test_building_footprints.mjs`.

### Task 2: Rendering And Preview

**Files:**
- Modify: `src/render/renderer.ts`

- [ ] Import `buildingFootprintSize` and `canPlaceBuildingAt`.
- [ ] Draw each building with `size = TILE * buildingFootprintSize(type)`.
- [ ] Sort building draw order by visual bottom edge.
- [ ] Highlight and validate the full footprint in placement preview.
- [ ] Adjust smoke and window placement to use the footprint width.

### Task 3: Verification

**Files:**
- Existing test scripts and build scripts.

- [ ] Run `node tools/game/test_building_footprints.mjs`.
- [ ] Run existing game placement/rank tests.
- [ ] Run render building tests.
- [ ] Run `git diff --check`.
- [ ] Run `npm run build`.
