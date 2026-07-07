# Building Footprints Design

## Goal

Make most buildings occupy and render as 2x2 tile structures while keeping the listed worksite, path, wall, and tower buildings at 1x1.

## Scope

1x1 buildings:

- `bridge`
- `lumberCamp`
- `huntLodge`
- `herbHut`
- `mine`
- `field`
- `ferry`
- `dock`
- `palisade`
- `earthFort`
- `stoneWall`
- `watchtower`

All other `BuildingTypeId` values use a 2x2 footprint.

## Design

Building footprint is a gameplay rule, not only a render scale. A new helper in `src/game/buildings.ts` defines footprint size and footprint tile enumeration. Placement checks use every footprint tile, so 2x2 buildings require all four tiles to be in bounds, empty, and valid for that building's placement rule.

When a building is placed or prebuilt, every footprint tile receives the same `buildingId`. Selection, worker goals, hauling deposits, and construction targeting continue to work because they already resolve buildings by `tile.buildingId`. Existing saves are repaired on load by clearing map occupancy and rebuilding each building's footprint from its saved origin.

Rendering reads the same footprint size and passes a larger draw size to the sprite layer. Placement preview highlights the full footprint and uses the full-footprint validity check.

## Edge Cases

- Existing saves with adjacent buildings are repaired best-effort in saved building order. Later overlapping footprint cells are not allowed to overwrite earlier occupied cells.
- Forest clearing rewards wood per cleared footprint tile, matching the existing one-tile clearing behavior.
- Destroyed buildings clear all tiles that reference the destroyed building id.

## Verification

- Add a game logic test for footprint sizes, placement, collision, bounds rejection, and footprint rebuild.
- Run existing rank/building tests to catch placement regressions.
- Run render asset tests and `npm run build`.
