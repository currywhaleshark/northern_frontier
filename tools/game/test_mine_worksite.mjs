import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-mine-worksite-tests-'));
  for (const file of readdirSync(srcDir).filter(name => name.endsWith('.ts'))) {
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
const load = name => import(pathToFileURL(join(compiledDir, `${name}.mjs`)).href);
const simulation = await load('simulation');
const miningSites = await load('miningSites');
const selectionActions = await load('selectionActions');
const inventory = await load('inventory');
const workerSlots = await load('workerSlots');
const { CONFIG } = await load('config');

function prepareState(seed) {
  const state = simulation.newGame(seed);
  state.rank = 'bo';
  for (const resource of Object.keys(state.resources)) state.resources[resource] = 1000;
  state.exploration = { explored: state.map.map(row => row.map(() => true)) };
  return state;
}

function clearMineralArea(state, x, y, radius = CONFIG.minerals.mineWorkRadius + 1) {
  for (let ty = y - radius; ty <= y + radius; ty++) {
    for (let tx = x - radius; tx <= x + radius; tx++) {
      const tile = state.map[ty]?.[tx];
      if (!tile || tile.buildingId != null) continue;
      tile.terrain = 'plain';
      tile.hasIron = false;
      tile.hasSilver = false;
      tile.mineralRemaining = 0;
    }
  }
}

function setDeposit(state, x, y, { iron = false, amount = 20 } = {}) {
  const tile = state.map[y][x];
  tile.terrain = 'rock';
  tile.hasIron = iron;
  tile.hasSilver = false;
  tile.mineralRemaining = amount;
  tile.buildingId = null;
  return tile;
}

function addBuiltMine(state, x, y) {
  const tile = state.map[y][x];
  tile.terrain = 'plain';
  tile.buildingId = null;
  const mine = {
    id: state.nextBuildingId++, type: 'mine', x, y,
    progress: 99, built: true, fieldGrowth: 0,
  };
  state.buildings.push(mine);
  tile.buildingId = mine.id;
  return mine;
}

{
  const state = prepareState(2026071718);
  const x = 8;
  const y = 8;
  clearMineralArea(state, x, y);

  assert.match(
    simulation.tryPlaceBuilding(state, 'mine', x, y),
    /발견된 광상/,
    'open land without a known nearby deposit is rejected',
  );

  const deposit = setDeposit(state, x + CONFIG.minerals.mineWorkRadius, y, { iron: true });
  state.exploration.explored[deposit.y][deposit.x] = false;
  assert.match(
    simulation.tryPlaceBuilding(state, 'mine', x, y),
    /발견된 광상/,
    'an unexplored deposit does not reveal itself through placement validation',
  );

  state.exploration.explored[deposit.y][deposit.x] = true;
  assert.ok(simulation.tryPlaceBuilding(state, 'mine', deposit.x, deposit.y), 'direct placement on ore is rejected');
  assert.equal(simulation.tryPlaceBuilding(state, 'mine', x, y), null, 'open land at the radius edge is valid');
}

{
  const state = prepareState(2026071719);
  const x = 12;
  const y = 12;
  clearMineralArea(state, x, y);
  const deposit = setDeposit(state, x + 2, y, { amount: 12 });
  const outside = setDeposit(state, x + CONFIG.minerals.mineWorkRadius + 1, y, { iron: true, amount: 30 });
  const mine = addBuiltMine(state, x, y);

  assert.equal(miningSites.servingMineForTile(state, deposit)?.id, mine.id);
  assert.equal(miningSites.servingMineForTile(state, outside), null, 'deposit outside the radius is not served');
  assert.deepEqual(
    miningSites.mineMineralSummary(state, mine),
    { deposits: 1, stone: 12, iron: 0, silver: 0 },
    'the inspector summary only counts deposits inside the work area',
  );

  const miner = state.residents[0];
  for (const resident of state.residents) resident.alive = resident.id === miner.id;
  Object.assign(miner, {
    alive: true, sick: false, health: 100, hunger: 100, warmth: 100, morale: 70,
    job: 'miner', x, y, px: x, py: y, phase: 'rest', path: [], workTimer: 0,
    targetId: null, carrying: {}, assignedBuildingId: null,
  });
  assert.equal(workerSlots.assignResidentToBuilding(state, miner.id, mine.id), null);

  for (let tick = 0; tick < CONFIG.agents.subticksPerDay * 7; tick++) simulation.advanceTick(state);
  assert.ok(deposit.mineralRemaining < 12, 'the miner walks to and extracts from a nearby deposit');
  assert.equal(outside.mineralRemaining, 30, 'the miner never extracts from outside the work radius');
  assert.ok(inventory.buildingStock(mine, 'stone') > 0, 'the miner unloads extracted stone at the mine');

  state.silverVein = {
    status: 'sealed', x: deposit.x, y: deposit.y, discoveredDay: state.day, minedTotal: 0,
  };
  assert.equal(
    selectionActions.getBuildingActions(state, mine)[0]?.id,
    'silver-break-seal',
    'silver-vein actions belong to the nearby serving mine rather than the deposit tile',
  );
}

console.log('mine worksite tests passed');
