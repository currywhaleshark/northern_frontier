import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function transpile(source) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) => {
    if (/\.[cm]?js$/.test(spec)) return `${start}${spec}${end}`;
    return `${start}${spec}.mjs${end}`;
  });
}

const rootDir = mkdtempSync(join(tmpdir(), 'northern-area-expansion-'));
const gameDir = join(rootDir, 'game');
mkdirSync(gameDir, { recursive: true });
for (const file of readdirSync(new URL('../../src/game/', import.meta.url)).filter(file => file.endsWith('.ts'))) {
  const source = readFileSync(new URL(`../../src/game/${file}`, import.meta.url), 'utf8');
  writeFileSync(join(gameDir, file.replace(/\.ts$/, '.mjs')), transpile(source), 'utf8');
}

const simulation = await import(pathToFileURL(join(gameDir, 'simulation.mjs')).href);
const buildings = await import(pathToFileURL(join(gameDir, 'buildings.mjs')).href);
const exploration = await import(pathToFileURL(join(gameDir, 'exploration.mjs')).href);
const pastures = await import(pathToFileURL(join(gameDir, 'pastures.mjs')).href);

function findClearExploredRect(state, width, height) {
  for (let y = 0; y <= state.map.length - height; y++) {
    for (let x = 0; x <= state.map[y].length - width; x++) {
      let clear = true;
      for (let dy = 0; dy < height && clear; dy++) {
        for (let dx = 0; dx < width; dx++) {
          const tile = state.map[y + dy][x + dx];
          if (tile.buildingId != null || !exploration.isExplored(state, x + dx, y + dy)) {
            clear = false;
            break;
          }
        }
      }
      if (clear) return { x, y };
    }
  }
  throw new Error(`No clear explored ${width}x${height} rectangle`);
}

const state = simulation.newGame(24681357);
state.rank = 'bu';
state.foreignSites = [];
for (const resource of Object.keys(state.resources)) state.resources[resource] = 1000;

const fieldSpot = findClearExploredRect(state, 3, 3);
for (let y = fieldSpot.y; y < fieldSpot.y + 3; y++) {
  for (let x = fieldSpot.x; x < fieldSpot.x + 3; x++) state.map[y][x].terrain = 'plain';
}
assert.equal(simulation.tryPlaceBuilding(state, 'field', fieldSpot.x, fieldSpot.y, 1, 1), null);
const field = state.buildings.at(-1);
field.built = true;
field.progress = buildings.BUILDING_DEFS.field.buildDays;
const toolsBefore = state.resources.tools;
assert.equal(simulation.expandAreaBuilding(state, field.id, fieldSpot.x, fieldSpot.y, 2, 1), null);
assert.equal(field.w, 2);
assert.equal(field.expansion.addedTiles, 1);
assert.equal(state.resources.tools, toolsBefore - 1, 'only the added field tile is charged');
assert.equal(buildings.plotArea(field), 1, 'new field capacity waits for expansion completion');
delete field.expansion;
assert.equal(buildings.plotArea(field), 2);

const stableSpot = findClearExploredRect(state, 5, 3);
for (let y = stableSpot.y; y < stableSpot.y + 3; y++) {
  for (let x = stableSpot.x; x < stableSpot.x + 5; x++) state.map[y][x].terrain = 'plain';
}
assert.equal(simulation.tryPlaceBuilding(state, 'stable', stableSpot.x, stableSpot.y), null);
const stable = state.buildings.at(-1);
stable.built = true;
stable.progress = buildings.BUILDING_DEFS.stable.buildDays;
stable.livestock.headcount = 0;
assert.equal(simulation.defineStablePasture(state, stable.id, stableSpot.x + 2, stableSpot.y, 1, 1), null);
const pastureWoodBefore = state.resources.wood;
assert.equal(simulation.expandAreaBuilding(state, stable.id, stableSpot.x + 2, stableSpot.y, 2, 1), null);
assert.equal(stable.expansion.kind, 'pasture');
assert.equal(state.resources.wood, pastureWoodBefore - 1);
assert.equal(pastures.pastureTileCount(stable), 1, 'new pasture capacity waits for builders');
delete stable.expansion;
assert.equal(pastures.pastureTileCount(stable), 2);

const agentsSource = readFileSync(new URL('../../src/game/agents.ts', import.meta.url), 'utf8');
assert.match(agentsSource, /isPlotBuildingType\(building\.type\) \? 'farmer' : 'builder'/);
assert.match(agentsSource, /const construction = farmerConstructionTarget\(state, r\)/);

console.log('area expansion tests passed');
