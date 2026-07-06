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
  collectHuntableTiles,
  findForestHabitatIconAtTile,
  findForestHabitats,
  habitatYieldMult,
  isForestHabitatCover,
} = await import(moduleUrl);

const YIELD_OPTS = {
  strayYield: 0.75,
  habitatYieldBase: 0.8,
  habitatYieldPerTile: 0.012,
  habitatYieldMax: 1.4,
};

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

// 사냥 가능 타일: 서식지 반경 안의 숲 덮개만 포함되고, 배율은 서식지 크기에 비례한다
{
  // 12x5 맵: 왼쪽에 9타일 숲(서식지 중심 1,1 / 반경 4), 오른쪽 끝에 반경 밖 숲 1타일
  const map = makeMap(12, 5, [
    [0, 0], [1, 0], [2, 0],
    [0, 1], [1, 1], [2, 1],
    [0, 2], [1, 2], [2, 2],
    [11, 1],
  ]);
  const habitats = findForestHabitats(map, { minTiles: 8, radius: 4 });
  const huntable = collectHuntableTiles(map, habitats, YIELD_OPTS);
  const expectedMult = 0.8 + 0.012 * 9; // base + perTile × 숲 9타일
  assert.equal(huntable.get('1,1'), expectedMult); // 서식지 중심
  assert.equal(huntable.get('2,2'), expectedMult); // 반경 안 숲
  assert.equal(huntable.has('4,1'), false);        // 반경 안이지만 평지
  assert.equal(huntable.has('11,1'), false);       // 반경 밖 고립 숲
  assert.equal(habitatYieldMult(habitats[0], YIELD_OPTS), expectedMult);
}

// 배율은 habitatYieldMax를 넘지 않는다
{
  assert.equal(habitatYieldMult({ forestTiles: 500, radius: 4, x: 0, y: 0, id: 'x' }, YIELD_OPTS), 1.4);
}

// 명시적 사냥터 지형은 서식지가 없어도 최소 배율로 사냥 가능하다 (초반 보장 사냥터 보호)
{
  const map = makeMap(6, 6, [], [[4, 4]]);
  const huntable = collectHuntableTiles(map, findForestHabitats(map, { minTiles: 8, radius: 4 }), YIELD_OPTS);
  assert.equal(huntable.get('4,4'), YIELD_OPTS.strayYield);
  assert.equal(huntable.has('3,4'), false);
}

// 서식지 반경 안의 사냥터 지형은 서식지 배율(더 높은 쪽)을 따른다
{
  const map = makeMap(5, 5, [
    [0, 0], [1, 0], [2, 0],
    [0, 1], [1, 1], [2, 1],
    [0, 2], [1, 2],
  ], [[2, 2]]);
  const habitats = findForestHabitats(map, { minTiles: 8, radius: 4 });
  assert.equal(habitats.length, 1);
  const huntable = collectHuntableTiles(map, habitats, YIELD_OPTS);
  assert.equal(huntable.get('2,2'), 0.8 + 0.012 * 9); // stray 0.75보다 높은 서식지 배율
}

// 서식지 반경이 지도 밖으로 나가도 안전하다
{
  const map = makeMap(4, 4, [
    [0, 0], [1, 0], [2, 0], [3, 0],
    [0, 1], [1, 1], [2, 1], [3, 1],
  ]);
  const habitats = findForestHabitats(map, { minTiles: 8, radius: 4 });
  assert.equal(habitats.length, 1);
  const huntable = collectHuntableTiles(map, habitats, YIELD_OPTS);
  assert.equal(huntable.size, 8); // 숲 8타일 전부, 범람 없음
}

console.log('forest habitat tests passed');
