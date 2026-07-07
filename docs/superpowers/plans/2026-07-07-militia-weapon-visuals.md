# Militia Weapon Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visible 수비병 weapon variants for 창, 각궁, and 조총 while keeping the existing `militia` job and battle math.

**Architecture:** Add a small render-only militia weapon asset module and a pure assignment helper. Renderer passes a display weapon into resident draw params, and atlas uses a new 3x2 sprite sheet when that weapon is present. Existing game save data and defense allocation stay unchanged.

**Tech Stack:** TypeScript render modules, Python/Pillow sprite packing, existing Node `.mjs` tests, Vite build, built-in image generation.

---

### Task 1: Tests

**Files:**
- Create: `tools/render/test_militia_weapon_assets.mjs`
- Create: `tools/render/test_militia_weapon_asset_pixels.py`

- [ ] Add tests for `MILITIA_WEAPON_SHEET`, weapon source rects, and stable weapon assignment.
- [ ] Add pixel tests for `public/assets/militia-weapons-generated-v1.png`.
- [ ] Run both tests and confirm they fail before implementation.

### Task 2: Asset Pipeline

**Files:**
- Create: `src/render/militiaWeaponAssets.ts`
- Create: `src/render/militiaWeaponAssignment.ts`
- Create: `tools/render/compose_militia_weapon_assets_v1.py`
- Create/modify: `tools/render/source_images/militia-weapons-v1.png`
- Create/modify: `public/assets/militia-weapons-generated-v1.png`

- [ ] Generate a 3x2 source sheet: male row, female row; columns 창, 각궁, 조총.
- [ ] Compose it to a 28x40 runtime sheet.
- [ ] Verify source and output visually.

### Task 3: Runtime Routing

**Files:**
- Modify: `src/render/sprites.ts`
- Modify: `src/render/renderer.ts`
- Modify: `src/render/atlas.ts`

- [ ] Add optional `militiaWeapon` to resident draw params.
- [ ] Pass `militiaWeaponForResident(state, r)` from the renderer.
- [ ] Load and draw the militia weapon sheet before the base character fallback.

### Task 4: Verification

Run:

```bash
node tools/render/test_militia_weapon_assets.mjs
python tools/render/test_militia_weapon_asset_pixels.py
node tools/render/test_generated_character_assets.mjs
python tools/render/test_generated_character_asset_pixels.py
node tools/render/test_promotion_assets.mjs
python tools/render/test_promotion_asset_pixels.py
git diff --check
npm run build
```

Expected: all commands exit 0.

