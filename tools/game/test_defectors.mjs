import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-defector-tests-'));
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

const store = new Map();
globalThis.localStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, value),
  removeItem: key => store.delete(key),
};

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const immigration = await import(pathToFileURL(join(compiledDir, 'immigration.mjs')).href);
const siteDiplomacy = await import(pathToFileURL(join(compiledDir, 'siteDiplomacy.mjs')).href);
const combatRoster = await import(pathToFileURL(join(compiledDir, 'combatRoster.mjs')).href);
const combatCapabilities = await import(pathToFileURL(join(compiledDir, 'combatCapabilities.mjs')).href);
const tacticalBattle = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const specialEvents = await import(pathToFileURL(join(compiledDir, 'specialEvents.mjs')).href);
const livestock = await import(pathToFileURL(join(compiledDir, 'livestock.mjs')).href);
const suspicion = await import(pathToFileURL(join(compiledDir, 'suspicion.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const residents = await import(pathToFileURL(join(compiledDir, 'residents.mjs')).href);
const defectors = await import(pathToFileURL(join(compiledDir, 'defectors.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

const NIMACHA = '니마차 우디캐';
const HOLAON = '홀라온 야인';
const COURT_DESERTER = '조정 이탈병';

function sequenceRng(values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function resetFighters(state) {
  for (const resident of state.residents) {
    resident.job = 'idle';
    resident.origin = undefined;
    resident.alive = true;
    resident.sick = false;
    resident.health = 100;
    resident.quarantinedUntil = 0;
  }
  state.expedition = null;
  state.weaponAllocationMode = 'manual';
  state.weaponAssignments = {};
  state.resources.muskets = 0;
  state.resources.gunpowder = 0;
}

// 북방 귀순 주민은 조선 성명이 아닌 여진 음차 이름풀을 쓴다.
// 조정 이탈병은 같은 origin 필드를 쓰지만 조선식 이름을 유지한다.
{
  const state = simulation.newGame(2026071700);
  const populationBefore = state.residents.length;
  const first = residents.createResident(state, () => 0, 'idle', NIMACHA);
  state.residents.push(first);
  const second = residents.createResident(state, () => 0, 'idle', HOLAON);
  const courtDeserter = residents.createResident(state, () => 0, 'idle', COURT_DESERTER);
  const pool = new Set(defectors.NORTHERN_DEFECTOR_NAMES);

  assert.ok(pool.has(first.name));
  assert.ok(pool.has(second.name));
  assert.notEqual(first.name, second.name, '이름풀이 남아 있으면 동명이인을 피한다');
  assert.ok(!pool.has(courtDeserter.name));
  assert.equal(state.residents.length, populationBefore + 1);
}

// 출신은 직업과 별개로 저장되고, 북방 귀순민은 일일 의심과 감찰 문구에 반영된다.
{
  const state = simulation.newGame(2026071701);
  state.residents[0].origin = NIMACHA;
  state.residents[0].job = 'farmer';
  state.residents[1].origin = HOLAON;
  state.residents[1].job = 'woodcutter';
  state.residents[2].origin = COURT_DESERTER;
  const factor = suspicion.suspicionBreakdown(state).find(candidate => candidate.id === 'defectors');
  assert.equal(factor.delta, 2 * CONFIG.defectors.suspicionPerNorthernResident);
  assert.match(factor.label, /2명/);
  suspicion.openInspection(state);
  assert.match(state.pendingChoice.body, /귀순 야인 2명/);
}

// 출신 보정은 개인 전투 스냅샷과 실제 전술 그룹까지 보존된다.
{
  const state = simulation.newGame(2026071702);
  resetFighters(state);
  const [local, nimacha, holaon, deserter] = state.residents;
  local.job = 'militia';
  nimacha.job = 'militia';
  nimacha.origin = NIMACHA;
  holaon.job = 'watchman';
  holaon.origin = HOLAON;
  deserter.job = 'militia';
  deserter.origin = COURT_DESERTER;
  state.resources.muskets = 1;
  state.resources.gunpowder = 1;
  state.weaponAssignments = { [deserter.id]: 'musket' };

  const snapshots = combatRoster.createCombatRoster(state, { context: 'villageDefense' }).combatants;
  const localSnapshot = snapshots.find(candidate => candidate.residentId === local.id);
  const nimachaSnapshot = snapshots.find(candidate => candidate.residentId === nimacha.id);
  const holaonSnapshot = snapshots.find(candidate => candidate.residentId === holaon.id);
  const deserterSnapshot = snapshots.find(candidate => candidate.residentId === deserter.id);
  assert.equal(nimachaSnapshot.origin, NIMACHA);
  assert.ok(nimachaSnapshot.capabilities.includes('ambush'));
  assert.ok(nimachaSnapshot.capabilities.includes('scout'));
  assert.ok(nimachaSnapshot.basePower > localSnapshot.basePower);
  assert.ok(!holaonSnapshot.capabilities.includes('mounted'), 'horse experience alone is not an active mount');
  assert.equal(combatCapabilities.isHorseExperiencedOrigin(HOLAON), true);
  assert.ok(
    deserterSnapshot.basePower + deserterSnapshot.weaponPower >
      combatCapabilities.combatWeaponTotalPower('militia', 'musket'),
  );

  const battle = tacticalBattle.createTacticalBattle(state, {
    factionName: '귀순병 시험', power: 20, warned: true, siege: false, mode: 'garrison',
  });
  const nimachaGroup = battle.defenderGroups.find(group => group.origin === NIMACHA);
  assert.ok(nimachaGroup, '출신 보정을 가진 주민은 별도 전술 그룹으로 보존된다');
  assert.ok(combatCapabilities.tacticalGroupCapabilities(nimachaGroup).has('ambush'));
}

// 낮은 확률의 귀순 이주 제안은 수용 시 출신 주민을 만들고, 거절 시 해당 세력 관계를 잃는다.
{
  const state = simulation.newGame(2026071703);
  state.day = 2;
  state.lastImmigrationDay = -999;
  const populationBefore = state.residents.length;
  assert.equal(immigration.maybeOfferDefectorImmigration(state, sequenceRng([0, 0, 0])), true);
  assert.equal(state.pendingChoice.kind, 'immigration');
  assert.equal(state.pendingChoice.data.origin, NIMACHA);
  simulation.resolveChoice(state, 'accept');
  const arrivals = state.residents.slice(populationBefore);
  assert.equal(arrivals.length, CONFIG.defectors.groupMin);
  assert.ok(arrivals.every(resident => resident.origin === NIMACHA && resident.job === 'idle'));

  const rejected = simulation.newGame(2026071704);
  rejected.day = 2;
  rejected.lastImmigrationDay = -999;
  const relationBefore = rejected.relations[NIMACHA];
  immigration.maybeOfferDefectorImmigration(rejected, sequenceRng([0, 0, 0]));
  simulation.resolveChoice(rejected, 'reject');
  assert.equal(rejected.relations[NIMACHA], relationBefore - CONFIG.defectors.rejectRelation);
}

// 굶주리거나 병든 외교 거점은 충분한 호의·신용·은혜가 있으면 주민 귀순을 청할 수 있다.
{
  const state = simulation.newGame(2026071705);
  const site = state.foreignSites.find(candidate => candidate.factionName != null && candidate.type !== 'banditLair');
  assert.ok(site);
  site.discovered = true;
  site.seasonalActive = true;
  site.status = 'hungry';
  site.goodwill = CONFIG.defectors.siteMinGoodwill;
  site.trust = CONFIG.defectors.siteMinTrust;
  site.favors = CONFIG.defectors.siteFavorCost;
  site.population = 20;
  const populationBefore = state.residents.length;
  const sitePopulationBefore = site.population;
  assert.equal(siteDiplomacy.requestSiteDefectors(state, site.id), null);
  assert.equal(state.pendingChoice.data.origin, site.factionName);
  simulation.resolveChoice(state, 'accept');
  const arrivals = state.residents.slice(populationBefore);
  assert.ok(arrivals.length > 0);
  assert.ok(arrivals.every(resident => resident.origin === site.factionName));
  assert.equal(
    suspicion.suspicionBreakdown(state).find(candidate => candidate.id === 'defectors').delta,
    arrivals.length * CONFIG.defectors.suspicionPerNorthernResident,
  );
  assert.equal(site.population, sitePopulationBefore - arrivals.length);
  assert.equal(site.favors, 0);
}

// 홀라온 귀순 사건은 거절 페널티가 없고, 수용하면 주민과 군마 사육을 함께 연다.
{
  const rejected = simulation.newGame(2026071706);
  rejected.buildings.push({
    id: rejected.nextBuildingId++, type: 'stable', x: 0, y: 0,
    progress: 99, built: true, fieldGrowth: 0,
    livestock: livestock.createLivestockState('chicken', 0),
  });
  const relationBefore = rejected.relations[HOLAON];
  const suspicionBefore = rejected.suspicion;
  assert.equal(specialEvents.maybeOpenHorseDefectorEvent(rejected, () => 0), true);
  simulation.resolveChoice(rejected, 'reject');
  assert.equal(rejected.relations[HOLAON], relationBefore);
  assert.equal(rejected.suspicion, suspicionBefore);
  assert.ok(!rejected.unlockedLivestock.includes('horse'));

  const accepted = simulation.newGame(2026071707);
  const stable = {
    id: accepted.nextBuildingId++, type: 'stable', x: 0, y: 0,
    progress: 99, built: true, fieldGrowth: 0,
    livestock: livestock.createLivestockState('chicken', 0),
  };
  accepted.buildings.push(stable);
  const populationBefore = accepted.residents.length;
  assert.equal(specialEvents.maybeOpenHorseDefectorEvent(accepted, () => 0), true);
  simulation.resolveChoice(accepted, 'accept');
  assert.ok(accepted.unlockedLivestock.includes('horse'));
  assert.equal(stable.livestock.species, 'horse');
  assert.equal(stable.livestock.headcount, CONFIG.defectors.horseCount);
  assert.equal(accepted.residents.length, populationBefore + CONFIG.defectors.horseGroupSize);
  assert.ok(accepted.residents.slice(populationBefore).every(resident => resident.origin === HOLAON));
}

// origin이 없는 구버전 저장은 그대로 읽고, 정상 문자열은 보존하며 잘못된 값은 제거한다.
{
  const state = simulation.newGame(2026071708);
  state.residents[0].origin = NIMACHA;
  state.residents[1].origin = 7;
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  assert.equal(loaded.residents[0].origin, NIMACHA);
  assert.equal(loaded.residents[1].origin, undefined);
  assert.ok(loaded.residents.slice(2).every(resident => resident.origin === undefined));
}

console.log('defector resident tests passed');
