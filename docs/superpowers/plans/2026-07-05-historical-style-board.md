# Historical Style Board Implementation Plan

> **계획 상태:** 완료
> **상태 갱신:** 2026-07-29 — folk warm 방향을 선정하고 역사 지형·건물 에셋에 반영했다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate and preserve three comparable late-Joseon northern-frontier pixel-art style boards so the project can choose a visual direction before production atlas work begins.

**Architecture:** Treat image generation as a controlled exploration stage. Store prompts and selected outputs under `docs/assets/styleboards/`, build a review document that compares the generated boards, and stop for user selection before any renderer or atlas integration.

**Tech Stack:** Built-in `image_gen` tool, Markdown review docs, existing React/Vite game context, optional browser visual companion for side-by-side review.

---

## File Structure

- Create `docs/assets/styleboards/prompts.md`
  Records the exact prompts used for the three style-board generations.
- Create `docs/assets/styleboards/style-board-a-frontier-muted.png`
  Generated board A, focused on muted historical-survival readability.
- Create `docs/assets/styleboards/style-board-b-folk-warm.png`
  Generated board B, focused on warmer folk-painting color influence while staying pixel-art.
- Create `docs/assets/styleboards/style-board-c-cold-border.png`
  Generated board C, focused on high-contrast northern border survival.
- Create `docs/assets/styleboards/review.md`
  Side-by-side review page with image links, success criteria, and a user-selection checkpoint.
- No changes to `src/render/atlas.ts`, `src/render/renderer.ts`, or `src/render/sprites.ts` in this plan.

---

### Task 1: Prepare Style-Board Prompt Pack

**Files:**
- Create: `docs/assets/styleboards/prompts.md`

- [ ] **Step 1: Create the prompt pack**

Use `apply_patch` to create `docs/assets/styleboards/prompts.md` with this content:

```markdown
# Historical Pixel Style Board Prompts

## Shared Constraints

- Use case: stylized-concept
- Asset type: browser game pixel-art style board
- Camera: square top-down tile game, not isometric
- Target readability: must remain readable when reduced toward 28px tiles
- Setting: late-Joseon northern frontier settlement near the Tumen River
- Required categories: four-season terrain, representative buildings, and small role silhouettes
- Required terrain: plain, forest, river, mountain, fertile field ground, hunting ground
- Required buildings: town center, thatched hut, ondol house, storehouse, wooden palisade, beacon mound or beacon tower
- Required characters: two Joseon settlers, one watchman or militia, one northern raider
- Avoid: generic medieval European fantasy, stone castles, wizard robes, modern objects, anime character proportions, isometric camera, labels, captions, UI text, watermarks

## Board A: Frontier Muted

Create a square pixel-art style board for a survival settlement game set in the late-Joseon northern frontier near the Tumen River. Show a compact grid of sample game sprites, not a poster and not a polished concept painting.

Include four seasonal rows: spring, summer, autumn, winter. Each season should show readable square top-down terrain samples for plain ground, forest, river, mountain, fertile ground, and hunting ground. Winter must include snowfield, frozen river, and snow-loaded forest. Spring should show planting-season soil and fresh green; summer should show dense but readable greenery; autumn should show dry grass and harvest tones.

Include small representative building sprites in the same board: town center, thatched hut, ondol house, storehouse, wooden palisade, and beacon signal structure. The buildings should use late-Joseon frontier materials: timber, earth walls, straw thatch, dark roof accents, simple military frontier construction. Add small role silhouettes: two Joseon settlers in practical clothing, one watchman or militia, one northern raider. Keep silhouettes strong and readable at small size.

Style: muted historical-survival pixel art, restrained earthy palette, crisp tile edges, subtle dark outlines, practical production sprite tone. No labels, no text, no watermark.

## Board B: Folk Warm

Create a square pixel-art style board for a survival settlement game set in the late-Joseon northern frontier near the Tumen River. Show a compact grid of sample game sprites, not a poster and not a polished concept painting.

Include four seasonal rows: spring, summer, autumn, winter. Each season should show readable square top-down terrain samples for plain ground, forest, river, mountain, fertile ground, and hunting ground. Winter must include snowfield, frozen river, and snow-loaded forest. Spring should show planting-season soil and fresh green; summer should show dense but readable greenery; autumn should show dry grass and harvest tones.

Include small representative building sprites in the same board: town center, thatched hut, ondol house, storehouse, wooden palisade, and beacon signal structure. The buildings should use late-Joseon frontier materials: timber, earth walls, straw thatch, dark roof accents, simple military frontier construction. Add small role silhouettes: two Joseon settlers in practical clothing, one watchman or militia, one northern raider. Keep silhouettes strong and readable at small size.

Style: Korean folk-painting influenced pixel art but still practical for a game, warmer mineral pigments, clean readable silhouettes, simple decorative accents only where they do not hurt tile readability. No labels, no text, no watermark.

## Board C: Cold Border

Create a square pixel-art style board for a survival settlement game set in the late-Joseon northern frontier near the Tumen River. Show a compact grid of sample game sprites, not a poster and not a polished concept painting.

Include four seasonal rows: spring, summer, autumn, winter. Each season should show readable square top-down terrain samples for plain ground, forest, river, mountain, fertile ground, and hunting ground. Winter must include snowfield, frozen river, and snow-loaded forest. Spring should show planting-season soil and fresh green; summer should show dense but readable greenery; autumn should show dry grass and harvest tones.

Include small representative building sprites in the same board: town center, thatched hut, ondol house, storehouse, wooden palisade, and beacon signal structure. The buildings should use late-Joseon frontier materials: timber, earth walls, straw thatch, dark roof accents, simple military frontier construction. Add small role silhouettes: two Joseon settlers in practical clothing, one watchman or militia, one northern raider. Keep silhouettes strong and readable at small size.

Style: high-contrast cold frontier pixel art, strong winter readability, sharper silhouettes, blue-gray snow and river tones balanced with warm timber and straw. It should feel harsh and defensive without becoming fantasy horror. No labels, no text, no watermark.
```

- [ ] **Step 2: Verify prompt pack exists**

Run:

```powershell
Get-Content -LiteralPath 'docs\assets\styleboards\prompts.md' -Encoding UTF8
```

Expected: the file prints the shared constraints and the three named prompts.

- [ ] **Step 3: Commit prompt pack**

Run:

```powershell
git add docs/assets/styleboards/prompts.md
git commit -m "Add historical style board prompts"
```

Expected: a commit is created with only `docs/assets/styleboards/prompts.md`.

---

### Task 2: Generate Board A

**Files:**
- Create: `docs/assets/styleboards/style-board-a-frontier-muted.png`

- [ ] **Step 1: Generate the image**

Use the built-in `image_gen` tool with the full `Board A: Frontier Muted` prompt from `docs/assets/styleboards/prompts.md`.

Expected: one generated square image containing a compact pixel-art style board with four-season terrain samples, representative buildings, and role silhouettes.

- [ ] **Step 2: Copy the selected generated image into the project**

Use PowerShell to copy the generated image returned by the tool into:

```text
docs/assets/styleboards/style-board-a-frontier-muted.png
```

Use the actual generated-image path returned by `image_gen` as the source. Do not overwrite any other generated board.

- [ ] **Step 3: Inspect the saved image**

Use the local image viewer tool on:

```text
docs/assets/styleboards/style-board-a-frontier-muted.png
```

Expected:

- no visible text labels or watermark
- four seasons are visually distinguishable
- buildings read as frontier Joseon rather than European fantasy
- small characters are simple role silhouettes

- [ ] **Step 4: Commit Board A**

Run:

```powershell
git add docs/assets/styleboards/style-board-a-frontier-muted.png
git commit -m "Add muted frontier style board"
```

Expected: a commit is created with only Board A.

---

### Task 3: Generate Board B

**Files:**
- Create: `docs/assets/styleboards/style-board-b-folk-warm.png`

- [ ] **Step 1: Generate the image**

Use the built-in `image_gen` tool with the full `Board B: Folk Warm` prompt from `docs/assets/styleboards/prompts.md`.

Expected: one generated square image containing a warmer Korean folk-painting influenced pixel-art style board while preserving game readability.

- [ ] **Step 2: Copy the selected generated image into the project**

Use PowerShell to copy the generated image returned by the tool into:

```text
docs/assets/styleboards/style-board-b-folk-warm.png
```

Use the actual generated-image path returned by `image_gen` as the source. Do not overwrite Board A.

- [ ] **Step 3: Inspect the saved image**

Use the local image viewer tool on:

```text
docs/assets/styleboards/style-board-b-folk-warm.png
```

Expected:

- no visible text labels or watermark
- folk influence appears in palette and simplified forms, not decorative clutter
- terrain remains readable across spring, summer, autumn, and winter
- buildings remain practical production sprites

- [ ] **Step 4: Commit Board B**

Run:

```powershell
git add docs/assets/styleboards/style-board-b-folk-warm.png
git commit -m "Add warm folk style board"
```

Expected: a commit is created with only Board B.

---

### Task 4: Generate Board C

**Files:**
- Create: `docs/assets/styleboards/style-board-c-cold-border.png`

- [ ] **Step 1: Generate the image**

Use the built-in `image_gen` tool with the full `Board C: Cold Border` prompt from `docs/assets/styleboards/prompts.md`.

Expected: one generated square image containing a high-contrast cold-frontier pixel-art style board with strong winter readability.

- [ ] **Step 2: Copy the selected generated image into the project**

Use PowerShell to copy the generated image returned by the tool into:

```text
docs/assets/styleboards/style-board-c-cold-border.png
```

Use the actual generated-image path returned by `image_gen` as the source. Do not overwrite Board A or Board B.

- [ ] **Step 3: Inspect the saved image**

Use the local image viewer tool on:

```text
docs/assets/styleboards/style-board-c-cold-border.png
```

Expected:

- no visible text labels or watermark
- winter variants stay readable without washing out other seasons
- silhouettes are strong but not fantasy-horror
- buildings still communicate late-Joseon frontier construction

- [ ] **Step 4: Commit Board C**

Run:

```powershell
git add docs/assets/styleboards/style-board-c-cold-border.png
git commit -m "Add cold border style board"
```

Expected: a commit is created with only Board C.

---

### Task 5: Build Review Document

**Files:**
- Create: `docs/assets/styleboards/review.md`

- [ ] **Step 1: Create the review document**

Use `apply_patch` to create `docs/assets/styleboards/review.md` with this content:

```markdown
# Historical Pixel Style Board Review

## Goal

Choose the visual direction for the first custom Northern Frontier pixel-art atlas pass.

## Options

### A. Frontier Muted

![Frontier Muted](style-board-a-frontier-muted.png)

Best if the project should feel restrained, grounded, and survival-focused.

### B. Folk Warm

![Folk Warm](style-board-b-folk-warm.png)

Best if the project should feel more visibly Korean and hand-crafted while staying readable.

### C. Cold Border

![Cold Border](style-board-c-cold-border.png)

Best if the project should emphasize harsh northern climate, defense, and winter readability.

## Review Criteria

- Reads clearly as late-Joseon northern frontier, not generic fantasy.
- Shows all four seasons clearly.
- Terrain categories remain distinguishable.
- Buildings have stable silhouettes suitable for future atlas extraction.
- Characters read as roles at small scale.
- The direction can work with the existing square-tile camera and `SpriteAPI` renderer.

## Review Checkpoint

After the boards are generated, choose A, B, C, or a hybrid direction such as "A palette with C silhouettes." The selected direction will become a separate style-guide task after review.
```

- [ ] **Step 2: Verify all linked files exist**

Run:

```powershell
Test-Path 'docs\assets\styleboards\style-board-a-frontier-muted.png'
Test-Path 'docs\assets\styleboards\style-board-b-folk-warm.png'
Test-Path 'docs\assets\styleboards\style-board-c-cold-border.png'
Test-Path 'docs\assets\styleboards\review.md'
```

Expected: all four commands print `True`.

- [ ] **Step 3: Commit the review document**

Run:

```powershell
git add docs/assets/styleboards/review.md
git commit -m "Add style board review guide"
```

Expected: a commit is created with only `review.md`.

- [ ] **Step 4: User review checkpoint**

Show the three boards to the user, either inline in chat or through the visual companion. Ask the user to choose A, B, C, or a hybrid such as "A palette with C silhouettes."

Expected: the user gives a direction before a separate style-guide plan or task starts.

---

## Verification

After all tasks in this plan are complete, run:

```powershell
git status --short --branch
git log --oneline --decorate -6
```

Expected:

- working tree has no unintended edits
- recent commits include the prompt pack, three boards, and review guide
- no source code or renderer files changed in this style-board-only pass

## Self-Review

- Spec coverage: this plan covers style-board generation, four-season terrain, representative buildings, role silhouettes, and review. It intentionally does not cover selected style-guide writing or production atlas integration.
- Red-flag scan: dynamic generated-image source paths come from `image_gen` at execution time; all destination paths, prompts, and review criteria are concrete.
- Type consistency: no TypeScript types or renderer APIs are changed in this plan.


