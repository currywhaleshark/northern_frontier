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
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function centerBuilding(state) {
  const center = state.buildings.find(b => b.type === 'center');
  assert.ok(center, 'center exists');
  return center;
}

function openInteriorTile(state) {
  for (let y = 2; y < CONFIG.map.height - 2; y++) {
    for (let x = 2; x < CONFIG.map.width - 2; x++) {
      const tile = state.map[y][x];
      if (tile.buildingId == null) return tile;
    }
  }
  throw new Error('no open tile found');
}

function placeBuilt(state, type, tile) {
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

function setupSmithScenario(seed, withMiner) {
  const state = simulation.newGame(seed);
  const center = centerBuilding(state);
  const smithyTile = state.map[center.y][center.x];
  placeBuilt(state, 'smithy', smithyTile);

  const mineTile = openInteriorTile(state);
  mineTile.terrain = 'rock';
  mineTile.hasIron = true;
  placeBuilt(state, 'mine', mineTile);

  const smith = state.residents[0];
  const miner = state.residents[1];
  for (const resident of state.residents) resident.alive = false;

  Object.assign(smith, {
    alive: true,
    sick: false,
    health: 100,
    hunger: 100,
    warmth: 100,
    morale: 70,
    job: 'smith',
    x: smithyTile.x,
    y: smithyTile.y,
    px: smithyTile.x,
    py: smithyTile.y,
    phase: 'rest',
    path: [],
    workTimer: 0,
    targetId: null,
    carrying: {},
  });

  if (withMiner) {
    Object.assign(miner, {
      alive: true,
      sick: false,
      health: 100,
      hunger: 100,
      warmth: 100,
      morale: 70,
      job: 'miner',
      x: mineTile.x,
      y: mineTile.y,
      px: mineTile.x,
      py: mineTile.y,
      phase: 'rest',
      path: [],
      workTimer: 0,
      targetId: null,
      carrying: {},
    });
  }

  state.rank = 'bo';
  state.weather = 'clear';
  state.resources.iron = 0;
  state.resources.wood = 100;
  state.resources.tools = 0;
  state.processingReserves.iron = 0;
  state.processingReserves.wood = 0;

  return { state, smith, smithyTile };
}

{
  const { state, smith, smithyTile } = setupSmithScenario(8101, true);

  simulation.advanceTick(state);

  assert.equal(smith.task, '철 대기');
  assert.equal(smith.x, smithyTile.x, 'smith stays at the smithy when miners can supply iron');
  assert.equal(smith.y, smithyTile.y, 'smith stays at the smithy when miners can supply iron');
  assert.deepEqual(smith.path, []);
}

{
  const { state, smith } = setupSmithScenario(8102, false);

  simulation.advanceTick(state);

  assert.equal(smith.task, '철광으로 이동');
  assert.ok(smith.path.length > 0 || smith.phase === 'toWork', 'smith still self-mines when no miner is available');
}

console.log('smith miner priority tests passed');
