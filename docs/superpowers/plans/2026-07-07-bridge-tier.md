# Bridge Tier Implementation Plan

> **계획 상태:** 완료
> **상태 갱신:** 2026-07-29 — 교량 배치와 등급 규칙을 구현했다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move bridge construction from bo rank to the starting settlement tier.

**Architecture:** The unlock lives in `BUILDING_DEFS.bridge.minRank`; removing it makes the existing `isBuildingUnlocked` helper treat bridges as starting-tier buildings. Tests in `tools/game/test_bo_rank_unlocks.mjs` document the new split between bridge and bo-only buildings.

**Tech Stack:** TypeScript game simulation with Node-based `.mjs` regression tests.

---

### Task 1: Update Unlock Test

**Files:**
- Modify: `tools/game/test_bo_rank_unlocks.mjs`

- [x] **Step 1: Write the failing test**

Change the pre-bo test to assert `bridge` is unlocked and placeable at settlement rank, while `mine`, `tileHouse`, and `ferry` remain locked.

- [x] **Step 2: Run test to verify it fails**

Run: `node tools/game/test_bo_rank_unlocks.mjs`

Expected: FAIL because `bridge` is still locked before bo.

### Task 2: Move Bridge To Settlement Tier

**Files:**
- Modify: `src/game/buildings.ts`
- Modify: `src/game/promotion.ts`

- [x] **Step 1: Remove bridge minRank**

Remove `minRank: 'bo'` from `BUILDING_DEFS.bridge` and update its description so it no longer says bo promotion is required.

- [x] **Step 2: Update bo promotion log**

Remove `다리` from the bo promotion unlock log.

- [x] **Step 3: Run targeted and regression checks**

Run:

```bash
node tools/game/test_bo_rank_unlocks.mjs
node tools/game/test_building_footprints.mjs
node tools/game/test_pathfinding_collision.mjs
npm run build
```

Expected: all commands exit 0.
