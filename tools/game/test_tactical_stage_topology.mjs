import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-tactical-stage-topology-tests-'));
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
const routes = await import(pathToFileURL(join(compiledDir, 'tacticalRoutes.mjs')).href);

function options(overrides = {}) {
  return {
    scenario: 'defense', mode: 'garrison', factionName: '무대 토폴로지 시험군', power: 90,
    warned: true, siege: false, season: 'spring', weather: 'clear', prepPoints: 6,
    defenders: { muskets: 2, bows: 2, spears: 4, unarmedMilitia: 1, watchmen: 0, hunters: 0, civilians: 6 },
    cannonEmplacements: 0, enemyFlankRoute: 'left', seed: 2026072301,
    ...overrides,
  };
}

{
  const state = battleSimulation.createBattleSimulation(options());
  const battle = state.tacticalBattle;
  const topology = routes.tacticalStageTopology(battle);
  const zoneStages = topology.stages.filter(stage => stage.kind === 'zone');
  const routeStages = topology.stages.filter(stage => stage.kind === 'route');

  assert.equal(zoneStages.length, battle.zones.length,
    'formal route stages never enter the frontal pressure and loot zone collection');
  assert.equal(routeStages.length, 2, 'left and right routes are first-class display stages');
  assert.equal(topology.links.length, 4, 'each route links once to approach and once to storehouse');
  for (const stage of routeStages) {
    const links = topology.links.filter(link => link.routeId === stage.routeId);
    assert.deepEqual(links.map(link => [link.zoneStageId.zoneId, link.routeNode]), [
      ['approach', 'approachGate'], ['storehouse', 'storehouseGate'],
    ]);
    assert.deepEqual(stage.nodes.map(node => node.node), ['approachGate', 'middle', 'storehouseGate']);
  }
  assert.deepEqual(topology.selectedFallback, { kind: 'zone', zoneId: battle.currentZoneId });
}

{
  const state = battleSimulation.createBattleSimulation(options());
  const battle = state.tacticalBattle;
  const left = battle.flankRoutes.find(route => route.side === 'left');
  const flanker = battle.raiderGroups.find(group => group.routeTransit?.routeId === left.id);
  assert.ok(left && flanker);

  left.defenderIntel = 'unknown';
  let view = routes.tacticalRouteStageView(battle).find(stage => stage.routeId === left.id);
  assert.equal(view.display, 'hidden');
  assert.equal(view.accessible, false);
  assert.equal(view.control, 'neutral', 'hidden route control does not reveal that an enemy is present');
  assert.deepEqual(view.groups, [], 'hidden route payload contains no group IDs, labels, counts, or exact occupied nodes');
  assert.equal('expectedArrivalRounds' in view, false);

  left.defenderIntel = 'suspected';
  view = routes.tacticalRouteStageView(battle).find(stage => stage.routeId === left.id);
  assert.equal(view.display, 'suspected');
  assert.equal(view.accessible, false);
  assert.equal(view.control, 'neutral', 'suspected route control remains non-authoritative');
  assert.deepEqual(view.groups, [], 'suspected route payload still contains no exact group or node occupancy');
  assert.deepEqual(view.expectedArrivalRounds, [1, 3]);

  left.defenderIntel = 'revealed';
  view = routes.tacticalRouteStageView(battle).find(stage => stage.routeId === left.id);
  const flankerView = view.groups.find(group => group.groupId === flanker.id);
  assert.equal(view.accessible, true);
  assert.equal(flankerView.node, 'approachGate');
  assert.equal(flankerView.side, 'raider');
  assert.equal(flankerView.commandable, false);
}

{
  const routeIds = new Set(['flank-left']);
  const forward = routes.migrateTacticalRouteTransit({
    routeId: 'flank-left', purpose: 'raid', step: 2,
    originZoneId: 'approach', destinationZoneId: 'wall',
  }, routeIds, 4);
  assert.deepEqual({
    purpose: forward.purpose,
    node: forward.node,
    step: forward.step,
    destinationZoneId: forward.destinationZoneId,
    destinationLine: forward.destinationLine,
  }, {
    purpose: 'flank', node: 'storehouseGate', step: 2,
    destinationZoneId: 'storehouse', destinationLine: 'rear',
  }, 'legacy approach-to-wall raids migrate onto the physical storehouse exit');

  const reverse = routes.migrateTacticalRouteTransit({
    routeId: 'flank-left', purpose: 'return', step: 0,
    originZoneId: 'storehouse', destinationZoneId: 'approach', destinationLine: 'middle',
  }, routeIds, 4);
  assert.equal(reverse.node, 'storehouseGate');
  assert.equal(reverse.step, 0);

  const nodeWins = routes.migrateTacticalRouteTransit({
    routeId: 'flank-left', purpose: 'transfer', node: 'approachGate', step: 0,
    originZoneId: 'storehouse', destinationZoneId: 'approach', destinationLine: 'front',
  }, routeIds, 4);
  assert.equal(nodeWins.step, 2, 'the physical node is canonical when a compatibility step disagrees');
}

console.log('tactical stage topology tests passed');
