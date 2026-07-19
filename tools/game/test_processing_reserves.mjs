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

const store = new Map();
globalThis.localStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, value),
  removeItem: key => store.delete(key),
};

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const processing = await import(pathToFileURL(join(compiledDir, 'processing.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function centerTile(state) {
  const center = state.buildings.find(b => b.type === 'center');
  assert.ok(center, 'center exists');
  return state.map[center.y][center.x];
}

function onlyWorkerAt(state, job, tile) {
  const worker = state.residents[0];
  for (const resident of state.residents) resident.alive = resident.id === worker.id;
  Object.assign(worker, {
    alive: true,
    sick: false,
    health: 100,
    hunger: 100,
    warmth: 100,
    morale: 60,
    job,
    x: tile.x,
    y: tile.y,
    px: tile.x,
    py: tile.y,
    phase: 'rest',
    path: [],
    workTimer: 0,
    targetId: null,
    carrying: {},
  });
  return worker;
}

function addBuilt(state, type, tile) {
  const building = {
    id: 9000 + state.buildings.length,
    type,
    x: tile.x,
    y: tile.y,
    progress: 99,
    built: true,
    fieldGrowth: 0,
  };
  state.buildings.push(building);
  tile.buildingId = building.id;
  return building;
}

function runTicks(state, ticks) {
  for (let i = 0; i < ticks; i++) simulation.advanceTick(state);
}

{
  const state = simulation.newGame(701);
  assert.deepEqual(state.processingReserves, {
    wood: CONFIG.production.woodReserve,
    rice: 0,
    hide: 0,
    iron: 0,
    meat: 8,
    fish: 8,
  });
}

{
  const state = simulation.newGame(702);
  state.resources.rice = 10;
  processing.setProcessingReserve(state, 'rice', 10);
  assert.equal(processing.processableAmount(state, 'rice'), 0, 'watermill cannot use reserved rice');
}

{
  const state = simulation.newGame(703);
  state.resources.wood = 40;
  processing.setProcessingReserve(state, 'wood', 40);
  assert.equal(processing.processableAmount(state, 'wood'), 0, 'fuel processors cannot use reserved wood');
}

{
  const state = simulation.newGame(704);
  state.resources.iron = 8;
  processing.setProcessingReserve(state, 'iron', 8);
  assert.equal(processing.processableAmount(state, 'iron'), 0, 'smith cannot use reserved iron');
}

{
  const state = simulation.newGame(705);
  state.resources.hide = 6;
  processing.setProcessingReserve(state, 'hide', 6);
  assert.equal(processing.processableAmount(state, 'hide'), 0, 'tannery cannot use reserved hide');
}

{
  const state = simulation.newGame(706);
  delete state.processingReserves;
  store.set('buksae-save-v3', JSON.stringify(state));

  const loaded = saveLoad.loadGame();
  assert.ok(loaded, 'old save loads');
  assert.deepEqual(loaded.processingReserves, {
    wood: CONFIG.production.woodReserve,
    rice: 0,
    hide: 0,
    iron: 0,
    meat: 8,
    fish: 8,
  });
}

console.log('processing reserve tests passed');
