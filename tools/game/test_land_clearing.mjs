// 공사터 개간 — 나무를 낀 자리는 벌목꾼이 먼저 베고, 그 다음에 공사가 열린다.
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

const rootDir = mkdtempSync(join(tmpdir(), 'northern-land-clearing-'));
const gameDir = join(rootDir, 'game');
mkdirSync(gameDir, { recursive: true });
for (const file of readdirSync(new URL('../../src/game/', import.meta.url)).filter(f => f.endsWith('.ts'))) {
  const source = readFileSync(new URL(`../../src/game/${file}`, import.meta.url), 'utf8');
  writeFileSync(join(gameDir, file.replace(/\.ts$/, '.mjs')), transpile(source), 'utf8');
}

const simulation = await import(pathToFileURL(join(gameDir, 'simulation.mjs')).href);
const buildings = await import(pathToFileURL(join(gameDir, 'buildings.mjs')).href);
const exploration = await import(pathToFileURL(join(gameDir, 'exploration.mjs')).href);
const clearing = await import(pathToFileURL(join(gameDir, 'landClearing.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(gameDir, 'config.mjs')).href);

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

function freshState() {
  const state = simulation.newGame(20260727);
  state.rank = 'bu';
  state.foreignSites = [];
  for (const resource of Object.keys(state.resources)) state.resources[resource] = 1000;
  return state;
}

// ── 1. 숲을 낀 밭 지정은 거절이 아니라 개간 확인을 요구한다 ──
{
  const state = freshState();
  const spot = findClearExploredRect(state, 4, 4);
  for (let y = spot.y; y < spot.y + 4; y++) {
    for (let x = spot.x; x < spot.x + 4; x++) state.map[y][x].terrain = 'plain';
  }
  state.map[spot.y][spot.x + 1].terrain = 'forest';
  state.map[spot.y + 1][spot.x].terrain = 'forest';

  assert.equal(
    simulation.tryPlaceBuilding(state, 'field', spot.x, spot.y, 2, 2),
    simulation.CLEARING_APPROVAL_REQUIRED,
    '숲을 끼면 개간 확인을 요구한다',
  );
  assert.equal(state.buildings.some(b => b.type === 'field'), false, '확인 전에는 짓지 않는다');

  const woodBefore = state.resources.wood;
  assert.equal(
    simulation.tryPlaceBuilding(state, 'field', spot.x, spot.y, 2, 2, { approveClearing: true }),
    null,
    '수락하면 배치된다',
  );
  const field = state.buildings.at(-1);
  assert.equal(field.type, 'field');
  assert.equal(state.map[spot.y][spot.x + 1].terrain, 'forest', '나무는 아직 서 있다');
  assert.ok(state.resources.wood < woodBefore, '개간했다고 목재가 공짜로 들어오지 않는다');
  assert.equal(clearing.pendingClearingTiles(state, field).length, 2);
  assert.equal(clearing.awaitsClearing(state, field), true);
}

// ── 2. 나무가 서 있는 동안은 농부·건축가가 공사를 시작하지 않는다 ──
{
  const state = freshState();
  const spot = findClearExploredRect(state, 4, 4);
  for (let y = spot.y; y < spot.y + 4; y++) {
    for (let x = spot.x; x < spot.x + 4; x++) state.map[y][x].terrain = 'plain';
  }
  state.map[spot.y][spot.x].terrain = 'forest';
  assert.equal(
    simulation.tryPlaceBuilding(state, 'field', spot.x, spot.y, 2, 1, { approveClearing: true }),
    null,
  );
  const field = state.buildings.at(-1);
  const startProgress = field.progress;
  // 벌목꾼이 하나도 없으면 나무가 그대로 남고, 공사도 그대로 멈춰 있어야 한다
  for (const resident of state.residents) {
    if (resident.alive && resident.job === 'woodcutter') resident.job = 'farmer';
  }
  for (let tick = 0; tick < 120; tick++) simulation.advanceTick(state);
  assert.equal(state.map[spot.y][spot.x].terrain, 'forest', '벨 사람이 없으면 나무는 남는다');
  assert.equal(field.progress, startProgress, '벌목 전에는 공정이 오르지 않는다');
  assert.equal(field.built, false);
}

// ── 3. 벌목꾼이 붙으면 나무가 사라지고 공사가 열린다 ──
{
  const state = freshState();
  const spot = findClearExploredRect(state, 4, 4);
  for (let y = spot.y; y < spot.y + 4; y++) {
    for (let x = spot.x; x < spot.x + 4; x++) state.map[y][x].terrain = 'plain';
  }
  state.map[spot.y][spot.x].terrain = 'forest';
  assert.equal(
    simulation.tryPlaceBuilding(state, 'field', spot.x, spot.y, 1, 1, { approveClearing: true }),
    null,
  );
  const field = state.buildings.at(-1);
  for (const resident of state.residents) {
    if (resident.alive) resident.job = 'woodcutter';
  }
  let cleared = false;
  for (let tick = 0; tick < 600 && !cleared; tick++) {
    simulation.advanceTick(state);
    cleared = state.map[spot.y][spot.x].terrain !== 'forest';
  }
  assert.equal(cleared, true, '벌목꾼이 공사터 나무를 베어낸다');
  assert.equal(clearing.awaitsClearing(state, field), false);
}

// ── 4. 한 현장에 벌목꾼이 우르르 몰리지 않고, 여러 현장으로 나뉜다 ──
{
  const state = freshState();
  const sites = [];
  for (let index = 0; index < 3; index++) {
    const spot = findClearExploredRect(state, 3, 3);
    for (let y = spot.y; y < spot.y + 3; y++) {
      for (let x = spot.x; x < spot.x + 3; x++) state.map[y][x].terrain = 'plain';
    }
    state.map[spot.y][spot.x].terrain = 'forest';
    state.map[spot.y][spot.x + 1].terrain = 'forest';
    assert.equal(
      simulation.tryPlaceBuilding(state, 'field', spot.x, spot.y, 2, 1, { approveClearing: true }),
      null,
    );
    sites.push(state.buildings.at(-1));
  }
  assert.equal(clearing.clearingSites(state).length, 3);

  const crew = state.residents.filter(r => r.alive).slice(0, 9);
  for (const resident of crew) resident.job = 'woodcutter';
  const assignment = clearing.assignClearingCrews(state, crew);

  const perSite = new Map();
  for (const buildingId of assignment.values()) {
    perSite.set(buildingId, (perSite.get(buildingId) ?? 0) + 1);
  }
  const cap = CONFIG.agents.clearingCuttersPerSite;
  for (const [buildingId, count] of perSite) {
    assert.ok(count <= cap, `현장 ${buildingId}에 ${count}명 — 상한 ${cap} 초과`);
  }
  assert.equal(perSite.size, 3, '벌목꾼이 넉넉하면 세 현장을 동시에 연다');
  assert.equal(assignment.size, Math.min(crew.length, cap * 3), '남는 벌목꾼은 일반 벌목으로 돌아간다');
}

// ── 5. 건설 우선도가 벌목 순서를 정한다 ──
{
  const state = freshState();
  const made = [];
  for (let index = 0; index < 2; index++) {
    const spot = findClearExploredRect(state, 3, 3);
    for (let y = spot.y; y < spot.y + 3; y++) {
      for (let x = spot.x; x < spot.x + 3; x++) state.map[y][x].terrain = 'plain';
    }
    state.map[spot.y][spot.x].terrain = 'forest';
    assert.equal(
      simulation.tryPlaceBuilding(state, 'field', spot.x, spot.y, 1, 1, { approveClearing: true }),
      null,
    );
    made.push(state.buildings.at(-1));
  }
  const [first, second] = made;
  assert.equal(clearing.clearingSites(state)[0].building.id, first.id, '기본은 id 순');
  state.priorityBuildingId = second.id;
  assert.equal(clearing.clearingSites(state)[0].building.id, second.id, '우선 지정이 맨 앞');
}

// ── 6. 이전도 같다: 새 자리 나무는 벌목 확인을 받고, 해체는 그 사이에도 진행된다 ──
{
  const state = freshState();
  const spot = findClearExploredRect(state, 3, 3);
  for (let y = spot.y; y < spot.y + 3; y++) {
    for (let x = spot.x; x < spot.x + 3; x++) state.map[y][x].terrain = 'plain';
  }
  assert.equal(simulation.tryPlaceBuilding(state, 'hut', spot.x, spot.y), null);
  const hut = state.buildings.at(-1);
  hut.built = true;
  hut.progress = buildings.BUILDING_DEFS.hut.buildDays;

  const target = findClearExploredRect(state, 3, 3);
  for (let y = target.y; y < target.y + 3; y++) {
    for (let x = target.x; x < target.x + 3; x++) state.map[y][x].terrain = 'forest';
  }

  assert.equal(
    simulation.startBuildingRelocation(state, hut.id, target.x, target.y),
    simulation.CLEARING_APPROVAL_REQUIRED,
    '새 자리에 나무가 있으면 개간 확인을 요구한다',
  );
  assert.equal(hut.workOrder, undefined, '확인 전에는 해체를 시작하지 않는다');

  assert.equal(
    simulation.startBuildingRelocation(state, hut.id, target.x, target.y, { approveClearing: true }),
    null,
  );
  assert.equal(hut.workOrder.kind, 'relocate');
  assert.equal(hut.workOrder.phase, 'dismantling');

  // 해체 중에도 새 자리는 벌목 대상이고, 건축가의 해체 자체는 막히지 않는다
  assert.equal(clearing.awaitsClearing(state, hut), true);
  assert.equal(clearing.clearingBlocksWork(state, hut), false, '해체는 옛 자리 일이라 계속된다');
  const destinationTiles = clearing.pendingClearingTiles(state, hut);
  assert.equal(destinationTiles.length, 4, '2×2 움집 자리의 나무 4그루가 대상');
  assert.ok(
    destinationTiles.every(tile => tile.x >= target.x && tile.y >= target.y),
    '옛 자리가 아니라 옮겨 갈 자리를 본다',
  );
  assert.ok(
    clearing.clearingSites(state).some(site => site.building.id === hut.id),
    '이전 목적지도 벌목 현장 목록에 오른다',
  );

  // 재건축 단계로 넘어가면 나무가 남아 있는 동안 공사가 막힌다
  hut.workOrder.phase = 'rebuilding';
  hut.x = target.x;
  hut.y = target.y;
  assert.equal(clearing.clearingBlocksWork(state, hut), true, '재건축부터는 벌목을 기다린다');
}

// ── 7. 논도 물 조건을 만족하면 숲을 먼저 개간할 수 있다 ──
{
  assert.equal(clearing.acceptsClearedLand(buildings.BUILDING_DEFS.field), true);
  assert.equal(clearing.acceptsClearedLand(buildings.BUILDING_DEFS.hut), true);
  assert.equal(clearing.acceptsClearedLand(buildings.BUILDING_DEFS.paddy), true);
}

console.log('land clearing tests passed');
