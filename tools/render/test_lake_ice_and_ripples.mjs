import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

async function loadTs(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

// lakeIce imports seasons, so inline the fixed 12-day seasonal calendar for this standalone render test.
const lakeIce = readFileSync(new URL('../../src/game/lakeIce.ts', import.meta.url), 'utf8')
  .replace("import { getDayOfSeason, getSeason } from './seasons';", '')
  .replace("import { isOpenWaterTerrain } from './terrain';", '')
  .replace("import type { Tile } from './types';", '')
  .replace(/Tile\[\]\[\]/g, 'any[][]');
const combined = `
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  function getSeason(day) { return SEASONS[Math.floor(((Math.max(1, day) - 1) % 48) / 12)]; }
  function getDayOfSeason(day) { return ((Math.max(1, day) - 1) % 12) + 1; }
  function isOpenWaterTerrain(terrain) { return terrain === 'river' || terrain === 'lake' || terrain === 'sea'; }
  ${lakeIce}`;
const iceOutput = ts.transpileModule(combined, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const ice = await import(`data:text/javascript;base64,${Buffer.from(iceOutput).toString('base64')}`);
const ripples = await loadTs('../../src/render/lakeShoreRipples.ts');
const shoreGround = await loadTs('../../src/render/lakeShoreGround.ts');

function map() {
  return Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => ({
    x, y, terrain: x >= 1 && x <= 3 && y >= 1 && y <= 3 ? 'lake' : 'plain', hasIron: false,
  })));
}

const lake = map();
assert.equal(ice.lakeIcePhase(37), 'freezing'); // winter 1
assert.equal(ice.isLakeIceAt(lake, 37, 1, 1), true, 'winter day 1 freezes the shore');
assert.equal(ice.isLakeIceAt(lake, 37, 2, 2), false, 'winter day 1 leaves the center liquid');
assert.equal(ice.isLakeIceAt(lake, 42, 2, 2), true, 'winter day 6 freezes the center');
assert.equal(ice.lakeIcePhase(1), 'thawing'); // spring 1
assert.equal(ice.isLakeIceAt(lake, 1, 1, 1), false, 'spring day 1 thaws the shore');
assert.equal(ice.isLakeIceAt(lake, 1, 2, 2), true, 'spring day 1 keeps the center frozen');
assert.equal(ice.isLakeIceAt(lake, 6, 2, 2), false, 'spring day 6 thaws the full lake');

const north = ripples.lakeShoreRipples({ n: true, e: false, s: false, w: false }, 10, 20, 0, 28);
assert.equal(north.length, 2, 'one shore edge emits two inward ripple bands');
assert.ok(north.every(ripple => ripple.edge === 'n' && ripple.offset > 0 && ripple.offset < 28));
assert.deepEqual(north, ripples.lakeShoreRipples({ n: true, e: false, s: false, w: false }, 10, 20, 0, 28),
  'same tile and time produce deterministic ripple bands');
const corner = ripples.lakeShoreRipples({ n: true, e: true, s: false, w: false }, 10, 20, 800, 28);
assert.deepEqual(corner.map(ripple => ripple.edge), ['n', 'n', 'e', 'e'], 'corner ripples stay attached to both shores');

const noShore = { n: false, e: false, s: false, w: false };
const northShore = { n: true, e: false, s: false, w: false };
assert.equal(shoreGround.lakeShoreGroundAt(noShore, 9, 12), null,
  'deep lake tiles never receive a shore ground material');
assert.equal(
  shoreGround.lakeShoreGroundAt(northShore, 9, 12),
  shoreGround.lakeShoreGroundAt(northShore, 9, 12),
  'lake shore material selection is deterministic',
);
assert.equal(
  shoreGround.lakeShoreGroundAt(northShore, 9, 12),
  shoreGround.lakeShoreGroundAt(northShore, 11, 14),
  'tiles in one 3x3 block share a short shore segment',
);
const shoreSamples = [];
for (let y = 0; y < 96; y++) {
  for (let x = 0; x < 96; x++) shoreSamples.push(shoreGround.lakeShoreGroundAt(northShore, x, y));
}
const mixedSamples = shoreSamples.filter(Boolean);
assert.ok(mixedSamples.length / shoreSamples.length > 0.3 && mixedSamples.length / shoreSamples.length < 0.46,
  'only part of the lake shore receives coastal material');
assert.deepEqual([...new Set(mixedSamples)].sort(), ['rocky', 'sand', 'shingle'],
  'lake shore mix uses all three non-mudflat materials');
assert.ok(!mixedSamples.includes('mudflat'), 'mudflat is excluded from lake shores');

console.log('lake ice and shoreline ripple tests passed');
