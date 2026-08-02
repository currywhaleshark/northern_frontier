// 건물 효과·그림자 데이터화 — 앵커가 데이터 계약을 지키는지 본다.
//
// 초기 레지스트리화 때는 옛 하드코딩 좌표와 같은 자리를 가리켰다. 이후 건물별 스프라이트
// 정비에서 종류별 dx·dy 조정이 도입됐으므로, 이제는 모든 종류가 한 가지 옛 공식에 맞는다고
// 가정하지 않는다. 대신 좌표 데이터가 유한하고 크기·원점 변환을 정확히 따른다는 것을 확인한다.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const dir = mkdtempSync(join(tmpdir(), 'northern-effect-anchor-'));
mkdirSync(dir, { recursive: true });
const source = readFileSync(join(ROOT, 'src', 'render', 'spriteStudioRegistries.ts'), 'utf8');
writeFileSync(join(dir, 'reg.mjs'), ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText, 'utf8');
const reg = await import(pathToFileURL(join(dir, 'reg.mjs')).href);

const TILE = 28;
const anchorOf = (emitter, bx, by, size) => ({
  x: bx + size * emitter.fx + emitter.dx,
  y: by + size * emitter.fy + emitter.dy,
});

// ── 1. 모든 이미터가 유한한 데이터 좌표를 내고, 크기·원점 변환을 따른다 ──
{
  let checked = 0;
  for (const [type, emitters] of Object.entries(reg.BUILDING_EFFECT_TABLE)) {
    for (const emitter of emitters) {
      assert.ok(reg.BUILDING_EFFECT_KINDS.includes(emitter.kind), `${type}: 알 수 없는 kind ${emitter.kind}`);
      for (const value of [emitter.fx, emitter.fy, emitter.dx, emitter.dy, emitter.scale]) {
        assert.ok(Number.isFinite(value), `${type}/${emitter.kind}: 유한한 앵커 값이어야 한다`);
      }
      // 1칸·2칸·3칸(중심지) 건물, 원점도 여러 곳에서 확인한다.
      for (const size of [TILE, TILE * 2, TILE * 3, Math.round(TILE * 3 * 1.15)]) {
        for (const [bx, by] of [[0, 0], [140, 84], [1036, 952]]) {
          const got = anchorOf(emitter, bx, by, size);
          const want = {
            x: bx + size * emitter.fx + emitter.dx,
            y: by + size * emitter.fy + emitter.dy,
          };
          assert.ok(
            Math.abs(got.x - want.x) < 1e-9 && Math.abs(got.y - want.y) < 1e-9,
            `${type}/${emitter.kind} size=${size} @(${bx},${by}): ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`,
          );
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 200, `앵커 검사 표본이 너무 적다 (${checked})`);
}

// ── 2. 등급에 따라 크기가 변하는 중심지도 비율 기준이라 따라간다 ──
{
  const centerSmoke = reg.buildingEffectEmitters('center').find(e => e.kind === 'chimneySmoke');
  assert.ok(centerSmoke, '중심지 굴뚝 연기가 있어야 한다');
  const small = anchorOf(centerSmoke, 0, 0, TILE * 3);
  const large = anchorOf(centerSmoke, 0, 0, TILE * 3 * 1.3);
  assert.ok(large.x > small.x, '중심지가 커지면 굴뚝도 함께 오른쪽으로 간다');
  assert.equal(small.y, large.y, '세로 보정은 크기와 무관한 픽셀 값이다');
}

// ── 3. 그림자 기본값이 옛 COURTYARD_SHADOW_OVERRIDES와 같다 ──
{
  const center = reg.buildingShadowSettings('center');
  assert.equal(center.mode, 'courtyard', '중심지는 마당형이었다');
  assert.equal(center.groundFrac, 0.33);
  assert.equal(center.anchorDepthFrac, 0.5);
  assert.equal(center.lengthScale, 1, '길이 배율 기본은 1이라 전단이 그대로다');

  for (const type of ['hut', 'smithy', 'watchtower', 'beacon', 'garrison']) {
    const settings = reg.buildingShadowSettings(type);
    assert.equal(settings.mode, 'standard', `${type}는 표준 그림자였다`);
    assert.equal(settings.lengthScale, 1, `${type}의 길이 배율이 1이 아니다`);
  }
}

// ── 4. 렌더러가 레지스트리만 보고 그린다 (하드코딩 잔재 없음) ──
{
  const renderer = readFileSync(join(ROOT, 'src', 'render', 'renderer.ts'), 'utf8');
  assert.ok(!renderer.includes('COURTYARD_SHADOW_OVERRIDES'), '그림자 하드코딩 상수가 남아 있다');
  assert.ok(!/drawWorkplaceActivity\s*\(/.test(renderer), '옛 작업 효과 함수가 남아 있다');
  assert.ok(
    !/b\.type === 'hut' \|\| b\.type === 'ondol'/.test(renderer),
    '밤 창불 건물 목록이 코드에 하드코딩되어 있다',
  );
  assert.ok(renderer.includes('buildingEffectEmitters'), '효과를 레지스트리에서 읽어야 한다');
  assert.ok(renderer.includes('buildingShadowSettings'), '그림자를 레지스트리에서 읽어야 한다');
  // 길이 배율이 도달 범위와 변환에 같이 먹어야 그림자가 잘리지 않는다
  const shearUses = renderer.match(/buildingShearX/g) ?? [];
  assert.ok(shearUses.length >= 3, '건물별 전단이 도달 범위와 변환 양쪽에 쓰여야 한다');
}

console.log('building effect anchor tests passed');
