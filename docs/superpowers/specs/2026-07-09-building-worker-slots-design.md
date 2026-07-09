# Building Worker Slots Design

## Goal

Make production buildings behave like limited workplaces instead of unlimited job targets. The player should be able to assign residents to specific building slots, see whether slots are filled, and use both fast map commands and building-focused management.

## Scope

This design covers production-slot assignment and slot visibility only. It does not tune production yields, raid damage, or broader combat consequences. Those remain separate balance passes.

## Player Experience

Production buildings with limited slots show small occupancy dots above the building during normal map view. Filled dots use the assigned job color; empty dots are muted outlines. This keeps the map readable while still showing whether a workplace is staffed.

When the player selects a slotted building, the overlay expands into job badges. Filled slots show the assigned worker's job badge; empty slots show an empty slot marker. Clicking a filled slot selects or focuses that resident. Clicking an empty slot assigns an eligible resident.

The player can also select a resident and right-click an eligible production building. This assigns the resident to that building, switching them to the building's required job if that job is unlocked and the resident can work.

## Slot Rules

Each supported building type has one required job and a fixed slot capacity:

| Building | Required job | Slots |
| --- | --- | --- |
| Field | Farmer | 1 |
| Smithy | Smith | 2 |
| Stable | Herder | 2 |
| Nitre yard | Powder maker | 2 |
| Ferry | Fisher | 2 |
| Tannery | Tanner | 2 |

The new tannery job is `tanner`, displayed in Korean as `무두장이`. Tanners work at tanneries and convert hide into clothes. The current automatic tannery processing should move into the tanner job loop so output depends on assigned workers.

## Data Model

Residents gain an optional `assignedBuildingId` field. Buildings do not store resident IDs. Assignment state is derived by filtering living residents whose `assignedBuildingId` matches a building ID.

This keeps ownership simple:

- Changing a resident's job clears incompatible assignments.
- Demolishing a building clears assignments pointing to that building.
- Loading old saves defaults missing `assignedBuildingId` to `null`.
- If a resident dies or becomes unable to work, the slot is considered unfilled for production and display purposes.

## Game Logic

Add helper functions for slotted production buildings:

- `workerSlotConfig(type)` returns required job and slot capacity for supported buildings.
- `assignedWorkers(state, building)` returns valid living workers assigned to that building.
- `availableWorkerSlots(state, building)` returns capacity minus valid assigned workers.
- `assignResidentToBuilding(state, residentId, buildingId)` validates rank, job compatibility, building type, built state, and free slot count.
- `unassignResidentFromBuilding(state, residentId)` clears the assignment.

Production jobs that are tied to buildings should prefer the assigned building and should not freely pile into any available building of that type. If a worker has no valid assigned building, they wait near the center with an assignment-needed task instead of producing.

The affected job loops are:

- Farmer uses the assigned field.
- Smith uses the assigned smithy and its selected product.
- Herder uses the assigned stable.
- Powder maker uses the assigned nitre yard.
- Fisher uses the assigned ferry.
- Tanner uses the assigned tannery.

Builders, haulers, woodcutters, hunters, herbalists, watchmen, militia, clerks, miners, and charcoal burners are not part of this first slot-assignment pass unless their current behavior needs minor compatibility handling.

## Controls

Resident-selected right-click:

- If the tile belongs to an eligible slotted building, assign the resident to that building.
- If the resident's current job differs from the required job, switch jobs during assignment when the required job is unlocked.
- If no slot is free, show an invalid action label.

Building-selected slot click:

- Filled slot: select or focus that assigned resident.
- Empty slot: assign the nearest eligible idle or matching-job resident. If no eligible resident exists, show a disabled/empty state rather than silently doing nothing.

The same `assignResidentToBuilding` helper should back both flows.

## Rendering

Slot overlays live in the canvas renderer because they need to sit directly over map buildings.

Normal map view:

- Draw compact dots above slotted buildings after buildings are rendered.
- Use filled color for assigned slots and muted outline for empty slots.
- Keep the overlay small enough not to hide building art.

Selected building view:

- Draw expanded rectangular job badges above the selected building.
- Filled badges use the assigned worker job color and a short job marker.
- Empty badges use a muted border and plus marker.

The selected-building interaction hit testing can live outside the canvas renderer if the React layer needs clickable DOM overlays. If hit testing in canvas becomes awkward, prefer DOM buttons positioned over the selected building rather than putting click logic into low-level drawing code.

## Save And Migration

Save data should include `assignedBuildingId` on residents. The loader should normalize missing values to `null` for old saves.

When loading, invalid assignments should not crash the game. They can remain on the resident object but helper functions must ignore assignments to missing, unbuilt, wrong-type, full, or incompatible buildings. A cleanup pass may clear them if the existing save migration style supports it.

## Testing

Add focused game tests for:

- Slot capacity: field accepts one farmer; smithy accepts two smiths; a third resident is rejected.
- Job switching: resident right-click assignment switches to the required job when unlocked.
- Rank lock: assigning to a locked job/building fails before the rank is unlocked.
- Tannery production: clothes are produced only when a tanner is assigned to a built tannery.
- Save migration: old resident objects without `assignedBuildingId` load safely.
- Demolition: removing a slotted building clears or invalidates assigned workers without leaving production active.

Add renderer or UI-level tests if the project already has a practical way to assert overlay drawing. If not, keep rendering verification manual for the first pass and cover the slot-count helpers with automated tests.

## Confirmed Decisions

Use `무두장이` for the tannery worker name.

For empty-slot click assignment, auto-pick the nearest eligible idle or matching-job resident. A resident picker is out of scope for this pass.
