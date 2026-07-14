import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

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
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const weapons = await import(pathToFileURL(join(compiledDir, 'weapons.mjs')).href);

function prepareState(seed, scouted = true) {
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
  assert.ok(battle.raiderGroups.every(group => group.revealed), 'scouting reveals all lair defenders');
  assert.equal(battle.prepPoints, 6);
  const memberIds = new Set(members.map(member => member.id));
  assert.ok(battle.defenderGroups.flatMap(group => group.residentIds).every(id => memberIds.has(id)));
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  assert.equal(loaded?.tacticalBattle?.orientation, 'assault');
  assert.equal(loaded?.tacticalBattle?.assaultKind, 'banditLair');
  assert.equal(loaded?.tacticalBattle?.assaultTargetSiteId, battle.assaultTargetSiteId);

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
  assert.equal(state.expedition?.phase, 'return');
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
    if (battle.pendingReport?.outcome === 'assaultVictory') directWins++;
  }
  const automaticRate = expectedAutomaticWins / samples;
  const directRate = directWins / samples;
  assert.ok(
    Math.abs(automaticRate - directRate) <= 0.15,
    `direct assault win rate ${directRate.toFixed(3)} should stay within 0.15 of automatic ${automaticRate.toFixed(3)} ` +
      `(avg rounds ${(totalDirectRounds / samples).toFixed(2)}, casualties ${(totalDirectCasualties / samples).toFixed(2)}) ` +
      `zone rounds ${JSON.stringify(roundsByZone)}`,
  );
}

console.log('tactical assault tests passed');
