import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const uiSource = readFileSync(new URL('../../src/ui/mapZoom.ts', import.meta.url), 'utf8');
const outDir = mkdtempSync(join(tmpdir(), 'northern-map-hd-zoom-'));
const output = ts.transpileModule(uiSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
writeFileSync(join(outDir, 'mapZoom.mjs'), output, 'utf8');
const zoom = await import(pathToFileURL(join(outDir, 'mapZoom.mjs')).href);

for (const level of [0.5, 0.67, 0.8, 1, 1.25, 1.5]) {
  assert.equal(zoom.mapBackingScaleForZoom(level), 1, `${level}x keeps the existing backing resolution`);
}
assert.equal(zoom.mapBackingScaleForZoom(2), 2, 'maximum zoom enables the 2x backing resolution');
assert.equal(zoom.mapBackingScaleForZoom(Number.NaN), 1);

const canvasSource = readFileSync(new URL('../../src/components/GameCanvas.tsx', import.meta.url), 'utf8');
assert.match(canvasSource, /width=\{logicalWidth \* renderScale\}/);
assert.match(canvasSource, /height=\{logicalHeight \* renderScale\}/);
assert.match(canvasSource, /data-render-scale=\{renderScale\}/);
assert.match(canvasSource, /canvasWidth: logicalWidth/);
assert.match(canvasSource, /canvasHeight: logicalHeight/);
assert.doesNotMatch(canvasSource, /mx:.*canvasRef\.current!\.width/);

const rendererSource = readFileSync(new URL('../../src/render/renderer.ts', import.meta.url), 'utf8');
assert.match(rendererSource, /logicalWidth = canvas\.width \/ renderScale/);
assert.match(rendererSource, /ctx\.setTransform\(renderScale, 0, 0, renderScale, 0, 0\)/);
assert.match(rendererSource, /drawWeather\(ctx, state\.weather, logicalWidth, logicalHeight, viewport\)/);

console.log('map HD zoom tests passed');
