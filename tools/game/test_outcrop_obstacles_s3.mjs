import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-outcrop-obstacles-s3-'));
  for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) =>
      /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const compiledDir = compileGameModules();
const load = name => import(pathToFileURL(join(compiledDir, `${name}.mjs`)).href);
const simulation = await load('simulation');
const agents = await load('agents');
const raidRoutes = await load('raidRoutes');
const workerSlots = await load('workerSlots');
const saveLoad = await load('saveLoad');
const { CONFIG } = await load('config');

function clearToPlain(state) {
  for (const row of state.map) {
    for (const tile of row) {
      tile.terrain = 'plain';
      tile.hasIron = false;
      tile.hasSilver = false;
      tile.mineralRemaining = 0;
      tile.buildingId = null;
    }
  }
  state.buildings = [];
  state.exploration = { explored: state.map.map(row => row.map(() => true)) };
}

function setOutcrop(state, x, y, amount) {
  const tile = state.map[y][x];
  Object.assign(tile, { terrain: 'rock', hasIron: false, hasSilver: false, mineralRemaining: amount, buildingId: null });
  return tile;
}

function onlyMiner(state, x, y) {
  const miner = state.residents[0];
  for (const resident of state.residents) resident.alive = resident.id === miner.id;
  Object.assign(miner, {
    alive: true, sick: false, health: 100, hunger: 100, warmth: 100, morale: 70,
    job: 'miner', x, y, px: x, py: y, phase: 'rest', path: [], workTimer: 0,
    targetId: null, carrying: {}, assignedBuildingId: null,
  });
  return miner;
}

function addMine(state, x, y) {
  const mine = { id: state.nextBuildingId++, type: 'mine', x, y, progress: 99, built: true, fieldGrowth: 0 };
  state.buildings.push(mine);
  state.map[y][x].buildingId = mine.id;
  return mine;
}

function installStorage(backing = new Map()) {
  globalThis.localStorage = {
    get length() { return backing.size; },
    getItem: key => backing.get(key) ?? null,
    setItem: (key, value) => backing.set(key, String(value)),
    removeItem: key => backing.delete(key),
    key: index => [...backing.keys()][index] ?? null,
  };
  return backing;
}

// 지표 광상 자체는 자연 장벽이다. 수동 이동과 보통 주민 A* 모두 rock을 발판으로 쓰지 않는다.
{
  const state = simulation.newGame(2026080201);
  clearToPlain(state);
  const resident = state.residents[0];
  Object.assign(resident, { x: 5, y: 10, px: 5, py: 10, path: [], phase: 'rest' });
  const rock = setOutcrop(state, 6, 10, 5);
  for (let y = 0; y < state.map.length; y++) setOutcrop(state, 6, y, y === 10 ? 5 : 0);

  assert.equal(agents.isTerrainPassable(state, rock.x, rock.y), false, 'surface outcrops are not terrain-passable');
  assert.notEqual(simulation.issueResidentMoveOrder(state, resident.id, rock.x, rock.y), null,
    'a manual move order cannot target an outcrop');
  assert.equal(agents.findPath(state, 5, 10, tile => tile.x === 7 && tile.y === 10), null,
    'ordinary resident pathfinding cannot tunnel through a solid outcrop wall');
}

// 습격 경로는 주민과 별도 구현이므로 동일한 rock 장벽 계약을 직접 고정한다.
{
  const state = simulation.newGame(2026080202);
  clearToPlain(state);
  for (let y = 0; y < state.map.length; y++) setOutcrop(state, 12, y, y === 10 ? 5 : 0);
  const start = { x: 5, y: 10 };
  const target = { x: 19, y: 10 };
  assert.equal(raidRoutes.isRaidTileTraversable(state, 12, 10, false), false, 'raiders cannot traverse an outcrop');
  assert.equal(raidRoutes.planRaidRoute(state, start, target, 60), null,
    'raid planning cannot route through a solid outcrop wall');
}

// 광부는 광상 옆의 열린 칸에서 캐며, 바깥 광상이 고갈되어 평지가 된 뒤에만 안쪽 길이 열린다.
{
  const state = simulation.newGame(2026080203);
  state.rank = 'bo';
  for (const resource of Object.keys(state.resources)) state.resources[resource] = 1_000;
  clearToPlain(state);
  const mine = addMine(state, 8, 10);
  const outer = setOutcrop(state, 10, 10, 1);
  const inner = setOutcrop(state, 11, 10, 1);
  for (let y = 0; y < state.map.length; y++) {
    if (y !== 10) setOutcrop(state, 10, y, 0);
  }
  const miner = onlyMiner(state, 8, 10);
  assert.equal(workerSlots.assignResidentToBuilding(state, miner.id, mine.id), null);

  let outerDepletedAt = -1;
  let innerMinedAfterOpening = false;
  for (let tick = 0; tick < CONFIG.agents.subticksPerDay * 12; tick++) {
    simulation.advanceTick(state);
    assert.equal(agents.isTerrainPassable(state, miner.x, miner.y), true,
      'the miner remains on a passable work or travel tile');
    assert.notEqual(state.map[miner.y][miner.x].terrain, 'rock', 'the miner never stands on an outcrop');
    if (outerDepletedAt < 0 && outer.terrain === 'plain') outerDepletedAt = tick;
    if (inner.mineralRemaining < 1) {
      assert.ok(outerDepletedAt >= 0, 'the inner outcrop remains sealed until the outer outcrop opens the passage');
      innerMinedAfterOpening = true;
      break;
    }
  }
  assert.ok(outerDepletedAt >= 0, 'the outer outcrop is exhausted');
  assert.equal(outer.terrain, 'plain', 'exhausted outer outcrop becomes a passable plain opening');
  assert.equal(agents.isTerrainPassable(state, outer.x, outer.y), true, 'the opened outcrop tile is passable');
  assert.equal(innerMinedAfterOpening, true, 'the miner reaches the formerly sealed inner outcrop only after opening');
}

// 구 저장에서 지표 광상 위에 남은 주민은 로드 시 인접한 통행 가능 칸으로 되돌린다.
{
  const backing = installStorage();
  const state = simulation.newGame(2026080204);
  clearToPlain(state);
  const resident = state.residents[0];
  const rock = setOutcrop(state, 9, 9, 5);
  Object.assign(resident, { x: rock.x, y: rock.y, px: rock.x, py: rock.y, path: [] });
  assert.equal(saveLoad.saveGame(state), true);
  const [key, stored] = [...backing.entries()][0];
  const legacy = JSON.parse(stored);
  legacy.schemaVersion = saveLoad.CURRENT_SCHEMA_VERSION - 1;
  backing.set(key, JSON.stringify(legacy));

  const loaded = saveLoad.loadGame();
  const restored = loaded?.residents.find(candidate => candidate.id === resident.id);
  assert.ok(restored, 'legacy save loads');
  assert.equal(loaded.map[restored.y][restored.x].terrain === 'rock', false, 'resident is not left inside an outcrop');
  assert.equal(agents.isTerrainPassable(loaded, restored.x, restored.y), true, 'resident is relocated onto a passable tile');
}

console.log('outcrop obstacle S3 tests passed');
