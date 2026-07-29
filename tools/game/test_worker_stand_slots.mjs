// 야외 작업자 자리 — 등록한 칸이 있으면 장작꾼이 매번 그 칸에 선다.
//
// 등록 전과 후를 모두 확인한다. 레지스트리는 코드젠이 굽는 상수라 런타임에 못 바꾸므로,
// data/worker-slots.json을 실제로 쓰고 다시 생성해 두 상태를 각각 컴파일한다.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SLOT_DATA = join(ROOT, 'tools', 'sprite-studio', 'data', 'worker-slots.json');
const GENERATOR = join(ROOT, 'tools', 'sprite-studio', 'generate_registries.mjs');

function compileGameModules() {
  const srcDir = join(ROOT, 'src', 'game');
  const outDir = mkdtempSync(join(tmpdir(), 'northern-stand-slots-'));
  for (const file of readdirSync(srcDir).filter(name => name.endsWith('.ts'))) {
    const source = readFileSync(join(srcDir, file), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) => {
      if (/\.[cm]?js$/.test(spec)) return `${start}${spec}${end}`;
      return `${start}${spec}.mjs${end}`;
    });
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

async function loadGame() {
  const dir = compileGameModules();
  const load = name => import(pathToFileURL(join(dir, `${name}.mjs`)).href);
  return {
    buildings: await load('buildings'),
    simulation: await load('simulation'),
    workerSlots: await load('workerSlots'),
    slotRegistry: await load('buildingWorkerSlots'),
  };
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
  state.exploration = { explored: state.map.map(row => row.map(() => true)) };
}

function addBuilt(game, state, type, x, y, overrides = {}) {
  const building = {
    id: 9700 + state.buildings.length,
    type,
    x,
    y,
    progress: game.buildings.BUILDING_DEFS[type].buildDays,
    built: true,
    fieldGrowth: 0,
    ...overrides,
  };
  state.buildings.push(building);
  game.buildings.occupyBuildingTiles(state, building);
  return building;
}

function makeSplitter(state, index, x, y) {
  const resident = state.residents[index];
  Object.assign(resident, {
    alive: true, sick: false, health: 100, hunger: 100, warmth: 100, morale: 70,
    job: 'woodSplitter', assignedBuildingId: null,
    x, y, px: x, py: y, phase: 'rest', path: [], workTimer: 0,
    targetId: null, carrying: {}, manualOrder: null, skills: {},
  });
  return resident;
}

/** 장작마당 하나와 장작꾼 둘을 세우고, 둘 다 자리 잡을 때까지 굴린다. */
function runShed(game, seed, { blockTile } = {}) {
  const state = game.simulation.newGame(seed);
  clearMapToPlain(state);
  state.rank = 'bu';
  state.day = 1;
  state.subTick = 9;
  state.weather = 'clear';
  addBuilt(game, state, 'center', 2, 2);
  const shed = addBuilt(game, state, 'woodShed', 10, 10, { inventory: { wood: 400 } });
  const dims = game.buildings.buildingFootprintDims(shed);

  for (const resident of state.residents) resident.alive = false;
  const splitters = [makeSplitter(state, 0, 6, 6), makeSplitter(state, 1, 16, 16)];
  splitters.sort((a, b) => a.id - b.id);
  for (const splitter of splitters) {
    assert.equal(game.workerSlots.assignResidentToBuilding(state, splitter.id, shed.id), null);
  }

  if (blockTile) {
    // 한 칸짜리 통행 불가 건물로 자리를 막는다 (2칸 건물은 장작마당 발자국과 겹친다).
    addBuilt(game, state, 'palisade', shed.x + blockTile.dx, shed.y + blockTile.dy);
  }

  for (let i = 0; i < 60; i++) {
    state.pendingChoice = null;
    state.weather = 'clear';
    game.simulation.advanceTick(state);
    if (splitters.every(splitter => splitter.phase === 'working')) break;
  }
  return { state, shed, dims, splitters };
}

/** 게임의 상호작용 판정과 같은 기준 — 발자국 칸에서 체비쇼프 거리 1 (대각 포함). */
function isAdjacentToFootprint(game, state, shed, dims, resident) {
  const footprint = game.buildings.buildingFootprintTiles(state, shed.type, shed.x, shed.y) ??
    Array.from({ length: dims.w * dims.h }, (_unused, i) => ({
      x: shed.x + (i % dims.w), y: shed.y + Math.floor(i / dims.w),
    }));
  return footprint.some(tile =>
    Math.max(Math.abs(tile.x - resident.x), Math.abs(tile.y - resident.y)) === 1);
}

const originalSlotData = readFileSync(SLOT_DATA, 'utf8');
const regenerate = payload => {
  writeFileSync(SLOT_DATA, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  execFileSync('node', [GENERATOR], { stdio: 'pipe' });
};

const SLOTS = [
  { tileDX: -1, tileDY: 1, offsetX: 3, offsetY: -2, facing: 1 },
  { tileDX: 2, tileDY: 1, offsetX: -3, offsetY: -2, facing: -1 },
];

try {
  // ── 1. 등록 전 — 건물 옆 아무 칸 (레지스트리 도입 이전 동작) ──
  regenerate({});
  {
    const game = await loadGame();
    assert.deepEqual(game.slotRegistry.buildingWorkerSlots('woodShed'), [], '빈 데이터에는 자리가 없다');
    const { state, shed, dims, splitters } = runShed(game, 2026072901);
    for (const splitter of splitters) {
      assert.equal(splitter.phase, 'working', '등록 전에도 장작꾼은 일한다');
      assert.ok(
        isAdjacentToFootprint(game, state, shed, dims, splitter),
        '등록 전에는 발자국에 인접한 아무 칸에 선다',
      );
    }
  }

  // ── 2. 등록 후 — 배정 순번대로 정해진 칸 ──
  regenerate({ woodShed: SLOTS });

  const game = await loadGame();
  assert.equal(game.slotRegistry.buildingWorkerSlots('woodShed').length, 2, '자리 둘이 구워졌다');

  const first = runShed(game, 2026072902);
  first.splitters.forEach((splitter, index) => {
    assert.equal(splitter.phase, 'working', `${index}번 장작꾼이 일한다`);
    assert.equal(splitter.x, first.shed.x + SLOTS[index].tileDX, `${index}번 장작꾼의 가로 자리`);
    assert.equal(splitter.y, first.shed.y + SLOTS[index].tileDY, `${index}번 장작꾼의 세로 자리`);
  });

  // 같은 상황을 다시 굴려도 같은 사람이 같은 칸에 선다 (id 오름차순 결정적 배정).
  const again = runShed(game, 2026072902);
  again.splitters.forEach((splitter, index) => {
    assert.equal(splitter.x, first.splitters[index].x, `${index}번 자리는 되풀이해도 같다`);
    assert.equal(splitter.y, first.splitters[index].y, `${index}번 자리는 되풀이해도 같다`);
  });

  // ── 3. 자리가 막히면 현행으로 되돌아간다 ──
  const blocked = runShed(game, 2026072903, { blockTile: { dx: -1, dy: 1 } });
  const displaced = blocked.splitters[0];
  assert.equal(displaced.phase, 'working', '자리가 막혀도 장작꾼은 일한다');
  assert.ok(
    displaced.x !== blocked.shed.x - 1 || displaced.y !== blocked.shed.y + 1,
    '막힌 칸에는 서지 않는다',
  );
  assert.ok(
    isAdjacentToFootprint(game, blocked.state, blocked.shed, blocked.dims, displaced),
    '막히면 발자국 인접 칸으로 되돌아간다',
  );
} finally {
  writeFileSync(SLOT_DATA, originalSlotData, 'utf8');
  execFileSync('node', [GENERATOR], { stdio: 'pipe' });
}

console.log('worker stand slot tests passed');
