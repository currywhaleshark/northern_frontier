import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-tactical-hunt-tests-'));
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

const store = new Map();
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
  removeItem: key => store.delete(key),
};

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const agents = await import(pathToFileURL(join(compiledDir, 'agents.mjs')).href);
const expedition = await import(pathToFileURL(join(compiledDir, 'expedition.mjs')).href);
const engagement = await import(pathToFileURL(join(compiledDir, 'expeditionEngagement.mjs')).href);
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const weapons = await import(pathToFileURL(join(compiledDir, 'weapons.mjs')).href);
const intel = await import(pathToFileURL(join(compiledDir, 'expeditionIntel.mjs')).href);
const specialEvents = await import(pathToFileURL(join(compiledDir, 'specialEvents.mjs')).href);
const config = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);
const tacticalHunt = await import(pathToFileURL(join(compiledDir, 'tacticalHunt.mjs')).href);

{
  const hunt = config.CONFIG.tacticalBattle.hunt;
  assert.equal(hunt.maxEngagements, 5);
  assert.equal(hunt.baitMeatCost, 3);
  assert.deepEqual(hunt.ambush.tigerHitChance, { base: 0.68, min: 0.46, max: 0.92 });
  assert.deepEqual(hunt.ambush.wolfHitChance, {
    base: 0.31, packThreshold: 3, perExtraBeast: 0.035, min: 0.28, max: 0.64,
  });
  assert.deepEqual(hunt.ambush.spearWallMultiplier, { tiger: 0.38, wolf: 0.55 });
  assert.equal(hunt.ambush.splitDriversHitMultiplier, 1.35);
  assert.deepEqual(hunt.encirclement, {
    baseGain: 7,
    perDriver: 1.8,
    hunterSkillMultiplier: 12,
    wolfBaseMultiplier: 1.16,
    wolfPackThreshold: 3,
    wolfPenaltyPerExtraBeast: 0.038,
    wolfMinMultiplier: 0.82,
    wolfMaxMultiplier: 1.16,
    splitDriversMultiplier: 1.42,
    fallbackMultiplier: 0.55,
    movedDriveMultiplier: 0.5,
    minimumGain: 2,
  });
  assert.deepEqual(hunt.rehideChance, { tiger: 0.46, greatTiger: 0.38, mountainLord: 0.30 });
  assert.equal(hunt.rehideEncirclementMax, 70);
  assert.equal(tacticalHunt.huntMaxRounds(), hunt.maxEngagements);
}

function targets(state) {
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
  for (const target of targets(state)) {
    const error = expedition.createExpedition(state, { ...input, targetX: target.x, targetY: target.y });
    if (error == null) return;
    assert.equal(state.expedition, null);
  }
  assert.fail('no reachable expedition target found');
}

function reachEngagement(state) {
  for (let i = 0; i < 300 && state.expedition?.phase !== 'engage'; i++) expedition.expeditionTick(state);
  assert.equal(state.expedition?.phase, 'engage');
}

function prepareHunt(seed, kind, threatProfile = {}) {
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
  members.forEach((resident, index) => {
    resident.job = jobs[index];
    if (resident.job === 'hunter') resident.skills.hunter = 0.65;
  });
  outsider.job = 'militia';
  state.resources.muskets = 1;
  state.resources.hornBows = 1;
  state.resources.spears = 1;
  state.resources.gunpowder = 20;
  state.resources.meat = Math.max(20, state.resources.meat);
  weapons.clearWeaponAssignments(state);
  assert.equal(weapons.setResidentWeapon(state, members[0].id, 'musket'), null);
  assert.equal(weapons.setResidentWeapon(state, members[1].id, 'hornBow'), null);
  assert.equal(weapons.setResidentWeapon(state, members[2].id, 'spear'), null);
  state.incidents.predatorThreats[kind] = { kind, untilDay: state.day + 12, ...threatProfile };
  createReachableExpedition(state, {
    kind: 'predatorHunt', predatorKind: kind, memberIds: members.map(member => member.id),
  });
  reachEngagement(state);
  engagement.maybeOpenExpeditionEngagementChoice(state);
  assert.equal(state.pendingChoice?.options.find(option => option.id === 'direct')?.disabled, false);
  engagement.resolveExpeditionEngagementChoice(state, 'direct', () => 0);
  assert.ok(state.tacticalBattle);
  return { state, battle: state.tacticalBattle, members, outsider };
}

function prepareUniformHunterGroup(seed, count, weapon = null) {
  const state = simulation.newGame(seed);
  for (const resident of state.residents) {
    resident.job = 'idle';
    resident.sick = false;
    resident.health = 100;
    resident.quarantinedUntil = 0;
  }
  const members = state.residents.slice(0, count);
  members.forEach(resident => { resident.job = weapon ? 'militia' : 'hunter'; });
  state.resources.muskets = weapon === 'musket' ? count : 0;
  state.resources.hornBows = weapon === 'hornBow' ? count : 0;
  state.resources.spears = weapon === 'spear' ? count : 0;
  state.resources.gunpowder = 20;
  weapons.clearWeaponAssignments(state);
  if (weapon) members.forEach(resident => assert.equal(weapons.setResidentWeapon(state, resident.id, weapon), null));
  state.incidents.predatorThreats.wolf = { kind: 'wolf', untilDay: state.day + 12, size: 6, strength: 52 };
  createReachableExpedition(state, {
    kind: 'predatorHunt', predatorKind: 'wolf', memberIds: members.map(member => member.id),
  });
  reachEngagement(state);
  engagement.maybeOpenExpeditionEngagementChoice(state);
  engagement.resolveExpeditionEngagementChoice(state, 'direct', () => 0);
  assert.ok(state.tacticalBattle);
  return { state, battle: state.tacticalBattle, members };
}

function enterDeployment(state) {
  assert.equal(tactical.advanceTacticalPhase(state), null);
  if (state.tacticalBattle.phase === 'preparationExecution') assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(state.tacticalBattle.phase, 'deployment');
}

function prepareSplitSectorHunt(seed, spreadAcrossSectors) {
  const prepared = prepareUniformHunterGroup(seed, 3);
  enterDeployment(prepared.state);
  const original = prepared.battle.defenderGroups[0];
  assert.equal(tacticalHunt.splitHuntGroup(prepared.state, original.id, 1), null);
  assert.equal(tacticalHunt.splitHuntGroup(prepared.state, original.id, 1), null);
  const groups = [...prepared.battle.defenderGroups].sort((left, right) => left.id.localeCompare(right.id));
  if (spreadAcrossSectors) {
    ['huntSectorRidge', 'huntSectorRavine', 'huntSectorBrook'].forEach((sectorId, index) => {
      assert.equal(tactical.assignDefenderGroup(prepared.state, groups[index].id, sectorId), null);
    });
  }
  assert.equal(tactical.advanceTacticalPhase(prepared.state), null);
  groups.forEach(group => assert.equal(tactical.setTacticalCommand(prepared.state, group.id, 'advance'), null));
  return { ...prepared, groups };
}

{
  const state = simulation.newGame(2026071394);
  const tiers = [
    { tier: 'tiger', label: '호랑이', strength: 60, hide: 4, meat: 12 },
    { tier: 'greatTiger', label: '대호', strength: 75, hide: 6, meat: 18 },
    { tier: 'mountainLord', label: '산군', strength: 96, hide: 9, meat: 28 },
  ];
  let previousDanger = 0;
  for (const expected of tiers) {
    state.resources.meat = 0;
    state.resources.hide = 0;
    state.resources.reputation = 0;
    state.incidents.predatorThreats.tiger = {
      kind: 'tiger', untilDay: state.day + 12, size: 1,
      strength: expected.strength, tigerTier: expected.tier,
    };
    const profile = intel.predatorThreatProfile(state, 'tiger');
    assert.equal(profile.tigerTier, expected.tier);
    assert.equal(intel.tigerTierLabel(profile.tigerTier), expected.label);
    const danger = intel.tigerTierDangerMultiplier(profile.tigerTier);
    assert.ok(danger > previousDanger);
    previousDanger = danger;
    const reward = specialEvents.applyWildlifeHuntOutcome(state, 'tiger', 'victory', () => 0);
    assert.deepEqual(reward.loot, { meat: expected.meat, hide: expected.hide });
  }

  state.incidents.predatorThreats.wolf = { kind: 'wolf', untilDay: state.day + 12, size: 3, strength: 40 };
  const smallPackReward = specialEvents.applyWildlifeHuntOutcome(state, 'wolf', 'victory', () => 0).loot;
  state.incidents.predatorThreats.wolf = { kind: 'wolf', untilDay: state.day + 12, size: 12, strength: 80 };
  const largePackReward = specialEvents.applyWildlifeHuntOutcome(state, 'wolf', 'victory', () => 0).loot;
  assert.ok(largePackReward.meat > smallPackReward.meat);
  assert.ok(largePackReward.hide > smallPackReward.hide);
}

function enterCommand(state) {
  assert.equal(tactical.advanceTacticalPhase(state), null);
  if (state.tacticalBattle.phase === 'preparationExecution') assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(state.tacticalBattle.phase, 'deployment');
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(state.tacticalBattle.phase, 'command');
}

function finishBattle(state) {
  assert.equal(tactical.completeTacticalSimulation(state), null);
  assert.equal(tactical.acknowledgeTacticalReport(state), null);
  assert.equal(state.tacticalBattle.phase, 'finished');
  tactical.finishTacticalBattle(state);
  assert.equal(state.tacticalBattleReport?.encounterKind, 'predatorHunt');
  assert.equal(state.tacticalBattleReport?.title, '사냥 장계');
  assert.ok(state.tacticalBattleReport?.resourceDelta);
  assert.equal(state.expedition?.phase, 'return');
}

{
  const { state, battle, members } = prepareHunt(2026071395, 'wolf');
  assert.equal(battle.assaultKind, 'predatorHunt');
  assert.equal(battle.huntPredatorKind, 'wolf');
  assert.equal(battle.huntPredatorState, 'hidden');
  assert.deepEqual(battle.zones.map(zone => zone.id), [
    'huntSectorRidge', 'huntSectorRavine', 'huntSectorBrook', 'huntDen',
  ]);
  assert.deepEqual(battle.zones.slice(0, 3).map(zone => zone.order), [0, 0, 0]);
  assert.ok(battle.raiderGroups.every(group => group.zoneId === 'huntDen'));
  assert.equal(battle.raiderGroups.filter(group => group.leader).length, 1);
  const wolfCount = battle.raiderGroups.reduce((sum, group) => sum + group.count, 0);
  assert.ok(wolfCount >= 3 && wolfCount <= 12);
  const memberIds = new Set(members.map(member => member.id));
  assert.ok(battle.defenderGroups.flatMap(group => group.residentIds).every(id => memberIds.has(id)));
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  assert.equal(loaded?.tacticalBattle?.assaultKind, 'predatorHunt');
  assert.equal(loaded?.tacticalBattle?.huntPredatorKind, 'wolf');

  const meatBefore = state.resources.meat;
  assert.equal(tactical.spendPreparationAction(state, 'setHuntTraps'), null);
  assert.equal(tactical.spendPreparationAction(state, 'placeBait'), null);
  assert.match(tactical.spendPreparationAction(state, 'splitDrivers'), /사용할 수 없|준비/);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(battle.phase, 'deployment');
  assert.equal(battle.huntTrapSet, false);
  assert.equal(battle.huntBaitPlaced, false);
  assert.equal(battle.huntPredatorState, 'hidden');
  assert.equal(state.resources.meat, meatBefore, 'reserved bait is not consumed before its sector is chosen');
  assert.match(tacticalHunt.huntDeploymentUnavailableReason(state), /미끼|함정/);
  assert.match(tacticalHunt.setHuntPreparationZone(state, 'placeBait', 'huntDen'), /심처/);
  assert.equal(tacticalHunt.setHuntPreparationZone(state, 'placeBait', 'huntSectorRidge'), null);
  assert.equal(state.resources.meat, meatBefore - 3);
  assert.equal(tacticalHunt.setHuntPreparationZone(state, 'placeBait', 'huntSectorRidge'), null);
  assert.equal(state.resources.meat, meatBefore - 3, 'confirming the same bait sector never spends meat twice');
  assert.equal(tacticalHunt.setHuntPreparationZone(state, 'setHuntTraps', 'huntSectorRavine'), null);
  assert.equal(battle.huntBaitZoneId, 'huntSectorRidge');
  assert.equal(battle.huntTrapZoneId, 'huntSectorRavine');
  assert.equal(battle.huntBaitPlaced, true);
  assert.equal(battle.huntTrapSet, true);
  assert.equal(battle.huntPredatorState, 'hidden', 'placing bait does not reveal every hidden beast at deployment');
  assert.equal(tacticalHunt.huntDeploymentUnavailableReason(state), null);
  battle.prepActions.push({ id: 'splitDrivers', label: 'legacy split', cost: 2, selected: true, applied: false });
  battle.huntDriversSplit = true;
  assert.equal(saveLoad.saveGame(state), true);
  const placed = saveLoad.loadGame();
  assert.equal(placed?.tacticalBattle?.huntBaitZoneId, 'huntSectorRidge');
  assert.equal(placed?.tacticalBattle?.huntTrapZoneId, 'huntSectorRavine');
  assert.equal(placed?.tacticalBattle?.prepActions.some(action => action.id === 'splitDrivers'), false);
  assert.equal(placed?.tacticalBattle?.huntDriversSplit, false);
}

{
  const { state, battle, members } = prepareUniformHunterGroup(2026071512, 3);
  assert.equal(battle.defenderGroups.length, 1, 'same-role hunters begin as one tactical group');
  const original = battle.defenderGroups[0];
  assert.equal(original.count, 3);
  assert.equal(original.huntOriginGroupId, original.id);
  assert.equal(battle.huntDetachmentSerial, 0);
  const originalPower = original.power;
  const originalIds = [...original.residentIds].sort((a, b) => a - b);
  enterDeployment(state);

  assert.equal(tacticalHunt.splitHuntGroup(state, original.id, 1), null);
  assert.equal(tacticalHunt.splitHuntGroup(state, original.id, 1), null);
  assert.equal(battle.defenderGroups.length, 3);
  assert.equal(battle.huntDetachmentSerial, 2);
  assert.deepEqual(battle.defenderGroups.map(group => group.count).sort(), [1, 1, 1]);
  assert.deepEqual(
    battle.defenderGroups.flatMap(group => group.residentIds).sort((a, b) => a - b),
    originalIds,
    'splitting neither duplicates nor loses expedition residents',
  );
  assert.equal(new Set(battle.defenderGroups.flatMap(group => group.residentIds)).size, members.length);
  assert.ok(Math.abs(battle.defenderGroups.reduce((sum, group) => sum + group.power, 0) - originalPower) < 1e-9);
  assert.ok(battle.defenderGroups.every(group => group.huntOriginGroupId === original.id));
  assert.deepEqual(battle.defenderGroups.map(group => group.label).sort(), [
    `${original.label.replace(/ [A-Z]조$/, '')} A조`,
    `${original.label.replace(/ [A-Z]조$/, '')} B조`,
    `${original.label.replace(/ [A-Z]조$/, '')} C조`,
  ]);
  const splitGroups = [...battle.defenderGroups].sort((left, right) => left.id.localeCompare(right.id));
  for (const [index, sectorId] of ['huntSectorRidge', 'huntSectorRavine', 'huntSectorBrook'].entries()) {
    assert.equal(tactical.assignDefenderGroup(state, splitGroups[index].id, sectorId), null);
  }
  assert.deepEqual(new Set(battle.defenderGroups.map(group => group.zoneId)), new Set([
    'huntSectorRidge', 'huntSectorRavine', 'huntSectorBrook',
  ]));
  assert.match(tactical.assignDefenderGroup(state, original.id, 'huntDen'), /심처/);

  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  assert.equal(loaded?.tacticalBattle?.huntDetachmentSerial, 2);
  assert.deepEqual(
    loaded?.tacticalBattle?.defenderGroups.map(group => group.huntOriginGroupId),
    battle.defenderGroups.map(group => group.huntOriginGroupId),
  );

  const source = battle.defenderGroups.find(group => group.id !== original.id);
  assert.ok(source);
  assert.equal(tactical.assignDefenderGroup(state, source.id, original.zoneId), null);
  assert.equal(tacticalHunt.mergeHuntGroups(state, original.id, source.id), null);
  assert.equal(battle.defenderGroups.length, 2);
  assert.equal(battle.defenderGroups.reduce((sum, group) => sum + group.count, 0), 3);
  assert.ok(Math.abs(battle.defenderGroups.reduce((sum, group) => sum + group.power, 0) - originalPower) < 1e-9);

  const unrelated = battle.defenderGroups.find(group => group.id !== original.id);
  assert.ok(unrelated);
  unrelated.huntOriginGroupId = 'different-origin';
  assert.match(tacticalHunt.mergeHuntGroups(state, original.id, unrelated.id), /같은 원래 조/);
  unrelated.huntOriginGroupId = original.id;

  battle.assaultKind = 'banditLair';
  assert.match(tacticalHunt.splitHuntGroup(state, original.id, 1), /맹수 사냥/);
  battle.assaultKind = 'predatorHunt';
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.match(tacticalHunt.splitHuntGroup(state, original.id, 1), /배치 단계/);
}

{
  const stationary = prepareUniformHunterGroup(2026071515, 3);
  const moving = prepareUniformHunterGroup(2026071515, 3);
  enterDeployment(stationary.state);
  enterDeployment(moving.state);
  assert.equal(tactical.advanceTacticalPhase(stationary.state), null);
  assert.equal(tactical.advanceTacticalPhase(moving.state), null);
  const stationaryGroup = stationary.battle.defenderGroups[0];
  const movingGroup = moving.battle.defenderGroups[0];
  assert.equal(tactical.setTacticalCommand(stationary.state, stationaryGroup.id, 'advance'), null);
  assert.equal(tactical.setTacticalCommand(moving.state, movingGroup.id, 'advance'), null);
  assert.equal(tactical.assignDefenderGroup(stationary.state, stationaryGroup.id, 'huntSectorRidge'), null);
  assert.equal(stationaryGroup.huntMovedRound, undefined, 'reselecting the same sector is not movement');
  assert.equal(tactical.assignDefenderGroup(moving.state, movingGroup.id, 'huntSectorRavine'), null);
  assert.equal(movingGroup.huntMovedRound, moving.battle.round);
  assert.equal(tactical.resolveTacticalRound(stationary.state), null);
  assert.equal(tactical.resolveTacticalRound(moving.state), null);
  assert.ok((moving.battle.huntEncirclement ?? 0) < (stationary.battle.huntEncirclement ?? 0),
    'a group moved during command contributes only half drive power that round');
  assert.equal(tactical.completeTacticalSimulation(moving.state), null);
  assert.equal(tactical.acknowledgeTacticalReport(moving.state), null);
  assert.equal(movingGroup.zoneId, 'huntSectorRavine', 'round acknowledgement does not regroup every hunter');
}

{
  const covered = prepareSplitSectorHunt(2026071517, true);
  const open = prepareSplitSectorHunt(2026071517, false);
  assert.equal(tactical.resolveTacticalRound(covered.state), null);
  assert.equal(tactical.resolveTacticalRound(open.state), null);
  const coveredSectors = covered.battle.zones.filter(zone => zone.id !== 'huntDen');
  const openSectors = open.battle.zones.filter(zone => zone.id !== 'huntDen');
  assert.ok(coveredSectors.every(zone => (zone.sectorBlockade ?? 0) > 0));
  assert.deepEqual(openSectors.map(zone => (zone.sectorBlockade ?? 0) > 0), [true, false, false]);
  assert.ok((covered.battle.huntEncirclement ?? 0) > (open.battle.huntEncirclement ?? 0),
    'empty sectors attenuate the total encirclement gain');
  assert.ok(openSectors.some(zone => zone.pressure !== open.battle.huntEncirclement),
    'sector pressure is no longer overwritten with one global encirclement value');
  assert.deepEqual(open.battle.huntOpenSectorRounds, {
    huntSectorRidge: 0,
    huntSectorRavine: 1,
    huntSectorBrook: 1,
  });

  assert.equal(tactical.completeTacticalSimulation(open.state), null);
  assert.equal(tactical.acknowledgeTacticalReport(open.state), null);
  const moved = open.groups[1];
  assert.equal(tactical.assignDefenderGroup(open.state, moved.id, 'huntSectorRavine'), null);
  open.battle.huntEncirclement = 0;
  assert.equal(tactical.resolveTacticalRound(open.state), null);
  assert.equal(open.battle.huntOpenSectorRounds.huntSectorRavine, 0, 'restored blockade resets its hole counter');
  assert.equal(open.battle.huntOpenSectorRounds.huntSectorBrook, 2);
}

{
  const escaping = prepareSplitSectorHunt(2026071518, false);
  escaping.battle.huntEncirclement = 45;
  escaping.battle.huntOpenSectorRounds = {
    huntSectorRidge: 0,
    huntSectorRavine: 1,
    huntSectorBrook: 1,
  };
  const sectorsConfig = config.CONFIG.tacticalBattle.hunt.sectors;
  const originalChance = sectorsConfig.openEscapeChance;
  sectorsConfig.openEscapeChance = 1;
  assert.equal(tactical.resolveTacticalRound(escaping.state), null);
  sectorsConfig.openEscapeChance = originalChance;
  assert.equal(escaping.battle.pendingReport.outcome, 'huntEscaped');
  assert.ok(escaping.battle.pendingReport.events.some(event =>
    event.kind === 'retreat' && /빠져나/.test(event.text ?? '')),
  'a sector left open for two rounds becomes a deterministic escape route');
}

{
  const { state, battle } = prepareHunt(2026071519, 'tiger');
  enterCommand(state);
  const hunter = battle.defenderGroups.find(group => group.role === 'hunter');
  const spear = battle.defenderGroups.find(group => group.weapon === 'spear');
  const ranged = battle.defenderGroups.find(group => group.weapon === 'musket');
  assert.ok(hunter && spear && ranged);
  assert.equal(hunter.command, 'ambush', 'hunters default to counter-wait while the beast is hidden');
  assert.equal(spear.command, 'advance');
  assert.equal(ranged.command, 'advance');
  assert.equal(tactical.setTacticalCommand(state, ranged.id, 'ambush'), null,
    'counter-wait is available to every living combat group');
  assert.match(tactical.setTacticalCommand(state, ranged.id, 'fallback'), /사용할 수 없|사냥/);
  ranged.commandSource = 'recommended';
  battle.huntPredatorState = 'revealed';
  tacticalHunt.chooseDefaultHuntCommands(battle);
  assert.equal(hunter.command, 'ambush');
  assert.equal(spear.command, 'hold');
  assert.equal(ranged.command, 'volley');
}

{
  const { state, battle } = prepareUniformHunterGroup(2026071520, 6, 'spear');
  enterCommand(state);
  const healthBefore = battle.defenderGroups.map(group => [group.id, group.wounded, group.killed]);
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(battle.pendingReport.outcome, undefined);
  assert.equal(battle.pendingReport.events.some(event => event.kind === 'beastAmbush'), false);
  assert.ok(battle.pendingReport.events.some(event => /산이 조용/.test(event.text ?? '')));
  assert.equal(battle.huntPredatorState, 'hidden');
  assert.deepEqual(battle.defenderGroups.map(group => [group.id, group.wounded, group.killed]), healthBefore,
    'lurk causes no automatic beast attack');
}

{
  const { state, battle } = prepareUniformHunterGroup(2026071525, 3);
  enterCommand(state);
  const aiConfig = config.CONFIG.tacticalBattle.hunt.beastAI;
  const searchConfig = config.CONFIG.tacticalBattle.hunt.search;
  const originalAmbushChance = aiConfig.ambushDecisionChance;
  const originalSearchMin = searchConfig.minChance;
  const originalSearchMax = searchConfig.maxChance;
  aiConfig.ambushDecisionChance = 0;
  searchConfig.minChance = 1;
  searchConfig.maxChance = 1;
  assert.equal(tactical.resolveTacticalRound(state), null);
  aiConfig.ambushDecisionChance = originalAmbushChance;
  searchConfig.minChance = originalSearchMin;
  searchConfig.maxChance = originalSearchMax;
  assert.equal(battle.huntLastBeastAction?.kind, 'lurk');
  assert.equal(battle.pendingReport.events.some(event => event.kind === 'beastAmbush'), false);
  assert.ok(battle.pendingReport.events.some(event => event.kind === 'beastReveal' && /수색/.test(event.text ?? '')));
  assert.equal(battle.huntPredatorState, 'revealed', 'hunter search can expose a lurking beast without granting it an attack');
}

{
  const { state, battle } = prepareHunt(2026071521, 'tiger');
  enterCommand(state);
  const weak = battle.defenderGroups.find(group => group.weapon === 'hornBow');
  assert.ok(weak);
  battle.defenderGroups.forEach(group => { group.power = group.id === weak.id ? 0.1 : 100; });
  const aiConfig = config.CONFIG.tacticalBattle.hunt.beastAI;
  const originalChance = aiConfig.ambushDecisionChance;
  aiConfig.ambushDecisionChance = 1;
  assert.equal(tactical.resolveTacticalRound(state), null);
  aiConfig.ambushDecisionChance = originalChance;
  const ambush = battle.pendingReport.events.find(event => event.kind === 'beastAmbush');
  assert.equal(ambush?.groupId, weak.id, 'the tiger attacks the lowest-exposure group, not a random group');
  assert.equal(ambush?.zoneId, weak.zoneId);
}

{
  const success = prepareSplitSectorHunt(2026071522, true);
  const failure = prepareSplitSectorHunt(2026071522, true);
  success.battle.huntEncirclement = 72;
  failure.battle.huntEncirclement = 72;
  success.groups.forEach(group => { group.power = 1; });
  failure.groups.forEach(group => { group.power = 1; });
  const breakout = config.CONFIG.tacticalBattle.hunt.breakout;
  const originalChance = breakout.baseSuccessChance;
  breakout.baseSuccessChance = 1;
  assert.equal(tactical.resolveTacticalRound(success.state), null);
  breakout.baseSuccessChance = 0;
  assert.equal(tactical.resolveTacticalRound(failure.state), null);
  breakout.baseSuccessChance = originalChance;
  assert.equal(success.battle.pendingReport.outcome, 'huntEscaped');
  assert.ok(success.battle.pendingReport.events.some(event => event.kind === 'retreat' && /돌파/.test(event.text ?? '')));
  assert.notEqual(failure.battle.pendingReport.outcome, 'huntEscaped');
  assert.equal(failure.battle.huntPredatorState, 'revealed');
  assert.ok(failure.battle.pendingReport.events.some(event => event.kind === 'advance' && /돌파/.test(event.text ?? '')));
}

{
  const cornered = prepareSplitSectorHunt(2026071523, true);
  cornered.battle.huntEncirclement = 100;
  assert.equal(tactical.resolveTacticalRound(cornered.state), null);
  assert.equal(cornered.battle.huntCornered, true);
  assert.equal(cornered.battle.currentZoneId, 'huntDen');
  assert.ok(cornered.battle.defenderGroups.every(group => group.zoneId === 'huntDen'));
  assert.ok(cornered.battle.pendingReport.events.some(event => event.zoneId === 'huntDen' && /결착/.test(event.text ?? '')));
}

{
  const trapped = prepareHunt(2026071524, 'wolf');
  assert.equal(tactical.spendPreparationAction(trapped.state, 'setHuntTraps'), null);
  assert.equal(tactical.advanceTacticalPhase(trapped.state), null);
  assert.equal(tacticalHunt.setHuntPreparationZone(trapped.state, 'setHuntTraps', 'huntSectorBrook'), null);
  assert.equal(tactical.advanceTacticalPhase(trapped.state), null);
  trapped.battle.huntEncirclement = 72;
  const breakout = config.CONFIG.tacticalBattle.hunt.breakout;
  const originalChance = breakout.baseSuccessChance;
  breakout.baseSuccessChance = 1;
  assert.equal(tactical.resolveTacticalRound(trapped.state), null);
  breakout.baseSuccessChance = originalChance;
  assert.notEqual(trapped.battle.pendingReport.outcome, 'huntEscaped',
    'a prepared trap automatically stops the first breakout through its sector');
  assert.equal(trapped.battle.huntTrapSet, false);
  assert.ok(trapped.battle.pendingReport.events.some(event =>
    event.zoneId === 'huntSectorBrook' && /함정/.test(event.text ?? '')));
}

{
  const { state, battle } = prepareUniformHunterGroup(2026071513, 3, 'musket');
  const group = battle.defenderGroups[0];
  assert.equal(group.readyMuskets, 3);
  enterDeployment(state);
  assert.equal(tacticalHunt.splitHuntGroup(state, group.id, 1), null);
  assert.equal(tacticalHunt.splitHuntGroup(state, group.id, 1), null);
  assert.equal(battle.defenderGroups.reduce((sum, candidate) => sum + (candidate.readyMuskets ?? 0), 0), 3,
    'musket readiness is reallocated without changing its total');
}

{
  const { state, battle } = prepareUniformHunterGroup(2026071514, 2);
  const group = battle.defenderGroups[0];
  enterDeployment(state);
  assert.equal(tacticalHunt.splitHuntGroup(state, group.id, 1), null);
  assert.equal(battle.defenderGroups.length, 2);
  assert.match(tacticalHunt.splitHuntGroup(state, group.id, 1), /최소 2명/);
}

{
  const { state, battle } = prepareHunt(2026071396, 'tiger', {
    size: 1, strength: 96, tigerTier: 'mountainLord',
  });
  assert.equal(battle.huntTigerTier, 'mountainLord');
  assert.equal(battle.factionName, '호랑이', 'unknown intel does not reveal the exact tiger tier');
  assert.equal(battle.raiderGroups[0].label, '산군');
  assert.equal(battle.raiderGroups[0].tigerTier, 'mountainLord');
  enterCommand(state);
  const spear = battle.defenderGroups.find(group => group.kind === 'militia-spear');
  assert.ok(spear);
  assert.match(tactical.setTacticalCommand(state, spear.id, 'charge'), /위치를 먼저/);
  assert.equal(tactical.setTacticalCommand(state, spear.id, 'hold'), null);
  assert.equal(tactical.resolveTacticalRound(state), null);
  const ambush = battle.pendingReport.events.find(event => event.kind === 'beastAmbush');
  assert.ok(ambush?.groupId, 'a tiger ambush targets one specific group');
  assert.ok(battle.pendingReport.events.some(event =>
    event.kind === 'melee' && (event.meleeParticipants ?? 0) > 0),
  'revealed predator engagements expose their melee participant count');
  assert.ok(battle.pendingReport.events
    .filter(event => event.kind === 'casualty' && event.side === 'defender')
    .every(event => event.groupId === ambush.groupId));
}

{
  const { state, battle } = prepareHunt(2026071397, 'wolf');
  enterCommand(state);
  battle.huntPredatorState = 'revealed';
  battle.raiderGroups.forEach(group => { group.revealed = true; });
  const leader = battle.raiderGroups.find(group => group.leader);
  const pack = battle.raiderGroups.find(group => !group.leader);
  const hunter = battle.defenderGroups.find(group => group.kind === 'hunter');
  assert.ok(leader && pack && hunter);
  leader.power = 0.01;
  pack.power = 10000;
  assert.equal(tactical.setTacticalCommand(state, hunter.id, 'ambush'), null);
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(battle.pendingReport.outcome, 'huntRepelled');
  assert.ok(battle.pendingReport.events.some(event => event.kind === 'beastRout'));
  finishBattle(state);
  assert.equal(state.incidents.predatorThreats.wolf, undefined);
  assert.equal(state.expedition?.phase, 'return');
  assert.ok((state.expedition?.carriedLoot?.meat ?? 0) > 0);
}

{
  const { state, battle, outsider } = prepareHunt(2026071398, 'tiger');
  const outsiderHealth = outsider.health;
  enterCommand(state);
  battle.huntPredatorState = 'revealed';
  battle.huntEncirclement = 100;
  battle.raiderGroups.forEach(group => { group.revealed = true; group.power = 0.01; });
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(battle.pendingReport.outcome, 'huntKill');
  finishBattle(state);
  assert.equal(state.incidents.predatorThreats.tiger, undefined);
  assert.ok(state.discoveredSpecialItems.includes('tigerPelt'));
  assert.equal(outsider.health, outsiderHealth);
}

{
  const { state, battle } = prepareHunt(2026071399, 'wolf');
  enterCommand(state);
  battle.huntEngagements = 4;
  battle.defenderGroups.forEach(group => { group.power = 0.01; });
  battle.raiderGroups.forEach(group => { group.power = 10000; });
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(battle.pendingReport.outcome, 'huntEscaped');
  finishBattle(state);
  assert.ok(state.incidents.predatorThreats.wolf, 'an escaped pack remains a threat');
  assert.deepEqual(state.expedition?.carriedLoot, {});
  assert.equal(state.tacticalBattleReport?.predatorOutcome, 'escaped');
  assert.equal(state.tacticalBattleReport?.outcomeLabel, '맹수 도주');
}

{
  const { state, battle } = prepareHunt(2026071408, 'tiger');
  enterCommand(state);
  battle.defenderGroups.forEach(group => { group.wounded = group.count; });
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(battle.pendingReport.outcome, 'huntDefeat');
  finishBattle(state);
  assert.equal(state.tacticalBattleReport?.predatorOutcome, 'huntersDefeated');
  assert.equal(state.tacticalBattleReport?.outcomeLabel, '사냥대 패퇴');
}

{
  const { state, battle } = prepareHunt(2026071409, 'wolf');
  enterCommand(state);
  const group = battle.defenderGroups[0];
  assert.equal(tactical.setTacticalCommand(state, group.id, 'openRetreat'), null);
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(battle.pendingReport.outcome, 'huntEscaped');
  finishBattle(state);
  assert.equal(state.tacticalBattleReport?.predatorOutcome, 'withdrawn');
  assert.match(state.tacticalBattleReport?.outcomeLabel ?? '', /철수|중지/);
}

for (const [kind, seed] of [['tiger', 2026071404], ['wolf', 2026071405]]) {
  const { state, battle, members } = prepareHunt(seed, kind);
  const veteran = members[0];
  veteran.health = 70;
  battle.reports = [{
    round: 1, focusZoneId: 'huntTracks', nextFocusZoneId: 'huntTracks', summary: 'escaped',
    lines: [], events: [], wounded: 0, killed: 0, raidersKilled: 0, loot: {}, buildingsDamaged: 0,
    villageMoraleDelta: 0, raiderMoraleDelta: 0, ended: true, outcome: 'huntEscaped',
  }];
  battle.phase = 'finished';
  tactical.finishTacticalBattle(state);
  assert.equal(state.tacticalBattleReport?.wounded.some(person => person.residentId === veteran.id), false,
    `an already-wounded but unharmed ${kind} hunter is not reported as newly wounded`);
}

console.log('tactical hunt tests passed');
