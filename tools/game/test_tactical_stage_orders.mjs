import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-tactical-stage-order-tests-'));
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
const battleSimulation = await import(pathToFileURL(join(compiledDir, 'battleSimulation.mjs')).href);
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const tacticalAssault = await import(pathToFileURL(join(compiledDir, 'tacticalAssault.mjs')).href);

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
    seed: 2026072101,
    ...overrides,
  };
}

function enterDeployment(state) {
  if (state.tacticalBattle?.enemyPlan) state.tacticalBattle.enemyPlan.stratagems = [];
  assert.equal(tactical.advanceTacticalPhase(state), null);
  if (state.tacticalBattle.phase === 'preparationExecution') {
    assert.equal(tactical.advanceTacticalPhase(state), null);
  }
  assert.equal(state.tacticalBattle.phase, 'deployment');
  return state.tacticalBattle;
}

function enterCommand(state) {
  const battle = enterDeployment(state);
  tactical.applyAutoDeployTacticalGroups(battle);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(battle.phase, 'command');
  return battle;
}

function closeTo(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, received ${actual}`);
}

{
  const state = battleSimulation.createBattleSimulation(simulationOptions());
  const battle = enterCommand(state);
  const group = battle.defenderGroups.find(candidate =>
    candidate.commandable !== false && candidate.zoneId === 'wall' && candidate.line === 'front');
  assert.ok(group, 'defense fixture must contain an unmounted front-line wall group');

  const origin = { zoneId: group.zoneId, line: group.line };
  const unchanged = JSON.stringify(battle);
  assert.deepEqual(tactical.tacticalStageOrderPreview(battle, group.id, origin), {
    groupId: group.id,
    origin,
    destination: origin,
    command: null,
    powerPenalty: 0,
    travelRounds: 0,
  }, 'dropping on the origin is a selection-only no-op');
  assert.equal(tactical.applyTacticalStageOrder(state, group.id, origin), null);
  assert.equal(JSON.stringify(battle), unchanged, 'origin drop must not replace the current command or mutate state');

  const middle = { zoneId: 'wall', line: 'middle' };
  const beforePreview = JSON.stringify(battle);
  const redeploy = tactical.tacticalStageOrderPreview(battle, group.id, middle);
  assert.equal(JSON.stringify(battle), beforePreview, 'stage order preview must be pure');
  assert.equal(redeploy.command, 'redeploy');
  closeTo(redeploy.powerPenalty, 0.65, 'unmounted redeploy power penalty');
  assert.equal(redeploy.travelRounds, 1);
  assert.equal(tactical.applyTacticalStageOrder(state, group.id, middle), null);
  assert.equal(group.zoneId, 'wall');
  assert.equal(group.line, 'front', 'redeploy does not teleport before the engagement');
  assert.equal(group.pendingLine, 'middle');
  assert.equal(group.command, 'redeploy');

  const illegalLine = { zoneId: 'wall', line: 'rear' };
  const beforeIllegalLine = JSON.stringify(battle);
  assert.match(tactical.tacticalStageOrderUnavailableReason(battle, group.id, illegalLine), /인접한 전열/);
  assert.equal(tactical.tacticalStageOrderPreview(battle, group.id, illegalLine), null);
  assert.match(tactical.applyTacticalStageOrder(state, group.id, illegalLine), /인접한 전열/);
  assert.equal(JSON.stringify(battle), beforeIllegalLine, 'rejected line order must not mutate state');

  const compound = { zoneId: 'storehouse', line: 'middle' };
  assert.match(tactical.tacticalStageOrderUnavailableReason(battle, group.id, compound), /구역과 전열/);

  const fallback = tactical.tacticalStageOrderPreview(battle, group.id, {
    zoneId: 'storehouse', line: 'front',
  });
  assert.equal(fallback.command, 'fallback');
  closeTo(fallback.powerPenalty, 0.78, 'unmounted fallback power penalty');
  assert.equal(tactical.applyTacticalStageOrder(state, group.id, fallback.destination), null);
  assert.equal(group.zoneId, 'wall', 'fallback is reserved until the engagement resolves');
  assert.equal(group.command, 'fallback');
  assert.equal(group.pendingLine, undefined, 'a zone order cancels the prior line order');

  const advance = tactical.tacticalStageOrderPreview(battle, group.id, {
    zoneId: 'approach', line: 'front',
  });
  assert.equal(advance.command, 'advance');
  closeTo(advance.powerPenalty, 0.55, 'unmounted advance power penalty');
  assert.match(tactical.tacticalStageOrderUnavailableReason(battle, group.id, {
    zoneId: 'center', line: 'front',
  }), /인접한 전투 구역/);
}

{
  const state = battleSimulation.createBattleSimulation(simulationOptions({ seed: 2026072102 }));
  const battle = enterDeployment(state);
  const original = battle.defenderGroups.find(group => group.commandable !== false && group.count >= 3);
  assert.ok(original);
  assert.equal(tactical.splitTacticalGroup(state, original.id, 1), null);
  const detached = battle.defenderGroups.find(group =>
    group.id !== original.id && group.deploymentCohortId === original.deploymentCohortId);
  assert.ok(detached);
  const staleId = detached.id;
  assert.equal(tactical.mergeTacticalGroups(state, original.id, detached.id), null);
  tactical.applyAutoDeployTacticalGroups(battle);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  const preview = tactical.tacticalStageOrderPreview(battle, staleId, {
    zoneId: original.zoneId,
    line: original.line,
  });
  assert.equal(preview.groupId, original.id, 'stale split ids resolve through deployment aliases');
}

{
  const state = battleSimulation.createBattleSimulation(simulationOptions({ seed: 2026072105 }));
  const battle = enterCommand(state);
  const group = battle.defenderGroups.find(candidate =>
    candidate.commandable !== false && candidate.zoneId === 'wall' && candidate.line === 'front');
  assert.ok(group);
  const destination = { kind: 'zoneLane', zoneId: 'storehouse', line: 'front' };
  const preview = tactical.tacticalStageMovePreview(state, group.id, destination);
  assert.deepEqual([preview.effect, preview.command, preview.purpose, preview.leavesFrontalBattle], [
    'fallback', 'fallback', null, false,
  ], 'the unified Phase 4 API keeps frontal lane orders in the same preview contract');
  assert.equal(tactical.applyTacticalStageMove(state, group.id, destination), null);
  assert.equal(group.command, 'fallback');
  assert.equal(group.zoneId, 'wall', 'unified frontal movement still waits for round resolution');
}

{
  const state = battleSimulation.createBattleSimulation(simulationOptions({
    scenario: 'banditLair',
    seed: 2026072103,
    defenders: {
      muskets: 1, bows: 1, spears: 3, unarmedMilitia: 0,
      watchmen: 1, hunters: 2, civilians: 0,
    },
  }));
  const battle = enterCommand(state);
  const group = battle.defenderGroups.find(candidate => candidate.commandable !== false && candidate.line === 'front') ??
    battle.defenderGroups.find(candidate => candidate.commandable !== false && candidate.line === 'middle');
  assert.ok(group);
  const destinationLine = group.line === 'front' ? 'middle' : 'rear';
  const destination = { zoneId: group.zoneId, line: destinationLine };
  const preview = tactical.tacticalStageOrderPreview(battle, group.id, destination);
  assert.equal(preview.command, 'redeploy');
  assert.equal(tactical.applyTacticalStageOrder(state, group.id, destination), null);
  assert.equal(group.line, preview.origin.line, 'assault redeploy waits for the round instead of teleporting');
  assert.equal(group.pendingLine, destinationLine);
  assert.equal(group.command, 'redeploy');
  assert.equal(tacticalAssault.resolveAssaultRound(state), null);
  tacticalAssault.applyAssaultReportPositions(battle);
  assert.equal(group.line, destinationLine, 'assault report applies the confirmed adjacent-line order');
  assert.equal(group.pendingLine, undefined);
  assert.equal(group.command, 'hold');
}

{
  const state = battleSimulation.createBattleSimulation(simulationOptions({
    scenario: 'tigerHunt', seed: 2026072104,
  }));
  const battle = enterCommand(state);
  const group = battle.defenderGroups.find(candidate => candidate.commandable !== false);
  assert.ok(group);
  assert.match(tactical.tacticalStageOrderUnavailableReason(battle, group.id, {
    zoneId: group.zoneId, line: group.line,
  }), /기존 길목 이동/,
  'predator hunts keep their dedicated sector movement contract in Phase 4');
}

console.log('tactical stage order tests passed');
