import { CONFIG } from './config';
import { DAY_CYCLE_SUBTICKS } from './dayCycle';
import { addLog } from './events';
import { findPath } from './agents';
import { isRaidTileTraversable, planRaidRoute } from './raidRoutes';
import { killResident } from './residents';
import type { Building, GameState, RaiderBand, Resident } from './types';
import { assignedWeapon } from './weapons';
import { assignedWorkers } from './workerSlots';

const CARDINAL_AND_DIAGONAL = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
] as const;

function absoluteTick(state: Pick<GameState, 'day' | 'subTick'>): number {
  return state.day * DAY_CYCLE_SUBTICKS + state.subTick;
}

export function watchtowerIntegrityMax(): number {
  return CONFIG.watchtower.integrityMax;
}

export function initializeWatchtowerIntegrity(building: Building): void {
  if (building.type !== 'watchtower') return;
  building.structureIntegrityMax = watchtowerIntegrityMax();
  const value = Number(building.structureIntegrity);
  building.structureIntegrity = Number.isFinite(value)
    ? Math.max(0, Math.min(building.structureIntegrityMax, value))
    : building.structureIntegrityMax;
}

export function stationedWatchman(state: GameState, tower: Building): Resident | null {
  if (tower.type !== 'watchtower' || !tower.built || tower.repairing) return null;
  initializeWatchtowerIntegrity(tower);
  if ((tower.structureIntegrity ?? 0) <= 0) return null;
  return assignedWorkers(state, tower)[0] ?? null;
}

export function isStationedWatchman(state: GameState, resident: Resident): boolean {
  if (resident.assignedBuildingId == null) return false;
  const tower = state.buildings.find(building => building.id === resident.assignedBuildingId);
  return !!tower && tower.type === 'watchtower' && stationedWatchman(state, tower)?.id === resident.id;
}

function towerCenter(tower: Building): { x: number; y: number } {
  return { x: tower.x + ((tower.w ?? 1) - 1) / 2, y: tower.y + ((tower.h ?? 1) - 1) / 2 };
}

function inRange(tower: Building, band: RaiderBand): boolean {
  const from = towerCenter(tower);
  return Math.hypot(from.x - band.x, from.y - band.y) <= CONFIG.watchtower.range + 1e-9;
}

function isActiveTowerTarget(state: GameState, band: RaiderBand): boolean {
  if (!state.siegeState) return band.phase === 'approaching' || band.phase === 'breaching';
  return state.siegeState.phase === 'wallCombat' || state.siegeState.activePlunderTargetId != null;
}

function detourRatio(power: number): number {
  return power < 30 ? CONFIG.raidPathing.detourRatio.small
    : power < 50 ? CONFIG.raidPathing.detourRatio.medium
      : CONFIG.raidPathing.detourRatio.large;
}

function towerApproachPlans(state: GameState, band: RaiderBand, tower: Building) {
  return CARDINAL_AND_DIAGONAL.flatMap(([dx, dy]) => {
    const target = { x: tower.x + dx, y: tower.y + dy };
    if (!isRaidTileTraversable(state, target.x, target.y, true)) return [];
    const plan = planRaidRoute(state, { x: band.x, y: band.y }, target, band.power);
    return plan ? [{ target, plan }] : [];
  }).sort((left, right) => left.plan.totalCost - right.plan.totalCost);
}

function maybeRetargetTower(state: GameState, band: RaiderBand, tower: Building): void {
  if (state.siegeState || band.towerTargetId != null) return;
  const candidate = towerApproachPlans(state, band, tower)[0];
  if (!candidate) return;
  const originalTarget = band.routeTarget;
  const originalPlan = originalTarget
    ? planRaidRoute(state, { x: band.x, y: band.y }, originalTarget, band.power)
    : null;
  if (originalPlan && candidate.plan.totalCost > originalPlan.totalCost * detourRatio(band.power)) return;
  band.towerTargetId = tower.id;
  band.towerReturnTarget = originalTarget;
  band.route = candidate.plan;
  band.path = [...candidate.plan.steps];
  band.routeTarget = candidate.target;
  band.routeRevision = state.defenseTopologyRevision;
  band.phase = 'approaching';
  band.siege = false;
  delete band.breachTargetId;
  addLog(state, '화살에 맞은 습격대 일부가 망루를 향해 방향을 틀었습니다.', 'raid');
}

function projectile(state: GameState, tower: Building, band: RaiderBand, bow: boolean): void {
  const from = towerCenter(tower);
  state.watchtowerProjectiles ??= [];
  state.nextWatchtowerProjectileId = Number.isInteger(state.nextWatchtowerProjectileId)
    ? Math.max(1, state.nextWatchtowerProjectileId) : 1;
  state.watchtowerProjectiles.push({
    id: state.nextWatchtowerProjectileId++,
    towerId: tower.id,
    fromX: from.x,
    fromY: from.y,
    toX: band.x,
    toY: band.y,
    ageTicks: 0,
    durationTicks: CONFIG.watchtower.projectileDurationTicks,
    bow,
  });
  if (state.watchtowerProjectiles.length > 24) state.watchtowerProjectiles.splice(0, state.watchtowerProjectiles.length - 24);
}

function fireTower(state: GameState, tower: Building, watchman: Resident, band: RaiderBand): void {
  const bow = assignedWeapon(state, watchman.id) === 'hornBow';
  if (tower.watchtowerDamageDay !== state.day) {
    tower.watchtowerDamageDay = state.day;
    tower.watchtowerDamageToday = 0;
  }
  const cap = bow ? CONFIG.watchtower.bowDailyDamageCap : CONFIG.watchtower.dailyDamageCap;
  const damage = bow ? CONFIG.watchtower.bowDamage : CONFIG.watchtower.baseDamage;
  const remaining = Math.max(0, cap - (tower.watchtowerDamageToday ?? 0));
  const applied = Math.min(damage, remaining, band.power);
  if (applied > 0) {
    band.power = Math.max(0, band.power - applied);
    tower.watchtowerDamageToday = (tower.watchtowerDamageToday ?? 0) + applied;
    if (state.siegeState) state.siegeState.raiderPower = band.power;
  }
  if (remaining <= damage + 1e-9) {
    band.suppressedUntilTick = Math.max(
      band.suppressedUntilTick ?? 0,
      absoluteTick(state) + CONFIG.watchtower.suppressionTicks,
    );
  }
  projectile(state, tower, band, bow);
  tower.watchtowerLastShotTick = absoluteTick(state);
  maybeRetargetTower(state, band, tower);
}

function escapePath(state: GameState, resident: Resident): { x: number; y: number }[] | null {
  const center = state.buildings.find(building => building.type === 'center' && building.built);
  if (!center) return null;
  return findPath(state, resident.x, resident.y, tile =>
    Math.abs(tile.x - center.x) <= 1 && Math.abs(tile.y - center.y) <= 1 &&
    state.map[tile.y]?.[tile.x]?.buildingId == null);
}

function startEscape(state: GameState, tower: Building, resident: Resident): void {
  resident.assignedBuildingId = null;
  resident.watchtowerEscapeTowerId = tower.id;
  resident.watchtowerEscapeDeadlineTick = absoluteTick(state) + CONFIG.watchtower.escapeGraceTicks;
  const path = escapePath(state, resident);
  resident.watchtowerEscapeHasRoute = path != null;
  resident.path = path ?? [];
  resident.manualOrder = null;
  resident.targetId = null;
  addLog(state, `${resident.name}이(가) 무너지는 망루에서 철수하기 시작했습니다.`, 'raid', true);
}

function resolveStrandedEscapes(state: GameState): void {
  const now = absoluteTick(state);
  for (const resident of state.residents) {
    if (!resident.alive || resident.watchtowerEscapeTowerId == null || resident.watchtowerEscapeHasRoute !== false) continue;
    if (now < (resident.watchtowerEscapeDeadlineTick ?? now)) continue;
    delete resident.watchtowerEscapeTowerId;
    delete resident.watchtowerEscapeDeadlineTick;
    delete resident.watchtowerEscapeHasRoute;
    resident.health = Math.max(0, resident.health - 60);
    if (resident.health <= 0) {
      killResident(state, resident, '망루 붕괴', false, true);
    } else {
      resident.sick = true;
      resident.task = '망루 탈출 중 부상';
      addLog(state, `${resident.name}이(가) 퇴로가 끊긴 망루에서 가까스로 빠져나왔으나 크게 다쳤습니다.`, 'bad', true);
    }
  }
}

export function damageWatchtower(state: GameState, tower: Building, amount: number): boolean {
  initializeWatchtowerIntegrity(tower);
  const resident = stationedWatchman(state, tower);
  tower.structureIntegrity = Math.max(0, (tower.structureIntegrity ?? 0) - Math.max(0, amount));
  const ratio = (tower.structureIntegrity ?? 0) / (tower.structureIntegrityMax ?? 1);
  if (resident && ratio <= CONFIG.watchtower.escapeIntegrityRatio) startEscape(state, tower, resident);
  if ((tower.structureIntegrity ?? 0) > 0) return false;
  tower.built = false;
  tower.repairing = true;
  tower.repairCause = 'raid';
  tower.progress = Math.max(
    tower.progress * CONFIG.raid.repairProgressMin,
    CONFIG.raid.repairProgressMin,
  );
  tower.watchtowerHadTarget = false;
  addLog(state, '망루가 공격을 견디지 못하고 무너졌습니다.', 'raid', true);
  return true;
}

export function watchtowerAssaultDamage(state: GameState, band: RaiderBand, tower: Building): boolean {
  const amount = Math.max(CONFIG.watchtower.minimumAssaultDamage, band.power * CONFIG.watchtower.assaultDamagePerPower);
  return damageWatchtower(state, tower, amount);
}

export function watchtowerTick(state: GameState): void {
  state.watchtowerProjectiles ??= [];
  state.nextWatchtowerProjectileId = Number.isInteger(state.nextWatchtowerProjectileId)
    ? Math.max(1, state.nextWatchtowerProjectileId) : 1;
  for (const shot of state.watchtowerProjectiles) shot.ageTicks++;
  state.watchtowerProjectiles = state.watchtowerProjectiles.filter(shot => shot.ageTicks < shot.durationTicks);
  resolveStrandedEscapes(state);
  const band = state.raiders;
  for (const tower of state.buildings.filter(building => building.type === 'watchtower' && building.built)) {
    initializeWatchtowerIntegrity(tower);
    const watchman = stationedWatchman(state, tower);
    const targetInRange = !!band && band.power > 0 && !state.battle &&
      isActiveTowerTarget(state, band) && inRange(tower, band);
    if (!watchman || !targetInRange || !band) {
      tower.watchtowerHadTarget = false;
      continue;
    }
    const now = absoluteTick(state);
    const firstEntryShot = tower.watchtowerHadTarget !== true;
    const cadenceReady = now - (tower.watchtowerLastShotTick ?? -CONFIG.watchtower.fireIntervalTicks) >=
      CONFIG.watchtower.fireIntervalTicks;
    tower.watchtowerHadTarget = true;
    if (firstEntryShot || cadenceReady) fireTower(state, tower, watchman, band);
  }
}
