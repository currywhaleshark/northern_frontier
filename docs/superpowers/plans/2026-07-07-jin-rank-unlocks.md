# Jin Rank Unlocks and Ferry Placement

> **계획 상태:** 완료
> **상태 갱신:** 2026-07-29 — 진 등급 건물·직업 해금과 나루 배치를 구현했다.

## Goal

Implement the first Jin-rank expansion pass:

- Ferry placement changes from land beside a river to a river tile beside land.
- Jin unlocks `토성`, `숯가마`, `축사`.
- Jin unlocks jobs `숯쟁이`, `목동`.
- New jobs have useful production behavior and appear in UI/rendering.

## Tests First

- Update Bo unlock coverage so ferry succeeds only on a river tile adjacent to land.
- Add Jin unlock coverage:
  - Jin buildings/jobs remain locked at Bo and unlock at Jin.
  - Jin buildings can be placed on valid terrain.
  - Job assignment respects Jin rank locks.
  - `숯쟁이` turns reserve-respecting wood into firewood at a charcoal kiln.
  - `목동` produces food and hide at a stable.

## Implementation Steps

1. Add `charcoalBurner`, `herder`, `earthFort`, `charcoalKiln`, and `stable` to game types and static definitions.
2. Change ferry riverbank placement to require a river tile with adjacent land.
3. Allow built ferries to be passable work tiles.
4. Add charcoal kiln and stable production behaviors in `agents.ts`.
5. Update promotion log text, tool wear, UI categories, and sprite/generated asset mappings.
6. Run focused tests, all game tests, and the production build before committing.
