# Wall Family Gate Design

## Goal

Add a single gate building that works with the whole wall family: palisade, earth fort, stone wall, and gate segments visually connect as one defensive line. Residents must use gates to pass through walls, while raiders treat gates as blocked defensive targets.

## Current Context

The original connected palisade plan assumed residents could walk through buildings. That is no longer true. `src/game/agents.ts` now uses `PASSABLE_BUILDING_TYPES`, so most buildings already block resident movement. This design should build on that existing collision model instead of replacing it.

The current wall family is:

- `palisade`
- `earthFort`
- `stoneWall`

The new shared gate is:

- `gate`

The gate is not tiered. One gate can connect to any wall-family segment.

## Building Model

Add `gate` to `BuildingTypeId`, `BUILDING_DEFS`, `BUILD_MENU_ORDER`, `SINGLE_TILE_BUILDINGS`, and the BuildMenu defense category.

Definition:

```ts
gate: {
  id: 'gate',
  name: '성문',
  emoji: '🚪',
  desc: '성벽 사이의 출입구. 주민은 드나들 수 있지만 습격자는 막힌다.',
  cost: { wood: 6 },
  buildDays: 2,
  slots: 0,
  capacity: 0,
  defense: 2,
  winterBonus: false,
  placement: 'land',
  unique: false,
}
```

`gate` has lower defense than `palisade` so it reads as the weak point in a wall line. It costs more wood than a palisade because, for raider pathing, it still functions as a barrier.

## Shared Wall Helpers

Create a small shared helper module in `src/game/walls.ts`:

- `WALL_BUILDING_TYPES`
- `isWallBuilding(type)`
- `isGateBuilding(type)`
- `isSolidWallBuilding(type)`
- `wallConnectionsAt(state, x, y)`

Definitions:

- Wall building: `palisade`, `earthFort`, `stoneWall`, `gate`
- Solid wall building: `palisade`, `earthFort`, `stoneWall`
- Gate building: `gate`

This keeps pathing, raider logic, rendering, and demolition aligned to one source of truth.

## Movement Rules

Residents:

- `palisade`, `earthFort`, and `stoneWall` block resident movement.
- `gate` is resident-passable.
- Construction sites keep the existing building collision behavior. A gate construction site is passable because `gate` is passable; wall construction sites are not passable under the current model.

Raiders:

- `palisade`, `earthFort`, `stoneWall`, and `gate` block raider movement once built.
- `spawnRaiders()` uses the same wall-family predicate to choose siege targets next to any wall segment, including gates.

This means a fully enclosed wall with a gate remains closed to raiders but traversable by residents.

## Rendering

Extend `BuildingDrawParams` with optional connections:

```ts
connections?: { n: boolean; e: boolean; s: boolean; w: boolean };
```

In `renderer.ts`, build a per-frame map of built wall-family buildings by tile coordinate. For each built wall-family building, compute 4-way adjacency to other built wall-family buildings and pass the result to `sprites.drawBuilding()`.

In `atlas.ts`, wall-family buildings should bypass the generated building sheet and use procedural drawing:

- `palisade`: wood posts and rails.
- `earthFort`: earth-toned wall body with connected shoulders.
- `stoneWall`: stone-toned wall body with connected shoulders.
- `gate`: side posts plus a central door/opening, connecting to adjacent wall-family segments.

The fallback sprite path can remain emoji-based.

## Demolition

Add `demolishBuilding(state, x, y): string | null` to `simulation.ts`.

Rules:

- Only wall-family buildings can be demolished.
- The target can be any occupied tile; resolve it through `tile.buildingId`.
- Return half the original resource cost, floored per resource and with a minimum of 1 for any nonzero cost.
- Clear every footprint tile occupied by the building.
- Remove the building from `state.buildings`.
- Recompute `state.resources.defense`.
- Add an info log naming the demolished building.

Expose this through `InspectorPanel` as a small "철거" button when the selected building is in the wall family.

`App.tsx` should follow the existing callback style:

- import `demolishBuilding`
- define `handleDemolishBuilding(x, y)`
- pass it to `InspectorPanel`
- log any returned error through `addLog`
- clear selected building state if demolition succeeds

## Save Compatibility

No save migration is required for the new `gate` field because older saves simply will not contain that building type.

When loading older saves with existing walls, movement may change because residents cannot pass through wall-family segments except gates. This is acceptable because demolition provides an escape hatch.

Do not add a load-time migration or informational log in the first implementation. Demolition is the compatibility escape hatch for old enclosed wall saves.

## Testing

Add `tools/game/test_walls_and_gate.mjs`.

Cover:

- `gate` exists in `BUILDING_DEFS`, menu order, and single-tile building list behavior.
- Resident passability: built wall-family segments block; built gate passes.
- Raider passability through observable spawn behavior: an enclosed wall with a gate makes raiders choose siege rather than path through the gate.
- Resident pathfinding through an enclosed wall with one gate finds a route through the gate.
- Resident pathfinding through a fully enclosed wall without a gate returns `null`.
- `wallConnectionsAt()` returns correct 4-way connections for isolated, line, corner, and cross layouts.
- `demolishBuilding()` refunds resources, clears tile occupancy, removes the building, and rejects non-wall buildings.

Run:

- `node tools/game/test_walls_and_gate.mjs`
- `npm run build`

## Out of Scope

- Separate gate tiers for earth fort or stone wall.
- Changing defense values for existing wall-family buildings.
- Changing raider battle or siege damage systems.
- Adding generated bitmap assets for wall variants.
- Demolishing non-wall buildings.
