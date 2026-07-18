import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const appUrl = new URL('../../src/App.tsx', import.meta.url);
const boundaryUrl = new URL('../../src/components/LazyUiBoundary.tsx', import.meta.url);
const appSource = readFileSync(appUrl, 'utf8');

assert.ok(existsSync(boundaryUrl), 'lazy chunks need a reusable loading and import-failure boundary');
const boundarySource = readFileSync(boundaryUrl, 'utf8');

assert.match(appSource, /import \{[^}]*lazy[^}]*\} from 'react'/,
  'App must use React.lazy for measured non-initial UI');
for (const component of [
  'BattleSimulationSetup',
  'TacticalBattleScreen',
  'TacticalBattleReportModal',
  'WeaponAllocationDialog',
  'ExpeditionMusterDialog',
  'SaveSlotDialog',
  'SpecialResidentsWindow',
]) {
  assert.doesNotMatch(appSource, new RegExp(`import \\{ ${component}(?:,| \\})`),
    `${component} must not remain a static runtime import`);
  assert.match(appSource, new RegExp(`lazy\\(\\(\\) => import\\('[^']*${component.replace('SpecialResidentsWindow', 'dock/SpecialResidentsWindow')}'\\)`),
    `${component} must have an explicit lazy chunk boundary`);
}

assert.match(appSource, /import type \{ ExpeditionMusterRequest \}/,
  'the expedition request type must remain a type-only import');
assert.match(appSource, /<LazyUiBoundary[\s\S]*<TacticalBattleScreen/,
  'tactical entry must show a bounded loading state while preserving the battle state');
assert.match(boundarySource, /<Suspense[\s\S]*role="status"[\s\S]*aria-live="polite"/,
  'lazy loading feedback must be announced accessibly');
assert.match(boundarySource, /componentDidCatch|componentDidMount/,
  'lazy import errors must be caught instead of blanking the application');
assert.match(boundarySource, /window\.location\.reload\(\)/,
  'the minimum chunk-load recovery path must be explicit');

console.log('lazy UI structure tests passed');
