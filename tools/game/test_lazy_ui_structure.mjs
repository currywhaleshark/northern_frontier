import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const appUrl = new URL('../../src/App.tsx', import.meta.url);
const sessionUrl = new URL('../../src/GameSession.tsx', import.meta.url);
const boundaryUrl = new URL('../../src/components/LazyUiBoundary.tsx', import.meta.url);
const appSource = readFileSync(appUrl, 'utf8');
const sessionSource = readFileSync(sessionUrl, 'utf8');
const lazySource = `${appSource}\n${sessionSource}`;

assert.ok(existsSync(boundaryUrl), 'lazy chunks need a reusable loading and import-failure boundary');
const boundarySource = readFileSync(boundaryUrl, 'utf8');

assert.match(appSource, /import \{[^}]*lazy[^}]*\} from 'react'/,
  'App must use React.lazy for measured non-initial UI');
assert.match(appSource, /lazy\(\(\) => import\('\.\/GameSession'\)\)/,
  'the complete game session must remain outside the initial menu chunk');
assert.match(appSource, /<LazyUiBoundary[^>]*label="게임"[\s\S]*<GameSession/,
  'game-session loading must have an explicit bounded fallback');
assert.doesNotMatch(appSource, /^import .*\.\/game\/(?:simulation|saveLoad|tacticalBattle)['"];?$/m,
  'the menu shell must not statically pull game-session engines into the initial chunk');
assert.match(appSource, /await import\('\.\/game\/saveLoad'\)/,
  'save deserialization must load only after the player chooses a slot');
assert.match(sessionSource,
  /useState\(\(\) => initialSessionState\(launch\)\)[\s\S]*useRef\(initialState\)/,
  'the delayed session must create exactly one initial game state for its launch request');
for (const component of [
  'BattleSimulationSetup',
  'TacticalBattleScreen',
  'TacticalBattleReportModal',
  'WeaponAllocationDialog',
  'ExpeditionMusterDialog',
  'SaveSlotDialog',
  'SpecialResidentsWindow',
]) {
  assert.doesNotMatch(lazySource, new RegExp(`import \\{ ${component}(?:,| \\})`),
    `${component} must not remain a static runtime import`);
  assert.match(lazySource, new RegExp(`lazy\\(\\(\\) => import\\('[^']*${component.replace('SpecialResidentsWindow', 'dock/SpecialResidentsWindow')}'\\)`),
    `${component} must have an explicit lazy chunk boundary`);
}

assert.match(sessionSource, /import type \{ ExpeditionMusterRequest \}/,
  'the expedition request type must remain a type-only import');
assert.match(sessionSource, /<LazyUiBoundary[\s\S]*<TacticalBattleScreen/,
  'tactical entry must show a bounded loading state while preserving the battle state');
assert.match(boundarySource, /<Suspense[\s\S]*role="status"[\s\S]*aria-live="polite"/,
  'lazy loading feedback must be announced accessibly');
assert.match(boundarySource, /componentDidCatch|componentDidMount/,
  'lazy import errors must be caught instead of blanking the application');
assert.match(boundarySource, /window\.location\.reload\(\)/,
  'the minimum chunk-load recovery path must be explicit');

console.log('lazy UI structure tests passed');
