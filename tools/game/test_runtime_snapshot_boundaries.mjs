import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../src/GameSession.tsx', import.meta.url), 'utf8');
const dockSource = readFileSync(new URL('../../src/components/dock/DockFrame.tsx', import.meta.url), 'utf8');

assert.match(appSource, /const \[runtimeVersionStore\] = useState\(createRuntimeVersionStore\)/,
  'canvas ticks use a dedicated external version store');
assert.match(appSource, /const \[uiVersionStore\] = useState\(createRuntimeVersionStore\)/,
  'management snapshots use a separate external version store');
assert.match(appSource, /const bump = useCallback\(\(\) => \{\s*runtimeVersionStore\.publish\(\);\s*uiVersionStore\.publish\(\);\s*setVersion/,
  'player actions still refresh canvas, management snapshots, and App overlays immediately');

const loopSource = appSource.slice(
  appSource.indexOf('// ── 게임 루프:'),
  appSource.indexOf('// Esc로 건설 배치 취소'),
);
assert.match(loopSource, /uiVersionStore\.publish\(\);\s*if \(commitApp\) setVersion/,
  'ordinary UI snapshots publish without committing App');
assert.match(loopSource, /if \(immediate\) \{\s*flushUi\(true\)/,
  'urgent blocking state explicitly requests an App commit');
assert.doesNotMatch(loopSource, /lastUiRefresh = performance\.now\(\);\s*setVersion/,
  'the scheduled management cadence no longer owns a full-tree state write');

assert.match(appSource, /<Profiler id="topbar-boundary"[\s\S]*?<RuntimeVersionBoundary store=\{uiVersionStore\}>[\s\S]*?<TopBar/,
  'TopBar owns a profiled management snapshot boundary');
assert.match(appSource, /<Profiler id="log-boundary"[\s\S]*?<RuntimeVersionBoundary store=\{uiVersionStore\}>[\s\S]*?<UnifiedLog/,
  'the unified log owns a profiled management snapshot boundary');
assert.match(appSource, /<Profiler id="dock-boundary"[\s\S]*?<DockFrame/,
  'dock descendant work is measured independently');
assert.match(appSource, /<RuntimeVersionBoundary store=\{uiVersionStore\}>\s*\{\(\) => <RuntimeGameEffects/,
  'sound, weather, and tactical pause effects follow the lightweight snapshot cadence');
assert.match(appSource, /<Profiler id="minimap-boundary"[\s\S]*?<RuntimeVersionBoundary store=\{runtimeVersionStore\}>/,
  'the minimap remains on the per-tick canvas store');

const dockItemsSource = appSource.slice(
  appSource.indexOf('<Profiler id="dock-boundary"'),
  appSource.indexOf('</Profiler>', appSource.indexOf('<Profiler id="dock-boundary"')),
);
for (const id of ['jobs', 'processing', 'residents', 'specialResidents', 'factions', 'court', 'incidents']) {
  const itemStart = dockItemsSource.indexOf(`id: '${id}'`);
  assert.ok(itemStart >= 0, `${id} dock item remains registered`);
  const nextItem = dockItemsSource.indexOf("\n              {", itemStart + 1);
  const itemSource = dockItemsSource.slice(itemStart, nextItem >= 0 ? nextItem : undefined);
  assert.match(itemSource, /<RuntimeVersionBoundary store=\{uiVersionStore\}>/,
    `${id} content subscribes only while DockFrame mounts the open item`);
}

assert.match(dockSource, /const openItems = items\.filter\(item => openWindowIds\.includes\(item\.id\)\)/,
  'DockFrame excludes closed management items before mounting their content boundaries');
assert.match(dockSource, /\.\.\.openItems\.map\(item => \(\{ \.\.\.item/,
  'only open management content enters the floating window render list');

console.log('runtime snapshot boundary structure tests passed');
