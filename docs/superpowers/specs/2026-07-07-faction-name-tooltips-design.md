# Faction Name Tooltip Design

## Goal

Faction names should stay readable in event modals and related UI. The current `Faction(desc)` text makes modal copy dense, so faction descriptions will move into hover tooltips while faction names receive stable faction-specific colors.

## Scope

- Add a stable `color` field to each `Faction` definition in `src/game/constants.ts`.
- Remove inline parenthetical faction descriptions from trade and raid modal body text.
- Add a reusable React component for faction labels that:
  - looks up faction metadata by name,
  - renders the name in that faction's color,
  - exposes the faction description through the browser tooltip,
  - falls back gracefully for unknown names.
- Reuse the faction label in event modals, the factions inspector tab, market trade buttons where practical, and raider map tooltips.

## UI Behavior

Event modal titles can keep their existing plain text format. Modal body text will show the faction name as colored inline text, with the description available on hover. The prose should read naturally without parenthetical explanation, for example:

- `오도리 씨족이 장터에 찾아왔습니다.`
- `니마차 우디캐이 마을로 몰려오고 있습니다.`

The factions inspector tab should continue to show relation bars and trade details. Its row title should use the same colored faction label, preserving existing hostile/trader icon hints.

## Data Flow

Game logic continues to store faction names in `PendingChoice.data.faction`. Event body strings remain plain strings for save compatibility and simple game logic. The modal component will split only the displayed body when `data.faction` is present, replacing matching faction-name text with the `FactionName` component.

The event generation code will stop embedding `faction.desc` into body strings. The description remains in `FACTIONS` and is surfaced by UI components.

## Testing

Add focused game-module tests before implementation:

- trade offer modal bodies must not include `(<desc>)`;
- player-initiated trade modal bodies must not include `(<desc>)`;
- raid modal bodies must not include `(<desc>)`.

Then run the targeted Node test files and the full project build.

## Non-Goals

- No custom floating tooltip system for all UI text in this pass; native `title` is enough.
- No changes to save schema beyond adding static faction metadata.
- No rewrite of log strings, because logs are historical records and not all are hoverable UI.
