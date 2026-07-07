# Topdown Building Regeneration Design

## Goal

Regenerate the base generated building art so non-field buildings match the newer top-down promotion building direction while keeping the existing field tiles unchanged.

## Scope

- Keep the existing field source and field row from `generated-fields-topdown-v1.png`.
- Regenerate the non-field base building source:
  - center, hut, ondol, storehouse, lumberCamp
  - huntLodge, herbHut, smithy, tannery, market
  - palisade, watchtower, beacon, garrison
  - one spare utility building source cell for the existing 15-cell source layout
- Use the newer top-down promotion buildings as the style reference.
- Generate the normal building source first.
- Generate the winter building source from the approved normal source as the reference, preserving silhouettes, footprint, camera angle, and layout while adding snow and frost.

## Asset Flow

The runtime output stays `public/assets/folk-buildings-generated-v1.png`, with the same 15 columns and 3 rows expected by `src/render/generatedBuildingAssets.ts`.

The source files stay:

- `tools/render/source_images/generated-buildings-normal-v1.png`
- `tools/render/source_images/generated-buildings-snow-v1.png`
- `tools/render/source_images/generated-fields-topdown-v1.png`

The compose script continues to pack the output:

- row 0: normal non-field buildings plus the existing field fallback cell
- row 1: winter non-field buildings plus the existing winter field fallback cell
- row 2: existing seasonal field tiles

## Visual Requirements

- Top-down or near-top-down view, consistent with `promotion-buildings-topdown-normal-v1.png`.
- Korean folk-painting influenced pixel-art material language, warm mineral colors, dark ink-like roof and outline accents.
- Each building must remain distinct at 28px.
- Winter cells must read as the same buildings, not redesigned alternatives.
- Transparent extraction still uses the existing chroma key and contact sheet detection pipeline.

## Testing

- Existing building routing tests must keep passing.
- Add or update source-box tests so the regenerated source still has a detectable 5x3 contact sheet.
- Add pixel tests for non-field rows so all generated building cells are non-empty and bottom aligned.
- Run the generated building render tests and `npm run build`.

