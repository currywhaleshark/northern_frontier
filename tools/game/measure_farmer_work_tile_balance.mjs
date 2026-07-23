import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const DEFAULT_SOURCE_ROOT = fileURLToPath(new URL('../../src/game/', import.meta.url));
const SOURCE_ARG_INDEX = process.argv.indexOf('--source-root');
const SOURCE_ROOT = resolve(SOURCE_ARG_INDEX >= 0 ? process.argv[SOURCE_ARG_INDEX + 1] : DEFAULT_SOURCE_ROOT);
const SEED = 2026072306;

function compileGameModules() {
  const outDir = mkdtempSync(join(tmpdir(), 'northern-farmer-balance-'));
  for (const file of readdirSync(SOURCE_ROOT).filter(candidate => candidate.endsWith('.ts'))) {
    const source = readFileSync(join(SOURCE_ROOT, file), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) =>
      /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

function prepareMap(state) {
  for (const row of state.map) {
    for (const tile of row) {
      tile.terrain = 'plain';
      tile.hasIron = false;
      tile.buildingId = null;
    }
  }
  state.exploration = { explored: state.map.map(row => row.map(() => true)) };
}

function round(value, digits = 3) {
  return Number((value ?? 0).toFixed(digits));
}

const scenarios = [
  { id: 'field-1x1-f1-close-clear', width: 1, height: 1, farmers: 1, distance: 'close', weather: 'clear', oxen: 0 },
  { id: 'field-2x2-f1-close-clear', width: 2, height: 2, farmers: 1, distance: 'close', weather: 'clear', oxen: 0 },
  { id: 'field-2x2-f2-close-clear', width: 2, height: 2, farmers: 2, distance: 'close', weather: 'clear', oxen: 0 },
  { id: 'field-3x3-f1-close-clear', width: 3, height: 3, farmers: 1, distance: 'close', weather: 'clear', oxen: 0 },
  { id: 'field-3x3-f3-close-clear', width: 3, height: 3, farmers: 3, distance: 'close', weather: 'clear', oxen: 0 },
  { id: 'field-3x3-f3-close-clear-ox1', width: 3, height: 3, farmers: 3, distance: 'close', weather: 'clear', oxen: 1 },
  { id: 'field-3x3-f3-close-clear-ox2', width: 3, height: 3, farmers: 3, distance: 'close', weather: 'clear', oxen: 2 },
  { id: 'field-3x3-f3-far-clear', width: 3, height: 3, farmers: 3, distance: 'far', weather: 'clear', oxen: 0 },
  { id: 'field-3x3-f3-close-rain', width: 3, height: 3, farmers: 3, distance: 'close', weather: 'rain', oxen: 0 },
  { id: 'field-3x3-f3-close-heavy-snow', width: 3, height: 3, farmers: 3, distance: 'close', weather: 'heavySnow', oxen: 0 },
];

function createScenarioState(modules, scenario) {
  const state = modules.simulation.newGame(SEED);
  const center = state.buildings.find(building => building.type === 'center');
  prepareMap(state);
  state.buildings = center ? [center] : [];
  if (center) modules.buildings.occupyBuildingTiles(state, center);
  state.day = 1;
  state.subTick = 0;
  state.weather = scenario.weather;
  state.resources.tools = 1000;
  state.resources.food = 1000;
  state.resources.firewood = 1000;

  const plot = {
    id: 9100,
    type: 'field',
    x: 10,
    y: 10,
    w: scenario.width,
    h: scenario.height,
    built: true,
    progress: modules.buildings.BUILDING_DEFS.field.buildDays,
    fieldGrowth: 0,
    cropId: 'millet',
    queuedCropId: null,
    sownArea: 0,
    plowOxen: scenario.oxen,
    inventory: {},
  };
  state.buildings.push(plot);
  modules.buildings.occupyBuildingTiles(state, plot);

  if (scenario.oxen > 0) {
    state.buildings.push({
      id: 9200,
      type: 'stable',
      x: 20,
      y: 20,
      built: true,
      progress: modules.buildings.BUILDING_DEFS.stable.buildDays,
      fieldGrowth: 0,
      livestock: { species: 'cattle', headcount: scenario.oxen, growth: 0, feedShortageDays: 0 },
    });
  }

  const farmers = state.residents.slice(0, scenario.farmers);
  for (const resident of state.residents) resident.alive = farmers.includes(resident);
  for (let index = 0; index < farmers.length; index++) {
    const startX = scenario.distance === 'far' ? 2 : plot.x;
    const startY = scenario.distance === 'far' ? 2 + index : plot.y + (index % scenario.height);
    Object.assign(farmers[index], {
      alive: true,
      sick: false,
      quarantinedUntil: 0,
      health: 100,
      hunger: 100,
      warmth: 100,
      morale: 70,
      job: 'farmer',
      assignedBuildingId: null,
      x: startX,
      y: startY,
      px: startX,
      py: startY,
      phase: 'rest',
      path: [],
      workTimer: 0,
      targetId: null,
      carrying: {},
      cartEquipped: false,
      task: '대기',
      skills: { farmer: 0 },
      manualOrder: null,
      haulTask: null,
    });
    const error = modules.workerSlots.assignResidentToBuilding(state, farmers[index].id, plot.id);
    if (error) throw new Error(`${scenario.id}: ${error}`);
  }
  return { state, plot, farmers };
}

function sustainScenario(state, farmers, weather) {
  for (const farmer of farmers) {
    farmer.alive = true;
    farmer.sick = false;
    farmer.quarantinedUntil = 0;
    farmer.health = 100;
    farmer.hunger = 100;
    farmer.warmth = 100;
    farmer.morale = 70;
  }
  state.weather = weather;
  state.pendingChoice = null;
  state.raiders = null;
  state.raidHold = false;
}

function runScenario(modules, scenario) {
  const { state, plot, farmers } = createScenarioState(modules, scenario);
  const subticksPerDay = modules.CONFIG.agents.subticksPerDay;
  const seasonTicks = modules.CONFIG.time.seasonDays * subticksPerDay;
  const totalTicks = seasonTicks * 4;
  const movementByFarmer = new Map(farmers.map(farmer => [farmer.id, 0]));
  const workByFarmer = new Map(farmers.map(farmer => [farmer.id, 0]));
  const movingByFarmer = new Map(farmers.map(farmer => [farmer.id, 0]));
  const visitsByFarmer = new Map(farmers.map(farmer => [farmer.id, new Map()]));
  let springEndSownArea = 0;
  let summerEndGrowth = 0;
  let autumnEndHarvest = 0;
  let day30Checkpoint = null;

  for (let tick = 0; tick < totalTicks; tick++) {
    sustainScenario(state, farmers, scenario.weather);
    const before = new Map(farmers.map(farmer => [farmer.id, { x: farmer.x, y: farmer.y }]));
    modules.simulation.advanceTick(state);
    for (const farmer of farmers) {
      const prior = before.get(farmer.id);
      const distance = Math.abs(farmer.x - prior.x) + Math.abs(farmer.y - prior.y);
      movementByFarmer.set(farmer.id, movementByFarmer.get(farmer.id) + distance);
      if (distance > 0 || farmer.phase === 'toWork') {
        movingByFarmer.set(farmer.id, movingByFarmer.get(farmer.id) + 1);
      }
      if (/(파종|재배|수확) 중$/.test(farmer.task) && farmer.x === farmer.px && farmer.y === farmer.py) {
        workByFarmer.set(farmer.id, workByFarmer.get(farmer.id) + 1);
        const visits = visitsByFarmer.get(farmer.id);
        const key = `${farmer.x},${farmer.y}`;
        visits.set(key, (visits.get(key) ?? 0) + 1);
      }
    }
    if (tick === seasonTicks - 1) springEndSownArea = plot.sownArea ?? 0;
    if (tick === seasonTicks * 2 - 1) summerEndGrowth = plot.fieldGrowth ?? 0;
    if (tick === seasonTicks * 3 - 1) {
      autumnEndHarvest = (plot.inventory?.grain ?? 0) + (plot.inventory?.rice ?? 0);
    }
    if (tick === 30 * subticksPerDay - 1) {
      day30Checkpoint = {
        day: state.day,
        subTick: state.subTick,
        sownArea: round(plot.sownArea ?? 0),
        fieldGrowth: round(plot.fieldGrowth ?? 0),
        inventory: round((plot.inventory?.grain ?? 0) + (plot.inventory?.rice ?? 0)),
        farmers: farmers.map(farmer => ({ id: farmer.id, x: farmer.x, y: farmer.y, task: farmer.task })),
      };
    }
  }

  return {
    id: scenario.id,
    dimensions: `${scenario.width}x${scenario.height}`,
    farmers: scenario.farmers,
    oxen: scenario.oxen,
    distance: scenario.distance,
    weather: scenario.weather,
    springEndSownArea: round(springEndSownArea),
    summerEndGrowth: round(summerEndGrowth),
    autumnEndHarvest: round(autumnEndHarvest),
    day30Checkpoint,
    movementTilesByFarmer: Object.fromEntries([...movementByFarmer].map(([id, value]) => [id, round(value)])),
    workSubticksByFarmer: Object.fromEntries(workByFarmer),
    movingSubticksByFarmer: Object.fromEntries(movingByFarmer),
    assignedCellVisitsByFarmer: Object.fromEntries(
      [...visitsByFarmer].map(([id, visits]) => [id, Object.fromEntries([...visits].sort())]),
    ),
  };
}

const outDir = compileGameModules();
try {
  const load = name => import(pathToFileURL(join(outDir, `${name}.mjs`)).href);
  const modules = {
    simulation: await load('simulation'),
    buildings: await load('buildings'),
    workerSlots: await load('workerSlots'),
    CONFIG: (await load('config')).CONFIG,
  };
  const first = scenarios.map(scenario => runScenario(modules, scenario));
  const repeat = scenarios.map(scenario => runScenario(modules, scenario));
  const deterministic = JSON.stringify(first) === JSON.stringify(repeat);
  const deterministic30Days = first.every((result, index) =>
    JSON.stringify(result.day30Checkpoint) === JSON.stringify(repeat[index].day30Checkpoint));
  if (!deterministic) throw new Error('farmer work tile balance scenarios are not deterministic');

  const result = {
    sourceRoot: SOURCE_ROOT,
    seed: SEED,
    subticksPerDay: modules.CONFIG.agents.subticksPerDay,
    seasonDays: modules.CONFIG.time.seasonDays,
    deterministic30Days,
    deterministicOneYear: deterministic,
    scenarios: first,
  };
  console.table(first.map(row => ({
    scenario: row.id,
    sown: row.springEndSownArea,
    growth: row.summerEndGrowth,
    harvest: row.autumnEndHarvest,
    movement: Object.values(row.movementTilesByFarmer).reduce((sum, value) => sum + value, 0),
    work: Object.values(row.workSubticksByFarmer).reduce((sum, value) => sum + value, 0),
  })));
  console.log(JSON.stringify(result));
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
