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
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, v),
  removeItem: k => store.delete(k),
};

const compiledDir = compileGameModules();
const buildings = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function openTile(state) {
  for (let y = 1; y < CONFIG.map.height - 1; y++) {
    for (let x = 1; x < CONFIG.map.width - 1; x++) {
      const tile = state.map[y][x];
      if (tile.buildingId == null && tile.terrain !== 'river' && tile.terrain !== 'mountain' && tile.terrain !== 'rock') {
        return tile;
      }
    }
  }
  throw new Error('no open tile');
}

function addBuilt(state, type, tile = openTile(state)) {
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

function keepOnlyResident(state, index, job, tile) {
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
  return resident;
}

{
  const state = simulation.newGame(9101);
  const smithy = addBuilt(state, 'smithy');

  assert.equal(buildings.smithyProductOf(smithy), 'tools');
  assert.deepEqual(buildings.availableSmithyProducts('settlement'), ['tools']);
  assert.deepEqual(buildings.availableSmithyProducts('bo'), ['tools', 'spears']);
  assert.deepEqual(buildings.availableSmithyProducts('jin'), ['tools', 'spears', 'hornBows']);
  assert.deepEqual(buildings.availableSmithyProducts('bu'), ['tools', 'spears', 'hornBows', 'muskets']);

  assert.ok(simulation.setSmithyProduct(state, smithy.id, 'spears')?.includes('승격'));
  state.rank = 'bo';
  assert.equal(simulation.setSmithyProduct(state, smithy.id, 'spears'), null);
  assert.equal(smithy.smithyProduct, 'spears');
}

{
  const state = simulation.newGame(9102);
  state.rank = 'bo';
  const toolsSmithy = addBuilt(state, 'smithy');
  const spearSmithy = addBuilt(state, 'smithy');
  simulation.setSmithyProduct(state, spearSmithy.id, 'spears');

  keepOnlyResident(state, 0, 'smith', state.map[spearSmithy.y][spearSmithy.x]);
  state.weather = 'clear';
  state.resources.tools = 100;
  state.resources.iron = 10;
  state.resources.wood = 10;
  state.resources.spears = 0;
  state.processingReserves.iron = 0;
  state.processingReserves.wood = 0;

  simulation.advanceTick(state);

  assert.equal(buildings.smithyProductOf(toolsSmithy), 'tools');
  assert.ok(state.resources.spears > 0, 'smith uses the smithy whose selected product can be made');
  assert.ok(state.resources.iron < 10, 'spear production consumes processable iron');
  assert.ok(state.resources.wood < 10, 'spear production consumes processable wood');
}

{
  const state = simulation.newGame(9103);
  state.rank = 'bu';
  const smithy = addBuilt(state, 'smithy');
  simulation.setSmithyProduct(state, smithy.id, 'muskets');
  keepOnlyResident(state, 0, 'smith', state.map[smithy.y][smithy.x]);
  state.weather = 'clear';
  state.resources.iron = 10;
  state.resources.wood = 10;
  state.resources.tools = 10;
  state.resources.gunpowder = 0;
  state.resources.muskets = 0;
  state.processingReserves.iron = 0;
  state.processingReserves.wood = 0;

  simulation.advanceTick(state);

  assert.ok(state.resources.muskets > 0, 'bu smithies can make muskets');
  assert.equal(state.resources.gunpowder, 0, 'gunpowder is ammunition, not a musket crafting input');
}

{
  const state = simulation.newGame(9104);
  for (const resident of state.residents) resident.job = 'idle';
  for (const resident of state.residents.slice(0, 8)) resident.job = 'militia';
  state.resources.muskets = 2;
  state.resources.gunpowder = 5;
  state.resources.hornBows = 3;
  state.resources.spears = 10;

  assert.deepEqual(buildings.militiaWeaponAllocation(state), {
    muskets: 2,
    hornBows: 3,
    spears: 3,
    unarmed: 0,
  });
  assert.equal(
    buildings.computeDefense(state),
    5 +
      2 * CONFIG.raid.musketDefense +
      3 * CONFIG.raid.hornBowDefense +
      3 * CONFIG.raid.spearDefense,
  );

  state.resources.gunpowder = 0;
  assert.deepEqual(buildings.militiaWeaponAllocation(state), {
    muskets: 0,
    hornBows: 3,
    spears: 5,
    unarmed: 0,
  });
}

{
  const state = simulation.newGame(9105);
  const smithy = addBuilt(state, 'smithy');
  delete state.resources.spears;
  delete state.resources.hornBows;
  delete smithy.smithyProduct;

  saveLoad.saveGame(state);
  const loaded = saveLoad.loadGame();

  assert.equal(loaded.resources.spears, 0);
  assert.equal(loaded.resources.hornBows, 0);
  assert.equal(buildings.smithyProductOf(loaded.buildings.find(b => b.id === smithy.id)), 'tools');
}

console.log('smithy product tests passed');
