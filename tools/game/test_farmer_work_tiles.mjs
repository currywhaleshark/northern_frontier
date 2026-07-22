import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-farmer-work-tiles-'));
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
const agents = await import(pathToFileURL(join(compiledDir, 'agents.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const farmTiles = await import(pathToFileURL(join(compiledDir, 'farmWorkTiles.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const workerSlots = await import(pathToFileURL(join(compiledDir, 'workerSlots.mjs')).href);

const plot = { type: 'field', x: 10, y: 20, w: 2, h: 2 };
assert.deepEqual(farmTiles.farmWorkTilePath(plot), [
  { x: 10, y: 20 }, { x: 11, y: 20 }, { x: 11, y: 21 }, { x: 10, y: 21 },
]);
const split = farmTiles.farmWorkTilesByResident(plot, [20, 10]);
assert.deepEqual(split.get(10), [{ x: 10, y: 20 }, { x: 11, y: 20 }]);
assert.deepEqual(split.get(20), [{ x: 11, y: 21 }, { x: 10, y: 21 }]);
assert.equal(new Set([...split.values()].flat().map(tile => `${tile.x},${tile.y}`)).size, 4,
  'two farmers cover all four cells without sharing an assigned cell');
assert.deepEqual(farmTiles.farmWorkTileForTick(plot, [10, 20], 10, 0), { x: 10, y: 20 });
assert.deepEqual(farmTiles.farmWorkTileForTick(plot, [10, 20], 10, 3), { x: 11, y: 20 });

const state = simulation.newGame(2026072301);
for (const row of state.map) {
  for (const tile of row) {
    tile.terrain = 'plain';
    tile.hasIron = false;
    tile.buildingId = null;
  }
}
state.buildings = [];
state.exploration = { explored: state.map.map(row => row.map(() => true)) };
state.day = 13;
state.subTick = 0;
state.weather = 'clear';
state.resources.tools = 100;

const farm = {
  id: 9100,
  type: 'field',
  x: 10,
  y: 10,
  w: 2,
  h: 2,
  built: true,
  progress: buildings.BUILDING_DEFS.field.buildDays,
  cropId: 'millet',
  queuedCropId: null,
  sownArea: 4,
  fieldGrowth: 20,
  inventory: {},
};
state.buildings.push(farm);
buildings.occupyBuildingTiles(state, farm);

const farmers = state.residents.slice(0, 2);
for (const resident of state.residents) resident.alive = farmers.includes(resident);
for (let index = 0; index < farmers.length; index++) {
  Object.assign(farmers[index], {
    alive: true, sick: false, quarantinedUntil: 0, health: 100, hunger: 100, warmth: 100,
    morale: 70, job: 'farmer', assignedBuildingId: null,
    x: 10, y: 10 + index, px: 10, py: 10 + index,
    phase: 'rest', path: [], workTimer: 0, targetId: null, carrying: {}, cartEquipped: false,
    task: '대기', skills: { farmer: 0 }, manualOrder: null, haulTask: null,
  });
  assert.equal(workerSlots.assignResidentToBuilding(state, farmers[index].id, farm.id), null);
}

const visited = new Map(farmers.map(farmer => [farmer.id, new Set()]));
for (let tick = 0; tick < 6; tick++) {
  const growthBefore = farm.fieldGrowth;
  agents.agentsTick(state);
  assert.ok(farm.fieldGrowth > growthBefore, `farm production continues on visual work tick ${tick}`);
  for (const farmer of farmers) {
    if (farmer.task.endsWith('재배 중') && farmer.x === farmer.px && farmer.y === farmer.py) {
      visited.get(farmer.id).add(`${farmer.x},${farmer.y}`);
    }
  }
  state.subTick++;
}

for (const farmer of farmers) {
  assert.equal(visited.get(farmer.id).size, 2, `farmer ${farmer.id} visibly works both assigned cells`);
}
assert.equal(new Set([...visited.values()].flatMap(points => [...points])).size, 4,
  'the two farmers visibly work every cell of the 2x2 plot');

console.log('farmer work tile tests passed');
