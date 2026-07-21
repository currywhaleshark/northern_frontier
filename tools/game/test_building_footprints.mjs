import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-game-tests-'));
  const files = readdirSync(srcDir).filter(file => file.endsWith('.ts'));
  for (const file of files) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) => {
      if (/\.[cm]?js$/.test(spec)) return `${start}${spec}${end}`;
      return `${start}${spec}.mjs${end}`;
    });
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const agents = await import(pathToFileURL(join(compiledDir, 'agents.mjs')).href);
const raidDamage = await import(pathToFileURL(join(compiledDir, 'raidDamage.mjs')).href);

const SINGLE_TILE = [
  'bridge',
  'lumberCamp',
  'huntLodge',
  'herbHut',
  'mine',
  'field',
  'paddy',
  'ferry',
  'dryingRack',
  'onggiKiln',
  'dock',
  'palisade',
  'earthFort',
  'stoneWall',
  'gate',
  'watchtower',
];

const TWO_TILE = Object.keys(buildings.BUILDING_DEFS).filter(type => type !== 'center' && !SINGLE_TILE.includes(type));

function boostResources(state) {
  for (const key of Object.keys(state.resources)) state.resources[key] = 1000;
  state.rank = 'bu';
  state.cannonsGranted = 10;
}

function clearMapToPlain(state) {
  for (const row of state.map) {
    for (const tile of row) {
      tile.terrain = 'plain';
      tile.hasIron = false;
      tile.buildingId = null;
    }
  }
  state.buildings = [];
  state.exploration = { explored: state.map.map(row => row.map(() => true)) };
}

function footprintIds(state, type, x, y) {
  const tiles = buildings.buildingFootprintTiles(state, type, x, y);
  assert.ok(tiles, `footprint exists for ${type}`);
  return tiles.map(tile => tile.buildingId);
}

{
  for (const type of SINGLE_TILE) {
    assert.equal(buildings.buildingFootprintSize(type), 1, `${type} stays 1x1`);
  }
  for (const type of TWO_TILE) {
    assert.equal(buildings.buildingFootprintSize(type), 2, `${type} becomes 2x2`);
  }
  assert.deepEqual(buildings.buildingFootprintDims({ type: 'center' }), { w: 3, h: 2 },
    'new centers reserve a fixed 3x2 footprint');
  assert.deepEqual(buildings.buildingFootprintDims({ type: 'center', w: 2, h: 2 }), { w: 2, h: 2 },
    'migrated centers can preserve a collision-safe 2x2 footprint');
}

{
  const state = simulation.newGame(2026070701);
  for (const building of state.buildings) {
    const dims = buildings.buildingFootprintDims(building);
    const ids = footprintIds(state, building.type, building.x, building.y);
    assert.equal(ids.length, dims.w * dims.h, `${building.type} footprint has ${dims.w * dims.h} tiles`);
    assert.ok(ids.every(id => id === building.id), `${building.type} prebuilt footprint is occupied by its id`);
  }
  const center = state.buildings.find(building => building.type === 'center');
  assert.deepEqual({ w: center.w, h: center.h }, { w: 3, h: 2 });
}

{
  const state = simulation.newGame(2026070708);
  for (const resident of state.residents) {
    assert.equal(
      agents.isPassable(state, resident.x, resident.y),
      true,
      `${resident.name} starts on a passable tile`,
    );
  }
}

{
  const state = simulation.newGame(2026070702);
  boostResources(state);
  clearMapToPlain(state);

  assert.equal(simulation.tryPlaceBuilding(state, 'smithy', 5, 5), null, '2x2 smithy can be placed on open land');
  const smithy = state.buildings.find(building => building.type === 'smithy');
  assert.ok(smithy, 'smithy was created');
  assert.deepEqual(footprintIds(state, 'smithy', 5, 5), [smithy.id, smithy.id, smithy.id, smithy.id]);

  assert.ok(
    simulation.tryPlaceBuilding(state, 'market', 6, 6),
    '2x2 market rejects placement when any footprint tile is occupied',
  );

  assert.ok(
    simulation.tryPlaceBuilding(state, 'market', state.map[0].length - 1, state.map.length - 1),
    '2x2 market rejects placement outside the map',
  );

  const woodBeforeMarket = state.resources.wood;
  const stoneBeforeMarket = state.resources.stone;
  assert.equal(simulation.tryPlaceBuilding(state, 'market', 9, 9), null);
  const market = state.buildings.find(building => building.type === 'market');
  assert.ok(market);
  assert.ok(state.resources.wood < woodBeforeMarket || state.resources.stone < stoneBeforeMarket);
  assert.equal(simulation.cancelBuildingConstruction(state, market.id), null);
  assert.equal(state.resources.wood, woodBeforeMarket, 'cancel refunds all committed wood');
  assert.equal(state.resources.stone, stoneBeforeMarket, 'cancel refunds all committed stone');
  assert.equal(state.buildings.some(building => building.id === market.id), false);
  assert.deepEqual(footprintIds(state, 'market', 9, 9), [null, null, null, null]);
  smithy.built = true;
  assert.match(simulation.cancelBuildingConstruction(state, smithy.id), /완공된 건물/);
}

{
  const state = simulation.newGame(2026070703);
  boostResources(state);
  clearMapToPlain(state);

  assert.equal(simulation.tryPlaceBuilding(state, 'watchtower', 8, 8), null, 'excluded watchtower can be placed');
  const tower = state.buildings.find(building => building.type === 'watchtower');
  assert.ok(tower, 'watchtower was created');
  assert.deepEqual(footprintIds(state, 'watchtower', 8, 8), [tower.id]);
  assert.equal(state.map[8][9].buildingId, null, 'watchtower does not occupy east neighbor');
  assert.equal(state.map[9][8].buildingId, null, 'watchtower does not occupy south neighbor');
}

{
  const state = simulation.newGame(2026070704);
  clearMapToPlain(state);
  state.buildings.push({
    id: 501,
    type: 'garrison',
    x: 3,
    y: 4,
    progress: 99,
    built: true,
    fieldGrowth: 0,
  });

  buildings.rebuildBuildingFootprints(state);
  assert.deepEqual(footprintIds(state, 'garrison', 3, 4), [501, 501, 501, 501]);
}

{
  const state = simulation.newGame(2026070705);
  clearMapToPlain(state);
  state.buildings.push({
    id: 601,
    type: 'storehouse',
    x: 2,
    y: 2,
    progress: 99,
    built: true,
    fieldGrowth: 0,
  });
  buildings.rebuildBuildingFootprints(state);

  const damaged = raidDamage.damageBuildings(state, () => 0, 1);
  const storehouse = state.buildings.find(building => building.id === 601);
  assert.deepEqual(damaged, ['storehouse']);
  assert.ok(storehouse, 'damaged storehouse remains available for repair');
  assert.equal(storehouse.built, false);
  assert.equal(storehouse.repairing, true);
  assert.ok(storehouse.progress > 0 && storehouse.progress < 99);
  assert.deepEqual(footprintIds(state, 'storehouse', 2, 2), [601, 601, 601, 601]);

  for (const resident of state.residents) resident.job = 'idle';
  const builder = state.residents[0];
  builder.job = 'builder';
  builder.x = 1;
  builder.y = 2;
  builder.px = 1;
  builder.py = 2;
  builder.path = [];
  for (let tick = 0; tick < 40 && !storehouse.built; tick++) agents.agentsTick(state);
  assert.equal(storehouse.built, true, 'a builder repairs the damaged building');
  assert.equal(storehouse.repairing, false);
  assert.ok(state.log.some(entry => entry.text.includes('수리가 끝나')));
}

console.log('building footprint tests passed');
