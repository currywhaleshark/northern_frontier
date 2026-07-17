import { findPath, isTerrainPassable, resetAgent } from './agents';
import { CONFIG } from './config';
import { addLog } from './events';
import { createCombatRoster, isCombatReadyResident, type CombatantSnapshot } from './combatRoster';
import { deliverExpeditionCorpses, loseExpeditionCorpses } from './lifecycle';
import { consumeMusketPowder, reconcileWeaponAssignments, resolvedMountAssignments } from './weapons';
import type {
  Expedition, ExpeditionKind, GameState, PredatorKind, Resident, ResourceId,
} from './types';

const MUSTER_DEADLINE_TICKS = 5;
const MUSTER_READY_RATIO = 0.6;
const MUSTER_RADIUS = 2;

export interface CreateExpeditionInput {
  kind: ExpeditionKind;
  memberIds: number[];
  targetX: number;
  targetY: number;
  targetSiteId?: number;
  predatorKind?: PredatorKind;
  speed?: number;
  carriedLoot?: Partial<Record<ResourceId, number>>;
}

export function expeditionMemberIds(state: GameState): Set<number> {
  return new Set(state.expedition?.memberIds ?? []);
}

export function isExpeditionMember(state: GameState, residentId: number): boolean {
  return state.expedition?.memberIds.includes(residentId) ?? false;
}

function expeditionEligible(state: GameState, resident: Resident): boolean {
  return isCombatReadyResident(state, resident, 'expedition', new Set([resident.id])) &&
    (resident.job === 'militia' || resident.job === 'watchman' || resident.job === 'hunter');
}

export function availableExpeditionResidents(state: GameState): Resident[] {
  const away = expeditionMemberIds(state);
  const roleOrder = { militia: 0, watchman: 1, hunter: 2 } as const;
  return state.residents
    .filter(resident => !away.has(resident.id) && expeditionEligible(state, resident))
    .sort((a, b) =>
      roleOrder[a.job as keyof typeof roleOrder] - roleOrder[b.job as keyof typeof roleOrder] || a.id - b.id);
}

export function expeditionCombatPower(state: GameState, memberIds: Iterable<number>): number {
  return createCombatRoster(state, { context: 'expedition', memberIds }).combatants
    .reduce((total, combatant) => total + combatant.basePower + combatant.weaponPower, 0);
}

export interface CombatRosterWeaponSummary {
  assignedMuskets: number;
  readyMuskets: number;
  dryMuskets: number;
  hornBows: number;
  spears: number;
  unarmed: number;
}

export interface ExpeditionMusterPreview {
  expeditionCombatants: CombatantSnapshot[];
  remainingCombatants: CombatantSnapshot[];
  expeditionPower: number;
  expeditionWeapons: CombatRosterWeaponSummary;
  remainingWeapons: CombatRosterWeaponSummary;
  remainingGunpowder: number;
}

function combatRosterWeapons(combatants: CombatantSnapshot[]): CombatRosterWeaponSummary {
  const assignedMuskets = combatants.filter(combatant => combatant.assignedWeapon === 'musket').length;
  const readyMuskets = combatants.filter(combatant => combatant.readyWeapon === 'musket').length;
  return {
    assignedMuskets,
    readyMuskets,
    dryMuskets: assignedMuskets - readyMuskets,
    hornBows: combatants.filter(combatant => combatant.assignedWeapon === 'hornBow').length,
    spears: combatants.filter(combatant => combatant.assignedWeapon === 'spear').length,
    unarmed: combatants.filter(combatant => combatant.assignedWeapon == null).length,
  };
}

export function expeditionMusterPreview(
  state: GameState,
  memberIds: Iterable<number>,
): ExpeditionMusterPreview {
  const selectedIds = [...new Set(memberIds)];
  const expeditionCombatants = createCombatRoster(state, {
    context: 'expedition', memberIds: selectedIds,
  }).combatants;
  const expeditionWeapons = combatRosterWeapons(expeditionCombatants);
  const remainingGunpowder = Math.max(
    0,
    state.resources.gunpowder - expeditionWeapons.readyMuskets * CONFIG.raid.powderPerMusket,
  );
  const remainingCombatants = createCombatRoster(state, {
    context: 'villageDefense', excludedResidentIds: selectedIds, gunpowderAvailable: remainingGunpowder,
  }).combatants;
  return {
    expeditionCombatants,
    remainingCombatants,
    expeditionPower: expeditionCombatants.reduce(
      (total, combatant) => total + combatant.basePower + combatant.weaponPower,
      0,
    ),
    expeditionWeapons,
    remainingWeapons: combatRosterWeapons(remainingCombatants),
    remainingGunpowder,
  };
}

export function expeditionResidentsForIds(state: GameState, memberIds: Iterable<number>): Resident[] {
  const ids = new Set(memberIds);
  return state.residents.filter(resident => resident.alive && ids.has(resident.id));
}

export function consumeExpeditionPowder(state: GameState, memberIds: Iterable<number>): number {
  const musketIds = createCombatRoster(state, { context: 'expedition', memberIds }).combatants
    .filter(combatant => combatant.assignedWeapon === 'musket')
    .map(combatant => combatant.residentId);
  const used = consumeMusketPowder(state, musketIds, CONFIG.raid.powderPerMusket);
  if (used <= 0) return 0;
  addLog(state, `토벌대의 조총 사격이 울립니다. (화약 -${used.toFixed(1)})`, 'raid');
  return used;
}

export function predatorExpeditionTarget(
  state: GameState,
  kind: PredatorKind,
): { x: number; y: number; habitatId: number } | null {
  if (!state.incidents.predatorThreats[kind]) return null;
  const center = settlementCenter(state) ?? {
    x: Math.floor((state.map[0]?.length ?? 1) / 2),
    y: Math.floor(state.map.length / 2),
  };
  const habitat = state.habitats
    .filter(candidate => candidate.active)
    .sort((a, b) => {
      const aDistance = Math.abs(a.x - center.x) + Math.abs(a.y - center.y);
      const bDistance = Math.abs(b.x - center.x) + Math.abs(b.y - center.y);
      return aDistance - bDistance || a.id - b.id;
    })[0];
  return habitat ? { x: habitat.x, y: habitat.y, habitatId: habitat.id } : null;
}

export function expeditionStateBlockReason(state: GameState): string | null {
  if (state.expedition) return '이미 출정 중인 토벌대가 있습니다.';
  if (state.battle || state.raiders || state.tacticalBattle || state.pendingChoice || state.raidHold) {
    return '습격이나 다른 중대 사건에 대응 중에는 토벌대를 소집할 수 없습니다.';
  }
  return null;
}

function settlementCenter(state: GameState): { x: number; y: number } | null {
  const center = state.buildings.find(building => building.type === 'center' && building.built);
  return center ? { x: center.x, y: center.y } : null;
}

function musterPoint(state: GameState): { x: number; y: number } | null {
  const center = settlementCenter(state);
  if (!center) return null;
  const candidates: Array<{ x: number; y: number; distance: number }> = [];
  for (let y = Math.max(0, center.y - 4); y <= Math.min(state.map.length - 1, center.y + 4); y++) {
    for (let x = Math.max(0, center.x - 4); x <= Math.min((state.map[y]?.length ?? 1) - 1, center.x + 4); x++) {
      const distance = Math.abs(x - center.x) + Math.abs(y - center.y);
      if (distance < 2 || distance > 4 || !isTerrainPassable(state, x, y)) continue;
      if (state.map[y]?.[x]?.buildingId != null) continue;
      candidates.push({ x, y, distance });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
  return candidates[0] ?? center;
}

function routeTo(
  state: GameState,
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
): { x: number; y: number }[] | null {
  return findPath(
    state,
    fromX,
    fromY,
    tile => Math.max(Math.abs(tile.x - targetX), Math.abs(tile.y - targetY)) <= 1 &&
      isTerrainPassable(state, tile.x, tile.y),
    (x, y) => isTerrainPassable(state, x, y),
  );
}

function expeditionMembers(state: GameState, expedition = state.expedition): Resident[] {
  if (!expedition) return [];
  const ids = new Set(expedition.memberIds);
  return state.residents.filter(resident => resident.alive && ids.has(resident.id));
}

function setMemberTask(state: GameState, task: string): void {
  for (const member of expeditionMembers(state)) member.task = task;
}

export function createExpedition(state: GameState, input: CreateExpeditionInput): string | null {
  const stateBlock = expeditionStateBlockReason(state);
  if (stateBlock) return stateBlock;
  const uniqueIds = [...new Set(input.memberIds)];
  if (uniqueIds.length < 2) return '토벌대는 최소 2명이어야 합니다.';
  const members = uniqueIds
    .map(id => state.residents.find(resident => resident.id === id))
    .filter((resident): resident is Resident => resident != null);
  if (members.length !== uniqueIds.length || members.some(member => !expeditionEligible(state, member))) {
    return '출정할 수 없는 주민이 포함되어 있습니다.';
  }
  const muster = musterPoint(state);
  if (!muster) return '토벌대가 집결할 마을 중심지를 찾을 수 없습니다.';
  const marchPath = routeTo(state, muster.x, muster.y, input.targetX, input.targetY);
  if (!marchPath) return '목표 지점까지 이동할 길을 찾을 수 없습니다.';
  reconcileWeaponAssignments(state);

  const expedition: Expedition = {
    kind: input.kind,
    targetSiteId: input.targetSiteId,
    predatorKind: input.predatorKind,
    targetX: input.targetX,
    targetY: input.targetY,
    musterX: muster.x,
    musterY: muster.y,
    phase: 'muster',
    memberIds: uniqueIds,
    x: muster.x,
    y: muster.y,
    px: muster.x,
    py: muster.y,
    path: marchPath,
    trail: [],
    speed: Math.max(0.25, input.speed ?? 1.25),
    ticks: 0,
    carriedLoot: input.carriedLoot,
  };
  state.expedition = expedition;
  for (const member of members) {
    resetAgent(state, member);
    member.path = findPath(
      state,
      member.x,
      member.y,
      tile => tile.x === muster.x && tile.y === muster.y,
      (x, y) => isTerrainPassable(state, x, y),
    ) ?? [];
    member.task = '토벌 집결 중';
  }
  addLog(state, `토벌대 ${members.length}명이 마을 어귀에 집결하기 시작했습니다.`, 'info', true);
  return null;
}

function moveMusterMembers(state: GameState, expedition: Expedition): void {
  for (const member of expeditionMembers(state, expedition)) {
    member.px = member.x;
    member.py = member.y;
    const next = member.path.shift();
    if (next) {
      member.x = next.x;
      member.y = next.y;
    }
    member.task = '토벌 집결 중';
  }
}

function musterReady(state: GameState, expedition: Expedition): boolean {
  const members = expeditionMembers(state, expedition);
  if (members.length === 0) return true;
  const arrived = members.filter(member =>
    Math.max(Math.abs(member.x - expedition.musterX), Math.abs(member.y - expedition.musterY)) <= MUSTER_RADIUS).length;
  return arrived / members.length >= MUSTER_READY_RATIO || expedition.ticks >= MUSTER_DEADLINE_TICKS;
}

function weatherSpeedMultiplier(state: GameState): number {
  if (state.weather === 'blizzard') return 0.45;
  if (state.weather === 'heavySnow') return 0.65;
  if (state.weather === 'coldSnap') return 0.75;
  if (state.weather === 'rain' || state.weather === 'thawFlood') return 0.8;
  return 1;
}

export function expeditionMountedSpeedMultiplier(
  state: GameState,
  memberIds: readonly number[] = state.expedition?.memberIds ?? [],
): number {
  const memberSet = new Set(memberIds);
  const livingMembers = state.residents.filter(resident => resident.alive && memberSet.has(resident.id));
  if (livingMembers.length === 0) return 1;
  const assignments = resolvedMountAssignments(state);
  const mounted = livingMembers.filter(resident => assignments[resident.id] === 'horse').length;
  const bonus = Math.min(
    CONFIG.mounted.expeditionSpeedMaxBonus,
    mounted / livingMembers.length * CONFIG.mounted.expeditionSpeedMaxBonus,
  );
  return 1 + bonus;
}

function movementSteps(state: GameState, expedition: Expedition): number {
  const speed = expedition.speed * weatherSpeedMultiplier(state) *
    expeditionMountedSpeedMultiplier(state, expedition.memberIds);
  const whole = Math.floor(speed);
  const fraction = speed - whole;
  const deterministicRoll = ((expedition.ticks * 2654435761) >>> 0) / 0x100000000;
  return Math.max(0, whole + (deterministicRoll < fraction ? 1 : 0));
}

function syncMembersToUnit(state: GameState, expedition: Expedition, task: string): void {
  for (const member of expeditionMembers(state, expedition)) {
    member.px = expedition.px;
    member.py = expedition.py;
    member.x = expedition.x;
    member.y = expedition.y;
    member.path = [];
    member.task = task;
  }
}

function moveExpeditionUnit(state: GameState, expedition: Expedition): void {
  expedition.px = expedition.x;
  expedition.py = expedition.y;
  let steps = movementSteps(state, expedition);
  while (steps-- > 0 && expedition.path.length > 0) {
    const next = expedition.path.shift()!;
    expedition.trail.push({ x: expedition.x, y: expedition.y });
    if (expedition.trail.length > 30) expedition.trail.shift();
    expedition.x = next.x;
    expedition.y = next.y;
  }
  syncMembersToUnit(state, expedition, expedition.phase === 'return' ? '토벌 귀환 중' : '토벌 출정');
}

function completeReturn(state: GameState, expedition: Expedition): void {
  const members = expeditionMembers(state, expedition);
  state.expedition = null;
  for (const member of members) {
    member.x = expedition.musterX;
    member.y = expedition.musterY;
    member.px = expedition.musterX;
    member.py = expedition.musterY;
    resetAgent(state, member);
    member.task = '대기';
  }
  addLog(state, `토벌대 ${members.length}명이 마을로 돌아왔습니다.`, 'info', true);
  deliverExpeditionCorpses(state, expedition.musterX, expedition.musterY); // 전사자도 함께 돌아온다
}

export function beginExpeditionReturn(state: GameState, message?: string): string | null {
  const expedition = state.expedition;
  if (!expedition) return '귀환시킬 원정대가 없습니다.';
  const path = routeTo(state, expedition.x, expedition.y, expedition.musterX, expedition.musterY);
  if (!path) return '마을로 돌아갈 길을 찾을 수 없습니다.';
  expedition.phase = 'return';
  expedition.path = path;
  expedition.ticks = 0;
  setMemberTask(state, '토벌 귀환 중');
  if (message) addLog(state, message, 'raid', true);
  if (path.length === 0) completeReturn(state, expedition);
  return null;
}

export function orderExpeditionReturn(state: GameState): string | null {
  return beginExpeditionReturn(state, '전령이 토벌대에 즉시 회군 명령을 전했습니다.');
}

export function estimateExpeditionReturnTicks(state: GameState): number | null {
  const expedition = state.expedition;
  if (!expedition) return null;
  const path = expedition.phase === 'return'
    ? expedition.path
    : routeTo(state, expedition.x, expedition.y, expedition.musterX, expedition.musterY);
  if (!path) return null;
  const effectiveSpeed = Math.max(0.25, expedition.speed * weatherSpeedMultiplier(state) *
    expeditionMountedSpeedMultiplier(state, expedition.memberIds));
  return Math.ceil(path.length / effectiveSpeed);
}

export function expeditionTick(state: GameState): void {
  const expedition = state.expedition;
  if (!expedition) return;
  expedition.ticks += 1;
  expedition.memberIds = expedition.memberIds.filter(id =>
    state.residents.some(resident => resident.id === id && resident.alive));
  if (expedition.memberIds.length === 0) {
    state.expedition = null;
    loseExpeditionCorpses(state); // 전멸 — 시신을 수습할 사람이 돌아오지 못했다
    return;
  }

  if (expedition.phase === 'muster') {
    moveMusterMembers(state, expedition);
    if (!musterReady(state, expedition)) return;
    expedition.phase = 'march';
    expedition.ticks = 0;
    for (const member of expeditionMembers(state, expedition)) {
      member.x = expedition.musterX;
      member.y = expedition.musterY;
      member.px = expedition.musterX;
      member.py = expedition.musterY;
      member.path = [];
      member.task = '토벌 출정';
    }
    addLog(state, `토벌대가 ${expedition.memberIds.length}명 편제로 출발했습니다.`, 'info', true);
    return;
  }

  if (expedition.phase === 'engage') {
    syncMembersToUnit(state, expedition, '토벌 교전 대기');
    return;
  }

  moveExpeditionUnit(state, expedition);
  if (expedition.path.length > 0) return;
  if (expedition.phase === 'return') {
    completeReturn(state, expedition);
    return;
  }
  expedition.phase = 'engage';
  expedition.ticks = 0;
  setMemberTask(state, '토벌 교전 대기');
  addLog(state, '토벌대가 목표 지점에 도착해 개전 명령을 기다립니다.', 'raid', true);
}
