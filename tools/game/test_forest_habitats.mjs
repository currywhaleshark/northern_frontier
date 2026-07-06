import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/game/habitats.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const {
  findForestHabitatIconAtTile,
  findForestHabitats,
  isForestHabitatCover,
} = await import(moduleUrl);

function makeMap(width, height, forest = [], hunting = []) {
  const huntingSet = new Set(hunting.map(([x, y]) => `${x},${y}`));
  const forestSet = new Set(forest.map(([x, y]) => `${x},${y}`));
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ({
      x,
      y,
      terrain: huntingSet.has(`${x},${y}`) ? 'hunting' : forestSet.has(`${x},${y}`) ? 'forest' : 'plain',
      hasIron: false,
      buildingId: null,
    })),
  );
}

const nineTileForest = makeMap(5, 5, [
  [0, 0], [1, 0], [2, 0],
  [0, 1], [1, 1], [2, 1],
  [0, 2], [1, 2], [2, 2],
]);
const habitats = findForestHabitats(nineTileForest, { minTiles: 8, radius: 4 });
assert.equal(habitats.length, 1);
assert.deepEqual(habitats[0], {
  id: 'forest-habitat-1-1',
  x: 1,
  y: 1,
  radius: 4,
  forestTiles: 9,
});
assert.equal(findForestHabitatIconAtTile(habitats, 1, 1)?.id, 'forest-habitat-1-1');
assert.equal(findForestHabitatIconAtTile(habitats, 2, 1), null);

const smallForest = makeMap(5, 5, [
  [0, 0], [1, 0], [2, 0],
  [0, 1], [1, 1], [2, 1],
  [0, 2],
]);
assert.equal(findForestHabitats(smallForest, { minTiles: 8, radius: 4 }).length, 0);

const legacyHuntingCover = makeMap(4, 4, [
  [0, 0], [1, 0], [2, 0], [3, 0],
], [
  [0, 1], [1, 1], [2, 1], [3, 1],
]);
assert.equal(findForestHabitats(legacyHuntingCover, { minTiles: 8, radius: 4 }).length, 1);
assert.equal(isForestHabitatCover('forest'), true);
assert.equal(isForestHabitatCover('hunting'), true);
assert.equal(isForestHabitatCover('plain'), false);

console.log('forest habitat tests passed');
