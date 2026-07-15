import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const assaultSource = readFileSync(new URL('../../src/game/tacticalAssault.ts', import.meta.url), 'utf8');

const store = new Map();
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
  removeItem: key => store.delete(key),
};

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-tactical-assault-tests-'));
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
const agents = await import(pathToFileURL(join(compiledDir, 'agents.mjs')).href);
const expedition = await import(pathToFileURL(join(compiledDir, 'expedition.mjs')).href);
const engagement = await import(pathToFileURL(join(compiledDir, 'expeditionEngagement.mjs')).href);
const battleSimulation = await import(pathToFileURL(join(compiledDir, 'battleSimulation.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const siteDiplomacy = await import(pathToFileURL(join(compiledDir, 'siteDiplomacy.mjs')).href);
const enemyPlan = await import(pathToFileURL(join(compiledDir, 'enemyPlan.mjs')).href);
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const weapons = await import(pathToFileURL(join(compiledDir, 'weapons.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function prepareState(seed, scouted = true, configureLair = undefined) {
  const state = simulation.newGame(seed);
  for (const resident of state.residents) {
    resident.job = 'idle';
    resident.sick = false;
    resident.health = 100;
    resident.quarantinedUntil = 0;
  }
  const members = state.residents.slice(0, 6);
  const outsider = state.residents[6];
  const jobs = ['militia', 'militia', 'militia', 'watchman', 'hunter', 'hunter'];
  members.forEach((resident, index) => { resident.job = jobs[index]; });
  outsider.job = 'militia';
  state.resources.muskets = 1;
  state.resources.hornBows = 1;
  state.resources.spears = 1;
  state.resources.gunpowder = 20;
  weapons.clearWeaponAssignments(state);
  assert.equal(weapons.setResidentWeapon(state, members[0].id, 'musket'), null);
  assert.equal(weapons.setResidentWeapon(state, members[1].id, 'hornBow'), null);
  assert.equal(weapons.setResidentWeapon(state, members[2].id, 'spear'), null);

  const lair = state.foreignSites.find(site => site.type === 'banditLair');
  assert.ok(lair);
  lair.discovered = true;
  lair.status = 'active';
  lair.militaryPower = 45;
  lair.alarm = 20;
  lair.scoutedUntilDay = scouted ? state.day + 2 : 0;
  configureLair?.(lair);
  createReachableExpedition(state, {
    kind: 'lairAssault', targetSiteId: lair.id, memberIds: members.map(member => member.id),
  });
  reachEngagement(state);
  engagement.maybeOpenExpeditionEngagementChoice(state);
  assert.equal(state.pendingChoice?.options.find(option => option.id === 'direct')?.disabled, false);
  assert.equal(engagement.resolveExpeditionEngagementChoice(state, 'direct', () => 0), undefined);
  assert.ok(state.tacticalBattle);
  return { state, battle: state.tacticalBattle, lair, members, outsider };
}

function expeditionTargets(state) {
  const center = state.buildings.find(building => building.type === 'center' && building.built);
  assert.ok(center);
  return state.map.flat()
    .filter(tile => agents.isTerrainPassable(state, tile.x, tile.y) &&
      Math.abs(tile.x - center.x) + Math.abs(tile.y - center.y) >= 6)
    .sort((a, b) =>
      Math.abs(a.x - center.x) + Math.abs(a.y - center.y) -
      (Math.abs(b.x - center.x) + Math.abs(b.y - center.y)));
}

function createReachableExpedition(state, input) {
  for (const target of expeditionTargets(state)) {
    const error = expedition.createExpedition(state, { ...input, targetX: target.x, targetY: target.y });
    if (error == null) return;
    assert.equal(state.expedition, null);
  }
  assert.fail('no reachable expedition target found');
}

function reachEngagement(state, limit = 300) {
  for (let i = 0; i < limit && state.expedition?.phase !== 'engage'; i++) expedition.expeditionTick(state);
  assert.equal(state.expedition?.phase, 'engage');
}

function enterCommandPhase(state) {
  assert.equal(tactical.advanceTacticalPhase(state), null);
  if (state.tacticalBattle.phase === 'preparationExecution') {
    assert.equal(tactical.advanceTacticalPhase(state), null);
  }
  assert.equal(state.tacticalBattle.phase, 'deployment');
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(state.tacticalBattle.phase, 'command');
}

function finishPendingBattle(state) {
  assert.equal(tactical.completeTacticalSimulation(state), null);
  assert.equal(tactical.acknowledgeTacticalReport(state), null);
  assert.equal(state.tacticalBattle.phase, 'finished');
  tactical.finishTacticalBattle(state);
  assert.equal(state.tacticalBattleReport?.encounterKind, 'banditLair');
  assert.equal(state.tacticalBattleReport?.title, '토벌 장계');
  assert.ok(state.tacticalBattleReport?.resourceDelta);
  assert.equal(state.expedition?.phase, 'return');
}

{
  const { state, battle, members } = prepareState(2026071391, true);
  assert.equal(battle.orientation, 'assault');
  assert.equal(battle.assaultKind, 'banditLair');
  assert.equal(state.pendingChoice, null);
  assert.deepEqual(battle.zones.map(zone => zone.id), ['lairTrail', 'lairWall', 'lairYard', 'lairKeep']);
  assert.ok(battle.raiderGroups.filter(group => group.zoneId === 'lairTrail').length >= 2,
    'the trail contains sentries and a separate ambush shooting group');
  assert.ok(battle.raiderGroups.filter(group => group.zoneId === 'lairWall').length >= 2,
    'the palisade contains separate spear and archer groups');
  assert.ok(battle.raiderGroups.filter(group => group.zoneId === 'lairYard').length >= 2,
    'the yard contains separate vanguard and skirmisher groups');
  assert.ok(battle.raiderGroups.filter(group => group.zoneId === 'lairKeep').length >= 2,
    'the keep contains multiple defensive groups');
  assert.ok(battle.raiderGroups.every(group => group.revealed), 'scouting reveals all lair defenders');
  assert.equal(battle.prepPoints, 6);
  const memberIds = new Set(members.map(member => member.id));
  assert.ok(battle.defenderGroups.flatMap(group => group.residentIds).every(id => memberIds.has(id)));
  assert.equal(battle.defenderGroups.find(group => group.kind === 'militia-musket')?.line, 'middle');
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  assert.equal(loaded?.tacticalBattle?.orientation, 'assault');
  assert.equal(loaded?.tacticalBattle?.assaultKind, 'banditLair');
  assert.equal(loaded?.tacticalBattle?.assaultTargetSiteId, battle.assaultTargetSiteId);
  assert.deepEqual(loaded?.tacticalBattle?.lairDefensePlan, battle.lairDefensePlan);

  const sentries = battle.raiderGroups.find(group => group.zoneId === 'lairTrail');
  const hunter = battle.defenderGroups.find(group => group.kind === 'hunter');
  assert.ok(sentries && hunter);
  const sentryPower = sentries.power;
  const hunterPower = hunter.power;
  assert.equal(tactical.spendPreparationAction(state, 'prepareFireArrows'), null);
  assert.equal(tactical.spendPreparationAction(state, 'blockLeaderEscape'), null);
  assert.equal(tactical.spendPreparationAction(state, 'lureGuards'), null);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(battle.phase, 'preparationExecution');
  assert.equal(battle.leaderEscapeBlocked, true);
  assert.ok(sentries.power < sentryPower);
  assert.ok(hunter.power < hunterPower);
  assert.equal(battle.preparationEvents.length, 3);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.match(tactical.assignDefenderGroup(state, hunter.id, 'lairWall'), /돌파하지 못한/);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.match(tactical.setTacticalCommand(state, hunter.id, 'arson'), /목책이나 두목 움막/);
  assert.equal(tactical.setTacticalCommand(state, hunter.id, 'blockEscape'), null);
  const melee = battle.defenderGroups.find(group => group.kind === 'militia-spear');
  assert.ok(melee);
  assert.match(tactical.setTacticalCommand(state, melee.id, 'volley'), /원거리 부대/);
  battle.currentZoneId = 'lairWall';
  battle.defenderGroups.forEach(group => { group.zoneId = 'lairWall'; });
  assert.equal(tactical.setTacticalCommand(state, hunter.id, 'arson'), null);
  assert.equal(tactical.setTacticalCommand(state, melee.id, 'charge'), null);
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.ok(battle.pendingReport.events.some(event => event.kind === 'fire' && event.zoneId === 'lairWall'));
  assert.ok(battle.pendingReport.events.some(event =>
    event.kind === 'melee' && (event.meleeParticipants ?? 0) >= melee.count));
  assert.equal(battle.assaultFireDamage, 1);
}

{
  const { state, battle, lair, outsider } = prepareState(2026071392, true);
  const outsiderHealth = outsider.health;
  const grainBefore = state.resources.grain;
  const hideBefore = state.resources.hide;
  const toolsBefore = state.resources.tools;
  enterCommandPhase(state);
  battle.leaderEscapeBlocked = true;
  battle.raiderMorale = 0;
  battle.zones.find(zone => zone.id === 'lairKeep').breached = true;
  battle.assaultFireDamage = 2;
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(battle.pendingReport.outcome, 'assaultVictory');
  assert.ok(battle.pendingReport.events.some(event => event.kind === 'escapeBlocked' && event.groupId === 'lair-leader'));
  finishPendingBattle(state);
  assert.equal(state.tacticalBattle, null);
  assert.equal(lair.status, 'burned');
  assert.equal(state.expedition?.phase, 'return');
  assert.deepEqual(state.expedition?.carriedLoot, { grain: 4, hide: 4, tools: 1 });
  assert.equal(state.resources.grain, grainBefore + 4);
  assert.equal(state.resources.hide, hideBefore + 4);
  assert.equal(state.resources.tools, toolsBefore + 1);
  assert.equal(outsider.health, outsiderHealth, 'only expedition members can take tactical casualties');
}

{
  const { state, battle, lair } = prepareState(2026071393, false);
  assert.equal(battle.raiderGroups.filter(group => group.revealed).length, 1, 'unscouted assault only reveals sentries');
  enterCommandPhase(state);
  const group = battle.defenderGroups[0];
  assert.equal(tactical.setTacticalCommand(state, group.id, 'openRetreat'), null);
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(battle.pendingReport.outcome, 'assaultWithdrawal');
  finishPendingBattle(state);
  assert.equal(lair.status, 'active');
  assert.equal(state.tacticalBattleReport?.siteOutcome, 'unchanged');
  assert.match(state.tacticalBattleReport?.outcomeLabel ?? '', /철수/);
  assert.equal(state.expedition?.phase, 'return');
}

assert.match(
  assaultSource,
  /resolveEngagementExchange\s*\(/,
  'directed lair assaults must resolve casualties through the shared tactical engagement exchange',
);

{
  const baselineInput = { alarm: 10, scoutFailures: 0, assaultDefeats: 0, militaryPower: 20 };
  const low = enemyPlan.banditLairStratagemPoints(baselineInput);
  const high = enemyPlan.banditLairStratagemPoints({
    alarm: 90, scoutFailures: 2, assaultDefeats: 2, militaryPower: 90,
  });
  assert.ok(high > low, 'alarm, scout failures, assault defeats, and remaining troops must raise lair stratagem points');
  for (const input of [
    { ...baselineInput, alarm: 40 },
    { ...baselineInput, scoutFailures: 1 },
    { ...baselineInput, assaultDefeats: 1 },
    { ...baselineInput, militaryPower: 45 },
  ]) {
    assert.ok(enemyPlan.banditLairStratagemPoints(input) > low,
      `each lair history input must independently raise stratagem points: ${JSON.stringify(input)}`);
  }
  const doctrineInput = { alarm: 50, scoutFailures: 0, assaultDefeats: 0, militaryPower: 50 };
  assert.deepEqual(new Set([0.05, 0.5, 0.95].map(roll =>
    enemyPlan.chooseBanditLairDoctrine(doctrineInput, roll))),
  new Set(['trailAttrition', 'wallHold', 'leaderEscape']), 'all three lair doctrines must be selectable');
}

{
  const state = simulation.newGame(2026071514);
  const lair = state.foreignSites.find(site => site.type === 'banditLair');
  assert.ok(lair);
  lair.status = 'active';
  enemyPlan.refreshBanditLairDoctrine(state, lair);
  assert.ok(lair.lairDoctrine);
  assert.equal(lair.lairDoctrineRevision, 0);
  assert.ok(lair.lairDoctrineNextReviewDay > state.day);

  const fixedDoctrine = lair.lairDoctrine;
  lair.lairDoctrineRevealed = true;
  lair.scoutedUntilDay = state.day + 100;
  lair.lairDoctrineNextReviewDay = state.day;
  enemyPlan.refreshBanditLairDoctrine(state, lair);
  assert.equal(lair.lairDoctrine, fixedDoctrine, 'valid scouting intel freezes the actual doctrine');
  assert.equal(lair.lairDoctrineRevision, 0);

  lair.scoutedUntilDay = state.day - 1;
  lair.lairDoctrineNextReviewDay = state.day;
  let changedState;
  for (let seed = 1; seed <= 200 && !changedState; seed += 1) {
    const candidate = structuredClone(state);
    candidate.seed = seed;
    const candidateLair = candidate.foreignSites.find(site => site.id === lair.id);
    enemyPlan.refreshBanditLairDoctrine(candidate, candidateLair);
    if (candidateLair.lairDoctrineRevision === 1) changedState = candidate;
  }
  assert.ok(changedState, 'an expired doctrine can deterministically change at review time');
  const changedLair = changedState.foreignSites.find(site => site.id === lair.id);
  assert.notEqual(changedLair.lairDoctrine, fixedDoctrine);
  assert.equal(changedLair.lairDoctrineRevealed, false, 'changed doctrine invalidates old revealed intel');
  const deterministicCopy = structuredClone(state);
  deterministicCopy.seed = changedState.seed;
  const deterministicLair = deterministicCopy.foreignSites.find(site => site.id === lair.id);
  enemyPlan.refreshBanditLairDoctrine(deterministicCopy, deterministicLair);
  assert.equal(deterministicLair.lairDoctrine, changedLair.lairDoctrine,
    'same seed and review state choose the same new doctrine');
  const revision = changedLair.lairDoctrineRevision;
  const reviewDay = changedLair.lairDoctrineNextReviewDay;
  enemyPlan.refreshBanditLairDoctrine(changedState, changedLair);
  assert.equal(changedLair.lairDoctrineRevision, revision, 'the same day is reviewed only once');
  assert.equal(changedLair.lairDoctrineNextReviewDay, reviewDay);

  const battleLockedState = structuredClone(state);
  battleLockedState.scoutedUntilDay = undefined;
  const battleLockedLair = battleLockedState.foreignSites.find(site => site.id === lair.id);
  battleLockedLair.scoutedUntilDay = state.day - 1;
  battleLockedLair.lairDoctrineNextReviewDay = state.day;
  battleLockedState.tacticalBattle = { assaultTargetSiteId: lair.id, encounterKind: 'banditLair' };
  enemyPlan.refreshBanditLairDoctrine(battleLockedState, battleLockedLair);
  assert.equal(battleLockedLair.lairDoctrine, fixedDoctrine,
    'an already-created lair battle locks its defense doctrine');
}

{
  const state = simulation.newGame(2026071411);
  for (const resident of state.residents) {
    resident.job = 'hunter';
    resident.sick = false;
    resident.health = 100;
    resident.quarantinedUntil = 0;
  }
  const lair = state.foreignSites.find(site => site.type === 'banditLair');
  assert.ok(lair);
  lair.discovered = true;
  lair.status = 'active';
  lair.alarm = 20;
  const initialChance = siteDiplomacy.banditLairScoutChance(state, lair.id);
  lair.lairScoutAttempts = 3;
  lair.alarm = 60;
  assert.ok(siteDiplomacy.banditLairScoutChance(state, lair.id) < initialChance,
    'repeated scouting and higher alarm must reduce scouting success chance');
  lair.lairScoutAttempts = 0;
  lair.alarm = 20;
  assert.equal(siteDiplomacy.scoutBanditLair(state, lair.id, () => 0), null);
  assert.equal(lair.lairDoctrineRevealed, true, 'successful scouting must reveal the current lair doctrine');
  assert.ok(['trailAttrition', 'wallHold', 'leaderEscape'].includes(lair.lairDoctrine));
}

{
  const state = simulation.newGame(2026071412);
  for (const resident of state.residents) {
    resident.job = 'hunter';
    resident.sick = false;
    resident.health = 100;
    resident.quarantinedUntil = 0;
  }
  const lair = state.foreignSites.find(site => site.type === 'banditLair');
  assert.ok(lair);
  lair.discovered = true;
  lair.status = 'active';
  lair.alarm = 0;
  assert.match(siteDiplomacy.scoutBanditLair(state, lair.id, () => 0.999), /발각/);
  const firstAlarmGain = lair.alarm;
  assert.match(siteDiplomacy.scoutBanditLair(state, lair.id, () => 0.999), /발각/);
  assert.ok(lair.alarm - firstAlarmGain > firstAlarmGain,
    'a repeated scouting failure must raise alarm more than the first failure');
  assert.equal(lair.lairScoutAttempts, 2);
  assert.equal(lair.lairScoutFailures, 2);
}

{
  const trail = prepareState(2026071413, true, lair => {
    lair.lairDoctrine = 'trailAttrition';
    lair.lairDoctrineRevealed = true;
  }).battle;
  assert.equal(trail.lairDefensePlan?.doctrine, 'trailAttrition');
  assert.ok(trail.zones.find(zone => zone.id === 'lairTrail').defenseBonus > 0,
    'trail attrition must reinforce the infiltration route');

  const wall = prepareState(2026071414, true, lair => {
    lair.lairDoctrine = 'wallHold';
    lair.lairDoctrineRevealed = true;
  }).battle;
  assert.equal(wall.lairDefensePlan?.doctrine, 'wallHold');
  assert.ok(wall.zones.find(zone => zone.id === 'lairWall').defenseBonus > 21,
    'wall hold must strengthen the palisade beyond the normal alarm bonus');
  assert.ok(wall.zones.find(zone => zone.id === 'lairYard').defenseBonus < 10,
    'wall hold must weaken the inner yard');

  const escape = prepareState(2026071415, true, lair => {
    lair.lairDoctrine = 'leaderEscape';
    lair.lairDoctrineRevealed = true;
  }).battle;
  assert.equal(escape.lairDefensePlan?.doctrine, 'leaderEscape');
  assert.ok((escape.lairLootPreRemoved ?? 0) > 0, 'leader escape doctrine must pre-remove some loot');

  const expiredIntel = prepareState(2026071416, false, lair => {
    lair.lairDoctrine = 'wallHold';
    lair.lairDoctrineRevealed = true;
  }).battle;
  assert.equal(expiredIntel.lairDefensePlan?.doctrineRevealed, false,
    'expired scoutedUntilDay intel must not keep revealing the lair doctrine in battle');

  const battles = [trail, wall, escape];
  const powerTotals = battles.map(battle => battle.raiderGroups.reduce((sum, group) => sum + group.power, 0));
  const countTotals = battles.map(battle => battle.raiderGroups.reduce((sum, group) => sum + group.count, 0));
  assert.ok(powerTotals.every(total => Math.abs(total - powerTotals[0]) < 1e-9),
    'doctrine redistribution preserves total lair combat power');
  assert.ok(countTotals.every(total => total === countTotals[0]),
    'largest-remainder doctrine redistribution preserves total lair headcount');
  assert.ok(trail.raiderGroups.find(group => group.id === 'lair-sentries').power >
    wall.raiderGroups.find(group => group.id === 'lair-sentries').power,
  'trail attrition shifts real power into the infiltration route');
  assert.ok(wall.raiderGroups.find(group => group.id === 'lair-wall-archers').power >
    trail.raiderGroups.find(group => group.id === 'lair-wall-archers').power,
  'wall hold shifts real power into the palisade archers');
  assert.ok(escape.raiderGroups.find(group => group.id === 'lair-leader').power >
    trail.raiderGroups.find(group => group.id === 'lair-leader').power,
  'leader escape shifts real power into the escape group');
}

{
  const { state, battle } = prepareState(2026071410, true);
  enterCommandPhase(state);
  battle.currentZoneId = 'lairWall';
  battle.defenderGroups.forEach(group => { group.zoneId = 'lairWall'; });
  const spear = battle.defenderGroups.find(group => group.weapon === 'spear');
  const musket = battle.defenderGroups.find(group => group.weapon === 'musket');
  const wallSpears = battle.raiderGroups.find(group => group.id === 'lair-wall-spears');
  const wallArchers = battle.raiderGroups.find(group => group.id === 'lair-wall-archers');
  assert.ok(spear && musket && wallSpears && wallArchers);
  assert.equal(tactical.setTacticalGroupTarget(state, spear.id, wallSpears.id), null);
  assert.equal(tactical.setTacticalGroupTarget(state, musket.id, wallArchers.id), null);
  assert.equal(spear.targetGroupId, wallSpears.id);
  assert.equal(musket.targetGroupId, wallArchers.id,
    'lair palisade melee and shooting defenders can be targeted independently');
}

{
  const { state, battle, lair } = prepareState(2026071407, true);
  enterCommandPhase(state);
  battle.defenderGroups.forEach(group => { group.wounded = group.count; });
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(battle.pendingReport.outcome, 'assaultDefeat');
  finishPendingBattle(state);
  assert.equal(lair.status, 'fortified');
  assert.equal(lair.lairAssaultDefeats, 1);
  assert.equal(state.tacticalBattleReport?.siteOutcome, 'fortified');
  assert.match(state.tacticalBattleReport?.outcomeLabel ?? '', /패퇴/);
}

{
  const { state, battle, lair } = prepareState(2026071394, true);
  enterCommandPhase(state);
  battle.zones.find(zone => zone.id === 'lairYard').breached = true;
  const group = battle.defenderGroups[0];
  assert.equal(tactical.setTacticalCommand(state, group.id, 'openRetreat'), null);
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(battle.pendingReport.outcome, 'assaultRaid');
  finishPendingBattle(state);
  assert.equal(lair.status, 'fortified');
  assert.deepEqual(state.expedition?.carriedLoot, { grain: 4, hide: 3, tools: 1 });
}

{
  const samples = 32;
  let expectedAutomaticWins = 0;
  let directWins = 0;
  let totalDirectRounds = 0;
  let totalDirectCasualties = 0;
  const roundsByZone = { lairTrail: 0, lairWall: 0, lairYard: 0, lairKeep: 0 };
  const doctrines = { trailAttrition: 0, wallHold: 0, leaderEscape: 0 };
  const doctrineWins = { trailAttrition: 0, wallHold: 0, leaderEscape: 0 };
  const outcomes = {};
  for (let index = 0; index < samples; index++) {
    const state = battleSimulation.createBattleSimulation({
      scenario: 'banditLair', mode: 'garrison', factionName: '변경 마적', power: 60,
      warned: true, siege: false, season: 'autumn', weather: 'clear', prepPoints: 'auto',
      seed: 2026071500 + index,
      defenders: {
        muskets: 1, bows: 1, spears: 1, unarmedMilitia: 0,
        watchmen: 1, hunters: 2, civilians: 0,
      },
      cannonEmplacements: 0,
    });
    const battle = state.tacticalBattle;
    const activeExpedition = state.expedition;
    assert.ok(battle && activeExpedition?.targetSiteId != null);
    const doctrine = battle.lairDefensePlan?.doctrine ?? 'wallHold';
    doctrines[doctrine]++;
    expectedAutomaticWins += siteDiplomacy.banditLairRaidChance(
      state, activeExpedition.targetSiteId, activeExpedition.memberIds,
    );
    assert.equal(tactical.spendPreparationAction(state, 'blockLeaderEscape'), null);
    enterCommandPhase(state);
    while (battle.phase === 'command') {
      assert.equal(tactical.resolveTacticalRound(state), null);
      if (battle.pendingReport?.ended) break;
      assert.equal(tactical.completeTacticalSimulation(state), null);
      assert.equal(tactical.acknowledgeTacticalReport(state), null);
    }
    totalDirectRounds += battle.reports.length;
    for (const report of battle.reports) roundsByZone[report.focusZoneId]++;
    totalDirectCasualties += battle.defenderGroups.reduce(
      (sum, group) => sum + group.wounded + group.killed, 0,
    );
    if (battle.pendingReport?.outcome === 'assaultVictory') {
      directWins++;
      doctrineWins[doctrine]++;
    }
    outcomes[battle.pendingReport?.outcome ?? 'none'] = (outcomes[battle.pendingReport?.outcome ?? 'none'] ?? 0) + 1;
  }
  const automaticRate = expectedAutomaticWins / samples;
  const directRate = directWins / samples;
  const averageRounds = totalDirectRounds / samples;
  const averageCasualties = totalDirectCasualties / samples;
  const doctrineWinRates = Object.fromEntries(Object.keys(doctrines).map(doctrine => [
    doctrine,
    doctrines[doctrine] > 0 ? doctrineWins[doctrine] / doctrines[doctrine] : null,
  ]));
  console.log('tactical assault balance', JSON.stringify({
    automaticRate,
    directRate,
    averageRounds,
    averageCasualties,
    roundsByZone,
    doctrines,
    doctrineWinRates,
    outcomes,
  }));
  assert.ok(
    Math.abs(automaticRate - directRate) <= 0.15,
    `direct assault win rate ${directRate.toFixed(3)} should stay within 0.15 of automatic ${automaticRate.toFixed(3)} ` +
      `(avg rounds ${(totalDirectRounds / samples).toFixed(2)}, casualties ${(totalDirectCasualties / samples).toFixed(2)}) ` +
      `zone rounds ${JSON.stringify(roundsByZone)}`,
  );
  const baseline = {
    directRate: 0.5625,
    averageRounds: 7,
    averageCasualties: 1.3125,
    roundsByZone: { lairTrail: 32, lairWall: 65, lairYard: 69, lairKeep: 58 },
  };
  const withinFifteenPercent = (actual, expected) =>
    Math.abs(actual - expected) <= Math.max(0.0001, Math.abs(expected) * 0.15);
  assert.ok(withinFifteenPercent(directRate, baseline.directRate),
    `direct win rate ${directRate.toFixed(4)} drifted over 15% from ${baseline.directRate}`);
  assert.ok(withinFifteenPercent(averageRounds, baseline.averageRounds),
    `average rounds ${averageRounds.toFixed(4)} drifted over 15% from ${baseline.averageRounds}`);
  assert.ok(withinFifteenPercent(averageCasualties, baseline.averageCasualties),
    `average casualties ${averageCasualties.toFixed(4)} drifted over 15% from ${baseline.averageCasualties}`);
  for (const [zoneId, baselineRounds] of Object.entries(baseline.roundsByZone)) {
    assert.ok(withinFifteenPercent(roundsByZone[zoneId], baselineRounds),
      `${zoneId} rounds ${roundsByZone[zoneId]} drifted over 15% from ${baselineRounds}`);
  }
}

{
  const { state, battle, members } = prepareState(2026071403, true);
  const veteran = members[0];
  veteran.health = 70;
  battle.reports = [{
    round: 1, focusZoneId: 'lairTrail', nextFocusZoneId: 'lairTrail', summary: 'withdrawal',
    lines: [], events: [], wounded: 0, killed: 0, raidersKilled: 0, loot: {}, buildingsDamaged: 0,
    villageMoraleDelta: 0, raiderMoraleDelta: 0, ended: true, outcome: 'assaultWithdrawal',
  }];
  battle.phase = 'finished';
  tactical.finishTacticalBattle(state);
  assert.equal(state.tacticalBattleReport?.wounded.some(person => person.residentId === veteran.id), false,
    'an already-wounded but unharmed assault member is not reported as newly wounded');
}

console.log('tactical assault tests passed');
