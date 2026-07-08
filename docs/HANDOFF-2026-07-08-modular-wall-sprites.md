# Modular Wall Sprite Handoff - 2026-07-08

## Repository State

- Branch: `codex/wall-family-gate`
- Current direction: stop the 16-mask wall-family sprite generation route and switch to a 3-piece modular wall system.
- Last known code commit before this handoff: `861c0a0 fix: reject tiny wall family source artifacts`
- Scope of this handoff: document the user's revised asset/rendering direction before committing and pushing.

## Decision From User

The previous 16-mask sprite-sheet plan is too heavy for wall families. Use only three sprite pieces per wall material instead:

- `pillar`: a full square post/block used for corners, endpoints, intersections, and short runs.
- `horizontal`: one horizontal wall segment used only inside longer horizontal runs.
- `vertical`: one vertical wall segment used only inside longer vertical runs.

This applies first to `palisade` / `mokchaek`, then the palisade result should be used as the visual reference for:

- `earthFort` / `toseong`
- `stoneWall` / `seokbyeok`
- normal and winter variants of each material

Gates (`seongmun`) are still required, but should be treated as a separate asset/logic path instead of being folded into the three base wall pieces.

## Rendering Rule

For each contiguous wall-family line or network:

- Corners, T-junctions, crosses, and any other junction/intersection render as `pillar`.
- Isolated wall tiles render as `pillar`.
- A straight run of one or two tiles renders entirely as `pillar`.
- A straight run of three or more tiles renders:
  - first tile: `pillar`
  - interior tiles: `horizontal` or `vertical`
  - last tile: `pillar`
- The tile's own wall material decides which material variant to draw.
- Mixed-material adjacency should not force a neighbor's material onto the current tile. If needed, add a later transition rule, but keep the first implementation simple.

This means only three source sprites are needed per material/season for normal wall rendering.

## Important Course Correction

Do not continue generating the old 16-direction or bitmask wall source sheets unless the user explicitly asks to return to that route.

Existing work from the previous route may still be useful as code context, but it should be revised or retired:

- `src/render/wallFamilyAssets.ts`
- `tools/render/compose_wall_family_assets_v1.py`
- `tools/render/test_wall_family_assets.mjs`
- `tools/render/test_wall_family_asset_pixels.py`
- `docs/superpowers/specs/2026-07-08-wall-family-sprite-generation-design.md`
- `docs/superpowers/plans/2026-07-08-wall-family-sprite-generation.md`

The earlier adjacency helpers in `src/game/walls.ts` are still likely useful because the modular renderer also needs to know neighbors and connected runs.

## Experimental Artifacts

These files were produced during the interrupted 16-mask exploration and should not be treated as final production assets:

- `docs/assets/walls/wall-family-palisade-ai-draft-v1.png`
- `tools/render/source_images/wall-family-palisade-normal-source-v1.png`
- Original generated image copy under `.codex/generated_images/.../ig_05a0ec917fcd5950016a4dffc92804819194db80d58c06091f.png`

The generated palisade source included an unwanted drop shadow and represented the old bitmask/contact-sheet approach. Leave these as references only, or delete/regenerate them in a later cleanup if the user confirms.

## Recommended Next Steps

1. Update the wall-family sprite spec and implementation plan to the 3-piece modular design.
2. Replace 16-mask asset metadata with modular metadata:
   - material
   - season
   - `pillar`
   - `horizontal`
   - `vertical`
3. Add tests for run classification:
   - isolated tile -> pillar
   - length 2 run -> pillar, pillar
   - length 3 run -> pillar, segment, pillar
   - longer horizontal/vertical runs -> endpoints pillar, interiors segment
   - corner/T/cross -> pillar
4. Generate the palisade (`mokchaek`) three-piece source first.
5. Use palisade as the image reference for earth fort (`toseong`) and stone wall (`seokbyeok`) variants.
6. Generate winter variants from each approved normal variant.
7. Add gate (`seongmun`) as a separate visual/placement pass after the base wall rule is stable.
8. Render a small in-game QA map with short runs, long runs, corners, T-junctions, crosses, and gates.

## Useful Commands

- `node tools/game/test_walls_and_gate.mjs`
- `node tools/render/test_wall_family_assets.mjs`
- `C:\Users\USER\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe tools/render/test_wall_family_asset_pixels.py`
- `npm.cmd run build`

## Notes For The Next Worker

- Keep the visual language consistent with the existing historical folk-painting pixel-art direction.
- Do not spend effort making all possible wall bitmask combinations by hand.
- The key UX goal is readability on the 28px tile grid: posts should clearly mark structure, while long wall spans should read as continuous barriers.
- Start with palisade, because the user specifically asked to make it first and then use it as the reference for the other wall materials.
