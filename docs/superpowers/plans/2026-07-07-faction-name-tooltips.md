# Faction Name Tooltips Implementation Plan

> **계획 상태:** 완료
> **상태 갱신:** 2026-07-29 — 세력 색상명과 설명 툴팁을 구현했다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace dense `Faction(desc)` modal text with colored faction names whose native tooltips show the faction description.

**Architecture:** Keep game state and save data simple by leaving modal bodies as strings and faction names in `PendingChoice.data.faction`. Add static faction color metadata, then render known faction-name substrings through a focused React component in UI surfaces that display faction names.

**Tech Stack:** TypeScript, React 18, Vite, Node-based game module tests.

---

## File Structure

- Modify `src/game/constants.ts`: add `color: string` to the `Faction` interface and each `FACTIONS` entry.
- Modify `src/game/events.ts`: remove `(${faction.desc})` from trade modal bodies.
- Modify `src/game/raids.ts`: remove `(${faction.desc})` from raid modal bodies.
- Create `src/components/FactionName.tsx`: reusable label component and body highlighter helper.
- Modify `src/components/EventModal.tsx`: render modal body through faction highlighter when `choice.data.faction` is present.
- Modify `src/components/InspectorPanel.tsx`: use `FactionName` in the factions tab and market trade buttons.
- Modify `src/components/GameCanvas.tsx`: use `FactionName` in raider hover tooltip.
- Modify `tools/game/test_trades.mjs`: add failing assertions that trade modal bodies no longer include parenthetical faction descriptions.
- Modify `tools/game/test_battles.mjs`: add a failing assertion for raid modal body text.

---

### Task 1: Add Failing Text Tests

**Files:**
- Modify: `tools/game/test_trades.mjs`
- Modify: `tools/game/test_battles.mjs`

- [ ] **Step 1: Add trade modal body assertions**

Add assertions after `const c = state.pendingChoice;` in the `requestTrade` block:

```js
const faction = FACTIONS.find(f => f.name === TRADER);
assert.ok(c.body.includes(TRADER));
assert.equal(c.body.includes(`(${faction.desc})`), false);
```

Add a new block for incoming trade offers:

```js
{
  const state = withMarket(simulation.newGame(66));
  const faction = FACTIONS.find(f => f.name === TRADER);
  state.lastTradeDay = -999;
  state.resources[faction.trades[0].give] = faction.trades[0].giveAmt + 5;
  assert.equal(events.maybeOfferTrade(state, () => 0, 999), true);
  assert.ok(state.pendingChoice.body.includes(TRADER));
  assert.equal(state.pendingChoice.body.includes(`(${faction.desc})`), false);
}
```

- [ ] **Step 2: Add raid modal body assertion**

Add this block before `console.log('battle tests passed');`:

```js
{
  const state = simulation.newGame(6161);
  const { FACTIONS } = await import(pathToFileURL(join(compiledDir, 'constants.mjs')).href);
  const faction = FACTIONS.find(f => f.hostile);
  raids.openRaidChoice(state, () => 0, true, 42, faction.name);
  assert.ok(state.pendingChoice.body.includes(faction.name));
  assert.equal(state.pendingChoice.body.includes(`(${faction.desc})`), false);
}
```

- [ ] **Step 3: Verify RED**

Run:

```bash
node tools/game/test_trades.mjs
node tools/game/test_battles.mjs
```

Expected: each new assertion fails because the current modal bodies still contain `(${faction.desc})`.

---

### Task 2: Remove Inline Descriptions and Add Faction Colors

**Files:**
- Modify: `src/game/constants.ts`
- Modify: `src/game/events.ts`
- Modify: `src/game/raids.ts`

- [ ] **Step 1: Add faction color metadata**

Update the interface:

```ts
export interface Faction {
  name: string;
  hostile: boolean;
  desc: string;
  color: string;
  trades: TradeOffer[];
  initialRelation: number;
}
```

Use these colors:

```ts
오도리 씨족: '#58b6a4'
올량합 부락: '#d6a84f'
골간 우디캐: '#5ba7d8'
니마차 우디캐: '#78b95e'
홀라온 야인: '#d96f5f'
변경 마적: '#b56f7a'
```

- [ ] **Step 2: Remove parenthetical descriptions from modal body strings**

In `src/game/events.ts`, change:

```ts
body: `${faction.name}(${faction.desc})이 장터에 찾아왔습니다.\n` +
```

to:

```ts
body: `${faction.name}이 장터에 찾아왔습니다.\n` +
```

and change:

```ts
body: `${faction.name}(${faction.desc})에 먼저 사람을 보냈습니다.\n무엇을 바꾸시겠습니까?`,
```

to:

```ts
body: `${faction.name}에 먼저 사람을 보냈습니다.\n무엇을 바꾸시겠습니까?`,
```

In `src/game/raids.ts`, change:

```ts
`${faction.name}(${faction.desc})이 마을로 몰려오고 있습니다.`
```

to:

```ts
`${faction.name}이 마을로 몰려오고 있습니다.`
```

- [ ] **Step 3: Verify GREEN for text tests**

Run:

```bash
node tools/game/test_trades.mjs
node tools/game/test_battles.mjs
```

Expected: both commands exit 0.

---

### Task 3: Add Reusable Faction UI Rendering

**Files:**
- Create: `src/components/FactionName.tsx`
- Modify: `src/components/EventModal.tsx`
- Modify: `src/components/InspectorPanel.tsx`
- Modify: `src/components/GameCanvas.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Create `FactionName` component**

Create:

```tsx
import type { ReactNode } from 'react';
import { FACTIONS } from '../game/constants';

function factionByName(name: string) {
  return FACTIONS.find(f => f.name === name);
}

export function FactionName({ name, className = '' }: { name: string; className?: string }) {
  const faction = factionByName(name);
  return (
    <span
      className={`faction-name${className ? ` ${className}` : ''}`}
      style={faction ? { color: faction.color } : undefined}
      title={faction?.desc}
    >
      {name}
    </span>
  );
}

export function renderFactionText(text: string, factionName: unknown): ReactNode {
  if (typeof factionName !== 'string' || !factionName || !text.includes(factionName)) return text;
  const parts = text.split(factionName);
  return parts.flatMap((part, index) => (
    index === parts.length - 1
      ? [part]
      : [part, <FactionName key={`${factionName}-${index}`} name={factionName} />]
  ));
}
```

- [ ] **Step 2: Render event modal body with faction labels**

In `src/components/EventModal.tsx`, import `renderFactionText`, split body lines by `\n`, and render each line through the helper:

```tsx
const bodyLines = choice.body.split('\n');
...
<div className="body">
  {bodyLines.map((line, i) => (
    <div key={i}>{renderFactionText(line, choice.data.faction)}</div>
  ))}
</div>
```

- [ ] **Step 3: Reuse `FactionName` in inspector and map tooltip**

Use `<FactionName name={f.name} />` in the factions tab row title and market trade buttons. Use `<FactionName name={state.raiders!.faction} />` in `GameCanvas` raider tooltip.

- [ ] **Step 4: Add restrained label styling**

Add to `src/styles/global.css`:

```css
.faction-name {
  font-weight: 700;
  text-decoration: underline dotted currentColor 1px;
  text-underline-offset: 2px;
}
```

- [ ] **Step 5: Verify TypeScript build**

Run:

```bash
npm run build
```

Expected: `tsc` and Vite build finish with exit 0.

---

### Task 4: Final Verification and Commit

**Files:**
- All modified files from Tasks 1-3

- [ ] **Step 1: Run targeted tests**

Run:

```bash
node tools/game/test_trades.mjs
node tools/game/test_battles.mjs
```

Expected: both commands exit 0 and print their success messages.

- [ ] **Step 2: Run project build**

Run:

```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 3: Inspect diff**

Run:

```bash
git diff --stat
git diff --check
git status --short
```

Expected: no whitespace errors, and only planned files are modified.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add src/game/constants.ts src/game/events.ts src/game/raids.ts src/components/FactionName.tsx src/components/EventModal.tsx src/components/InspectorPanel.tsx src/components/GameCanvas.tsx src/styles/global.css tools/game/test_trades.mjs tools/game/test_battles.mjs docs/superpowers/plans/2026-07-07-faction-name-tooltips.md
git commit -m "Add faction color labels and tooltips"
```
