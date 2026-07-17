import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/render/sceneViewport.ts', import.meta.url), 'utf8');
const outDir = mkdtempSync(join(tmpdir(), 'northern-scene-viewport-'));
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const outputPath = join(outDir, 'sceneViewport.mjs');
writeFileSync(outputPath, output, 'utf8');

const { sceneViewportFromScroll, tileRectIntersectsViewport, pixelRectIntersectsViewport } =
  await import(pathToFileURL(outputPath).href);

const world = {
  canvasWidth: 72 * 28,
  canvasHeight: 72 * 28,
  tileSize: 28,
  canvasLeft: 8,
  canvasTop: 8,
  clientWidth: 640,
  clientHeight: 480,
};

{
  const viewport = sceneViewportFromScroll({ ...world, scrollLeft: 0, scrollTop: 0 });
  assert.deepEqual(viewport, {
    pixelX: 0, pixelY: 0, pixelWidth: 660, pixelHeight: 500,
    tileMinX: 0, tileMinY: 0, tileMaxX: 23, tileMaxY: 17,
  }, 'top-left viewport includes one tile overscan and accounts for canvas padding');
}

{
  const viewport = sceneViewportFromScroll({ ...world, scrollLeft: 700, scrollTop: 900 });
  assert.deepEqual(viewport, {
    pixelX: 664, pixelY: 864, pixelWidth: 696, pixelHeight: 536,
    tileMinX: 23, tileMinY: 30, tileMaxX: 48, tileMaxY: 49,
  }, 'center viewport is clamped after applying one tile overscan');
  assert.equal(tileRectIntersectsViewport(viewport, 22, 31), false);
  assert.equal(tileRectIntersectsViewport(viewport, 22, 31, 2, 1), true, 'multi-tile sprites crossing the edge remain visible');
  assert.equal(pixelRectIntersectsViewport(viewport, 650, 850, 20, 20), true);
  assert.equal(pixelRectIntersectsViewport(viewport, 100, 100, 10, 10), false);
}

{
  const viewport = sceneViewportFromScroll({ ...world, scrollLeft: 10_000, scrollTop: 10_000 });
  assert.deepEqual(viewport, {
    pixelX: 2016, pixelY: 2016, pixelWidth: 0, pixelHeight: 0,
    tileMinX: 71, tileMinY: 71, tileMaxX: 71, tileMaxY: 71,
  }, 'overscrolled viewport clamps to the world edge');
}

console.log('scene viewport tests passed');
