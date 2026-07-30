import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-diplomatic-action-e2-tests-'));
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
const diplomacy = await import(pathToFileURL(join(compiledDir, 'diplomacy.mjs')).href);
const raids = await import(pathToFileURL(join(compiledDir, 'raids.mjs')).href);
const territory = await import(pathToFileURL(join(compiledDir, 'territory.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const constants = await import(pathToFileURL(join(compiledDir, 'constants.mjs')).href);

const faction = '오도리 씨족';

{
  const state = simulation.newGame(73041);
  state.relations[faction] = 65;
  state.resources.silk = 2;
  const initialSuspicion = state.suspicion;

  assert.equal(diplomacy.openPactEnvoy(state, faction), null);
  assert.equal(state.pendingChoice?.kind, 'pactEnvoy');
  const preview = diplomacy.pactPreview(state, faction, 'silk', 2);
  assert.equal(preview.years, 2);
  assert.equal(preview.meetsGiftValue, true);
  assert.equal(diplomacy.sendPactEnvoy(state, faction, 'silk', 2), null);
  assert.equal(state.resources.silk, 0, '동봉 예물은 사절 출발 즉시 차감한다');
  assert.equal(state.suspicion, initialSuspicion, '의심은 체결 답신 때만 오른다');
  assert.equal(state.pendingEnvoys[0].kind, 'pact');
  assert.equal(state.pendingEnvoys[0].pactYears, 2, '기간은 출발 시점 관계로 고정한다');

  state.day = 7;
  diplomacy.dailyDiplomacyTick(state);
  assert.equal(state.pendingEnvoys.length, 0);
  assert.equal(diplomacy.pactRemainingDays(state, faction), 96);
  assert.equal(state.suspicion, initialSuspicion + 6);
  assert.match(diplomacy.canOpenPactEnvoy(state, faction), /이미 이 세력과 화친 맹약/);
  assert.equal(raids.openExtortionDemand(state, () => 0, false, 20, faction), false, '맹약 세력은 강탈 요구를 열지 않는다');
  raids.spawnRaiders(state, () => 0, false, faction, 20);
  assert.equal(state.raiders, null, '맹약 세력은 직접 스폰 요청도 무시한다');

  state.day = 103;
  state.resources.silk = 2;
  diplomacy.dailyDiplomacyTick(state);
  assert.equal(state.pendingChoice?.kind, 'pactRenewal', '만료일에는 갱신 제안을 연다');
  simulation.resolveChoice(state, 'renew');
  assert.equal(state.pendingChoice?.kind, 'pactEnvoy', '갱신은 같은 동봉 예물 사절 UI로 이어진다');
}

{
  const state = simulation.newGame(73042);
  state.relations[faction] = 80;
  state.diplomaticPacts = [{ factionName: faction, untilDay: state.day + 80 }];
  const initialThreat = state.threat;
  const site = state.foreignSites.find(candidate => candidate.factionName === faction);
  assert.ok(site, '대상 여진 세력 생활권이 존재한다');
  state.pendingChoice = {
    kind: 'territory', title: '항의', body: '', options: [], data: { mode: 'warning', siteId: site.id },
  };
  territory.resolveTerritoryWarning(state, 'ignore');
  assert.equal(diplomacy.activeDiplomaticPact(state, faction), null, '생활권 항의 묵살은 맹약을 파기한다');
  assert.equal(state.relations[faction], 47, '항의 묵살과 맹약 파기의 관계 하락이 모두 적용된다');
  assert.equal(state.threat, initialThreat + 16, '항의 묵살의 위협 4와 파기 위협 12가 합산된다');
}

{
  const state = simulation.newGame(73043);
  state.threat = 100;
  state.diplomaticPacts = constants.FACTIONS
    .filter(candidate => candidate.raidEligible !== false)
    .map(candidate => ({ factionName: candidate.name, untilDay: state.day + 10 }));
  assert.doesNotThrow(() => raids.checkRaidTrigger(state, () => 0));
  assert.equal(state.raiders, null, '모든 습격 후보가 맹약 중이면 그날 습격은 조용히 건너뛴다');
}

{
  const state = simulation.newGame(73044);
  state.pendingEnvoys = [{
    factionName: faction, kind: 'pact', payload: { silk: 2 }, dueDay: 12, pactYears: 4,
  }];
  diplomacy.normalizeDiplomacyState(state);
  assert.equal(state.pendingEnvoys[0].pactYears, 4, '저장 정규화는 출발 시 확정한 맹약 기간을 보존한다');
}

const factionsSource = readFileSync(new URL('../../src/components/dock/FactionsWindow.tsx', import.meta.url), 'utf8');
const dialogSource = readFileSync(new URL('../../src/components/GiftEnvoyDialog.tsx', import.meta.url), 'utf8');
const expeditionSource = readFileSync(new URL('../../src/game/expedition.ts', import.meta.url), 'utf8');
assert.match(factionsSource, /onOpenPactEnvoy/);
assert.match(dialogSource, /pactPreview/);
assert.match(expeditionSource, /breakDiplomaticPact\(state, site\.factionName, 'lairAssault'\)/);

console.log('diplomatic action E2 tests passed');
