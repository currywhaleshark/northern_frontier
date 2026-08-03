// 개발용 치트 패널 계약 — docs/DESIGN-2026-08-03-debug-cheat-panel.md
// 1) debugActions의 조작이 표식·로그를 남기고 모달·전투 잠금을 지키는지
// 2) 패널이 DEV 게이트 + 지연 import 뒤에 있고, 게임 코드가 debugActions를 역참조하지 않는지
// 3) 프로덕션 산출물(dist)에 패널 코드가 섞이지 않았는지
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-debug-panel-tests-'));
  for (const file of readdirSync(srcDir).filter(name => name.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) =>
      /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const compiledDir = compileGameModules();
const debugActions = await import(pathToFileURL(join(compiledDir, 'debugActions.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);

function freshState() {
  const state = simulation.newGame(2026080301, 'normal');
  state.scenario = null;
  return state;
}

// ── 1. 조작 계약 ──────────────────────────────────────────────

{
  const state = freshState();
  assert.equal(state.debugTouched, undefined, '새 게임은 치트 표식 없이 시작한다');

  const before = state.resources.grain;
  const result = debugActions.debugAddResource(state, 'grain', 100);
  assert.ok(result.ok, '자원 지급은 성공해야 한다');
  assert.equal(state.resources.grain, before + 100);
  assert.equal(state.debugTouched, true, '치트 조작은 debugTouched 표식을 남긴다');
  const lastLog = state.log[state.log.length - 1];
  assert.match(lastLog.text, /^\(디버그\) /, '조작은 (디버그) 접두 로그 한 줄을 남긴다');
  assert.equal(lastLog.day, state.day);
}

{
  // 자원은 음수로 내려가지 않는다
  const state = freshState();
  debugActions.debugSetResource(state, 'stone', 5);
  debugActions.debugAddResource(state, 'stone', -50);
  assert.equal(state.resources.stone, 0);
}

{
  // 모달·전투 중에는 파괴적 조작이 잠기고 사유가 나온다
  const state = freshState();
  assert.equal(debugActions.debugLockReason(state), null);

  state.pendingChoice = { kind: 'incident', title: 't', body: 'b', options: [], data: {} };
  assert.ok(debugActions.debugLockReason(state), '모달 중에는 잠금 사유가 있어야 한다');
  const jump = debugActions.debugAdvanceDays(state, 3);
  assert.equal(jump.ok, false, '모달 중 시간 점프는 막힌다');
  assert.match(jump.reason, /잠겨/);
  const raid = debugActions.debugSpawnRaid(state, 8);
  assert.equal(raid.ok, false, '모달 중 사건 발화는 막힌다');

  state.pendingChoice = null;
  state.tacticalBattle = { phase: 'deployment' };
  assert.ok(debugActions.debugLockReason(state), '전술 전투 중에도 잠긴다');
  state.tacticalBattle = null;

  // 자원처럼 되돌릴 수 있는 조작은 잠금과 무관하다
  state.pendingChoice = { kind: 'incident', title: 't', body: 'b', options: [], data: {} };
  assert.ok(debugActions.debugAddResource(state, 'wood', 10).ok);
}

{
  // 시간 점프는 앞으로만 간다
  const state = freshState();
  const startDay = state.day;
  const forward = debugActions.debugAdvanceDays(state, 3);
  assert.ok(forward.ok);
  assert.equal(state.day, startDay + 3);
  const backward = debugActions.debugJumpToDate(state, 1, 'spring', 1);
  assert.equal(backward.ok, false, '과거로는 이동할 수 없다');
}

{
  // 전 지도 탐사 해제
  const state = freshState();
  debugActions.debugRevealMap(state);
  const unexplored = state.exploration.explored.flat().filter(explored => explored !== true).length;
  assert.equal(unexplored, 0, '전 지도 탐사 해제 뒤에는 미답사 칸이 없다');
}

{
  // 주민 스폰은 실제 주민 배열에 들어간다
  const state = freshState();
  const before = state.residents.length;
  const result = debugActions.debugSpawnResidents(state, { count: 3, gender: 'female', ageBand: 'adult' });
  assert.ok(result.ok);
  assert.equal(state.residents.length, before + 3);
  for (const resident of state.residents.slice(before)) {
    assert.equal(resident.gender, 'female');
    assert.ok(resident.alive);
  }
}

{
  // 길잡이 기록 초기화
  const state = freshState();
  state.guides = { enabled: true, seen: { fire: 3 } };
  assert.ok(debugActions.debugResetGuides(state).ok);
  assert.deepEqual(state.guides.seen, {});
}

// ── 2. 소스 구조 (DEV 게이트·지연 import·단방향 의존) ─────────────

const srcRoot = fileURLToPath(new URL('../../src/', import.meta.url));
const sessionSource = readFileSync(join(srcRoot, 'GameSession.tsx'), 'utf8');

assert.match(sessionSource, /import\.meta\.env\.DEV\s*\r?\n?\s*\?\s*lazy\(\(\) => import\('\.\/components\/DebugCheatPanel'\)/,
  '치트 패널은 DEV 게이트와 지연 import 뒤에 있어야 한다');
assert.doesNotMatch(sessionSource, /^import \{[^}]*DebugCheatPanel/m,
  '치트 패널은 정적 import로 남아 있으면 안 된다');
assert.doesNotMatch(sessionSource, /from '\.\/game\/debugActions'/,
  '게임 세션은 debugActions를 직접 부르지 않는다 (UI는 패널만 통한다)');
assert.match(sessionSource, /event\.code === 'Backquote'/, '백틱 토글이 있어야 한다');

function collectSourceFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectSourceFiles(path));
    else if (/\.tsx?$/.test(entry.name)) files.push(path);
  }
  return files;
}

const debugImporters = collectSourceFiles(srcRoot)
  .filter(path => /(?:from|import)\s*\(?\s*['"][^'"]*game\/debugActions['"]/.test(readFileSync(path, 'utf8')))
  .map(path => path.slice(srcRoot.length).replace(/\\/g, '/'));
assert.deepEqual(debugImporters, ['components/DebugCheatPanel.tsx'],
  'debugActions는 치트 패널 한 곳에서만 참조되어야 한다 (단방향 의존)');

const panelSource = readFileSync(join(srcRoot, 'components/DebugCheatPanel.tsx'), 'utf8');
assert.match(panelSource, /from '\.\.\/game\/debugActions'/, '패널은 조작을 debugActions에서만 가져온다');
for (const forbidden of [/from '\.\.\/game\/simulation'/, /from '\.\.\/game\/raids'/, /from '\.\.\/game\/disasters'/]) {
  assert.doesNotMatch(panelSource, forbidden, '패널이 게임 시스템 모듈을 직접 부르면 안 된다');
}

// 치트 표식은 구 저장 마이그레이션 없이 기본값 false로 보정한다
const saveLoadSource = readFileSync(join(srcRoot, 'game/saveLoad.ts'), 'utf8');
assert.match(saveLoadSource, /parsed\.debugTouched = parsed\.debugTouched === true;/,
  '치트 표식은 불러오기에서 기본값 false로 보정되어야 한다');

// ── 3. 프로덕션 산출물 무포함 ─────────────────────────────────

const distAssets = fileURLToPath(new URL('../../dist/assets/', import.meta.url));
if (existsSync(distAssets)) {
  const bundles = readdirSync(distAssets).filter(name => name.endsWith('.js'));
  assert.ok(bundles.length > 0, 'dist/assets에 번들이 있어야 한다');
  const markers = ['디버그 치트', 'debug-cheat-panel', '개발용 치트', '(디버그)', '전 지도 탐사 해제'];
  for (const bundle of bundles) {
    const code = readFileSync(join(distAssets, bundle), 'utf8');
    for (const marker of markers) {
      assert.ok(!code.includes(marker),
        `프로덕션 번들 ${bundle}에 치트 패널 문자열이 남았다: ${marker}`);
    }
  }
} else {
  console.log('  (dist 없음 — 프로덕션 무포함 검사는 건너뜀. npm run build 뒤 다시 실행)');
}

console.log('debug cheat panel tests passed');
