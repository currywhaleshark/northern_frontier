# Bo Rank Unlocks Design

## Goal

Make the first promotion to `보(堡)` feel like a real expansion of the settlement. The first implementation pass adds rank-gated buildings and jobs unlocked at `보`, with working production and movement effects.

## Scope

This pass implements only the `보` unlock tier:

- Buildings: `다리`, `채광장`, `기와집`, `나루터`
- Jobs: `채광꾼`, `어부`

Future tiers are intentionally left as follow-up work:

- `진(鎭)`: 토성, 숯가마, 축사, 숯쟁이, 목동
- `부(府)`: 염초장, 석벽, 관청, and a `나루터 -> 부두` trade-scale upgrade

## Unlock Model

Buildings and jobs gain a `minRank` concept. Items with `minRank: 'bo'` are hidden before the settlement reaches `보`.

After promotion to `보`, the promotion log should mention that new construction and labor options are available. The build menu and job panel should then show the new options.

Game logic must also enforce unlocks outside the visible UI:

- `tryPlaceBuilding` rejects locked buildings.
- `reassignJob` and `setResidentJob` reject locked jobs.
- Save migration remains compatible with old saves because existing jobs and buildings keep their identifiers.

## Buildings

### 다리

`다리` is a river-crossing infrastructure building.

- Placement: on a river tile.
- Role: allows residents to path through that river tile in all seasons and weather.
- It does not produce resources and does not replace `나루터`.
- Cost should use wood and stone, with a moderate build time so it feels like an infrastructure project after promotion.

### 채광장

`채광장` is the dedicated mining work site.

- Placement: on rock tiles, preferably iron-bearing rock when available.
- Role: deposit and production anchor for `채광꾼`.
- It increases the reliability of stone and iron production compared with the current fallback where haulers quarry and smiths mine iron.
- It should not make the old fallback paths invalid; haulers and smiths can keep their fallback behavior so older early-game loops still work.

### 기와집

`기와집` is the `온돌집` upper-tier housing option.

- Placement: normal land.
- Role: larger and warmer housing.
- Suggested stats: 7 capacity, winter bonus enabled, higher cost in wood, stone, and tools.
- It should count as winter-bonus housing in the existing housing and warmth systems.

### 나루터

`나루터` is an fishing work site, not a movement building.

- Placement: land adjacent to river, or another explicit riverbank placement rule.
- Role: deposit and production anchor for `어부`.
- It produces food from nearby river tiles.
- It does not improve pathfinding or trade in this pass.
- Future `부두` upgrade can extend this concept into larger trade volume or trade frequency.

## Jobs

### 채광꾼

`채광꾼` is the specialist for stone and iron extraction.

- Unlocked at `보`.
- Outdoor job.
- Primary loop: travel to a built `채광장`, mine nearby rock or iron-bearing rock, then deposit at `채광장`, `창고`, or `마을 중심지`.
- Output should include stone from normal rock and iron from iron-bearing rock. Iron-bearing sites may also produce some stone.
- This job reduces reliance on `대장장이` as a miner, but does not remove the old safety-net behavior.

### 어부

`어부` is the specialist for river food production.

- Unlocked at `보`.
- Outdoor job.
- Primary loop: travel to a built `나루터`, fish nearby river tiles, then deposit food at `나루터`, `창고`, or `마을 중심지`.
- Fishing output should vary by season: stronger in spring and summer, weaker in winter, and poor during thaw floods.
- It should provide a food route that is steadier than hunting but depends on river access and construction.

## UI Behavior

The build menu should remain readable:

- Before `보`, locked `보` buildings are not shown.
- After `보`, `다리` and `기와집` appear under `주거·기반`, `채광장` and `나루터` under `생산`.

The job panel should remain compact:

- Before `보`, `채광꾼` and `어부` are not shown.
- After `보`, they appear in the job list with descriptions and color dots like existing jobs.

Inspector text should describe the new buildings, including whether a selected `나루터` or `채광장` is acting as a work/deposit site.

## Pathfinding and Placement

The placement model needs two new terrain-aware placement categories:

- river tile placement for `다리`;
- rock tile placement for `채광장`;
- river-adjacent land placement for `나루터`.

Resident pathfinding should treat a river tile with a completed `다리` as passable. Raiders do not need a new bridge rule in this pass unless existing raider logic naturally allows it; the first goal is resident movement.

## Testing

Use TDD for the implementation:

- Rank unlock tests:
  - locked buildings cannot be placed before `보`;
  - unlocked buildings can be placed after `보`;
  - locked jobs cannot be assigned before `보`;
  - unlocked jobs can be assigned after `보`.
- Placement tests:
  - `다리` can be placed on river and rejects non-river tiles;
  - `채광장` can be placed on rock and rejects ordinary land;
  - `나루터` can be placed on land adjacent to river and rejects isolated land.
- Pathfinding tests:
  - resident passability rejects ordinary river outside winter;
  - resident passability accepts a completed bridge tile.
- Production tests:
  - `채광꾼` produces stone or iron through a built `채광장`;
  - `어부` produces food through a built `나루터`.
- Build verification:
  - targeted Node game tests pass;
  - `npm.cmd run build` passes.

## Non-Goals

- Do not implement `진` or `부` unlocks in this pass.
- Do not implement `부두` trade scaling yet.
- Do not add new resources for livestock, charcoal, saltpeter, or administration yet.
- Do not replace the existing hauler quarry or smith iron fallback behavior.
