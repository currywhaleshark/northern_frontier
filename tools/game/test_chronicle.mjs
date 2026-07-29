// 연대기 — 정착지 이름·사건 기록·통계의 표적 검증.
// 계획: docs/DESIGN-2026-07-29-chronicle-screen.md §5 표적 검증
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-chronicle-'));
  for (const file of readdirSync(srcDir).filter(name => name.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) => {
      if (/\.[cm]?js$/.test(spec)) return `${start}${spec}${end}`;
      return `${start}${spec}.mjs${end}`;
    });
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const dir = compileGameModules();
const load = name => import(pathToFileURL(join(dir, `${name}.mjs`)).href);
const simulation = await load('simulation');
const naming = await load('settlementName');
const annalsModule = await load('annals');
const chronicleStats = await load('chronicleStats');
const residents = await load('residents');
const { CONFIG } = await load('config');

const SEED = 20260729;

// ── 1. 자동 이름 — 시드의 순수 함수, 공용 RNG 무간섭 ──
{
  assert.equal(naming.generateSettlementName(777), naming.generateSettlementName(777),
    '같은 시드는 항상 같은 이름');
  assert.ok(naming.generateSettlementName(777).length >= 2, '이름이 비어 있지 않다');

  const unnamed = simulation.newGame(SEED);
  const named = simulation.newGame(SEED, 'normal', '가람골');
  assert.equal(named.settlementName, '가람골', '메뉴가 넘긴 이름을 그대로 쓴다');
  assert.equal(unnamed.settlementName, naming.generateSettlementName(SEED),
    '이름 없는 호출은 시드 자동 이름을 쓴다');
  // 이름 생성이 시뮬레이션 RNG를 소비했다면 주민·지형 추첨이 어긋난다.
  assert.equal(unnamed.residents[0].name, named.residents[0].name,
    '이름 유무가 주민 생성 난수 순서를 바꾸지 않는다');
  assert.deepEqual(
    unnamed.buildings.map(building => [building.type, building.x, building.y]),
    named.buildings.map(building => [building.type, building.x, building.y]),
    '이름 유무가 초기 건물 배치를 바꾸지 않는다',
  );
}

// ── 2. 창건 기록과 1년차 스냅샷은 정확히 한 번 ──
{
  const state = simulation.newGame(SEED, 'normal', '가람골');
  assert.equal(state.annals.filter(entry => entry.kind === 'founding').length, 1, '창건 기록 1건');
  assert.ok(state.annals[0].text.includes('가람골'), '창건 문장에 마을 이름이 들어간다');
  assert.equal(state.yearlySnapshots.length, 1, '1년차 스냅샷 1건');
  assert.equal(state.yearlySnapshots[0].year, 1);
  assert.ok(state.yearlySnapshots[0].population > 0, '스냅샷에 인구가 담긴다');
  assert.equal(state.lifetimeStats.trackingSinceDay, 1, '신규 게임은 1일부터 기록');
}

// ── 하루 넘기기 — 서브틱 끝으로 밀고 한 틱 (일일 처리만 빠르게 돈다) ──
function skipDays(state, days) {
  for (let i = 0; i < days; i++) {
    state.pendingChoice = null;
    state.subTick = simulation.SUBTICKS - 1;
    simulation.advanceTick(state);
    if (state.gameOver) break;
  }
}

// ── 3. 개칭 청원 — 파발 왕복·쿨다운·연대기 1건 ──
{
  const state = simulation.newGame(SEED, 'normal', '가람골');
  const travel = CONFIG.settlementNaming.renameTravelDays;

  assert.equal(naming.requestSettlementRename(state, '   '), '이름을 비워 둘 수 없습니다');
  assert.equal(naming.requestSettlementRename(state, '가람골'), '지금 이름과 같습니다');
  assert.equal(naming.requestSettlementRename(state, '늘봄골'), null, '정상 청원은 통과');
  assert.ok(naming.requestSettlementRename(state, '다른골'), '왕복 중 재청원은 막힌다');

  skipDays(state, travel - 1);
  assert.equal(state.settlementName, '가람골', '파발 귀환 전에는 옛 이름 유지');
  skipDays(state, 1);
  assert.equal(state.settlementName, '늘봄골', '귀환일에 허가가 내려온다');
  assert.equal(state.pendingSettlementRename, null);
  assert.equal(state.annals.filter(entry => entry.kind === 'court' && entry.text.includes('개칭')).length, 1,
    '개칭 연대기는 실제 적용 시 1건만');
  assert.equal(state.settlementRenameCooldownUntil, state.day + CONFIG.time.yearDays - 0,
    '적용일부터 1년 재개칭 불가');
  assert.ok(naming.requestSettlementRename(state, '또다른골'), '쿨다운 중 청원은 막힌다');
  const before = state.annals.find(entry => entry.kind === 'founding');
  assert.ok(before.text.includes('가람골'), '이미 기록된 연대기 문장은 당시 이름을 보존한다');
}

// ── 4. 연초 스냅샷 — 해가 바뀔 때 1건, 중복 없음 ──
{
  const state = simulation.newGame(SEED, 'normal', '가람골');
  for (const resource of Object.keys(state.resources)) {
    if (resource !== 'reputation' && resource !== 'defense') state.resources[resource] = 500;
  }
  skipDays(state, CONFIG.time.yearDays + 3);
  assert.equal(state.gameOver, null, '풍족한 마을은 한 해를 넘긴다');
  const years = state.yearlySnapshots.map(snapshot => snapshot.year);
  assert.deepEqual(years, [1, 2], '연도별 스냅샷이 1·2년차 각 1건');
  chronicleStats.recordYearlySnapshot(state);
  assert.equal(state.yearlySnapshots.length, 2, '같은 연도 재호출은 무시된다');
}

// ── 5. 인구 이정표·주요 건물·엔딩 — dedupe 계약 ──
{
  const state = simulation.newGame(SEED, 'normal', '가람골');
  annalsModule.recordPopulationMilestones(state, 30);
  annalsModule.recordPopulationMilestones(state, 60);
  const milestones = state.annals.filter(entry => entry.kind === 'population');
  assert.deepEqual(milestones.map(entry => entry.dedupeKey), ['population:10', 'population:25', 'population:50'],
    '통과한 이정표만, 각 1회');

  annalsModule.recordNotableBuildingCompletion(state, 'smithy');
  annalsModule.recordNotableBuildingCompletion(state, 'smithy');
  annalsModule.recordNotableBuildingCompletion(state, 'palisade');
  annalsModule.recordNotableBuildingCompletion(state, 'stoneWall');
  annalsModule.recordNotableBuildingCompletion(state, 'hut'); // 연대기감 아님
  const buildings = state.annals.filter(entry => entry.kind === 'building');
  assert.equal(buildings.length, 2, '대장간 1건 + 첫 성벽 1건 (재완공·비대상 무시)');

  annalsModule.endGame(state, false, '시험 멸망');
  annalsModule.endGame(state, false, '두 번째 호출은 무시');
  assert.equal(state.gameOver.reason, '시험 멸망');
  assert.equal(state.annals.filter(entry => entry.kind === 'ending').length, 1, '엔딩 기록 1건');
}

// ── 6. 사망 원인 카운터 — killResident가 원인별로 센다 ──
{
  const state = simulation.newGame(SEED, 'normal', '가람골');
  const [first, second, third] = state.residents;
  residents.killResident(state, first, '병');
  residents.killResident(state, second, '굶주림', true);
  residents.killResident(state, third, '적의 칼', false, true);
  const causes = state.lifetimeStats.deathsByCause;
  assert.equal(causes.disease, 1);
  assert.equal(causes.starvation, 1);
  assert.equal(causes.combat, 1);
  assert.equal(causes.disease + causes.starvation + causes.cold + causes.combat + causes.other, 3);
}

console.log('chronicle tests passed');
