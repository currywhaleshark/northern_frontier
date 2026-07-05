# Historical Pixel Asset Generation Design

## Context

Northern Frontier currently uses public Kenney roguelike assets as placeholder production art. They are convenient and license-safe, but their generic fantasy-adventure tone does not match the game's late-Joseon northern frontier setting. The replacement art should strengthen the historical mood while preserving the current game's readability, camera, and rendering architecture.

## Decision

Use image generation first for style exploration, then generate and normalize individual game assets after a style direction is approved.

The chosen direction is a custom pixel-art set for the existing square-tile camera. Do not move to isometric or semi-realistic art in this pass.

## Visual Goals

The first visual pass should communicate a late-Joseon northern frontier settlement across all four seasons, not only winter.

Required style-board coverage:

- Seasonal terrain variants for plain, forest, river, mountain, fertile ground, and hunting ground.
- Winter-specific variants such as snowfield, frozen river, snow-loaded forest, and high-contrast tiles that remain legible under blizzard or cold-snap overlays.
- Spring, summer, and autumn variants with readable planting-season soil, summer greenery, dry autumn grass, and harvest cues.
- Representative buildings: town center, hut, ondol house, storehouse, palisade, and beacon.
- Building season compatibility: base silhouettes should stay stable, while winter snow and smoke overlays can sit on top cleanly.
- Representative characters: two Joseon settler silhouettes, one watchman or militia silhouette, and one northern raider silhouette.

The art should prioritize game readability at the current 28px tile scale. It should feel like practical production sprites, not large concept art reduced after the fact.

## Production Pipeline

1. Generate two or three style boards.
   Each board should show the same asset categories so the choices are comparable: seasonal terrain, representative buildings, and small character silhouettes.

2. Pick one direction and write a compact style guide.
   The guide should lock palette behavior, outline strength, tile framing, roof and wall materials, character proportions, and historical avoid-list items.

3. Generate individual assets from the approved guide.
   Terrain should be generated in seasonal groups. Buildings should be generated as stable base silhouettes that work with winter overlays. Characters should begin with broad role silhouettes before per-job variants are attempted.

4. Post-process generated assets locally.
   Remove backgrounds where needed, crop to consistent bounds, scale down to the target tile size, clean edges, and assemble a project-local atlas with an explicit coordinate map.

5. Integrate through a new SpriteAPI implementation.
   Keep the current Kenney implementation available as a fallback. Add the new historical atlas beside it rather than rewriting all renderer logic at once.

6. Verify in game.
   Check spring, summer, autumn, and winter; day and night tinting; rain, snow, blizzard, and cold-snap overlays; selected tiles; construction previews; resident hover targeting; and raider visibility.

## Technical Shape

The existing rendering boundary is a good fit for this work:

- `src/render/sprites.ts` already defines the `SpriteAPI` contract.
- `src/render/atlas.ts` is the current Kenney implementation and can remain as a fallback.
- A new atlas implementation can provide terrain, building, resident, and raider drawing without changing simulation code.
- `CONFIG.ui.tileSize` remains the scale anchor for the pass.

The first implementation should avoid changing pathfinding, tile coordinates, building footprint rules, or the canvas input model.

## Risks

- Image generation may drift across assets. Mitigate by approving a style board first, then using a written guide and generating related assets in small groups.
- Downscaled sprites may lose historical detail. Mitigate by testing at 28px early and favoring strong silhouettes over tiny ornament.
- Seasonal palettes may make terrain categories ambiguous. Mitigate by keeping terrain silhouettes stable across seasons and changing color or overlays secondarily.
- A full atlas generated in one pass may have inconsistent tile alignment. Avoid this for production assets.

## Initial Success Criteria

- A style board exists with four-season terrain, representative buildings, and role silhouettes.
- The selected style is readable at or near the in-game tile scale.
- The direction clearly feels more late-Joseon/northern-frontier than the current public assets.
- The next implementation step can proceed without changing the game's camera or simulation architecture.
