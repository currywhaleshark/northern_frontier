import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
const storeSource = readFileSync(new URL('../../src/ui/runtimeVersionStore.ts', import.meta.url), 'utf8');
const boundarySource = readFileSync(new URL('../../src/components/RuntimeVersionBoundary.tsx', import.meta.url), 'utf8');

assert.match(storeSource, /if \(speed >= 10\) return 1_000/, '10x simulation refreshes management UI at most once per second');
assert.match(storeSource, /if \(speed >= 3\) return 500/, '3x simulation uses a balanced management UI cadence');
assert.match(storeSource, /return 250/, '1x simulation keeps management UI responsive');
assert.match(storeSource, /for \(const listener of listeners\) listener\(\)/, 'runtime subscribers receive every published tick');
assert.match(boundarySource, /useSyncExternalStore\(store\.subscribe, store\.getSnapshot, store\.getSnapshot\)/, 'canvas tick updates are isolated behind an external-store boundary');

const loopSource = appSource.slice(
  appSource.indexOf('// ── 게임 루프:'),
  appSource.indexOf('// Esc로 건설 배치 취소'),
);
assert.match(loopSource, /runtimeVersionStore\.publish\(\)/, 'processed ticks publish directly to the canvas boundary');
assert.match(loopSource, /uiVersionStore\.publish\(\);\s*if \(commitApp\) setVersion/, 'management snapshots publish independently from App commits');
assert.match(loopSource, /if \(immediate\) \{\s*flushUi\(true\)/, 'urgent states retain an immediate full App commit path');
assert.match(loopSource, /entry\.important \|\| entry\.kind === 'bad' \|\| entry\.kind === 'raid'/, 'urgent logs bypass the management UI throttle');
assert.doesNotMatch(loopSource, /requestUiRefresh\(\s*s\.log\.length !== logLengthBefore/, 'ordinary logs follow the management UI cadence');
assert.match(loopSource, /Boolean\(s\.pendingChoice \|\| s\.tacticalBattle \|\| s\.tacticalBattleReport \|\| s\.gameOver\)/, 'blocking overlays bypass the management UI throttle');
assert.doesNotMatch(loopSource, /animRef\.current = \{ at: now, ms: msPerTick \};\s*bump\(\)/, 'ordinary ticks no longer rerender the whole App tree');
assert.match(appSource, /<RuntimeVersionBoundary store=\{runtimeVersionStore\}>[\s\S]*?<GameCanvas/, 'GameCanvas consumes the tick-local version boundary');
assert.match(appSource, /<RuntimeVersionBoundary store=\{uiVersionStore\}>[\s\S]*?<TopBar/, 'TopBar consumes a management snapshot boundary');

console.log('runtime UI refresh structure tests passed');
