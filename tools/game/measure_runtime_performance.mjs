import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';

const SEED = 20260717;
const COLD_TICKS = 24;
const PATH_SAMPLES = 30;
const DEFAULT_GAME_SOURCE_ROOT = fileURLToPath(new URL('../../src/game/', import.meta.url));
const SOURCE_ARG_INDEX = process.argv.indexOf('--source-root');
const GAME_SOURCE_ROOT = resolve(
  SOURCE_ARG_INDEX >= 0 ? process.argv[SOURCE_ARG_INDEX + 1] : DEFAULT_GAME_SOURCE_ROOT,
);

function compileGameModules(label) {
  const srcDir = GAME_SOURCE_ROOT;
  const outDir = mkdtempSync(join(tmpdir(), `northern-runtime-${label}-`));
  for (const file of readdirSync(srcDir).filter(candidate => candidate.endsWith('.ts'))) {
    const source = readFileSync(join(srcDir, file), 'utf8');
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

async function loadGameModules(label) {
  const outDir = compileGameModules(label);
  const load = file => import(pathToFileURL(join(outDir, file)).href);
  return {
    outDir,
    agents: await load('agents.mjs'),
    buildings: await load('buildings.mjs'),
    exploration: await load('exploration.mjs'),
    simulation: await load('simulation.mjs'),
  };
}

function percentile(sorted, ratio) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.reduce((sum, value) => sum + value, 0);
  return {
    count: samples.length,
    total: Number(total.toFixed(3)),
    mean: Number((samples.length > 0 ? total / samples.length : 0).toFixed(3)),
    p50: Number(percentile(sorted, 0.5).toFixed(3)),
    p95: Number(percentile(sorted, 0.95).toFixed(3)),
    max: Number((sorted.at(-1) ?? 0).toFixed(3)),
  };
}

function perfTotals(perf) {
  return Object.fromEntries(Object.entries(perf).map(([key, bucket]) => [key, bucket.total]));
}

function collectBucketDeltas(samplesByBucket, before, perf) {
  for (const [key, bucket] of Object.entries(perf)) {
    const delta = bucket.total - (before[key] ?? 0);
    if (delta <= 0) continue;
    const samples = samplesByBucket.get(key) ?? [];
    samples.push(delta);
    samplesByBucket.set(key, samples);
  }
}

function summarizeBuckets(samplesByBucket) {
  return Object.fromEntries(
    [...samplesByBucket.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, samples]) => [key, stats(samples)]),
  );
}

function resetPerf() {
  globalThis.window = { __renderPerf: {} };
  return globalThis.window.__renderPerf;
}

function runTicks(state, advanceTick, count) {
  const perf = resetPerf();
  const tickSamples = [];
  const samplesByBucket = new Map();
  for (let i = 0; i < count; i++) {
    const before = perfTotals(perf);
    const start = performance.now();
    advanceTick(state);
    tickSamples.push(performance.now() - start);
    collectBucketDeltas(samplesByBucket, before, perf);
  }
  return {
    ticks: stats(tickSamples),
    firstTickMs: Number((tickSamples[0] ?? 0).toFixed(3)),
    buckets: summarizeBuckets(samplesByBucket),
  };
}

function createStressState(state, buildings) {
  const sourceResidents = state.residents.map(resident => structuredClone(resident));
  while (state.residents.length < 120) {
    const source = sourceResidents[state.residents.length % sourceResidents.length];
    state.residents.push({
      ...structuredClone(source),
      id: state.nextResidentId++,
      path: [],
      manualOrder: null,
      assignedBuildingId: null,
    });
  }

  for (let y = 1; y < state.map.length - 2 && state.buildings.length < 96; y += 2) {
    for (let x = 1; x < state.map[y].length - 2 && state.buildings.length < 96; x += 2) {
      if (!buildings.canPlaceBuildingAt(state, 'hut', x, y)) continue;
      const building = {
        id: state.nextBuildingId++,
        type: 'hut',
        x,
        y,
        progress: buildings.BUILDING_DEFS.hut.buildDays,
        built: true,
        fieldGrowth: 0,
        cropId: null,
        queuedCropId: null,
      };
      state.buildings.push(building);
      buildings.occupyBuildingTiles(state, building);
    }
  }
  if (state.buildings.length < 96) {
    throw new Error(`stress fixture only placed ${state.buildings.length}/96 buildings`);
  }
  return state;
}

async function measureColdFirstPath() {
  const modules = await loadGameModules('cold-first-path');
  try {
    const state = modules.simulation.newGame(SEED);
    const result = runTicks(state, modules.simulation.advanceTick, COLD_TICKS);
    return {
      scenario: 'cold-first-path',
      seed: SEED,
      residents: state.residents.length,
      buildings: state.buildings.length,
      isolatedModuleInstance: true,
      ...result,
    };
  } finally {
    rmSync(modules.outDir, { recursive: true, force: true });
  }
}

async function measureStress() {
  const modules = await loadGameModules('stress-120x96');
  try {
    const state = createStressState(modules.simulation.newGame(SEED), modules.buildings);
    const result = runTicks(state, modules.simulation.advanceTick, modules.agents.SUBTICKS);
    return {
      scenario: 'stress-120-residents-96-buildings',
      seed: SEED,
      residents: state.residents.length,
      buildings: state.buildings.length,
      isolatedModuleInstance: true,
      ...result,
    };
  } finally {
    rmSync(modules.outDir, { recursive: true, force: true });
  }
}

function measurePathSamples(state, findPath, isGoal) {
  const resident = state.residents.find(candidate => candidate.alive);
  if (!resident) throw new Error('path benchmark needs a living resident');
  const samples = [];
  let pathLength = 0;
  for (let i = 0; i < PATH_SAMPLES; i++) {
    const start = performance.now();
    const path = findPath(state, resident.x, resident.y, isGoal);
    samples.push(performance.now() - start);
    pathLength = path?.length ?? 0;
  }
  return { pathLength, samples: stats(samples) };
}

async function measureExplorationLookup() {
  const modules = await loadGameModules('exploration-lookup');
  try {
    const state = modules.simulation.newGame(SEED);
    const helper = measurePathSamples(
      state,
      modules.agents.findPath,
      tile => modules.exploration.isExplored(state, tile.x, tile.y) && tile.terrain === 'forest',
    );
    const explored = state.exploration.explored;
    const raw = measurePathSamples(
      state,
      modules.agents.findPath,
      tile => explored[tile.y]?.[tile.x] === true && tile.terrain === 'forest',
    );
    return {
      scenario: 'exploration-lookup',
      seed: SEED,
      samplesPerVariant: PATH_SAMPLES,
      isolatedModuleInstance: true,
      helper,
      raw,
      helperToRawRatio: Number((helper.samples.mean / Math.max(0.0001, raw.samples.mean)).toFixed(2)),
    };
  } finally {
    rmSync(modules.outDir, { recursive: true, force: true });
  }
}

function printScenario(result) {
  console.log(`\n[runtime perf] ${result.scenario}`);
  if (result.ticks) {
    console.table({ ticks: result.ticks, ...result.buckets });
    console.log(`first tick: ${result.firstTickMs}ms`);
  } else {
    console.table({ helper: result.helper.samples, raw: result.raw.samples });
    console.log(`path length: ${result.helper.pathLength}, helper/raw mean ratio: ${result.helperToRawRatio}x`);
  }
  console.log(JSON.stringify(result));
}

const results = [
  await measureColdFirstPath(),
  await measureStress(),
  await measureExplorationLookup(),
];

for (const result of results) printScenario(result);

