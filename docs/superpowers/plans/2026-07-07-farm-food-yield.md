# Farm Food Yield Implementation Plan

## Goal

Make agriculture feel like the strongest food source per tile, especially for 50+ population winters.

## Design

- Raise full-growth field harvest from `20` grain to `36` grain.
- Add `foodPerGrain = 1.5` so milling grain creates more food than raw grain count.
- Keep hauler milling throughput unchanged for now so processing labor remains a meaningful choice.

## Tests

- Add a focused farming/yield test that verifies:
  - the configured full-growth field yield is 36 grain,
  - a farmer harvest from a full field is based on that yield,
  - hauler grain milling converts grain using `foodPerGrain`.

## Verification

- Run the new focused test.
- Run all `tools/game/test_*.mjs`.
- Run `npm.cmd run build`.
