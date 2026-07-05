# Folk Warm River Connector Notes

## Goal

Replace the single downward-looking river sample with a connector-aware river source sheet that can support natural map flow.

The initial v1 source target was a 12 columns x 4 rows sheet:

- columns: vertical, horizontal, four corners, four T junctions, cross, source/end
- rows: spring, summer, autumn, winter

These images are source candidates, not final renderer assets.

## Generated Candidate

- `folk-warm-river-connectors-source-v1.png`
  First connector-focused pass. It correctly treats the river as an autotile system rather than a single sample tile.

## 28px Probe

`folk-warm-river-connectors-v1-28px-sheet.png` is a direct 12x4 extraction from v1 downscaled to 28px per tile.

`folk-warm-river-connectors-v1-28px-preview-4x.png` is the same sheet enlarged 4x with nearest-neighbor scaling for review.

## Current Judgment

Use v1 as the first river connector candidate.

Carry forward:

- multiple flow directions instead of only vertical/downward river
- seasonal water and ice treatment
- edge-center connector logic that can become an autotile atlas

Improve before final atlas integration:

- normalize river width across straight, corner, T, and cross tiles
- make the edge contact points more mathematically consistent at 28px
- reduce small decorative bank noise where it interferes with seamless tiling
- decide whether river banks belong inside the river tile or remain a renderer overlay based on neighboring land

## Revised Core Requirement

The river connector set must include these six core shapes at minimum:

- vertical straight: `│`
- horizontal straight: `─`
- corner right-to-down: `┌`
- corner left-to-down: `┐`
- corner left-to-up: `┘`
- corner right-to-up: `└`

A river source sheet that does not clearly include these six shapes is not sufficient for map flow.

## Generated Candidate v2

- `folk-warm-river-connectors-source-v2-core6.png`
  Revised 16 columns x 4 rows source sheet. The first six columns are explicitly ordered as `│`, `─`, `┌`, `┐`, `┘`, `└`, followed by four river ends, four T junctions, a cross, and a single source pool.

## v2 28px Probe

`folk-warm-river-connectors-v2-core6-28px-sheet.png` is a direct 16x4 extraction from v2 downscaled to 28px per tile.

`folk-warm-river-connectors-v2-core6-28px-preview-4x.png` is the same sheet enlarged 4x with nearest-neighbor scaling for review.

## Current Preference

Prefer v2 over v1 for future river work because the six mandatory core shapes are visually explicit. Further cleanup should focus on normalizing water width and exact edge contact points before renderer integration.
