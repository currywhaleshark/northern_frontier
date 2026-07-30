import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-game-tests-'));
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

const store = new Map();
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
  removeItem: key => store.delete(key),
};

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const residents = await import(pathToFileURL(join(compiledDir, 'residents.mjs')).href);
const raidDamage = await import(pathToFileURL(join(compiledDir, 'raidDamage.mjs')).href);
const agents = await import(pathToFileURL(join(compiledDir, 'agents.mjs')).href);
const map = await import(pathToFileURL(join(compiledDir, 'map.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);

function living(state) {
  return state.residents.filter(resident => resident.alive);
}

function assignment(state) {
  return living(state).map(resident => resident.homeBuildingId);
}

function assertValidHomes(state, expectedHomeless = 0) {
  const occupancy = new Map();
  let homeless = 0;
  for (const resident of living(state)) {
    if (resident.homeBuildingId == null) {
      homeless++;
      continue;
    }
    const home = state.buildings.find(building => building.id === resident.homeBuildingId);
    assert.ok(home?.built, `resident ${resident.id} must be assigned to a completed building`);
    assert.ok(buildings.BUILDING_DEFS[home.type].capacity > 0, `building ${home.id} must be residential`);
    occupancy.set(home.id, (occupancy.get(home.id) ?? 0) + 1);
  }
  for (const [homeId, count] of occupancy) {
    const home = state.buildings.find(building => building.id === homeId);
    assert.ok(count <= buildings.BUILDING_DEFS[home.type].capacity, `building ${homeId} is over capacity`);
  }
  assert.equal(homeless, expectedHomeless);
}

// 새 게임의 입주는 주민 순번대로가 아니라 시드 기반 무작위이며, 유효한 배정은 다시 섞이지 않는다.
{
  const state = simulation.newGame(2026071014);
  assertValidHomes(state);

  const sequentialSlots = state.buildings
    .filter(building => building.built && buildings.BUILDING_DEFS[building.type].capacity > 0)
    .flatMap(building => Array(buildings.BUILDING_DEFS[building.type].capacity).fill(building.id));
  assert.notDeepEqual(assignment(state), sequentialSlots, 'housing assignment must not follow resident array order');

  const before = assignment(state);
  residents.reconcileResidentHomes(state, map.makeRng(999));
  assert.deepEqual(assignment(state), before, 'valid residents keep their current homes');

  const sameSeed = simulation.newGame(2026071014);
  assert.deepEqual(assignment(sameSeed), before, 'the same game seed reproduces the assignment');
}

// 집보다 주민이 많으면 무작위 일부만 입주하고, 노숙자는 같은 조건에서도 체온을 더 크게 잃는다.
{
  const state = simulation.newGame(2026071015);
  const huts = state.buildings.filter(building => building.type === 'hut');
  state.buildings.find(building => building.type === 'center').built = false;
  huts[1].built = false;
  for (const resident of living(state)) resident.homeBuildingId = null;

  residents.reconcileResidentHomes(state, map.makeRng(2026071015));
  assertValidHomes(state, 8);
  const housedIds = living(state).filter(resident => resident.homeBuildingId != null).map(resident => resident.id);
  assert.notDeepEqual(housedIds, living(state).slice(0, 4).map(resident => resident.id));

  state.day = 37;
  state.weather = 'clear';
  for (const resident of living(state)) {
    resident.hunger = 80;
    resident.warmth = 80;
    resident.health = 100;
    resident.sick = false;
  }
  residents.updateResidentNeeds(state, () => 0.999999, 1, 1, 1, 1, 1);
  const housedWarmth = living(state).filter(resident => resident.homeBuildingId != null).map(resident => resident.warmth);
  const homelessWarmth = living(state).filter(resident => resident.homeBuildingId == null).map(resident => resident.warmth);
  assert.ok(Math.min(...housedWarmth) > Math.max(...homelessWarmth));

  const doomed = living(state).find(resident => resident.homeBuildingId != null);
  doomed.health = 0;
  doomed.sick = true;
  residents.updateResidentNeeds(state, () => 0.999999, 1, 1, 1, 1, 1);
  assert.equal(doomed.alive, false);
  assert.equal(doomed.homeBuildingId, null);
  assertValidHomes(state, 7);
}

// 습격으로 집이 파손되면 입주자가 즉시 노숙하고, 건설담당의 수리가 끝나면 빈자리에 다시 입주한다.
{
  const state = simulation.newGame(2026071016);
  state.weather = 'clear';
  const target = state.buildings.find(building => building.type === 'hut');
  const displacedIds = living(state)
    .filter(resident => resident.homeBuildingId === target.id)
    .map(resident => resident.id);
  assert.equal(displacedIds.length, buildings.BUILDING_DEFS.hut.capacity);

  const rolls = [0, 0.5];
  raidDamage.damageBuildings(state, () => rolls.shift() ?? 0.5, 1);
  assert.equal(target.built, false);
  assert.equal(target.repairing, true);
  assert.equal(target.repairCause, 'raid');
  assert.ok(displacedIds.every(id => state.residents.find(resident => resident.id === id).homeBuildingId == null));
  assertValidHomes(state, buildings.BUILDING_DEFS.hut.capacity);

  const builder = living(state)[0];
  for (const resident of living(state)) resident.job = 'idle';
  builder.job = 'builder';
  target.progress = buildings.BUILDING_DEFS.hut.buildDays - 0.001;
  state.subTick = 9;
  for (let tick = 0; tick < 80 && !target.built; tick++) agents.agentsTick(state);

  assert.equal(target.built, true, 'the builder should finish the repair');
  assert.equal(target.repairing, false);
  assert.equal(target.repairCause, undefined, 'completed repairs must clear their alert cause');
  assertValidHomes(state);
  assert.equal(living(state).filter(resident => resident.homeBuildingId === target.id).length, buildings.BUILDING_DEFS.hut.capacity);
}

// 주거 필드가 없던 저장도 불러올 때 시드 기반으로 일관되게 입주 처리한다.
{
  const legacy = simulation.newGame(2026071017);
  for (const resident of legacy.residents) delete resident.homeBuildingId;
  assert.equal(saveLoad.saveGame(legacy), true);

  const loaded = saveLoad.loadGame();
  const loadedAgain = saveLoad.loadGame();
  assert.ok(loaded);
  assert.ok(loadedAgain);
  assertValidHomes(loaded);
  assert.deepEqual(assignment(loadedAgain), assignment(loaded));
}

console.log('resident housing tests passed');
