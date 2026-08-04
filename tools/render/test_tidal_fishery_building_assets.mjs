import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('src/render/tidalFisheryBuildingManifest.json', ROOT), 'utf8'));
const png = readFileSync(new URL('public/assets/tidal-fishery-building-v1.png', ROOT));

assert.equal(png.toString('ascii', 1, 4), 'PNG', '어살터 아틀라스가 PNG여야 한다');
assert.equal(png.readUInt32BE(16), manifest.frame_layout.sheetWidth);
assert.equal(png.readUInt32BE(20), manifest.frame_layout.sheetHeight);
assert.equal(manifest.engine, 'component-row');
assert.equal(manifest.degraded_static_fallback, false);
assert.equal(manifest.display.sourceScale, 2);
assert.deepEqual(manifest.seasonFrames, { normal: 0, winter: 1 });
assert.equal(manifest.frame_layout.rows.seasonal.length, 2);

const assetsSource = readFileSync(new URL('src/render/tidalFisheryBuildingAssets.ts', ROOT), 'utf8');
const atlasSource = readFileSync(new URL('src/render/atlas.ts', ROOT), 'utf8');
const studioSource = readFileSync(new URL('tools/sprite-studio/src/BuildingStage.tsx', ROOT), 'utf8');
assert.match(assetsSource, /frame_layout\.rows\.seasonal/,
  '런타임은 manifest frame_layout을 단일 원천으로 사용해야 한다');
assert.match(assetsSource, /season === 'winter'/,
  '겨울에는 눈 쌓인 전용 프레임을 골라야 한다');
assert.match(atlasSource, /loadAtlasAsset\(TIDAL_FISHERY_BUILDING_SHEET\.src/,
  '게임 아틀라스가 어살터 시트를 필수 로드해야 한다');
assert.match(atlasSource, /blitTidalFisheryBuilding\(ctx, p\)/,
  '어살터 전용 자산이 일반 건물 플레이스홀더보다 먼저 그려져야 한다');
assert.match(studioSource, /sprites\.drawBuilding/,
  '스프라이트 스튜디오는 게임 공용 건물 렌더를 사용해야 한다');
assert.match(studioSource, /highDefinition: true/,
  '스프라이트 스튜디오는 어살터 HD 원본을 표시할 수 있어야 한다');

console.log('tidal fishery building asset tests passed');
