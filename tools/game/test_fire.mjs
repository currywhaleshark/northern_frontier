import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const srcDir = new URL('../../src/game/', import.meta.url);
const outDir = mkdtempSync(join(tmpdir(), 'northern-fire-tests-'));
for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
  const source = readFileSync(new URL(file, srcDir), 'utf8');
  let output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_m, start, spec, end) =>
    /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
  writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
}

const fire = await import(pathToFileURL(join(outDir, 'fire.mjs')).href);
const disasters = await import(pathToFileURL(join(outDir, 'disasters.mjs')).href);
const subsurface = await import(pathToFileURL(join(outDir, 'subsurfaceVeins.mjs')).href);

const seed = 20260730;
const size = 30;
const map = Array.from({ length: size }, (_, y) =>
  Array.from({ length: size }, (_, x) => ({ x, y, terrain: 'plain', buildingId: null })));
const aquifer = subsurface.aquiferVeins(seed, size, size)[0];
const well = { id: 1, type: 'well', x: aquifer.cx, y: aquifer.cy, built: true, progress: 1, fieldGrowth: 0 };
const target = {
  id: 2, type: 'smithy', x: Math.min(size - 2, aquifer.cx + 2), y: aquifer.cy,
  built: true, progress: 1, fieldGrowth: 0,
};
const riverX = target.x + 10 < size ? target.x + 10 : target.x - 10;
map[target.y][riverX].terrain = 'river';
const state = {
  seed,
  day: 5,
  weather: 'clear',
  map,
  buildings: [well, target],
  aquiferLevels: subsurface.initialAquiferLevels(seed, size, size),
  pendingDisasters: [],
};

assert.equal(fire.canIgniteFireInWeather('rain'), false);
assert.equal(fire.canIgniteFireInWeather('heavySnow'), false);
assert.equal(fire.fireDailyIgnitionChance({ seed, day: 5, weather: 'rain' }), 0,
  'rain must completely block ordinary ignition');
assert.ok(fire.fireDailyIgnitionChance(state) > 0,
  'dry weather must retain a non-zero ignition chance');

const nitreYard = { ...target, id: 3, type: 'nitreYard' };
const hut = { ...target, id: 4, type: 'hut' };
assert.ok(fire.fireIgnitionWeight(state, nitreYard) > fire.fireIgnitionWeight(state, target),
  'nitre yards must be a more dangerous ignition source than smithies');
assert.ok(fire.fireIgnitionWeight({ day: 37 }, hut) > fire.fireIgnitionWeight({ day: 10 }, hut),
  'winter homes must be more likely to ignite than summer homes');

const source = fire.nearestFireWaterSource(state, target);
assert.deepEqual(source && { kind: source.kind, buildingId: source.buildingId }, { kind: 'well', buildingId: well.id },
  'a nearby usable well must beat a farther river source');
const sample = subsurface.aquiferSampleAt(seed, size, size, well.x, well.y);
state.aquiferLevels[sample.vein.id] = 0;
assert.equal(fire.nearestFireWaterSource(state, target)?.kind, 'river',
  'an empty well must be skipped in favor of a reachable river');
map[target.y][riverX].terrain = 'lake';
assert.equal(fire.nearestFireWaterSource(state, target)?.kind, 'lake',
  'an empty well must also use a reachable lake as a natural firefighting source');

const normalized = disasters.normalizePendingDisasters([{
  id: 'fire', choiceId: 'burning', startedDay: 8, resolveDay: 99,
  fireSites: [
    { buildingId: target.id, intensity: 2, burnProgress: 3, suppressionProgress: 1, ignitedDay: 8, ignitedSubTick: 4 },
    { buildingId: -1, intensity: 2, burnProgress: 3, suppressionProgress: 1, ignitedDay: 8, ignitedSubTick: 4 },
  ],
}]);
assert.equal(normalized[0].fireSites.length, 1, 'invalid fire sites must be removed during save normalization');
assert.equal(normalized[0].fireSites[0].buildingId, target.id);

const fireState = {
  ...state,
  day: 10,
  subTick: 0,
  weather: 'clear',
  buildings: [well, target],
  aquiferLevels: subsurface.initialAquiferLevels(seed, size, size),
  resources: { gunpowder: 0 },
  residents: [],
  log: [],
  annals: [],
  pendingDisasters: [],
};
const ignitionRolls = [0, 0.99];
assert.equal(fire.maybeStartFire(fireState, () => ignitionRolls.shift()), true,
  'a successful daily roll must create an active fire site');
assert.equal(fireState.pendingDisasters[0].fireSites[0].buildingId, target.id,
  'weighted ignition must preserve its selected building');
assert.ok(fire.drawFireWater(fireState, {
  kind: 'well', buildingId: well.id, x: well.x, y: well.y, distance: 0,
}) > 0, 'drawing a fire bucket from a well must use a real aquifer source');
const lakeAquiferLevels = [...fireState.aquiferLevels];
assert.ok(fire.drawFireWater(fireState, {
  kind: 'lake', x: riverX, y: target.y, distance: 0,
}) > 0, 'lake water supplies an ordinary firefighting bucket without draining an aquifer');
assert.deepEqual(fireState.aquiferLevels, lakeAquiferLevels,
  'drawing a lake bucket never drains groundwater');
fire.applyFireWater(fireState, target.id, 1);
fire.advanceFire(fireState);
assert.equal(fireState.pendingDisasters.length, 0,
  'enough carried water must extinguish a small fire before it damages the building');

const damageState = {
  ...fireState,
  buildings: [{ ...target, built: true, repairing: false, repairCause: undefined, progress: 1 }],
  pendingDisasters: [{
    id: 'fire', choiceId: 'burning', startedDay: 10, resolveDay: 16, data: {},
    fireSites: [{ buildingId: target.id, intensity: 1, burnProgress: 99, suppressionProgress: 0, ignitedDay: 10, ignitedSubTick: 0 }],
  }],
  log: [],
  annals: [],
};
fire.advanceFire(damageState);
assert.equal(damageState.buildings[0].repairCause, 'fire',
  'a fire that outruns suppression must enter the normal repair flow with a fire cause');
assert.equal(damageState.buildings[0].repairing, true);

const nitreState = {
  ...damageState,
  buildings: [{ ...nitreYard, built: true, inventory: { gunpowder: 5 } }],
  pendingDisasters: [{
    id: 'fire', choiceId: 'burning', startedDay: 10, resolveDay: 16, data: {},
    fireSites: [{ buildingId: nitreYard.id, intensity: 1, burnProgress: 1, suppressionProgress: 0, ignitedDay: 10, ignitedSubTick: 0 }],
  }],
  resources: { gunpowder: 99 },
  log: [],
};
fire.advanceFire(nitreState);
assert.equal(nitreState.buildings[0].inventory.gunpowder, 2,
  'only gunpowder stored at the burning nitre yard may explode; settlement stock must remain untouched');
assert.equal(nitreState.resources.gunpowder, 99);

console.log('fire state and source helper checks passed');
