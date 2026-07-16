import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
const contextSource = readFileSync(new URL('../../src/components/SelectionContextBar.tsx', import.meta.url), 'utf8');
const drawerSource = readFileSync(new URL('../../src/components/BuildDrawer.tsx', import.meta.url), 'utf8');
const canvasSource = readFileSync(new URL('../../src/components/GameCanvas.tsx', import.meta.url), 'utf8');
const inspectorSource = readFileSync(new URL('../../src/components/InspectorPanel.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');

assert.match(appSource, /<SelectionContextBar\b[\s\S]*selectedEntity=\{selectedEntity\}/,
  'App must render the selection context from the canonical selected entity');
assert.match(appSource, /className="right-lower-stack"[\s\S]*<Minimap[\s\S]*<SelectionContextBar/,
  'the minimap and selection context must share one lower-right layout stack');
assert.match(contextSource, /selectedEntity\.kind === 'resident'/,
  'resident selection must render in the bottom context bar');
assert.match(contextSource, /foreignSiteAt[\s\S]*<ForeignSitePanel/,
  'foreign-site actions must remain available in the bottom context bar');
assert.match(contextSource, /<ActionPopup[\s\S]*embedded/,
  'building actions must reuse the established action controls inside the context bar');
assert.doesNotMatch(canvasSource, /ActionPopup/,
  'the map canvas must not keep a duplicate building action popup');
assert.doesNotMatch(inspectorSource, /tab === 'tile'|ResidentDetail/,
  'the right inspector must no longer duplicate tile or resident selection details');

assert.doesNotMatch(drawerSource, /selectionActive/,
  'selection state must not close or disable the independently positioned build drawer');
assert.match(drawerSource, /const startPlacement[\s\S]*onClearSelection\(\)[\s\S]*setPlacingType\(type\)/,
  'starting construction placement must clear the current selection first');
assert.match(cssSource, /\.right-lower-stack\s*\{[\s\S]*right:\s*10px;[\s\S]*bottom:\s*58px;[\s\S]*align-items:\s*flex-end;/,
  'the shared lower-right stack must stay above the bottom controls');
assert.match(cssSource, /\.selection-context-bar\s*\{[\s\S]*position:\s*relative;[\s\S]*width:\s*clamp\(250px, 20vw, 360px\);/,
  'the selection context must remain compact inside the shared stack');
assert.match(cssSource, /\.build-drawer-shell\s*\{[\s\S]*left:\s*10px;[\s\S]*width:\s*clamp\(250px, 20vw, 360px\);[\s\S]*align-items:\s*stretch;/,
  'the build drawer and its category menu must share one compact left-aligned shell');
assert.match(cssSource, /\.selection-context-body\s*\{[\s\S]*overflow:\s*auto;/,
  'long selection details must scroll inside the context bar');
assert.match(cssSource,
  /\.canvas-stage:has\(\.dock-frame\.has-open-windows\) \.right-lower-stack\s*\{\s*right:\s*332px;/,
  'an open dock window must shift the minimap and selection context together');

console.log('selection context UI tests passed');
