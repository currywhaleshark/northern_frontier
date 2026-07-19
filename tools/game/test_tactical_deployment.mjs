import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-tactical-deployment-tests-'));
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
const battleSimulation = await import(pathToFileURL(join(compiledDir, 'battleSimulation.mjs')).href);
const combatCapabilities = await import(pathToFileURL(join(compiledDir, 'combatCapabilities.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);

function simulationOptions(overrides = {}) {
  return {
    scenario: 'defense',
    mode: 'garrison',
    factionName: '변경 마적',
    power: 60,
    warned: true,
    siege: false,
    season: 'spring',
    weather: 'clear',
    prepPoints: 4,
    defenders: {
      muskets: 2,
      bows: 2,
      spears: 4,
      unarmedMilitia: 2,
      watchmen: 2,
      hunters: 3,
      civilians: 8,
    },
    cannonEmplacements: 0,
    seed: 2026072001,
    ...overrides,
  };
}

function clearEnemyStratagems(state) {
  if (state.tacticalBattle?.enemyPlan) state.tacticalBattle.enemyPlan.stratagems = [];
}

function enterDeployment(state) {
  assert.equal(tactical.advanceTacticalPhase(state), null);
  if (state.tacticalBattle.phase === 'preparationExecution') {
    assert.equal(tactical.advanceTacticalPhase(state), null);
  }
  assert.equal(state.tacticalBattle.phase, 'deployment');
  return state.tacticalBattle;
}

function totals(groups) {
  return {
    residentIds: groups.flatMap(group => group.residentIds).sort((a, b) => a - b),
    count: groups.reduce((sum, group) => sum + group.count, 0),
    power: groups.reduce((sum, group) => sum + group.power, 0),
    readyMuskets: groups.reduce((sum, group) => sum + (group.readyMuskets ?? 0), 0),
  };
}

{
  const state = battleSimulation.createBattleSimulation(simulationOptions());
  const battle = state.tacticalBattle;
  assert.ok(battle);
  const commandable = battle.defenderGroups.filter(group => group.commandable !== false && group.count > 0);
  assert.ok(commandable.length > 0);
  assert.ok(commandable.every(group => battle.deploymentPlacements[group.id] === null));
  assert.ok(commandable.every(group => group.zoneId === ''), 'new battles start with an empty commandable stage');
  const civilians = battle.defenderGroups.find(group => group.kind === 'civilian');
  assert.ok(civilians);
  assert.deepEqual(battle.deploymentPlacements[civilians.id], {
    zoneId: 'center', line: 'rear', fixed: true,
  });
  const view = tactical.tacticalDeploymentView(battle);
  assert.equal(view.waiting.length, commandable.length);
  assert.equal(view.fixed.length, 1);
}

{
  const state = battleSimulation.createBattleSimulation(simulationOptions({ seed: 2026072002 }));
  clearEnemyStratagems(state);
  const battle = enterDeployment(state);
  assert.match(tactical.advanceTacticalPhase(state), /모두 배치/,
    'deployment confirmation rejects commandable waiting cards');
  tactical.applyAutoDeployTacticalGroups(battle);
  for (const group of battle.defenderGroups.filter(group => group.count > 0)) {
    const placement = battle.deploymentPlacements[group.id];
    assert.ok(placement);
    const expectedZone = group.kind === 'civilian'
      ? 'center'
      : group.kind === 'hunter'
        ? 'approach'
        : group.id.includes('-levy') ? 'storehouse' : 'wall';
    assert.equal(placement.zoneId, expectedZone, `${group.label} auto-deploys to its legacy zone`);
    assert.equal(placement.line, group.kind === 'healer' || group.kind === 'civilian' ? 'rear' : group.line);
  }
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(battle.phase, 'command');
}

{
  const state = battleSimulation.createBattleSimulation(simulationOptions({ seed: 2026072003 }));
  clearEnemyStratagems(state);
  const battle = enterDeployment(state);
  const original = battle.defenderGroups.find(group => group.commandable !== false && group.count >= 4 && !group.featuredResidents?.length);
  assert.ok(original);
  const cohortId = original.deploymentCohortId;
  const before = totals([original]);
  assert.equal(tactical.splitTacticalGroup(state, original.id, 1), null);
  const cohort = battle.defenderGroups.filter(group => group.deploymentCohortId === cohortId);
  assert.equal(cohort.length, 2);
  assert.deepEqual(totals(cohort), before, 'ordinary split preserves residents, power, and musket readiness');
  assert.equal(tactical.splitTacticalGroup(state, original.id, 1), null);
  const cappedCohort = battle.defenderGroups.filter(group => group.deploymentCohortId === cohortId);
  assert.equal(cappedCohort.length, 3);
  assert.deepEqual(totals(cappedCohort), before);
  assert.match(tactical.splitTacticalGroup(state, original.id, 1), /최대 3개 조/);
  const detached = cappedCohort.filter(group => group.id !== original.id);
  assert.ok(detached.every(group => battle.deploymentPlacements[group.id] === null));
  for (const group of detached) assert.equal(tactical.mergeTacticalGroups(state, original.id, group.id), null);
  assert.deepEqual(totals([original]), before, 'ordinary merge restores the exact original totals');
  for (const group of detached) assert.equal(tactical.resolveTacticalDeploymentGroupId(battle, group.id), original.id);
}

{
  const state = simulation.newGame(2026072004);
  state.resources.spears = 4;
  state.residents.forEach(resident => {
    resident.job = 'idle';
    resident.alive = true;
    resident.sick = false;
    resident.health = 100;
    resident.quarantinedUntil = 0;
  });
  const fighters = state.residents.filter(resident => !resident.stage).slice(0, 4);
  assert.equal(fighters.length, 4);
  fighters.forEach(resident => {
    resident.job = 'militia';
    resident.origin = undefined;
  });
  fighters[0].name = '아라개';
  fighters[0].special = 'jurchenWarrior';
  for (const resident of fighters.slice(1)) state.weaponAssignments[resident.id] = 'spear';
  const battle = tactical.createTacticalBattle(state, {
    factionName: '변경 마적', power: 60, warned: true, siege: false, mode: 'garrison',
  });
  if (battle.enemyPlan) battle.enemyPlan.stratagems = [];
  const named = battle.defenderGroups.find(group => group.featuredResidents?.some(featured => featured.residentId === fighters[0].id));
  assert.ok(named);
  assert.equal(named.label, '아라개의 창 수비병');
  assert.equal(named.count, 4);
  assert.equal(named.special, 'jurchenWarrior');
  assert.equal(named.featuredResidents[0].spriteScale, 1.15);
  const namedTotals = totals([named]);
  assert.equal(combatCapabilities.tacticalGroupCapabilities(named).has('ambush'), true,
    'the featured resident trait applies to the whole named group');
  enterDeployment(state);
  const companionId = named.residentIds.find(id => id !== fighters[0].id);
  assert.ok(companionId);
  assert.equal(tactical.splitFeaturedTacticalGroup(state, named.id, fighters[0].id, [companionId]), null);
  const detachment = battle.defenderGroups.find(group => group.featuredDetachment === true);
  assert.ok(detachment);
  assert.equal(detachment.label, '아라개의 조 분리');
  assert.deepEqual(detachment.residentIds, [fighters[0].id, companionId]);
  assert.equal(detachment.special, 'jurchenWarrior');
  assert.equal(combatCapabilities.tacticalGroupCapabilities(detachment).has('ambush'), true);
  assert.equal(named.special, undefined);
  assert.equal(combatCapabilities.tacticalGroupCapabilities(named).has('ambush'), false,
    'the featured trait moves with the named detachment instead of staying on the former group');
  assert.deepEqual(totals([named, detachment]), namedTotals,
    'named detachment movement preserves the featured resident personal power exactly once');
}

{
  const state = battleSimulation.createBattleSimulation(simulationOptions({ seed: 2026072005 }));
  clearEnemyStratagems(state);
  const battle = state.tacticalBattle;
  const civiliansBefore = battle.defenderGroups.find(group => group.kind === 'civilian').count;
  assert.equal(tactical.spendPreparationAction(state, 'musterMilitia'), null);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  const militia = battle.defenderGroups.find(group => group.kind === 'militia-unarmed' && group.id === 'militia-unarmed-mustered');
  assert.ok(militia);
  assert.ok(militia.count > 0);
  assert.equal(battle.deploymentPlacements[militia.id], null, 'muster creates a waiting militia card');
  assert.ok(battle.defenderGroups.find(group => group.kind === 'civilian').count < civiliansBefore);
}

{
  const withoutStrategy = battleSimulation.createBattleSimulation(simulationOptions({
    scenario: 'banditLair', seed: 2026072006,
  }));
  const battle = enterDeployment(withoutStrategy);
  const hunter = battle.defenderGroups.find(group => group.kind === 'hunter');
  assert.ok(hunter);
  assert.match(tactical.placeTacticalDeploymentGroup(withoutStrategy, hunter.id, {
    zoneId: 'lairWall', line: hunter.line,
  }), /진입로/);

  const withStrategy = battleSimulation.createBattleSimulation(simulationOptions({
    scenario: 'banditLair', seed: 2026072007,
  }));
  const preparedBattle = withStrategy.tacticalBattle;
  assert.equal(tactical.spendPreparationAction(withStrategy, 'preInfiltration'), null);
  assert.match(tactical.spendPreparationAction(withStrategy, 'nightAssault'), /함께 준비/);
  enterDeployment(withStrategy);
  const preparedHunter = preparedBattle.defenderGroups.find(group => group.kind === 'hunter');
  assert.ok(preparedHunter);
  assert.equal(tactical.placeTacticalDeploymentGroup(withStrategy, preparedHunter.id, {
    zoneId: 'lairWall', line: preparedHunter.line,
  }), null);
  assert.deepEqual(preparedBattle.deploymentPlacements[preparedHunter.id], {
    zoneId: 'lairWall', line: preparedHunter.line, hidden: true,
  });
  assert.equal(tactical.splitTacticalGroup(withStrategy, preparedHunter.id, 1), null);
  const secondHunter = preparedBattle.defenderGroups.find(group =>
    group.kind === 'hunter' && group.id !== preparedHunter.id);
  assert.ok(secondHunter);
  assert.match(tactical.placeTacticalDeploymentGroup(withStrategy, secondHunter.id, {
    zoneId: 'lairWall', line: secondHunter.line,
  }), /1개 조/);
  const nonHunter = preparedBattle.defenderGroups.find(group => group.commandable !== false && group.kind !== 'hunter');
  assert.ok(nonHunter);
  assert.match(tactical.placeTacticalDeploymentGroup(withStrategy, nonHunter.id, {
    zoneId: 'lairWall', line: nonHunter.line,
  }), /진입로/);
}

{
  const ambushed = battleSimulation.createBattleSimulation(simulationOptions({ seed: 2026072008 }));
  ambushed.tacticalBattle.enemyPlan.stratagems = [{
    id: 'nightApproach', revealed: true, counterLevel: 0, counter: {},
  }];
  assert.equal(tactical.advanceTacticalPhase(ambushed), null);
  assert.equal(ambushed.tacticalBattle.phase, 'preparationExecution');
  assert.equal(ambushed.tacticalBattle.deploymentForced, 'nightAmbush');
  assert.ok(ambushed.tacticalBattle.defenderGroups
    .filter(group => group.commandable !== false && group.count > 0)
    .every(group => ambushed.tacticalBattle.deploymentPlacements[group.id] != null));
  assert.equal(tactical.advanceTacticalPhase(ambushed), null);
  assert.equal(ambushed.tacticalBattle.phase, 'command', 'uncountered night assault skips manual deployment');

  const watched = battleSimulation.createBattleSimulation(simulationOptions({ seed: 2026072009 }));
  watched.tacticalBattle.enemyPlan.stratagems = [{
    id: 'nightApproach', revealed: true, counterLevel: 0, counter: {},
  }];
  assert.equal(tactical.spendPreparationAction(watched, 'torchWatch'), null);
  assert.equal(tactical.advanceTacticalPhase(watched), null);
  assert.equal(tactical.advanceTacticalPhase(watched), null);
  assert.equal(watched.tacticalBattle.phase, 'deployment', 'torch watch keeps the normal deployment stage');
  assert.equal(watched.tacticalBattle.deploymentForced, undefined);
}

{
  assert.equal(saveLoad.CURRENT_SCHEMA_VERSION, 25);
  assert.equal(saveLoad.migrateV24ToV25({ schemaVersion: 24, marker: 'kept' }).marker, 'kept');
  const state = battleSimulation.createBattleSimulation(simulationOptions({ seed: 2026072010 }));
  clearEnemyStratagems(state);
  const battle = enterDeployment(state);
  tactical.applyAutoDeployTacticalGroups(battle);
  const legacy = JSON.parse(JSON.stringify(battle));
  delete legacy.deploymentPlacements;
  delete legacy.deploymentSerial;
  delete legacy.deploymentGroupAliases;
  for (const group of legacy.defenderGroups) {
    delete group.deploymentCohortId;
    delete group.baseLabel;
    delete group.featuredResidents;
    delete group.featuredDetachment;
  }
  const migrated = saveLoad.migrateTacticalBattle(legacy, state);
  assert.ok(migrated);
  assert.ok(migrated.defenderGroups.every(group => migrated.deploymentPlacements[group.id] != null),
    'legacy in-progress battles synthesize placements from their stored positions');
  for (const group of migrated.defenderGroups) {
    assert.equal(migrated.deploymentPlacements[group.id].zoneId, group.zoneId);
    assert.equal(migrated.deploymentPlacements[group.id].line, group.line);
    assert.ok(group.deploymentCohortId);
  }
}

console.log('tactical deployment tests passed');
