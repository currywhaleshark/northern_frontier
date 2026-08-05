import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const srcDir = new URL('../../src/game/', import.meta.url);
const outDir = mkdtempSync(join(tmpdir(), 'northern-rainwater-cistern-'));
for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
  const source = readFileSync(new URL(file, srcDir), 'utf8');
  let output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_m, start, spec, end) =>
    /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
  writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
}

const { CONFIG } = await import(pathToFileURL(join(outDir, 'config.mjs')).href);
const { cisternStatus, dailyCisternTick } =
  await import(pathToFileURL(join(outDir, 'rainwaterCistern.mjs')).href);
const { waterSupplySnapshot } =
  await import(pathToFileURL(join(outDir, 'waterSupply.mjs')).href);
const { aquiferVeins, initialAquiferLevels } =
  await import(pathToFileURL(join(outDir, 'subsurfaceVeins.mjs')).href);
const { migrateV61ToV62 } =
  await import(pathToFileURL(join(outDir, 'saveMigrations.mjs')).href);

const map = Array.from({ length: 20 }, (_, y) =>
  Array.from({ length: 20 }, (_, x) => ({ x, y, terrain: 'plain', buildingId: null })));
const cistern = {
  id: 1,
  type: 'rainwaterCistern',
  x: 8,
  y: 8,
  built: true,
  cisternStored: 12,
  cisternSnowStored: 0,
};
const house = { id: 2, type: 'hut', x: 10, y: 8, w: 2, h: 2, built: true };
const resident = { id: 1, alive: true, stage: null, homeBuildingId: house.id };
const state = {
  seed: 20260805,
  day: 1,
  weather: 'clear',
  map,
  buildings: [cistern, house],
  residents: [resident],
  aquiferLevels: [],
  pendingDisasters: [],
  logs: [],
};

let snapshot = waterSupplySnapshot(state);
assert.equal(snapshot.buildings.get(house.id)?.source, 'cistern');
assert.equal(snapshot.buildings.get(house.id)?.ratio, 1,
  'a nearby charged cistern supplies household water without an aquifer');
assert.ok(Math.abs(snapshot.cisternConsumption.get(cistern.id) - CONFIG.water.demand.housingPerBed) < 1e-9);

const wellSeed = 20260729;
const wellSize = 30;
const wellMap = Array.from({ length: wellSize }, (_, y) =>
  Array.from({ length: wellSize }, (_, x) => ({ x, y, terrain: 'plain', buildingId: null })));
const aquifer = aquiferVeins(wellSeed, wellSize, wellSize)[0];
const well = { id: 3, type: 'well', x: aquifer.cx, y: aquifer.cy, built: true };
const wellCistern = { ...cistern, x: aquifer.cx, y: aquifer.cy };
const wellHouse = { ...house, x: Math.min(wellSize - 2, aquifer.cx + 2), y: aquifer.cy };
const wellPriorityState = {
  ...state,
  seed: wellSeed,
  map: wellMap,
  buildings: [well, wellCistern, wellHouse],
  residents: [{ ...resident, homeBuildingId: wellHouse.id }],
  aquiferLevels: initialAquiferLevels(wellSeed, wellSize, wellSize),
};
snapshot = waterSupplySnapshot(wellPriorityState);
assert.equal(snapshot.buildings.get(wellHouse.id)?.source, 'well',
  'well water is consumed before the lower-priority cistern');
assert.equal(snapshot.cisternConsumption.get(wellCistern.id), 0);

const rainState = {
  ...state,
  weather: 'rain',
  buildings: [{ ...cistern, cisternStored: 0 }],
  residents: [],
};
dailyCisternTick(rainState, new Map());
assert.equal(rainState.buildings[0].cisternStored, CONFIG.water.cisternRainFillPerDay);

const winterState = {
  ...state,
  day: 37,
  weather: 'heavySnow',
  buildings: [{ ...cistern, cisternStored: 10, cisternSnowStored: 0 }],
  residents: [],
};
assert.equal(cisternStatus(winterState, winterState.buildings[0]).dailyOutput,
  CONFIG.water.cisternDailyOutput * CONFIG.water.cisternWinterOutputMultiplier,
  'winter halves usable cistern output');
dailyCisternTick(winterState, new Map());
assert.equal(winterState.buildings[0].cisternSnowStored, CONFIG.water.cisternSnowFillPerDay,
  'snow is stored separately until thaw');

winterState.day = 49;
winterState.weather = 'clear';
dailyCisternTick(winterState, new Map());
assert.equal(winterState.buildings[0].cisternSnowStored, 0);
assert.equal(winterState.buildings[0].cisternStored, 10 + CONFIG.water.cisternSnowFillPerDay,
  'stored snow becomes usable on the first non-winter tick');

const droughtState = {
  ...state,
  weather: 'clear',
  buildings: [{ ...cistern, cisternStored: 5 }],
  residents: [],
  pendingDisasters: [{ id: 'drought' }],
};
dailyCisternTick(droughtState, new Map());
assert.equal(droughtState.buildings[0].cisternStored,
  5 - CONFIG.water.cisternDroughtEvaporationPerDay,
  'drought evaporates cistern water even when nobody draws from it');

const migrated = migrateV61ToV62({
  schemaVersion: 61,
  buildings: [{ type: 'rainwaterCistern', cisternStored: -4, cisternSnowStored: '3.5' }],
});
assert.equal(migrated.schemaVersion, 62);
assert.deepEqual(
  [migrated.buildings[0].cisternStored, migrated.buildings[0].cisternSnowStored],
  [0, 3.5],
  'v62 migration normalizes cistern stores without adding water to old saves',
);

console.log('rainwater cistern tests passed');
