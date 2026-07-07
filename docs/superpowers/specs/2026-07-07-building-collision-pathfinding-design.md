# Building Collision Pathfinding Design

## Goal

Apply collision to solid buildings and replace the current grid BFS path search with A* while preserving existing worker behavior through adjacent building interaction tiles.

## Design

Solid buildings block resident movement. The passable exceptions are outdoor work surfaces and transit structures: `field`, `bridge`, `ferry`, `dock`, `lumberCamp`, `huntLodge`, `herbHut`, and `mine`. Large houses, storage, production buildings, offices, markets, military buildings, walls, and towers are solid.

Workers no longer need to stand inside solid buildings. Building goals resolve to a passable tile that is either the building tile itself for passable structures or any adjacent tile around the building footprint for solid structures. This keeps existing job code simple while making the map obey visible collision.

The existing `findPath` function keeps its public signature but uses A*. The map is small, so a simple array-backed open set is sufficient. The heuristic is Chebyshev distance because movement allows eight directions. Diagonal steps cannot cut through blocked orthogonal corners.

## Verification

- Solid building footprint tiles are not passable.
- A path around a solid building never includes that footprint.
- Builders can progress construction from an adjacent tile without entering the building footprint.
- Existing game and render tests still pass.
