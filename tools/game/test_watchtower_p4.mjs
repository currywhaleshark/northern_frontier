import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-watchtower-p4-'));
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
const buildings = await load('buildings');
const workerSlots = await load('workerSlots');
const watchtowers = await load('watchtowers');
const raids = await load('raids');
const agents = await load('agents');
const combatRoster = await load('combatRoster');
const saveLoad = await load('saveLoad');
const { CONFIG } = await load('config');

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

function freshState(seed = 2026080201) {
  const state = simulation.newGame(seed);
  state.rank = 'bu';
  state.foreignSites = [];
  state.pendingChoice = null;
  state.battle = null;
  state.siegeState = null;
  state.raiders = null;
  for (const row of state.map) for (const tile of row) {
    tile.terrain = 'plain';
    tile.treeStage = undefined;
    tile.buildingId = null;
  }
  state.buildings = [];
  for (const resident of state.residents) resident.alive = false;
  return state;
}

function addBuilt(state, type, x, y, extra = {}) {
  const building = {
    id: state.nextBuildingId++, type, x, y,
    progress: buildings.BUILDING_DEFS[type].buildDays,
    built: true, fieldGrowth: 0, inventory: {}, ...extra,
  };
  state.buildings.push(building);
  buildings.occupyBuildingTiles(state, building);
  return building;
}

function prepareWatchman(state, tower) {
  const resident = state.residents[0];
  Object.assign(resident, {
    alive: true, sick: false, health: 100, hunger: 100, warmth: 100, morale: 70,
    job: 'watchman', assignedBuildingId: null, x: tower.x + 1, y: tower.y,
    px: tower.x + 1, py: tower.y, phase: 'rest', path: [], workTimer: 0,
    targetId: null, carrying: {}, manualOrder: null,
  });
  assert.equal(workerSlots.assignResidentToBuilding(state, resident.id, tower.id), null);
  return resident;
}

function bandAt(x, y, power = 40) {
  return {
    x, y, px: x, py: y, path: [], power, size: 4, faction: '시험 마적',
    warned: true, spotted: true, siege: false, speed: 1, trail: [], phase: 'approaching',
  };
}

// 망루는 정확히 한 명만 받고 자동 배정 대상이며, 주둔 중에는 일반 수비 로스터에서 빠진다.
{
  const state = freshState();
  addBuilt(state, 'center', 20, 20);
  const tower = addBuilt(state, 'watchtower', 10, 10);
  const first = prepareWatchman(state, tower);
  const second = state.residents[1];
  Object.assign(second, { alive: true, sick: false, health: 100, job: 'watchman', assignedBuildingId: null });
  assert.equal(workerSlots.workerSlotConfig('watchtower').slots, 1);
  assert.equal(buildings.BUILDING_DEFS.watchtower.slots, 1);
  assert.match(workerSlots.assignResidentToBuilding(state, second.id, tower.id), /slot|capacity|full/i);
  const roster = combatRoster.createCombatRoster(state, { context: 'villageDefense' });
  assert.ok(!roster.combatants.some(entry => entry.residentId === first.id));
  first.assignedBuildingId = null;
  assert.ok(combatRoster.createCombatRoster(state, { context: 'villageDefense' })
    .combatants.some(entry => entry.residentId === first.id), '철수한 파수꾼은 수비대에 합류한다');
}

// 원형 사거리 7칸의 첫 진입 사격은 명중 확률 없이 피해와 실제 화살 상태를 남긴다.
{
  const state = freshState();
  addBuilt(state, 'center', 20, 20);
  const tower = addBuilt(state, 'watchtower', 10, 10);
  prepareWatchman(state, tower);
  state.raiders = bandAt(17, 10);
  const before = state.raiders.power;
  watchtowers.watchtowerTick(state);
  assert.ok(state.raiders.power < before, '사거리 경계에서도 반드시 피해를 준다');
  assert.equal(state.watchtowerProjectiles.length, 1, '실제 화살 궤적 상태를 만든다');
  assert.equal(state.watchtowerProjectiles[0].towerId, tower.id);
  const firstShotId = state.watchtowerProjectiles[0].id;
  state.raiders = null;
  for (let tick = 0; tick < CONFIG.watchtower.projectileDurationTicks; tick++) watchtowers.watchtowerTick(state);
  assert.equal(state.watchtowerProjectiles.length, 0, '끝난 화살 궤적은 정리한다');
  assert.ok(state.nextWatchtowerProjectileId > firstShotId, '화살 id는 되감기지 않는다');
  state.raiders = bandAt(18, 10);
  tower.watchtowerHadTarget = false;
  state.watchtowerProjectiles = [];
  watchtowers.watchtowerTick(state);
  assert.equal(state.raiders.power, 40, '8칸 밖은 피해가 없다');
}

// 실제 이동이 8칸 밖에서 7칸 경계로 들어오는 틱에도 cadence와 무관하게 첫 피해가 보장된다.
{
  const state = freshState(2026080207);
  addBuilt(state, 'center', 24, 20);
  const tower = addBuilt(state, 'watchtower', 10, 10);
  prepareWatchman(state, tower);
  state.raiders = bandAt(18, 10);
  state.raiders.path = [{ x: 17, y: 10 }, { x: 16, y: 10 }];
  tower.watchtowerLastShotTick = state.day * 72 + state.subTick;
  raids.raidersTick(state, () => 0);
  const before = state.raiders.power;
  watchtowers.watchtowerTick(state);
  assert.equal(state.raiders.x, 17);
  assert.ok(state.raiders.power < before, '실제 사거리 진입 틱에 즉시 맞는다');
}

// 우회 예산 안의 망루만 재표적하고, 파괴 뒤 원래 목표로 복귀한다.
{
  const state = freshState(2026080208);
  addBuilt(state, 'center', 24, 20);
  const tower = addBuilt(state, 'watchtower', 10, 10, { structureIntegrity: 0.5 });
  prepareWatchman(state, tower);
  state.raiders = bandAt(17, 10, 40);
  state.raiders.routeTarget = { x: 23, y: 20 };
  watchtowers.watchtowerTick(state);
  assert.equal(state.raiders.towerTargetId, tower.id);
  assert.deepEqual(state.raiders.towerReturnTarget, { x: 23, y: 20 });
  Object.assign(state.raiders, { x: 11, y: 10, px: 11, py: 10, path: [] });
  raids.raidersTick(state, () => 0);
  assert.equal(tower.built, false, '망루 공격은 실제 내구와 수리 상태를 바꾼다');
  assert.equal(state.raiders.towerTargetId, undefined);
  assert.equal(state.raiders.towerReturnTarget, undefined);
  assert.deepEqual(state.raiders.routeTarget, { x: 23, y: 20 });

  const overBudget = freshState(2026080209);
  addBuilt(overBudget, 'center', 24, 20);
  const farTower = addBuilt(overBudget, 'watchtower', 10, 10);
  prepareWatchman(overBudget, farTower);
  overBudget.raiders = bandAt(17, 10, 20);
  overBudget.raiders.routeTarget = { x: 18, y: 10 };
  watchtowers.watchtowerTick(overBudget);
  assert.equal(overBudget.raiders.towerTargetId, undefined, '기존 목표 대비 우회 예산 밖 망루는 쫓지 않는다');
}

// 연속 사격은 하루 상한을 넘지 않고 각궁은 더 효율적이며, 상한 뒤에는 억제만 남긴다.
{
  const plain = freshState(2026080202);
  addBuilt(plain, 'center', 20, 20);
  const plainTower = addBuilt(plain, 'watchtower', 10, 10);
  prepareWatchman(plain, plainTower);
  plain.raiders = bandAt(16, 10, 100);
  for (let tick = 0; tick < 72; tick++) {
    plain.subTick = tick;
    plainTower.watchtowerHadTarget = tick > 0;
    watchtowers.watchtowerTick(plain);
  }
  const plainDamage = 100 - plain.raiders.power;
  assert.ok(plainDamage > 0 && plainDamage <= CONFIG.watchtower.dailyDamageCap + 1e-9);
  assert.ok((plain.raiders.suppressedUntilTick ?? 0) > plain.day * 72 + plain.subTick,
    '피해 상한 뒤 화살은 이동 억제를 남긴다');

  const bow = freshState(2026080203);
  addBuilt(bow, 'center', 20, 20);
  const bowTower = addBuilt(bow, 'watchtower', 10, 10);
  const archer = prepareWatchman(bow, bowTower);
  bow.weaponAllocationMode = 'manual';
  bow.resources.hornBows = 1;
  bow.weaponAssignments = { [archer.id]: 'hornBow' };
  bow.raiders = bandAt(16, 10, 100);
  watchtowers.watchtowerTick(bow);
  assert.ok(Math.abs((100 - bow.raiders.power) - CONFIG.watchtower.bowDamage) < 1e-9);
  assert.equal(bow.watchtowerProjectiles[0].bow, true);
}

// 장기 공성의 단순 대치군은 쏘지 않고, 실제 성벽전·약탈조만 쏜다.
{
  const state = freshState(2026080211);
  addBuilt(state, 'center', 20, 20);
  const tower = addBuilt(state, 'watchtower', 10, 10);
  prepareWatchman(state, tower);
  state.raiders = bandAt(16, 10, 40);
  state.siegeState = { phase: 'encirclement', activePlunderTargetId: undefined };
  watchtowers.watchtowerTick(state);
  assert.equal(state.raiders.power, 40, '대치 중인 포위군은 일일 상한 사격 대상이 아니다');
  state.siegeState.activePlunderTargetId = 999;
  watchtowers.watchtowerTick(state);
  assert.ok(state.raiders.power < 40, '실제 약탈 중인 무리는 사격한다');
}

// 내구 25% 이하에서는 배정이 풀리고, 열린 퇴로/고립 퇴로가 서로 다른 결과를 낸다.
{
  const open = freshState(2026080204);
  addBuilt(open, 'center', 20, 20);
  const tower = addBuilt(open, 'watchtower', 10, 10, {
    structureIntegrityMax: CONFIG.watchtower.integrityMax,
    structureIntegrity: CONFIG.watchtower.integrityMax * CONFIG.watchtower.escapeIntegrityRatio + 1,
  });
  const watchman = prepareWatchman(open, tower);
  watchtowers.damageWatchtower(open, tower, 2);
  assert.equal(watchman.assignedBuildingId, null);
  assert.equal(watchman.watchtowerEscapeHasRoute, true);
  assert.ok(watchman.path.length > 0);
  for (let tick = 0; tick < 40 && watchman.watchtowerEscapeTowerId != null; tick++) agents.agentsTick(open);
  assert.equal(watchman.watchtowerEscapeTowerId, undefined, '중심지에 도착하면 철수 상태를 끝낸다');
  assert.ok(combatRoster.createCombatRoster(open, { context: 'villageDefense' })
    .combatants.some(entry => entry.residentId === watchman.id));

  const trapped = freshState(2026080205);
  addBuilt(trapped, 'center', 20, 20);
  const trappedTower = addBuilt(trapped, 'watchtower', 10, 10, { structureIntegrity: 21 });
  const trappedWatchman = prepareWatchman(trapped, trappedTower);
  for (let y = 8; y <= 12; y++) for (let x = 8; x <= 12; x++) {
    if ((x === 10 && y === 10) || (x === 11 && y === 10)) continue;
    trapped.map[y][x].terrain = 'mountain';
  }
  watchtowers.damageWatchtower(trapped, trappedTower, 2);
  assert.equal(trappedWatchman.watchtowerEscapeHasRoute, false);
  trapped.subTick += CONFIG.watchtower.escapeGraceTicks;
  watchtowers.watchtowerTick(trapped);
  assert.equal(trappedWatchman.health, 40);
  assert.equal(trappedWatchman.sick, true);

  const doomed = freshState(2026080210);
  addBuilt(doomed, 'center', 20, 20);
  const doomedTower = addBuilt(doomed, 'watchtower', 10, 10, { structureIntegrity: 21 });
  const doomedWatchman = prepareWatchman(doomed, doomedTower);
  doomedWatchman.health = 50;
  for (let y = 8; y <= 12; y++) for (let x = 8; x <= 12; x++) {
    if ((x === 10 && y === 10) || (x === 11 && y === 10)) continue;
    doomed.map[y][x].terrain = 'mountain';
  }
  watchtowers.damageWatchtower(doomed, doomedTower, 2);
  doomed.subTick += CONFIG.watchtower.escapeGraceTicks;
  watchtowers.watchtowerTick(doomed);
  assert.equal(doomedWatchman.alive, false, '중상자는 고립 탈출 유예 뒤 전사할 수 있다');
}

// 현재 저장은 주둔·사격·철수 필드를 보존하고 구 저장에 주둔자를 강제 생성하지 않는다.
{
  installStorage();
  const state = freshState(2026080206);
  addBuilt(state, 'center', 20, 20);
  const tower = addBuilt(state, 'watchtower', 10, 10);
  const watchman = prepareWatchman(state, tower);
  state.raiders = bandAt(17, 10);
  watchtowers.watchtowerTick(state);
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  assert.equal(loaded.schemaVersion, 66);
  assert.equal(loaded.residents.find(entry => entry.id === watchman.id).assignedBuildingId, tower.id);
  assert.equal(loaded.watchtowerProjectiles.length, 1);
  const migrated = saveLoad.migrateV55ToV56({ schemaVersion: 55, residents: [], buildings: [] });
  assert.deepEqual(migrated.watchtowerProjectiles, []);
  assert.equal(migrated.nextWatchtowerProjectileId, 1);
}

console.log('watchtower P4 tests passed');
