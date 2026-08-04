import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('src/render/boatyardBuildingManifest.json', ROOT), 'utf8'));
const png = readFileSync(new URL('public/assets/boatyard-building-v1.png', ROOT));
const hdPng = readFileSync(new URL('public/assets/boatyard-building-hd-v1.png', ROOT));

assert.equal(png.toString('ascii', 1, 4), 'PNG', '배무이터 아틀라스가 PNG여야 한다');
assert.equal(png.readUInt32BE(16), manifest.frame_layout.sheetWidth);
assert.equal(png.readUInt32BE(20), manifest.frame_layout.sheetHeight);
assert.equal(hdPng.toString('ascii', 1, 4), 'PNG', '배무이터 HD 아틀라스가 PNG여야 한다');
assert.equal(hdPng.readUInt32BE(16), manifest.hd_frame_layout.sheetWidth);
assert.equal(hdPng.readUInt32BE(20), manifest.hd_frame_layout.sheetHeight);
assert.equal(manifest.engine, 'component-row');
assert.equal(manifest.degraded_static_fallback, false);
assert.deepEqual(manifest.display, {
  width: 56,
  height: 80,
  sourceScale: 2,
  hdSourceScale: 8,
  anchor: 'footprint-bottom-left',
});
assert.deepEqual(manifest.seasonFrames, { normal: 0, winter: 1 });
assert.equal(manifest.frame_layout.rows.seasonal.length, 2);
assert.equal(manifest.hd_frame_layout.rows.seasonal.length, 2);

const assetsSource = readFileSync(new URL('src/render/boatyardBuildingAssets.ts', ROOT), 'utf8');
const atlasSource = readFileSync(new URL('src/render/atlas.ts', ROOT), 'utf8');
const studioSource = readFileSync(new URL('tools/sprite-studio/src/BuildingStage.tsx', ROOT), 'utf8');
const requestSource = readFileSync(new URL('tools/render/boatyard_building_request_v1.json', ROOT), 'utf8');
assert.match(assetsSource, /frame_layout\.rows\.seasonal/,
  '런타임은 manifest frame_layout을 단일 원천으로 사용해야 한다');
assert.match(assetsSource, /season === 'winter'/,
  '겨울에는 눈 쌓인 전용 프레임을 골라야 한다');
assert.match(assetsSource, /hd_frame_layout\.rows\.seasonal/,
  '최대 줌은 별도 8배 HD 프레임 레이아웃을 사용해야 한다');
assert.match(atlasSource, /loadAtlasAsset\(BOATYARD_BUILDING_SHEET\.src/,
  '게임 아틀라스가 배무이터 시트를 필수 로드해야 한다');
assert.match(atlasSource, /loadAtlasAsset\(BOATYARD_BUILDING_HD_SHEET\.src/,
  '게임 아틀라스가 배무이터 HD 시트를 별도로 로드해야 한다');
assert.match(atlasSource, /p\.highDefinition && boatyardBuildingHdSheet/,
  '최대 줌과 스프라이트 스튜디오는 배무이터 HD 시트를 골라야 한다');
assert.match(atlasSource, /blitBoatyardBuilding\(ctx, p\)/,
  '배무이터 전용 자산이 일반 목재 작업장 플레이스홀더보다 먼저 그려져야 한다');
assert.match(studioSource, /sprites\.drawBuilding/,
  '스프라이트 스튜디오는 게임 공용 건물 렌더를 사용해야 한다');
assert.match(studioSource, /highDefinition: true/,
  '스프라이트 스튜디오는 배무이터 HD 원본을 표시할 수 있어야 한다');
assert.match(requestSource, /Gageodo hanseon hull/,
  '배무이터 생성 요청은 승인된 가거도 한선 선체를 기준으로 기록해야 한다');

console.log('boatyard building asset tests passed');
