import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-diplomatic-figure-tests-'));
  for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
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
const figures = await import(pathToFileURL(join(compiledDir, 'diplomaticFigures.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const { CURRENT_SCHEMA_VERSION } = await import(pathToFileURL(join(compiledDir, 'saveSchema.mjs')).href);

const allowedNames = {
  '오도리 씨족': ['동막사', '동말응거', '동창아', '최보야', '최어부', '보고로', '마사', '이을적'],
  '올량합 부락': ['이시내', '야음부', '주장개', '도은도', '소응거', '노요고', '두이응거', '보양개', '가을다개', '돌룡합', '거을가개', '나수'],
  '골간 우디캐': ['김조랑가', '무거응가', '아이간가', '아지가', '김모다오', '도쌍가', '이마두', '김모하', '진홍오', '연다', '간아지', '김우두', '이도롱'],
  '니마차 우디캐': ['라방개', '오을도개', '야다호', '말응거', '아인첩목', '자리', '이보양개', '이부롱고', '야당지', '야랑가우', '시응거', '임다', '우증거', '잉이가'],
  '홀라온 야인': ['하질이', '부자타', '소라적', '가롱개', '망가', '구적라', '모도오', '나이곤', '보당개', '도아야', '도리야노노호', '사롱합', '호시단'],
};

assert.equal(CURRENT_SCHEMA_VERSION, 49);
assert.equal(saveLoad.CURRENT_SCHEMA_VERSION, 49);

{
  const first = figures.createFactionLeaders(20260730);
  const replayed = figures.createFactionLeaders(20260730);
  assert.deepEqual(first, replayed, '같은 시드의 부족 지도자는 항상 같다');
  assert.deepEqual(Object.keys(first), figures.DIPLOMATIC_FACTION_NAMES);
  for (const [factionName, leader] of Object.entries(first)) {
    assert.ok(allowedNames[factionName].includes(leader.name), `${factionName}은 사료 기반 집단별 풀만 쓴다`);
  }
}

{
  const state = simulation.newGame(73001);
  assert.equal(state.borderCommander.termIndex, 0);
  assert.equal(Object.keys(state.factionLeaders).length, 5);
  assert.equal(figures.factionLeaderFor(state, '변경 마적'), null);
  assert.equal(figures.factionLeaderFor(state, '만상'), null);
  assert.equal(figures.factionLeaderFor(state, '송상'), null);
  assert.equal(figures.borderCommanderDaysRemaining(state), 96);

  const originalName = state.borderCommander.name;
  state.day = 96;
  assert.equal(figures.borderCommanderTermIndex(state.day), 0);
  assert.equal(figures.borderCommanderDaysRemaining(state), 1);
  figures.updateDiplomaticFigures(state);
  assert.equal(state.borderCommander.name, originalName, '96일째까지 같은 북병사가 재임한다');

  state.day = 97;
  figures.updateDiplomaticFigures(state);
  assert.equal(state.borderCommander.termIndex, 1);
  assert.notEqual(state.borderCommander.name, originalName, '97일째에는 다른 이름의 북병사가 부임한다');
  assert.equal(state.log.filter(entry => entry.text.includes('새로 부임')).length, 1);
  assert.equal(state.annals.filter(entry => entry.dedupeKey === 'border-commander:1').length, 1);

  figures.updateDiplomaticFigures(state);
  assert.equal(state.log.filter(entry => entry.text.includes('새로 부임')).length, 1, '같은 임기 부임 로그는 중복되지 않는다');
  assert.equal(state.annals.filter(entry => entry.dedupeKey === 'border-commander:1').length, 1);
}

{
  const legacyLog = [{ day: 130, text: '기존 기록', kind: 'info' }];
  const migrated = saveLoad.migrateV47ToV48({
    schemaVersion: 47,
    seed: 73002,
    day: 130,
    log: legacyLog,
    annals: [],
  });
  assert.equal(migrated.schemaVersion, 48);
  assert.equal(migrated.borderCommander.termIndex, 1, '구저장은 현재 날짜의 임기로 들어온다');
  assert.deepEqual(migrated.log, legacyLog, '구저장 마이그레이션은 과거 부임 로그를 소급 생성하지 않는다');
  assert.equal(Object.keys(migrated.factionLeaders).length, 5);
}

{
  const commander = figures.createBorderCommander(73003, 3);
  const replayed = figures.createBorderCommander(73003, 3);
  const next = figures.createBorderCommander(73003, 4);
  assert.deepEqual(commander, replayed, '같은 시드와 임기의 북병사는 항상 같다');
  assert.notEqual(commander.name, next.name, '인접 임기는 같은 이름을 쓰지 않는다');
  assert.equal(typeof figures.borderCommanderRumor(commander.temper), 'string');
}

const courtSource = readFileSync(new URL('../../src/components/dock/CourtWindow.tsx', import.meta.url), 'utf8');
const factionsSource = readFileSync(new URL('../../src/components/dock/FactionsWindow.tsx', import.meta.url), 'utf8');
const tradeSource = readFileSync(new URL('../../src/components/TradeDialog.tsx', import.meta.url), 'utf8');
assert.match(courtSource, /court-commander-card/);
assert.match(factionsSource, /factionLeaderFor/);
assert.match(tradeSource, /factionLeaderGreeting/);

console.log('diplomatic figure tests passed');
