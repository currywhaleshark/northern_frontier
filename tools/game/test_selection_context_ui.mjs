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

assert.match(drawerSource, /if \(selectionActive\)[\s\S]*openCategory: null/,
  'new selections must collapse an expanded build drawer');
assert.match(drawerSource, /const startPlacement[\s\S]*onClearSelection\(\)[\s\S]*setPlacingType\(type\)/,
  'starting construction placement must clear the current selection first');
assert.match(cssSource, /\.selection-context-bar\s*\{[\s\S]*bottom:\s*58px;/,
  'the selection context must occupy the lower canvas above the build category bar');
assert.match(cssSource, /\.selection-context-bar\s*\{[\s\S]*right:\s*10px;[\s\S]*width:\s*clamp\(250px, 20vw, 360px\);/,
  'the selection context must remain a compact right-aligned panel');
assert.match(cssSource, /\.build-drawer-panel\s*\{[\s\S]*left:\s*0;[\s\S]*width:\s*clamp\(250px, 20vw, 360px\);/,
  'the expanded build drawer must remain a compact left-aligned panel');
assert.match(cssSource, /\.selection-context-body\s*\{[\s\S]*overflow:\s*auto;/,
  'long selection details must scroll inside the context bar');
assert.match(cssSource,
  /\.canvas-stage:has\(\.dock-frame\.has-open-windows\) \.selection-context-bar\s*\{\s*right:\s*326px;/,
  'an open dock window must reserve its width beside the selection context');

console.log('selection context UI tests passed');
