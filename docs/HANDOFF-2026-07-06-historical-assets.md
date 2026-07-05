# Historical Asset Generation Handoff - 2026-07-06

## Repository State

- Branch: `codex/historical-style-board`
- Remote: `origin` -> `https://github.com/currywhaleshark/northern_frontier.git`
- Scope of this branch: documentation and generated visual exploration assets only.
- Source code status: no renderer, simulation, or UI source files have been modified on this branch.
- Last known commit before this handoff: `8e33f1b Add core river connector shapes`

## Completed Work

### Project Setup

- Initialized the project as its own Git repository under `northern`.
- Connected the repository to `currywhaleshark/northern_frontier`.
- Pushed the initial `main` branch earlier with the React/Vite/Canvas prototype.

### Visual Direction

- Generated three historical pixel-art style boards under `docs/assets/styleboards/`.
- Selected **B. Folk Warm** as the target direction.
- Documented the selection and production rules in:
  - `docs/assets/styleboards/review.md`
  - `docs/assets/styleboards/selected-style-guide.md`

Key selected direction:

- Korean folk-painting influenced pixel art.
- Warm mineral pigments and hand-crafted late-Joseon frontier mood.
- Keep 28px tile readability over decorative detail.
- Borrow stronger silhouette clarity from option C when needed.

### Terrain Source Candidates

Generated first terrain source candidates under `docs/assets/terrain/`.

Important files:

- `folk-warm-terrain-source-v1.png`
- `folk-warm-terrain-source-v2.png`
- `folk-warm-terrain-source-v3.png`
- `folk-warm-terrain-v3-28px-sheet.png`
- `folk-warm-terrain-v3-28px-preview-4x.png`
- `terrain-source-notes.md`

Current terrain judgment:

- v3 is the best current base candidate for extraction.
- Plain, river, forest, and cultivated ground are readable.
- Mountain/rock is still somewhat generic.
- Hunting ground needs stronger distinction from plain and forest.

### River Connector Work

The first terrain sheet treated river as a single tile, which was not enough because rivers need natural connection directions.

Generated connector candidates under `docs/assets/terrain/river/`.

Important files:

- `folk-warm-river-connectors-source-v1.png`
- `folk-warm-river-connectors-v1-28px-sheet.png`
- `folk-warm-river-connectors-v1-28px-preview-4x.png`
- `folk-warm-river-connectors-source-v2-core6.png`
- `folk-warm-river-connectors-v2-core6-28px-sheet.png`
- `folk-warm-river-connectors-v2-core6-28px-preview-4x.png`
- `river-connector-notes.md`

Important correction:

- Minimum required river core shapes are `│`, `─`, `┌`, `┐`, `┘`, `└`.
- v1 was useful exploration, but v2 is preferred because the first six columns explicitly encode those core shapes.
- v2 order is:
  - `│`, `─`, `┌`, `┐`, `┘`, `└`, N end, E end, S end, W end, four T junctions, cross, source.

## Verification Already Run

- `npm run build` passed before the visual-asset branch work.
- For document/image-only commits, `git diff --check` was run before commits when applicable.
- 28px probe sheets were generated with Pillow for terrain v3 and river connector sheets.

## Current Risks

- Generated images are source candidates, not clean production atlas files.
- River v2 still needs post-processing before renderer integration:
  - normalize river width across shapes
  - make edge contact points exact at 28px
  - reduce bank noise where it hurts seamless tiling
  - decide whether river banks are baked into river tiles or drawn as renderer overlays based on neighboring land
- The selected Folk Warm direction is visually good, but production tiles must be tested in-game under day/night and weather overlays.
- The current public Kenney assets are still what the game uses at runtime.

## Recommended Next Steps

1. Build a deterministic extraction script for source sheets.
   - Inputs: source image, rows, columns, target tile size.
   - Outputs: individual PNG tiles plus a preview sheet.

2. Normalize the v2 river connector sheet.
   - Start with the six required core shapes.
   - Enforce exact edge-center water contacts at 28px.
   - Keep winter ice variants aligned with the same connector masks.

3. Create a small historical terrain atlas candidate.
   - Use terrain v3 for non-river terrain.
   - Use river v2 for river connectors.
   - Keep it under `public/assets/` only after cleanup.

4. Add a new `SpriteAPI` implementation beside the current Kenney atlas.
   - Do not delete `src/render/atlas.ts`.
   - Add a separate historical atlas implementation and switch through a small selector when ready.

5. Verify in-game.
   - Spring, summer, autumn, winter.
   - Rain, snow, blizzard, cold snap.
   - Tile selection, building preview, residents, and raiders.

## Useful Files To Read First

- `docs/assets/styleboards/selected-style-guide.md`
- `docs/assets/terrain/terrain-source-notes.md`
- `docs/assets/terrain/river/river-connector-notes.md`
- `docs/superpowers/specs/2026-07-05-asset-generation-design.md`
- `docs/superpowers/plans/2026-07-05-historical-style-board.md`
- `src/render/sprites.ts`
- `src/render/atlas.ts`
- `src/render/renderer.ts`
