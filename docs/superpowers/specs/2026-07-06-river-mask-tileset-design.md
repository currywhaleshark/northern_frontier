# River Mask Tileset Pipeline Design

## Purpose

Build a stable production workflow for 28px river autotiles in the selected Folk Warm historical art direction. The workflow must avoid asking image generation to solve strict connector geometry. Instead, deterministic masks define the river shape, and generated art supplies palette, texture, and seasonal mood.

## Problem

The current generated river connector candidates contain useful color and folk-warm texture, but they are not reliable production tiles. Water width changes between shapes, edge-center contacts drift by a few pixels, and decorative bank detail crosses tile boundaries. These issues are especially visible after downscaling to the 28px game tile size.

For map flow, river tiles need exact north, east, south, and west connection points. A visually attractive generated sheet is not enough if adjacent tiles do not meet cleanly.

## Recommended Approach

Use a mask-first tileset builder.

1. Define exact 28px masks for each river connector shape.
2. Use generated source images only for water, bank, ice, and seasonal land textures.
3. Clip those textures into the fixed masks with a script.
4. Export a 28px sheet, a 4x nearest-neighbor preview, and seam-test preview maps.
5. Validate edge contacts and water width automatically before considering a sheet usable.

This makes connector geometry deterministic while preserving the visual warmth of the generated Folk Warm direction.

## Tile Scope

The first production pass should include these connector shapes:

- vertical straight
- horizontal straight
- four corners
- four river ends
- four T junctions
- cross
- source pool

Each shape should be exported for four seasons: spring, summer, autumn, and winter. Winter uses the same connector masks as other seasons, but swaps water treatment for ice-blue frozen river texture.

## Geometry Rules

All connector masks are authored at the final game size of 28px. The water band must meet tile edges at fixed centered contact points. A first pass should use a consistent 8px water width, centered on the tile edge.

The mask owns:

- water body shape
- exact edge contact pixels
- corner radius and join shape
- inner bank boundary
- optional outer bank ring

Generated imagery must never change connector geometry. If a generated texture contains a different river path, the script samples only color and texture from it, not shape.

## Art Direction Rules

The output should match the selected Folk Warm style:

- warm mineral greens and ochres for spring, summer, and autumn banks
- pale blue-gray snow and ice for winter
- quiet handmade texture, not high-noise ornament
- readable 28px shapes over painterly detail
- Korean folk-painting influence through palette and softness, not literal symbols

The script may apply small deterministic texture variation per tile, but that variation must not affect tile-edge contact pixels.

## Pipeline Components

### Mask Definitions

Store connector definitions in a small data table. Each connector declares north, east, south, and west openings. The builder derives the shape from those openings or reads explicit mask PNGs if hand-authored masks are easier to tune.

The first implementation uses procedural masks generated from the connector table. Hand-authored mask PNGs are a later tuning option, not part of the first pass.

### Texture Inputs

Use source images for:

- seasonal water texture
- seasonal bank texture
- seasonal land texture
- winter ice texture

These can come from image generation, hand painting, or sampled regions of the current generated candidates.

### Builder Script

The script produces:

- `river-mask-autotile-28px-sheet.png`
- `river-mask-autotile-28px-preview-4x.png`
- `river-mask-autotile-seam-preview.png`
- optional individual tile PNGs for inspection

The sheet order should match the existing v2 notes: core shapes first, then ends, T junctions, cross, and source.

### Validation

The builder should fail when:

- a connector opening does not touch the required edge-center pixels
- two tiles with matching openings do not share identical edge water pixels
- water width differs from the configured width at an edge
- non-water decorative pixels intrude into the protected connection corridor

The builder may warn when a generated texture source is too low contrast, too noisy at 28px, or too visually different from the selected Folk Warm terrain candidate. These warnings are art-direction checks, not geometry checks.

The preview should include common river paths so visual seams are easy to inspect: straight runs, S curves, loops, T junctions, and source/end combinations across all seasons.

## Integration Plan Boundary

This design does not integrate the finished atlas into the renderer yet. The first implementation should focus on producing and validating clean river assets under `docs/assets/terrain/river/`. Runtime integration can follow once the preview sheet is visually acceptable.

## Success Criteria

- The six core river shapes connect cleanly at 28px with no visible gaps.
- Spring, summer, autumn, and winter rows share the same geometry.
- The preview looks consistent with the Folk Warm terrain candidate.
- Generated texture contributes style without changing connector structure.
- The workflow can be rerun deterministically after adjusting colors, width, or texture sources.
