import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/game/dayCycle.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const {
  DAY_CYCLE_SUBTICKS,
  DAY_BANDS,
  LEGACY_WORK_SUBTICKS,
  WORK_RATE_SCALE,
  WORK_SUBTICKS,
  dayBandOf,
  isIndoors,
  normalizeDayCycleSubTick,
} = await import(moduleUrl);

assert.equal(DAY_CYCLE_SUBTICKS, 72);
assert.deepEqual(DAY_BANDS, {
  dawn: { start: 0, end: 8 },
  work: { start: 9, end: 44 },
  evening: { start: 45, end: 57 },
  night: { start: 58, end: 71 },
});
assert.equal(WORK_SUBTICKS, 36);
assert.equal(LEGACY_WORK_SUBTICKS, 8);
assert.equal(WORK_RATE_SCALE, 2 / 9,
  'economic work deltas normalize the denser work band against the legacy eight ticks');

const expectedBands = [
  ...Array(9).fill('dawn'),
  ...Array(36).fill('work'),
  ...Array(13).fill('evening'),
  ...Array(14).fill('night'),
];
assert.deepEqual(
  Array.from({ length: DAY_CYCLE_SUBTICKS }, (_, subTick) => dayBandOf(subTick)),
  expectedBands,
);
for (const invalid of [-1, 72, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.throws(() => dayBandOf(invalid), RangeError);
}
assert.equal(normalizeDayCycleSubTick(-1), 0);
assert.equal(normalizeDayCycleSubTick(7.8), 7);
assert.equal(normalizeDayCycleSubTick(99), 71);
assert.equal(normalizeDayCycleSubTick('invalid'), 0);

const state = {
  buildings: [
    { id: 1, type: 'hut', built: true },
    { id: 2, type: 'shrine', built: true },
    { id: 3, type: 'hermitage', built: true },
    { id: 4, type: 'market', built: true },
    { id: 5, type: 'hut', built: false },
  ],
};
const resident = (overrides) => ({
  phase: 'rest',
  homeBuildingId: 1,
  targetId: null,
  ...overrides,
});

assert.equal(isIndoors(state, resident({ phase: 'sleeping' })), true);
assert.equal(isIndoors(state, resident({ phase: 'sleeping', homeBuildingId: null })), false);
assert.equal(isIndoors(state, resident({ phase: 'sleeping', homeBuildingId: 5 })), false);
assert.equal(isIndoors(state, resident({ phase: 'toHome' })), false);
assert.equal(isIndoors(state, resident({ phase: 'toLeisure', targetId: 2 })), false);
assert.equal(isIndoors(state, resident({ phase: 'leisure', targetId: 2 })), true);
assert.equal(isIndoors(state, resident({ phase: 'leisure', targetId: 3 })), true);
assert.equal(isIndoors(state, resident({ phase: 'leisure', targetId: 4 })), false);
assert.equal(isIndoors(state, resident({ phase: 'leisure', targetId: null })), false);

const configSource = readFileSync(new URL('../../src/game/config.ts', import.meta.url), 'utf8');
assert.match(configSource, /subticksPerDay:\s*DAY_CYCLE_SUBTICKS\b/,
  'the simulation uses the shared seventy-two-subtick contract');
assert.match(configSource, /msPerDay:\s*\{\s*1:\s*48000,\s*3:\s*16000,\s*10:\s*4800\s*\}/,
  'all speeds keep the legacy real-time tick cadence over a forty-eight-second day');

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-daily-cycle-'));
  for (const file of readdirSync(srcDir).filter(candidate => candidate.endsWith('.ts'))) {
    const moduleSource = readFileSync(new URL(file, srcDir), 'utf8');
    let moduleOutput = ts.transpileModule(moduleSource, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    moduleOutput = moduleOutput.replace(
      /(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g,
      (_match, start, specifier, end) =>
        /\.[cm]?js$/.test(specifier) ? `${start}${specifier}${end}` : `${start}${specifier}.mjs${end}`,
    );
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), moduleOutput, 'utf8');
  }
  return outDir;
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
}

const compiledDir = compileGameModules();
try {
  const load = name => import(pathToFileURL(join(compiledDir, `${name}.mjs`)).href);
  const simulation = await load('simulation');
  const agents = await load('agents');
  const buildings = await load('buildings');
  const compiledDayCycle = await load('dayCycle');
  const { CONFIG } = await load('config');

  const state = simulation.newGame(2026072401);
  clearMapToPlain(state);
  const addBuilt = (type, x, y) => {
    const building = {
      id: state.nextBuildingId++,
      type,
      x,
      y,
      progress: buildings.BUILDING_DEFS[type].buildDays,
      built: true,
      fieldGrowth: 0,
    };
    state.buildings.push(building);
    buildings.occupyBuildingTiles(state, building);
    return building;
  };
  addBuilt('center', 4, 4);
  const home = addBuilt('hut', 12, 10);
  const active = state.residents[0];
  for (const candidate of state.residents) candidate.alive = candidate.id === active.id;
  Object.assign(active, {
    alive: true,
    job: 'idle',
    stage: null,
    sick: false,
    health: 100,
    x: 8,
    y: 10,
    px: 8,
    py: 10,
    phase: 'rest',
    path: [],
    workTimer: 0,
    targetId: null,
    homeBuildingId: home.id,
    assignedBuildingId: null,
    carrying: {},
    haulTask: null,
    manualOrder: null,
  });

  globalThis.window = { __renderPerf: {} };
  for (let subTick = compiledDayCycle.DAY_BANDS.dawn.start;
    subTick <= compiledDayCycle.DAY_BANDS.dawn.end; subTick++) {
    state.subTick = subTick;
    agents.agentsTick(state);
  }
  assert.equal(active.phase, 'rest');
  assert.equal(active.task, '아침 채비');

  for (let subTick = compiledDayCycle.DAY_BANDS.work.start;
    subTick <= compiledDayCycle.DAY_BANDS.work.end; subTick++) {
    state.subTick = subTick;
    agents.agentsTick(state);
  }
  assert.equal(globalThis.window.__renderPerf['job-idle'].count, 36,
    'the denser day exposes thirty-six work movement/action opportunities');

  Object.assign(active, { x: 8, y: 10, px: 8, py: 10, phase: 'rest', path: [], targetId: null });
  const resourcesBeforeLeisure = structuredClone(state.resources);
  const inventoriesBeforeLeisure = state.buildings.map(building => structuredClone(building.inventory ?? {}));
  const departureDelay = agents.eveningDepartureDelay(active.id, state.day);
  assert.ok(departureDelay === 1 || departureDelay === 2);
  state.subTick = compiledDayCycle.DAY_BANDS.evening.start;
  agents.agentsTick(state);
  assert.equal(active.phase, 'rest');
  assert.equal(active.task, '일 마무리');

  state.subTick = compiledDayCycle.DAY_BANDS.evening.start + departureDelay;
  agents.agentsTick(state);
  assert.equal(active.phase, 'toLeisure');
  assert.equal(active.targetId, state.buildings.find(building => building.type === 'center').id);
  assert.equal(active.task, '마실 나감');

  for (let subTick = state.subTick + 1;
    subTick <= compiledDayCycle.DAY_BANDS.evening.end; subTick++) {
    state.subTick = subTick;
    agents.agentsTick(state);
  }
  assert.equal(active.phase, 'leisure');
  assert.equal(active.task, '마실 중');
  assert.deepEqual(state.resources, resourcesBeforeLeisure,
    'evening leisure does not consume or produce settlement resources');
  assert.deepEqual(
    state.buildings.map(building => building.inventory ?? {}),
    inventoriesBeforeLeisure,
    'evening leisure does not change building inventories',
  );

  for (let subTick = compiledDayCycle.DAY_BANDS.night.start;
    subTick <= compiledDayCycle.DAY_BANDS.night.end; subTick++) {
    state.subTick = subTick;
    agents.agentsTick(state);
  }
  assert.equal(active.phase, 'sleeping');
  assert.equal(active.task, '잠자리에 듦');
  assert.equal(compiledDayCycle.isIndoors(state, active), true);

  const sleepingPosition = { x: active.x, y: active.y };
  state.subTick = compiledDayCycle.DAY_BANDS.night.end;
  agents.agentsTick(state);
  assert.deepEqual({ x: active.x, y: active.y }, sleepingPosition,
    'sleeping residents skip movement and work calculations');

  const leisureState = {
    day: 23,
    buildings: [
      { id: 1, type: 'center', built: true },
      { id: 2, type: 'market', built: true },
      { id: 3, type: 'shrine', built: true },
      { id: 4, type: 'hermitage', built: true },
      { id: 5, type: 'market', built: false },
    ],
  };
  const leisureResidents = Array.from({ length: 16 }, (_, index) => ({
    id: index + 1,
    alive: true,
    stage: null,
    sick: false,
    health: 100,
  }));
  leisureResidents[0].sick = true;
  leisureResidents[1].quarantinedUntil = leisureState.day + 1;
  leisureResidents[2].stage = 'infant';
  const destinations = agents.leisureDestinations(leisureState);
  assert.deepEqual(destinations.map(building => building.id), [3, 4, 2, 1],
    'leisure destinations prefer shrine/hermitage, then market, then center');

  const assignments = agents.leisureAssignments(leisureState, leisureResidents);
  assert.equal(assignments.has(1), false, 'sick residents skip evening leisure');
  assert.equal(assignments.has(2), false, 'quarantined residents skip evening leisure');
  assert.equal(assignments.has(3), false, 'infants skip evening leisure');
  const assignedCounts = new Map();
  for (const destinationId of assignments.values()) {
    assignedCounts.set(destinationId, (assignedCounts.get(destinationId) ?? 0) + 1);
  }
  assert.deepEqual([...assignedCounts.entries()], [[3, 4], [4, 4], [2, 4], [1, 1]],
    'four-person clusters spill into the next destination priority');
  assert.ok([...assignedCounts.values()].every(count => count <= agents.LEISURE_CLUSTER_CAPACITY));
  assert.deepEqual(
    [...agents.leisureAssignments(leisureState, leisureResidents)],
    [...assignments],
    'resident id and day produce stable leisure assignments',
  );
  assert.notDeepEqual(
    [...agents.leisureAssignments({ ...leisureState, day: leisureState.day + 1 }, leisureResidents)],
    [...assignments],
    'the deterministic dispersal rotates when the day changes',
  );
  const departureDelays = Array.from(
    { length: 16 },
    (_, index) => agents.eveningDepartureDelay(index + 1, leisureState.day),
  );
  assert.deepEqual(new Set(departureDelays), new Set([1, 2]),
    'resident id and day spread evening departures over one or two subticks');

  const fullDay = simulation.newGame(2026072402);
  const startingDay = fullDay.day;
  for (let tick = 0; tick < agents.SUBTICKS; tick++) simulation.advanceTick(fullDay);
  assert.equal(fullDay.day, startingDay + 1);
  assert.equal(fullDay.subTick, 0);

  const warmthState = simulation.newGame(2026072403);
  const warmthResident = warmthState.residents[0];
  for (const candidate of warmthState.residents) candidate.alive = candidate.id === warmthResident.id;
  Object.assign(warmthResident, {
    alive: true,
    stage: null,
    sick: false,
    health: 100,
    hunger: 100,
    warmth: 40,
  });
  warmthState.weather = 'clear';
  warmthState.resources.grain = 1000;
  warmthState.resources.firewood = 1000;
  for (let tick = 0; tick < agents.SUBTICKS; tick++) simulation.advanceTick(warmthState);
  assert.equal(
    warmthResident.warmth,
    40 + CONFIG.needs.warmthRegenWarmSeason,
    'the unchanged daily warmth recovery is applied once after the sleeping band',
  );
} finally {
  delete globalThis.window;
  rmSync(compiledDir, { recursive: true, force: true });
}

console.log('daily cycle contract tests passed');
