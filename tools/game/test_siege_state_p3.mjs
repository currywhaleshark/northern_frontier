import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-siege-p3-'));
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
const siege = await load('siege');
const agents = await load('agents');
const battles = await load('battles');
const saveLoad = await load('saveLoad');
const livestock = await load('livestock');
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

function freshState(seed = 2026080401) {
  const state = simulation.newGame(seed);
  state.rank = 'bu';
  state.foreignSites = [];
  state.exploration = { explored: state.map.map(row => row.map(() => true)) };
  for (const row of state.map) for (const tile of row) {
    tile.terrain = 'plain';
    tile.treeStage = undefined;
    tile.buildingId = null;
  }
  state.buildings = [];
  for (const resource of Object.keys(state.resources)) state.resources[resource] = 1_000;
  state.pendingChoice = null;
  state.siegeState = null;
  state.raiders = null;
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

function addCenterRing(state, { gate = false } = {}) {
  const center = addBuilt(state, 'center', 14, 13, { w: 3, h: 2 });
  for (let x = 11; x <= 18; x++) {
    addBuilt(state, gate && x === 14 ? 'gate' : 'palisade', x, 10,
      gate && x === 14 ? { gateWallType: 'palisade' } : {});
    addBuilt(state, 'palisade', x, 16);
  }
  for (let y = 11; y <= 15; y++) {
    addBuilt(state, 'palisade', 11, y);
    addBuilt(state, 'palisade', 18, y);
  }
  return center;
}

function band(power = 60) {
  return {
    x: 4, y: 10, px: 4, py: 10, path: [], power, size: 5, faction: '시험 마적',
    warned: true, spotted: true, siege: true, speed: 0, trail: [],
  };
}

function beginEncirclement(state, power = 60) {
  state.raiders = band(power);
  assert.equal(siege.openLongSiegeChoice(state), true);
  assert.equal(siege.resolveSiegeChoice(state, 'siege-hold'), true);
  state.siegeState.phase = 'encirclement';
  state.siegeState.lastProcessedDay = state.day - 1;
  return state.siegeState;
}

function nextPlunderDay(state) {
  while ((state.seed + state.day + Math.round(state.siegeState.raiderPower)) % 3 === 0) state.day++;
  state.siegeState.lastProcessedDay = state.day - 1;
}

// 완전 고리는 장기 공성으로 들어가지만, 부분 고리는 들어가지 못한다.
{
  const complete = freshState(2026080402);
  addCenterRing(complete);
  complete.raiders = band();
  assert.ok(siege.centerProtectedInterior(complete).size > 0);
  assert.equal(siege.createSiegeState(complete, complete.raiders)?.phase, 'evacuation');

  const partial = freshState(2026080403);
  addCenterRing(partial);
  const gap = partial.buildings.find(building => building.x === 14 && building.y === 10);
  partial.buildings = partial.buildings.filter(building => building.id !== gap.id);
  partial.map[10][14].buildingId = null;
  partial.raiders = band();
  assert.equal(siege.centerProtectedInterior(partial).size, 0);
  assert.equal(siege.createSiegeState(partial, partial.raiders), null);
}

// 피난 기간에는 문이 열려 있고 실제로 밖에 남은 주민만 deadline 뒤 고립·폐문 처리된다.
{
  const state = freshState(2026080404);
  addCenterRing(state, { gate: true });
  const inside = state.residents[0];
  const outside = state.residents[1];
  for (const resident of state.residents) resident.alive = resident.id === inside.id || resident.id === outside.id;
  Object.assign(inside, { alive: true, x: 15, y: 15, px: 15, py: 15, job: 'idle', health: 100, sick: false });
  Object.assign(outside, { alive: true, x: 4, y: 4, px: 4, py: 4, job: 'woodcutter', health: 100, sick: false });
  state.raiders = band();
  assert.equal(siege.openLongSiegeChoice(state), true);
  assert.equal(siege.resolveSiegeChoice(state, 'siege-hold'), true);
  assert.equal(agents.isPassable(state, 14, 10), true, 'gate stays open during evacuation');
  state.subTick = state.siegeState.evacuationDeadlineTick % CONFIG.agents.subticksPerDay;
  siege.siegeTick(state);
  assert.equal(state.siegeState.phase, 'encirclement');
  assert.deepEqual(state.siegeState.strandedResidentIds, [outside.id], 'outside resident is recorded, not teleported');
  assert.equal(agents.isPassable(state, 14, 10), false, 'gate closes after evacuation deadline');
}

// 성밖 밭·축사·현장 재고와 외부 저장 비율은 약탈되며, 이미 빈 목표는 재선정하지 않는다.
{
  const state = freshState(2026080405);
  addCenterRing(state);
  const insideStore = addBuilt(state, 'storehouse', 13, 14);
  const outsideStore = addBuilt(state, 'storehouse', 4, 4);
  const field = addBuilt(state, 'field', 5, 5, { fieldGrowth: 80, sownArea: 1 });
  const stable = addBuilt(state, 'stable', 7, 5, { livestock: livestock.createLivestockState('chicken', 4) });
  const hut = addBuilt(state, 'lodgingHut', 9, 5, { inventory: { tools: 3, grain: 4 } });
  const active = beginEncirclement(state);
  active.enemySupply = 100;
  active.plunderTargetIds = [field.id, stable.id, hut.id, outsideStore.id];
  state.resources.grain = 100;
  const grainBefore = state.resources.grain;

  nextPlunderDay(state);
  siege.processSiegeDay(state);
  assert.equal(field.fieldGrowth, 0, 'exterior field is stripped');
  assert.ok(active.enemySupply > 0, 'field food extends enemy supply');
  assert.ok(state.raiders.x !== 4 || state.raiders.y !== 10,
    'the plunder party physically moves from its camp before stripping the target');

  nextPlunderDay(state);
  siege.processSiegeDay(state);
  assert.equal(stable.livestock.headcount, 2, 'exterior livestock loses two animals to plunder');

  for (let day = 0; day < 5 && (hut.inventory.grain ?? 0) > 0; day++) {
    nextPlunderDay(state);
    siege.processSiegeDay(state);
  }
  assert.equal(hut.inventory.grain, 0, 'exterior local food inventory is eventually reached and taken');
  nextPlunderDay(state);
  siege.processSiegeDay(state);
  assert.equal(hut.inventory.tools, 0, 'exterior local inventory is taken within its per-day cap');
  assert.ok((active.loot.tools ?? 0) > 0, 'non-food plunder is recorded as enemy loot');
  for (let day = 0; day < 8 && !active.plunderedTargetIds.includes(outsideStore.id); day++) {
    nextPlunderDay(state);
    siege.processSiegeDay(state);
  }
  assert.ok(state.resources.grain < grainBefore,
    'abstract exterior storage share is reduced only after the plunder party reaches that store');
  const plunderedCount = active.plunderedTargetIds.filter(id => id === field.id).length;
  nextPlunderDay(state);
  siege.processSiegeDay(state);
  assert.equal(active.plunderedTargetIds.filter(id => id === field.id).length, plunderedCount,
    'empty field is not selected for repeated plunder');
  assert.ok(insideStore.built && outsideStore.built, 'storage fixture remains structurally intact');
}

// 군량 계절·날씨 보정과 하루 중복 방지는 일일 공성 처리에서 결정적이다.
{
  const clear = freshState(2026080406);
  addCenterRing(clear);
  const clearSiege = beginEncirclement(clear, 30);
  clear.weather = 'clear';
  clearSiege.plunderTargetIds = [];
  const clearBefore = clearSiege.enemySupply;
  siege.processSiegeDay(clear);
  const clearAfter = clearSiege.enemySupply;
  siege.processSiegeDay(clear);
  assert.equal(clearSiege.enemySupply, clearAfter, 'same calendar day cannot consume enemy supply twice');

  const blizzard = freshState(2026080406);
  addCenterRing(blizzard);
  const blizzardSiege = beginEncirclement(blizzard, 30);
  blizzard.weather = 'blizzard';
  blizzardSiege.plunderTargetIds = [];
  siege.processSiegeDay(blizzard);
  assert.ok(blizzardSiege.enemySupply < clearAfter,
    'blizzard consumes more enemy supply than clear weather from the same initial state');
  assert.ok(clearAfter < clearBefore);
}

// 태세는 하루 한 번이며 회전은 기존 전투 하나로 전환된다. 식량 위기는 선택지를 열고 무연료는 즉패가 아니다.
{
  const state = freshState(2026080407);
  addCenterRing(state);
  const defender = state.residents[0];
  for (const resident of state.residents) resident.alive = resident.id === defender.id;
  Object.assign(defender, { alive: true, job: 'militia', health: 100, sick: false, x: 15, y: 15, px: 15, py: 15 });
  const active = beginEncirclement(state);
  state.day++;
  assert.equal(siege.changeSiegeStance(state, 'wall'), null);
  assert.match(siege.changeSiegeStance(state, 'hold'), /하루에 한 번/);
  state.day++;
  assert.equal(siege.changeSiegeStance(state, 'field'), null);
  assert.equal(active.phase, 'sortie');
  assert.ok(state.battle, 'field stance starts one existing field battle');
  active.loot.tools = 10;
  const toolsBeforeSortieVictory = state.resources.tools;
  state.battle.phase = 'clash';
  state.battle.outcome = 'victory';
  state.battle.ticks = 999;
  state.raiders.power = 0;
  battles.battleTick(state, () => 0);
  assert.equal(state.siegeState, null, 'sortie battle completion clears the siege in the same battle tick');
  assert.ok(state.resources.tools > toolsBeforeSortieVictory, 'sortie victory recovers part of siege loot');

  const crisis = freshState(2026080408);
  addCenterRing(crisis);
  const resident = crisis.residents[0];
  for (const candidate of crisis.residents) candidate.alive = candidate.id === resident.id;
  Object.assign(resident, { alive: true, health: 100, morale: 80, sick: false, job: 'idle', x: 15, y: 15, px: 15, py: 15 });
  const crisisSiege = beginEncirclement(crisis, 30);
  for (const resource of Object.keys(crisis.resources)) crisis.resources[resource] = 0;
  crisis.day = CONFIG.time.seasonDays * 3 + 1;
  crisis.weather = 'coldSnap';
  crisisSiege.lastProcessedDay = crisis.day - 1;
  crisisSiege.plunderTargetIds = [];
  siege.processSiegeDay(crisis);
  assert.equal(crisis.pendingChoice?.data.longSiegeChoice, 'crisis', 'no food opens surrender/field/final-defense choice');
  assert.ok(resident.health < 100 && resident.morale < 80, 'no winter fuel damages health and morale');
  assert.equal(crisis.gameOver, null, 'no fuel alone is not an instant loss');
}

// v54 never invents a new siege; v55 state survives a second save/load and malformed state is discarded.
{
  const state = freshState(2026080409);
  addCenterRing(state);
  const active = beginEncirclement(state, 48);
  const movingTarget = addBuilt(state, 'storehouse', 5, 5);
  active.enemySupply = 7.5;
  active.lastProcessedDay = state.day - 1;
  active.plunderTargetIds = [movingTarget.id];
  active.activePlunderTargetId = movingTarget.id;
  active.plunderPath = [{ x: 4, y: 9 }, { x: 5, y: 8 }];
  installStorage();
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  assert.equal(loaded.siegeState.enemySupply, 7.5);
  assert.equal(loaded.siegeState.activePlunderTargetId, movingTarget.id);
  assert.deepEqual(loaded.siegeState.plunderPath, [], 'active plunder movement replans safely after save/load');
  assert.equal(saveLoad.saveGame(loaded), true);
  const loadedAgain = saveLoad.loadGame();
  assert.equal(loadedAgain.siegeState.enemySupply, 7.5, 'v55 siege state survives load-save-load');

  const legacy = structuredClone(state);
  legacy.schemaVersion = 54;
  legacy.siegeState = undefined;
  legacy.raiders.siege = true;
  localStorage.setItem('buksae-save-v3', JSON.stringify(legacy));
  const migrated = saveLoad.loadGame();
  assert.equal(migrated.siegeState, null, 'v54 legacy siege boolean does not synthesize P3 state');

  const malformed = structuredClone(state);
  malformed.siegeState.phase = 'broken';
  localStorage.setItem('buksae-save-v3', JSON.stringify(malformed));
  const normalized = saveLoad.loadGame();
  assert.equal(normalized.siegeState, null, 'malformed v55 siege state is conservatively discarded');
}

// 군량이 0이 되면 공성진이 철수하고, 공성 상태·습격대·후속 쿨다운이 함께 정리된다.
{
  const state = freshState(2026080410);
  addCenterRing(state);
  const active = beginEncirclement(state, 30);
  active.plunderTargetIds = [];
  active.enemySupply = 0.01;
  active.lastProcessedDay = state.day - 1;
  const repelledBefore = state.lifetimeStats.raidsRepelled;
  siege.processSiegeDay(state);
  assert.equal(state.siegeState, null, 'empty enemy supply ends the long siege');
  assert.equal(state.raiders, null, 'withdrawal removes the raider band');
  assert.equal(state.raidCooldown, CONFIG.threat.raidCooldownDays, 'withdrawal starts the normal raid cooldown');
  assert.equal(state.lifetimeStats.raidsRepelled, repelledBefore + 1, 'withdrawal counts as a repelled raid');
}

// 성벽전은 실제 경계 벽과 적 전력을 깎고, 적 전력이 0이면 전리품 일부를 회수한다.
{
  const state = freshState(2026080411);
  addCenterRing(state);
  const defender = state.residents[0];
  for (const resident of state.residents) resident.alive = resident.id === defender.id;
  Object.assign(defender, { alive: true, job: 'militia', health: 100, sick: false, x: 15, y: 15, px: 15, py: 15 });
  const active = beginEncirclement(state, 1);
  active.stance = 'wall';
  active.phase = 'wallCombat';
  active.enemySupply = 99;
  active.loot = { tools: 10 };
  active.lastProcessedDay = state.day - 1;
  const walls = state.buildings.filter(building => building.type === 'palisade');
  const integrityBefore = new Map(walls.map(wall => [wall.id, wall.structureIntegrity ?? Infinity]));
  const toolsBefore = state.resources.tools;
  siege.processSiegeDay(state);
  assert.ok(walls.some(wall => (wall.structureIntegrity ?? Infinity) < integrityBefore.get(wall.id)),
    'wall stance applies daily pressure to a real boundary segment');
  assert.equal(active.raiderPower, 0, 'wall defenders can reduce remaining raider power to zero');
  assert.equal(state.siegeState, null, 'zero raider power repels the siege');
  assert.equal(state.resources.tools, toolsBefore + 10 * CONFIG.siege.repelledLootRecovery,
    'repelled siege returns the configured share of non-food loot');
}

function crisisChoiceState(state) {
  state.pendingChoice = {
    kind: 'raid', title: 'test crisis', body: '', options: [],
    data: { longSiegeChoice: 'crisis', faction: state.siegeState.faction, power: state.siegeState.raiderPower, warned: true, siege: true },
  };
}

// 위기 항복은 공성을 완전히 닫고 물자·명성을 잃으며, 최후 수성은 levy 야전을 하나만 연다.
{
  const surrender = freshState(2026080412);
  addCenterRing(surrender);
  beginEncirclement(surrender, 30);
  surrender.resources.grain = 100;
  surrender.resources.reputation = 50;
  crisisChoiceState(surrender);
  assert.equal(siege.resolveSiegeChoice(surrender, 'siege-surrender'), true);
  assert.equal(surrender.siegeState, null);
  assert.equal(surrender.raiders, null);
  assert.ok(surrender.resources.grain < 100, 'surrender removes a share of stored resources');
  assert.ok(surrender.resources.reputation < 50, 'surrender reduces reputation');

  const finalDefense = freshState(2026080413);
  addCenterRing(finalDefense);
  const resident = finalDefense.residents[0];
  for (const candidate of finalDefense.residents) candidate.alive = candidate.id === resident.id;
  Object.assign(resident, { alive: true, job: 'idle', health: 100, sick: false, x: 15, y: 15, px: 15, py: 15 });
  const active = beginEncirclement(finalDefense, 30);
  crisisChoiceState(finalDefense);
  assert.equal(siege.resolveSiegeChoice(finalDefense, 'siege-final'), true);
  assert.equal(active.phase, 'sortie');
  assert.ok(finalDefense.battle, 'final defense opens the existing levy battle');
  assert.equal(finalDefense.battle.mode, 'levy');
  assert.equal(finalDefense.pendingChoice, null, 'the crisis choice is consumed instead of opening a second battle');
}

console.log('siege state P3 tests passed');
