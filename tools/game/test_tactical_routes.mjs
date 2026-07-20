import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-tactical-route-tests-'));
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
    warned: true, siege: false, season: 'spring', weather: 'clear', prepPoints: 6,
    defenders: { muskets: 2, bows: 2, spears: 4, unarmedMilitia: 1, watchmen: 0, hunters: 0, civilians: 6 },
    cannonEmplacements: 0, enemyFlankRoute: 'left', seed: 2026072201,
    ...overrides,
  };
}

function route(battle, side) {
  return battle.flankRoutes.find(candidate => candidate.side === side);
}

{
  const state = battleSimulation.createBattleSimulation(options());
  const battle = state.tacticalBattle;
  assert.deepEqual(battle.flankRoutes.map(candidate => [candidate.side, candidate.terrain]), [
    ['left', 'woodedRidge'], ['right', 'riverBank'],
  ], 'every defense battle owns two stable non-zone flank routes');
  assert.equal(route(battle, 'left').openedByRaider, true, 'rear maneuver locks its route during battle creation');
  assert.equal(route(battle, 'right').openedByRaider, false);
  assert.equal(battle.enemyPlan.flankRouteSide, 'left');
  const flanker = battle.raiderGroups.find(group => group.kind === 'flankers' && group.flankPlan === 'rearAssault');
  assert.ok(flanker?.routeTransit, 'rear maneuver group starts at a real route entrance');
  assert.equal(flanker.routeTransit.routeId, route(battle, 'left').id);
  assert.equal(flanker.routeTransit.step, 0);
  assert.equal(flanker.rearAssault, false, 'route entrance is not already a rear engagement');
  assert.equal(battle.zones.some(zone => zone.id === route(battle, 'left').id), false,
    'flank routes remain separate from pressure/loot battle zones');
}

{
  const state = battleSimulation.createBattleSimulation(options({ enemyFlankRoute: 'none' }));
  const battle = state.tacticalBattle;
  const startingPoints = battle.prepPoints;
  assert.deepEqual(tactical.tacticalFlankRoutePreparationView(state).map(option =>
    [option.side, option.cost, option.selected]), [['left', 2, false], ['right', 2, false]]);
  assert.equal(tactical.toggleTacticalFlankRoutePreparation(state, 'left'), null);
  assert.equal(route(battle, 'left').openedByDefender, true);
  assert.equal(route(battle, 'left').defenderIntel, 'revealed');
  assert.equal(battle.prepPoints, startingPoints - 2);
  assert.equal(battle.prepActions.find(action => action.id === 'openFlankRoute').selected, true);
  assert.equal(tactical.toggleTacticalFlankRoutePreparation(state, 'right'), null);
  assert.equal(battle.prepPoints, startingPoints - 4, 'opening both routes costs two points each');
  assert.equal(tactical.toggleTacticalFlankRoutePreparation(state, 'left'), null);
  assert.equal(battle.prepPoints, startingPoints - 2, 'undo refunds exactly one route cost');
  assert.equal(tactical.spendPreparationAction(state, 'openFlankRoute'), '열 우회로의 좌·우 방향을 먼저 선택하십시오.');
}

{
  const plan = {
    objective: 'breakthrough', objectiveRevealed: true, stratagemPoints: 2, flankRouteSide: 'right', intelLevel: 4,
    stratagems: [{ id: 'rearManeuver', revealed: true, counterLevel: 2 }],
  };
  const revealed = routes.createTacticalFlankRoutes(plan);
  assert.equal(revealed.find(candidate => candidate.side === 'right').defenderIntel, 'revealed');
  plan.stratagems.push({ id: 'nightApproach', revealed: true, counterLevel: 0 });
  const obscured = routes.createTacticalFlankRoutes(plan);
  assert.equal(obscured.find(candidate => candidate.side === 'right').defenderIntel, 'suspected',
    'night approach lowers enemy route intel by one step');
}

{
  const left = { terrain: 'woodedRidge' };
  const right = { terrain: 'riverBank' };
  assert.equal(routes.tacticalRouteRoundsRequired({ unitType: 'court-cavalry' }, right, 'clear'), 1);
  assert.equal(routes.tacticalRouteRoundsRequired({ unitType: 'court-cavalry' }, left, 'clear'), 2,
    'wooded ridge caps mounted route speed');
  assert.equal(routes.tacticalRouteRoundsRequired({ unitType: 'nimacha-spearman' }, left, 'clear'), 2);
  assert.equal(routes.tacticalRouteRoundsRequired({ unitType: 'court-cavalry' }, right, 'thawFlood'), 2);
  assert.equal(routes.tacticalRouteRoundsRequired({ unitType: 'nimacha-spearman' }, left, 'blizzard'), 3);
}

{
  const state = battleSimulation.createBattleSimulation(options({ factionName: '니마차 우디캐' }));
  const battle = state.tacticalBattle;
  const flanker = battle.raiderGroups.find(group => group.routeTransit);
  assert.ok(flanker);
  const flankRoute = battle.flankRoutes.find(candidate => candidate.id === flanker.routeTransit.routeId);
  flankRoute.defenderIntel = 'unknown';
  routes.syncTacticalRouteVisibility(battle);
  const hiddenBefore = routes.tacticalFlankRouteView(battle).find(view => view.route.id === flankRoute.id);
  assert.equal(hiddenBefore.display, 'hidden');
  assert.deepEqual(hiddenBefore.transits, []);
  const advance = routes.advanceTacticalRouteTransits(battle)[0];
  assert.equal(advance.toStep, 1);
  assert.equal(flankRoute.control, 'raider');
  assert.equal(flanker.routeTransit.step, 1, 'hidden units still progress internally instead of teleporting');
  assert.deepEqual(routes.tacticalFlankRouteView(battle).find(view => view.route.id === flankRoute.id).transits, [],
    'unknown route view never leaks the real internal step');
  flankRoute.openedByDefender = true;
  routes.syncTacticalRouteVisibility(battle);
  const revealedView = routes.tacticalFlankRouteView(battle).find(view => view.route.id === flankRoute.id);
  assert.equal(revealedView.display, 'revealed');
  assert.equal(revealedView.transits[0].step, 1, 'revealing a route exposes the same existing transit state');
  assert.equal(routes.advanceTacticalRouteTransits(battle)[0].toStep, 2);
}

{
  const state = battleSimulation.createBattleSimulation(options({ factionName: '니마차 우디캐' }));
  const battle = state.tacticalBattle;
  battle.enemyPlan.stratagems = battle.enemyPlan.stratagems.filter(stratagem => stratagem.id === 'rearManeuver');
  routes.syncTacticalRouteVisibility(battle);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  if (battle.phase === 'preparationExecution') assert.equal(tactical.advanceTacticalPhase(state), null);
  tactical.applyAutoDeployTacticalGroups(battle);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  const flanker = battle.raiderGroups.find(group => group.routeTransit);
  assert.ok(flanker);
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(flanker.routeTransit.step, 1);
  assert.equal(flanker.engagementsInZone, 0,
    'a route group contributes to neither frontal combat nor frontal engagement counters');
  assert.deepEqual(battle.pendingReport.routeAdvances.map(advance => ({
    groupId: advance.groupId, fromStep: advance.fromStep, toStep: advance.toStep,
  })), [{ groupId: flanker.id, fromStep: 0, toStep: 1 }],
  'the round report retains the exact movement beat for frontend playback and save restoration');
}

{
  const migrated = routes.migrateTacticalFlankRoutes([
    { side: 'left', openedByDefender: true, openedByRaider: false, control: 'bogus', defenderIntel: 'unknown' },
  ]);
  assert.equal(migrated.length, 2);
  assert.equal(migrated[0].openedByDefender, true);
  assert.equal(migrated[0].defenderIntel, 'revealed', 'stored visibility is derived again instead of trusted');
  assert.equal(migrated[0].control, 'neutral');
  assert.equal(routes.migrateTacticalRouteTransit({ routeId: 'missing', step: 1 }, new Set(['flank-left']), 2), undefined);
}

{
  const state = battleSimulation.createBattleSimulation(options({
    defenders: { muskets: 0, bows: 0, spears: 12, unarmedMilitia: 0, watchmen: 0, hunters: 0, civilians: 0 },
  }));
  const battle = state.tacticalBattle;
  assert.equal(tactical.toggleTacticalFlankRoutePreparation(state, 'left'), null);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  if (battle.phase === 'preparationExecution') assert.equal(tactical.advanceTacticalPhase(state), null);
  tactical.applyAutoDeployTacticalGroups(battle);
  const spears = battle.defenderGroups.find(group => group.weapon === 'spear');
  assert.ok(spears);
  assert.equal(tactical.placeTacticalRouteBlocker(state, spears.id, 'left'), null);
  assert.equal(spears.routeTransit.purpose, 'block');
  assert.equal(spears.routeTransit.step, 1, 'a deployed blocker occupies the route middle without travel time');
  assert.equal(battle.deploymentPlacements[spears.id].routeId, route(battle, 'left').id);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  battle.raiderGroups.filter(group => !group.routeTransit).forEach(group => { group.intent = 'withdraw'; });
  const pressureBefore = battle.zones.map(zone => zone.pressure);
  assert.equal(tactical.resolveTacticalRound(state), null);
  assert.equal(battle.pendingReport.routeEngagements.length, 1,
    'a crossing raider and prepared blocker produce a dedicated route engagement');
  assert.equal(battle.pendingReport.routeEngagements[0].routeId, route(battle, 'left').id);
  assert.deepEqual(battle.zones.map(zone => zone.pressure), pressureBefore,
    'route-only combat never creates frontal zone pressure');
  assert.deepEqual(battle.pendingReport.loot, {}, 'route-only combat cannot loot before an exit arrival');
}

{
  const state = battleSimulation.createBattleSimulation(options({ enemyFlankRoute: 'none' }));
  const battle = state.tacticalBattle;
  assert.equal(tactical.toggleTacticalFlankRoutePreparation(state, 'right'), null);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  if (battle.phase === 'preparationExecution') assert.equal(tactical.advanceTacticalPhase(state), null);
  tactical.applyAutoDeployTacticalGroups(battle);
  const spears = battle.defenderGroups.find(group => group.weapon === 'spear');
  assert.ok(spears);
  assert.equal(tactical.placeTacticalRouteBlocker(state, spears.id, 'right'), null);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(tactical.setTacticalCommand(state, spears.id, 'flankRoute'), null);
  assert.equal(spears.routeTransit.purpose, 'raid');
  assert.equal(spears.routeTransit.step, 0);
  const targetZoneId = spears.routeTransit.destinationZoneId;
  const candidates = battle.raiderGroups.slice(0, 2);
  assert.equal(candidates.length, 2);
  candidates[0].zoneId = targetZoneId;
  candidates[0].unitType = 'nimacha-spearman';
  candidates[0].routeTransit = undefined;
  candidates[1].zoneId = targetZoneId;
  candidates[1].unitType = 'court-archer';
  candidates[1].line = 'rear';
  candidates[1].routeTransit = undefined;
  const first = routes.advanceTacticalRouteTransits(battle);
  const firstResolution = routes.resolveTacticalRouteRound(battle, first, state.weather, () => 0.5);
  assert.equal(firstResolution.arrivals.length, 0);
  assert.ok(spears.routeTransit, 'foot raiders stay absent from frontal combat during route travel');
  const second = routes.advanceTacticalRouteTransits(battle);
  const secondResolution = routes.resolveTacticalRouteRound(battle, second, state.weather, () => 0.5);
  assert.deepEqual(secondResolution.arrivals.map(arrival => [arrival.groupId, arrival.side, arrival.rearAssault]), [
    [spears.id, 'defender', true],
  ]);
  assert.equal(spears.routeTransit, undefined);
  assert.equal(spears.rearRaidRound, battle.round);
  assert.equal(spears.targetGroupId, candidates[1].id,
    'player rear raids prioritize exposed ranged units over ordinary melee targets');
}

{
  const state = battleSimulation.createBattleSimulation(options({
    power: 180,
    defenders: { muskets: 1, bows: 0, spears: 0, unarmedMilitia: 0, watchmen: 0, hunters: 0, civilians: 0 },
  }));
  const battle = state.tacticalBattle;
  tactical.toggleTacticalFlankRoutePreparation(state, 'left');
  tactical.advanceTacticalPhase(state);
  if (battle.phase === 'preparationExecution') tactical.advanceTacticalPhase(state);
  tactical.applyAutoDeployTacticalGroups(battle);
  const blocker = battle.defenderGroups.find(group => group.weapon === 'musket');
  const flanker = battle.raiderGroups.find(group => group.routeTransit);
  assert.ok(blocker && flanker);
  flanker.power = 220;
  flanker.count = Math.max(flanker.count, 20);
  flanker.unitType = 'bandit-rider';
  const originZoneId = battle.deploymentPlacements[blocker.id].zoneId;
  assert.equal(tactical.placeTacticalRouteBlocker(state, blocker.id, 'left'), null);
  tactical.advanceTacticalPhase(state);
  const advances = routes.advanceTacticalRouteTransits(battle);
  const resolution = routes.resolveTacticalRouteRound(battle, advances, state.weather, () => 0.5);
  assert.equal(resolution.engagements[0].outcome, 'raiderBreakthrough');
  assert.equal(blocker.routeTransit, undefined);
  assert.equal(blocker.zoneId, originZoneId, 'a broken blocker returns to its pre-route deployment zone');
  assert.equal(flanker.routeTransit.step, 1, 'a route winner enters the rear only on the following step');
  const nextAdvances = routes.advanceTacticalRouteTransits(battle);
  const arrival = routes.resolveTacticalRouteRound(battle, nextAdvances, state.weather, () => 0.5);
  assert.equal(arrival.arrivals[0].groupId, flanker.id);
  assert.equal(flanker.rearAssault, true);
}

{
  const state = battleSimulation.createBattleSimulation(options({ factionName: '니마차 우디캐' }));
  const battle = state.tacticalBattle;
  const flanker = battle.raiderGroups.find(group => group.routeTransit);
  assert.ok(flanker);
  const first = routes.advanceTacticalRouteTransits(battle);
  routes.resolveTacticalRouteRound(battle, first, state.weather, () => 0.5);
  const second = routes.advanceTacticalRouteTransits(battle);
  const arrival = routes.resolveTacticalRouteRound(battle, second, state.weather, () => 0.5);
  assert.equal(arrival.arrivals[0].groupId, flanker.id);
  assert.equal(flanker.routeTransit, undefined);
  assert.equal(flanker.rearAssault, true, 'enemy exit arrival feeds the existing rear-engagement path');
  assert.equal(flanker.engagementsInZone, 0, 'rear reveal and first contact remain pending until the zone exchange');
}

console.log('tactical route contract tests passed');
