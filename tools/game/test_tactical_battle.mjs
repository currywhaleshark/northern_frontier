import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-tactical-tests-'));
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

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const tacticalCore = await import(pathToFileURL(join(compiledDir, 'tacticalCore.mjs')).href);
const tacticalEngagement = await import(pathToFileURL(join(compiledDir, 'tacticalEngagement.mjs')).href);
const enemyPlan = await import(pathToFileURL(join(compiledDir, 'enemyPlan.mjs')).href);
const tacticalCommandState = await import(pathToFileURL(join(compiledDir, 'tacticalCommandState.mjs')).href);
const raids = await import(pathToFileURL(join(compiledDir, 'raids.mjs')).href);
const battleSimulation = await import(pathToFileURL(join(compiledDir, 'battleSimulation.mjs')).href);
const reportModalSource = readFileSync(new URL('../../src/components/TacticalBattleReportModal.tsx', import.meta.url), 'utf8');

function prepareDefenders(state) {
  state.weather = 'clear';
  state.resources.spears = 2;
  state.resources.hornBows = 2;
  state.resources.muskets = 2;
  state.resources.gunpowder = 20;
  state.residents.slice(0, 8).forEach((resident, index) => {
    resident.job = index < 6 ? 'militia' : 'watchman';
    resident.sick = false;
    resident.health = 100;
  });
  state.residents.slice(8, 10).forEach(resident => {
    resident.job = 'hunter';
    resident.sick = false;
    resident.health = 100;
  });
}

function addBuiltMarker(state, type) {
  state.buildings.push({
    id: state.nextBuildingId++,
    type,
    x: 0,
    y: 0,
    progress: 999,
    built: true,
    fieldGrowth: 0,
  });
}

{
  const state = simulation.newGame(2026071201);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: '변경 마적', power: 60, warned: false, siege: false, mode: 'garrison',
  });

  assert.equal(state.tacticalBattle, battle);
  assert.equal(battle.phase, 'preparation');
  assert.equal(battle.zones.length, 4);
  assert.deepEqual(battle.zones.map(zone => zone.id), ['approach', 'wall', 'storehouse', 'center']);
  assert.equal(battle.raiderGroups.length, 3);
  assert.equal(battle.raiderGroups.reduce((sum, group) => sum + group.count, 0), 15);
  assert.ok(battle.raiderGroups.every(group => group.killed === 0));
  assert.ok(battle.defenderGroups.some(group => group.kind === 'militia-musket'));
  assert.ok(battle.defenderGroups.some(group => group.kind === 'militia-bow'));
  assert.ok(battle.defenderGroups.some(group => group.kind === 'militia-spear'));
  assert.ok(battle.defenderGroups
    .filter(group => ['militia-spear', 'militia-unarmed', 'watchman'].includes(group.kind))
    .every(group => group.line === 'front'));
  assert.ok(battle.defenderGroups
    .filter(group => group.kind === 'militia-musket')
    .every(group => group.line === 'middle'));
  assert.ok(battle.defenderGroups
    .filter(group => ['militia-bow', 'hunter', 'civilian'].includes(group.kind))
    .every(group => group.line === 'rear'));
  assert.ok(battle.raiderGroups
    .filter(group => group.kind === 'flankers')
    .every(group => group.flankPlan === 'breakthrough' || group.flankPlan === 'rearAssault'));
  assert.ok(battle.enemyPlan, 'raid defenses fix their enemy plan before preparation starts');
  assert.equal(
    battle.raiderGroups.find(group => group.kind === 'flankers')?.flankPlan,
    enemyPlan.flankPlanFromEnemyPlan(battle.enemyPlan),
  );
  assert.ok(battle.prepPoints >= 1 && battle.prepPoints <= 8);
  assert.deepEqual(
    Object.fromEntries(battle.prepActions.map(action => [action.id, action.cost])),
    {
      evacuateCivilians: 1,
      hideSupplies: 1,
      repairWall: 1,
      setAmbush: 2,
      prepareVolley: 2,
      firePrevention: 1,
      torchWatch: 1,
      preliminaryBombardment: 3,
      musterMilitia: 1,
    },
  );
}

{
  const rearPlan = enemyPlan.createEnemyPlan({
    factionName: '변경 마적', flankRoll: 0.2, revealed: true,
  });
  assert.equal(rearPlan.objective, 'breakthrough');
  assert.equal(rearPlan.objectiveRevealed, true);
  assert.deepEqual(rearPlan.stratagems, [
    { id: 'rearManeuver', revealed: true, counterLevel: 0 },
  ]);
  assert.equal(enemyPlan.flankPlanFromEnemyPlan(rearPlan), 'rearAssault');
  assert.equal(enemyPlan.flankPlanRevealedFromEnemyPlan(rearPlan), true);

  const frontalPlan = enemyPlan.createEnemyPlan({
    factionName: '니마차 우디캐', flankRoll: 0.8, revealed: false,
  });
  assert.deepEqual(frontalPlan.stratagems, []);
  assert.equal(enemyPlan.flankPlanFromEnemyPlan(frontalPlan), 'breakthrough');
  assert.equal(enemyPlan.flankPlanRevealedFromEnemyPlan(frontalPlan), false);

  assert.deepEqual(
    enemyPlan.migrateEnemyPlan({
      objective: 'unknown-objective',
      objectiveRevealed: 'yes',
      stratagemPoints: -4,
      stratagems: [
        { id: 'rearManeuver', revealed: 'yes', counterLevel: 9 },
        { id: 'unknown-stratagem', revealed: true, counterLevel: 2 },
      ],
    }),
    {
      objective: 'breakthrough',
      objectiveRevealed: false,
      stratagemPoints: 0,
      stratagems: [{ id: 'rearManeuver', revealed: false, counterLevel: 0 }],
    },
    'enemy plan migration repairs fields independently and drops only unknown stratagems',
  );
}

{
  const state = simulation.newGame(2026071401);
  prepareDefenders(state);
  const sick = state.residents[0];
  const critical = state.residents[1];
  const quarantined = state.residents[2];
  sick.sick = true;
  critical.health = 19;
  quarantined.quarantinedUntil = state.day + 2;

  const battle = tactical.createTacticalBattle(state, {
    factionName: 'civilian-protection-test', power: 60, warned: true, siege: false, mode: 'garrison',
  });
  const civilians = battle.defenderGroups.find(group => group.kind === 'civilian');
  assert.ok(civilians);
  assert.ok(civilians.residentIds.includes(sick.id));
  assert.ok(civilians.residentIds.includes(critical.id));
  assert.ok(civilians.residentIds.includes(quarantined.id));
  assert.equal(civilians.power, 0, 'protected civilians never add combat power');
  assert.equal(civilians.commandable, false);
  assert.equal(civilians.lockedZoneId, 'center');

  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(battle.phase, 'deployment');
  assert.ok(tactical.assignDefenderGroup(state, civilians.id, 'wall'));
  assert.ok(tactical.assignDefenderGroup(state, civilians.id, 'storehouse'));
  assert.ok(tactical.setDefenderFormationLine(state, civilians.id, 'front'));
  assert.equal(civilians.zoneId, 'center');
  assert.equal(civilians.line, 'rear');

  assert.equal(tactical.advanceTacticalPhase(state), null);
  for (const command of ['hold', 'advance', 'fallback']) {
    assert.ok(tactical.setTacticalCommand(state, civilians.id, command));
  }
  assert.equal(civilians.command, null);

  battle.phase = 'preparation';
  battle.prepPoints = 8;
  assert.equal(tactical.spendPreparationAction(state, 'musterMilitia'), null);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  const mustered = battle.defenderGroups.find(group => group.id === 'militia-unarmed-mustered');
  const musteredIds = new Set(mustered?.residentIds ?? []);
  assert.equal(musteredIds.has(sick.id), false);
  assert.equal(musteredIds.has(critical.id), false);
  assert.equal(musteredIds.has(quarantined.id), false);
}

{
  const state = simulation.newGame(2026071202);
  prepareDefenders(state);
  addBuiltMarker(state, 'beacon');
  addBuiltMarker(state, 'watchtower');
  addBuiltMarker(state, 'watchtower');
  state.residents.slice(0, 4).forEach(resident => { resident.job = 'watchman'; });
  const battle = tactical.createTacticalBattle(state, {
    factionName: '홀라온 야인', power: 45, warned: true, siege: true, mode: 'levy',
  });
  assert.equal(battle.prepPoints, 8, 'warning, beacon, towers, and watchmen should reach prep cap');

  const before = battle.prepPoints;
  const wallDefenseBefore = battle.zones.find(zone => zone.id === 'wall').defenseBonus;
  assert.equal(tactical.spendPreparationAction(state, 'repairWall'), null);
  assert.equal(battle.prepPoints, before - 1);
  assert.equal(battle.prepActions.find(action => action.id === 'repairWall').selected, true);
  assert.equal(battle.prepActions.find(action => action.id === 'repairWall').applied, false);
  assert.equal(battle.zones.find(zone => zone.id === 'wall').defenseBonus, wallDefenseBefore);
  assert.equal(tactical.spendPreparationAction(state, 'repairWall'), null, 'a selected preparation can be cancelled');
  assert.equal(battle.prepPoints, before, 'cancelling refunds its preparation points');
  assert.equal(battle.prepActions.find(action => action.id === 'repairWall').selected, false);
  assert.equal(tactical.spendPreparationAction(state, 'repairWall'), null);

  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(battle.phase, 'preparationExecution');
  assert.equal(battle.prepActions.find(action => action.id === 'repairWall').applied, true);
  assert.ok(battle.zones.find(zone => zone.id === 'wall').defenseBonus > wallDefenseBefore);
  assert.ok(battle.preparationEvents.some(event => event.kind === 'fortify' && event.zoneId === 'wall'));
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(battle.phase, 'deployment');
  const movable = battle.defenderGroups.find(group => group.kind !== 'civilian');
  assert.ok(movable);
  assert.equal(tactical.assignDefenderGroup(state, movable.id, 'storehouse'), null);
  assert.equal(movable.zoneId, 'storehouse');
  assert.equal(tactical.setDefenderFormationLine(state, movable.id, 'rear'), null);
  assert.equal(movable.line, 'rear');

  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(battle.phase, 'command');
  const activeCommandGroups = battle.defenderGroups.filter(tacticalCommandState.tacticalGroupCanReceiveCommand);
  assert.ok(activeCommandGroups.every(group => group.command != null && group.commandSource === 'recommended'));
  assert.equal(tacticalCommandState.pendingTacticalCommandCount(battle.defenderGroups), activeCommandGroups.length);
  assert.equal(tactical.setDefenderFormationLine(state, movable.id, 'middle'), null);
  assert.equal(movable.line, 'rear', 'command-phase formation changes wait until the round report is acknowledged');
  assert.equal(movable.pendingLine, 'middle');
  assert.equal(movable.command, 'redeploy');
  assert.equal(tactical.setTacticalCommand(state, movable.id, 'guardStorehouse'), null);
  assert.equal(movable.command, 'guardStorehouse');
  assert.equal(movable.pendingLine, undefined, 'a zone command cancels a queued line redeployment');
  assert.equal(movable.commandSource, 'player');
  assert.equal(
    tacticalCommandState.pendingTacticalCommandCount(battle.defenderGroups),
    activeCommandGroups.length - 1,
  );

  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(battle.phase, 'simulating');
  assert.equal(battle.round, 2);
  assert.equal(battle.reports.length, 1);
  assert.equal(battle.pendingReport, battle.reports[0]);
  assert.ok(battle.pendingReport.events.length > 0);
  assert.ok(battle.pendingReport.raidersKilled >= 0);
}

{
  const state = simulation.newGame(2026071460);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'redeploy timing test', power: 76, warned: true, siege: true, mode: 'garrison',
  });
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  const muskets = battle.defenderGroups.find(group => group.kind === 'militia-musket');
  const spear = battle.defenderGroups.find(group => group.kind === 'militia-spear');
  const civilians = battle.defenderGroups.find(group => group.kind === 'civilian');
  assert.ok(muskets && spear && civilians);
  assert.equal(muskets.line, 'middle');
  assert.ok(tactical.tacticalCommandUnavailableReason(battle, muskets, 'redeploy'),
    'redeploy requires a target line');
  assert.ok(tactical.setDefenderFormationLine(state, spear.id, 'rear'),
    'a unit cannot skip from front directly to rear');
  assert.equal(spear.line, 'front');
  assert.ok(tactical.setDefenderFormationLine(state, civilians.id, 'middle'),
    'protected civilians cannot redeploy');

  assert.equal(tactical.setDefenderFormationLine(state, muskets.id, 'front'), null);
  assert.equal(muskets.line, 'middle', 'redeploy does not move the unit immediately');
  assert.equal(muskets.pendingLine, 'front');
  assert.equal(muskets.command, 'redeploy');
  assert.equal(muskets.commandSource, 'player');
  assert.equal(tactical.tacticalCommandUnavailableReason(battle, muskets, 'redeploy'), null);

  const zone = battle.zones.find(candidate => candidate.id === muskets.zoneId);
  assert.ok(zone);
  const exchangeInput = {
    zone,
    attackers: [],
    weather: state.weather,
    prepareVolleyApplied: false,
    evacuateCiviliansApplied: false,
    roundStartingRaiderPower: 1,
    rng: () => 0.99,
  };
  const holdExchange = tacticalEngagement.resolveEngagementExchange({
    ...exchangeInput,
    defenders: [{ ...muskets, command: 'hold' }],
    direction: 'frontal',
  });
  const redeployExchange = tacticalEngagement.resolveEngagementExchange({
    ...exchangeInput,
    defenders: [{ ...muskets, command: 'redeploy' }],
    direction: 'frontal',
  });
  assert.ok(Math.abs(redeployExchange.defensePower / holdExchange.defensePower - 0.35 / 0.82) < 1e-9,
    'redeploy uses a 0.35 round power multiplier');

  muskets.zoneId = 'wall';
  assert.equal(tactical.setTacticalCommand(state, muskets.id, 'fallback'), null);
  assert.equal(muskets.pendingLine, undefined, 'fallback cannot coexist with line movement');
  assert.equal(tactical.setDefenderFormationLine(state, muskets.id, 'front'), null);
  assert.equal(muskets.command, 'redeploy', 'choosing an adjacent line replaces the zone movement command');
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(muskets.line, 'middle', 'the current round still resolves from the original line');
  assert.equal(muskets.pendingLine, 'front');
  assert.equal(tactical.completeTacticalSimulation(state), null);
  assert.equal(battle.pendingReport.ended, false);
  assert.equal(tactical.acknowledgeTacticalReport(state), null);
  assert.equal(muskets.line, 'front', 'the queued adjacent line applies after acknowledging the report');
  assert.equal(muskets.pendingLine, undefined);
}

{
  const state = simulation.newGame(2026071463);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'rear engagement assignment', power: 80, warned: true, siege: true, mode: 'garrison',
  });
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  const spear = battle.defenderGroups.find(group => group.kind === 'militia-spear');
  const bow = battle.defenderGroups.find(group => group.kind === 'militia-bow');
  const civilians = battle.defenderGroups.find(group => group.kind === 'civilian');
  const flanker = battle.raiderGroups.find(group => group.kind === 'flankers');
  assert.ok(spear && bow && civilians && flanker);

  const front = { ...spear, id: 'front', line: 'front', command: 'hold' };
  const middleFront = { ...spear, id: 'middle-front', line: 'middle', command: 'hold' };
  const middleRear = { ...spear, id: 'middle-rear', line: 'middle', command: 'reinforceRear' };
  const rear = { ...bow, id: 'rear', line: 'rear', command: 'volley' };
  const protectedCivilians = { ...civilians, id: 'protected-civilians', line: 'rear', command: null };
  const split = tacticalEngagement.splitTacticalEngagementDefenders(
    [front, middleFront, middleRear, rear, protectedCivilians],
    true,
  );
  assert.deepEqual(split.frontal.map(group => group.id), ['front', 'middle-front']);
  assert.deepEqual(split.rear.map(group => group.id), ['middle-rear', 'rear']);
  assert.deepEqual(split.protectedTargets.map(group => group.id), ['protected-civilians']);
  assert.equal(new Set([...split.frontal, ...split.rear, ...split.protectedTargets].map(group => group.id)).size, 5,
    'no defender contributes to both engagements');
  const noRearSplit = tacticalEngagement.splitTacticalEngagementDefenders(
    [front, middleFront, middleRear, rear, protectedCivilians],
    false,
  );
  assert.equal(noRearSplit.frontal.length, 4, 'without a rear engagement all combatants remain on the normal front');
  assert.equal(noRearSplit.rear.length, 0);
  assert.deepEqual(noRearSplit.protectedTargets.map(group => group.id), ['protected-civilians']);

  spear.zoneId = 'wall';
  spear.line = 'middle';
  bow.zoneId = 'wall';
  bow.line = 'middle';
  flanker.zoneId = 'wall';
  flanker.rearAssault = true;
  flanker.intent = 'flank';
  assert.equal(tactical.tacticalCommandUnavailableReason(battle, spear, 'reinforceRear'), null);
  assert.ok(tactical.tacticalCommandUnavailableReason(battle, bow, 'reinforceRear'),
    'ranged middle-line groups cannot act as a rear melee reserve');
  spear.line = 'front';
  assert.ok(tactical.tacticalCommandUnavailableReason(battle, spear, 'reinforceRear'),
    'only a middle-line melee group can reinforce the rear');
  spear.line = 'middle';
  spear.command = 'hold';
  spear.commandSource = 'recommended';
  tactical.chooseDefaultTacticalCommands(battle);
  assert.equal(spear.command, 'reinforceRear');
  assert.equal(spear.commandSource, 'recommended');
  assert.equal(tactical.setTacticalCommand(state, spear.id, 'reinforceRear'), null);
  assert.equal(spear.commandSource, 'player');

  const civilianRearExchange = tacticalEngagement.resolveEngagementExchange({
    zone: { ...battle.zones.find(zone => zone.id === 'center'), pressure: 100, civilianRisk: 100 },
    defenders: [protectedCivilians],
    attackers: [{ ...flanker, power: 300, morale: 100, count: 20, killed: 0, rearAssault: true }],
    direction: 'rear',
    weather: state.weather,
    prepareVolleyApplied: false,
    evacuateCiviliansApplied: false,
    roundStartingRaiderPower: 300,
    rng: () => 0,
  });
  assert.equal(civilianRearExchange.defensePower, 0, 'protected civilians never add rear defense power');
  assert.deepEqual(civilianRearExchange.commands, [], 'protected civilians never contribute to command ratios');
  assert.equal(tactical.tacticalDefenderReadiness([protectedCivilians]), 0,
    'protected civilians never contribute to tactical readiness');
  assert.ok(civilianRearExchange.defenderLosses.find(loss => loss.groupId === protectedCivilians.id)?.wounded > 0,
    'protected civilians remain rear-engagement damage targets');
}

{
  const state = simulation.newGame(2026071464);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'rear-only pressure test', power: 84, warned: true, siege: true, mode: 'garrison',
  });
  assert.equal(tactical.advanceTacticalPhase(state), null);
  battle.defenderGroups.forEach(group => { group.zoneId = 'center'; });
  const flanker = battle.raiderGroups.find(group => group.kind === 'flankers');
  assert.ok(flanker);
  battle.raiderGroups.filter(group => group.id !== flanker.id).forEach(group => { group.intent = 'withdraw'; });
  flanker.zoneId = 'wall';
  flanker.rearAssault = true;
  flanker.intent = 'flank';
  flanker.engagementsInZone = 1;
  flanker.morale = 100;
  battle.zones.find(zone => zone.id === 'wall').pressure = 40;
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(battle.zones.find(zone => zone.id === 'wall').pressure, 35,
    'a rear-only engagement cannot add frontal zone pressure');
  assert.equal(flanker.intent, 'withdraw', 'a dominant rear assault exits after completing its second engagement');
}

{
  const state = simulation.newGame(2026071486);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'rear response options', power: 84, warned: true, siege: true, mode: 'garrison',
  });
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  const spear = battle.defenderGroups.find(group => group.kind === 'militia-spear');
  const bow = battle.defenderGroups.find(group => group.kind === 'militia-bow');
  const watchman = battle.defenderGroups.find(group => group.kind === 'watchman');
  const flanker = battle.raiderGroups.find(group => group.kind === 'flankers');
  assert.ok(spear && bow && watchman && flanker);
  Object.assign(spear, { zoneId: 'wall', line: 'middle', command: 'hold', commandSource: 'recommended' });
  Object.assign(bow, { zoneId: 'wall', line: 'rear', command: 'volley', commandSource: 'recommended' });
  Object.assign(watchman, { zoneId: 'wall', line: 'front', command: 'hold', commandSource: 'recommended' });
  Object.assign(flanker, { zoneId: 'wall', rearAssault: true, intent: 'flank', power: 30 });

  const options = tactical.tacticalRearResponseOptions(battle, 'wall');
  assert.deepEqual(options.map(option => option.id), [
    'reinforceRear', 'redeployRear', 'rangedRear', 'unopposed',
  ]);
  assert.deepEqual(options.find(option => option.id === 'reinforceRear').groupIds, [spear.id]);
  assert.ok(options.find(option => option.id === 'redeployRear').groupIds.includes(watchman.id));
  assert.deepEqual(options.find(option => option.id === 'rangedRear').groupIds, [bow.id]);
  assert.match(options.find(option => option.id === 'redeployRear').description, /정면 압박/);

  tactical.chooseDefaultTacticalCommands(battle);
  assert.equal(spear.command, 'reinforceRear', 'the middle melee reserve is recommended for an active rear assault');
  const split = tacticalEngagement.splitTacticalEngagementDefenders([spear, bow, watchman], true);
  assert.deepEqual(split.rear.map(group => group.id), [spear.id, bow.id],
    'the reserve and rear ranged group answer the rear engagement without a new command system');
  assert.deepEqual(split.frontal.map(group => group.id), [watchman.id]);

  assert.equal(tactical.setDefenderFormationLine(state, watchman.id, 'middle'), null);
  assert.equal(watchman.command, 'redeploy');
  assert.equal(watchman.pendingLine, 'middle');
  assert.ok(tacticalEngagement.splitTacticalEngagementDefenders([watchman], true).frontal.includes(watchman),
    'a front-line redeploy weakens the current frontal exchange before it can reach the rear');

  flanker.rearAssault = false;
  assert.deepEqual(tactical.tacticalRearResponseOptions(battle, 'wall'), []);
}

{
  const groups = [
    { id: 'recommended', count: 2, wounded: 0, killed: 0, command: 'hold', commandSource: 'recommended' },
    { id: 'player', count: 2, wounded: 0, killed: 0, command: 'volley', commandSource: 'player' },
    { id: 'down', count: 2, wounded: 1, killed: 1, command: 'hold', commandSource: 'recommended' },
    { id: 'civilians', count: 4, wounded: 0, killed: 0, command: null, commandable: false },
  ];
  assert.equal(tacticalCommandState.pendingTacticalCommandCount(groups), 1);
  assert.equal(tacticalCommandState.nextPendingTacticalGroupId(groups, 'player'), 'recommended');
  assert.equal(tacticalCommandState.nextActiveTacticalGroupId(groups, 'down'), 'recommended');
  assert.equal(tacticalCommandState.tacticalGroupCanReceiveCommand(groups[2]), false);
  assert.equal(tacticalCommandState.tacticalGroupCanReceiveCommand(groups[3]), false);
}

{
  const state = simulation.newGame(2026071487);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'zone focus target', power: 72, warned: true, siege: false, mode: 'garrison',
  });
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  const zone = battle.zones.find(candidate => candidate.id === 'wall');
  const target = battle.raiderGroups[0];
  assert.ok(zone && target);
  Object.assign(target, {
    zoneId: zone.id, revealed: true, intent: 'advance', power: 200, count: 50, killed: 0,
  });

  assert.equal(tactical.setTacticalFocusTarget(state, zone.id, target.id), null);
  assert.equal(zone.focusTargetGroupId, target.id);
  assert.equal(zone.focusTargetSource, 'player');
  tactical.normalizeTacticalFocusTargets(battle);
  assert.equal(zone.focusTargetGroupId, target.id, 'a valid player target persists across command refreshes');

  target.revealed = false;
  assert.match(tactical.setTacticalFocusTarget(state, zone.id, target.id), /드러나지 않은/);
  assert.equal(zone.focusTargetGroupId, target.id, 'a rejected hidden target does not replace the prior selection');
  target.revealed = true;
  target.zoneId = 'storehouse';
  tactical.normalizeTacticalFocusTargets(battle);
  assert.equal(zone.focusTargetGroupId, undefined, 'a target that leaves the zone returns that zone to auto');
  assert.equal(zone.focusTargetSource, 'auto');

  target.zoneId = zone.id;
  target.intent = 'withdraw';
  zone.focusTargetGroupId = target.id;
  zone.focusTargetSource = 'player';
  tactical.normalizeTacticalFocusTargets(battle);
  assert.equal(zone.focusTargetSource, 'auto', 'a withdrawing target returns to auto');

  target.intent = 'advance';
  target.killed = target.count;
  zone.focusTargetGroupId = target.id;
  zone.focusTargetSource = 'player';
  tactical.normalizeTacticalFocusTargets(battle);
  assert.equal(zone.focusTargetSource, 'auto', 'an eliminated target returns to auto');
}

{
  const defender = (id, line, weapon, overrides = {}) => ({
    id,
    kind: weapon === 'spear' ? 'militia-spear'
      : weapon === 'musket' ? 'militia-musket'
        : 'militia-bow',
    role: 'militia',
    weapon,
    readyMuskets: weapon === 'musket' ? 4 : undefined,
    label: id,
    residentIds: [1, 2, 3, 4],
    count: 4,
    zoneId: 'wall',
    command: weapon === 'spear' ? 'hold' : 'volley',
    power: 40,
    wounded: 0,
    killed: 0,
    line,
    ambushed: false,
    ...overrides,
  });
  const frontGuard = defender('front-guard', 'front', 'spear');
  const middleMuskets = defender('middle-muskets', 'middle', 'musket');
  const rearBows = defender('rear-bows', 'rear', 'hornBow');

  const screenedMiddle = tacticalEngagement.formationExposureMultiplier(
    middleMuskets,
    [frontGuard, middleMuskets, rearBows],
  );
  const exposedMiddle = tacticalEngagement.formationExposureMultiplier(
    middleMuskets,
    [{ ...frontGuard, killed: frontGuard.count }, middleMuskets, rearBows],
  );
  const screenedRear = tacticalEngagement.formationExposureMultiplier(
    rearBows,
    [{ ...frontGuard, killed: frontGuard.count }, middleMuskets, rearBows],
  );
  const exposedRear = tacticalEngagement.formationExposureMultiplier(
    rearBows,
    [
      { ...frontGuard, killed: frontGuard.count },
      { ...middleMuskets, killed: middleMuskets.count },
      rearBows,
    ],
  );
  assert.ok(screenedMiddle < exposedMiddle, 'an active front line shields the middle line');
  assert.ok(exposedMiddle > screenedRear, 'the middle line becomes the contact line after the front falls');
  assert.ok(exposedRear > screenedRear, 'the rear line becomes the contact line after front and middle fall');

  const rearWithoutGuard = tacticalEngagement.rearAssaultExposureMultiplier(
    rearBows,
    [frontGuard, middleMuskets, rearBows],
  );
  const middleWithoutGuard = tacticalEngagement.rearAssaultExposureMultiplier(
    middleMuskets,
    [frontGuard, middleMuskets, rearBows],
  );
  const frontWithoutGuard = tacticalEngagement.rearAssaultExposureMultiplier(
    frontGuard,
    [frontGuard, middleMuskets, rearBows],
  );
  assert.ok(rearWithoutGuard > middleWithoutGuard && middleWithoutGuard > frontWithoutGuard,
    'rear assaults expose rear, middle, then front in that order');

  const middleGuard = defender('middle-guard', 'middle', 'spear');
  const rearGuard = defender('rear-guard', 'rear', 'spear');
  const partiallyGuardedRear = tacticalEngagement.rearAssaultExposureMultiplier(
    rearBows,
    [frontGuard, middleGuard, rearBows],
  );
  const fullyGuardedRear = tacticalEngagement.rearAssaultExposureMultiplier(
    rearBows,
    [frontGuard, middleMuskets, rearBows, rearGuard],
  );
  assert.ok(fullyGuardedRear < partiallyGuardedRear && partiallyGuardedRear < rearWithoutGuard,
    'middle melee guards give partial protection while rear melee guards give full protection');
}

{
  assert.equal(typeof tactical.tacticalDefenderReadiness, 'function');
  const combatants = { id: 'combatants', count: 2, wounded: 1, killed: 0 };
  const protectedCivilians = {
    id: 'protected-civilians', count: 8, wounded: 0, killed: 0, commandable: false,
  };
  assert.equal(
    tactical.tacticalDefenderReadiness([combatants, protectedCivilians]),
    0.5,
    'protected civilians must not change combat readiness',
  );
  assert.equal(
    tactical.tacticalDefenderReadiness([protectedCivilians]),
    0,
    'a civilian-only zone has no combat readiness',
  );
}

{
  const state = battleSimulation.createBattleSimulation({
    mode: 'garrison', factionName: '변경 마적', power: 72, warned: true, siege: true,
    season: 'winter', weather: 'clear', prepPoints: 'auto', seed: 2026071415,
    defenders: {
      muskets: 2, bows: 2, spears: 3, unarmedMilitia: 1,
      watchmen: 2, hunters: 2, civilians: 4,
    },
    cannonEmplacements: 0,
  });
  const battle = state.tacticalBattle;
  const zone = battle.zones.find(candidate => candidate.id === 'approach');
  assert.ok(zone);
  const defenders = structuredClone(battle.defenderGroups);
  const attackers = structuredClone(battle.raiderGroups.filter(group => group.zoneId === zone.id));
  const defendersBefore = structuredClone(defenders);
  const attackersBefore = structuredClone(attackers);
  const zoneBefore = structuredClone(zone);
  let rollIndex = 0;
  const rolls = [0.12, 0.84, 0.31, 0.67, 0.45, 0.93];
  const exchange = tacticalEngagement.resolveEngagementExchange({
    zone,
    defenders,
    attackers,
    direction: 'frontal',
    weather: state.weather,
    prepareVolleyApplied: false,
    evacuateCiviliansApplied: false,
    roundStartingRaiderPower: attackers.reduce((sum, group) => sum + group.power, 0),
    rng: () => rolls[rollIndex++ % rolls.length],
  });
  assert.deepEqual(defenders, defendersBefore, 'engagement exchange must not mutate defender input');
  assert.deepEqual(attackers, attackersBefore, 'engagement exchange must not mutate attacker input');
  assert.deepEqual(zone, zoneBefore, 'engagement exchange must not mutate zone input');
  assert.ok(Number.isFinite(exchange.enemyShare));
  assert.equal(exchange.raiderLosses.length, attackers.length);

  const consequenceDefenders = structuredClone(defenders);
  for (const loss of exchange.defenderLosses) {
    const defender = consequenceDefenders.find(group => group.id === loss.groupId);
    if (defender) {
      defender.wounded += loss.wounded;
      defender.killed += loss.killed;
    }
  }
  const consequenceAttackers = structuredClone(attackers);
  for (const loss of exchange.raiderLosses) {
    const attacker = consequenceAttackers.find(group => group.id === loss.groupId);
    if (attacker) attacker.confused = loss.confused;
  }
  const consequenceDefendersBefore = structuredClone(consequenceDefenders);
  const consequenceAttackersBefore = structuredClone(consequenceAttackers);
  const consequences = tacticalEngagement.applyDefenseZoneConsequences({
    zone,
    defenders: consequenceDefenders,
    attackers: consequenceAttackers,
    commands: exchange.commands,
    enemyPower: exchange.enemyPower,
    defensePower: exchange.defensePower,
    enemyShare: exchange.enemyShare,
    originalPower: battle.originalPower,
    availableLoot: { grain: 10, firewood: 10, hide: 10 },
    rng: () => 0.5,
  });
  assert.deepEqual(consequenceDefenders, consequenceDefendersBefore,
    'defense consequences must not mutate defender input');
  assert.deepEqual(consequenceAttackers, consequenceAttackersBefore,
    'defense consequences must not mutate attacker input');
  assert.deepEqual(zone, zoneBefore, 'defense consequences must not mutate zone input');
  assert.ok(Number.isFinite(consequences.pressure));
}

{
  const state = simulation.newGame(2026071203);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: '변경 마적', power: 24, warned: true, siege: false, mode: 'garrison',
  });
  tactical.advanceTacticalPhase(state);
  tactical.advanceTacticalPhase(state);
  battle.raiderMorale = 1;
  battle.raiderGroups.forEach(group => { group.morale = 1; });
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(battle.pendingReport.ended, true);
  assert.equal(battle.pendingReport.outcome, 'defenseSuccess');
  const woundedGroup = battle.defenderGroups.find(group => group.count > 0);
  assert.ok(woundedGroup);
  woundedGroup.wounded = 1;
  battle.pendingReport.wounded = 1;
  battle.pendingReport.loot = { grain: 5 };
  battle.pendingReport.buildingsDamaged = 1;
  const grainBeforeFinish = state.resources.grain;

  assert.equal(tactical.completeTacticalSimulation(state), null);
  assert.equal(battle.phase, 'report');
  assert.equal(tactical.acknowledgeTacticalReport(state), null);
  assert.equal(battle.phase, 'finished');

  const beforeSubTick = state.subTick;
  simulation.advanceTick(state);
  assert.equal(state.subTick, beforeSubTick, 'ordinary simulation must pause during tactical battle');

  tactical.finishTacticalBattle(state);
  assert.equal(state.tacticalBattle, null);
  assert.ok(state.tacticalBattleReport);
  assert.equal(state.raiders, null);
  assert.equal(state.battle, null);
  assert.ok(state.raidCooldown > 0);
  assert.ok(state.threat <= 40);
  assert.equal(state.resources.grain, grainBeforeFinish - 2.5);
  assert.equal(state.tacticalBattleReport.recoveredLoot.grain, 2.5);
  assert.ok(state.buildings.some(building => building.repairing), 'deferred building damage should be applied on finish');
  assert.ok(state.residents.some(resident => resident.alive && resident.health < 100), 'deferred wounds should be applied on finish');
  assert.ok(state.log.some(entry => entry.text.startsWith('전투 장계:')));
  assert.equal(
    state.tacticalBattleReport.raidersKilled + state.tacticalBattleReport.raidersEscaped,
    state.tacticalBattleReport.raidersCommitted,
  );
  assert.ok(Array.isArray(state.tacticalBattleReport.wounded));
  const pausedAtReport = state.subTick;
  simulation.advanceTick(state);
  assert.equal(state.subTick, pausedAtReport, 'simulation must remain paused while the detailed battle report is open');
  tactical.dismissTacticalBattleReport(state);
  assert.equal(state.tacticalBattleReport, null);
  simulation.advanceTick(state);
  assert.notEqual(state.subTick, pausedAtReport, 'simulation may resume after the detailed report is dismissed');
}

{
  const grade = input => tacticalCore.gradeTacticalBattle({
    encounterKind: 'raidDefense',
    result: 'victory',
    friendlyPower: 100,
    enemyPower: 100,
    defendersCommitted: 20,
    defendersKilled: 0,
    defendersWounded: 0,
    enemiesCommitted: 20,
    enemiesKilled: 0,
    loot: {},
    ...input,
  }).grade;

  assert.equal(grade({ enemyPower: 200, enemiesKilled: 18 }), 'greatVictory');
  assert.equal(grade({ enemiesKilled: 8, defendersWounded: 2 }), 'victory');
  assert.equal(grade({ friendlyPower: 200, enemyPower: 100, enemiesKilled: 2,
    defendersKilled: 4, defendersWounded: 6, loot: { grain: 12 } }), 'narrowVictory');
  assert.equal(grade({ result: 'defeat', enemyPower: 220, enemiesKilled: 10,
    defendersKilled: 1, defendersWounded: 2 }), 'narrowDefeat');
  assert.equal(grade({ result: 'defeat', enemiesKilled: 4, defendersKilled: 2,
    defendersWounded: 4, loot: { grain: 5 } }), 'defeat');
  assert.equal(grade({ result: 'defeat', friendlyPower: 200, enemyPower: 100,
    defendersKilled: 6, defendersWounded: 8, loot: { grain: 20 } }), 'crushingDefeat');
  assert.deepEqual(tacticalCore.TACTICAL_BATTLE_GRADE_LABELS, {
    greatVictory: '대승',
    victory: '승리',
    narrowVictory: '아쉬운 승리',
    narrowDefeat: '아쉬운 패배',
    defeat: '패배',
    crushingDefeat: '대패',
  });
  assert.deepEqual(tacticalCore.tacticalDefenderShotCounts([
    { role: 'militia', weapon: 'musket', count: 5, killed: 0, readyMuskets: 2 },
    { role: 'watchman', weapon: 'hornBow', count: 4, killed: 1, readyMuskets: 0 },
  ]), { arrows: 3, muskets: 2 });
  assert.deepEqual(tacticalCore.tacticalDefenderShotCounts([
    { role: 'militia', weapon: 'musket', count: 5, wounded: 2, killed: 1, readyMuskets: 5 },
    { role: 'watchman', weapon: 'hornBow', count: 5, wounded: 2, killed: 1, readyMuskets: 0 },
  ]), { arrows: 2, muskets: 2 });
  assert.deepEqual(tacticalCore.tacticalDefenderShotCounts([
    { role: 'militia', weapon: 'musket', count: 5, wounded: 1, killed: 0, readyMuskets: 2 },
  ]), { muskets: 2 }, 'musket effects never exceed ready muskets');
  assert.deepEqual(tacticalCore.tacticalRaiderShotCounts([
    { unitType: 'court-gunner', count: 4, killed: 1 },
    { unitType: 'court-archer', count: 3, killed: 1 },
    { unitType: 'court-artillery', count: 2, killed: 0 },
  ]), { arrows: 2, muskets: 3, cannons: 2 });

  const peopleState = simulation.newGame(2026071402);
  const [unhurt, newlyWounded, killed] = peopleState.residents;
  unhurt.health = 70;
  newlyWounded.health = 45;
  killed.health = 0;
  killed.alive = false;
  const people = tacticalCore.tacticalPeopleReport(peopleState, {
    defenderGroups: [{ label: '회귀 시험대', residentIds: [unhurt.id, newlyWounded.id, killed.id] }],
  }, new Map([
    [unhurt.id, 70],
    [newlyWounded.id, 70],
    [killed.id, 100],
  ]));
  assert.deepEqual(people.wounded.map(person => person.residentId), [newlyWounded.id]);
  assert.deepEqual(people.killed.map(person => person.residentId), [killed.id]);
  assert.equal(people.wounded.some(person => person.residentId === killed.id), false,
    'killed residents must not also appear as wounded');

  assert.deepEqual(tacticalCore.raidDefenseObjectiveResult({
    factionName: '변경 마적', outcome: 'partialLoss', enemyRouted: false, looted: false,
    defendersCommitted: 20, defendersKilled: 0, defendersWounded: 3,
  }), { result: 'victory' });
  assert.deepEqual(tacticalCore.raidDefenseObjectiveResult({
    factionName: '변경 마적', outcome: 'partialLoss', enemyRouted: false, looted: false,
    defendersCommitted: 20, defendersKilled: 7, defendersWounded: 6,
  }), { result: 'defeat', forcedGrade: 'narrowDefeat' });
  assert.deepEqual(tacticalCore.raidDefenseObjectiveResult({
    factionName: '변경 마적', outcome: 'partialLoss', enemyRouted: false, looted: true,
    defendersCommitted: 20, defendersKilled: 0, defendersWounded: 0,
  }), { result: 'defeat' });
  assert.deepEqual(tacticalCore.raidDefenseObjectiveResult({
    factionName: '변경 마적', outcome: 'defenseSuccess', enemyRouted: true, looted: true,
    defendersCommitted: 20, defendersKilled: 0, defendersWounded: 2,
  }), { result: 'victory' });
}

{
  function finishDefenseReport(factionName, outcome, seed, options = {}) {
    const state = simulation.newGame(seed);
    prepareDefenders(state);
    const grainBefore = state.resources.grain;
    const battle = tactical.createTacticalBattle(state, {
      factionName, power: 60, warned: true, siege: false, mode: 'garrison',
    });
    if (options.raiderMorale != null) battle.raiderMorale = options.raiderMorale;
    battle.reports.push({
      round: 5,
      focusZoneId: 'center',
      nextFocusZoneId: 'center',
      summary: 'final report',
      lines: [],
      events: [],
      wounded: 0,
      killed: 0,
      raidersKilled: 1,
      loot: options.loot ?? (outcome === 'defenseSuccess' ? {} : { grain: 3 }),
      buildingsDamaged: 0,
      villageMoraleDelta: 0,
      raiderMoraleDelta: 0,
      ended: true,
      outcome,
    });
    battle.phase = 'finished';
    tactical.finishTacticalBattle(state);
    assert.ok(state.tacticalBattleReport);
    return { report: state.tacticalBattleReport, state, grainBefore };
  }

  const { report: raidLoss } = finishDefenseReport('변경 마적', 'partialLoss', 2026071411);
  assert.equal(raidLoss.result, 'defeat');
  assert.equal(raidLoss.closingSummary, '습격대가 약탈을 마치고 물러납니다.');

  const { report: courtLoss } = finishDefenseReport('조정 토벌군', 'partialLoss', 2026071412);
  assert.equal(courtLoss.result, 'defeat');
  assert.equal(courtLoss.closingSummary, '토벌대가 공격을 마치고 물러납니다.');

  const { report: victory } = finishDefenseReport('변경 마적', 'defenseSuccess', 2026071413);
  assert.equal(victory.result, 'victory');
  assert.equal(victory.closingSummary, '습격대가 약탈을 포기하고 물러납니다.');

  const noLoot = finishDefenseReport('변경 마적', 'partialLoss', 2026071414, { loot: {} }).report;
  assert.equal(noLoot.result, 'victory', 'preventing all loot fulfills the village defense objective');
  assert.equal(noLoot.closingSummary, '습격대가 약탈을 포기하고 물러납니다.');

  const routed = finishDefenseReport('변경 마적', 'defenseSuccess', 2026071415, {
    loot: { grain: 10 }, raiderMorale: 0,
  });
  assert.equal(routed.report.result, 'victory');
  assert.equal(routed.report.closingSummary, '적의 기세가 꺾여 대열이 무너지고 도주합니다.');
  assert.equal(routed.report.recoveredLoot.grain, 5, 'routing raiders recovers half of their stolen goods');
  assert.equal(routed.report.loot.grain, 5, 'the report records only the net loot loss after recovery');
  assert.equal(routed.state.resources.grain, routed.grainBefore - 5);

  assert.match(reportModalSource, /['"]물러난 적['"]/, 'enemy survivors must be labelled as withdrawn, not deserters');
  assert.doesNotMatch(reportModalSource, /대열 이탈·도주|적 도주/,
    'the final report must not describe all surviving enemies as deserters or escapees');
  assert.match(reportModalSource, /report\.closingSummary/, 'the final report must display its battle-specific closing line');
  assert.match(reportModalSource, /TACTICAL_BATTLE_GRADE_LABELS\[report\.grade\]/,
    'the final report must display the six-level battle grade');
}

{
  assert.deepEqual(
    battleSimulation.BATTLE_SIMULATION_ENEMIES.map(enemy => enemy.name),
    ['니마차 우디캐', '홀라온 야인', '변경 마적', '조정 토벌군'],
    'battle simulation should only offer actual hostile forces',
  );
  const state = battleSimulation.createBattleSimulation({
    mode: 'garrison', factionName: '조정 토벌군', power: 20, warned: true, siege: true,
    season: 'winter', weather: 'clear', prepPoints: 'auto', seed: 2026071310,
    defenders: { muskets: 2, bows: 2, spears: 2, unarmedMilitia: 0, watchmen: 2, hunters: 2, civilians: 6 },
    cannonEmplacements: 3,
  });
  const battle = state.tacticalBattle;
  assert.ok(battle);
  assert.equal(battle.originalPower, 120, 'court punitive force keeps a hard minimum power');
  assert.equal(battle.raiderMorale, 92, 'court punitive force starts with elite morale');
  assert.equal(state.buildings.filter(building => building.type === 'cannonEmplacement' && building.built).length, 3);
  assert.ok(state.resources.gunpowder >= 3 * 2, 'simulator supplies powder for its cannon emplacements');
  assert.deepEqual(
    new Set(battle.raiderGroups.map(group => group.unitType)),
    new Set(['court-gunner', 'court-archer', 'court-melee', 'court-cavalry', 'court-artillery']),
  );
  assert.ok(battle.raiderGroups.every(group => group.revealed && group.morale >= 88));
  assert.ok(battle.raiderGroups.find(group => group.unitType === 'court-artillery').wallPressureBonus >= 10);
}

{
  const offensiveOptions = {
    mode: 'garrison', factionName: '변경 마적', power: 88, warned: true, siege: false,
    season: 'autumn', weather: 'clear', prepPoints: 3, seed: 2026071411,
    defenders: { muskets: 1, bows: 2, spears: 2, unarmedMilitia: 1, watchmen: 1, hunters: 3, civilians: 0 },
    cannonEmplacements: 0,
  };
  const bandit = battleSimulation.createBattleSimulation({ ...offensiveOptions, scenario: 'banditLair' });
  assert.equal(bandit.tacticalBattle?.assaultKind, 'banditLair');
  assert.equal(bandit.tacticalBattle?.originalPower, 88);
  assert.equal(bandit.tacticalBattle?.warned, true);
  assert.equal(bandit.tacticalBattle?.prepPoints, 3);
  assert.equal(bandit.expedition?.kind, 'lairAssault');

  const tiger = battleSimulation.createBattleSimulation({
    ...offensiveOptions, scenario: 'tigerHunt', tigerTier: 'mountainLord', warned: false,
  });
  assert.equal(tiger.tacticalBattle?.assaultKind, 'predatorHunt');
  assert.equal(tiger.tacticalBattle?.huntPredatorKind, 'tiger');
  assert.equal(tiger.tacticalBattle?.huntTigerTier, 'mountainLord');
  assert.equal(tiger.tacticalBattle?.warned, false);

  const wolves = battleSimulation.createBattleSimulation({
    ...offensiveOptions, scenario: 'wolfHunt', wolfCount: 11,
  });
  assert.equal(wolves.tacticalBattle?.huntPredatorKind, 'wolf');
  assert.equal(
    wolves.tacticalBattle?.raiderGroups.reduce((sum, group) => sum + group.count, 0),
    11,
    'wolf hunt simulator preserves the selected pack size',
  );
}

{
  const expectedTypes = new Map([
    ['니마차 우디캐', ['nimacha-hunter', 'nimacha-looter', 'nimacha-spearman']],
    ['홀라온 야인', ['holaon-lancer', 'holaon-raider', 'holaon-horse-archer']],
    ['변경 마적', ['bandit-vanguard', 'bandit-looter', 'bandit-rider']],
  ]);
  for (const [factionName, unitTypes] of expectedTypes) {
    const state = simulation.newGame(2026071311);
    prepareDefenders(state);
    const battle = tactical.createTacticalBattle(state, {
      factionName, power: 48, warned: true, siege: false, mode: 'garrison',
    });
    assert.deepEqual(battle.raiderGroups.map(group => group.unitType), unitTypes);
  }
}

{
  const state = simulation.newGame(2026071209);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'ambush-preparation-test', power: 60, warned: true, siege: false, mode: 'garrison',
  });
  const hunters = battle.defenderGroups.find(group => group.kind === 'hunter');
  assert.ok(hunters);
  assert.equal(hunters.ambushed, false);
  assert.equal(tactical.spendPreparationAction(state, 'setAmbush'), null);
  assert.equal(hunters.ambushed, false, 'selecting a preparation does not apply it yet');
  battle.zones.find(zone => zone.id === 'approach').ambushBonus = 100;
  tactical.advanceTacticalPhase(state);
  assert.equal(hunters.ambushed, true, 'confirming preparations puts approach hunters in ambush');
  assert.equal(battle.phase, 'preparationExecution');
  assert.ok(battle.preparationEvents.some(event => event.kind === 'prepareAmbush' && event.groupId === hunters.id));
  tactical.advanceTacticalPhase(state);
  tactical.advanceTacticalPhase(state);
  assert.equal(hunters.command, 'ambush', 'an ambushed hunter defaults to the surprise attack command');
  const raiderZones = new Map(battle.raiderGroups.map(group => [group.id, group.zoneId]));
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(hunters.ambushed, false, 'a surprise attack consumes the ambushed state');
  assert.equal(hunters.command, 'fallback', 'hunters disengage automatically after a surprise attack');
  assert.ok(battle.raiderGroups.every(group => group.confused), 'guaranteed test chance confuses every raider group');
  assert.ok(battle.pendingReport.events.some(event => event.kind === 'ambush' && event.float === '혼란!'));
  assert.ok(
    battle.raiderGroups.every(group => group.zoneId === raiderZones.get(group.id)),
    'confused raiders cancel movement for the engagement',
  );
  assert.equal(tactical.completeTacticalSimulation(state), null);
  assert.equal(tactical.acknowledgeTacticalReport(state), null);
  assert.ok(battle.raiderGroups.every(group => !group.confused), 'confusion expires before the next engagement');
  assert.equal(hunters.zoneId, 'wall', 'hunters fall back one line after their surprise attack');
  assert.equal(hunters.command, 'hold', 'the automatic fallback is consumed after movement');
}

{
  const state = simulation.newGame(2026071311);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'preliminary-bombardment-test', power: 80, warned: true, siege: true, mode: 'garrison',
  });
  battle.prepPoints = 8;
  assert.match(
    tactical.spendPreparationAction(state, 'preliminaryBombardment'),
    /불랑기포대/,
    'preliminary bombardment requires a completed cannon emplacement',
  );
  addBuiltMarker(state, 'cannonEmplacement');
  addBuiltMarker(state, 'cannonEmplacement');
  const action = battle.prepActions.find(candidate => candidate.id === 'preliminaryBombardment');
  const powerBefore = battle.raiderGroups.reduce((sum, group) => sum + group.power, 0);
  const powderBefore = state.resources.gunpowder;
  assert.equal(tactical.spendPreparationAction(state, 'preliminaryBombardment'), null);
  assert.equal(action.selected, true);
  assert.equal(action.applied, false);
  assert.equal(battle.prepPoints, 5);
  assert.equal(state.resources.gunpowder, powderBefore, 'selection does not consume powder');
  assert.equal(tactical.spendPreparationAction(state, 'preliminaryBombardment'), null);
  assert.equal(battle.prepPoints, 8, 'cancelling bombardment refunds all three points');
  assert.equal(tactical.spendPreparationAction(state, 'preliminaryBombardment'), null);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(battle.phase, 'preparationExecution');
  assert.equal(action.applied, true);
  assert.equal(battle.preliminaryBombardmentCannons, 2);
  assert.equal(state.resources.gunpowder, powderBefore - 2 * 2);
  assert.ok(battle.preliminaryBombardmentCasualties > 0);
  assert.ok(battle.raiderGroups.reduce((sum, group) => sum + group.power, 0) < powerBefore);
  const bombardmentEvent = battle.preparationEvents.find(event => event.kind === 'bombardment');
  assert.ok(bombardmentEvent);
  assert.equal(bombardmentEvent.shots?.cannons, battle.preliminaryBombardmentCannons,
    'preliminary bulwangi fire schedules one cannon sample per firing emplacement');
  assert.ok(battle.preparationEvents.some(event => event.kind === 'casualty' && event.side === 'raider'));
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(battle.phase, 'deployment');
}

{
  const state = simulation.newGame(2026071312);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'muster-preparation-test', power: 60, warned: true, siege: false, mode: 'garrison',
  });
  battle.prepPoints = 8;
  const civilians = battle.defenderGroups.find(group => group.kind === 'civilian');
  assert.ok(civilians && civilians.count > 0);
  const civiliansBefore = civilians.count;
  assert.equal(tactical.spendPreparationAction(state, 'musterMilitia'), null);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(battle.phase, 'preparationExecution');
  const mustered = battle.defenderGroups.find(group => group.id === 'militia-unarmed-mustered');
  assert.ok(mustered);
  assert.equal(mustered.zoneId, 'wall', 'newly mustered militia joins the defensive front');
  assert.equal(civilians.count + mustered.count, civiliansBefore);
  assert.ok(battle.preparationEvents.some(event =>
    event.kind === 'muster' && event.zoneId === 'wall' && event.groupId === mustered.id));
}

{
  const state = simulation.newGame(2026071313);
  prepareDefenders(state);
  addBuiltMarker(state, 'cannonEmplacement');
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'preparation-camera-order-test', power: 80, warned: true, siege: true, mode: 'garrison',
  });
  battle.prepPoints = 8;
  for (const actionId of ['repairWall', 'setAmbush', 'prepareVolley', 'preliminaryBombardment']) {
    assert.equal(tactical.spendPreparationAction(state, actionId), null);
  }
  assert.equal(tactical.advanceTacticalPhase(state), null);
  const zoneOrder = new Map(battle.zones.map(zone => [zone.id, zone.order]));
  const eventOrders = battle.preparationEvents.map(event => zoneOrder.get(event.zoneId));
  assert.ok(eventOrders.every((order, index) => index === 0 || eventOrders[index - 1] <= order));
  assert.ok(battle.preparationEvents.some(event => event.kind === 'readyVolley'),
    'volley preparation emits the event routed to the supplied ready sample');
}

{
  const state = simulation.newGame(2026071210);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'ambush-command-test', power: 80, warned: true, siege: false, mode: 'garrison',
  });
  const hunters = battle.defenderGroups.find(group => group.kind === 'hunter');
  assert.ok(hunters);
  tactical.advanceTacticalPhase(state);
  tactical.advanceTacticalPhase(state);
  assert.equal(hunters.command, 'hold', 'hunters cannot default to ambush while enemies occupy their zone');
  assert.match(
    tactical.setTacticalCommand(state, hunters.id, 'ambush'),
    /새로 매복할 수 없습니다/,
    'hunters cannot establish an ambush in an enemy-occupied zone',
  );
}

{
  const state = simulation.newGame(2026071211);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'ambush-next-engagement-test', power: 80, warned: true, siege: false, mode: 'garrison',
  });
  const hunters = battle.defenderGroups.find(group => group.kind === 'hunter');
  assert.ok(hunters);
  tactical.advanceTacticalPhase(state);
  assert.equal(tactical.assignDefenderGroup(state, hunters.id, 'storehouse'), null);
  tactical.advanceTacticalPhase(state);
  assert.equal(hunters.command, 'ambush', 'hunters in an empty zone default to preparing an ambush');
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(hunters.ambushed, false, 'the setup engagement does not grant ambush early');
  assert.equal(tactical.completeTacticalSimulation(state), null);
  assert.equal(tactical.acknowledgeTacticalReport(state), null);
  assert.equal(hunters.ambushed, true, 'the ambush command becomes active for the following engagement');
}

{
  const state = simulation.newGame(2026071212);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'main-force-hold-test', power: 80, warned: true, siege: false, mode: 'garrison',
  });
  tactical.advanceTacticalPhase(state);
  for (const defender of battle.defenderGroups) defender.zoneId = 'wall';
  tactical.advanceTacticalPhase(state);
  for (const defender of battle.defenderGroups) defender.command = 'hold';
  const main = battle.raiderGroups.find(group => group.kind === 'main');
  assert.ok(main);
  main.zoneId = 'wall';
  battle.raiderGroups.filter(group => group !== main).forEach(group => { group.intent = 'withdraw'; });
  battle.round = 2;
  const wall = battle.zones.find(zone => zone.id === 'wall');
  wall.breached = false;
  wall.pressure = 0;
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(main.zoneId, 'wall');
  assert.equal(main.pendingZoneId, undefined, 'main force cannot pass an intact, well-manned defensive line');
  const wallAssault = battle.pendingReport.events.find(event =>
    event.kind === 'wallAssault' && event.zoneId === 'wall');
  assert.ok(wallAssault, 'an intact wall under pressure gets a visible enemy strike event');
  assert.equal(wallAssault.side, 'raider');
  assert.equal(wallAssault.groupId, main.id);
}

{
  const state = simulation.newGame(2026071213);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'main-force-breakthrough-test', power: 80, warned: true, siege: false, mode: 'garrison',
  });
  tactical.advanceTacticalPhase(state);
  for (const defender of battle.defenderGroups) defender.zoneId = 'center';
  tactical.advanceTacticalPhase(state);
  const main = battle.raiderGroups.find(group => group.kind === 'main');
  assert.ok(main);
  main.zoneId = 'wall';
  main.unitType = 'court-archer';
  main.revealed = true;
  battle.raiderGroups.filter(group => group !== main).forEach(group => { group.intent = 'withdraw'; });
  battle.round = 2;
  battle.zones.find(zone => zone.id === 'wall').breached = true;
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(main.zoneId, 'wall', 'raiders remain at the combat line throughout playback');
  assert.equal(main.pendingZoneId, 'center', 'a broken undefended line schedules the main force advance');
  assert.ok(
    battle.pendingReport.events.some(event => event.kind === 'advance' && event.zoneId === 'wall'),
    'advance animation is emitted from the line where combat occurred',
  );
  assert.equal(
    battle.pendingReport.events.some(event => event.kind === 'volley' && event.zoneId === 'wall'),
    false,
    'ranged raiders do not fire into an undefended zone before advancing',
  );
  assert.equal(
    battle.pendingReport.events.some(event => event.kind === 'melee' && event.zoneId === 'wall'),
    false,
    'undefended zones do not create phantom melee events',
  );
  assert.equal(tactical.completeTacticalSimulation(state), null);
  assert.equal(tactical.acknowledgeTacticalReport(state), null);
  assert.equal(main.zoneId, 'center', 'scheduled movement applies only after combat playback and its report');
  assert.equal(main.pendingZoneId, undefined);
}

{
  const state = simulation.newGame(2026071214);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'command-availability-test', power: 80, warned: true, siege: false, mode: 'garrison',
  });
  tactical.advanceTacticalPhase(state);
  tactical.advanceTacticalPhase(state);
  const bow = battle.defenderGroups.find(group => group.kind === 'militia-bow');
  const spear = battle.defenderGroups.find(group => group.kind === 'militia-spear');
  const hunter = battle.defenderGroups.find(group => group.kind === 'hunter');
  const civilians = battle.defenderGroups.find(group => group.kind === 'civilian');
  assert.ok(bow && spear && hunter && civilians);
  assert.equal(tactical.tacticalCommandUnavailableReason(battle, bow, 'volley'), null);
  assert.ok(tactical.tacticalCommandUnavailableReason(battle, spear, 'volley'));
  spear.zoneId = 'storehouse';
  assert.equal(tactical.tacticalCommandUnavailableReason(battle, spear, 'guardStorehouse'), null);
  spear.zoneId = 'wall';
  assert.ok(tactical.tacticalCommandUnavailableReason(battle, spear, 'guardStorehouse'));
  assert.ok(tactical.tacticalCommandUnavailableReason(battle, spear, 'protectCivilians'));
  spear.zoneId = 'center';
  assert.equal(tactical.tacticalCommandUnavailableReason(battle, spear, 'protectCivilians'), null);
  assert.equal(tactical.tacticalCommandUnavailableReason(battle, spear, 'advance'), null);
  assert.ok(tactical.tacticalCommandUnavailableReason(battle, spear, 'charge'));
  spear.zoneId = 'approach';
  assert.equal(tactical.tacticalCommandUnavailableReason(battle, spear, 'charge'), null);
  assert.ok(tactical.tacticalCommandUnavailableReason(battle, bow, 'charge'));
  assert.ok(tactical.tacticalCommandUnavailableReason(battle, civilians, 'advance'));
  assert.ok(tactical.tacticalCommandUnavailableReason(battle, hunter, 'ambush'));
  hunter.ambushed = true;
  assert.equal(tactical.tacticalCommandUnavailableReason(battle, hunter, 'ambush'), null);
}

{
  const state = simulation.newGame(2026071326);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: '조정 토벌군', power: 160, warned: true, siege: true, mode: 'garrison',
  });
  tactical.advanceTacticalPhase(state);
  battle.defenderGroups.forEach(group => { group.zoneId = 'center'; });
  tactical.advanceTacticalPhase(state);
  const mainGroups = battle.raiderGroups.filter(group => group.kind === 'main');
  assert.ok(mainGroups.length >= 3);
  mainGroups.forEach(group => { group.zoneId = 'wall'; group.morale = 100; });
  battle.raiderGroups.filter(group => group.kind !== 'main').forEach(group => { group.intent = 'withdraw'; });
  battle.zones.find(zone => zone.id === 'wall').breached = true;
  assert.equal(tactical.resolveTacticalRound(state), null);
  const artilleryEvent = battle.pendingReport.events.find(event => event.kind === 'artilleryHit' && event.zoneId === 'wall');
  assert.ok(artilleryEvent);
  const artilleryGroup = battle.raiderGroups.find(group => group.unitType === 'court-artillery');
  assert.equal(artilleryEvent.shots?.cannons, Math.max(0, artilleryGroup.count - artilleryGroup.killed),
    'court artillery schedules one cannon sample per surviving gun crew');
  const groupedAdvances = battle.pendingReport.events.filter(event =>
    event.kind === 'advance' && event.zoneId === 'wall' && event.text.includes('교전을 마치고'));
  assert.equal(groupedAdvances.length, 1, 'same-route raider groups share one advance event');
  assert.ok(groupedAdvances[0].text.includes('·'), 'the grouped advance caption lists participating units');
}

{
  const state = simulation.newGame(2026071216);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'charge-formation-test', power: 100, warned: true, siege: false, mode: 'garrison',
  });
  tactical.advanceTacticalPhase(state);
  const spear = battle.defenderGroups.find(group => group.kind === 'militia-spear');
  const bow = battle.defenderGroups.find(group => group.kind === 'militia-bow');
  assert.ok(spear && bow);
  assert.equal(tactical.assignDefenderGroup(state, spear.id, 'approach'), null);
  assert.equal(tactical.assignDefenderGroup(state, bow.id, 'approach'), null);
  tactical.advanceTacticalPhase(state);
  assert.equal(tactical.setTacticalCommand(state, spear.id, 'charge'), null);
  assert.equal(tactical.setTacticalCommand(state, bow.id, 'volley'), null);
  assert.equal(tactical.resolveTacticalRound(state), null);
  const meleeAudioEvent = battle.pendingReport.events.find(event =>
    event.kind === 'melee' && (event.meleeParticipants ?? 0) > 0);
  assert.ok(meleeAudioEvent, 'melee playback carries its engagement size');
  assert.ok(meleeAudioEvent.meleeParticipants >= spear.count,
    'the engagement size includes the charging group');
  assert.ok(
    battle.pendingReport.events.some(event => event.kind === 'melee' && event.float === '돌격!'),
    'melee charge produces a dedicated combat event',
  );
  assert.ok(
    battle.pendingReport.events.some(event => event.kind === 'melee' && event.float === '후열 노출!'),
    'charging melee exposes ranged troops to a flanking strike',
  );
  assert.ok(battle.pendingReport.lines.some(line => line.includes('우회 타격')));
}

{
  const state = simulation.newGame(2026071215);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'defender-advance-test', power: 80, warned: true, siege: false, mode: 'garrison',
  });
  tactical.advanceTacticalPhase(state);
  const advancingGroup = battle.defenderGroups.find(group => group.kind === 'militia-spear');
  assert.ok(advancingGroup);
  assert.equal(tactical.assignDefenderGroup(state, advancingGroup.id, 'center'), null);
  tactical.advanceTacticalPhase(state);
  assert.equal(tactical.setTacticalCommand(state, advancingGroup.id, 'advance'), null);
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(advancingGroup.zoneId, 'center', 'defender advance waits for combat playback');
  assert.ok(
    battle.pendingReport.events.some(event => event.kind === 'advance' && event.side === 'defender'),
    'defender advance is described after the engagement',
  );
  assert.equal(tactical.completeTacticalSimulation(state), null);
  assert.equal(tactical.acknowledgeTacticalReport(state), null);
  assert.equal(advancingGroup.zoneId, 'storehouse', 'defender advances one line after the report');
  assert.equal(advancingGroup.command, 'hold', 'advance is a one-engagement movement command');
}

{
  const state = simulation.newGame(2026071208);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'retreat-test', power: 60, warned: true, siege: false, mode: 'garrison',
  });
  tactical.advanceTacticalPhase(state);
  tactical.advanceTacticalPhase(state);
  const retreatingGroup = battle.defenderGroups.find(group => group.zoneId === 'approach');
  assert.ok(retreatingGroup);
  assert.equal(tactical.setTacticalCommand(state, retreatingGroup.id, 'fallback'), null);
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(retreatingGroup.zoneId, 'approach', 'retreat animation should remain on the current line');
  assert.equal(battle.pendingReport.ended, false, 'retreat movement test requires another engagement');
  assert.equal(tactical.completeTacticalSimulation(state), null);
  assert.equal(tactical.acknowledgeTacticalReport(state), null);
  assert.equal(retreatingGroup.zoneId, 'wall', 'retreating defenders move to the next rear line');
  assert.equal(retreatingGroup.command, 'hold', 'fallback is consumed after movement');
  retreatingGroup.zoneId = 'center';
  assert.match(
    tactical.setTacticalCommand(state, retreatingGroup.id, 'fallback'),
    /물러날 수 없습니다/,
    'the final defensive line has nowhere left to retreat',
  );
}

{
  const state = simulation.newGame(2026071207);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: '변경 마적', power: 40, warned: false, siege: false, mode: 'levy',
  });
  tactical.advanceTacticalPhase(state);
  for (const defender of battle.defenderGroups) {
    assert.equal(tactical.assignDefenderGroup(state, defender.id, 'center'), null);
  }
  tactical.advanceTacticalPhase(state);
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(
    battle.pendingReport.raiderMoraleDelta,
    0,
    'raiders should not lose morale merely for advancing through an undefended zone',
  );
}

{
  const state = simulation.newGame(2026071320);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'flanker-center-pressure-test', power: 90, warned: true, siege: false, mode: 'garrison',
  });
  tactical.advanceTacticalPhase(state);
  battle.defenderGroups.filter(group => group.kind !== 'civilian').forEach(group => { group.zoneId = 'wall'; });
  tactical.advanceTacticalPhase(state);
  const flanker = battle.raiderGroups.find(group => group.kind === 'flankers');
  assert.ok(flanker);
  flanker.zoneId = 'center';
  flanker.power = 90;
  flanker.morale = 100;
  flanker.rearAssault = true;
  flanker.revealed = true;
  flanker.engagementsInZone = 1;
  battle.raiderGroups.filter(group => group !== flanker).forEach(group => { group.intent = 'withdraw'; });
  const center = battle.zones.find(zone => zone.id === 'center');
  center.pressure = 0;
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.notEqual(battle.pendingReport.outcome, 'villageRouted');
  assert.ok(battle.pendingReport.events.some(event =>
    event.kind === 'melee' && event.side === 'raider' && event.groupId === flanker.id &&
    (event.meleeParticipants ?? 0) > 0),
  'a revealed rear assault group keeps attacking after its entry event');
  assert.equal(flanker.intent, 'withdraw', 'a dominant rear assault exits after completing its objective');
  assert.equal(center.pressure, 0, 'a rear-only engagement does not create center pressure');
  assert.equal(center.breached, false, 'flankers cannot rout a civilian-only center through frontal pressure');
}

{
  const zone = {
    id: 'wall', name: 'target allocation wall', kind: 'wall', order: 1,
    pressure: 30, breached: false, defenseBonus: 10, ambushBonus: 0,
    lootRisk: 0, civilianRisk: 10, description: 'target allocation test',
  };
  const defender = (id, weapon, line, command, power) => ({
    id, kind: weapon === 'spear' ? 'militia-spear' : weapon === 'musket' ? 'militia-musket' : 'militia-bow',
    role: 'militia', weapon, readyMuskets: weapon === 'musket' ? 20 : 0,
    label: id, residentIds: Array.from({ length: 20 }, (_, index) => index + 1), count: 20,
    zoneId: zone.id, command, commandSource: 'player', power, wounded: 0, killed: 0, line,
  });
  const raider = (id, line, unitType, intent = 'advance', overrides = {}) => ({
    id, kind: intent === 'loot' ? 'looters' : 'main', unitType, label: id, zoneId: zone.id, line,
    targetZoneId: zone.id, power: 120, count: 30, killed: 0, morale: 100, intent,
    revealed: true, engagementsInZone: 0, ...overrides,
  });
  const defenders = [
    defender('front-spear', 'spear', 'front', 'hold', 80),
    defender('middle-musket', 'musket', 'middle', 'volley', 160),
    defender('rear-bow', 'hornBow', 'rear', 'volley', 120),
  ];
  const attackers = [
    raider('front-main', 'front', 'bandit-vanguard'),
    raider('middle-rider', 'middle', 'bandit-rider'),
    raider('rear-command', 'rear', 'court-artillery'),
  ];
  const input = {
    zone, defenders, attackers, direction: 'frontal', weather: 'clear',
    prepareVolleyApplied: false, evacuateCiviliansApplied: false,
    roundStartingRaiderPower: attackers.reduce((sum, group) => sum + group.power, 0),
  };
  const auto = tacticalEngagement.resolveEngagementExchange({ ...input, rng: () => 0.2 });
  const focused = tacticalEngagement.resolveEngagementExchange({
    ...input, focusTargetGroupId: 'rear-command', rng: () => 0.2,
  });
  const totalKilled = result => result.raiderLosses.reduce((sum, loss) => sum + loss.killed, 0);
  const totalPowerLost = result => attackers.reduce((sum, group) => {
    const loss = result.raiderLosses.find(candidate => candidate.groupId === group.id);
    return sum + group.power - loss.powerAfter;
  }, 0);
  assert.equal(totalKilled(focused), totalKilled(auto), 'focus targeting only redistributes the fixed casualty budget');
  assert.ok(Math.abs(totalPowerLost(focused) - totalPowerLost(auto)) < 1e-9,
    'focus targeting only redistributes the fixed power-loss budget');
  assert.ok(
    focused.raiderLosses.find(loss => loss.groupId === 'rear-command').killed >
      auto.raiderLosses.find(loss => loss.groupId === 'rear-command').killed,
    'reachable ranged troops concentrate more of the fixed budget on the selected rear target',
  );
  assert.ok(
    focused.raiderLosses.find(loss => loss.groupId === 'rear-command').killed <=
      Math.ceil(totalKilled(focused) * 0.7),
    'one focus target cannot receive more than 70% of the casualty budget',
  );
  assert.deepEqual(attackers.map(group => group.count), [30, 30, 30], 'target redistribution never mutates count');
  assert.ok(focused.raiderLosses.every(loss => {
    const group = attackers.find(candidate => candidate.id === loss.groupId);
    return loss.killed >= 0 && loss.killed <= group.count;
  }), 'redistributed killed values remain within immutable group counts');
  const unreachableAuto = tacticalEngagement.resolveEngagementExchange({
    ...input, defenders: defenders.slice(0, 2), rng: () => 0.2,
  });
  const unreachableFocus = tacticalEngagement.resolveEngagementExchange({
    ...input, defenders: defenders.slice(0, 2), focusTargetGroupId: 'rear-command', rng: () => 0.2,
  });
  assert.deepEqual(unreachableFocus.raiderLosses, unreachableAuto.raiderLosses,
    'troops that cannot reach the selected line leave the automatic loss distribution unchanged');

  const civilian = {
    ...defender('protected-civilians', null, 'rear', null, 0),
    kind: 'civilian', role: 'civilian', commandable: false,
  };
  const rearAttacker = raider('rear-flanker', 'rear', 'bandit-rider', 'flank', {
    kind: 'flankers', rearAssault: true,
  });
  assert.equal(tacticalEngagement.chooseTacticalEnemyFocusTarget(
    [...defenders, civilian], [raider('main', 'front', 'bandit-vanguard')], 'frontal', 'wall',
  ), 'front-spear');
  assert.equal(tacticalEngagement.chooseTacticalEnemyFocusTarget(
    [...defenders, { ...defenders[0], id: 'store-guard', command: 'guardStorehouse', zoneId: 'storehouse' }],
    [raider('looter', 'front', 'bandit-looter', 'loot', { zoneId: 'storehouse' })], 'frontal', 'storehouse',
  ), 'store-guard');
  assert.equal(tacticalEngagement.chooseTacticalEnemyFocusTarget(
    [...defenders, civilian], [rearAttacker], 'rear', 'wall',
  ), 'rear-bow');
  assert.equal(tacticalEngagement.chooseTacticalEnemyFocusTarget(
    defenders, [raider('gunner', 'middle', 'court-gunner')], 'frontal', 'wall',
  ), 'middle-musket');
}

{
  const state = simulation.newGame(2026071321);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'guarded-flanker-delay-test', power: 90, warned: true, siege: false, mode: 'garrison',
  });
  tactical.advanceTacticalPhase(state);
  battle.defenderGroups.forEach(group => { group.zoneId = 'storehouse'; });
  tactical.advanceTacticalPhase(state);
  const flanker = battle.raiderGroups.find(group => group.kind === 'flankers');
  assert.ok(flanker);
  flanker.zoneId = 'storehouse';
  flanker.power = 180;
  flanker.morale = 100;
  flanker.engagementsInZone = 0;
  battle.round = 3;
  battle.raiderGroups.filter(group => group !== flanker).forEach(group => { group.intent = 'withdraw'; });
  battle.defenderGroups.forEach(group => { group.command = 'hold'; });
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(flanker.pendingZoneId, undefined, 'a guarded storehouse forces flankers to fight on arrival');
  assert.equal(tactical.completeTacticalSimulation(state), null);
  assert.equal(tactical.acknowledgeTacticalReport(state), null);
  flanker.morale = 100;
  battle.raiderMorale = 100;
  battle.defenderGroups.forEach(group => { group.command = 'hold'; });
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(flanker.pendingZoneId, 'center', 'flankers may continue after fighting one storehouse engagement');
  assert.ok(battle.pendingReport.lines.some(line => line.includes('방책을 우회')));
}

{
  const state = simulation.newGame(2026071322);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'looter-infiltration-test', power: 90, warned: true, siege: false, mode: 'garrison',
  });
  tactical.advanceTacticalPhase(state);
  battle.defenderGroups.forEach(group => { group.zoneId = 'wall'; });
  tactical.advanceTacticalPhase(state);
  const looters = battle.raiderGroups.find(group => group.kind === 'looters');
  assert.ok(looters);
  looters.zoneId = 'wall';
  looters.engagementsInZone = 2;
  looters.morale = 100;
  battle.raiderGroups.filter(group => group !== looters).forEach(group => { group.intent = 'withdraw'; });
  battle.defenderGroups.forEach(group => { group.command = 'hold'; });
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(looters.pendingZoneId, 'storehouse', 'looters infiltrate after waiting at an intact wall');
  assert.ok(battle.pendingReport.lines.some(line => line.includes('방책의 틈')));
  assert.equal(tactical.completeTacticalSimulation(state), null);
  assert.equal(tactical.acknowledgeTacticalReport(state), null);
  battle.defenderGroups.forEach(group => { group.zoneId = 'wall'; group.command = 'hold'; });
  looters.power = 180;
  looters.morale = 100;
  battle.raiderMorale = 100;
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.ok(battle.pendingReport.events.some(event => event.kind === 'loot'), 'infiltrated looters threaten stored supplies');
}

{
  const state = simulation.newGame(2026071323);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'empty-zone-event-test', power: 70, warned: true, siege: false, mode: 'garrison',
  });
  tactical.advanceTacticalPhase(state);
  battle.defenderGroups.forEach(group => { group.zoneId = 'center'; });
  tactical.advanceTacticalPhase(state);
  const main = battle.raiderGroups.find(group => group.kind === 'main');
  assert.ok(main);
  main.zoneId = 'storehouse';
  battle.raiderGroups.filter(group => group !== main).forEach(group => { group.intent = 'withdraw'; });
  assert.equal(tactical.resolveTacticalRound(state), null);
  const storehouseEvents = battle.pendingReport.events.filter(event => event.zoneId === 'storehouse');
  assert.ok(storehouseEvents.some(event => event.kind === 'advance' && event.text.includes('저항 없이')));
  assert.ok(!storehouseEvents.some(event => event.kind === 'melee'), 'empty zones do not play melee captions or sounds');
}

{
  const state = simulation.newGame(2026071324);
  prepareDefenders(state);
  const battle = tactical.createTacticalBattle(state, {
    factionName: 'center-fall-event-test', power: 100, warned: true, siege: false, mode: 'garrison',
  });
  tactical.advanceTacticalPhase(state);
  battle.defenderGroups.forEach(group => { group.zoneId = 'wall'; });
  tactical.advanceTacticalPhase(state);
  const main = battle.raiderGroups.find(group => group.kind === 'main');
  assert.ok(main);
  main.zoneId = 'center';
  main.power = 160;
  main.morale = 100;
  battle.raiderGroups.filter(group => group !== main).forEach(group => { group.intent = 'withdraw'; });
  battle.zones.find(zone => zone.id === 'center').pressure = 90;
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(battle.pendingReport.outcome, 'villageRouted');
  assert.ok(battle.pendingReport.events.some(event =>
    event.kind === 'zoneFall' && event.zoneId === 'center' && event.durationMs >= 900));
}

{
  const wallPressureAfter = defensePowerRatio => {
    const state = simulation.newGame(2026071325 + defensePowerRatio);
    prepareDefenders(state);
    const battle = tactical.createTacticalBattle(state, {
      factionName: 'wall-pressure-balance-test', power: 100, warned: true, siege: false, mode: 'garrison',
    });
    tactical.advanceTacticalPhase(state);
    battle.defenderGroups.forEach(group => { group.zoneId = 'wall'; });
    tactical.advanceTacticalPhase(state);
    const main = battle.raiderGroups.find(group => group.kind === 'main');
    assert.ok(main);
    main.zoneId = 'wall';
    main.power = 100;
    main.count = 25;
    main.morale = 100;
    battle.originalPower = 100;
    battle.raiderGroups.filter(group => group !== main).forEach(group => { group.intent = 'withdraw'; group.power = 0; });
    const wall = battle.zones.find(zone => zone.id === 'wall');
    wall.pressure = 0;
    wall.breached = false;
    const baseDefense = battle.defenderGroups.reduce((sum, group) => sum + group.power * 0.82, 0) *
      (1 + wall.defenseBonus / 100);
    const scale = 100 * defensePowerRatio / Math.max(1, baseDefense);
    battle.defenderGroups.forEach(group => { group.power *= scale; });
    for (let engagement = 0; engagement < 5; engagement++) {
      battle.defenderGroups.forEach(group => { group.command = 'hold'; });
      main.morale = 100;
      battle.raiderMorale = 100;
      assert.equal(tactical.resolveTacticalRound(state), null);
      if (engagement < 4 && !battle.pendingReport.ended) {
        assert.equal(tactical.completeTacticalSimulation(state), null);
        assert.equal(tactical.acknowledgeTacticalReport(state), null);
      } else if (battle.pendingReport.ended) {
        break;
      }
    }
    return { pressure: wall.pressure, breached: wall.breached };
  };
  const equalLine = wallPressureAfter(1);
  const overwhelmingDefense = wallPressureAfter(2);
  assert.ok(equalLine.pressure >= 60, 'equal forces put an intact wall under meaningful five-engagement pressure');
  assert.equal(overwhelmingDefense.breached, false, 'two-to-one defenders still prevent a wall breach');
}

{
  const wallPressureAfter = mixedCommands => {
    const state = simulation.newGame(2026071317);
    prepareDefenders(state);
    const battle = tactical.createTacticalBattle(state, {
      factionName: 'pressure-command-share-test', power: 80, warned: true, siege: false, mode: 'garrison',
    });
    tactical.advanceTacticalPhase(state);
    battle.defenderGroups.forEach(group => { group.zoneId = 'wall'; });
    battle.raiderGroups.forEach(group => { group.zoneId = 'wall'; });
    tactical.advanceTacticalPhase(state);
    battle.defenderGroups.forEach((group, index) => {
      group.command = mixedCommands && index > 0 ? 'volley' : 'hold';
    });
    assert.equal(tactical.resolveTacticalRound(state), null);
    return battle.zones.find(zone => zone.id === 'wall').pressure;
  };
  const allHolding = wallPressureAfter(false);
  const mixedLine = wallPressureAfter(true);
  assert.ok(
    mixedLine > allHolding + 2,
    'one holding unit must not grant the full pressure reduction to an entire mixed defensive line',
  );
}

{
  const runFlankAssault = ({ rearAssault, rearGuard }) => {
    const state = battleSimulation.createBattleSimulation({
      mode: 'garrison', factionName: '변경 마적', power: 120, warned: true, siege: false,
      season: 'winter', weather: 'clear', prepPoints: 0, seed: 2026071330,
      defenders: {
        muskets: 0, bows: 18, spears: 18, unarmedMilitia: 0,
        watchmen: 0, hunters: 0, civilians: 4,
      },
      cannonEmplacements: 0,
    });
    const battle = state.tacticalBattle;
    tactical.advanceTacticalPhase(state);
    const bow = battle.defenderGroups.find(group => group.kind === 'militia-bow');
    const spear = battle.defenderGroups.find(group => group.kind === 'militia-spear');
    assert.ok(bow && spear);
    battle.defenderGroups.forEach(group => {
      group.zoneId = group === bow || group === spear ? 'wall' : 'center';
      group.command = 'hold';
    });
    bow.line = 'rear';
    spear.line = rearGuard ? 'rear' : 'front';
    tactical.advanceTacticalPhase(state);
    const flankers = battle.raiderGroups.find(group => group.kind === 'flankers');
    assert.ok(flankers);
    battle.raiderGroups.forEach(group => {
      group.intent = group === flankers ? 'flank' : 'withdraw';
      if (group !== flankers) group.power = 0;
    });
    Object.assign(flankers, {
      zoneId: 'wall', targetZoneId: rearAssault ? 'wall' : 'center',
      flankPlan: rearAssault ? 'rearAssault' : 'breakthrough', rearAssault,
      revealed: true, count: 200, killed: 0, power: 800, morale: 100, engagementsInZone: 0,
    });
    battle.raiderMorale = 100;
    const wall = battle.zones.find(zone => zone.id === 'wall');
    wall.pressure = 0;
    assert.equal(tactical.resolveTacticalRound(state), null);
    return {
      bowCasualties: bow.wounded + bow.killed,
      spearCasualties: spear.wounded + spear.killed,
      wallPressure: wall.pressure,
      flankersKilled: flankers.killed,
      events: battle.pendingReport.events,
      lines: battle.pendingReport.lines,
    };
  };

  const breakthrough = runFlankAssault({ rearAssault: false, rearGuard: false });
  const exposedRear = runFlankAssault({ rearAssault: true, rearGuard: false });
  const guardedRear = runFlankAssault({ rearAssault: true, rearGuard: true });
  assert.ok(exposedRear.events.some(event => event.kind === 'rearAssault' && event.float === '후방 급습!'));
  assert.ok(exposedRear.bowCasualties > exposedRear.spearCasualties,
    'an unguarded rear assault concentrates casualties on rear ranged troops');
  assert.ok(guardedRear.bowCasualties < exposedRear.bowCasualties,
    'rear-line melee troops shield ranged troops from a rear assault');
  assert.ok(guardedRear.flankersKilled > exposedRear.flankersKilled,
    'rear-line melee troops remove the flankers’ loss-resistance advantage');
  assert.ok(exposedRear.wallPressure <= breakthrough.wallPressure / 2,
    'rear assault flankers contribute no more than half normal wall pressure');
  assert.ok(exposedRear.lines.some(line => line.includes('후방 급습')));
}

{
  const runDefaultScenario = (factionName, power, seed) => {
    const state = battleSimulation.createBattleSimulation({
      mode: 'garrison', factionName, power, warned: true, siege: true,
      season: 'winter', weather: 'clear', prepPoints: 'auto', seed,
      defenders: {
        muskets: 3, bows: 3, spears: 4, unarmedMilitia: 0,
        watchmen: 2, hunters: 3, civilians: 6,
      },
      cannonEmplacements: 0,
    });
    const battle = state.tacticalBattle;
    tactical.advanceTacticalPhase(state);
    tactical.advanceTacticalPhase(state);
    const wallPressure = [];
    while (battle.phase === 'command') {
      assert.equal(tactical.resolveTacticalRound(state), null);
      wallPressure.push(Math.round(battle.zones.find(zone => zone.id === 'wall').pressure));
      if (battle.pendingReport.ended) break;
      assert.equal(tactical.completeTacticalSimulation(state), null);
      assert.equal(tactical.acknowledgeTacticalReport(state), null);
    }
    return {
      factionName,
      outcome: battle.pendingReport?.outcome,
      wallPressure,
      wallBreached: battle.zones.find(zone => zone.id === 'wall').breached,
      centerBreached: battle.zones.find(zone => zone.id === 'center').breached,
      lootEvents: battle.reports.flatMap(report => report.events).filter(event => event.kind === 'loot').length,
    };
  };
  const bandits = runDefaultScenario('변경 마적', 78, 2026071378);
  const court = runDefaultScenario('조정 토벌군', 166, 2026071366);
  assert.ok(Math.max(...bandits.wallPressure) >= 20, 'bandit main force creates meaningful wall pressure');
  assert.equal(bandits.centerBreached, false, 'bandit cavalry alone does not rout the village center');
  assert.ok(bandits.lootEvents >= 1, 'an unattended bandit raid gets at least one looting attempt');
  assert.notEqual(court.outcome, 'defenseSuccess', 'the court punitive force remains a losing matchup by default');
  assert.equal(court.wallBreached, true, 'court artillery and main forces can break the wall within five engagements');
  assert.ok(Math.max(...court.wallPressure) >= 100);
}

for (const optionId of ['militia', 'levy']) {
  const state = simulation.newGame(optionId === 'militia' ? 2026071204 : 2026071205);
  prepareDefenders(state);
  raids.openRaidChoice(state, () => 0.5, true, 12, '변경 마적', false);
  const ids = state.pendingChoice.options.map(option => option.id);
  assert.ok(ids.includes('manual-garrison'));
  assert.ok(ids.includes('manual-levy'));
  assert.ok(ids.includes('militia'));
  assert.ok(ids.includes('levy'));

  raids.resolveRaid(state, optionId, () => 0);
  assert.equal(state.tacticalBattle, null, `${optionId} should remain on the automatic combat path`);
  assert.equal(state.pendingChoice, null);
  assert.ok(state.raidCooldown > 0);
}

{
  const state = simulation.newGame(2026071206);
  prepareDefenders(state);
  raids.openRaidChoice(state, () => 0.5, false, 36, '변경 마적', false);
  raids.resolveRaid(state, 'manual-garrison', () => 0.5);
  assert.ok(state.tacticalBattle);
  assert.equal(state.tacticalBattle.mode, 'garrison');
  assert.equal(state.pendingChoice, null);
}

console.log('tactical battle tests passed');
