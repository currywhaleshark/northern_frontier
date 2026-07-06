# Historical Character Atlas Design

## Purpose

Replace the remaining placeholder character sprites with a production-ready historical character atlas that matches the already updated terrain and building assets. The pass should improve visual identity without changing movement, pathfinding, battle simulation, or the current canvas interaction model.

## Design Decision

Generate a single coordinated character production sheet for consistency, then normalize it into explicit runtime source rectangles.

The sheet should contain 22 subjects:

- 20 resident variants: two gender rows by ten resident jobs.
- 2 mounted raider variants: male and female horse-riding raiders.

Raiders are `마적`, so they must be shown on horseback. They should not be squeezed into the same square person cell as villagers. The production sheet remains one image for style consistency, but the mounted raider cells use a wider source rectangle than resident cells.

## Resident Scope

Residents use real demographic data, not a render-only random choice.

Add a persistent resident field:

```ts
gender: 'male' | 'female'
```

This field is used immediately by rendering and is intentionally compatible with later marriage and birth systems. This pass only adds the field, generation, save migration, and rendering use. It does not implement marriage, pregnancy, family trees, inheritance, or population simulation.

The resident atlas slots are:

- `idle`
- `woodcutter`
- `hunter`
- `farmer`
- `builder`
- `hauler`
- `herbalist`
- `smith`
- `watchman`
- `militia`

The art label for `militia` should read visually as a local defender or `수비병`. The code key remains `militia` in this pass so the asset work does not force a gameplay rename.

## Raider Scope

Raiders use mounted sprites separate from residents.

The atlas should include:

- mounted male raider
- mounted female raider

The raid system currently renders raiders as a band count rather than individually modeled agents. Runtime rendering can alternate or deterministically select the mounted raider variant by raider index. No persistent raider gender field is required for this pass.

Mounted raider source rectangles may be approximately two resident cells wide. Runtime draw bounds should allow the horse silhouette to read clearly while keeping the unit centered near the existing map position.

## Art Direction

Use the selected historical folk-warm direction already established for terrain and buildings:

- practical late-Joseon frontier clothing
- muted cloth, straw, leather, and dark outerwear
- compact silhouettes readable at the current game scale
- strong role cues through tools and posture, not ornament
- watchman and defender variants with darker guard accents, polearms, or small banners
- mounted raiders with rougher, colder-toned outerwear and visible horse silhouette

Avoid fantasy armor, anime proportions, modern uniforms, decorative royal costume, oversized weapons, and details that disappear at 28px.

## Production Sheet Layout

Use one coordinated source image with two gender rows.

Resident columns:

1. idle
2. woodcutter
3. hunter
4. farmer
5. builder
6. hauler
7. herbalist
8. smith
9. watchman
10. militia

The final column is the mounted raider column. It is wider than the resident columns and contains the horse-riding raider variant for each gender row.

Runtime integration should not assume every source rectangle has the same size. Add explicit metadata for each slot, similar to the existing generated building metadata pattern.

## Technical Shape

Add a generated character asset metadata module that maps:

- resident `job + gender` to a source rectangle
- raider variant index to a mounted raider source rectangle

Integrate the metadata into the existing sprite boundary:

- `src/render/sprites.ts` gains `gender` in `ResidentDrawParams`.
- `src/render/atlas.ts` draws generated historical characters when the sheet is loaded.
- The existing Kenney character sheet remains a fallback if the generated sheet is not available.
- `src/game/residents.ts` assigns gender when creating residents.
- `src/game/saveLoad.ts` migrates old saves by assigning a stable gender to residents missing the field.

The renderer should preserve selection, sickness, carried-item, and movement indicators. If role color dots remain useful for gameplay readability, keep them small and unobtrusive above the new sprites.

## Asset Pipeline

1. Generate the full 22-subject production sheet in one pass to preserve palette and clothing consistency.
2. Inspect the sheet at both source size and in-game scale.
3. Remove or normalize the background to transparency.
4. Crop each resident and mounted raider slot into explicit source rectangles.
5. Export a game-ready PNG under `public/assets/`.
6. Add metadata and tests that verify every job and gender maps to a valid rectangle.
7. Verify the sheet in-game across terrain, building overlap, resident selection, sickness tinting, carried goods, and raider movement.

## Risks

- A single generated sheet can produce uneven quality across 22 subjects. Mitigate by using explicit row and column labels in the prompt, then correcting individual cells during normalization.
- Mounted raiders need more space than residents. Mitigate with explicit metadata and a wider draw rectangle instead of forcing a uniform grid.
- Gendered silhouettes can become exaggerated. Mitigate by keeping both rows practical and compact, with clothing differences subtle enough to match the historical style.
- Adding a persistent gender field affects old saves. Mitigate with save migration and deterministic fallback assignment.

## Success Criteria

- The game has historical resident sprites for every current resident job and both genders.
- Old saves load successfully and assign missing resident gender values.
- Mounted raiders are visibly horse-riding `마적`, not ordinary walking bandits.
- The atlas can be addressed through explicit metadata rather than hard-coded magic coordinates.
- Rendering remains compatible with existing selection, status, movement, and raid visibility behavior.
- The implementation does not change battle resolution, resident jobs, pathfinding, or population mechanics beyond adding the persistent resident gender field.
