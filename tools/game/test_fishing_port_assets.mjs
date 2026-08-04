import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('src/render/fishingPortManifest.json', ROOT), 'utf8'));

function pngSize(path) {
  const png = readFileSync(new URL(path, ROOT));
  assert.equal(png.toString('ascii', 1, 4), 'PNG', `${path}: PNG 파일이어야 한다`);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

const { house, pier } = manifest.sheets;
assert.deepEqual(
  pngSize('public/assets/fishing-port-house-v1.png'),
  [house.frame_layout.sheetWidth, house.frame_layout.sheetHeight],
);
assert.deepEqual(
  pngSize('public/assets/fishing-port-pier-v1.png'),
  [pier.frame_layout.sheetWidth, pier.frame_layout.sheetHeight],
);
assert.deepEqual(
  pngSize('public/assets/fishing-port-house-winter-v1.png'),
  [house.winter_frame_layout.sheetWidth, house.winter_frame_layout.sheetHeight],
);
assert.deepEqual(
  pngSize('public/assets/fishing-port-pier-winter-v1.png'),
  [pier.winter_frame_layout.sheetWidth, pier.winter_frame_layout.sheetHeight],
);
assert.deepEqual(
  pngSize('public/assets/fishing-port-pier-hd-v1.png'),
  [pier.hd_frame_layout.sheetWidth, pier.hd_frame_layout.sheetHeight],
);
assert.deepEqual(
  pngSize('public/assets/fishing-port-pier-winter-hd-v1.png'),
  [pier.winter_hd_frame_layout.sheetWidth, pier.winter_hd_frame_layout.sheetHeight],
);
assert.equal(manifest.engine, 'component-row');
assert.equal(manifest.degraded_static_fallback, false);
assert.equal(manifest.projection.terminalMirroring, false, '계류대는 방향 반전 자산을 쓰면 안 된다');
assert.equal(pier.display.middleScale, 1, '잔교 중간 파츠는 한 타일을 꽉 채워야 한다');
assert.equal(pier.display.terminalScale, 1.4, '계류대는 잔교 한 타일보다 크게 보여야 한다');

for (const row of ['middle_horizontal', 'middle_vertical']) {
  assert.equal(pier.frame_layout.rows[row]?.length, 1, `${row}: 반복 파츠 하나가 필요하다`);
  assert.equal(pier.winter_frame_layout.rows[row]?.length, 1, `${row}: 겨울 반복 파츠 하나가 필요하다`);
  assert.equal(pier.hd_frame_layout.rows[row]?.length, 1, `${row}: HD 반복 파츠 하나가 필요하다`);
  assert.equal(pier.winter_hd_frame_layout.rows[row]?.length, 1, `${row}: 겨울 HD 반복 파츠 하나가 필요하다`);
}

const terminalRects = ['n', 'e', 's', 'w'].map(direction => {
  const row = pier.frame_layout.rows[`terminal_${direction}`];
  assert.equal(row?.length, 1, `terminal_${direction}: 방향별 원본 파츠가 필요하다`);
  return row[0];
});
for (const direction of ['n', 'e', 's', 'w']) {
  assert.equal(
    pier.winter_frame_layout.rows[`terminal_${direction}`]?.length,
    1,
    `terminal_${direction}: 겨울 방향별 원본 파츠가 필요하다`,
  );
  assert.equal(pier.hd_frame_layout.rows[`terminal_${direction}`]?.length, 1);
  assert.equal(pier.winter_hd_frame_layout.rows[`terminal_${direction}`]?.length, 1);
}
const middleRequiredPixels = Math.ceil(pier.display.width * 2);
for (const row of ['middle_horizontal', 'middle_vertical']) {
  for (const layout of [pier.hd_frame_layout, pier.winter_hd_frame_layout]) {
    const rect = layout.rows[row][0];
    assert.ok(
      Math.min(rect.w, rect.h) >= middleRequiredPixels,
      `${row}: 최대 줌 양축에 최소 ${middleRequiredPixels}px가 필요하다`,
    );
  }
}
const terminalRequiredPixels = Math.ceil(pier.display.width * pier.display.terminalScale * 2);
for (const direction of ['n', 'e', 's', 'w']) {
  for (const layout of [pier.hd_frame_layout, pier.winter_hd_frame_layout]) {
    const rect = layout.rows[`terminal_${direction}`][0];
    assert.ok(
      Math.min(rect.w, rect.h) >= terminalRequiredPixels,
      `terminal_${direction}: 최대 줌 양축에 최소 ${terminalRequiredPixels}px가 필요하다`,
    );
  }
}
assert.equal(
  new Set(terminalRects.map(rect => `${rect.x},${rect.y},${rect.w},${rect.h}`)).size,
  4,
  '네 계류대 방향은 서로 다른 atlas rect를 사용해야 한다',
);

const assetsSource = readFileSync(new URL('src/render/fishingPortAssets.ts', ROOT), 'utf8');
const atlasSource = readFileSync(new URL('src/render/atlas.ts', ROOT), 'utf8');
const rendererSource = readFileSync(new URL('src/render/renderer.ts', ROOT), 'utf8');
const studioSource = readFileSync(new URL('tools/sprite-studio/src/BuildingStage.tsx', ROOT), 'utf8');
assert.match(assetsSource, /`terminal_\$\{direction\}`/, '방향별 계류대 row를 직접 선택해야 한다');
assert.doesNotMatch(assetsSource, /mirror|scale\(-1/, '계류대 런타임 반전을 도입하면 안 된다');
assert.match(atlasSource, /terminalScale/, '계류대 전용 확대율을 공용 atlas 렌더러가 적용해야 한다');
assert.match(assetsSource, /season === 'winter'/, '포구 자산 선택은 겨울 아틀라스를 구분해야 한다');
assert.match(atlasSource, /fishingPortHouseWinterSheet/, '공용 atlas 렌더러가 겨울 주건물을 불러야 한다');
assert.match(atlasSource, /fishingPortPierWinterSheet/, '공용 atlas 렌더러가 겨울 잔교를 불러야 한다');
assert.match(atlasSource, /fishingPortPierHdSheet/, '공용 atlas 렌더러가 최대 줌용 HD 잔교를 불러야 한다');
assert.match(atlasSource, /fishingPortPierWinterHdSheet/, '공용 atlas 렌더러가 겨울 HD 잔교를 불러야 한다');
assert.match(rendererSource, /drawFishingPortPierAtlas/, '게임 렌더러가 공용 잔교 atlas를 사용해야 한다');
assert.match(
  rendererSource,
  /undefined,\s*season,\s*renderScale === 2,/,
  '게임 렌더러가 포구 잔교에 현재 계절과 최대 줌 HD 선택을 전달해야 한다',
);
assert.match(studioSource, /drawFishingPortPier/, '스프라이트 스튜디오도 공용 복합 포구 렌더를 사용해야 한다');
assert.match(studioSource, /portDirection/, '스프라이트 스튜디오에서 네 방향을 바꿔 확인할 수 있어야 한다');
assert.match(studioSource, /scene\.season/, '스프라이트 스튜디오 포구도 선택한 계절을 사용해야 한다');
assert.match(studioSource, /scene\.season, true/, '스프라이트 스튜디오 포구는 HD 잔교를 사용해야 한다');

console.log('fishing port asset tests passed');
