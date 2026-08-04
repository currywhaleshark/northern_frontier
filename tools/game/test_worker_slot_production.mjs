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
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const workerSlots = await import(pathToFileURL(join(compiledDir, 'workerSlots.mjs')).href);
const fishingGrounds = await import(pathToFileURL(join(compiledDir, 'fishingGrounds.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

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

function addBuilt(state, type, x, y, overrides = {}) {
  const building = {
    id: 9600 + state.buildings.length,
    type,
    x,
    y,
    progress: buildings.BUILDING_DEFS[type].buildDays,
    built: true,
    fieldGrowth: 0,
    ...overrides,
  };
  state.buildings.push(building);
  buildings.occupyBuildingTiles(state, building);
  return building;
}

function workableResident(state, index, job, x, y) {
  for (const resident of state.residents) resident.alive = false;
  const resident = state.residents[index];
  Object.assign(resident, {
    alive: true,
    sick: false,
    health: 100,
    hunger: 100,
    warmth: 100,
    morale: 70,
    job,
    assignedBuildingId: null,
    x,
    y,
    px: x,
    py: y,
    phase: 'rest',
    path: [],
    workTimer: 0,
    targetId: null,
    carrying: {},
    manualOrder: null,
    skills: {},
  });
  return resident;
}

function interactionTileForBuilding(state, building) {
  const footprint = buildings.buildingFootprintTiles(state, building.type, building.x, building.y);
  assert.ok(footprint, `${building.type} footprint exists`);
  for (const part of footprint) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const tile = state.map[part.y + dy]?.[part.x + dx];
      if (!tile || tile.buildingId != null || tile.terrain === 'mountain') continue;
      tile.terrain = 'plain';
      tile.hasIron = false;
      return tile;
    }
  }
  throw new Error(`no interaction tile for ${building.type}`);
}

function prepareState(seed) {
  const state = simulation.newGame(seed);
  clearMapToPlain(state);
  addBuilt(state, 'center', 2, 2);
  state.rank = 'bu';
  state.day = 1;
  state.subTick = 9;
  state.weather = 'clear';
  state.resources.tools = 100;
  state.processingReserves.iron = 0;
  state.processingReserves.wood = 0;
  state.processingReserves.hide = 0;
  return state;
}

{
  const state = prepareState(2026070911);
  const field = addBuilt(state, 'field', 10, 10, { fieldGrowth: 0 });
  workableResident(state, 0, 'farmer', field.x, field.y);

  simulation.advanceTick(state);

  assert.equal(field.fieldGrowth, 0, 'unassigned farmer does not grow a built field');
}

{
  const state = prepareState(2026070912);
  const field = addBuilt(state, 'field', 10, 10, { fieldGrowth: 0 });
  const farmer = workableResident(state, 0, 'farmer', field.x, field.y);
  assert.equal(workerSlots.assignResidentToBuilding(state, farmer.id, field.id), null);

  simulation.advanceTick(state);

  // 작기가 파종 단계부터 시작한다 — 씨를 다 넣은 뒤에야 성장이 오른다
  assert.ok((field.sownArea ?? 0) > 0, 'assigned farmer starts sowing the assigned field');
  const ticksToSowAndGrow = CONFIG.agents.subticksPerDay * 3;
  for (let i = 0; i < ticksToSowAndGrow; i++) {
    state.pendingChoice = null; // 사건 선택지가 시뮬레이션을 멈추지 않게
    state.weather = 'clear';
    simulation.advanceTick(state);
  }
  assert.ok(field.fieldGrowth > 0, 'assigned farmer grows the field once sowing is done');
}

{
  const state = prepareState(2026070913);
  addBuilt(state, 'tannery', 10, 10);
  workableResident(state, 0, 'tanner', 9, 10);
  state.resources.hide = 10;
  state.resources.hideClothes = 0;

  simulation.advanceDay(state);

  assert.equal(state.resources.hide, 10, 'unassigned tannery leaves hide untouched');
  assert.equal(state.resources.hideClothes, 0, 'unassigned tannery does not make clothes');
}

{
  const state = prepareState(2026070914);
  const tannery = addBuilt(state, 'tannery', 10, 10, {
    inventory: { hide: 10 },
    tanneryProduct: 'hideClothes',
  });
  const tanner = workableResident(state, 0, 'tanner', 9, 10);
  assert.equal(workerSlots.assignResidentToBuilding(state, tanner.id, tannery.id), null);
  state.resources.hide = 10;
  state.resources.hideClothes = 0;

  simulation.advanceTick(state);

  assert.ok(tannery.inventory.hide < 10, 'assigned tanner consumes hide stored at the assigned tannery');
  assert.equal(state.resources.hide, 10, 'workplace stock is consumed instead of remote settlement stock');
  assert.ok((tannery.inventory?.hideClothes ?? 0) > 0, 'assigned tanner stores clothes at the assigned tannery');
}

{
  const state = prepareState(2026070915);
  const smithy = addBuilt(state, 'smithy', 10, 10, { inventory: { iron: 10, wood: 10 } });
  simulation.setSmithyProduct(state, smithy.id, 'spears');
  const smith = workableResident(state, 0, 'smith', 9, 10);
  assert.equal(workerSlots.assignResidentToBuilding(state, smith.id, smithy.id), null);
  state.resources.iron = 10;
  state.resources.wood = 10;
  state.resources.spears = 0;

  simulation.advanceTick(state);

  assert.ok((smithy.inventory?.spears ?? 0) > 0, 'assigned smith stores the selected assigned smithy product');
}

{
  const state = prepareState(2026070916);
  state.rank = 'bo';
  state.map[10][10].terrain = 'river';
  fishingGrounds.ensureFishingGrounds(state);
  const ferry = addBuilt(state, 'ferry', 10, 10);
  const fisher = workableResident(state, 0, 'fisher', ferry.x, ferry.y);

  for (let i = 0; i < 6; i++) simulation.advanceTick(state);

  assert.equal(fisher.carrying.fish ?? 0, 0, 'unassigned fisher does not produce fish');
}

{
  const state = prepareState(2026070917);
  state.rank = 'bo';
  state.map[10][10].terrain = 'river';
  fishingGrounds.ensureFishingGrounds(state);
  const ferry = addBuilt(state, 'ferry', 10, 10);
  const fisher = workableResident(state, 0, 'fisher', ferry.x, ferry.y);
  assert.equal(workerSlots.assignResidentToBuilding(state, fisher.id, ferry.id), null);

  for (let i = 0; i < 6; i++) simulation.advanceTick(state);

  assert.ok((fisher.carrying.fish ?? 0) > 0, 'assigned fisher produces fish at the assigned ferry');
}

{
  const state = prepareState(2026080301);
  state.rank = 'bo';
  for (let y = 10; y <= 18; y++) for (let x = 8; x <= 18; x++) state.map[y][x].terrain = 'lake';
  fishingGrounds.ensureFishingGrounds(state);
  const port = addBuilt(state, 'fishingPort', 10, 9, {
    gatheringWorkArea: { x: 10, y: 10, radius: CONFIG.gatheringZones.fishingPortRadius },
    inventory: {},
  });
  const fisher = workableResident(state, 0, 'fisher', port.x, port.y);
  assert.equal(workerSlots.assignResidentToBuilding(state, fisher.id, port.id), 'building has no worker slots',
    '포구는 어부 작업 슬롯 대신 어선 승무원 슬롯을 쓴다');
  const before = state.fishingGrounds
    .filter(ground => ground.kind === 'lake' && ground.depthBand === 'shore')
    .reduce((sum, ground) => sum + ground.stock, 0);

  for (let i = 0; i < 6; i++) simulation.advanceTick(state);

  const after = state.fishingGrounds
    .filter(ground => ground.kind === 'lake' && ground.depthBand === 'shore')
    .reduce((sum, ground) => sum + ground.stock, 0);
  assert.equal(fisher.carrying.fish ?? 0, 0, '어선에 배정되지 않은 어부는 포구에서 작업하지 않는다');
  assert.equal(after, before, '승무원이 없으면 포구 연안 비축을 소비하지 않는다');
}

{
  const state = prepareState(2026070918);
  state.rank = 'jin';
  const stable = addBuilt(state, 'stable', 10, 10);
  const spot = interactionTileForBuilding(state, stable);
  const herder = workableResident(state, 0, 'herder', spot.x, spot.y);

  for (let i = 0; i < 8; i++) simulation.advanceTick(state);

  assert.equal(stable.inventory?.eggs ?? 0, 0, 'unassigned herder does not gather eggs');
}

{
  const state = prepareState(2026070919);
  state.rank = 'jin';
  const stable = addBuilt(state, 'stable', 10, 10);
  const spot = interactionTileForBuilding(state, stable);
  const herder = workableResident(state, 0, 'herder', spot.x, spot.y);
  assert.equal(workerSlots.assignResidentToBuilding(state, herder.id, stable.id), null);

  for (let i = 0; i < 8; i++) simulation.advanceTick(state);

  assert.ok((stable.inventory?.eggs ?? 0) > 0, 'assigned herder gathers eggs at the assigned stable');
  assert.equal(herder.carrying.meat ?? 0, 0, 'meat requires an explicit slaughter action');
}

{
  const state = prepareState(2026070920);
  state.rank = 'bu';
  const yard = addBuilt(state, 'nitreYard', 10, 10);
  const spot = interactionTileForBuilding(state, yard);
  workableResident(state, 0, 'powderMaker', spot.x, spot.y);
  state.resources.firewood = 10;
  state.resources.stone = 10;
  state.resources.gunpowder = 0;
  state.nitrePaused = false;
  state.nitreHiddenUntil = 0;

  simulation.advanceTick(state);

  assert.equal(state.resources.gunpowder, 0, 'unassigned powder maker does not produce gunpowder');
}

{
  const state = prepareState(2026070921);
  state.rank = 'bu';
  const yard = addBuilt(state, 'nitreYard', 10, 10, { inventory: { firewood: 10, stone: 10 } });
  const spot = interactionTileForBuilding(state, yard);
  const powderMaker = workableResident(state, 0, 'powderMaker', spot.x, spot.y);
  assert.equal(workerSlots.assignResidentToBuilding(state, powderMaker.id, yard.id), null);
  state.resources.firewood = 10;
  state.resources.stone = 10;
  state.resources.gunpowder = 0;
  state.nitrePaused = false;
  state.nitreHiddenUntil = 0;

  simulation.advanceTick(state);

  assert.ok((yard.inventory?.gunpowder ?? 0) > 0, 'assigned powder maker stores gunpowder when inputs are available');
  assert.ok(yard.inventory.firewood < 10, 'assigned powder maker consumes local firewood');
  assert.ok(yard.inventory.stone < 10, 'assigned powder maker consumes local stone');
}

{
  const state = prepareState(2026070922);
  state.rank = 'bo';
  const assignedSmithy = addBuilt(state, 'smithy', 10, 10, { inventory: { iron: 10, wood: 10 } });
  const otherSmithy = addBuilt(state, 'smithy', 15, 10);
  simulation.setSmithyProduct(state, assignedSmithy.id, 'tools');
  simulation.setSmithyProduct(state, otherSmithy.id, 'spears');
  const smith = workableResident(state, 0, 'smith', 9, 10);
  assert.equal(workerSlots.assignResidentToBuilding(state, smith.id, assignedSmithy.id), null);
  state.resources.tools = 0;
  state.resources.spears = 0;
  state.resources.iron = 10;
  state.resources.wood = 10;

  simulation.advanceTick(state);

  assert.ok((assignedSmithy.inventory?.tools ?? 0) > 0, 'assigned smith uses the assigned smithy product');
  assert.equal(state.resources.spears, 0, 'assigned smith ignores another unassigned smithy product');
}

{
  const state = prepareState(2026070923);
  state.rank = 'bo';
  const smithy = addBuilt(state, 'smithy', 10, 10);
  const rock = state.map[18][18];
  rock.terrain = 'rock';
  rock.hasIron = true;
  const smith = workableResident(state, 0, 'smith', 9, 10);
  assert.equal(workerSlots.assignResidentToBuilding(state, smith.id, smithy.id), null);
  state.resources.tools = 0;
  state.resources.iron = 0;
  state.resources.wood = 10;

  for (let i = 0; i < 8; i++) simulation.advanceTick(state);

  assert.equal(smith.carrying.iron ?? 0, 0, 'assigned smith does not self-mine iron away from the smithy');
  assert.equal(state.resources.iron, 0, 'assigned smith does not deposit self-mined iron');
}

{
  const state = prepareState(2026070924);
  state.rank = 'bo';
  addBuilt(state, 'ferry', 10, 10);
  const storehouse = addBuilt(state, 'storehouse', 15, 10);
  const spot = interactionTileForBuilding(state, storehouse);
  const fisher = workableResident(state, 0, 'fisher', spot.x, spot.y);
  fisher.carrying = { fish: 2 };
  state.resources.fish = 0;

  simulation.advanceTick(state);

  assert.deepEqual(fisher.carrying, {}, 'unassigned fisher deposits carried resources before waiting');
  assert.equal(state.resources.fish, 2, 'unassigned fisher deposit reaches storage');
}

{
  const state = prepareState(2026070925);
  state.rank = 'jin';
  addBuilt(state, 'stable', 10, 10);
  const storehouse = addBuilt(state, 'storehouse', 15, 10);
  const spot = interactionTileForBuilding(state, storehouse);
  const herder = workableResident(state, 0, 'herder', spot.x, spot.y);
  herder.carrying = { meat: 2, hide: 1 };
  state.resources.meat = 0;
  state.resources.hide = 0;

  simulation.advanceTick(state);

  assert.deepEqual(herder.carrying, {}, 'unassigned herder deposits carried resources before waiting');
  assert.equal(state.resources.meat, 2, 'unassigned herder meat deposit reaches storage');
  assert.equal(state.resources.hide, 1, 'unassigned herder hide deposit reaches storage');
}

function activateDrought(state) {
  state.pendingDisasters = [{
    id: 'drought', choiceId: 'declared', startedDay: state.day,
    resolveDay: state.day + 8, progress: 0,
  }];
}

function farmGrowthIncrement(seed, drought, irrigated) {
  const state = prepareState(seed);
  state.day = 15;
  const field = addBuilt(state, 'field', 10, 10, {
    cropId: 'buckwheat', sownArea: 1, fieldGrowth: 10, w: 1, h: 1,
  });
  if (irrigated) addBuilt(state, 'weir', 16, 10);
  if (drought) activateDrought(state);
  const farmer = workableResident(state, 0, 'farmer', field.x, field.y);
  assert.equal(workerSlots.assignResidentToBuilding(state, farmer.id, field.id), null);
  const before = field.fieldGrowth;
  simulation.advanceTick(state);
  return field.fieldGrowth - before;
}

{
  const normal = farmGrowthIncrement(2026070926, false, false);
  const drought = farmGrowthIncrement(2026070926, true, false);
  const irrigated = farmGrowthIncrement(2026070926, true, true);
  assert.ok(normal > 0);
  assert.ok(Math.abs(drought / normal - CONFIG.disasters.drought.farmGrowthMultiplier) < 0.001);
  assert.ok(Math.abs(irrigated / normal - CONFIG.disasters.drought.irrigatedFarmGrowthMultiplier) < 0.001);
}

function fisherCatch(seed, drought) {
  const state = prepareState(seed);
  state.day = 15;
  state.rank = 'bo';
  state.map[10][10].terrain = 'river';
  fishingGrounds.ensureFishingGrounds(state);
  const ferry = addBuilt(state, 'ferry', 10, 10);
  if (drought) activateDrought(state);
  const fisher = workableResident(state, 0, 'fisher', ferry.x, ferry.y);
  assert.equal(workerSlots.assignResidentToBuilding(state, fisher.id, ferry.id), null);
  for (let index = 0; index < 6; index++) simulation.advanceTick(state);
  return fisher.carrying.fish ?? 0;
}

{
  const normal = fisherCatch(2026070927, false);
  const drought = fisherCatch(2026070927, true);
  assert.ok(normal > 0);
  assert.ok(Math.abs(drought / normal - CONFIG.disasters.drought.fishYieldMultiplier) < 0.001);
}

console.log('worker slot production tests passed');
