import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('src/render/fishingBoatManifest.json', ROOT), 'utf8'));
const png = readFileSync(new URL('public/assets/fishing-boats-v1.png', ROOT));

assert.equal(png.toString('ascii', 1, 4), 'PNG', '어선 아틀라스가 PNG여야 한다');
assert.equal(png.readUInt32BE(16), manifest.frame_layout.sheetWidth, 'manifest와 PNG 폭이 같아야 한다');
assert.equal(png.readUInt32BE(20), manifest.frame_layout.sheetHeight, 'manifest와 PNG 높이가 같아야 한다');
assert.equal(manifest.engine, 'component-row');
assert.equal(manifest.degraded_static_fallback, false);
assert.deepEqual(manifest.directions.authored, ['ne', 'sw']);
assert.deepEqual(manifest.directions.mirror, { nw: 'ne', se: 'sw' });
assert.equal(manifest.chroma.key_threshold, 210, '승인한 RGB 210 크로마 계약을 보존해야 한다');

const expectedStates = [
  'sailing', 'moored', 'fishing',
  'lake_winter_moored', 'sea_winter_sailing', 'sea_winter_fishing',
];
for (const direction of manifest.directions.authored) {
  for (const state of expectedStates) {
    const row = manifest.frame_layout.rows[`${direction}_${state}`];
    assert.equal(row?.length, 1, `${direction}_${state}: 정적 프레임 하나가 필요하다`);
    const [frame] = row;
    assert.deepEqual(
      { w: frame.w, h: frame.h },
      { w: manifest.frame_layout.cellWidth, h: manifest.frame_layout.cellHeight },
      `${direction}_${state}: 셀 크기가 manifest와 같아야 한다`,
    );
  }
}

const assetsSource = readFileSync(new URL('src/render/fishingBoatAssets.ts', ROOT), 'utf8');
const rendererSource = readFileSync(new URL('src/render/renderer.ts', ROOT), 'utf8');
const studioSource = readFileSync(new URL('tools/sprite-studio/src/BoatStage.tsx', ROOT), 'utf8');
assert.match(assetsSource, /rows\[row\]\?\.\[0\]/, '런타임은 manifest frame_layout을 조회해야 한다');
assert.match(rendererSource, /drawFishingBoatAtlas/, '게임 렌더러가 공용 어선 아틀라스를 사용해야 한다');
assert.match(studioSource, /drawFishingBoatAtlas/, '스프라이트 스튜디오도 공용 어선 아틀라스를 사용해야 한다');

console.log('fishing boat asset tests passed');
