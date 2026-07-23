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
const residents = await import(pathToFileURL(join(compiledDir, 'residents.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function setupSingleHauler(seed = 9001) {
  const state = simulation.newGame(seed);
  const center = state.buildings.find(b => b.type === 'center');
  assert.ok(center, 'center exists');

  const hauler = state.residents.find(r => r.job === 'hauler') ?? state.residents[0];
  for (const resident of state.residents) resident.alive = resident.id === hauler.id;
  hauler.alive = true;
  hauler.sick = false;
  hauler.health = 100;
  hauler.morale = 50;
  hauler.job = 'hauler';
  hauler.x = center.x;
  hauler.y = center.y;
  hauler.px = center.x;
  hauler.py = center.y;
  hauler.phase = 'rest';
  hauler.path = [];
  hauler.workTimer = 0;
  hauler.targetId = null;
  hauler.carrying = {};
  hauler.haulTask = null;

  let siteTile = null;
  for (const row of state.map) {
    siteTile = row.find(tile => tile.buildingId == null && tile.terrain === 'plain');
    if (siteTile) break;
  }
  assert.ok(siteTile, 'production site tile exists');
  const site = {
    id: state.nextBuildingId++, type: 'field', x: siteTile.x, y: siteTile.y,
    progress: 3, built: true, fieldGrowth: 0, inventory: {},
  };
  state.buildings.push(site);
  siteTile.buildingId = site.id;
  hauler.x = site.x;
  hauler.y = site.y;
  hauler.px = site.x;
  hauler.py = site.y;

  state.weather = 'clear';
  state.resources.stone = 0;
  state.resources.tools = 10;
  return { state, hauler, site };
}

{
  const { state, hauler, site } = setupSingleHauler();
  site.inventory.meat = 2;
  site.inventory.stone = 9;
  simulation.advanceTick(state);

  const expectedCapacity = CONFIG.agents.haulerCarryCap * CONFIG.agents.carryCapacityMultiplier;
  assert.equal(hauler.carrying.meat, 2, 'food inventory is collected before stone');
  assert.equal(hauler.carrying.stone, expectedCapacity - 2,
    'remaining capacity includes the release carrying adjustment and is filled from the same site');
  assert.equal(Object.values(hauler.carrying).reduce((sum, amount) => sum + amount, 0), expectedCapacity);
  assert.equal(site.inventory.meat, 0);
  assert.equal(site.inventory.stone, 0);
}

{
  const { state, hauler, site } = setupSingleHauler();
  site.inventory.grain = 3;
  state.resources.grain = 0;
  state.resources.meat = 0;
  state.resources.fish = 0;
  state.resources.vegetables = 0;
  hauler.phase = 'toWork';
  hauler.path = [{ x: Math.min(hauler.x + 1, CONFIG.map.width - 1), y: hauler.y }];

  simulation.advanceTick(state);

  assert.equal(hauler.carrying.grain, 3, 'new production stock interrupts stale travel');
  assert.equal(hauler.phase, 'toDeposit');
  assert.deepEqual(hauler.path, []);
}

{
  const { state, hauler, site } = setupSingleHauler();
  site.inventory.tools = 1;
  state.resources.tools = 0;

  simulation.advanceTick(state);

  assert.equal(hauler.carrying.tools, 1, 'low tool stock makes even a small load urgent');
}

{
  const { state, hauler, site } = setupSingleHauler();
  site.inventory.carts = 1;
  state.resources.carts = 0;

  simulation.advanceTick(state);

  assert.equal(hauler.carrying.carts, 1, 'a completed cart is collected without waiting for a bulk load');
}

{
  const { state, hauler, site } = setupSingleHauler();
  const center = state.buildings.find(building => building.type === 'center');
  assert.ok(center, 'center exists for final-approach timing');
  state.map[site.y][site.x].buildingId = null;
  for (const row of state.map) {
    for (const tile of row) {
      if (tile.buildingId == null) tile.terrain = 'plain';
    }
  }
  const siteTile = state.map.flat().find(tile =>
    tile.buildingId == null && Math.abs(tile.x - center.x) + Math.abs(tile.y - center.y) === 4);
  assert.ok(siteTile, 'a deterministic final-approach path exists');
  site.x = siteTile.x;
  site.y = siteTile.y;
  siteTile.buildingId = site.id;
  hauler.x = site.x;
  hauler.y = site.y;
  hauler.px = site.x;
  hauler.py = site.y;
  site.inventory.carts = 1;
  state.resources.carts = 0;

  simulation.advanceTick(state);
  assert.equal(hauler.carrying.carts, 1, 'the hauler starts the delivery with cargo visible');

  let finalApproach = null;
  for (let tick = 0; tick < 80 && state.resources.carts === 0; tick++) {
    const before = {
      x: hauler.x, y: hauler.y, px: hauler.px, py: hauler.py,
      cargo: hauler.carrying.carts ?? 0,
    };
    simulation.advanceTick(state);
    if (state.resources.carts > 0) finalApproach = before;
  }

  assert.ok(finalApproach, 'the cargo reaches settlement storage');
  assert.ok(finalApproach.px !== finalApproach.x || finalApproach.py !== finalApproach.y,
    'the previous tick is still visually interpolating the final approach');
  assert.equal(finalApproach.cargo, 1,
    'cargo remains visible throughout the final approach');
  assert.equal(hauler.px, hauler.x, 'unloading waits until horizontal interpolation is complete');
  assert.equal(hauler.py, hauler.y, 'unloading waits until vertical interpolation is complete');
  assert.equal(hauler.carrying.carts ?? 0, 0, 'cargo is removed only after arrival');
  assert.equal(hauler.phase, 'rest', 'the hauler pauses at the destination after unloading');
}

{
  const { state, hauler, site } = setupSingleHauler();
  site.inventory.grain = 1;
  const rock = state.map.flat().find(tile =>
    tile.buildingId == null && Math.abs(tile.x - hauler.x) + Math.abs(tile.y - hauler.y) === 1);
  assert.ok(rock, 'an adjacent quarry tile exists');
  rock.terrain = 'rock';
  rock.mineralRemaining = 20;
  state.exploration.explored[rock.y][rock.x] = true;
  state.resources.grain = 100;
  state.resources.meat = 100;
  state.resources.fish = 100;
  state.resources.vegetables = 100;

  simulation.advanceTick(state);

  assert.equal(hauler.carrying.grain ?? 0, 0, 'small non-urgent loads wait for a useful batch');
  assert.equal(site.inventory.grain, 1);
  assert.equal(hauler.carrying.stone ?? 0, 0, 'an idle hauler never mines stone');
  assert.equal(rock.mineralRemaining, 20, 'idle hauling leaves the mineral deposit untouched');
  assert.match(hauler.task, /대기/, 'an idle hauler waits for transport work');
}

{
  const { state, hauler, site } = setupSingleHauler();
  site.inventory.grain = 30;
  state.resources.carts = 1;

  assert.equal(simulation.toggleResidentCart(state, hauler.id), null);
  assert.equal(hauler.cartEquipped, true);
  assert.equal(state.resources.carts, 0);
  simulation.advanceTick(state);

  assert.equal(hauler.carrying.grain,
    CONFIG.agents.haulerCartCarryCap * CONFIG.agents.carryCapacityMultiplier);
  assert.ok(simulation.toggleResidentCart(state, hauler.id)?.includes('짐을'));

  hauler.carrying = {};
  assert.equal(simulation.toggleResidentCart(state, hauler.id), null);
  assert.equal(hauler.cartEquipped, false);
  assert.equal(state.resources.carts, 1);

  assert.equal(simulation.toggleResidentCart(state, hauler.id), null);
  simulation.setResidentJob(state, hauler.id, 'farmer');
  assert.equal(hauler.cartEquipped, false, 'changing jobs returns the cart');
  assert.equal(state.resources.carts, 1);
}

{
  const { state, hauler } = setupSingleHauler();
  state.resources.carts = 1;
  assert.equal(simulation.toggleResidentCart(state, hauler.id), null);

  residents.killResident(state, hauler, 'test cause');

  assert.equal(hauler.cartEquipped, false, 'a dead hauler does not retain village equipment');
  assert.equal(state.resources.carts, 1, 'the cart is recovered on death');
}

console.log('hauler priority tests passed');
