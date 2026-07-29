# Agent Loiter Farming Implementation Plan

> **계획 상태:** 완료
> **상태 갱신:** 2026-07-29 — 작업자가 지정 경작지에 머무는 동작과 회귀 테스트를 반영했다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add natural no-work loitering and keep farmers near fields during non-harvest field care.

**Architecture:** Extend `src/game/agents.ts` with reusable loiter helpers that sit beside the existing movement/pathfinding helpers. Keep farming behavior inside `farmerTick` and reuse existing building goals for travel to fields.

**Tech Stack:** TypeScript game simulation, existing Node-based game module tests.

---

### Task 1: Regression Test

**Files:**
- Create: `tools/game/test_agent_loiter_farming.mjs`

- [x] **Step 1: Write the failing test**

Add a simulation test that compiles `src/game/*.ts`, creates controlled plain-map states, and checks builder loitering plus mature-field farmer behavior.

- [x] **Step 2: Run test to verify it fails**

Run: `node tools/game/test_agent_loiter_farming.mjs`

Expected: FAIL on the builder standing still at the center interaction tile.

### Task 2: Loiter Helpers

**Files:**
- Modify: `src/game/agents.ts`

- [x] **Step 1: Add reusable loiter helpers**

Add helpers for distance checks, legal random steps around an anchor, center loitering, and building loitering.

- [x] **Step 2: Route no-work jobs through center loitering**

Replace center parking for no-work residents with loitering while keeping sickness, battle, and bad-weather shelter behavior unchanged.

- [x] **Step 3: Run the focused test**

Run: `node tools/game/test_agent_loiter_farming.mjs`

Expected: builder assertion passes; farmer assertion may still fail until Task 3.

### Task 3: Farmer Field Care

**Files:**
- Modify: `src/game/agents.ts`

- [x] **Step 1: Keep mature spring/summer fields active**

When all fields are mature, send farmers to loiter near the nearest field with a field-care task.

- [x] **Step 2: Keep post-harvest autumn farmers near fields**

When no harvestable autumn field remains, send farmers to the nearest field for harvest cleanup unless carrying grain.

- [x] **Step 3: Run focused and regression tests**

Run:

```bash
node tools/game/test_agent_loiter_farming.mjs
node tools/game/test_pathfinding_collision.mjs
node tools/game/test_building_footprints.mjs
npm run build
```

Expected: all commands exit 0.
