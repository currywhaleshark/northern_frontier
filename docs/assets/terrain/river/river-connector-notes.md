# Folk Warm River Connector Notes

## Goal

Replace the single downward-looking river sample with a connector-aware river source sheet that can support natural map flow.

The source target is a 12 columns x 4 rows sheet:

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
