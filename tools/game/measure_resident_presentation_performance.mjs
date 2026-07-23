import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';

const DEFAULT_SRC_ROOT = fileURLToPath(new URL('../../src/', import.meta.url));
const SOURCE_ARG_INDEX = process.argv.indexOf('--source-root');
const SRC_ROOT = resolve(SOURCE_ARG_INDEX >= 0 ? process.argv[SOURCE_ARG_INDEX + 1] : DEFAULT_SRC_ROOT);
const SAMPLE_COUNT = 240;

function compileModules() {
  const outDir = mkdtempSync(join(tmpdir(), 'northern-presentation-perf-'));
  for (const dir of ['game', 'render']) {
    const sourceDir = join(SRC_ROOT, dir);
    for (const file of readdirSync(sourceDir).filter(candidate => candidate.endsWith('.ts'))) {
      let output = ts.transpileModule(readFileSync(join(sourceDir, file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) =>
        /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
      const target = join(outDir, dir, file.replace(/\.ts$/, '.mjs'));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, output, 'utf8');
    }
  }
  return outDir;
}

function percentile(sorted, ratio) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    count: samples.length,
    medianMs: Number(percentile(sorted, 0.5).toFixed(4)),
    p95Ms: Number(percentile(sorted, 0.95).toFixed(4)),
    maxMs: Number((sorted.at(-1) ?? 0).toFixed(4)),
  };
}

function benchmark(samples, callback) {
  const timings = [];
  for (let index = 0; index < samples; index++) {
    const start = performance.now();
    callback(index);
    timings.push(performance.now() - start);
  }
  return stats(timings);
}

function fakeContext(canvas) {
  const gradient = { addColorStop() {} };
  const noop = () => undefined;
  return new Proxy({
    canvas,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    measureText: text => ({ width: String(text).length * 6 }),
    getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
  }, {
    get(target, property) {
      if (property in target) return target[property];
      return noop;
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });
}

function fakeCanvas(width = 900, height = 700) {
  const canvas = { width, height, getContext: null };
  const context = fakeContext(canvas);
  canvas.getContext = () => context;
  return canvas;
}

function makeStressState(simulation, buildings) {
  const state = simulation.newGame(2026072309);
  state.rank = 'bu';
  for (const row of state.exploration.explored) row.fill(true);
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

  const workplaceTypes = [
    'smithy', 'clinic', 'school', 'charcoalKiln', 'dryingRack', 'onggiKiln',
    'field', 'paddy', 'ferry', 'cemetery', 'mine', 'lumberCamp',
  ];
  const stressBuildings = [];
  for (let index = 0; index < 96; index++) {
    const type = workplaceTypes[index % workplaceTypes.length];
    const x = 1 + (index * 3) % Math.max(4, state.map[0].length - 4);
    const y = 1 + (Math.floor(index / 12) * 4) % Math.max(4, state.map.length - 4);
    stressBuildings.push({
      id: 10000 + index,
      type,
      x,
      y,
      w: type === 'field' || type === 'paddy' ? 3 : undefined,
      h: type === 'field' || type === 'paddy' ? 3 : undefined,
      built: true,
      progress: buildings.BUILDING_DEFS[type].buildDays,
      cropId: type === 'field' ? 'millet' : type === 'paddy' ? 'rice' : null,
      queuedCropId: null,
      sownArea: type === 'field' || type === 'paddy' ? 9 : undefined,
      fieldGrowth: type === 'field' || type === 'paddy' ? 70 : 0,
      inventory: {},
      plowOxen: type === 'field' || type === 'paddy' ? 1 : undefined,
    });
  }
  state.buildings = stressBuildings;
  for (let index = 0; index < state.residents.length; index++) {
    const resident = state.residents[index];
    const building = stressBuildings[index % stressBuildings.length];
    resident.alive = true;
    resident.sick = false;
    resident.stage = null;
    resident.special = undefined;
    resident.assignedBuildingId = building.id;
    resident.phase = index % 5 === 0 ? 'rest' : 'working';
    resident.x = building.x;
    resident.y = building.y;
    resident.px = index % 7 === 0 ? Math.max(0, building.x - 1) : building.x;
    resident.py = building.y;
    resident.task = building.type === 'field' || building.type === 'paddy' ? '조 재배 중' : '작업 중';
    resident.path = [];
  }
  return state;
}

const outDir = compileModules();
try {
  const load = (dir, name) => import(pathToFileURL(join(outDir, dir, `${name}.mjs`)).href);
  const simulation = await load('game', 'simulation');
  const buildings = await load('game', 'buildings');
  const renderer = await load('render', 'renderer');
  const presentationPath = join(outDir, 'render', 'residentPresentation.mjs');
  const presentation = existsSync(presentationPath) ? await import(pathToFileURL(presentationPath).href) : null;
  const state = makeStressState(simulation, buildings);
  const canvas = fakeCanvas();
  globalThis.document = { createElement: () => fakeCanvas(canvas.width, canvas.height) };
  globalThis.window = {};
  const sprites = {
    id: 'presentation-perf-noop',
    drawTerrain() {}, drawBuilding() {}, drawBuildingDamage() {}, drawForeignStructure() { return false; },
    drawResident() {}, drawExpedition() {}, drawRaiders() {},
  };

  let snapshot = presentation?.buildResidentPresentationSnapshot(state);
  const snapshotBuild = presentation
    ? benchmark(SAMPLE_COUNT, () => { snapshot = presentation.buildResidentPresentationSnapshot(state); })
    : null;
  let cacheIdentityStable = null;
  let snapshotCacheHit = null;
  if (presentation) {
    const cache = presentation.createResidentPresentationSnapshotCache();
    const first = cache.get(state, 42);
    cacheIdentityStable = true;
    snapshotCacheHit = benchmark(SAMPLE_COUNT * 10, () => {
      if (cache.get(state, 42) !== first) cacheIdentityStable = false;
    });
    snapshot = first;
  }

  const hitTest = benchmark(SAMPLE_COUNT * 10, index => {
    const resident = state.residents[index % state.residents.length];
    renderer.findResidentAt(state, resident.x * 28 + 14, resident.y * 28 + 14, 0.5, 18, snapshot);
  });

  const sceneOptions = index => ({
    alpha: 0.5,
    animationTimeMs: 1000 + index * 16.6667,
    hover: null,
    placingType: null,
    selected: null,
    selectedResidentId: null,
    residentPresentation: snapshot,
    sprites,
    viewport: {
      pixelX: (index % 8) * 28,
      pixelY: (index % 5) * 28,
      pixelWidth: canvas.width,
      pixelHeight: canvas.height,
      tileMinX: index % 8,
      tileMinY: index % 5,
      tileMaxX: index % 8 + Math.ceil(canvas.width / 28),
      tileMaxY: index % 5 + Math.ceil(canvas.height / 28),
    },
  });
  renderer.renderScene(canvas, state, sceneOptions(0));
  globalThis.gc?.();
  const heapBefore = process.memoryUsage().heapUsed;
  const renderScene = benchmark(SAMPLE_COUNT, index => renderer.renderScene(canvas, state, sceneOptions(index)));
  globalThis.gc?.();
  const heapAfter = process.memoryUsage().heapUsed;

  const result = {
    sourceRoot: SRC_ROOT,
    residents: state.residents.length,
    buildings: state.buildings.length,
    samples: SAMPLE_COUNT,
    snapshotBuild,
    snapshotCacheHit,
    snapshotCacheIdentityStable: cacheIdentityStable,
    findResidentAt: hitTest,
    renderScenePanning: renderScene,
    gcAvailable: typeof globalThis.gc === 'function',
    heapDeltaAfterGcBytes: heapAfter - heapBefore,
  };
  console.table({
    snapshotBuild: snapshotBuild ?? {},
    snapshotCacheHit: snapshotCacheHit ?? {},
    findResidentAt: hitTest,
    renderScenePanning: renderScene,
  });
  console.log(JSON.stringify(result));
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
