import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
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
assert.match(dockSource, /'--dock-strip-count': items\.length/,
  'the dock window stack must reserve the actual icon-strip height');

assert.match(cssSource, /\.main\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);/,
  'the main layout must give the entire content width to the canvas');
assert.match(cssSource, /\.right-overlay-stack\s*\{[\s\S]*right:\s*54px;/,
  'the upper-right alert overlay must sit directly beside the dock icon strip');
assert.match(cssSource,
  /\.canvas-stage:has\(\.dock-frame\.has-open-windows\) \.right-overlay-stack\s*\{\s*right:\s*332px;/,
  'the right overlay must shift beside an open dock window');
assert.match(cssSource, /\.dock-window-stack\s*\{[\s\S]*top:\s*calc\(var\(--dock-strip-count\) \* 43px \+ 5px\);/,
  'dock windows must begin below every dock icon');

console.log('sidebar removal UI tests passed');
