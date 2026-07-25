import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/render/terrainGrowthVisuals.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText.replace(/^import .*;$/gm, '');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const {
  mountainDepthAt,
  mountainProfileFor,
  terrainNeighborsFor,
  terrainVisualHash,
  terrainVariantFromHash,
  treeSpeciesFromHash,
} = await import(moduleUrl);

assert.equal(terrainVisualHash(3, 7), terrainVisualHash(3, 7));
assert.notEqual(terrainVisualHash(3, 7), terrainVisualHash(4, 7));
assert.equal(treeSpeciesFromHash(1, false), 'broadleaf');
assert.equal(treeSpeciesFromHash(4, false), 'conifer');
assert.equal(treeSpeciesFromHash(1, true), 'conifer');
assert.equal(treeSpeciesFromHash(3, true), 'broadleaf');
assert.equal(terrainVariantFromHash(7, 2), 1);

const map = Array.from({ length: 7 }, (_unused, y) =>
  Array.from({ length: 7 }, (_inner, x) => ({
    x, y, terrain: x >= 1 && x <= 5 && y >= 1 && y <= 5 ? 'mountain' : 'plain',
    hasIron: false,
    buildingId: null,
  })));

assert.equal(mountainDepthAt(map, 0, 0), 0);
assert.equal(mountainDepthAt(map, 1, 3), 1);
assert.equal(mountainDepthAt(map, 2, 3), 2);
assert.equal(mountainDepthAt(map, 3, 3), 3);

const edge = terrainNeighborsFor(map, 3, 5, 'mountain');
assert.equal(edge.s, false);
assert.equal(mountainProfileFor(edge, 1, 1), 'cliff');

const center = terrainNeighborsFor(map, 3, 3, 'mountain');
assert.equal(mountainProfileFor(center, 3, 5), 'peak');
assert.equal(mountainProfileFor(center, 3, 6), 'ridgeHigh');
assert.equal(mountainProfileFor(center, 2, 6), 'ridgeLow');

console.log('terrain growth visuals tests passed');
