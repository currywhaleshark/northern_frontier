# Topdown Building Regeneration Implementation Plan

> **계획 상태:** 완료
> **상태 갱신:** 2026-07-29 — 계절 건물 에셋을 재생성하고 렌더 경로에 연결했다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regenerate the base generated building art so all non-field buildings use the newer top-down visual direction while fields stay unchanged.

**Architecture:** Keep the current runtime sprite contract intact: `public/assets/folk-buildings-generated-v1.png` remains a 15-column, 3-row sheet consumed by `generatedBuildingAssets.ts`. Replace the normal and snow source images, then reuse `compose_generated_building_assets_v1.py` to produce the final packed sheet. The snow source is generated from the approved normal source as a reference so winter buildings retain the same silhouettes.

**Tech Stack:** Python/Pillow asset packing, existing Node render-routing tests, Vite/TypeScript production build, built-in image generation for raster source sheets.

---

## File Structure

- Modify: `tools/render/source_images/generated-buildings-normal-v1.png`
  - New top-down source contact sheet for normal non-field buildings.
- Modify: `tools/render/source_images/generated-buildings-snow-v1.png`
  - Winter source contact sheet generated from the normal sheet as reference.
- Modify: `public/assets/folk-buildings-generated-v1.png`
  - Packed runtime output produced by the compose script.
- Modify: `tools/render/test_generated_building_asset_pixels.py`
  - Extend pixel checks to cover non-field building rows.
- Existing unchanged inputs:
  - `tools/render/source_images/generated-fields-topdown-v1.png`
  - `src/render/generatedBuildingAssets.ts`

### Task 1: Tighten Building Asset Tests

**Files:**
- Modify: `tools/render/test_generated_building_asset_pixels.py`

- [ ] **Step 1: Add non-field row coverage**

Add checks for rows 0 and 1 in `public/assets/folk-buildings-generated-v1.png` so every building cell is non-empty, fits inside its 28x40 cell, and sits near the bottom of the cell.

- [ ] **Step 2: Run the focused tests**

Run:

```bash
python tools/render/test_generated_building_asset_pixels.py
node tools/render/test_generated_building_assets.mjs
python tools/render/test_generated_building_source_boxes.py
```

Expected: current assets pass or reveal only coverage gaps; no implementation files should change yet.

### Task 2: Generate Normal Top-Down Source

**Files:**
- Modify: `tools/render/source_images/generated-buildings-normal-v1.png`

- [ ] **Step 1: Generate the normal source contact sheet**

Use built-in image generation. Prompt for a 5x3 contact sheet on a flat chroma-key background, in the same visual direction as `promotion-buildings-topdown-normal-v1.png`.

Required source order:

```text
0 center, 1 hut, 2 ondol, 3 storehouse, 4 lumberCamp,
5 huntLodge, 6 herbHut, 7 smithy, 8 tannery, 9 market,
10 palisade, 11 watchtower, 12 beacon, 13 garrison, 14 spare utility hut
```

- [ ] **Step 2: Inspect the generated source**

Open the image and verify:

- 15 separate buildings are present.
- All are top-down or near-top-down.
- No field tiles are included.
- Chroma-key background is flat enough for existing extraction.

### Task 3: Generate Winter Source From Normal Reference

**Files:**
- Modify: `tools/render/source_images/generated-buildings-snow-v1.png`

- [ ] **Step 1: Generate the winter source from the normal source reference**

Use the approved normal source as the visual reference. Prompt for the same 5x3 layout and same silhouettes, adding snow, frost, pale roof accumulation, and cold-season shading only.

- [ ] **Step 2: Inspect the generated winter source**

Open the image and verify:

- The building order matches the normal source.
- Buildings remain recognizable as the same designs.
- Snow does not erase important silhouettes.
- Chroma-key background is still flat enough for extraction.

### Task 4: Compose Runtime Sheet

**Files:**
- Modify: `public/assets/folk-buildings-generated-v1.png`

- [ ] **Step 1: Run the compose script**

Run:

```bash
python tools/render/compose_generated_building_assets_v1.py
```

Expected: script writes `public/assets/folk-buildings-generated-v1.png`.

- [ ] **Step 2: Inspect the packed sheet**

Open `public/assets/folk-buildings-generated-v1.png` and verify:

- Row 0 contains normal buildings.
- Row 1 contains winter versions of the same buildings.
- Row 2 field tiles are unchanged.

### Task 5: Verification

**Files:**
- All changed files

- [ ] **Step 1: Run focused render tests**

Run:

```bash
python tools/render/test_generated_building_asset_pixels.py
node tools/render/test_generated_building_assets.mjs
python tools/render/test_generated_building_source_boxes.py
node tools/render/test_promotion_assets.mjs
node tools/render/test_generated_character_assets.mjs
python tools/render/test_generated_character_asset_pixels.py
```

Expected: all commands exit 0.

- [ ] **Step 2: Run whitespace and build verification**

Run:

```bash
git diff --check
npm run build
```

Expected: no whitespace errors and production build exits 0.

- [ ] **Step 3: Review changed files**

Run:

```bash
git status --short
git diff --stat
```

Expected: changes are limited to the design/plan docs, building source/runtime assets, building pixel test, and the earlier character routing files unless explicitly revised.

