import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/render/riverAutotile.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const {
  RIVER_AUTOTILE_SIZE,
  RIVER_BANK_INSET,
  RIVER_FILL_COLUMN,
  riverFillSourceRect,
  riverLandCorners,
  riverRoundedCorners,
  riverSeasonRow,
  riverWaterBox,
} = await import(moduleUrl);

// landDirs에 있는 방향만 뭍인 이웃 정보
const neighbors = (landDirs) => {
  const nb = {};
  for (const dir of ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw']) {
    nb[dir] = landDirs.includes(dir);
  }
  return nb;
};

// 계절 행: 겨울은 언 강일 때만 겨울 행, 해빙기엔 봄(물) 행
assert.equal(riverSeasonRow('spring', false), 0);
assert.equal(riverSeasonRow('summer', false), 1);
assert.equal(riverSeasonRow('autumn', false), 2);
assert.equal(riverSeasonRow('winter', true), 3);
assert.equal(riverSeasonRow('winter', false), 0);

// 물 전면 텍스처는 17번째 칸에서 온다
assert.equal(RIVER_FILL_COLUMN, 16);
assert.deepEqual(riverFillSourceRect('autumn', false), {
  sx: 16 * RIVER_AUTOTILE_SIZE,
  sy: 2 * RIVER_AUTOTILE_SIZE,
  sw: RIVER_AUTOTILE_SIZE,
  sh: RIVER_AUTOTILE_SIZE,
});

// 세로 물길 (동서가 뭍): 좌우로만 둑 여백, 상하는 가장자리까지 물
assert.deepEqual(riverWaterBox(neighbors(['e', 'w', 'ne', 'nw', 'se', 'sw'])), {
  x0: RIVER_BANK_INSET,
  y0: 0,
  x1: RIVER_AUTOTILE_SIZE - RIVER_BANK_INSET,
  y1: RIVER_AUTOTILE_SIZE,
});

// 넓은 강 한가운데 (사방이 물): 타일 전체가 물
assert.deepEqual(riverWaterBox(neighbors([])), {
  x0: 0,
  y0: 0,
  x1: RIVER_AUTOTILE_SIZE,
  y1: RIVER_AUTOTILE_SIZE,
});

// 대각선만 뭍인 모서리: 그 모서리만 뭍으로 되메운다
assert.deepEqual(riverLandCorners(neighbors(['ne'])), ['ne']);
assert.deepEqual(riverLandCorners(neighbors(['ne', 'sw'])), ['ne', 'sw']);
// 옆면이 뭍이면 이미 둑 여백이 있으므로 모서리 되메움 대상이 아니다
assert.deepEqual(riverLandCorners(neighbors(['n', 'ne'])), []);

// 양옆이 모두 뭍인 바깥 굽이 모서리만 둥글린다
assert.deepEqual(riverRoundedCorners(neighbors(['n', 'e'])), ['ne']);
assert.deepEqual(riverRoundedCorners(neighbors(['n', 'e', 's', 'w'])), ['ne', 'se', 'sw', 'nw']);
assert.deepEqual(riverRoundedCorners(neighbors(['n'])), []);

console.log('river autotile tests passed');
