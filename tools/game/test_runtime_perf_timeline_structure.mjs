import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const perfSource = readFileSync(new URL('../../src/perf/runtimePerf.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
const canvasSource = readFileSync(new URL('../../src/components/GameCanvas.tsx', import.meta.url), 'utf8');
const minimapSource = readFileSync(new URL('../../src/components/Minimap.tsx', import.meta.url), 'utf8');
const agentsSource = readFileSync(new URL('../../src/game/agents.ts', import.meta.url), 'utf8');

assert.match(perfSource, /if \(typeof window === 'undefined' \|\| !window\.__runtimePerf\?\.active\) return null/, 'timeline timing is disabled by default');
assert.match(perfSource, /probe\.events\.splice\(0, overflow\)/, 'timeline storage is bounded');
assert.match(perfSource, /\['longtask', 'long-animation-frame', 'gc'\]/, 'browser long-task, long-animation-frame, and GC entries are observed when supported');
assert.match(perfSource, /loaf\.scripts/, 'long animation frames retain script attribution when the browser exposes it');
assert.match(perfSource, /recordRuntimePerf\('js-heap'/, 'heap samples provide a GC fallback signal');
assert.match(perfSource, /export function summarizeRuntimePerf/, 'the browser harness can export a compact summary');

assert.match(appSource, /perf:\s*\{[\s\S]*?start: startRuntimePerf,[\s\S]*?snapshot: runtimePerfSnapshot/, 'the dev game hook controls timeline capture');
assert.match(appSource, /const runtimePerfParams = new URLSearchParams\(window\.location\.search\)/, 'the local browser harness reads capture controls from the URL');
assert.match(appSource, /runtimePerfParams\.get\('perf'\) === '1'/, 'the local browser harness exposes controls only when requested');
assert.match(appSource, />성능 측정 시작<\//, 'the isolated browser harness can start after the game view settles');
assert.match(appSource, />성능 측정 종료<\//, 'the isolated browser harness can stop and export a measurement without page-world access');
assert.match(appSource, /runtimePerfParams\.get\('perfMs'\)/, 'the harness can stop on a fixed duration without an intrusive DOM snapshot');
assert.match(appSource, /recordRuntimePerfSince\('simulation-tick'/, 'simulation ticks share the browser timeline');
assert.match(appSource, /recordRuntimePerfSince\('game-loop'/, 'complete interval callbacks share the browser timeline');
assert.match(appSource, /<Profiler id="game-app" onRender=\{recordAppRender\}>/, 'React game commits are profiled');
assert.match(appSource, /recordRuntimePerf\('react-commit'/, 'React commit timing is recorded');
assert.match(appSource, /recordRuntimePerf\('react-post-commit'/, 'post-commit passive effect time is recorded');
assert.match(appSource, /recordRuntimePerf\('react-tree-render-commit'/, 'production captures the full App tree render-to-layout-commit wall time');
assert.match(appSource, /recordRuntimePerf\('react-tree-passive-effects'/, 'production captures child passive-effect wall time');

assert.match(canvasSource, /recordRuntimePerf\('frame-interval'/, 'canvas frame pacing is recorded');
assert.match(canvasSource, /recordRuntimePerfSince\('canvas-draw'/, 'canvas drawing is recorded');
assert.match(canvasSource, /lastMeasuredCanvasDrawRef\.current >= runtimeProbe\.startedAt/, 'frame intervals never include time before capture started');
assert.match(minimapSource, /recordRuntimePerfSince\('minimap-base-draw'/, 'durable minimap redraws share the browser timeline');
assert.match(minimapSource, /recordRuntimePerfSince\('minimap-overlay-draw'/, 'transient minimap redraws share the browser timeline');
assert.match(agentsSource, /__recordRuntimePerfSince\?\.\('pathfinding'/, 'slow pathfinding samples use an optional browser hook without coupling the game core to UI code');
assert.doesNotMatch(agentsSource, /from ['"]\.\.\/perf\//, 'standalone game test compilation does not depend on browser instrumentation modules');
assert.match(agentsSource, /const result = findPathCore\(/, 'pathfinding instrumentation preserves a separately testable core');

console.log('runtime performance timeline structure tests passed');
