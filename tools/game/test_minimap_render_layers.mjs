import { readAppCss } from '../app-stylesheets.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const modelUrl = new URL('../../src/components/minimapRenderModel.ts', import.meta.url);
const modelSource = readFileSync(modelUrl, 'utf8');
const output = ts.transpileModule(modelSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tempDir = mkdtempSync(join(tmpdir(), 'northern-minimap-layers-'));
const modulePath = join(tempDir, 'minimapRenderModel.mjs');
writeFileSync(modulePath, output, 'utf8');
const {
  minimapBaseInvalidationKey,
  minimapOverlayInvalidationKey,
} = await import(pathToFileURL(modulePath).href);

function base(overrides = {}) {
  return {
    terrainSignature: 101,
    explored: [[true, false], [true, true]],
    buildings: [{ id: 1, type: 'center', x: 0, y: 0, built: true }],
    claimZones: [],
    sites: [],
    ...overrides,
  };
}

function overlay(overrides = {}) {
  return {
    mapWidth: 72,
    mapHeight: 72,
    viewport: { left: 0, top: 0, width: 0.2, height: 0.2 },
    selected: null,
    raid: null,
    parties: [],
    targets: [],
    ...overrides,
  };
}

const stableBaseKey = minimapBaseInvalidationKey(base());
const panKeys = new Set();
for (let index = 0; index < 100; index++) {
  assert.equal(minimapBaseInvalidationKey(base()), stableBaseKey,
    'viewport panning must not invalidate the minimap base');
  panKeys.add(minimapOverlayInvalidationKey(overlay({
    viewport: { left: index / 200, top: index / 300, width: 0.2, height: 0.2 },
  })));
}
assert.equal(panKeys.size, 100, 'every rapid viewport move must produce a fresh overlay frame');

assert.notEqual(minimapBaseInvalidationKey(base({ terrainSignature: 102 })), stableBaseKey,
  'terrain visual changes must invalidate the base');
assert.notEqual(minimapBaseInvalidationKey(base({ explored: [[true, true], [true, true]] })), stableBaseKey,
  'exploration changes must invalidate the base');
assert.notEqual(minimapBaseInvalidationKey(base({
  buildings: [{ id: 1, type: 'center', x: 0, y: 0, built: false }],
})), stableBaseKey, 'building completion changes must invalidate the base');
assert.notEqual(minimapBaseInvalidationKey(base({
  buildings: [
    { id: 1, type: 'center', x: 0, y: 0, built: true },
    { id: 2, type: 'house', x: 1, y: 1, built: true },
  ],
})), stableBaseKey, 'building placement must invalidate the base');
assert.notEqual(minimapBaseInvalidationKey(base({ buildings: [] })), stableBaseKey,
  'building removal must invalidate the base');
assert.notEqual(minimapBaseInvalidationKey(base({
  claimZones: [{ id: 1, siteId: 8, x: 4, y: 4, radius: 2, discovered: true }],
})), stableBaseKey, 'revealed settlement influence must invalidate the base');
assert.notEqual(minimapBaseInvalidationKey(base({
  sites: [{
    id: 8, type: 'village', x: 4, y: 4, width: 1, height: 1,
    status: 'active', factionName: '동맹', discovered: true,
  }],
})), stableBaseKey, 'revealed or changed external sites must invalidate the base');

const stableOverlayKey = minimapOverlayInvalidationKey(overlay());
assert.notEqual(minimapOverlayInvalidationKey(overlay({ selected: { x: 2, y: 3 } })), stableOverlayKey,
  'selection changes must invalidate only the overlay key');
assert.notEqual(minimapOverlayInvalidationKey(overlay({
  targets: [{ id: 'hunt:1', kind: 'wolf', x: 4, y: 5, radius: 2, label: '늑대 무리' }],
})), stableOverlayKey, 'expedition targets must invalidate only the overlay key');
assert.notEqual(minimapOverlayInvalidationKey(overlay({
  raid: { x: 6, y: 7, faction: '여진' },
})), stableOverlayKey, 'raid markers must invalidate only the overlay key');
assert.notEqual(minimapOverlayInvalidationKey(overlay({
  parties: [{ id: 3, siteId: 8, x: 6.5, y: 7.5, phase: 'outbound' }],
})), stableOverlayKey, 'moving foreign parties must invalidate only the overlay key');
assert.equal(minimapBaseInvalidationKey(base()), stableBaseKey,
  'selection, raid, target pulse, and viewport state must remain outside the base key');

const minimapSource = readFileSync(new URL('../../src/components/Minimap.tsx', import.meta.url), 'utf8');
const cssSource = readAppCss();
assert.match(minimapSource, /baseCanvasRef[\s\S]*overlayCanvasRef/,
  'the minimap must own distinct base and overlay canvases');
assert.match(minimapSource,
  /const baseInvalidationKey = useMemo\(\(\) => minimapBaseInvalidationKey\([\s\S]*\), \[state, version\]\);/,
  'viewport-only React renders must not rescan the 72x72 base-signature inputs');
assert.match(minimapSource, /minimap-base-redraw/,
  'base redraws must expose an opt-in performance counter');
assert.match(minimapSource, /minimap-overlay-redraw/,
  'overlay redraws must expose an opt-in performance counter');
const baseEffect = minimapSource.slice(
  minimapSource.indexOf('// Base layer redraw'),
  minimapSource.indexOf('// Overlay layer redraw'),
);
assert.doesNotMatch(baseEffect, /\bviewport\b|\bselected\b|targetMarkers|requestAnimationFrame/,
  'viewport, selection, target markers, and pulse animation must not enter the base effect');
assert.match(baseEffect, /\[baseInvalidationKey, mapHeight, mapWidth, minimapHeight\]/,
  'the base effect must depend only on its visual invalidation key and canvas geometry');
const overlayEffect = minimapSource.slice(
  minimapSource.indexOf('// Overlay layer redraw'),
  minimapSource.indexOf('const navigate ='),
);
assert.match(overlayEffect, /requestAnimationFrame\(drawOverlay\)/,
  'animated target and raid pulses must schedule overlay-only frames');
assert.match(overlayEffect,
  /const animatePulse = animationActive && !document\.hidden && pulseActive;[\s\S]*if \(animatePulse\)[\s\S]*requestAnimationFrame\(drawOverlay\)/,
  'paused or hidden games must not keep a continuous minimap canvas RAF alive');
assert.doesNotMatch(overlayEffect, /state\.map|state\.exploration|state\.buildings|drawSite/,
  'the overlay effect must never traverse or paint base-layer state');
assert.match(cssSource,
  /\.minimap-overlay-canvas\s*\{[\s\S]*position:\s*absolute;[\s\S]*inset:\s*0;/,
  'the interactive overlay canvas must stack exactly above the base canvas');

console.log('minimap base/overlay render layer tests passed');
