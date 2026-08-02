import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/render/terrainOverlayOcclusion.ts', import.meta.url), 'utf8')
  .replace("import { isNaturalWaterTerrain } from '../game/terrain';", "const isNaturalWaterTerrain = terrain => terrain === 'river' || terrain === 'lake';")
  .replace("import type { ForeignSite, Tile } from '../game/types';", '')
  .replace("import { FOREIGN_SITE_CORE_SHEET } from './foreignSiteAssets';", 'const FOREIGN_SITE_CORE_SHEET = { spriteWidth: 56, spriteHeight: 80 };')
  .replace("import { TERRAIN_GROWTH_DRAW_SIZE } from './terrainGrowthAssets';", 'const TERRAIN_GROWTH_DRAW_SIZE = { width: 98, height: 112 };');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const occlusion = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

const map = Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) => ({
  x, y, terrain: x === 3 && y === 2 ? 'river' : x === 4 && y === 2 ? 'lake' : 'plain',
})));
const site = { x: 1, y: 2, width: 2, height: 2, discovered: true };

assert.deepEqual(occlusion.mountainOverlayBounds(3, 4, 28), { x: 49, y: 28, w: 98, h: 112 });
assert.deepEqual(occlusion.foreignSiteCoreBounds(site, 28), { x: 28, y: 32, w: 56, h: 80 });

const blockers = occlusion.mountainOverlayBlockers(map, [site], 3, 4, 28);
assert.ok(blockers.some(rect => rect.x === 84 && rect.y === 56), 'river tile blocks mountain pixels');
assert.ok(blockers.some(rect => rect.x === 112 && rect.y === 56), 'lake tile blocks mountain pixels');
assert.ok(blockers.some(rect => rect.x === 28 && rect.y === 32 && rect.w === 56 && rect.h === 80),
  'discovered foreign-site sprite bounds block mountain pixels');
assert.equal(occlusion.mountainOverlayBlockers(map, [{ ...site, discovered: false }], 3, 4, 28)
  .some(rect => rect.x === 28 && rect.y === 32 && rect.w === 56), false,
  'undiscovered sites do not punch a visible clearing');

const bounds = { x: 0, y: 0, w: 100, h: 100 };
const overlapping = [{ x: 20, y: 20, w: 40, h: 40 }, { x: 40, y: 40, w: 40, h: 40 }];
const visible = occlusion.visibleOverlayRects(bounds, overlapping);
for (const rect of visible) {
  const x = rect.x + rect.w / 2;
  const y = rect.y + rect.h / 2;
  assert.equal(overlapping.some(blocker =>
    x >= blocker.x && x < blocker.x + blocker.w && y >= blocker.y && y < blocker.y + blocker.h), false,
  'visible mask cells never re-open overlapping blocker regions');
}

console.log('terrain overlay occlusion tests passed');
