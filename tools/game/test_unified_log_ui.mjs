import { readAppCss } from '../app-stylesheets.mjs';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../src/GameSession.tsx', import.meta.url), 'utf8');
const logSource = readFileSync(new URL('../../src/components/UnifiedLog.tsx', import.meta.url), 'utf8');
const cssSource = readAppCss();

assert.match(appSource, /<Profiler id="log-boundary"[\s\S]*?<RuntimeVersionBoundary store=\{uiVersionStore\}>[\s\S]*?<UnifiedLog state=\{stateRef\.current\}/,
  'App must render one unified log over the canvas through its management snapshot boundary');
assert.doesNotMatch(appSource, /ImportantLogOverlay|<EventLog/,
  'App must not retain either legacy log surface');
assert.equal(existsSync(new URL('../../src/components/ImportantLogOverlay.tsx', import.meta.url)), false,
  'the legacy important-log overlay must be removed');
assert.equal(existsSync(new URL('../../src/components/EventLog.tsx', import.meta.url)), false,
  'the legacy full event log must be removed');

assert.match(logSource, /entry\.important \|\| entry\.kind === 'raid'[\s\S]*\.slice\(-4\)[\s\S]*\.reverse\(\)/,
  'collapsed mode must preserve the latest four important or raid entries');
for (const kind of ['all', 'info', 'good', 'bad', 'raid', 'weather', 'trade']) {
  assert.match(logSource, new RegExp(`id: ['"]${kind}['"]`), `${kind} must remain available as a log filter`);
}
assert.match(logSource, /entry\.important && <span className="unified-log-important"/,
  'important entries must retain a visible importance marker');
assert.match(logSource, /pinnedOpen \|\| hovered \|\| focused/,
  'mouse, keyboard focus, and pinned touch interaction must all expand the history');
assert.match(logSource, /aria-expanded=\{expanded\}[\s\S]*aria-pressed=\{pinnedOpen\}/,
  'the expand control must expose its transient and pinned state');
assert.match(logSource, /list\.scrollTop <= 40[\s\S]*list\.scrollTop = 0/,
  'new entries must retain the legacy latest-entry scroll behavior');

assert.match(cssSource, /\.unified-log\s*\{[\s\S]*top:\s*8px;[\s\S]*left:\s*8px;/,
  'the unified log must use the upper-left canvas anchor');
assert.match(cssSource, /\.unified-log\.expanded\s*\{[\s\S]*max-height:\s*min\(520px, calc\(100% - 74px\)\);/,
  'expanded history must reserve the lower construction controls');
assert.match(cssSource, /\.unified-log-list\s*\{[\s\S]*overflow-y:\s*auto;/,
  'full history must scroll inside the overlay without pausing the game');
assert.doesNotMatch(cssSource, /\.important-log-overlay|\.event-log-panel/,
  'legacy log layout rules must be removed');

console.log('unified log UI tests passed');
