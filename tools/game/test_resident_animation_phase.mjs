import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const phaseSource = readFileSync(new URL('../../src/render/residentAnimation.ts', import.meta.url), 'utf8');
const phaseOutput = ts.transpileModule(phaseSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const phaseUrl = `data:text/javascript;base64,${Buffer.from(phaseOutput).toString('base64')}`;
const { stableResidentAnimationOffset } = await import(phaseUrl);

assert.equal(stableResidentAnimationOffset(17), stableResidentAnimationOffset(17),
  'the same resident always receives the same animation phase');
assert.notEqual(stableResidentAnimationOffset(17), stableResidentAnimationOffset(18),
  'nearby resident IDs do not animate in lockstep');
for (const id of [0, 1, 17, 999, -3]) {
  const offset = stableResidentAnimationOffset(id);
  assert.ok(offset >= 0 && offset < 1000, 'phase offsets remain inside the one-second cycle');
}

const assetSource = readFileSync(new URL('../../src/render/residentWoodcutterAssets.ts', import.meta.url), 'utf8');
const assetOutput = ts.transpileModule(assetSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const assets = await import(`data:text/javascript;base64,${Buffer.from(assetOutput).toString('base64')}`);
const baseTime = 0;
const firstFrame = assets.woodcutterWorkFrameIndex(baseTime + stableResidentAnimationOffset(1));
assert.equal(firstFrame, assets.woodcutterWorkFrameIndex(baseTime + stableResidentAnimationOffset(1)),
  'the same resident and canvas time select the same source frame');
assert.notEqual(firstFrame, assets.woodcutterWorkFrameIndex(baseTime + stableResidentAnimationOffset(2)),
  'different residents select distinct work frames at the same canvas time');

const rendererSource = readFileSync(new URL('../../src/render/renderer.ts', import.meta.url), 'utf8');
const atlasSource = readFileSync(new URL('../../src/render/atlas.ts', import.meta.url), 'utf8');
const canvasSource = readFileSync(new URL('../../src/components/GameCanvas.tsx', import.meta.url), 'utf8');
const spritesSource = readFileSync(new URL('../../src/render/sprites.ts', import.meta.url), 'utf8');

assert.match(rendererSource, /animationTimeMs:\s*o\.animationTimeMs \+ stableResidentAnimationOffset\(r\.id\)/,
  'renderer adds a stable resident phase to the one scene timestamp');
assert.match(canvasSource, /drawRef\.current\(now\)/,
  'the RAF timestamp is passed into the canvas draw function');
assert.match(canvasSource, /animationTimeMs,/,
  'GameCanvas forwards that timestamp in SceneOptions');
assert.match(atlasSource, /const animationTime = p\.animationTimeMs \?\? performance\.now\(\)/,
  'atlas keeps performance.now only as an external-call compatibility fallback');
assert.doesNotMatch(atlasSource, /SourceRect\([^;\n]*performance\.now\(\)/,
  'all resident source rectangles use the shared draw time');
assert.match(spritesSource, /animationTimeMs\?: number/,
  'animation phase remains transient draw input rather than saved resident state');

console.log('resident animation phase tests passed');
