import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const srcDir = new URL('../../src/game/', import.meta.url);
const outDir = mkdtempSync(join(tmpdir(), 'northern-irrigation-canals-'));
for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
  const source = readFileSync(new URL(file, srcDir), 'utf8');
  let output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_m, start, spec, end) =>
    /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
  writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
}

const irrigation = await import(pathToFileURL(join(outDir, 'irrigation.mjs')).href);
const buildings = await import(pathToFileURL(join(outDir, 'buildings.mjs')).href);
const agents = await import(pathToFileURL(join(outDir, 'agents.mjs')).href);
const raids = await import(pathToFileURL(join(outDir, 'raids.mjs')).href);
const disasters = await import(pathToFileURL(join(outDir, 'disasters.mjs')).href);
const simulation = await import(pathToFileURL(join(outDir, 'simulation.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(outDir, 'config.mjs')).href);

function makeMap(width = 8, height = 5) {
  return Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => ({
    x, y, terrain: x === 0 ? 'river' : 'plain', buildingId: null,
  })));
}

const map = makeMap();
const canals = [
  { id: 1, type: 'canal', x: 1, y: 2, built: true },
  { id: 2, type: 'canal', x: 2, y: 2, built: true },
  { id: 3, type: 'canal', x: 3, y: 2, built: false },
  { id: 4, type: 'canal', x: 6, y: 3, built: true },
];
const state = { map, buildings: canals, pendingDisasters: [] };
for (const canal of canals) map[canal.y][canal.x].buildingId = canal.id;

let flowing = irrigation.flowingCanalTileSet(state);
assert.deepEqual([...flowing].sort(), ['1,2', '2,2'],
  'only completed canal segments connected to the river may carry water');
assert.equal(irrigation.canalConnectionsAt(state, 1, 2, true).w, true,
  'the first canal segment visibly opens toward its adjacent river');
assert.equal(irrigation.canalRiverEdgesAt(state, 1, 2).w, true,
  'the renderer can extend the inlet across the river bank to the water surface');
assert.equal(buildings.isPaddyEligibleTile(state, map[2][3]), true,
  'a fertile tile beside a live canal may become a paddy');
assert.equal(buildings.isPaddyEligibleTile(state, map[2][4]), false,
  'a construction-site canal must not unlock inland paddy placement');
assert.equal(irrigation.wouldCanalFlowAt(state, 3, 2), true,
  'a placement ghost continuing a live canal previews as a water-filled channel');

canals[2].built = true;
flowing = irrigation.flowingCanalTileSet(state);
assert.equal(flowing.has('3,2'), true, 'finishing the missing segment reconnects the canal tail');
assert.equal(buildings.isPaddyEligibleTile(state, map[2][4]), true,
  'reconnected canal tail unlocks its neighboring fertile land');
assert.equal(buildings.canPlaceBuildingAt(state, 'paddy', 3, 0, 2, 2), true,
  'new multi-tile paddy placement accepts a footprint with one live-canal-adjacent tile');
map[0][4].terrain = 'forest';
assert.equal(buildings.canPlaceBuildingAt(state, 'paddy', 3, 0, 2, 2), true,
  'a tree inside an otherwise valid paddy footprint remains a clearable placement candidate');
map[0][4].terrain = 'plain';
const connections = irrigation.canalConnectionsAt(state, 2, 2, true);
assert.deepEqual(connections, { n: false, e: true, s: false, w: true },
  'segment topology exposes straight, corner, T, and cross rendering inputs');

canals[1].built = false;
flowing = irrigation.flowingCanalTileSet(state);
assert.equal(flowing.has('3,2'), false, 'breaking an intermediate segment dries the isolated canal group');
assert.equal(buildings.isPaddyEligibleTile(state, map[2][4]), false,
  'a dried canal no longer qualifies new or expanded paddies');
assert.equal(buildings.canPlaceBuildingAt(state, 'paddy', 3, 0, 2, 2), false,
  'the same multi-tile paddy footprint is rejected after its canal connection is broken');

const directRiverPaddy = { id: 10, type: 'paddy', x: 1, y: 1, w: 1, h: 1 };
const canalPaddy = { id: 11, type: 'paddy', x: 4, y: 2, w: 1, h: 1 };
const droughtState = { pendingDisasters: [{ id: 'drought' }], buildings: [] };
assert.equal(disasters.droughtFarmGrowthMultiplier(droughtState, directRiverPaddy), CONFIG.disasters.drought.farmGrowthMultiplier);
assert.equal(disasters.droughtFarmGrowthMultiplier(droughtState, canalPaddy), CONFIG.disasters.drought.farmGrowthMultiplier,
  'canal-supplied paddies receive the same drought penalty as river-side paddies');
droughtState.buildings.push({ id: 12, type: 'weir', x: 4, y: 2, built: true });
assert.equal(disasters.droughtFarmGrowthMultiplier(droughtState, canalPaddy), CONFIG.disasters.drought.irrigatedFarmGrowthMultiplier,
  'the existing weir radius remains the only drought relief for canal paddies');

const conversionMap = makeMap();
const conversionCanals = [
  { id: 20, type: 'canal', x: 1, y: 1, built: true },
  { id: 21, type: 'canal', x: 2, y: 1, built: true },
];
const field = { id: 22, type: 'field', x: 3, y: 1, w: 1, h: 1, built: true, progress: 1, fieldGrowth: 42 };
for (const building of [...conversionCanals, field]) conversionMap[building.y][building.x].buildingId = building.id;
const conversionState = {
  map: conversionMap, buildings: [...conversionCanals, field], rank: 'bo', day: 1, log: [],
  resources: { wood: 100, tools: 100 },
};
assert.equal(simulation.convertFieldToPaddy(conversionState, field.id), null,
  'a completed field beside a live canal can be converted into a paddy');
assert.equal(field.type, 'paddy');

const clearingState = simulation.newGame(2026073101);
for (const row of clearingState.map) {
  for (const tile of row) {
    tile.terrain = 'plain';
    tile.buildingId = null;
  }
}
clearingState.buildings = [];
clearingState.rank = 'bo';
clearingState.resources.wood = 100;
clearingState.resources.tools = 100;
clearingState.exploration = {
  explored: clearingState.map.map(row => row.map(() => true)),
};
clearingState.map[2][0].terrain = 'river';
const clearingCanal = { id: 90, type: 'canal', x: 1, y: 2, built: true, progress: 2, fieldGrowth: 0 };
clearingState.buildings.push(clearingCanal);
clearingState.map[2][1].buildingId = clearingCanal.id;
clearingState.map[1][3].terrain = 'forest';
assert.equal(
  simulation.tryPlaceBuilding(clearingState, 'paddy', 2, 1, 2, 2),
  simulation.CLEARING_APPROVAL_REQUIRED,
  'a valid canal-side paddy containing trees asks for clearing approval instead of becoming unbuildable',
);

const movementMap = makeMap(4, 3);
const canalBuilding = { id: 30, type: 'canal', x: 1, y: 1, built: true };
movementMap[1][1].buildingId = canalBuilding.id;
const movementState = { map: movementMap, buildings: [canalBuilding], day: 1, weather: 'clear', pendingDisasters: [] };
assert.equal(agents.isTerrainPassable(movementState, 1, 1), true,
  'residents may walk across a canal segment');
assert.equal(raids.raiderCanUseBuilding(canalBuilding), true,
  'raiders may also traverse a completed canal segment');
assert.equal(raids.raiderCanUseBuilding({ ...canalBuilding, built: false }), false,
  'raiders cannot use an unfinished canal construction site');

console.log('irrigation canal tests passed');
