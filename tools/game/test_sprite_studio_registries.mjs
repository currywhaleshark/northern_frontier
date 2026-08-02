// 스프라이트 스튜디오 레지스트리 — 기본값 항등성과 키 정합 검증.
//
// 화면 무변화의 핵심 근거는 "값이 없으면 배율 1·오프셋 0"이라는 항등성이다.
// 여기에 더해 atlas.ts에 붙은 키와 레지스트리가 아는 키가 정확히 일치하는지 확인한다 —
// 오타 키는 지금은 조용히 기본값으로 동작하지만, 나중에 스튜디오에서 편집해도
// 아무 일이 일어나지 않는 유령 키가 되기 때문이다.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function transpile(source) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) => {
    if (/\.[cm]?js$/.test(spec)) return `${start}${spec}${end}`;
    return `${start}${spec}.mjs${end}`;
  });
}

// 생성 파일만 단독으로 컴파일한다 (타입 전용 import라 game 의존이 지워진다).
const rootDir = mkdtempSync(join(tmpdir(), 'northern-sprite-studio-'));
const renderDir = join(rootDir, 'render');
mkdirSync(renderDir, { recursive: true });
const registrySource = readFileSync(join(ROOT, 'src', 'render', 'spriteStudioRegistries.ts'), 'utf8');
writeFileSync(join(renderDir, 'spriteStudioRegistries.mjs'), transpile(registrySource), 'utf8');
// 작업자 자리는 시뮬레이션이 읽으므로 game 쪽에 생성된다 (game → render import를 막기 위해).
const slotSource = readFileSync(join(ROOT, 'src', 'game', 'buildingWorkerSlots.ts'), 'utf8');
writeFileSync(join(renderDir, 'buildingWorkerSlots.mjs'), transpile(slotSource), 'utf8');

const registries = await import(pathToFileURL(join(renderDir, 'spriteStudioRegistries.mjs')).href);
const slotRegistry = await import(pathToFileURL(join(renderDir, 'buildingWorkerSlots.mjs')).href);

// ── 1. 기본값 항등성 ──
{
  const missing = registries.spriteDisplayMetric('no.such.key');
  assert.equal(missing.scale, 1, '없는 키는 배율 1');
  assert.equal(missing.dy, 0, '없는 키는 오프셋 0');
  assert.equal(registries.spriteDisplayMetric(undefined).scale, 1, '키가 없어도 배율 1');

  for (const key of registries.SPRITE_DISPLAY_METRIC_KEYS) {
    const metric = registries.spriteDisplayMetric(key);
    assert.ok(Number.isFinite(metric.scale) && metric.scale > 0, `${key}: 배율이 유한한 양수`);
    assert.ok(Number.isFinite(metric.dy), `${key}: 오프셋이 유한한 수`);
  }

  const shadow = registries.buildingShadowSettings('hut');
  assert.equal(shadow.mode, 'standard', '등록하지 않은 건물은 standard');
  assert.equal(shadow.lengthScale, 1, '등록하지 않은 건물은 길이 배율 1');
  assert.deepEqual(slotRegistry.buildingWorkerSlots('hut'), [], '등록하지 않은 건물은 자리 없음');
  assert.deepEqual(registries.buildingEffectEmitters('palisade'), [], '효과 없는 건물은 빈 배열');
}

// ── 2. atlas.ts와의 키 정합 (양방향) ──
{
  const atlas = readFileSync(join(ROOT, 'src', 'render', 'atlas.ts'), 'utf8');
  const known = new Set(registries.SPRITE_DISPLAY_METRIC_KEYS);

  // 코드에 박힌 정적 키는 전부 레지스트리가 아는 키여야 한다.
  // 점이 있는 것만 키로 본다 — 'jige'·'axe' 같은 다른 용도의 짧은 리터럴과 섞이지 않게.
  const literalPattern = /'((?:i2v|video|jige|walk|work|load|cart|cart-load)(?:\.[A-Za-z]+)+)'/g;
  const literals = new Set([...atlas.matchAll(literalPattern)].map(match => match[1]));
  // 유일한 무점 키인 common은 사용 지점을 직접 확인한다.
  assert.ok(
    atlas.includes(`drawResidentCellRect(ctx, residentCommonLocomotionSheet, rect, p, 'common')`),
    'common 키가 공용 보행 폴백에 붙어 있지 않다',
  );
  literals.add('common');
  for (const key of literals) {
    assert.ok(known.has(key), `atlas.ts의 키 "${key}"가 레지스트리 목록에 없다`);
  }

  // 템플릿 리터럴로 만들어지는 키 계열 — 접두사 단위로 확인한다.
  const dynamicPrefixes = [];
  if (atlas.includes('`i2v.${p.job}`')) dynamicPrefixes.push('i2v.');
  if (atlas.includes('`jige.${p.job}`')) dynamicPrefixes.push('jige.');
  if (atlas.includes('`video.woodcutter.walk.${kind}`')) dynamicPrefixes.push('video.woodcutter.walk.');
  assert.equal(dynamicPrefixes.length, 3, 'i2v·지게·벌목 보행의 동적 키 3계열이 모두 살아 있다');

  // 레지스트리가 아는 키는 전부 코드 어딘가에서 쓰여야 한다 (유령 키 방지).
  for (const key of known) {
    const usedStatically = literals.has(key);
    const usedDynamically = dynamicPrefixes.some(prefix => key.startsWith(prefix));
    assert.ok(usedStatically || usedDynamically, `레지스트리 키 "${key}"가 atlas.ts에서 쓰이지 않는다`);
  }
}

// ── 3. 코드젠이 알 수 없는 키를 거부한다 ──
{
  const dataPath = join(ROOT, 'tools', 'sprite-studio', 'data', 'display-metrics.json');
  const original = readFileSync(dataPath, 'utf8');
  try {
    writeFileSync(dataPath, JSON.stringify({ 'work.nonexistentJob': { scale: 2, dy: 0 } }), 'utf8');
    let rejected = false;
    try {
      execFileSync('node', [join(ROOT, 'tools', 'sprite-studio', 'generate_registries.mjs')], { stdio: 'pipe' });
    } catch {
      rejected = true;
    }
    assert.ok(rejected, '알 수 없는 키가 있으면 코드젠이 실패해야 한다');
  } finally {
    writeFileSync(dataPath, original, 'utf8');
    execFileSync('node', [join(ROOT, 'tools', 'sprite-studio', 'generate_registries.mjs')], { stdio: 'pipe' });
  }
  // 원본 데이터로 다시 생성한 결과가 저장소의 파일과 같아야 한다 (커밋 누락 방지).
  const regenerated = readFileSync(join(ROOT, 'src', 'render', 'spriteStudioRegistries.ts'), 'utf8');
  assert.equal(regenerated, registrySource, '생성 파일이 data/*.json과 어긋나 있다 — 코드젠을 다시 돌려 커밋할 것');
  const regeneratedSlots = readFileSync(join(ROOT, 'src', 'game', 'buildingWorkerSlots.ts'), 'utf8');
  assert.equal(regeneratedSlots, slotSource, '작업자 자리 생성 파일이 data와 어긋나 있다');
}

// ── 3b. 자리를 따르지 않는 건물에는 등록할 수 없다 ──
{
  const dataPath = join(ROOT, 'tools', 'sprite-studio', 'data', 'worker-slots.json');
  const original = readFileSync(dataPath, 'utf8');
  const generator = join(ROOT, 'tools', 'sprite-studio', 'generate_registries.mjs');
  const rejects = (payload, why) => {
    writeFileSync(dataPath, JSON.stringify(payload), 'utf8');
    let rejected = false;
    try {
      execFileSync('node', [generator], { stdio: 'pipe' });
    } catch {
      rejected = true;
    }
    assert.ok(rejected, why);
  };
  try {
    rejects({ smithy: [{ tileDX: 1, tileDY: 1, offsetX: 0, offsetY: 0, facing: 0 }] },
      '아직 자리를 따르지 않는 건물은 거부해야 한다');
    rejects({ woodShed: [{ tileDX: 0, tileDY: 0, offsetX: 0, offsetY: 0, facing: 0 }] },
      '건물 칸 위(0,0) 자리는 통행 불가라 거부해야 한다');
  } finally {
    writeFileSync(dataPath, original, 'utf8');
    execFileSync('node', [generator], { stdio: 'pipe' });
  }
  assert.equal(
    readFileSync(join(ROOT, 'src', 'game', 'buildingWorkerSlots.ts'), 'utf8'),
    slotSource,
    '거부된 저장 뒤에도 원래 자리 데이터가 남아야 한다',
  );
}

// ── 4. 건물 효과 초기 스냅샷이 기존 하드코딩 대상과 일치한다 ──
{
  const presentation = readFileSync(join(ROOT, 'src', 'game', 'workplacePresentation.ts'), 'utf8');
  const table = presentation.match(/WORKPLACE_PRESENTATIONS[^=]*=\s*\{([\s\S]*?)\n\};/)[1];
  const expected = new Map();
  for (const [, type, activity] of table.matchAll(/^\s*(\w+):\s*\{[^}]*activity:\s*'(\w+)'/gm)) {
    expected.set(type, activity);
  }
  assert.ok(expected.size >= 15, '작업장 표를 읽지 못했다');

  const kindsFor = { fire: ['chimneySmoke', 'fireSparks'], craft: ['craftGlint'], service: ['serviceGlow'] };
  for (const [type, activity] of expected) {
    const emitters = registries.buildingEffectEmitters(type);
    const working = emitters.filter(emitter => emitter.when === 'working').map(emitter => emitter.kind);
    assert.deepEqual(working, kindsFor[activity], `${type}(${activity})의 가동 중 효과가 기존과 다르다`);
  }

  for (const type of ['hut', 'ondol', 'center', 'garrison']) {
    const night = registries.buildingEffectEmitters(type).filter(emitter => emitter.when === 'night');
    assert.ok(night.some(emitter => emitter.kind === 'windowGlow'), `${type}의 밤 창불이 빠졌다`);
  }
  for (const type of ['ondol', 'center']) {
    const heating = registries.buildingEffectEmitters(type).filter(emitter => emitter.when === 'winterHeating');
    assert.deepEqual(heating.map(emitter => emitter.kind), ['chimneySmoke'], `${type}의 난방 연기가 빠졌다`);
  }
}

console.log('sprite studio registry tests passed');
