# Selection Actions Design

## Goal

Add a clear map-first interaction model: select a resident or building, show what the pointer can do, then use right-click or a small popup to issue the action.

## Core Rules

- Left-click selects.
- Right-click commands the current resident selection.
- A resident can only be ordered to targets their current job can use. Right-clicking a target never changes the resident's job.
- Hover feedback must show whether the current target is movable, workable, invalid, or a building action.
- Existing automatic job AI remains the fallback. Manual orders override it only while active.
- Building actions surface as a small map-adjacent popup, while the Inspector remains the full information panel.

## Resident Command Scope

- Any selected living resident can right-click a passable empty tile to move there.
- Job-specific work targets:
  - `farmer`: built fields.
  - `builder`: unfinished buildings.
  - `woodcutter`: forest tiles.
  - `hunter`: active habitat forest tiles.
  - `herbalist`: forest tiles outside winter.
  - `miner`: built mines.
  - `fisher`: built ferry tiles.
  - `smith`: built smithies.
  - `hauler`: rock or iron-rock tiles for repeated quarrying; center/storehouse for deposit or processing.
  - `charcoalBurner`: built charcoal kilns.
  - `herder`: built stables.
  - `powderMaker`: built nitre yards.
  - `clerk`: built offices.
  - `watchman`: center or defensive buildings.
  - `militia`: built garrison.
- Impossible targets show an invalid cursor and do not issue orders.

## Hauler Priority

The hauler's manual quarry order is the main reason for this feature:

- Selecting a hauler and right-clicking a rock tile creates a repeated quarry order.
- The hauler mines until carrying capacity is reached, deposits at center/storehouse, then returns to the same rock target while the order remains active.
- The order is cancelled by issuing a different order or an explicit cancel/wait command.
- This bypasses the automatic stone reserve threshold, so the player can force stone gathering when needed.

## Building Popup Scope

Clicking a built building selects it and opens a compact action popup near the selected tile.

- Housing: upgrade actions, gated by resources and rank.
- Smithy: production switch actions using existing smithy product rules.
- Market and dock: faction trade target actions using existing trade request logic.
- Nitre yard: pause/resume action.
- Other buildings: information-only popup with no action buttons in the first pass.

## Architecture

Add a small pure action layer:

- `src/game/selectionActions.ts`
  - `selectedEntityFromClick`
  - `getPointerAction`
  - `getBuildingActions`
  - `canResidentWorkTarget`

Add simulation execution helpers:

- `issueResidentMoveOrder`
- `issueResidentWorkOrder`
- `clearResidentManualOrder`
- `upgradeHousingBuilding` for housing upgrades.

UI consumes the action layer:

- `GameCanvas` computes hover action and uses it for cursor and tooltip.
- `App` owns selected entity and sends right-click actions to simulation helpers.
- A small `ActionPopup` component renders building action buttons.

## Testing

- Unit-style Node tests for action classification.
- Game simulation tests for manual move and hauler repeated quarry/deposit behavior.
- UI compile coverage through `npm run build`.
