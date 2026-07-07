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
const mapModule = await import(pathToFileURL(join(compiledDir, 'map.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function countTerrain(map, terrain) {
  return map.reduce((sum, row) => sum + row.filter(tile => tile.terrain === terrain).length, 0);
}

function clearForest(state) {
  for (const row of state.map) {
    for (const tile of row) {
      if (tile.buildingId == null && tile.terrain !== 'river' && tile.terrain !== 'mountain' && tile.terrain !== 'rock') {
        tile.terrain = 'plain';
      } else if (tile.terrain === 'forest') {
        tile.terrain = 'plain';
      }
    }
  }
}

function stockpile(state) {
  for (const key of Object.keys(state.resources)) state.resources[key] = 10000;
}

{
  assert.equal(CONFIG.map.width, 56, 'long-game map width is expanded');
  assert.equal(CONFIG.map.height, 56, 'long-game map height is expanded');

  const generated = mapModule.generateMap(20260707).tiles;
  assert.equal(generated.length, 56, 'generated map uses expanded height');
  assert.equal(generated[0].length, 56, 'generated map uses expanded width');
  assert.ok(countTerrain(generated, 'forest') >= 500, 'expanded map starts with a deeper forest reserve');
}

{
  const state = simulation.newGame(20260708);
  stockpile(state);
  clearForest(state);
  assert.equal(countTerrain(state.map, 'forest'), 0, 'test starts with no forest seed tiles');

  const oldPioneer = CONFIG.agents.forestPioneerChance;
  const oldAdjacent = CONFIG.agents.forestRegrowChance;
  CONFIG.agents.forestPioneerChance = 1;
  CONFIG.agents.forestRegrowChance = 0;
  try {
    simulation.advanceDay(state);
  } finally {
    CONFIG.agents.forestPioneerChance = oldPioneer;
    CONFIG.agents.forestRegrowChance = oldAdjacent;
  }

  assert.ok(countTerrain(state.map, 'forest') > 0, 'forest can return even after all forest seed tiles are gone');
  for (const building of state.buildings) {
    assert.notEqual(state.map[building.y][building.x].terrain, 'forest', 'forest does not regrow under buildings');
  }
}

{
  const state = simulation.newGame(20260709);
  stockpile(state);
  const oldWidth = CONFIG.map.width;
  const oldHeight = CONFIG.map.height;
  CONFIG.map.width = state.map[0].length + 12;
  CONFIG.map.height = state.map.length + 12;
  try {
    assert.doesNotThrow(() => simulation.advanceDay(state), 'old smaller maps advance under larger map config');
  } finally {
    CONFIG.map.width = oldWidth;
    CONFIG.map.height = oldHeight;
  }
}

console.log('map forest regrowth tests passed');
