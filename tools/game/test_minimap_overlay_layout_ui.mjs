import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');

assert.match(appSource,
  /className="right-lower-stack"[\s\S]*className="minimap-overlay"[\s\S]*<Minimap[\s\S]*<SelectionContextBar/,
  'the minimap must precede the optional selection context in one lower-right stack');
assert.match(cssSource,
  /\.right-lower-stack\s*\{[\s\S]*right:\s*10px;[\s\S]*bottom:\s*58px;[\s\S]*flex-direction:\s*column;[\s\S]*align-items:\s*flex-end;[\s\S]*pointer-events:\s*none;/,
  'the lower-right stack must reserve the bottom controls and pass unused pointer input through');
assert.match(cssSource, /\.minimap-overlay\s*\{[\s\S]*position:\s*relative;[\s\S]*flex:\s*0 0 auto;/,
  'the minimap must flow inside the shared stack rather than use an independent top-right coordinate');
assert.doesNotMatch(cssSource, /\.minimap-overlay\s*\{[^}]*top:\s*8px;/,
  'the minimap must no longer be anchored to the upper edge');
assert.match(cssSource,
  /\.canvas-stage:has\(\.dock-frame\.has-open-windows\) \.right-lower-stack\s*\{\s*right:\s*332px;/,
  'an open dock must shift the whole lower-right stack beside it');
assert.match(cssSource,
  /\.canvas-stage:has\(\.dock-frame\.has-open-windows\) \.right-overlay-stack\s*\{[\s\S]*right:\s*332px;/,
  'an open dock must also shift upper-right alerts beside it');

console.log('minimap overlay layout UI tests passed');
