import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-game-tests-'));
  const files = readdirSync(srcDir).filter(file => file.endsWith('.ts'));
  for (const file of files) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) => {
      if (/\.[cm]?js$/.test(spec)) return `${start}${spec}${end}`;
      return `${start}${spec}.mjs${end}`;
    });
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

function addBuiltOffice(state) {
  state.buildings.push({
    id: 9000 + state.buildings.length,
    type: 'office',
    x: 1,
    y: 1,
    progress: 99,
    built: true,
    fieldGrowth: 0,
  });
}

function appointScholar(seed) {
  const state = simulation.newGame(seed);
  addBuiltOffice(state);
  state.rank = 'bu';
  assert.equal(specialResidents.maybeOfferExiledScholar(state, () => 0), true);
  specialResidents.resolveSpecialResidentChoice(state, 'appoint', () => 0.25);
  return state;
}

function pngSize(path) {
  const data = readFileSync(path);
  assert.equal(data.toString('ascii', 1, 4), 'PNG', `${path} is a PNG`);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const specialResidents = await import(pathToFileURL(join(compiledDir, 'specialResidents.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const combatCapabilities = await import(pathToFileURL(join(compiledDir, 'combatCapabilities.mjs')).href);
const combatRoster = await import(pathToFileURL(join(compiledDir, 'combatRoster.mjs')).href);
const relations = await import(pathToFileURL(join(compiledDir, 'relations.mjs')).href);
const diplomaticFigures = await import(pathToFileURL(join(compiledDir, 'diplomaticFigures.mjs')).href);
const suspicion = await import(pathToFileURL(join(compiledDir, 'suspicion.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

{
  const roster = specialResidents.SPECIAL_RESIDENT_ROSTER;
  assert.deepEqual(roster.map(resident => resident.id), [
    'tutorialAdvisor',
    'mudang', 'nosung', 'exiledScholar', 'jurchenWarrior',
    'tigerHunter', 'geomancer', 'uinyeo', 'runawaySmith', 'interpreter', 'hangwae',
  ]);
  assert.ok(roster.every(resident => resident.illustration.src.startsWith('/assets/events/special-')));

  // 종교인도 후계자가 물려받지 못하는 네임드 고유 특기를 명시한다.
  for (const definition of roster) {
    const skills = specialResidents.specialResidentSkills(definition.id);
    assert.ok(skills.length >= 1, `${definition.id} defines passive skills`);
    assert.ok(skills.every(skill => skill.id && skill.icon && skill.name && skill.effect));
  }
  assert.ok(specialResidents.specialResidentSkills('mudang').some(skill => skill.id === 'greatGut'));
  assert.ok(specialResidents.specialResidentSkills('nosung').some(skill => skill.id === 'cheondojae'));
  assert.ok(
    specialResidents.specialResidentSkills('jurchenWarrior').some(skill => skill.id === 'shadowAmbush'),
    'jurchenWarrior ambush is surfaced as a passive skill',
  );
}

{
  const state = simulation.newGame(2026080601);
  assert.equal(specialResidents.openTutorialAdvisorJoinChoice(state), true);
  assert.equal(state.pendingChoice?.kind, 'specialResident');
  assert.equal(
    specialResidents.specialResidentDefinition('tutorialAdvisor').badge,
    'yeoni',
    'Yeoni uses her dedicated special-resident badge',
  );
  assert.deepEqual(state.pendingChoice?.data, {
    special: 'tutorialAdvisor', phase: 'tutorialJoin',
  });
  assert.equal(
    state.pendingChoice?.illustration?.src,
    '/assets/events/special-tutorial-advisor-yeoni-v1.png',
  );
  assert.equal(
    state.pendingChoice?.dialogue?.portrait?.src,
    '/assets/portraits/tutorial-advisor-yeoni-v2.png',
  );
  assert.deepEqual(state.pendingChoice?.options.map(option => option.id), ['accept']);
  assert.ok(state.spentSpecialIds.includes('tutorialAdvisor'), 'the tutorial reward is game-once when offered');

  specialResidents.resolveSpecialResidentChoice(state, 'accept', () => 0.25);
  const yeoni = state.residents.find(resident => resident.special === 'tutorialAdvisor');
  assert.ok(yeoni?.alive, 'Yeoni joins as a living resident');
  assert.equal(yeoni.name, '산골 길잡이 연이');
  assert.equal(yeoni.gender, 'female');
  assert.equal(yeoni.age, CONFIG.specialResidents.tutorialAdvisorAge);
  assert.equal(yeoni.job, 'woodcutter');
  assert.equal(state.specialResidentRecords.tutorialAdvisor.status, 'active');
  assert.equal(specialResidents.openTutorialAdvisorJoinChoice(state), false, 'Yeoni cannot be offered twice');

  const defenseRoster = combatRoster.createCombatRoster(state, {
    context: 'villageDefense', includeCivilians: true,
  });
  assert.equal(
    defenseRoster.combatants.some(combatant => combatant.residentId === yeoni.id),
    false,
    'the woodcutter advisor never becomes a combatant',
  );
  assert.ok(defenseRoster.civilians.includes(yeoni.id), 'Yeoni remains a protected civilian');

  const stored = new Map();
  globalThis.localStorage = {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => { stored.set(key, String(value)); },
    removeItem: key => { stored.delete(key); },
    clear: () => { stored.clear(); },
    key: index => [...stored.keys()][index] ?? null,
    get length() { return stored.size; },
  };
  state.specialResidentRecords.tutorialAdvisor.fatefulEscapeUsed = true;
  assert.equal(saveLoad.saveGame(state, 9), true);
  const loaded = saveLoad.loadGame(9);
  const loadedYeoni = loaded?.residents.find(resident => resident.special === 'tutorialAdvisor');
  assert.ok(loadedYeoni?.alive, 'Yeoni survives a save/load round trip');
  assert.equal(loaded?.specialResidentRecords?.tutorialAdvisor?.residentId, loadedYeoni.id);
  assert.equal(loaded?.specialResidentRecords?.tutorialAdvisor?.fatefulEscapeUsed, true);
  assert.ok(loaded?.spentSpecialIds?.includes('tutorialAdvisor'));
}

{
  const state = simulation.newGame(2026071801);
  addBuiltOffice(state);
  state.rank = 'bu';

  assert.equal(specialResidents.maybeOfferExiledScholar(state, () => 0), true);
  assert.equal(state.pendingChoice.kind, 'specialResident');
  assert.equal(state.pendingChoice.data.special, 'exiledScholar');
  assert.equal(state.pendingChoice.illustration.src, '/assets/events/special-exiled-scholar-yun-v1.png');
  assert.ok(state.spentSpecialIds.includes('exiledScholar'), 'arrival is game-once as soon as it is offered');

  specialResidents.resolveSpecialResidentChoice(state, 'appoint', () => 0.25);
  const scholar = state.residents.find(resident => resident.special === 'exiledScholar');
  assert.ok(scholar?.alive, 'appointed scholar joins as a living resident');
  assert.equal(scholar.name, '귀양 선비 윤문겸');
  assert.equal(scholar.job, 'clerk');
  assert.equal(state.specialResidentRecords.exiledScholar.status, 'active');

  simulation.setResidentJob(state, scholar.id, 'farmer');
  assert.equal(scholar.job, 'clerk', 'individual reassignment cannot change a special resident job');
  assert.equal(simulation.reassignJob(state, 'clerk', 'farmer'), false);
  assert.equal(scholar.job, 'clerk', 'job-count reassignment cannot consume a special resident');

  assert.equal(
    buildings.officeEfficiencyMultiplier(state),
    1 + CONFIG.production.officeBonusPerClerk + CONFIG.specialResidents.exiledScholarOfficeBonus,
  );
  const factor = suspicion.suspicionBreakdown(state).find(candidate => candidate.id === 'exiledScholar');
  assert.equal(
    factor?.delta,
    CONFIG.specialResidents.exiledScholarSuspicionPerDay *
      diplomaticFigures.borderCommanderEffects(state).suspicionRiseMultiplier,
    "the scholar risk receives the active border commander's suspicion multiplier",
  );
}

{
  const state = simulation.newGame(2026071802);
  addBuiltOffice(state);
  state.rank = 'bu';
  state.day = 10;
  assert.equal(specialResidents.maybeOfferExiledScholar(state, () => 0), true);
  specialResidents.resolveSpecialResidentChoice(state, 'confine', () => 0.4);
  assert.deepEqual(state.specialResidentRecords.exiledScholar, {
    status: 'confined',
    availableUntilDay: 10 + CONFIG.specialResidents.exiledScholarConfinedDays,
  });
  assert.equal(specialResidents.appointConfinedSpecialResident(state, 'exiledScholar'), null);
  assert.ok(state.residents.some(resident => resident.alive && resident.special === 'exiledScholar'));
}

{
  const state = simulation.newGame(2026071803);
  addBuiltOffice(state);
  state.rank = 'bu';
  assert.equal(specialResidents.maybeOfferExiledScholar(state, () => 0), true);
  specialResidents.resolveSpecialResidentChoice(state, 'confine', () => 0.4);
  state.day = state.specialResidentRecords.exiledScholar.availableUntilDay + 1;
  specialResidents.dailySpecialResidentTick(state, () => 0.25);
  assert.equal(state.specialResidentRecords.exiledScholar.status, 'departed');
  assert.equal(specialResidents.appointConfinedSpecialResident(state, 'exiledScholar'), '지금 등용할 수 있는 인물이 아닙니다.');
}

{
  const state = appointScholar(2026071804);
  state.suspicion = CONFIG.specialResidents.exiledScholarCourtDemandSuspicion;
  assert.equal(specialResidents.maybeOpenExiledScholarFollowup(state, () => 0), true);
  assert.equal(state.pendingChoice.data.phase, 'courtDemand');
  specialResidents.resolveSpecialResidentChoice(state, 'hide', () => 0.3);
  assert.equal(
    state.suspicion,
    CONFIG.specialResidents.exiledScholarCourtDemandSuspicion
      + CONFIG.specialResidents.exiledScholarHideSuspicionRise,
  );
  assert.ok(state.residents.some(resident => resident.alive && resident.special === 'exiledScholar'));
  assert.equal(specialResidents.maybeOpenExiledScholarFollowup(state, () => 0), false, 'court demand occurs once');
}

{
  const state = appointScholar(2026071805);
  state.suspicion = CONFIG.specialResidents.exiledScholarCourtDemandSuspicion;
  assert.equal(specialResidents.maybeOpenExiledScholarFollowup(state, () => 0), true);
  specialResidents.resolveSpecialResidentChoice(state, 'surrender', () => 0.3);
  assert.equal(state.specialResidentRecords.exiledScholar.status, 'departed');
  assert.equal(state.residents.some(resident => resident.special === 'exiledScholar'), false);
  assert.equal(
    state.suspicion,
    CONFIG.specialResidents.exiledScholarCourtDemandSuspicion
      - CONFIG.specialResidents.exiledScholarSurrenderSuspicionRelief,
  );
}

{
  const state = appointScholar(2026071806);
  const joinedDay = state.specialResidentRecords.exiledScholar.joinedDay;
  state.day = joinedDay + CONFIG.specialResidents.exiledScholarPardonServiceDays;
  state.suspicion = 10;
  const reputationBefore = state.resources.reputation;
  assert.equal(specialResidents.maybeOpenExiledScholarFollowup(state, () => 0), true);
  assert.equal(state.pendingChoice.data.phase, 'pardon');
  specialResidents.resolveSpecialResidentChoice(state, 'return', () => 0.3);
  assert.equal(state.specialResidentRecords.exiledScholar.status, 'departed');
  assert.equal(
    state.resources.reputation,
    reputationBefore + CONFIG.specialResidents.exiledScholarPardonReputation,
  );
  assert.equal(state.suspicion, 0);
}

{
  const state = appointScholar(2026071807);
  const scholar = state.residents.find(resident => resident.special === 'exiledScholar');
  scholar.alive = false;
  specialResidents.dailySpecialResidentTick(state, () => 1);
  assert.equal(state.specialResidentRecords.exiledScholar.status, 'dead');
  specialResidents.dailySpecialResidentTick(state, () => 1);
  assert.equal(
    state.log.filter(entry => entry.text.includes('그 인연과 재주는 다시 돌아오지 않습니다')).length,
    1,
    'special resident death log is emitted once',
  );
}

{
  const state = simulation.newGame(2026071808);
  state.rank = 'jin';
  state.relations['오도리 씨족'] = 70;
  assert.equal(specialResidents.maybeOfferJurchenWarrior(state, () => 0), true);
  assert.equal(state.pendingChoice.data.originFaction, '오도리 씨족');
  assert.equal(state.pendingChoice.illustration.src, '/assets/events/special-jurchen-warrior-aragae-v1.png');
  specialResidents.resolveSpecialResidentChoice(state, 'accept', () => 0.2);

  const warrior = state.residents.find(resident => resident.special === 'jurchenWarrior');
  assert.ok(warrior?.alive);
  assert.equal(warrior.job, 'militia');
  assert.equal(warrior.origin, '오도리 씨족');
  assert.equal(state.relations['오도리 씨족'], 70 - CONFIG.specialResidents.jurchenWarriorRecruitRelationLoss);

  const snapshot = combatRoster.createCombatRoster(state, { context: 'villageDefense' })
    .combatants.find(combatant => combatant.residentId === warrior.id);
  assert.equal(snapshot.special, 'jurchenWarrior');
  assert.equal(snapshot.assignedWeapon, 'spear', 'Aragae carries his own spear without consuming stock');
  assert.equal(
    snapshot.basePower,
    combatCapabilities.combatBasePower('militia', warrior.origin)
      + CONFIG.specialResidents.jurchenWarriorBasePowerBonus,
  );
  assert.ok(snapshot.capabilities.includes('ambush'));
  assert.ok(snapshot.capabilities.includes('charge'));

  const relationBefore = state.relations['오도리 씨족'];
  relations.changeRelation(state, '오도리 씨족', 10);
  assert.equal(
    state.relations['오도리 씨족'],
    relationBefore + 10 * CONFIG.specialResidents.jurchenWarriorRelationGainMult,
  );
  const factor = suspicion.suspicionBreakdown(state).find(candidate => candidate.id === 'jurchenWarrior');
  assert.equal(
    factor?.delta,
    CONFIG.specialResidents.jurchenWarriorSuspicionPerDay *
      diplomaticFigures.borderCommanderEffects(state).suspicionRiseMultiplier,
    'the warrior risk receives the active border commander\'s suspicion multiplier',
  );
}

{
  const state = simulation.newGame(2026071809);
  state.rank = 'jin';
  state.relations['오도리 씨족'] = 70;
  specialResidents.maybeOfferJurchenWarrior(state, () => 0);
  specialResidents.resolveSpecialResidentChoice(state, 'accept', () => 0.2);
  state.specialResidentRecords.jurchenWarrior.nextDemandDay = state.day;
  const relationBefore = state.relations['오도리 씨족'];
  const threatBefore = state.threat;
  assert.equal(specialResidents.maybeOpenJurchenWarriorFollowup(state, () => 0), true);
  assert.equal(state.pendingChoice.data.phase, 'warriorDemand');
  specialResidents.resolveSpecialResidentChoice(state, 'refuse', () => 0.3);
  assert.equal(
    state.relations['오도리 씨족'],
    relationBefore - CONFIG.specialResidents.jurchenWarriorRefuseRelationLoss,
  );
  assert.equal(state.threat, threatBefore + CONFIG.specialResidents.jurchenWarriorRefuseThreatRise);
}

{
  const state = simulation.newGame(2026071810);
  state.rank = 'jin';
  state.relations['오도리 씨족'] = 70;
  specialResidents.maybeOfferJurchenWarrior(state, () => 0);
  specialResidents.resolveSpecialResidentChoice(state, 'accept', () => 0.2);
  state.specialResidentRecords.jurchenWarrior.nextDemandDay = state.day;
  assert.equal(specialResidents.maybeOpenJurchenWarriorFollowup(state, () => 0), true);
  specialResidents.resolveSpecialResidentChoice(state, 'surrender', () => 0.3);
  assert.equal(state.specialResidentRecords.jurchenWarrior.status, 'departed');
  assert.equal(state.residents.some(resident => resident.special === 'jurchenWarrior'), false);
}

{
  const state = simulation.newGame(2026071811);
  state.rank = 'jin';
  state.relations['오도리 씨족'] = 70;
  specialResidents.maybeOfferJurchenWarrior(state, () => 0);
  specialResidents.resolveSpecialResidentChoice(state, 'accept', () => 0.2);
  state.relations['오도리 씨족'] = CONFIG.specialResidents.jurchenWarriorDesertRelationBelow;
  state.specialResidentRecords.jurchenWarrior.nextDemandDay = state.day + 100;
  assert.equal(specialResidents.maybeOpenJurchenWarriorFollowup(state, () => 0), true);
  assert.equal(state.specialResidentRecords.jurchenWarrior.status, 'departed');
}

{
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const sheet = pngSize(join(root, 'public/assets/special-residents-v2.png'));
  assert.deepEqual(sheet, { width: 28 * 10, height: 40 });
  for (const definition of specialResidents.SPECIAL_RESIDENT_ROSTER) {
    const art = pngSize(join(root, 'public', definition.illustration.src));
    assert.ok(Math.abs(art.width / art.height - 3) < 0.01, `${definition.id} event art remains 3:1`);
  }
}

// ── 신규 특수 주민 6인 — 도착·패시브·부담 사건 ──

const ALL_SPECIAL_IDS = [
  'mudang', 'nosung', 'exiledScholar', 'jurchenWarrior',
  'tigerHunter', 'geomancer', 'uinyeo', 'runawaySmith', 'interpreter', 'hangwae',
];

function addBuilt(state, type) {
  state.buildings.push({
    id: 9100 + state.buildings.length,
    type, x: 2, y: 2, progress: 99, built: true, fieldGrowth: 0,
  });
}

// 대상 한 명만 제안될 수 있게 나머지를 소진 처리하고 일일 틱을 돌린다
function offerOnly(state, id) {
  state.spentSpecialIds = ALL_SPECIAL_IDS.filter(candidate => candidate !== id);
  specialResidents.dailySpecialResidentTick(state, () => 0);
  return state.pendingChoice;
}

function recruitViaArrival(state, id) {
  const choice = offerOnly(state, id);
  assert.equal(choice?.kind, 'specialResident', `${id} arrival offered`);
  assert.equal(choice.data.special, id);
  specialResidents.resolveSpecialResidentChoice(state, 'accept', () => 0.25);
  const resident = state.residents.find(candidate => candidate.special === id);
  assert.ok(resident?.alive, `${id} joined alive`);
  assert.equal(state.specialResidentRecords[id].status, 'active');
  return resident;
}

{
  // 착호 포수 박돌개 — 도착, 기본 전력, 정찰 단축, 착호 징발
  const state = simulation.newGame(2026071820);
  state.rank = 'bo';
  if (state.habitats.length === 0) state.habitats.push({ id: 991, x: 5, y: 5, radius: 3, active: true });
  for (const habitat of state.habitats) habitat.active = true;
  const hunter = recruitViaArrival(state, 'tigerHunter');
  assert.equal(hunter.job, 'hunter');
  assert.equal(
    combatCapabilities.combatBasePower('hunter', undefined, 'tigerHunter'),
    CONFIG.tacticalBattle.groupPower.hunter + CONFIG.specialResidents.tigerHunterBasePowerBonus,
  );
  const { predatorScoutDuration } = await import(pathToFileURL(join(compiledDir, 'expeditionIntel.mjs')).href);
  assert.equal(
    predatorScoutDuration(0, false, true),
    predatorScoutDuration(0, false, false) - CONFIG.specialResidents.tigerHunterScoutDaysReduction,
  );

  state.specialResidentRecords.tigerHunter.nextDemandDay = state.day;
  const reputationBefore = state.resources.reputation;
  const healthBefore = hunter.health;
  assert.equal(specialResidents.maybeOpenTigerHunterFollowup(state, () => 0), true);
  assert.equal(state.pendingChoice.data.phase, 'tigerLevy');
  specialResidents.resolveSpecialResidentChoice(state, 'comply', () => 0.3);
  assert.equal(state.resources.reputation, reputationBefore + CONFIG.specialResidents.tigerHunterLevyReputation);
  assert.ok(hunter.health < healthBefore, 'levy wounds the old hunter');
}

{
  // 맹인 지관 허생 — 도착(광산 필요), 채광꾼 고정
  const state = simulation.newGame(2026071821);
  state.rank = 'bo';
  assert.equal(offerOnly(state, 'geomancer'), null, 'no mine — no offer');
  addBuilt(state, 'mine');
  const miner = recruitViaArrival(state, 'geomancer');
  assert.equal(miner.job, 'miner');
}

{
  // 의녀 단심 — 도착(의원 필요), 의심 요인, 누명 벗김 후속
  const state = simulation.newGame(2026071822);
  state.rank = 'jin';
  addBuilt(state, 'clinic');
  const physician = recruitViaArrival(state, 'uinyeo');
  assert.equal(physician.job, 'physician');
  assert.ok(suspicion.suspicionBreakdown(state).some(factor => factor.id === 'uinyeo'));

  state.day += CONFIG.specialResidents.uinyeoExonerationServiceDays + 1;
  assert.equal(specialResidents.maybeOpenUinyeoFollowup(state, () => 0), true);
  assert.equal(state.pendingChoice.data.phase, 'exoneration');
  const reputationBefore = state.resources.reputation;
  specialResidents.resolveSpecialResidentChoice(state, 'return', () => 0.3);
  assert.equal(state.specialResidentRecords.uinyeo.status, 'departed');
  assert.equal(state.resources.reputation, reputationBefore + CONFIG.specialResidents.uinyeoExonerationReputation);
}

{
  // 도망 야장 막쇠 — 도착(대장간 필요), 추노 몸값 지불
  const state = simulation.newGame(2026071823);
  state.rank = 'jin';
  addBuilt(state, 'smithy');
  const smith = recruitViaArrival(state, 'runawaySmith');
  assert.equal(smith.job, 'smith');

  state.specialResidentRecords.runawaySmith.nextDemandDay = state.day;
  state.resources.silver = CONFIG.specialResidents.runawaySmithRansomSilver + 5;
  assert.equal(specialResidents.maybeOpenRunawaySmithFollowup(state, () => 0), true);
  const payOption = state.pendingChoice.options.find(option => option.id === 'pay');
  assert.ok(payOption && !payOption.disabled, 'ransom affordable — pay enabled');
  specialResidents.resolveSpecialResidentChoice(state, 'pay', () => 0.3);
  assert.equal(state.resources.silver, 5);
  assert.equal(state.specialResidentRecords.runawaySmith.status, 'active', 'smith stays after ransom');
}

{
  // 퇴역 역관 배수겸 — 도착(여진 우호 필요), 관계 상승 가속
  const state = simulation.newGame(2026071824);
  state.rank = 'bu';
  const faction = '오도리 씨족';
  state.relations[faction] = CONFIG.specialResidents.interpreterMinRelation;
  const clerk = recruitViaArrival(state, 'interpreter');
  assert.equal(clerk.job, 'clerk');

  state.relations[faction] = 50;
  relations.changeRelation(state, faction, 10);
  assert.ok(
    Math.abs(state.relations[faction] - (50 + 10 * CONFIG.specialResidents.interpreterRelationGainMult)) < 1e-9,
    'jurchen relation gains are amplified',
  );
}

{
  // 항왜 사야카 — 도착(조총 필요), 조총 전력·화약 절감·개인 조총
  const state = simulation.newGame(2026071825);
  state.rank = 'bu';
  state.resources.muskets = 2;
  const militia = recruitViaArrival(state, 'hangwae');
  assert.equal(militia.job, 'militia');
  assert.ok(suspicion.suspicionBreakdown(state).some(factor => factor.id === 'hangwae'));

  const weapons = await import(pathToFileURL(join(compiledDir, 'weapons.mjs')).href);
  assert.ok(
    Math.abs(weapons.effectivePowderPerShooter(state, 10) - 10 * CONFIG.specialResidents.hangwaePowderMult) < 1e-9,
    'powder cost is reduced while hangwae lives',
  );
  assert.equal(
    combatCapabilities.combatWeaponTotalPower('militia', 'musket', undefined, 'hangwae'),
    Math.max(
      combatCapabilities.combatBasePower('militia', undefined, 'hangwae'),
      CONFIG.raid.musketDefense,
    ) + CONFIG.specialResidents.hangwaeMusketPowerBonus,
  );
  state.resources.gunpowder = 100;
  const roster = combatRoster.createCombatRoster(state, { context: 'villageDefense' });
  const snapshot = roster.combatants.find(candidate => candidate.residentId === militia.id);
  assert.equal(snapshot?.assignedWeapon, 'musket', 'hangwae carries his own musket by default');

  state.specialResidentRecords.hangwae.nextDemandDay = state.day;
  assert.equal(specialResidents.maybeOpenHangwaeFollowup(state, () => 0), true);
  const suspicionBefore = state.suspicion;
  specialResidents.resolveSpecialResidentChoice(state, 'hide', () => 0.3);
  assert.equal(state.suspicion, Math.min(100, suspicionBefore + CONFIG.specialResidents.hangwaeRefuseSuspicionRise));
  assert.equal(state.specialResidentRecords.hangwae.status, 'active');
}

console.log('special resident tests passed');
