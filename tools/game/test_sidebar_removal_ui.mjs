import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../src/GameSession.tsx', import.meta.url), 'utf8');
const alertsSource = readFileSync(new URL('../../src/components/AlertsPanel.tsx', import.meta.url), 'utf8');
const topBarSource = readFileSync(new URL('../../src/components/TopBar.tsx', import.meta.url), 'utf8');
const dockSource = readFileSync(new URL('../../src/components/dock/DockFrame.tsx', import.meta.url), 'utf8');
const dockPresentationSource = readFileSync(new URL('../../src/ui/dockPresentation.ts', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');

assert.doesNotMatch(appSource, /className=["']side right["']/,
  'the fixed right sidebar must be removed so the map can use the full content width');
assert.match(appSource, /className="right-overlay-stack"[\s\S]*<AlertsPanel/,
  'alerts must remain in the upper-right canvas overlay');
assert.doesNotMatch(appSource, /<EventLog/,
  'the temporary event log must leave the upper-right overlay after log unification');
assert.match(alertsSource, /className="alert-stack"/,
  'alerts must render as a thin overlay stack rather than a sidebar section');
assert.doesNotMatch(alertsSource, /className="section"/,
  'the alert overlay must not retain the padded sidebar section shell');

assert.match(topBarSource, /promotionTarget[\s\S]*nextRank\(state\.rank\)/,
  'the TopBar must derive the next promotion target');
assert.match(topBarSource, /className="ongoing-objective promotion"[\s\S]*onClick=\{onOpenCourt\}/,
  'the promotion objective must open the court dock window');
assert.match(topBarSource, /className="objective-summary">\{state\.victoryProgressNote\}/,
  'the promotion progress summary must appear in the persistent objective row');

assert.match(dockPresentationSource, /['"]incidents['"]/,
  'incidents and special items must remain reachable after sidebar removal');
assert.match(appSource, /id: 'incidents'[\s\S]*<InspectorPanel/,
  'the incident and special-item panel must move into the management dock');
assert.match(dockSource, /items\.filter\(item => openWindowIds\.includes\(item\.id\)\)/,
  'open dock DOM nodes must retain registration order rather than move when focused');
assert.match(dockSource, /const orderIndex = windowOrder\.indexOf\(item\.id\)[\s\S]*zIndex=\{Math\.max\(0, orderIndex\) \+ 1\}/,
  'global floating-window focus order must be expressed only through z-index');

assert.match(cssSource, /\.main\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);/,
  'the main layout must give the entire content width to the canvas');
assert.match(cssSource, /\.right-overlay-stack\s*\{[\s\S]*right:\s*54px;/,
  'the upper-right alert overlay must sit directly beside the dock icon strip');
assert.doesNotMatch(cssSource,
  /\.canvas-stage:has\(\.dock-frame\.has-open-windows\) \.right-overlay-stack/,
  'floating windows must leave the right alert overlay at its normal position');
assert.match(cssSource, /\.dock-frame\s*\{[\s\S]*inset:\s*0;[\s\S]*pointer-events:\s*none;/,
  'the dock frame must provide a pointer-through full-stage coordinate space');
assert.match(cssSource, /\.dock-window-layer\s*\{[\s\S]*inset:\s*0;[\s\S]*pointer-events:\s*none;/,
  'floating dock windows must live in a full-stage layer');

console.log('sidebar removal UI tests passed');
