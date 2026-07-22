import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-tactical-stage-route-move-tests-'));
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
const routes = await import(pathToFileURL(join(compiledDir, 'tacticalRoutes.mjs')).href);

function options(overrides = {}) {
  return {
    scenario: 'defense', mode: 'garrison', factionName: '변경 마적', power: 90,
    warned: true, siege: false, season: 'winter', weather: 'clear', prepPoints: 6,
    defenders: {
      muskets: 1, bows: 1, spears: 8, unarmedMilitia: 0,
      watchmen: 0, hunters: 0, civilians: 0,
    },
    cannonEmplacements: 0, enemyFlankRoute: 'none', seed: 2026072301,
    ...overrides,
  };
}

function enterCommandWithRoute(state, side = 'left') {
  const battle = state.tacticalBattle;
  assert.equal(tactical.toggleTacticalFlankRoutePreparation(state, side), null);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  if (battle.phase === 'preparationExecution') assert.equal(tactical.advanceTacticalPhase(state), null);
  tactical.applyAutoDeployTacticalGroups(battle);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(battle.phase, 'command');
  return battle;
}

function route(battle, side = 'left') {
  const found = battle.flankRoutes.find(candidate => candidate.side === side);
  assert.ok(found);
  return found;
}

function combatGroup(battle) {
  const found = battle.defenderGroups.find(group => group.commandable !== false && group.weapon === 'spear') ??
    battle.defenderGroups.find(group => group.commandable !== false);
  assert.ok(found);
  return found;
}

function advanceAndResolve(state) {
  const battle = state.tacticalBattle;
  const advances = routes.advanceTacticalRouteTransits(battle);
  return routes.resolveTacticalRouteRound(battle, advances, state.weather, () => 0.5);
}

{
  const state = battleSimulation.createBattleSimulation(options());
  const battle = enterCommandWithRoute(state);
  const group = combatGroup(battle);
  group.zoneId = 'approach';
  group.line = 'front';
  const left = route(battle);
  const entry = { kind: 'routeNode', routeId: left.id, node: 'approachGate' };

  const beforePreview = JSON.stringify(battle);
  const preview = tactical.tacticalStageMovePreview(state, group.id, entry);
  assert.equal(JSON.stringify(battle), beforePreview, 'route preview is pure');
  assert.deepEqual({
    effect: preview.effect,
    purpose: preview.purpose,
    travelRounds: preview.travelRounds,
    leavesFrontalBattle: preview.leavesFrontalBattle,
  }, { effect: 'routeEntry', purpose: 'block', travelRounds: 0, leavesFrontalBattle: true });
  assert.match(tactical.tacticalStageMoveUnavailableReason(state, group.id, {
    kind: 'routeNode', routeId: 'missing-route', node: 'approachGate',
  }), /알 수 없는 우회로/);
  assert.equal(tactical.applyTacticalStageMove(state, group.id, entry), null);
  assert.equal(group.zoneId, '', 'route entry immediately removes the group from frontal combat');
  assert.deepEqual({ node: group.routeTransit.node, destinationNode: group.routeTransit.destinationNode }, {
    node: 'approachGate', destinationNode: 'approachGate',
  });
  assert.match(tactical.tacticalStageMoveUnavailableReason(state, group.id, {
    kind: 'routeNode', routeId: left.id, node: 'storehouseGate',
  }), /인접한 물리 노드/);

  const middle = { kind: 'routeNode', routeId: left.id, node: 'middle' };
  const middlePreview = tactical.tacticalStageMovePreview(state, group.id, middle);
  assert.equal(middlePreview.effect, 'block');
  assert.equal(middlePreview.travelRounds, 1);
  assert.equal(tactical.applyTacticalStageMove(state, group.id, middle), null);
  const middleReservation = routes.tacticalRouteStageView(battle)
    .find(view => view.routeId === left.id).groups.find(candidate => candidate.groupId === group.id);
  assert.deepEqual({
    node: middleReservation.node,
    destinationNode: middleReservation.destinationNode,
    movementReserved: middleReservation.movementReserved,
  }, { node: 'approachGate', destinationNode: 'middle', movementReserved: true },
  'the entrance-to-blocking-point order keeps a visible movement reservation arrow');
  advanceAndResolve(state);
  assert.equal(group.routeTransit.node, 'middle');
  assert.equal(group.routeTransit.purpose, 'block');

  const storehouseExit = { kind: 'routeNode', routeId: left.id, node: 'storehouseGate' };
  const transfer = tactical.tacticalStageMovePreview(state, group.id, storehouseExit);
  assert.deepEqual([transfer.effect, transfer.purpose, transfer.travelRounds], ['block', 'move', 1]);
  assert.equal(tactical.applyTacticalStageMove(state, group.id, storehouseExit), null);
  const gateResolution = advanceAndResolve(state);
  assert.deepEqual(gateResolution.arrivals, [], 'physical gate movement does not choose an exit purpose implicitly');
  assert.equal(group.routeTransit.node, 'storehouseGate');
  assert.equal(group.routeTransit.purpose, 'block');
  const storehouseJoin = routes.tacticalRouteExitDestination(battle, group.id, left.id, 'storehouse');
  assert.deepEqual(storehouseJoin, { kind: 'zoneLane', zoneId: 'storehouse', line: 'front' });
  const joinPreview = tactical.tacticalStageMovePreview(state, group.id, storehouseJoin);
  assert.deepEqual([joinPreview.effect, joinPreview.purpose], ['zoneTransfer', 'transfer']);
  assert.equal(tactical.applyTacticalStageMove(state, group.id, storehouseJoin), null);
  const transferResolution = advanceAndResolve(state);
  assert.deepEqual(transferResolution.arrivals.map(arrival => [arrival.groupId, arrival.destinationZoneId, arrival.rearAssault]), [
    [group.id, 'storehouse', false],
  ]);
  assert.equal(group.zoneId, 'storehouse');
  assert.equal(group.routeTransit, undefined);
}

{
  const state = battleSimulation.createBattleSimulation(options({ seed: 2026072306 }));
  const battle = enterCommandWithRoute(state);
  const group = combatGroup(battle);
  const left = route(battle);
  group.zoneId = 'approach';
  assert.equal(tactical.applyTacticalStageMove(state, group.id, {
    kind: 'routeNode', routeId: left.id, node: 'approachGate',
  }), null);
  assert.equal(tactical.applyTacticalStageMove(state, group.id, {
    kind: 'routeNode', routeId: left.id, node: 'middle',
  }), null);
  advanceAndResolve(state);
  const returnDestination = routes.tacticalRouteReturnDestination(battle, group.id);
  assert.deepEqual(returnDestination, {
    kind: 'routeNode', routeId: left.id, node: 'approachGate',
  }, 'the explicit return choice points one physical node back toward the entry zone');
  const returnPreview = tactical.tacticalStageMovePreview(state, group.id, returnDestination);
  assert.deepEqual([returnPreview.effect, returnPreview.purpose], ['block', 'move']);
  assert.equal(tactical.applyTacticalStageMove(state, group.id, returnDestination), null);
  const returnGateResolution = advanceAndResolve(state);
  assert.deepEqual(returnGateResolution.arrivals, []);
  const approachJoin = routes.tacticalRouteExitDestination(battle, group.id, left.id, 'approach');
  const approachPreview = tactical.tacticalStageMovePreview(state, group.id, approachJoin);
  assert.deepEqual([approachPreview.effect, approachPreview.purpose], ['return', 'return']);
  assert.equal(tactical.applyTacticalStageMove(state, group.id, approachJoin), null);
  const returnResolution = advanceAndResolve(state);
  assert.deepEqual(returnResolution.arrivals.map(arrival => [arrival.destinationZoneId, arrival.rearAssault]), [
    ['approach', false],
  ]);
  assert.equal(group.zoneId, 'approach');
  assert.equal(group.routeTransit, undefined, 'returning exits the route into the original battlefield');
}

{
  const state = battleSimulation.createBattleSimulation(options({ seed: 2026072307 }));
  const battle = enterCommandWithRoute(state);
  const group = combatGroup(battle);
  const left = route(battle);
  group.routeTransit = {
    routeId: left.id, purpose: 'block', node: 'middle', destinationNode: 'middle', step: 1,
    destinationZoneId: 'wall', destinationLine: 'front', originZoneId: 'wall',
    visibleToDefender: true, startedRound: battle.round, elapsedRounds: 0, roundsRequired: 1, engagements: 0,
  };
  group.zoneId = '';
  assert.deepEqual(routes.tacticalRouteReturnDestination(battle, group.id), {
    kind: 'routeNode', routeId: left.id, node: 'storehouseGate',
  }, 'legacy non-gate origins safely fall back to the friendly storehouse exit');
}

{
  const state = battleSimulation.createBattleSimulation(options({ seed: 2026072309 }));
  const battle = enterCommandWithRoute(state);
  const group = combatGroup(battle);
  const left = route(battle);
  group.zoneId = '';
  group.routeTransit = {
    routeId: left.id, purpose: 'block', node: 'middle', destinationNode: 'middle', step: 1,
    destinationZoneId: 'storehouse', destinationLine: 'front', originZoneId: 'approach',
    returnZoneId: 'storehouse', visibleToDefender: true, startedRound: battle.round,
    elapsedRounds: 0, roundsRequired: 1, engagements: 0,
  };
  const enemyExit = routes.tacticalRouteExitDestination(battle, group.id, left.id, 'wall');
  assert.deepEqual(enemyExit, { kind: 'zoneLane', zoneId: 'wall', line: 'rear' });
  const beforeOrder = JSON.stringify(group);
  assert.match(tactical.tacticalStageMoveUnavailableReason(state, group.id, enemyExit), /방책에 급습할 생존한 적이 없습니다/,
    'the rear-raid choice is disabled when no active enemy remains at the wall');
  assert.equal(tactical.tacticalStageMovePreview(state, group.id, enemyExit), null);
  assert.match(tactical.applyTacticalStageMove(state, group.id, enemyExit), /방책에 급습할 생존한 적이 없습니다/,
    'confirmation revalidates the wall target instead of reserving an empty raid');
  assert.equal(JSON.stringify(group), beforeOrder, 'a rejected empty-wall raid does not mutate the group');
}

{
  const state = battleSimulation.createBattleSimulation(options({ seed: 2026072302 }));
  const battle = enterCommandWithRoute(state);
  const group = combatGroup(battle);
  const left = route(battle);
  group.zoneId = 'storehouse';
  group.line = 'rear';

  assert.equal(tactical.applyTacticalStageMove(state, group.id, {
    kind: 'routeNode', routeId: left.id, node: 'storehouseGate',
  }), null);
  const returnPreview = tactical.tacticalStageMovePreview(state, group.id, {
    kind: 'zoneLane', zoneId: 'storehouse', line: 'rear',
  });
  assert.deepEqual([returnPreview.effect, returnPreview.purpose, returnPreview.travelRounds], ['return', 'return', 1]);
  assert.equal(tactical.applyTacticalStageMove(state, group.id, returnPreview.destination), null);
  assert.equal(group.routeTransit.destinationLine, 'rear');
  const returnResolution = advanceAndResolve(state);
  assert.equal(returnResolution.arrivals[0].rearAssault, false);
  assert.equal(group.zoneId, 'storehouse');
  assert.equal(group.line, 'rear');

  assert.equal(tactical.applyTacticalStageMove(state, group.id, {
    kind: 'routeNode', routeId: left.id, node: 'storehouseGate',
  }), null);
  assert.equal(tactical.applyTacticalStageMove(state, group.id, {
    kind: 'routeNode', routeId: left.id, node: 'middle',
  }), null);
  advanceAndResolve(state);
  const rearTarget = battle.raiderGroups.find(candidate => !candidate.routeTransit && candidate.power > 0);
  assert.ok(rearTarget);
  rearTarget.zoneId = 'wall';
  rearTarget.intent = 'advance';
  const reverseRaidDestination = routes.tacticalRouteExitDestination(battle, group.id, left.id, 'wall');
  const reverseRaid = tactical.tacticalStageMovePreview(state, group.id, reverseRaidDestination);
  assert.deepEqual([reverseRaid.effect, reverseRaid.purpose], ['rearRaid', 'flank']);
  assert.equal(tactical.applyTacticalStageMove(state, group.id, reverseRaid.destination), null);
  const raidResolution = advanceAndResolve(state);
  assert.deepEqual(raidResolution.arrivals.map(arrival => [arrival.destinationZoneId, arrival.rearAssault]), [
    ['wall', true],
  ]);
  assert.equal(group.zoneId, 'wall');
  assert.equal(group.line, 'rear');
  assert.equal(group.rearRaidRound, battle.round);
  const arrivalRound = group.rearRaidRound;
  battle.round += 1;
  assert.equal(group.rearRaidRound, arrivalRound,
    'the defender remains marked behind the enemy on the following engagement');
}

{
  const state = battleSimulation.createBattleSimulation(options({ weather: 'blizzard', seed: 2026072303 }));
  const battle = enterCommandWithRoute(state);
  const group = combatGroup(battle);
  const left = route(battle);
  group.zoneId = 'approach';
  assert.equal(tactical.applyTacticalStageMove(state, group.id, {
    kind: 'routeNode', routeId: left.id, node: 'approachGate',
  }), null);
  const middle = { kind: 'routeNode', routeId: left.id, node: 'middle' };
  const preview = tactical.tacticalStageMovePreview(state, group.id, middle);
  assert.equal(preview.travelRounds, 2, 'blizzard reuses the route timing calculation for the preview');
  assert.equal(tactical.applyTacticalStageMove(state, group.id, middle), null);
  advanceAndResolve(state);
  assert.equal(group.routeTransit.node, 'approachGate', 'the actual move honors the same first-round delay');
  assert.equal(group.routeTransit.elapsedRounds, 1);
  advanceAndResolve(state);
  assert.equal(group.routeTransit.node, 'middle');
  assert.equal(group.routeTransit.purpose, 'block');
}

{
  const state = battleSimulation.createBattleSimulation(options({ enemyFlankRoute: 'left', seed: 2026072304 }));
  const battle = enterCommandWithRoute(state);
  const group = combatGroup(battle);
  const left = route(battle);
  const flanker = battle.raiderGroups.find(candidate => candidate.routeTransit?.routeId === left.id);
  assert.ok(flanker);
  group.zoneId = 'storehouse';
  assert.equal(tactical.applyTacticalStageMove(state, group.id, {
    kind: 'routeNode', routeId: left.id, node: 'storehouseGate',
  }), null);
  assert.equal(tactical.applyTacticalStageMove(state, group.id, {
    kind: 'routeNode', routeId: left.id, node: 'middle',
  }), null);
  const contact = advanceAndResolve(state);
  assert.equal(contact.engagements.length, 1,
    'a defender advancing from the storehouse side meets the approach-side AI at the physical middle');
  assert.equal(contact.engagements[0].routeId, left.id);
}

{
  const state = battleSimulation.createBattleSimulation(options({ seed: 2026072305 }));
  const battle = enterCommandWithRoute(state);
  const group = combatGroup(battle);
  const left = route(battle);
  group.zoneId = 'approach';
  const destination = { kind: 'routeNode', routeId: left.id, node: 'approachGate' };
  assert.ok(tactical.tacticalStageMovePreview(state, group.id, destination));
  left.openedByDefender = false;
  left.defenderIntel = 'unknown';
  const beforeApply = JSON.stringify(group);
  assert.match(tactical.applyTacticalStageMove(state, group.id, destination), /확인되지 않은 우회로/,
    'mutation revalidates a previewed destination at confirmation time');
  assert.equal(JSON.stringify(group), beforeApply);
}

{
  const state = battleSimulation.createBattleSimulation(options({ seed: 2026072308 }));
  const battle = enterCommandWithRoute(state);
  const group = combatGroup(battle);
  const left = route(battle);
  group.zoneId = 'storehouse';
  group.line = 'rear';
  assert.equal(tactical.applyTacticalStageMove(state, group.id, {
    kind: 'routeNode', routeId: left.id, node: 'storehouseGate',
  }), null);

  assert.deepEqual(routes.tacticalRouteGateDestination(
    battle, group.id, left.id, 'storehouseGate',
  ), { kind: 'zoneLane', zoneId: 'storehouse', line: 'rear' },
  'dropping on the friendly gate arrow exits back into the origin battlefield');
  const oppositeExit = routes.tacticalRouteGateDestination(battle, group.id, left.id, 'approachGate');
  assert.deepEqual(oppositeExit, { kind: 'routeNode', routeId: left.id, node: 'approachGate' });
  assert.match(tactical.tacticalStageMoveUnavailableReason(state, group.id, oppositeExit), /보병은.*인접한 물리 노드/,
    'foot groups must cross through the middle over two separate physical move orders');

  const wallRaid = routes.tacticalRouteExitDestination(battle, group.id, left.id, 'wall');
  assert.deepEqual(wallRaid, { kind: 'zoneLane', zoneId: 'wall', line: 'rear' });
  assert.match(tactical.tacticalStageMoveUnavailableReason(state, group.id, wallRaid), /보병은.*중간 지점/,
    'foot groups cannot skip the route middle even after choosing a wall assault purpose');

  const mountedRearTarget = battle.raiderGroups.find(candidate => !candidate.routeTransit && candidate.power > 0);
  assert.ok(mountedRearTarget);
  mountedRearTarget.zoneId = 'wall';
  mountedRearTarget.intent = 'advance';
  group.mount = 'horse';
  const mountedPreview = tactical.tacticalStageMovePreview(state, group.id, wallRaid);
  assert.deepEqual([mountedPreview.effect, mountedPreview.travelRounds], ['rearRaid', 1],
    'mounted groups may choose a direct wall raid from the opposite gate');
  assert.match(mountedPreview.warning, /방책 방어선의 적 후열을 급습/);
  assert.equal(tactical.applyTacticalStageMove(state, group.id, wallRaid), null);
  const reservedView = routes.tacticalRouteStageView(battle)
    .find(view => view.routeId === left.id).groups.find(candidate => candidate.groupId === group.id);
  assert.deepEqual({
    node: reservedView.node,
    destinationNode: reservedView.destinationNode,
    movementReserved: reservedView.movementReserved,
  }, { node: 'storehouseGate', destinationNode: 'approachGate', movementReserved: true },
  'route stage view exposes the confirmed movement reservation for its arrow');
  const resolution = advanceAndResolve(state);
  assert.deepEqual(resolution.arrivals.map(arrival => [arrival.destinationZoneId, arrival.rearAssault]), [
    ['wall', true],
  ], 'the mounted direct order reaches the enemy rear after one route round');
}

console.log('tactical stage route move tests passed');
