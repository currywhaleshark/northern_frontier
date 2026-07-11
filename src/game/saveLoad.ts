// localStorage 저장/불러오기
import { CONFIG } from './config';
import { rebuildBuildingFootprints } from './buildings';
import { defaultCropForBuildingType } from './crops';
import { rollCourtTribute } from './courtTribute';
import { spawnAnimalHabitats } from './habitats';
import { makeRng } from './map';
import { ensureMineralDeposits } from './minerals';
import { ensureProcessingReserves } from './processing';
import { initRelations } from './relations';
import { getSeason, getYear } from './seasons';
import { ensureExploration, refreshExploration } from './exploration';
import { RESOURCE_IDS } from './resourceCatalog';
import { reconcileTributeReserve } from './tributeReserve';
import { reconcileResidentHomes } from './residents';
import { ensureIncidentState } from './specialEvents';
import { ensureForeignSiteState, revealForeignSitesFromExploration } from './foreignSites';
import type { CourtTribute, GameState, Gender, Resident, ResourceId } from './types';

const SAVE_KEY = 'buksae-save-v3'; // v3: 이동 보간(px/py)과 지도 위 습격 무리 추가
const RESOURCE_ID_SET = new Set<string>(RESOURCE_IDS);

function normalizedAmount(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function migrateResourceBag(
  raw: unknown,
  complete: boolean,
): Partial<Record<ResourceId, number>> {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const next: Partial<Record<ResourceId, number>> = {};
  for (const id of RESOURCE_IDS) {
    const amount = normalizedAmount(source[id]);
    if (complete || amount > 0) next[id] = amount;
  }

  const legacyFood = normalizedAmount(source.food);
  if (legacyFood > 0) next.grain = (next.grain ?? 0) + legacyFood;
  const legacyClothes = normalizedAmount(source.clothes);
  if (legacyClothes > 0) next.hideClothes = (next.hideClothes ?? 0) + legacyClothes;
  const game = normalizedAmount(source.game);
  if (game > 0) {
    next.meat = (next.meat ?? 0) + game * CONFIG.production.meatPerGame;
    next.hide = (next.hide ?? 0) + game * CONFIG.production.hidePerGame;
  }
  return next;
}

function migrateTributeItems(items: CourtTribute['items']): CourtTribute['items'] {
  const next: CourtTribute['items'] = {};
  for (const [legacyId, rawAmount] of Object.entries(items ?? {})) {
    const mappedId = legacyId === 'food' ? 'grain'
      : legacyId === 'clothes' ? 'hideClothes'
      : legacyId === 'game' ? 'meat'
      : legacyId;
    if (!RESOURCE_ID_SET.has(mappedId)) continue;
    const id = mappedId as ResourceId;
    const multiplier = legacyId === 'game' ? CONFIG.production.meatPerGame : 1;
    next[id] = (next[id] ?? 0) + normalizedAmount(rawAmount) * multiplier;
  }
  return next;
}

function migrateResourceTaxonomy(state: GameState): void {
  state.resources = migrateResourceBag(state.resources, true) as Record<ResourceId, number>;
  const legacyState = state as GameState & { tributeReserve?: unknown };
  state.tributeReserve = migrateResourceBag(legacyState.tributeReserve, false);
  for (const resident of state.residents) {
    resident.carrying = migrateResourceBag(resident.carrying, false);
  }
  for (const building of state.buildings ?? []) {
    building.inventory = migrateResourceBag(building.inventory, false);
  }
  if (state.courtTribute) state.courtTribute.items = migrateTributeItems(state.courtTribute.items);

  // 레거시 모달에는 삭제된 자원 ID와 이미 계산된 교환량이 들어 있을 수 있다.
  // 다시 열 수 있는 선택지만 닫아 두어 다음 틱에 현재 규칙으로 재생성한다.
  if (state.pendingChoice && ['trade', 'tribute', 'petition'].includes(state.pendingChoice.kind)) {
    state.pendingChoice = null;
  }
}

function isGender(value: unknown): value is Gender {
  return value === 'male' || value === 'female';
}

function stableGenderForResident(resident: Pick<Resident, 'id' | 'name'>): Gender {
  let hash = (resident.id * 2166136261) >>> 0;
  for (let i = 0; i < resident.name.length; i++) {
    hash ^= resident.name.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return (hash & 1) === 0 ? 'female' : 'male';
}

function migrateResidentGender(state: GameState): void {
  for (const resident of state.residents as Array<Resident & { gender?: unknown }>) {
    if (!isGender(resident.gender)) {
      resident.gender = stableGenderForResident(resident);
    }
  }
}

function migrateResidentManualOrders(state: GameState): void {
  for (const resident of state.residents) {
    const mutable = resident as Resident & { manualOrder?: Resident['manualOrder'] };
    const order = mutable.manualOrder as unknown;
    const valid =
      order == null ||
      (typeof order === 'object' &&
        ('kind' in order) &&
        ((order as { kind?: unknown }).kind === 'move' || (order as { kind?: unknown }).kind === 'work') &&
        Number.isInteger((order as { x?: unknown }).x) &&
        Number.isInteger((order as { y?: unknown }).y));
    if (!valid || mutable.manualOrder === undefined) resident.manualOrder = null;
  }
}

function migrateResidentAssignedBuildingIds(state: GameState): void {
  for (const resident of state.residents as Array<Resident & { assignedBuildingId?: unknown }>) {
    if (!Number.isInteger(resident.assignedBuildingId)) resident.assignedBuildingId = null;
  }
}

function migrateResidentHomeBuildingIds(state: GameState): void {
  for (const resident of state.residents as Array<Resident & { homeBuildingId?: unknown }>) {
    if (!Number.isInteger(resident.homeBuildingId)) resident.homeBuildingId = null;
  }
}

function migrateResidentCarts(state: GameState): void {
  for (const resident of state.residents as Array<Resident & { cartEquipped?: unknown }>) {
    resident.cartEquipped = resident.cartEquipped === true;
    if (resident.cartEquipped && (!resident.alive || resident.job !== 'hauler')) {
      resident.cartEquipped = false;
      state.resources.carts += 1;
    }
  }
}

function migrateResidentHaulTasks(state: GameState): void {
  for (const resident of state.residents as Array<Resident & { haulTask?: Resident['haulTask'] }>) {
    const task = resident.haulTask;
    const valid = task != null &&
      Number.isInteger(task.sourceBuildingId) &&
      RESOURCE_ID_SET.has(task.resource) &&
      Number.isFinite(task.amount) && task.amount > 0;
    if (!valid) resident.haulTask = null;
  }
}

export function saveGame(state: GameState): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    // 최소한의 유효성 검사 (구버전 저장은 무시)
    if (!parsed.map || !parsed.residents || !parsed.resources || !parsed.buildings) return null;
    if (parsed.subTick == null || parsed.residents.some(r => r.x == null || r.px == null)) return null;
    if (!('raiders' in parsed)) return null;
    if (!Object.prototype.hasOwnProperty.call(parsed, 'battle')) parsed.battle = null;
    ensureMineralDeposits(parsed.map);
    if (parsed.battle && !parsed.battle.mode) parsed.battle.mode = 'garrison';
    if (parsed.battle && !parsed.battle.location) {
      parsed.battle.location = parsed.battle.mode === 'levy' ? 'village' : 'outskirts';
    }
    if (!parsed.lastTradeByFaction) parsed.lastTradeByFaction = {};
    const currentTradeSeason = Math.floor((Math.max(1, parsed.day) - 1) / CONFIG.time.seasonDays);
    if (parsed.tradeCapacitySeason == null || parsed.tradeCapacitySeason !== currentTradeSeason) {
      parsed.tradeCapacitySeason = currentTradeSeason;
      parsed.tradeCapacityUsed = {};
    } else if (!parsed.tradeCapacityUsed || typeof parsed.tradeCapacityUsed !== 'object') {
      parsed.tradeCapacityUsed = {};
    }
    if (parsed.lastImmigrationDay == null) parsed.lastImmigrationDay = -999;
    ensureIncidentState(parsed);
    ensureForeignSiteState(parsed);
    migrateResourceTaxonomy(parsed);
    // 구버전 저장 마이그레이션: 없는 필드는 기본값으로 채운다
    if (!parsed.relations) parsed.relations = initRelations();
    if (!parsed.difficulty) parsed.difficulty = 'normal';
    if (!parsed.habitats) {
      // 사냥터 지형이 있던 구버전: 사냥터를 숲으로 바꾸고 시드로 서식지를 새로 뽑는다
      let cx = Math.floor(parsed.map[0].length / 2);
      let cy = Math.floor(parsed.map.length / 2);
      for (const row of parsed.map) {
        for (const tile of row) {
          if ((tile.terrain as string) === 'hunting') tile.terrain = 'forest';
          if (tile.terrain === 'center') { cx = tile.x; cy = tile.y; }
        }
      }
      parsed.habitats = spawnAnimalHabitats(
        parsed.map, cx, cy, makeRng(parsed.seed ?? 1),
        CONFIG.difficulty[parsed.difficulty].habitatChance,
      );
    }
    // 승격 없는 구버전: 옛 승리(진보 승격)를 이뤘다면 보에서 이어간다
    if (!Object.prototype.hasOwnProperty.call(parsed, 'rank')) {
      parsed.rank = parsed.gameOver?.won ? 'bo' : 'settlement';
    }
    if (parsed.tributePaidStreak == null) parsed.tributePaidStreak = 0;
    for (const building of parsed.buildings) {
      if (building.built) building.repairing = false;
      if (building.type === 'smithy' && !building.smithyProduct) building.smithyProduct = 'tools';
      if ((building.type === 'field' || building.type === 'paddy') &&
          !Object.prototype.hasOwnProperty.call(building, 'cropId')) {
        building.cropId = defaultCropForBuildingType(building.type);
      }
      if ((building.type === 'field' || building.type === 'paddy') &&
          !Object.prototype.hasOwnProperty.call(building, 'queuedCropId')) {
        building.queuedCropId = null;
      }
    }
    ensureProcessingReserves(parsed);
    if (parsed.lastPetitionDay == null) parsed.lastPetitionDay = 0;
    if (parsed.cannonsGranted == null) parsed.cannonsGranted = 0;
    // 모반 의심 없는 구버전
    if (parsed.suspicion == null) parsed.suspicion = 0;
    if (parsed.nitrePaused == null) parsed.nitrePaused = false;
    if (parsed.nitreHiddenUntil == null) parsed.nitreHiddenUntil = 0;
    if (!parsed.initiatedTradeDays) parsed.initiatedTradeDays = [];
    if (parsed.inspectionCooldownUntil == null) parsed.inspectionCooldownUntil = 0;
    if (parsed.censured == null) parsed.censured = false;
    if (parsed.crackdownDeadline == null) parsed.crackdownDeadline = 0;
    // 세공 없는 구버전: 시드로 올해분을 재생성. 이미 겨울이면 올해분은 면제 (다음 봄부터 정상 진행)
    if (!Object.prototype.hasOwnProperty.call(parsed, 'courtTribute')) {
      const pop = parsed.residents.filter(r => r.alive).length;
      const tribute = rollCourtTribute(parsed.seed ?? 1, getYear(parsed.day), pop, parsed.rank);
      if (getSeason(parsed.day) === 'winter') {
        tribute.resolved = true;
        tribute.paid = true;
      }
      parsed.courtTribute = tribute;
    }
    if (parsed.tributeFailStreak == null) parsed.tributeFailStreak = 0;
    reconcileTributeReserve(parsed);
    migrateResidentGender(parsed);
    migrateResidentCarts(parsed);
    migrateResidentManualOrders(parsed);
    migrateResidentAssignedBuildingIds(parsed);
    migrateResidentHomeBuildingIds(parsed);
    migrateResidentHaulTasks(parsed);
    rebuildBuildingFootprints(parsed);
    reconcileResidentHomes(parsed, makeRng((parsed.seed ?? 1) + parsed.day * 32452843));
    ensureExploration(parsed);
    refreshExploration(parsed);
    revealForeignSitesFromExploration(parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  return localStorage.getItem(SAVE_KEY) != null;
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}
