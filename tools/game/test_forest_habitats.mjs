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
  findHabitatCandidates,
  findHabitatIconAtTile,
  habitatForestTiles,
  habitatYieldMult,
  isForestHabitatCover,
  isHabitatActive,
  spawnAnimalHabitats,
} = await import(moduleUrl);

const YIELD_OPTS = {
  habitatYieldBase: 0.8,
  habitatYieldPerTile: 0.012,
  habitatYieldMax: 1.4,
};

function makeMap(width, height, forest = []) {
  const forestSet = new Set(forest.map(([x, y]) => `${x},${y}`));
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ({
      x,
      y,
      terrain: forestSet.has(`${x},${y}`) ? 'forest' : 'plain',
      hasIron: false,
      buildingId: null,
    })),
  );
}

assert.equal(isForestHabitatCover('forest'), true);
assert.equal(isForestHabitatCover('plain'), false);

// 숲 덩어리(8타일 이상)마다 후보 하나, 중심은 무게중심에 가장 가까운 타일
const nineTileForest = makeMap(5, 5, [
  [0, 0], [1, 0], [2, 0],
  [0, 1], [1, 1], [2, 1],
  [0, 2], [1, 2], [2, 2],
]);
const candidates = findHabitatCandidates(nineTileForest, { minTiles: 8, radius: 4 });
assert.equal(candidates.length, 1);
assert.deepEqual(candidates[0], { x: 1, y: 1, radius: 4, forestTiles: 9 });

// 8타일 미만 숲 덩어리는 후보가 되지 않는다
const smallForest = makeMap(5, 5, [
  [0, 0], [1, 0], [2, 0],
  [0, 1], [1, 1], [2, 1],
  [0, 2],
]);
assert.equal(findHabitatCandidates(smallForest, { minTiles: 8, radius: 4 }).length, 0);

// 확률 스폰: 주사위가 chance보다 낮으면 서식지가 되고, active로 시작한다
{
  const habitats = spawnAnimalHabitats(nineTileForest, 1, 1, () => 0.1, 0.5);
  assert.equal(habitats.length, 1);
  assert.deepEqual(habitats[0], { id: 1, x: 1, y: 1, radius: 4, active: true });
}

// 확률에서 전부 떨어져도 마을에서 가장 가까운 후보 하나는 보장된다
{
  const habitats = spawnAnimalHabitats(nineTileForest, 4, 4, () => 0.99, 0.5);
  assert.equal(habitats.length, 1);
  assert.equal(habitats[0].x, 1);
}

// 마을 근처(보장 반경 안)에 이미 서식지가 나왔으면 추가 보장은 없다
{
  const twoForests = makeMap(30, 5, [
    // 왼쪽 9타일 숲
    [0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2],
    // 오른쪽 9타일 숲
    [27, 0], [28, 0], [29, 0], [27, 1], [28, 1], [29, 1], [27, 2], [28, 2], [29, 2],
  ]);
  // 첫 후보(왼쪽)만 성공하는 주사위 — 마을(1,1) 근처라 보장 발동 없음
  let roll = 0;
  const habitats = spawnAnimalHabitats(twoForests, 1, 1, () => (roll++ === 0 ? 0.1 : 0.99), 0.5);
  assert.equal(habitats.length, 1);
  assert.equal(habitats[0].x, 1);
}

assert.equal(findHabitatIconAtTile([{ id: 1, x: 1, y: 1, radius: 4, active: true }], 1, 1)?.id, 1);
assert.equal(findHabitatIconAtTile([{ id: 1, x: 1, y: 1, radius: 4, active: true }], 2, 1), null);

// 반경 안 숲 타일 수와 활성 판정 — 숲이 minTiles 아래로 줄면 짐승이 떠난다
{
  const habitat = { id: 1, x: 1, y: 1, radius: 4, active: true };
  assert.equal(habitatForestTiles(nineTileForest, habitat), 9);
  assert.equal(isHabitatActive(nineTileForest, habitat, 8), true);
  assert.equal(isHabitatActive(smallForest, habitat, 8), false);
}

// 사냥 가능 타일: 활동 중인 서식지 반경 안의 숲만 포함되고, 배율은 숲 크기에 비례한다
{
  // 12x5 맵: 왼쪽에 9타일 숲(서식지 중심 1,1 / 반경 4), 오른쪽 끝에 반경 밖 숲 1타일
  const map = makeMap(12, 5, [
    [0, 0], [1, 0], [2, 0],
    [0, 1], [1, 1], [2, 1],
    [0, 2], [1, 2], [2, 2],
    [11, 1],
  ]);
  const habitats = [{ id: 1, x: 1, y: 1, radius: 4, active: true }];
  const huntable = collectHuntableTiles(map, habitats, YIELD_OPTS);
  const expectedMult = 0.8 + 0.012 * 9; // base + perTile × 숲 9타일
  assert.equal(huntable.get('1,1'), expectedMult); // 서식지 중심
  assert.equal(huntable.get('2,2'), expectedMult); // 반경 안 숲
  assert.equal(huntable.has('4,1'), false);        // 반경 안이지만 평지
  assert.equal(huntable.has('11,1'), false);       // 반경 밖 고립 숲
}

// 짐승이 떠난(비활성) 서식지에서는 사냥할 수 없다
{
  const habitats = [{ id: 1, x: 1, y: 1, radius: 4, active: false }];
  const huntable = collectHuntableTiles(nineTileForest, habitats, YIELD_OPTS);
  assert.equal(huntable.size, 0);
}

// 배율은 habitatYieldMax를 넘지 않는다
assert.equal(habitatYieldMult(500, YIELD_OPTS), 1.4);

// 서식지 반경이 지도 밖으로 나가도 안전하다
{
  const map = makeMap(4, 4, [
    [0, 0], [1, 0], [2, 0], [3, 0],
    [0, 1], [1, 1], [2, 1], [3, 1],
  ]);
  const habitats = spawnAnimalHabitats(map, 1, 1, () => 0, 1);
  assert.equal(habitats.length, 1);
  const huntable = collectHuntableTiles(map, habitats, YIELD_OPTS);
  assert.equal(huntable.size, 8); // 숲 8타일 전부, 범람 없음
}

console.log('forest habitat tests passed');
