import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
const dockSource = readFileSync(new URL('../../src/components/dock/DockFrame.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');

assert.match(appSource,
  /id:\s*'minimap'[\s\S]*className:\s*'hud-minimap-window'[\s\S]*className="minimap-overlay"[\s\S]*<Minimap/,
  'the minimap must be registered as a floating HUD window');
assert.match(dockSource, /overlayItems[\s\S]*floatingItems[\s\S]*windowOrder\.indexOf\(item\.id\)/,
  'HUD windows must share the management-window layer and global focus order');
assert.match(cssSource,
  /\.hud-minimap-window \.minimap-overlay\s*\{[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;[\s\S]*overflow:\s*auto;[\s\S]*pointer-events:\s*auto;/,
  'the minimap content must fill and scroll inside its resizable floating window');
assert.match(cssSource,
  /\.hud-minimap-window \.minimap-canvas-wrap,[\s\S]*\.hud-minimap-window \.minimap-canvas-wrap canvas\s*\{[\s\S]*width:\s*100%;/,
  'the minimap canvas must scale with the saved window width');
assert.doesNotMatch(appSource, /right-lower-stack/,
  'the fixed lower-right minimap stack must be removed');
assert.doesNotMatch(cssSource, /\.minimap-overlay\s*\{[^}]*top:\s*8px;/,
  'the minimap must no longer be anchored to the upper edge');
assert.doesNotMatch(cssSource,
  /\.canvas-stage:has\(\.dock-frame\.has-open-windows\) \.(?:right-lower-stack|right-overlay-stack)/,
  'floating management windows must not reserve a fixed-width lane by shifting right-side overlays');

console.log('minimap overlay layout UI tests passed');
