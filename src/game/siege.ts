import { recordAnnals } from './annals';
import { startBattle } from './battles';
import { BUILDING_DEFS, computeDefense, countBuilt, footprintTilesOf } from './buildings';
import { CONFIG } from './config';
import { foodTotal, fuelHeatTotal } from './consumption';
import { DAY_CYCLE_SUBTICKS } from './dayCycle';
import { addLog } from './events';
import { consumptionWeight } from './lifecycle';
import {
  bumpDefenseTopology, effectiveWallType, isBlockingDefenseWall, protectedInterior,
  isRaidTileTraversable, wallIntegrity, wallIntegrityMax,
} from './raidRoutes';
import { FOOD_RESOURCES } from './resourceCatalog';
import { getSeason } from './seasons';
import { createTacticalBattle } from './tacticalBattle';
import { isStationedWatchman } from './watchtowers';
import type {
  Building, GameState, PendingChoice, RaiderBand, Resident, ResourceId, SiegeStance, SiegeState,
} from './types';

const CARDINAL = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const FOOD = new Set<ResourceId>([...FOOD_RESOURCES, 'rice', 'hay']);
const STORAGE_TYPES = new Set<Building['type']>(['center', 'storehouse', 'cellar']);
const EXTERIOR_WORK_JOBS = new Set<Resident['job']>([
  'farmer', 'woodcutter', 'hunter', 'herbalist', 'miner', 'fisher', 'herder', 'hauler',
]);

function key(x: number, y: number): string { return `${x},${y}`; }

function absoluteTick(state: Pick<GameState, 'day' | 'subTick'>): number {
  return state.day * DAY_CYCLE_SUBTICKS + state.subTick;
}

/** 중심지 발자국과 같은 닫힌 내부 컴포넌트만 반환한다. 별도의 외곽 고리는 제외한다. */
export function centerProtectedInterior(state: GameState): Set<string> {
  const allInterior = protectedInterior(state);
  const center = state.buildings.find(building => building.type === 'center' && building.built);
  if (!center) return new Set();
  const footprint = footprintTilesOf(state, center) ?? [{ x: center.x, y: center.y }];
  if (!footprint.every(tile => allInterior.has(key(tile.x, tile.y)))) return new Set();
  const connected = new Set(footprint.map(tile => key(tile.x, tile.y)));
  const queue = [...footprint];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const tile = queue[cursor];
    for (const [dx, dy] of CARDINAL) {
      const x = tile.x + dx;
      const y = tile.y + dy;
      const tileKey = key(x, y);
      if (!allInterior.has(tileKey) || connected.has(tileKey)) continue;
      connected.add(tileKey);
      queue.push({ x, y });
    }
  }
  return connected;
}

export function buildingInsideSiegeInterior(building: Building, interior: ReadonlySet<string>, state: GameState): boolean {
  const footprint = footprintTilesOf(state, building) ?? [{ x: building.x, y: building.y }];
  return footprint.every(tile => interior.has(key(tile.x, tile.y)));
}

export function canStartLongSiege(state: GameState): boolean {
  return centerProtectedInterior(state).size > 0;
}

function intelLevel(state: GameState, warned: boolean): number {
  const away = new Set([
    ...(state.expedition?.memberIds ?? []),
    ...(state.warDispatch?.memberIds ?? []),
  ]);
  const patrolWatchmen = state.residents.filter(resident =>
    resident.alive && resident.job === 'watchman' && !away.has(resident.id) &&
    !isStationedWatchman(state, resident)).length;
  let level = warned ? 1 : 0;
  if (countBuilt(state, 'beacon') > 0) level++;
  if (patrolWatchmen >= 2 || state.residents.some(resident => isStationedWatchman(state, resident))) level++;
  if ((state.specialItems?.gyrfalcon ?? 0) > 0 || (state.specialItems?.telescope ?? 0) > 0) level++;
  return Math.min(4, level);
}

export function enemySupplyEstimate(supply: number, level: number): { min: number; max: number } {
  const rounded = Math.max(0, Math.ceil(supply));
  if (level >= 4) return { min: rounded, max: rounded };
  const spread = [4, 3, 2, 1][Math.max(0, Math.min(3, level))];
  return { min: Math.max(0, rounded - spread), max: rounded + spread };
}

function initialEnemySupply(power: number): number {
  return Math.min(
    CONFIG.siege.maxEnemySupplyDays,
    CONFIG.siege.baseEnemySupplyDays + Math.ceil(Math.max(0, power) / CONFIG.siege.powerPerSupplyDay),
  );
}

function exteriorAssetIds(state: GameState, interior: ReadonlySet<string>): number[] {
  return state.buildings
    .filter(building => building.built && !buildingInsideSiegeInterior(building, interior, state) && (
      building.type === 'field' || building.type === 'paddy' || building.type === 'stable' ||
      STORAGE_TYPES.has(building.type) ||
      Object.values(building.inventory ?? {}).some(amount => (amount ?? 0) > 0.001)
    ))
    .map(building => building.id)
    .sort((a, b) => a - b);
}

function defenderIds(state: GameState): number[] {
  const away = new Set([
    ...(state.expedition?.memberIds ?? []),
    ...(state.warDispatch?.memberIds ?? []),
  ]);
  return state.residents.filter(resident => resident.alive && !resident.sick && resident.health >= 20 &&
    !away.has(resident.id) &&
    (resident.job === 'militia' || resident.job === 'watchman' || resident.job === 'hunter'))
    .map(resident => resident.id);
}

export function createSiegeState(state: GameState, band: RaiderBand): SiegeState | null {
  const interior = centerProtectedInterior(state);
  if (interior.size === 0) return null;
  const level = intelLevel(state, band.warned);
  const supply = initialEnemySupply(band.power);
  return {
    phase: 'evacuation',
    faction: band.faction,
    raiderPower: band.power,
    enemySupply: supply,
    enemySupplyEstimate: enemySupplyEstimate(supply, level),
    intelLevel: level,
    warned: band.warned,
    stance: 'hold',
    startedDay: state.day,
    lastProcessedDay: state.day,
    lastStanceChangeDay: state.day,
    evacuationDeadlineTick: absoluteTick(state) + CONFIG.siege.evacuationTicks,
    defenderIds: defenderIds(state),
    strandedResidentIds: [],
    plunderTargetIds: exteriorAssetIds(state, interior),
    plunderedTargetIds: [],
    plunderPath: [],
    loot: {},
    protectedInterior: [...interior],
    topologyRevision: state.defenseTopologyRevision,
    breachTargetId: band.route?.breaches[0]?.buildingId,
  };
}

function initialSiegeChoice(siege: SiegeState): PendingChoice {
  const estimate = siege.enemySupplyEstimate.min === siege.enemySupplyEstimate.max
    ? `${siege.enemySupplyEstimate.min}일`
    : `${siege.enemySupplyEstimate.min}~${siege.enemySupplyEstimate.max}일`;
  return {
    kind: 'raid',
    title: `장기 공성 시작 — ${siege.faction}`,
    body:
      `닫힌 방어선 앞에 적이 진을 쳤습니다. 예상 군량은 ${estimate}입니다.` +
      `\n${CONFIG.siege.evacuationTicks}틱 동안 성밖 주민이 실제 길을 따라 귀환한 뒤 성문을 닫습니다.` +
      '\n초기 태세를 정하십시오. 공성 중 태세는 하루에 한 번 바꿀 수 있습니다.',
    options: [
      { id: 'siege-hold', label: '농성한다', desc: '성내 식량과 땔감으로 버티며 적 군량이 마르기를 기다립니다.' },
      { id: 'siege-wall', label: '성벽전을 준비한다', desc: '수비대가 벽을 지켜 돌파를 늦추고 적에게 매일 손실을 줍니다.' },
      { id: 'siege-field', label: '회전한다', desc: '성문을 열고 수비대를 모아 기존 야전으로 나갑니다.' },
    ],
    data: { longSiegeChoice: 'initial', faction: siege.faction, power: siege.raiderPower, warned: siege.warned, siege: true },
  };
}

export function openLongSiegeChoice(state: GameState): boolean {
  const band = state.raiders;
  if (!band) return false;
  const siege = state.siegeState ?? createSiegeState(state, band);
  if (!siege) return false;
  state.siegeState = siege;
  band.siege = true;
  band.speed = 0;
  band.path = [];
  state.raidHold = null;
  state.pendingChoice = initialSiegeChoice(siege);
  addLog(state, `${siege.faction}의 무리가 닫힌 방어선 앞에 진을 치고 장기 공성을 시작했습니다.`, 'raid', true);
  return true;
}

function startSortie(state: GameState, mode: 'garrison' | 'levy'): string | null {
  const siege = state.siegeState;
  const band = state.raiders;
  if (!siege || !band) return '공성 중인 적을 찾을 수 없습니다.';
  siege.phase = 'sortie';
  siege.stance = 'field';
  state.pendingChoice = {
    kind: 'raid', title: '공성 출격', body: '', options: [],
    data: { faction: siege.faction, power: band.power, warned: siege.warned, siege: true },
  };
  if (!startBattle(state, mode)) {
    state.pendingChoice = null;
    siege.phase = 'encirclement';
    return '출격할 수비대를 꾸리지 못했습니다.';
  }
  addLog(state, '성문이 열리고 수비대가 공성진을 향해 출격했습니다.', 'raid', true);
  return null;
}

export function changeSiegeStance(state: GameState, stance: SiegeStance): string | null {
  const siege = state.siegeState;
  if (!siege || siege.phase === 'withdrawal' || siege.phase === 'sortie') return '진행 중인 공성이 없습니다.';
  if (stance === 'field') return startSortie(state, 'garrison');
  if (siege.lastStanceChangeDay === state.day) return '태세는 하루에 한 번만 바꿀 수 있습니다.';
  siege.stance = stance;
  siege.phase = stance === 'wall' ? 'wallCombat' : 'encirclement';
  siege.lastStanceChangeDay = state.day;
  addLog(state, stance === 'wall' ? '수비대가 성벽전 태세로 전환했습니다.' : '수비대가 농성 태세로 전환했습니다.', 'raid');
  return null;
}

export function startTacticalWallBattle(state: GameState): string | null {
  const siege = state.siegeState;
  if (!siege || !state.raiders) return '직접 지휘할 공성군이 없습니다.';
  if (state.tacticalBattle || state.battle) return '이미 진행 중인 전투가 있습니다.';
  if (state.pendingChoice) return '먼저 현재 결정을 마쳐야 합니다.';
  if (siege.phase === 'evacuation') return '성문을 닫고 피난을 마친 뒤 성벽전을 지휘할 수 있습니다.';
  if (siege.phase !== 'wallCombat' || siege.stance !== 'wall') return '성벽전 태세에서만 직접 지휘할 수 있습니다.';
  if (siege.wallEngagement?.day === state.day) {
    return siege.wallEngagement.mode === 'automatic'
      ? '오늘 성벽 교전은 이미 자동 처리되었습니다. 다음 날 직접 지휘할 수 있습니다.'
      : '오늘 성벽 교전은 이미 직접 지휘로 처리되었습니다.';
  }
  const interior = new Set(siege.protectedInterior);
  const preferred = siege.breachTargetId == null
    ? undefined
    : state.buildings.find(building => building.id === siege.breachTargetId && isBlockingDefenseWall(building));
  const wall = preferred ?? boundaryWalls(state, interior)
    .sort((left, right) => wallIntegrity(left) - wallIntegrity(right) || left.id - right.id)[0];
  if (!wall) return '직접 지휘할 온전한 성벽 구간을 찾을 수 없습니다.';
  siege.breachTargetId = wall.id;
  createTacticalBattle(state, {
    factionName: siege.faction,
    power: siege.raiderPower,
    warned: siege.warned,
    siege: true,
    mode: 'garrison',
    wallSectionBuildingId: wall.id,
  });
  siege.wallEngagement = { day: state.day, mode: 'manual' };
  siege.lastProcessedDay = Math.max(siege.lastProcessedDay, state.day);
  return null;
}

function finishSiege(state: GameState, result: 'withdrawal' | 'repelled' | 'surrender'): void {
  const siege = state.siegeState;
  if (!siege) return;
  if (result === 'repelled') {
    for (const [resource, amount] of Object.entries(siege.loot) as Array<[ResourceId, number]>) {
      state.resources[resource] = (state.resources[resource] ?? 0) + amount * CONFIG.siege.repelledLootRecovery;
    }
    state.resources.reputation = Math.min(100, state.resources.reputation + 6);
    state.lifetimeStats.raidsRepelled++;
    addLog(state, '성벽의 저항에 적 공성진이 무너졌습니다. 버려진 전리품 일부를 되찾았습니다.', 'good', true);
  } else if (result === 'withdrawal') {
    state.lifetimeStats.raidsRepelled++;
    addLog(state, '적 군량이 바닥나 공성진이 걷혔습니다. 마을이 긴 농성을 버텨 냈습니다.', 'good', true);
  } else {
    for (const resource of CONFIG.siege.plunderPriority) {
      state.resources[resource] = Math.max(0, (state.resources[resource] ?? 0) * (1 - CONFIG.siege.surrenderResourceLoss));
    }
    state.resources.reputation = Math.max(0, state.resources.reputation - 8);
    state.lifetimeStats.raidsSuffered++;
    addLog(state, '성문을 열고 항복했습니다. 적은 저장 물자를 거두고 마을의 명성을 꺾은 뒤 물러갔습니다.', 'bad', true);
  }
  recordAnnals(state, 'raid', result === 'surrender'
    ? `${siege.faction}의 공성에 항복해 물자와 명성을 잃었습니다.`
    : `${siege.faction}의 장기 공성을 버텨 내고 적을 물렸습니다.`);
  state.threat = CONFIG.threat.afterRaidThreat;
  state.raidCooldown = CONFIG.threat.raidCooldownDays;
  state.raiders = null;
  state.raidHold = null;
  state.siegeState = null;
  state.pendingChoice = null;
}

function crisisChoice(state: GameState): void {
  const siege = state.siegeState;
  if (!siege || state.pendingChoice) return;
  state.pendingChoice = {
    kind: 'raid',
    title: '공성의 끝자락',
    body: '성내 식량이 바닥났거나 방어선이 열렸습니다. 이제 결말을 선택해야 합니다.',
    options: [
      { id: 'siege-surrender', label: '항복한다', desc: '물자와 명성을 잃지만 남은 주민을 살립니다.' },
      { id: 'siege-field', label: '회전한다', desc: '성문을 열고 남은 수비대로 야전에 나섭니다.' },
      { id: 'siege-final', label: '최후 수성', desc: '성한 주민 전부를 징집해 열린 방어선 안에서 싸웁니다.' },
    ],
    data: { longSiegeChoice: 'crisis', faction: siege.faction, power: siege.raiderPower, warned: siege.warned, siege: true },
  };
}

export function resolveSiegeChoice(state: GameState, optionId: string): boolean {
  const choice = state.pendingChoice;
  const mode = choice?.kind === 'raid' ? choice.data.longSiegeChoice : null;
  const siege = state.siegeState;
  if (!choice || !siege || (mode !== 'initial' && mode !== 'crisis')) return false;
  if (optionId === 'siege-field') {
    startSortie(state, 'garrison');
    return true;
  }
  if (optionId === 'siege-final') {
    startSortie(state, 'levy');
    return true;
  }
  if (optionId === 'siege-surrender') {
    finishSiege(state, 'surrender');
    return true;
  }
  if (mode === 'initial' && (optionId === 'siege-hold' || optionId === 'siege-wall')) {
    siege.stance = optionId === 'siege-wall' ? 'wall' : 'hold';
    siege.phase = 'evacuation';
    siege.lastStanceChangeDay = state.day;
    state.pendingChoice = null;
    addLog(state, siege.stance === 'wall'
      ? '주민들이 안으로 물러나고 수비대는 성벽전을 준비합니다.'
      : '주민들이 안으로 물러나며 긴 농성을 준비합니다.', 'raid', true);
    return true;
  }
  return false;
}

function refreshInterior(state: GameState, siege: SiegeState): Set<string> {
  if (siege.topologyRevision !== state.defenseTopologyRevision) {
    const interior = centerProtectedInterior(state);
    siege.protectedInterior = [...interior];
    siege.topologyRevision = state.defenseTopologyRevision;
    siege.plunderTargetIds = exteriorAssetIds(state, interior)
      .filter(id => !siege.plunderedTargetIds.includes(id));
    if (siege.activePlunderTargetId != null && !siege.plunderTargetIds.includes(siege.activePlunderTargetId)) {
      siege.activePlunderTargetId = undefined;
      siege.plunderPath = [];
    }
  }
  return new Set(siege.protectedInterior);
}

export type SiegeResidentDisposition = 'evacuate' | 'work' | 'suspend' | 'stranded';

export function siegeResidentDisposition(state: GameState, resident: Resident): SiegeResidentDisposition {
  const siege = state.siegeState;
  if (!siege || siege.phase === 'sortie' || siege.phase === 'withdrawal') return 'work';
  const interior = refreshInterior(state, siege);
  if (siege.phase === 'evacuation' && absoluteTick(state) < siege.evacuationDeadlineTick) return 'evacuate';
  if (siege.strandedResidentIds.includes(resident.id) || !interior.has(key(resident.x, resident.y))) return 'stranded';
  const assigned = resident.assignedBuildingId == null ? null
    : state.buildings.find(building => building.id === resident.assignedBuildingId && building.built) ?? null;
  if (resident.lodgingSupplyHutId != null || resident.job === 'hauler') return 'suspend';
  if (EXTERIOR_WORK_JOBS.has(resident.job) && assigned && !buildingInsideSiegeInterior(assigned, interior, state)) return 'suspend';
  return 'work';
}

export function siegeTick(state: GameState): void {
  const siege = state.siegeState;
  if (!siege) return;
  siege.defenderIds = defenderIds(state);
  if (siege.phase === 'sortie') {
    if (!state.battle && !state.tacticalBattle && !state.raiders) state.siegeState = null;
    return;
  }
  const interior = refreshInterior(state, siege);
  if (siege.phase === 'evacuation' && absoluteTick(state) >= siege.evacuationDeadlineTick) {
    const away = new Set([
      ...(state.expedition?.memberIds ?? []),
      ...(state.warDispatch?.memberIds ?? []),
    ]);
    siege.strandedResidentIds = state.residents.filter(resident => resident.alive && !away.has(resident.id) &&
      !interior.has(key(resident.x, resident.y))).map(resident => resident.id);
    siege.phase = siege.stance === 'wall' ? 'wallCombat' : 'encirclement';
    addLog(state, siege.strandedResidentIds.length > 0
      ? `성문을 닫았습니다. 귀환하지 못한 주민 ${siege.strandedResidentIds.length}명이 성밖에 고립되었습니다.`
      : '마지막 주민이 들어온 뒤 성문을 닫았습니다.', siege.strandedResidentIds.length > 0 ? 'bad' : 'info', true);
  }
}

function addLoot(siege: SiegeState, resource: ResourceId, amount: number): void {
  if (amount <= 0) return;
  if (FOOD.has(resource)) siege.enemySupply += amount * CONFIG.siege.plunderSupplyPerFood;
  else siege.loot[resource] = (siege.loot[resource] ?? 0) + amount;
}

const PLUNDER_DIRECTIONS = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
] as const;

function plunderApproachTiles(state: GameState, building: Building): Set<string> {
  const goals = new Set<string>();
  const footprint = footprintTilesOf(state, building) ?? [{ x: building.x, y: building.y }];
  const occupied = new Set(footprint.map(tile => key(tile.x, tile.y)));
  for (const tile of footprint) {
    for (const [dx, dy] of PLUNDER_DIRECTIONS) {
      const x = tile.x + dx;
      const y = tile.y + dy;
      if (!occupied.has(key(x, y)) && isRaidTileTraversable(state, x, y, false)) goals.add(key(x, y));
    }
  }
  return goals;
}

/** 벽을 부수지 않는 약탈조용 결정적 8방향 BFS. 외부 목표까지 실제로 닿은 뒤에만 약탈한다. */
function plunderPathTo(state: GameState, start: { x: number; y: number }, building: Building): { x: number; y: number }[] | null {
  const h = state.map.length;
  const w = state.map[0]?.length ?? 0;
  const goals = plunderApproachTiles(state, building);
  if (goals.has(key(start.x, start.y))) return [];
  const startIndex = start.y * w + start.x;
  const queue = [startIndex];
  const previous = new Int32Array(w * h).fill(-1);
  const seen = new Uint8Array(w * h);
  if (start.x < 0 || start.y < 0 || start.x >= w || start.y >= h) return null;
  seen[startIndex] = 1;
  let found = -1;
  for (let cursor = 0; cursor < queue.length && found < 0; cursor++) {
    const current = queue[cursor];
    const x = current % w;
    const y = (current - x) / w;
    for (const [dx, dy] of PLUNDER_DIRECTIONS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const index = ny * w + nx;
      if (seen[index] || !isRaidTileTraversable(state, nx, ny, false)) continue;
      if (dx !== 0 && dy !== 0 &&
          !isRaidTileTraversable(state, x + dx, y, false) &&
          !isRaidTileTraversable(state, x, y + dy, false)) continue;
      seen[index] = 1;
      previous[index] = current;
      if (goals.has(key(nx, ny))) { found = index; break; }
      queue.push(index);
    }
  }
  if (found < 0) return null;
  const path: { x: number; y: number }[] = [];
  for (let node = found; node !== startIndex; node = previous[node]) {
    if (node < 0) return null;
    path.push({ x: node % w, y: Math.floor(node / w) });
  }
  path.reverse();
  return path;
}

function advancePlunderParty(state: GameState, siege: SiegeState): Building | null {
  const band = state.raiders;
  if (!band) return null;
  let target = siege.activePlunderTargetId == null ? null
    : state.buildings.find(building => building.id === siege.activePlunderTargetId && building.built) ?? null;
  if (!target || !siege.plunderTargetIds.includes(target.id) || siege.plunderedTargetIds.includes(target.id)) {
    const targetId = siege.plunderTargetIds.find(id => !siege.plunderedTargetIds.includes(id));
    target = targetId == null ? null : state.buildings.find(building => building.id === targetId && building.built) ?? null;
    siege.activePlunderTargetId = target?.id;
    siege.plunderPath = [];
  }
  if (!target) return null;
  const goals = plunderApproachTiles(state, target);
  if (!goals.has(key(band.x, band.y)) && siege.plunderPath.length === 0) {
    const path = plunderPathTo(state, { x: band.x, y: band.y }, target);
    if (!path) {
      siege.plunderedTargetIds.push(target.id);
      siege.activePlunderTargetId = undefined;
      return null;
    }
    siege.plunderPath = path;
  }
  let steps = CONFIG.siege.plunderMoveStepsPerDay;
  while (steps-- > 0 && siege.plunderPath.length > 0) {
    const next = siege.plunderPath[0];
    if (!isRaidTileTraversable(state, next.x, next.y, false)) {
      siege.plunderPath = [];
      siege.activePlunderTargetId = undefined;
      return null;
    }
    siege.plunderPath.shift();
    band.px = band.x;
    band.py = band.y;
    band.trail ??= [];
    band.trail.push({ x: band.x, y: band.y });
    if (band.trail.length > 26) band.trail.shift();
    band.x = next.x;
    band.y = next.y;
  }
  return goals.has(key(band.x, band.y)) ? target : null;
}

function plunderLocalTarget(siege: SiegeState, building: Building): number {
  let taken = 0;
  let remaining = CONFIG.siege.inventoryPlunderCap;
  if ((building.type === 'field' || building.type === 'paddy') && (building.fieldGrowth ?? 0) > 0) {
    const growth = Math.max(0, building.fieldGrowth ?? 0);
    siege.enemySupply += growth * CONFIG.siege.fieldSupplyPerGrowth;
    building.fieldGrowth = 0;
    building.sownArea = 0;
    taken += growth;
  }
  if (building.type === 'stable' && building.livestock && building.livestock.headcount > 0) {
    const heads = Math.min(2, building.livestock.headcount);
    building.livestock.headcount -= heads;
    siege.enemySupply += heads * CONFIG.siege.livestockSupplyPerHead;
    taken += heads;
  }
  for (const resource of CONFIG.siege.plunderPriority) {
    if (remaining <= 0) break;
    const available = Math.max(0, building.inventory?.[resource] ?? 0);
    const amount = Math.min(available, remaining);
    if (amount <= 0) continue;
    building.inventory![resource] = available - amount;
    remaining -= amount;
    taken += amount;
    addLoot(siege, resource, amount);
  }
  const depleted = !STORAGE_TYPES.has(building.type) &&
    (building.type !== 'stable' || !building.livestock || building.livestock.headcount <= 0) &&
    (building.type !== 'field' && building.type !== 'paddy' || (building.fieldGrowth ?? 0) <= 0) &&
    !Object.values(building.inventory ?? {}).some(amount => (amount ?? 0) > 0.001);
  if (depleted && !siege.plunderedTargetIds.includes(building.id)) siege.plunderedTargetIds.push(building.id);
  return taken;
}

function storageWeight(building: Building): number {
  return CONFIG.siege.storageCapacityWeight[building.type as keyof typeof CONFIG.siege.storageCapacityWeight] ?? 0;
}

function plunderAbstractStorage(state: GameState, siege: SiegeState, interior: ReadonlySet<string>): number {
  const stores = state.buildings.filter(building => building.built && STORAGE_TYPES.has(building.type));
  const totalWeight = stores.reduce((sum, building) => sum + storageWeight(building), 0);
  const exteriorStores = stores.filter(building => !buildingInsideSiegeInterior(building, interior, state) &&
    !siege.plunderedTargetIds.includes(building.id));
  const exteriorWeight = exteriorStores.reduce((sum, building) => sum + storageWeight(building), 0);
  if (totalWeight <= 0 || exteriorWeight <= 0) return 0;
  const share = exteriorWeight / totalWeight;
  let remaining = CONFIG.siege.dailyPlunderCap;
  let taken = 0;
  for (const resource of CONFIG.siege.plunderPriority) {
    if (remaining <= 0) break;
    const availableShare = Math.max(0, state.resources[resource] ?? 0) * share;
    const amount = Math.min(availableShare, remaining);
    if (amount <= 0) continue;
    state.resources[resource] = Math.max(0, state.resources[resource] - amount);
    remaining -= amount;
    taken += amount;
    addLoot(siege, resource, amount);
  }
  siege.plunderedTargetIds.push(...exteriorStores.map(building => building.id));
  return taken;
}

function boundaryWalls(state: GameState, interior: ReadonlySet<string>): Building[] {
  return state.buildings.filter(building => isBlockingDefenseWall(building) &&
    CARDINAL.some(([dx, dy]) => interior.has(key(building.x + dx, building.y + dy))));
}

function pressureWall(state: GameState, siege: SiegeState, interior: ReadonlySet<string>): boolean {
  const walls = boundaryWalls(state, interior).sort((a, b) => wallIntegrity(a) - wallIntegrity(b) || a.id - b.id);
  const wall = walls[0];
  if (!wall) return true;
  wall.structureIntegrityMax = wallIntegrityMax(wall);
  wall.structureIntegrity = Math.max(0, wallIntegrity(wall) - CONFIG.siege.wallPressureDamage[siege.stance === 'wall' ? 'wall' : 'hold']);
  if (siege.stance === 'wall') {
    const loss = Math.max(0.5, computeDefense(state) * CONFIG.siege.wallAttackerLossPerDefense);
    siege.raiderPower = Math.max(0, siege.raiderPower - loss);
    if (state.raiders) {
      state.raiders.power = siege.raiderPower;
      state.raiders.size = Math.max(1, Math.min(6, Math.ceil(siege.raiderPower / 12)));
    }
    const roll = ((state.seed ^ (state.day * 1103515245) ^ wall.id) >>> 0) / 0xffffffff;
    if (roll < CONFIG.siege.wallDefenderInjuryChance) {
      const candidates = siege.defenderIds
        .map(id => state.residents.find(resident => resident.id === id && resident.alive && resident.health >= 20))
        .filter((resident): resident is Resident => resident != null);
      const target = candidates[(state.day + wall.id) % Math.max(1, candidates.length)];
      if (target) target.health = Math.max(5, target.health - 12);
    }
  }
  if (wall.structureIntegrity > 0) return false;
  wall.breached = true;
  delete wall.structureRepair;
  siege.breachTargetId = wall.id;
  bumpDefenseTopology(state);
  state.resources.defense = computeDefense(state);
  addLog(state, `${BUILDING_DEFS[effectiveWallType(wall)!].name} 한 구간이 공성 압박을 버티지 못하고 열렸습니다.`, 'raid', true);
  return true;
}

export interface SiegeReadiness {
  protectedShare: number;
  evacuees: number;
  stranded: number;
  foodStock: number;
  foodPerDay: number;
  foodDays: number;
  fuelHeatStock: number;
  fuelHeatPerDay: number;
  firewoodDays: number;
}

export function siegeReadiness(state: GameState): SiegeReadiness | null {
  const siege = state.siegeState;
  if (!siege) return null;
  const interior = new Set(siege.protectedInterior);
  const stores = state.buildings.filter(building => building.built && STORAGE_TYPES.has(building.type));
  const total = stores.reduce((sum, building) => sum + storageWeight(building), 0);
  const protectedWeight = stores.filter(building => buildingInsideSiegeInterior(building, interior, state))
    .reduce((sum, building) => sum + storageWeight(building), 0);
  const protectedShare = total > 0 ? protectedWeight / total : 1;
  const stranded = new Set(siege.strandedResidentIds);
  const weight = consumptionWeight(state, stranded);
  const season = getSeason(state.day);
  const foodStock = foodTotal(state) * protectedShare;
  const foodPerDay = weight * CONFIG.needs.foodPerDay;
  const fuelHeatStock = fuelHeatTotal(state) * protectedShare;
  const fuelHeatPerDay = weight * CONFIG.needs.firewoodPerPerson * CONFIG.seasons.firewoodMult[season];
  return {
    protectedShare,
    evacuees: state.residents.filter(resident => resident.alive && !stranded.has(resident.id)).length,
    stranded: stranded.size,
    foodStock,
    foodPerDay,
    foodDays: foodPerDay > 0 ? foodStock / foodPerDay : Infinity,
    fuelHeatStock,
    fuelHeatPerDay,
    firewoodDays: fuelHeatPerDay > 0 ? fuelHeatStock / fuelHeatPerDay : Infinity,
  };
}

export function processSiegeDay(state: GameState): void {
  const siege = state.siegeState;
  if (!siege || siege.phase === 'evacuation' || siege.phase === 'sortie' || siege.phase === 'withdrawal') return;
  if (siege.lastProcessedDay >= state.day) return;
  siege.lastProcessedDay = state.day;
  const interior = refreshInterior(state, siege);
  if (interior.size === 0) {
    crisisChoice(state);
    return;
  }

  if (siege.stance === 'wall') {
    siege.phase = 'wallCombat';
    siege.wallEngagement = { day: state.day, mode: 'automatic' };
    if (pressureWall(state, siege, interior)) crisisChoice(state);
  } else {
    siege.phase = 'encirclement';
    const pressureToday = (state.seed + state.day + Math.round(siege.raiderPower)) % 3 === 0;
    if (pressureToday) {
      siege.wallEngagement = { day: state.day, mode: 'automatic' };
      if (pressureWall(state, siege, interior)) crisisChoice(state);
    } else {
      const target = advancePlunderParty(state, siege);
      const localTaken = target ? plunderLocalTarget(siege, target) : 0;
      const storageTaken = target && STORAGE_TYPES.has(target.type)
        ? plunderAbstractStorage(state, siege, interior) : 0;
      if (target && siege.plunderedTargetIds.includes(target.id)) {
        siege.activePlunderTargetId = undefined;
        siege.plunderPath = [];
      }
      if (localTaken + storageTaken > 0) addLog(state, `성밖 자산에서 물자 ${Math.round((localTaken + storageTaken) * 10) / 10}을 약탈당했습니다.`, 'bad');
    }
  }

  if (siege.raiderPower <= 0) {
    finishSiege(state, 'repelled');
    return;
  }
  const season = getSeason(state.day);
  const burn = CONFIG.siege.dailySupplyBurn * CONFIG.siege.seasonBurnMultiplier[season] *
    CONFIG.siege.weatherBurnMultiplier[state.weather];
  siege.enemySupply = Math.max(0, siege.enemySupply - burn);
  siege.enemySupplyEstimate = enemySupplyEstimate(siege.enemySupply, siege.intelLevel);
  if (state.raiders) state.raiders.power = siege.raiderPower;
  if (siege.enemySupply <= 0) {
    siege.phase = 'withdrawal';
    finishSiege(state, 'withdrawal');
    return;
  }

  const readiness = siegeReadiness(state);
  if (readiness && readiness.foodStock <= 0.001) crisisChoice(state);
  const cold = season === 'winter' || state.weather === 'coldSnap' || state.weather === 'blizzard';
  if (cold && readiness && readiness.fuelHeatStock <= 0.001) {
    const stranded = new Set(siege.strandedResidentIds);
    for (const resident of state.residents) {
      if (!resident.alive || stranded.has(resident.id)) continue;
      resident.health = Math.max(1, resident.health - CONFIG.siege.coldNoFuelHealthLoss);
      resident.morale = Math.max(0, resident.morale - CONFIG.siege.coldNoFuelMoraleLoss);
    }
    addLog(state, '성내 땔감이 바닥나 추위가 주민의 건강과 사기를 깎고 있습니다.', 'bad', true);
  }
}
