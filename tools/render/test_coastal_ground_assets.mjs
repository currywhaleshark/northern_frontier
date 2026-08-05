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

for (const material of ['mudflat', 'sand', 'shingle', 'rocky']) {
  for (const [variant, size] of [['standard-448px', 448], ['hd-896px', 896]]) {
    const texture = readFileSync(new URL(
      `public/assets/coastal-${material}-seamless-v1-${variant}.png`, ROOT,
    ));
    assert.equal(texture.toString('ascii', 1, 4), 'PNG');
    assert.equal(texture.readUInt32BE(16), size, `${material} ${variant} 너비`);
    assert.equal(texture.readUInt32BE(20), size, `${material} ${variant} 높이`);
  }
}

const assetsSource = readFileSync(new URL('src/render/coastalGroundAssets.ts', ROOT), 'utf8');
const atlasSource = readFileSync(new URL('src/render/atlas.ts', ROOT), 'utf8');
const buildSource = readFileSync(new URL('tools/render/build_coastal_seamless_textures_v1.py', ROOT), 'utf8');
const studioSource = readFileSync(new URL('tools/sprite-studio/src/BuildingStage.tsx', ROOT), 'utf8');
assert.match(assetsSource, /coastalGroundManifest\.frame_layout\.rows\.coastal_materials/,
  '런타임은 manifest frame_layout을 단일 원천으로 사용해야 한다');
assert.match(assetsSource, /COASTAL_SEAMLESS_GROUND_SHEETS/,
  '갯벌·모래·자갈·암반 대형 심리스 자산 쌍을 선언해야 한다');
assert.match(atlasSource, /loadAtlasAsset\(COASTAL_GROUND_SHEET\.src/,
  '게임 아틀라스가 해안 바닥 시트를 로드해야 한다');
assert.match(atlasSource, /quiltedCoastalGroundPattern/,
  '작은 해안 시트의 월드 좌표 고정 폴백을 유지해야 한다');
assert.match(atlasSource, /activeCoastalSeamlessGround/,
  '갯벌·모래·자갈·암반은 대형 심리스 자산을 우선 사용해야 한다');
assert.match(buildSource, /"--output-hd"[\s\S]+"--output-standard"/,
  '빌드 파이프라인은 HD를 먼저 만들고 일반판을 뒤에서 파생해야 한다');
assert.match(studioSource, /sprites\.drawTerrain/,
  '스프라이트 스튜디오는 게임 공용 지형 렌더를 사용해야 한다');

console.log('coastal ground asset tests passed');
