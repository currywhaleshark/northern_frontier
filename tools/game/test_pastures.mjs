import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-pasture-tests-'));
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
const load = name => import(pathToFileURL(join(compiledDir, `${name}.mjs`)).href);
const buildings = await load('buildings');
const livestock = await load('livestock');
const pastures = await load('pastures');
const simulation = await load('simulation');
const workers = await load('workerSlots');
const { CONFIG } = await load('config');

function simpleState() {
  const map = Array.from({ length: 12 }, (_, y) =>
    Array.from({ length: 12 }, (_, x) => ({
      x, y, terrain: 'plain', buildingId: null, hasIron: false,
    })));
  const stable = {
    id: 1,
    type: 'stable',
    x: 4,
    y: 4,
    progress: 9,
    built: true,
    fieldGrowth: 0,
    livestock: livestock.createLivestockState('cattle', 3),
  };
  for (let y = 4; y < 6; y++) for (let x = 4; x < 6; x++) map[y][x].buildingId = stable.id;
  return {
    map,
    exploration: { explored: map.map(row => row.map(() => true)) },
    buildings: [stable],
    foreignSites: [],
  };
}

{
  const state = simpleState();
  const stable = state.buildings[0];
  assert.equal(pastures.validateStablePasture(state, stable.id, { x: 6, y: 4, w: 3, h: 2 }), null);
  assert.match(
    pastures.validateStablePasture(state, stable.id, { x: 8, y: 8, w: 2, h: 2 }),
    /축사의 한 변/,
  );
  assert.match(
    pastures.validateStablePasture(state, stable.id, { x: 6, y: 4, w: 1, h: 1 }),
    /더 넓은 방목지/,
  );
  assert.equal(pastures.setStablePasture(state, stable.id, { x: 6, y: 4, w: 3, h: 2 }), null);
  assert.deepEqual(stable.pasture, { x: 6, y: 4, w: 3, h: 2 });
  assert.equal(pastures.stableLivestockCapacity(stable, 'cattle'), 3);
  assert.equal(pastures.stableLivestockCapacity(stable, 'chicken'), 12);
  assert.equal(pastures.pastureRequiredHerders(stable), 1);
  assert.equal(workers.workerSlotCount(stable), 1);
  assert.equal(buildings.canPlaceBuildingAt(state, 'hut', 6, 4), false, 'buildings cannot overwrite pasture');
}

{
  const stable = {
    type: 'stable',
    pasture: { x: 0, y: 0, w: CONFIG.pasture.maxSide, h: CONFIG.pasture.maxSide },
  };
  assert.equal(pastures.stableLivestockCapacity(stable, 'cattle'), 18);
  assert.equal(pastures.stableLivestockCapacity(stable, 'horse'), 18);
  assert.equal(pastures.stableLivestockCapacity(stable, 'pig'), 36);
  assert.equal(pastures.pastureRequiredHerders(stable), 5);
}

{
  const state = simulation.newGame(2026072501);
  state.resources.grain = 100;
  const stable = {
    id: state.nextBuildingId++,
    type: 'stable',
    x: 1,
    y: 1,
    progress: 9,
    built: true,
    fieldGrowth: 0,
    pasture: { x: 3, y: 1, w: 4, h: 4 },
    livestock: livestock.createLivestockState('chicken', 4),
  };
  state.buildings.push(stable);
  const herder = state.residents[0];
  herder.job = 'herder';
  herder.assignedBuildingId = stable.id;
  herder.sick = false;
  herder.alive = true;
  livestock.updateLivestock(state);
  const fullDailyGrowth = 4 * CONFIG.livestock.chicken.breedingPerHeadPerDay;
  assert.ok(Math.abs(stable.livestock.growth - fullDailyGrowth / 2) < 1e-9,
    'one of two required herders gives half breeding care');
}

console.log('pasture tests passed');
