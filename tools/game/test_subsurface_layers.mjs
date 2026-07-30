import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-subsurface-tests-'));
  for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_m, start, spec, end) =>
      /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const subsurface = await import(pathToFileURL(join(compiledDir, 'subsurfaceVeins.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);
const mapModule = await import(pathToFileURL(join(compiledDir, 'map.mjs')).href);

const seed = 20260729;
const state = simulation.newGame(seed);
const width = state.map[0].length;
const height = state.map.length;
const aquifers = subsurface.aquiferVeins(seed, width, height);
const ores = subsurface.oreVeins(seed, width, height);

assert.deepEqual(subsurface.aquiferVeins(seed, width, height), aquifers,
  'aquifer geometry must be deterministic for a map seed');
assert.deepEqual(subsurface.oreVeins(seed, width, height), ores,
  'ore geometry must be deterministic for a map seed');
assert.notDeepEqual(subsurface.aquiferVeins(seed + 1, width, height), aquifers,
  'a different seed should not reuse aquifer geometry');
assert.equal(state.aquiferLevels.length, aquifers.length);
assert.equal(state.oreVeinRemaining.length, ores.length);

const riverDistanceAt = vein => {
  const row = state.map[vein.cy];
  return Math.min(...row
    .filter(tile => tile.terrain === 'river')
    .map(tile => Math.abs(tile.x - vein.cx)));
};
const inlandVeins = aquifers.filter(vein =>
  riverDistanceAt(vein) >= CONFIG.water.aquiferInlandMinRiverDistance - 2);
assert.ok(inlandVeins.length >= Math.ceil(aquifers.length * CONFIG.water.aquiferInlandShare),
  'the configured minimum share of aquifers must be deliberately distributed inland');

function legacyAquifers(legacySeed, legacyWidth, legacyHeight) {
  const rng = mapModule.makeRng((legacySeed ^ 0x4a71f39d) >>> 0);
  const areaScale = Math.max(0.55, Math.sqrt(Math.max(1, legacyWidth * legacyHeight) / (72 * 72)));
  const count = Math.max(2, Math.round((4 + Math.floor(rng() * 3)) * areaScale));
  const margin = Math.max(2, Math.min(8, Math.floor(Math.min(legacyWidth, legacyHeight) * 0.1)));
  return Array.from({ length: count }, (_, id) => {
    const usableW = Math.max(1, legacyWidth - margin * 2);
    const usableH = Math.max(1, legacyHeight - margin * 2);
    const cx = Math.min(legacyWidth - 1, margin + Math.floor(rng() * usableW));
    const cy = Math.min(legacyHeight - 1, margin + Math.floor(rng() * usableH));
    return {
      id,
      cx,
      cy,
      radius: Math.max(3, Math.round((4 + rng() * 3) * Math.min(1.25, areaScale))),
      capacity: Math.round(90 + rng() * 70),
    };
  });
}
const legacy = legacyAquifers(seed, width, height);
assert.deepEqual(aquifers.slice(0, legacy.length), legacy,
  'inland expansion must append veins without moving legacy v45 aquifers or existing wells');

for (let sampleSeed = 101; sampleSeed <= 112; sampleSeed++) {
  const sampleMap = mapModule.generateMap(sampleSeed).tiles;
  const sampleAquifers = subsurface.aquiferVeins(sampleSeed, width, height);
  const inlandCount = sampleAquifers.filter(vein => {
    const riverXs = sampleMap[vein.cy]
      .filter(tile => tile.terrain === 'river')
      .map(tile => tile.x);
    return Math.min(...riverXs.map(riverX => Math.abs(riverX - vein.cx))) >=
      CONFIG.water.aquiferInlandMinRiverDistance - 2;
  }).length;
  assert.ok(inlandCount >= Math.ceil(sampleAquifers.length * CONFIG.water.aquiferInlandShare),
    `seed ${sampleSeed} must retain the inland aquifer quota`);

  const startState = simulation.newGame(sampleSeed);
  const center = startState.buildings.find(building => building.type === 'center');
  assert.ok(center, `seed ${sampleSeed} must have a settlement center`);
  const startVein = sampleAquifers[sampleAquifers.length - 1];
  assert.equal(startVein.cx, center.x + 1);
  assert.equal(startVein.cy, center.y + 1);
  const buildableWellSite = startState.map.flat().find(tile =>
    Math.abs(tile.x - startVein.cx) + Math.abs(tile.y - startVein.cy) <=
      CONFIG.water.startingAquiferRadius &&
    buildings.canPlaceBuildingAt(startState, 'well', tile.x, tile.y));
  assert.ok(buildableWellSite,
    `seed ${sampleSeed} must offer at least one immediately buildable well site near the center`);
}

state.buildings = [];
for (const row of state.map) {
  for (const tile of row) {
    tile.terrain = 'plain';
    tile.buildingId = null;
  }
}
state.exploration.explored = state.map.map(row => row.map(() => true));

const aquifer = aquifers[0];
assert.ok(subsurface.aquiferSampleAt(seed, width, height, aquifer.cx, aquifer.cy));
assert.equal(buildings.canPlaceBuildingAt(state, 'well', aquifer.cx, aquifer.cy), true,
  'a well can be placed over an aquifer');
state.aquiferLevels[aquifer.id] = 0;
assert.equal(buildings.canPlaceBuildingAt(state, 'well', aquifer.cx, aquifer.cy), true,
  'a depleted aquifer remains a valid well site because groundwater can recover later');

const ore = ores.find(candidate => candidate.cx < width - 1 && candidate.cy < height - 1);
assert.ok(ore, 'the generated map must contain an in-bounds 2x2 ore anchor');
const oreSample = subsurface.oreSampleAt(seed, width, height, ore.cx, ore.cy);
assert.ok(oreSample);
assert.equal(buildings.canPlaceBuildingAt(state, 'deepMine', ore.cx, ore.cy), true,
  'a deep mine can be placed over a live underground vein');
state.oreVeinRemaining[oreSample.vein.id] = 0;
assert.equal(buildings.canPlaceBuildingAt(state, 'deepMine', ore.cx, ore.cy), false,
  'a depleted underground vein cannot accept another deep mine');

assert.equal(subsurface.hasSubsurfaceInsight(state), false);
state.residents[0].special = 'geomancer';
assert.equal(subsurface.hasSubsurfaceInsight(state), true,
  'a living geomancer enables precise layer readings');
state.residents[0].alive = false;
assert.equal(subsurface.hasSubsurfaceInsight(state), false,
  'a dead geomancer no longer provides subsurface insight');

console.log('subsurface layer tests passed');
