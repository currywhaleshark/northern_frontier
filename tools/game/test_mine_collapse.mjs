import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const srcDir = new URL('../../src/game/', import.meta.url);
const outDir = mkdtempSync(join(tmpdir(), 'northern-mine-collapse-tests-'));
for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
  const source = readFileSync(new URL(file, srcDir), 'utf8');
  let output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) =>
    /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
  writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
}

const simulation = await import(pathToFileURL(join(outDir, 'simulation.mjs')).href);
const collapse = await import(pathToFileURL(join(outDir, 'mineCollapse.mjs')).href);
const disasters = await import(pathToFileURL(join(outDir, 'disasters.mjs')).href);
const subsurface = await import(pathToFileURL(join(outDir, 'subsurfaceVeins.mjs')).href);

function collapseState(seed) {
  const state = simulation.newGame(seed);
  state.rank = 'bu';
  const vein = subsurface.oreVeins(seed, state.map[0].length, state.map.length)[0];
  assert.ok(vein, 'test seed must provide an ore vein');
  const mine = {
    id: state.nextBuildingId++,
    type: 'deepMine',
    x: vein.cx,
    y: vein.cy,
    w: 2,
    h: 2,
    built: true,
    progress: 18,
    fieldGrowth: 0,
    inventory: {},
  };
  state.buildings.push(mine);
  const miners = state.residents.slice(0, 2);
  for (const resident of miners) {
    resident.job = 'miner';
    resident.assignedBuildingId = mine.id;
    resident.sick = false;
    resident.health = 100;
  }
  return { state, mine, miners, vein };
}

{
  const { state, mine, vein } = collapseState(202607301);
  state.weather = 'clear';
  const fullRisk = collapse.mineCollapseDailyChance(state, mine);
  state.oreVeinRemaining[vein.id] = Math.max(1, vein.capacity * 0.08);
  const depletedRisk = collapse.mineCollapseDailyChance(state, mine);
  state.weather = 'rain';
  const wetRisk = collapse.mineCollapseDailyChance(state, mine);
  assert.ok(depletedRisk > fullRisk, 'depleted veins must be more dangerous than full veins');
  assert.ok(wetRisk > depletedRisk, 'rain must increase collapse risk');
}

{
  const { state, mine, miners } = collapseState(202607302);
  assert.equal(collapse.startMineCollapse(state, mine, () => 0.5, true), true);
  const warning = state.pendingDisasters[0];
  assert.equal(warning.choiceId, 'warning');
  for (const resident of miners) resident.assignedBuildingId = null;
  state.day = warning.resolveDay;
  disasters.advancePendingDisasters(state);
  assert.equal(state.pendingDisasters.length, 0, 'an empty warned mine resolves without a rescue phase');
  assert.equal(miners.some(resident => resident.trappedInMineId != null), false);
  assert.equal(mine.repairCause, 'mineCollapse');
  assert.equal(state.pendingChoice, null);
}

{
  const { state, mine, miners } = collapseState(202607303);
  assert.equal(collapse.startMineCollapse(state, mine, () => 0.25, false), true);
  assert.equal(state.pendingChoice?.kind, 'mineCollapse');
  assert.equal(state.pendingDisasters[0].trappedResidentIds.length, miners.length);
  assert.ok(miners.every(resident => resident.trappedInMineId === mine.id));
  collapse.resolveMineCollapseChoice(state, 'urgent');
  const rescue = state.pendingDisasters[0];
  assert.equal(rescue.choiceId, 'urgent');
  assert.ok(
    collapse.mineCollapseSurvivalChance({ ...rescue, choiceId: 'urgent' }) >
      collapse.mineCollapseSurvivalChance({ ...rescue, choiceId: 'careful' }),
    'faster rescue must preserve a higher trapped-worker survival chance',
  );
  state.day = rescue.resolveDay;
  disasters.advancePendingDisasters(state);
  assert.equal(state.pendingDisasters.length, 0);
  assert.ok(miners.every(resident => resident.trappedInMineId == null));
  assert.equal(miners.filter(resident => resident.alive).length +
    miners.filter(resident => !resident.alive).length, miners.length);
  assert.ok(state.log.some(entry => entry.text.includes('갱도 구조가 끝났습니다')));
}

{
  const normalized = disasters.normalizePendingDisasters([{
    id: 'mineCollapse',
    choiceId: 'urgent',
    startedDay: 10,
    resolveDay: 12,
    targetBuildingIds: [4],
    trappedResidentIds: [8, 8, -1, 'bad'],
  }]);
  assert.deepEqual(normalized[0].trappedResidentIds, [8],
    'save normalization must deduplicate and reject invalid trapped resident ids');
}

console.log('mine collapse disaster checks passed');
