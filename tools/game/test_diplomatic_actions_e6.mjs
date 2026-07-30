import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-diplomatic-action-e6-tests-'));
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
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const diplomacy = await import(pathToFileURL(join(compiledDir, 'diplomacy.mjs')).href);
const aid = await import(pathToFileURL(join(compiledDir, 'militaryAid.mjs')).href);
const expedition = await import(pathToFileURL(join(compiledDir, 'expedition.mjs')).href);
const tacticalAssault = await import(pathToFileURL(join(compiledDir, 'tacticalAssault.mjs')).href);
const siteDiplomacy = await import(pathToFileURL(join(compiledDir, 'siteDiplomacy.mjs')).href);
const combatRoster = await import(pathToFileURL(join(compiledDir, 'combatRoster.mjs')).href);
const agents = await import(pathToFileURL(join(compiledDir, 'agents.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function banditLair(state) {
  const site = state.foreignSites.find(candidate => candidate.type === 'banditLair');
  assert.ok(site, '산채가 생성되어야 한다');
  site.discovered = true;
  site.status = 'stable';
  return site;
}

function prepareMilitia(state, count = 6) {
  const residents = state.residents.slice(0, count);
  assert.equal(residents.length, count);
  for (const resident of residents) {
    resident.stage = undefined;
    resident.job = 'militia';
    resident.alive = true;
    resident.sick = false;
    resident.health = 100;
    resident.quarantinedUntil = 0;
  }
  return residents;
}

{
  const state = simulation.newGame(76001);
  const site = banditLair(state);
  const faction = '오도리 씨족';
  state.relations[faction] = 80;
  state.resources.grain = 100;
  state.resources.meat = 100;
  const cost = aid.aidRequestCost(state, faction);
  assert.equal(aid.openAidRequest(state, faction), null);
  assert.equal(state.pendingChoice?.kind, 'aidRequestEnvoy');
  simulation.resolveChoice(state, `target-${site.id}`);
  assert.equal(state.pendingEnvoys[0]?.kind, 'aidRequest');
  assert.equal(state.pendingEnvoys[0]?.dueDay, 1 + CONFIG.diplomacy.envoyTravelDays);
  assert.equal(state.resources.grain, 100 - cost.grain);
  assert.equal(state.resources.meat, 100 - cost.meat);
  assert.equal(state.suspicion, CONFIG.diplomacy.aidSuspicion, '원병 요청은 의심을 크게 올린다');
  state.day = 1 + CONFIG.diplomacy.envoyTravelDays;
  diplomacy.dailyDiplomacyTick(state);
  assert.equal(state.militaryAid?.targetSiteId, site.id);
  assert.equal(state.militaryAid?.warriorCount, cost.warriors);
}

{
  const state = simulation.newGame(76002);
  const site = banditLair(state);
  const members = prepareMilitia(state, 4);
  const faction = '올량합 부락';
  state.relations[faction] = 90;
  const ready = {
    factionName: faction,
    targetSiteId: site.id,
    warriorCount: aid.aidWarriorCount(state, faction),
    arrivedDay: state.day,
  };
  const baselineChance = siteDiplomacy.banditLairRaidChance(state, site.id, members.map(member => member.id));
  state.militaryAid = ready;
  const residentCountBeforeAid = state.residents.length;
  const aidedChance = siteDiplomacy.banditLairRaidChance(state, site.id, members.map(member => member.id));
  assert.ok(aidedChance > baselineChance, '개전 전 예상 승산에도 대기 원병 전력이 반영된다');
  const center = state.buildings.find(building => building.type === 'center');
  assert.ok(center);
  assert.equal(expedition.createExpedition(state, {
    kind: 'lairAssault',
    memberIds: members.map(member => member.id),
    targetX: center.x,
    targetY: center.y,
    targetSiteId: site.id,
  }), null);
  assert.equal(state.militaryAid, null, '원병은 원정 생성 순간 소비되어 재사용할 수 없다');
  assert.equal(state.expedition?.externalAid?.committed, ready.warriorCount);
  assert.ok(expedition.expeditionCombatPower(state, members.map(member => member.id)) >
    expedition.expeditionMusterPreview(state, members.map(member => member.id)).expeditionPower,
  '개전 모달 전력에는 원병 전력이 더해진다');

  state.expedition.phase = 'engage';
  state.expedition.x = site.x;
  state.expedition.y = site.y;
  const battle = tacticalAssault.createBanditLairTacticalAssault(state);
  assert.equal(typeof battle, 'object');
  const externalGroup = state.tacticalBattle.defenderGroups.find(group => group.externalAidFactionName === faction);
  assert.ok(externalGroup, '직접 지휘 전술 로스터에 여진 원병 조가 합류한다');
  assert.deepEqual(externalGroup.residentIds, [], '외부 원병은 주민 ID를 빌리지 않는다');
  assert.equal(externalGroup.special, 'jurchenWarrior', '아라개 계열 전력·능력을 재사용한다');
  assert.equal(state.residents.length, residentCountBeforeAid, '외부 원병은 주민 배열에 들어오지 않는다');
}

{
  const state = simulation.newGame(76003);
  const site = banditLair(state);
  const members = prepareMilitia(state, 4);
  const faction = '골간 우디캐';
  const rawChance = siteDiplomacy.banditLairRaidChance(state, site.id, members.map(member => member.id));
  state.expedition = {
    kind: 'lairAssault',
    targetSiteId: site.id,
    targetX: site.x, targetY: site.y, musterX: site.x, musterY: site.y,
    phase: 'engage', memberIds: members.map(member => member.id),
    x: site.x, y: site.y, px: site.x, py: site.y, path: [], trail: [], speed: 1, ticks: 0,
    externalAid: { factionName: faction, committed: 5, killed: 0, wounded: 0 },
  };
  const aidedChance = siteDiplomacy.banditLairRaidChance(state, site.id, members.map(member => member.id));
  const decisiveRoll = (rawChance + aidedChance) / 2;
  const result = siteDiplomacy.resolveBanditLairAssault(
    state, site.id, members.map(member => member.id), () => decisiveRoll,
  );
  assert.equal(result.outcome, 'victory',
    '주민만으로는 실패할 판정값도 원병이 포함된 auto 승산이면 승리한다');
}

{
  const state = simulation.newGame(76004);
  const members = prepareMilitia(state, 6);
  const requester = '니마차 우디캐';
  const opponent = '홀라온 야인';
  assert.equal(aid.openWarParticipationRequest(state, requester, opponent), null);
  assert.match(state.pendingChoice?.title ?? '', new RegExp(state.factionLeaders[requester].name));
  simulation.resolveChoice(state, 'dispatch-4');
  assert.equal(state.warDispatch?.memberIds.length, 4);
  const dispatched = new Set(state.warDispatch.memberIds);
  assert.ok(combatRoster.createCombatRoster(state, { context: 'villageDefense' }).combatants
    .every(combatant => !dispatched.has(combatant.residentId)),
  '파견 민병은 마을 방어 로스터에서 빠진다');
  assert.ok(expedition.availableExpeditionResidents(state)
    .every(resident => !dispatched.has(resident.id)),
  '파견 민병은 다른 토벌대에 중복 선발되지 않는다');
  agents.agentsTick(state);
  assert.ok(members.filter(member => dispatched.has(member.id))
    .every(member => member.task === '부족 전쟁 파견 중'));
  const requesterBefore = state.relations[requester];
  const opponentBefore = state.relations[opponent];
  const suspicionBefore = state.suspicion;
  const grainBefore = state.resources.grain;
  const hideBefore = state.resources.hide;
  const residentCountBeforeDispatch = state.residents.length;
  state.day = state.warDispatch.dueDay;
  aid.dailyMilitaryDiplomacyTick(state);
  assert.equal(state.warDispatch, null);
  assert.ok(state.relations[requester] > requesterBefore);
  assert.ok(state.relations[opponent] < opponentBefore);
  assert.equal(state.suspicion, suspicionBefore + CONFIG.diplomacy.warDispatchSuspicion);
  assert.ok(state.resources.grain > grainBefore && state.resources.hide > hideBefore,
    '추상 참전 결산은 전리품을 가져온다');
  assert.equal(state.pendingChoice?.kind, 'warParticipationResult', '파견 결산은 확인 가능한 결과 이벤트로 뜬다');
  assert.equal(state.residents.length, residentCountBeforeDispatch,
    '파견 결과가 외부 전투원을 주민으로 만들지 않는다');
}

{
  const state = simulation.newGame(76005);
  prepareMilitia(state, 3);
  const requester = '오도리 씨족';
  const opponent = '올량합 부락';
  const before = state.relations[requester];
  aid.openWarParticipationRequest(state, requester, opponent);
  simulation.resolveChoice(state, 'decline');
  assert.equal(state.relations[requester], before - CONFIG.diplomacy.warDispatchDeclineRelationLoss);
  assert.equal(state.warDispatch, null, '참전 거절은 파견을 만들지 않는다');
}

{
  const migrated = saveLoad.migrateV51ToV52({ schemaVersion: 51 });
  assert.equal(migrated.schemaVersion, 52);
  assert.equal(migrated.militaryAid, null);
  assert.equal(migrated.warDispatch, null);
  const state = simulation.newGame(76006);
  const site = banditLair(state);
  const militia = prepareMilitia(state, 2);
  state.militaryAid = { factionName: '없는 세력', targetSiteId: site.id, warriorCount: 99, arrivedDay: 1 };
  state.warDispatch = {
    requesterFactionName: '오도리 씨족',
    opposingFactionName: '오도리 씨족',
    memberIds: [militia[0].id, 999999],
    sentDay: 1,
    dueDay: 10,
  };
  aid.normalizeMilitaryAidState(state);
  assert.equal(state.militaryAid, null, '손상 저장의 알 수 없는 원병 세력은 폐기한다');
  assert.equal(state.warDispatch, null, '2명 미만·동일 당사자의 손상 파견은 보상 없이 폐기한다');
}

const factionsSource = readFileSync(new URL('../../src/components/dock/FactionsWindow.tsx', import.meta.url), 'utf8');
const rendererSource = readFileSync(new URL('../../src/render/renderer.ts', import.meta.url), 'utf8');
assert.match(factionsSource, /canOpenAidRequest/);
assert.match(factionsSource, /원병 사절 왕복 중/);
assert.match(factionsSource, /부족 전쟁 파견/);
assert.match(rendererSource, /warDispatchIds\.has\(r\.id\)/);

console.log('diplomatic action E6 tests passed');
