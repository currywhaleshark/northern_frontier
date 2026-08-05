import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-wall-stage-p5-'));
  for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
    let output = ts.transpileModule(readFileSync(new URL(file, srcDir), 'utf8'), {
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
const siegeModule = await import(pathToFileURL(join(compiledDir, 'siege.mjs')).href);
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const deployment = await import(pathToFileURL(join(compiledDir, 'tacticalDeployment.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);

function wallSiegeState(seed) {
  const state = simulation.newGame(seed);
  state.pendingChoice = null;
  state.battle = null;
  state.tacticalBattle = null;
  state.buildings = [];
  const gate = {
    id: state.nextBuildingId++, type: 'gate', gateWallType: 'stoneWall', x: 12, y: 12,
    progress: 999, built: true, fieldGrowth: 0,
    structureIntegrity: 130, structureIntegrityMax: 260,
  };
  state.buildings.push(gate);
  state.residents.slice(0, 10).forEach((resident, index) => Object.assign(resident, {
    alive: true,
    sick: false,
    health: 100,
    job: index < 8 ? 'militia' : 'hunter',
    assignedBuildingId: null,
  }));
  state.raiders = {
    x: 12, y: 10, px: 12, py: 10, path: [], power: 70, size: 6,
    faction: '성벽전 시험 마적', warned: true, spotted: true, siege: true,
    speed: 0, trail: [], phase: 'approaching',
  };
  state.siegeState = {
    phase: 'wallCombat', faction: state.raiders.faction, raiderPower: state.raiders.power,
    enemySupply: 6, enemySupplyEstimate: { min: 5, max: 7 }, intelLevel: 2, warned: true,
    stance: 'wall', startedDay: state.day - 1, lastProcessedDay: state.day,
    lastStanceChangeDay: state.day, evacuationDeadlineTick: 0,
    defenderIds: state.residents.slice(0, 10).map(resident => resident.id), strandedResidentIds: [],
    plunderTargetIds: [], plunderedTargetIds: [], plunderPath: [], loot: { wood: 10 },
    protectedInterior: ['12,13'], topologyRevision: state.defenseTopologyRevision,
    breachTargetId: gate.id,
  };
  return { state, gate };
}

function enterCommandPhase(state) {
  const battle = state.tacticalBattle;
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(battle.phase, 'deployment');
  tactical.applyAutoDeployTacticalGroups(battle);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(battle.phase, 'command');
  return battle;
}

{
  const { state, gate } = wallSiegeState(2026080502);
  assert.equal(siegeModule.startTacticalWallBattle(state), null);
  const battle = state.tacticalBattle;
  assert.equal(battle.defenseStage, 'wallBreach');
  assert.equal(battle.wallStageRoundLimit, 3);
  assert.equal(battle.currentZoneId, 'wall');
  assert.ok(battle.raiderGroups.every(group => group.zoneId === 'wall' && group.routeTransit == null));
  assert.deepEqual(battle.flankRoutes, [], 'the wall cross-section has no abstract flank route stage');
  assert.equal(battle.zones.find(zone => zone.id === 'wall').wallSection.buildingId, gate.id);

  assert.equal(tactical.advanceTacticalPhase(state), null);
  const commandable = battle.defenderGroups.find(group => group.commandable !== false);
  assert.match(
    deployment.tacticalDeploymentPlacementUnavailableReason(battle, commandable.id, {
      zoneId: 'storehouse', line: commandable.line,
    }),
    /돌파 지점/,
  );
  tactical.applyAutoDeployTacticalGroups(battle);
  assert.ok(battle.defenderGroups.filter(group => group.commandable !== false)
    .every(group => group.zoneId === 'wall'));
  assert.equal(tactical.advanceTacticalPhase(state), null);

  battle.enemyPlan.stratagems = [];
  const wallZone = battle.zones.find(zone => zone.id === 'wall');
  wallZone.pressure = 99;
  for (const group of battle.defenderGroups.filter(group => group.commandable !== false)) group.command = 'fallback';
  assert.equal(tactical.resolveTacticalRound(state), null);
  const breachReport = battle.pendingReport;
  assert.equal(breachReport.stageTransition, 'villageDefense');
  assert.equal(breachReport.ended, false);
  assert.equal(breachReport.buildingsDamaged, 0,
    'the map wall breach is not also queued as random building damage');
  const casualtySnapshot = battle.defenderGroups.map(group => [group.id, group.wounded, group.killed]);
  const reportCount = battle.reports.length;
  assert.equal(tactical.completeTacticalSimulation(state), null);
  assert.equal(tactical.acknowledgeTacticalReport(state), null);

  assert.equal(battle.defenseStage, 'villageDefense');
  assert.equal(battle.phase, 'deployment');
  assert.equal(battle.villageStageStartRound, 2);
  assert.equal(battle.reports.length, reportCount);
  assert.deepEqual(battle.defenderGroups.map(group => [group.id, group.wounded, group.killed]), casualtySnapshot,
    'wall-stage casualties survive the village-defense transition');
  assert.equal(gate.structureIntegrity, 0);
  assert.equal(gate.breached, true);
  assert.ok(battle.raiderGroups.filter(group => group.intent !== 'withdraw')
    .every(group => group.zoneId === 'storehouse' || group.zoneId === 'center'));
  assert.match(
    deployment.tacticalDeploymentPlacementUnavailableReason(battle, commandable.id, {
      zoneId: 'wall', line: commandable.line,
    }),
    /성벽이 무너진 뒤/,
  );

  const migrated = saveLoad.migrateTacticalBattle(JSON.parse(JSON.stringify(battle)), state);
  assert.equal(migrated.defenseStage, 'villageDefense');
  assert.equal(migrated.villageStageStartRound, 2);
  assert.equal(migrated.reports[0].stageTransition, 'villageDefense');
  assert.deepEqual(migrated.defenderGroups.map(group => [group.id, group.wounded, group.killed]), casualtySnapshot);

  const woodBeforeFinish = state.resources.wood;
  battle.reports.push({
    ...breachReport,
    round: battle.round,
    summary: '마을 안쪽 방어선에서 적을 물리쳤습니다.',
    lines: [], events: [], loot: {}, buildingsDamaged: 0,
    wounded: 0, killed: 0, raidersKilled: 0,
    villageMoraleDelta: 0, raiderMoraleDelta: 0,
    ended: true, stageTransition: undefined, outcome: 'defenseSuccess', positionsApplied: true,
  });
  battle.pendingReport = battle.reports.at(-1);
  battle.phase = 'finished';
  tactical.finishTacticalBattle(state);
  assert.equal(state.siegeState, null, 'finishing the two-stage defense closes the long siege exactly once');
  assert.equal(state.raiders, null);
  assert.equal(state.resources.wood, woodBeforeFinish + 6,
    'repelling the siege recovers the configured share of prior non-food plunder');
}

{
  const { state, gate } = wallSiegeState(2026080503);
  assert.equal(siegeModule.startTacticalWallBattle(state), null);
  const battle = enterCommandPhase(state);
  battle.wallStageRoundLimit = 1;
  battle.enemyPlan.stratagems = [];
  for (const group of battle.defenderGroups.filter(group => group.commandable !== false)) group.command = 'hold';
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(battle.pendingReport.outcome, 'defenseSuccess');
  assert.equal(battle.pendingReport.ended, true);
  assert.equal(battle.pendingReport.stageTransition, undefined);
  assert.equal(gate.breached, undefined, 'holding through the wall-stage limit leaves the map wall intact');
}

console.log('tactical wall-stage P5 tests passed');
