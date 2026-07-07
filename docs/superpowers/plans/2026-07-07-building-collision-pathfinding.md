# Building Collision Pathfinding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make solid buildings block residents and route pathfinding around them with A*.

**Architecture:** Keep `findPath` as the pathfinding entrypoint but swap the internals to A*. Add building interaction helpers in `src/game/agents.ts` so job code can target adjacent tiles around solid buildings without changing save data.

**Tech Stack:** TypeScript game logic, Node `.mjs` game tests, Vite build.

---

### Task 1: Failing Collision Tests

**Files:**
- Create: `tools/game/test_pathfinding_collision.mjs`

- [ ] Assert that a solid 2x2 storehouse footprint is not passable.
- [ ] Assert `findPath` routes around that footprint.
- [ ] Assert a builder can build a solid smithy from an adjacent passable tile.

### Task 2: A* And Building Interaction

**Files:**
- Modify: `src/game/agents.ts`

- [ ] Add solid/passable building classification.
- [ ] Update `isPassable` to block solid building tiles.
- [ ] Replace BFS internals in `findPath` with A*.
- [ ] Add adjacent building interaction goal helpers.
- [ ] Route deposit, construction, production, watchman, and center goals through interaction helpers.

### Task 3: Verification

**Files:**
- Existing game/render tests.

- [ ] Run `node tools/game/test_pathfinding_collision.mjs`.
- [ ] Run `node tools/game/test_building_footprints.mjs`.
- [ ] Run the game test suite.
- [ ] Run relevant render tests.
- [ ] Run `git diff --check`.
- [ ] Run `npm run build`.
