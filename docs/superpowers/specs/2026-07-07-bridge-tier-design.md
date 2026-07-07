# Bridge Tier Design

## Goal

Let players build bridges from the settlement tier so winter river crossings do not trap workers for an entire year after thaw.

## Behavior

- `bridge` is available at the starting settlement rank.
- Bridge placement rules stay unchanged: it still requires a river tile.
- Bridge cost, build time, footprint size, and passability behavior stay unchanged.
- Bo promotion no longer advertises bridges as newly unlocked.
- Mine, tile house, ferry, miner, and fisher remain bo-tier unlocks.

## Testing

Update bo-rank unlock tests so:

- bridges are unlocked and placeable before bo,
- mine, tile house, and ferry remain locked before bo,
- bo-tier placement coverage still validates mine, tile house, and ferry.
