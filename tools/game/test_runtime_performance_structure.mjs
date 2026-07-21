import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
const canvasSource = readFileSync(new URL('../../src/components/GameCanvas.tsx', import.meta.url), 'utf8');
const rendererSource = readFileSync(new URL('../../src/render/renderer.ts', import.meta.url), 'utf8');

const loopAnchor = appSource.indexOf('const msPerDay = CONFIG.time.msPerDay[speed]');
const loopStart = appSource.lastIndexOf('useEffect(() => {', loopAnchor);
const loopEnd = appSource.indexOf('const openGameMenu = useCallback', loopAnchor);
assert.ok(loopStart >= 0 && loopEnd > loopStart, 'App game loop source is discoverable');
const loopSource = appSource.slice(loopStart, loopEnd);

assert.match(loopSource, /advanceGameClock\(acc, now - last, msPerTick, 24\)/, 'App delegates accumulator math to the pure game clock');
assert.match(loopSource, /if \(ticksProcessed > 0\) \{[\s\S]*?runtimeVersionStore\.publish\(\);[\s\S]*?requestUiRefresh\(/, 'processed ticks publish the canvas version and request a throttled management snapshot refresh');
assert.doesNotMatch(loopSource, /if \(ticksProcessed > 0\) \{[\s\S]*?\bbump\(\)/, 'ordinary simulation ticks no longer bump the whole App tree');
assert.match(loopSource, /uiVersionStore\.publish\(\);\s*if \(commitApp\) setVersion/, 'scheduled management refreshes do not commit App');
assert.doesNotMatch(loopSource, /\}\s*bump\(\);\s*\/\/ 서브틱 사이에도/, 'the 33ms loop no longer unconditionally bumps React');

assert.match(canvasSource, /animationActive: boolean/, 'GameCanvas receives an explicit animation state');
assert.match(canvasSource, /ANIMATION_FRAME_MS = 1000 \/ 30/, 'full scene interpolation is capped at 30fps');
assert.match(canvasSource, /requestAnimationFrame\(frame\)/, 'GameCanvas owns interpolation frames');
assert.match(canvasSource, /continuousRenderRef\.current = animationActive && !document\.hidden/, 'continuous frames stop while paused or hidden');
assert.match(canvasSource, /cancelAnimationFrame\(animationFrameRef\.current\)/, 'GameCanvas cancels its scheduled frame');
assert.match(canvasSource, /tooltip\.style\.transform = `translate3d/, 'tooltip position is updated directly without a React state write');
assert.doesNotMatch(canvasSource, /onPointerMove=\{e => \{\s*setMouse\(toMouse\(e\)\)/, 'pointer movement does not unconditionally rerender React');
assert.match(canvasSource, /sceneViewportFromScroll\(/, 'GameCanvas derives a viewport from scroll state');
assert.match(canvasSource, /new ResizeObserver\(updateViewport\)/, 'canvas viewport follows container resize');
assert.match(canvasSource, /box\.addEventListener\('scroll', updateViewport/, 'paused scrolling requests a visible-region redraw');
assert.equal((canvasSource.match(/renderScene\(/g) ?? []).length, 1, 'scene drawing has one RAF-owned call site');

assert.match(rendererSource, /ctx\.clearRect\(viewport\.pixelX, viewport\.pixelY, viewport\.pixelWidth, viewport\.pixelHeight\)/, 'renderer clears only the visible region');
assert.match(rendererSource, /ctx\.drawImage\([\s\S]*?viewport\.pixelX, viewport\.pixelY, viewport\.pixelWidth, viewport\.pixelHeight/, 'terrain copy uses a viewport source rectangle');
assert.match(rendererSource, /for \(let y = viewport\.tileMinY; y <= viewport\.tileMaxY; y\+\+\)/, 'tile overlays scan only viewport rows');
assert.match(rendererSource, /pixelRectIntersectsViewport\(viewport, p\.x - TILE/, 'resident drawing is viewport-culled');
assert.doesNotMatch(rendererSource, /ctx\.clearRect\(0, 0, canvas\.width, canvas\.height\)/, 'renderer no longer clears the full world every frame');
assert.match(rendererSource, /o\.terrainVisualSignature \?\? terrainVisualSignature\(state\)/, 'terrain signature is supplied once per React version with a safe fallback');
assert.doesNotMatch(rendererSource, /const key = `\$\{state\.day\}/, 'terrain cache is not invalidated every game day');

const explorationSource = readFileSync(new URL('../../src/game/exploration.ts', import.meta.url), 'utf8');
const agentsSource = readFileSync(new URL('../../src/game/agents.ts', import.meta.url), 'utf8');
const isExploredSource = explorationSource.slice(
  explorationSource.indexOf('export function isExplored'),
  explorationSource.indexOf('export function revealAround'),
);
assert.match(explorationSource, /return state\.exploration\.explored\[y\]\?\.\[x\] === true/, 'isExplored is a bounds-safe O(1) lookup');
assert.doesNotMatch(isExploredSource, /ensureExploration\(state\)/, 'isExplored does not validate all map rows');
assert.doesNotMatch(agentsSource, /refreshExploration\(state\)/, 'agentsTick does not duplicate the simulation exploration refresh');
assert.match(agentsSource, /const broadGoalFieldCache = new WeakMap<GameState/, 'broad path fields are runtime-only and never serialized');
assert.match(agentsSource, /if \(!broad \|\| broad\.day !== state\.day\)/, 'goal fields are reused during a day instead of rebuilt per resident');
assert.match(agentsSource, /ctx\.goalFieldUserCounts\.forest >= 3/, 'small new settlements avoid goal-field construction spikes');
assert.match(agentsSource, /described\.goalHeuristic\?\.length === w \* h/, 'A* consumes a shared heuristic field when supplied');

console.log('runtime performance structure tests passed');
