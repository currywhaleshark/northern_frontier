# Militia Weapon Visuals Design

## Goal

Show 수비병 weapon progression visually as 창, 각궁, 조총 without changing the saved job model.

## Scope

- Keep `JobId` as `militia`; do not add separate jobs.
- Use existing gameplay allocation from `militiaWeaponAllocation(state)`.
- Add a small militia weapon character sheet with 3 columns and 2 rows:
  - columns: `spears`, `hornBows`, `muskets`
  - rows: male, female
- Render militia residents with the weapon-specific sheet when they are allocated that weapon.
- Keep the existing first-generation `militia` sprite as the fallback for unarmed or when the weapon sheet is not loaded.

## Assignment Rule

Alive militia residents are sorted by id for stable display. Weapon visuals are assigned in the same priority used by defense calculation:

1. `muskets` if muskets and gunpowder can arm them
2. `hornBows`
3. `spears`
4. fallback base militia sprite

This keeps visual state aligned with existing defense math and avoids save migrations.

## Asset Direction

Characters should match the first-generation side/three-quarter full-body character style. They should not be top-down. The current base militia silhouette is treated as the spear visual language, with new clearer variants for 창, 각궁, and 조총.

## Testing

- Add routing tests for militia weapon sheet rects.
- Add assignment tests for stable id-based weapon display.
- Add pixel tests for the generated militia weapon sheet.
- Run render tests and `npm run build`.

