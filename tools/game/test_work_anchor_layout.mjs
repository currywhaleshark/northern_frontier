// 작업 앵커 — 값이 없으면 기존 배치와 동일하고, 값을 넣으면 그 주민만 움직인다.
//
// residentWorkStances는 앵커 조회를 주입받는 순수 함수라, 레지스트리 없이 그대로 시험할 수 있다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/render/residentWorkLayout.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { residentWorkStances } = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
);

const TILE = 28;
const lookup = table => key => table[key] ?? null;
const workers = jobs => jobs.map((job, index) => ({
  id: index + 1, alive: true, phase: 'working', job,
  assignedBuildingId: null, x: 5, y: 7, px: 5, py: 7,
}));
const rock = () => 'rock';

// ── 1. 앵커 조회가 없거나 비어 있으면 기존 배치 그대로 ──
{
  const crew = workers(['miner']);
  const bare = residentWorkStances(crew, TILE);
  assert.deepEqual(
    residentWorkStances(crew, TILE, undefined, rock, lookup({})).get(1), bare.get(1),
    '앵커 표가 비면 배치가 같다',
  );
  assert.deepEqual(
    residentWorkStances(crew, TILE, undefined, rock).get(1), bare.get(1),
    '조회 함수를 주지 않으면 배치가 같다',
  );
  assert.deepEqual(
    residentWorkStances(crew, TILE, undefined, undefined, lookup({ 'miner@rock': { offsetX: 9, offsetY: 0, facing: 0 } })).get(1),
    bare.get(1),
    '지형 조회가 없으면 앵커가 걸리지 않는다',
  );
}

// ── 2. 앵커가 있으면 해당 직업·지형에서만 움직인다 ──
{
  const crew = workers(['miner', 'woodcutter']);
  const table = lookup({ 'miner@rock': { offsetX: 10, offsetY: -3, facing: -1 } });
  const anchored = residentWorkStances(crew, TILE, undefined, rock, table);
  const plain = residentWorkStances(crew, TILE, undefined, rock, lookup({}));

  assert.equal(anchored.get(1).offsetX, plain.get(1).offsetX + 10, '채광꾼은 앵커만큼 옆으로 비껴선다');
  assert.equal(anchored.get(1).offsetY, plain.get(1).offsetY - 3, '세로 오프셋도 더해진다');
  assert.equal(anchored.get(1).facing, -1, '앵커 facing이 기존 계산을 덮어쓴다');
  assert.deepEqual(anchored.get(2), plain.get(2), '같은 칸의 다른 직업은 그대로다');

  const onPlainGround = residentWorkStances(crew, TILE, undefined, () => 'plain', table);
  assert.deepEqual(onPlainGround.get(1), plain.get(1), '지형이 다르면 앵커가 걸리지 않는다');
}

// ── 3. facing 0은 기존 방향 계산을 유지한다 ──
{
  const crew = workers(['miner']);
  const anchored = residentWorkStances(crew, TILE, undefined, rock, lookup({
    'miner@rock': { offsetX: 4, offsetY: 0, facing: 0 },
  }));
  const plain = residentWorkStances(crew, TILE, undefined, rock, lookup({}));
  assert.equal(anchored.get(1).facing, plain.get(1).facing, 'facing 0이면 기존 방향을 쓴다');
  assert.equal(anchored.get(1).offsetX, plain.get(1).offsetX + 4, '오프셋은 그래도 적용된다');
}

// ── 4. 여러 명이 같은 칸이어도 벌리기 위에 앵커가 얹힌다 ──
{
  const crew = workers(['miner', 'miner', 'miner']);
  const table = lookup({ 'miner@rock': { offsetX: 6, offsetY: 2, facing: 0 } });
  const anchored = residentWorkStances(crew, TILE, undefined, rock, table);
  const plain = residentWorkStances(crew, TILE, undefined, rock, lookup({}));
  for (const id of [1, 2, 3]) {
    assert.equal(anchored.get(id).offsetX, plain.get(id).offsetX + 6, `${id}: 벌리기에 앵커가 더해진다`);
    assert.equal(anchored.get(id).offsetY, plain.get(id).offsetY + 2, `${id}: 세로도 마찬가지`);
  }
  assert.equal(new Set([1, 2, 3].map(id => anchored.get(id).offsetX)).size, 3, '세 명이 겹치지 않는다');
}

// ── 5. 서 있는 평지와 별도로 인접 광상을 작업 문맥으로 적용하고 그쪽을 바라본다 ──
{
  const crew = workers(['miner']);
  const table = lookup({ 'miner@rock': { offsetX: 3, offsetY: -2, facing: 0 } });
  const rightTarget = () => ({ x: 6, y: 7, terrain: 'rock' });
  const leftTarget = () => ({ x: 4, y: 7, terrain: 'rock' });
  const right = residentWorkStances(crew, TILE, undefined, () => 'plain', table, rightTarget).get(1);
  const left = residentWorkStances(crew, TILE, undefined, () => 'plain', table, leftTarget).get(1);
  const plain = residentWorkStances(crew, TILE, undefined, () => 'plain', lookup({})).get(1);
  assert.equal(right.offsetX, plain.offsetX + 3, '인접 광상 문맥에도 miner@rock 앵커가 적용된다');
  assert.equal(right.offsetY, plain.offsetY - 2);
  assert.equal(right.facing, 1, '오른쪽 광상을 바라본다');
  assert.equal(left.facing, -1, '왼쪽 광상을 바라본다');
}

// ── 6. 근무 중이 아니거나 이동 중이면 배치 대상이 아니다 ──
{
  const table = lookup({ 'miner@rock': { offsetX: 99, offsetY: 0, facing: 0 } });
  const moving = [{ id: 1, alive: true, phase: 'working', job: 'miner', assignedBuildingId: null, x: 5, y: 7, px: 4, py: 7 }];
  const resting = [{ id: 2, alive: true, phase: 'rest', job: 'miner', assignedBuildingId: null, x: 5, y: 7, px: 5, py: 7 }];
  assert.equal(residentWorkStances(moving, TILE, undefined, rock, table).size, 0, '이동 중은 제외');
  assert.equal(residentWorkStances(resting, TILE, undefined, rock, table).size, 0, '근무 중이 아니면 제외');
}

console.log('work anchor layout tests passed');
