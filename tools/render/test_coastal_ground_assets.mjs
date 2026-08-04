import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('src/render/coastalGroundManifest.json', ROOT), 'utf8'));
const png = readFileSync(new URL('public/assets/coastal-ground-tiles-v1.png', ROOT));

assert.equal(png.toString('ascii', 1, 4), 'PNG', '해안 바닥 아틀라스가 PNG여야 한다');
assert.equal(png.readUInt32BE(16), manifest.frame_layout.sheetWidth);
assert.equal(png.readUInt32BE(20), manifest.frame_layout.sheetHeight);
assert.equal(manifest.engine, 'component-row');
assert.equal(manifest.degraded_static_fallback, false);
assert.deepEqual(manifest.materials, ['mudflat', 'sand', 'shingle', 'rocky']);
assert.equal(manifest.frame_layout.rows.coastal_materials.length, 4);

const assetsSource = readFileSync(new URL('src/render/coastalGroundAssets.ts', ROOT), 'utf8');
const atlasSource = readFileSync(new URL('src/render/atlas.ts', ROOT), 'utf8');
const studioSource = readFileSync(new URL('tools/sprite-studio/src/BuildingStage.tsx', ROOT), 'utf8');
assert.match(assetsSource, /coastalGroundManifest\.frame_layout\.rows\.coastal_materials/,
  '런타임은 manifest frame_layout을 단일 원천으로 사용해야 한다');
assert.match(atlasSource, /loadAtlasAsset\(COASTAL_GROUND_SHEET\.src/,
  '게임 아틀라스가 해안 바닥 시트를 로드해야 한다');
assert.match(atlasSource, /quiltedCoastalGroundPattern/,
  '해안 타일은 월드 좌표 고정 무봉제 퀼팅을 사용해야 한다');
assert.match(studioSource, /sprites\.drawTerrain/,
  '스프라이트 스튜디오는 게임 공용 지형 렌더를 사용해야 한다');

console.log('coastal ground asset tests passed');
