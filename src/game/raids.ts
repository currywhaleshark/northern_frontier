// 습격 시스템 — 위협도 누적, 지도 위 습격 무리 접근, 위기 선택지와 결과 판정
import { withJosa } from './josa';
import { CONFIG } from './config';
import { recordAnnals } from './annals';
import { FACTIONS, RESOURCE_NAMES, type Faction } from './constants';
import { BUILDING_DEFS, computeDefense, countBuilt, footprintTilesOf } from './buildings';
import { addLog } from './events';
import { openGuideOnce } from './guides';
import {
  applyBattleDefenseMultipliers, cannonBattleMult, consumeBattlePowder, levyDefenseBonus, startBattle,
} from './battles';
import { SUBTICKS } from './agents';
import { estimateExpeditionReturnTicks, orderExpeditionReturn } from './expedition';
import { damageBuildings, injure, killResidents, loot, moraleShock } from './raidDamage';
import { rankEffects } from './promotion';
import { changeRelation, getRelation, hostileRelationsAvg } from './relations';
import { consumeEdibleFood, edibleFoodTotal } from './resources';
import { getSeason, getYear } from './seasons';
import { isLakeIceAt } from './lakeIce';
import type {
  BattleMode, Building, ExpeditionRaidOrder, GameState, PendingChoice, RaiderBand, RaidRoutePlan, TradeNegotiation,
} from './types';
import {
  bumpDefenseTopology, effectiveWallType, isBlockingDefenseWall, isRaidTileTraversable,
  isProtectedBoundaryBreach, planRaidRoute, wallIntegrity, wallIntegrityMax,
} from './raidRoutes';
import { findRaidOriginSite } from './foreignSites';
import { createTacticalBattle } from './tacticalBattle';
import { activePredatorScoutIds } from './expeditionIntel';
import { activeDiplomaticPact, announceRaidTip, raidTipInformant } from './diplomacy';
import { borderCommanderEffects, factionLeaderSubject, factionRaidPartyLabel } from './diplomaticFigures';
import { canStartLongSiege, openLongSiegeChoice, resolveSiegeChoice } from './siege';
import { isStationedWatchman, watchtowerAssaultDamage } from './watchtowers';

type RaidWarningSource = 'diplomatic';

// 위협도 일일 갱신
export function updateThreat(state: GameState): void {
  const t = CONFIG.threat;
  let delta = t.basePerDay;
  const season = getSeason(state.day);
  if (season === 'autumn' || season === 'winter') delta += t.coldSeasonExtra;
  if (edibleFoodTotal(state) + state.resources.hide > t.wealthThreshold) delta += t.wealthExtra;
  if (state.resources.reputation < 35) delta += t.lowRepExtra;
  if (state.tradeRefusedDays > 0) delta += t.tradeRefusedExtra;
  const away = new Set([
    ...(state.expedition?.memberIds ?? []),
    ...(state.warDispatch?.memberIds ?? []),
    ...activePredatorScoutIds(state),
  ]);
  const villageWatchmen = state.residents.filter(resident =>
    resident.alive && resident.job === 'watchman' && !away.has(resident.id) &&
    !isStationedWatchman(state, resident)).length;
  delta -= villageWatchmen * t.perWatchman;
  delta -= Math.min(state.resources.defense / t.defenseFactor, t.maxDefenseThreatReduction);
  // 적대 세력들과의 관계가 나쁠수록 국경이 험악해진다
  const avgRel = hostileRelationsAvg(state);
  if (avgRel < CONFIG.relations.lowRelThreatBelow) {
    delta += (CONFIG.relations.lowRelThreatBelow - avgRel) * CONFIG.relations.lowRelThreatScale;
  }
  // 난이도·승격 단계: 위협이 오를 때만 배율 적용 (내릴 때는 그대로) — 부유해질수록 노려진다
  if (delta > 0) {
    const threatGain = state.worldSetup?.effective.threatGainMultiplier ??
      CONFIG.difficulty[state.difficulty ?? 'normal'].threatGain;
    delta *= threatGain * rankEffects(state.rank).threatGain;
  } else if (delta < 0) {
    delta *= borderCommanderEffects(state).threatDecayMultiplier;
  }
  state.threat = Math.max(0, Math.min(100, state.threat + delta));
  if (state.tradeRefusedDays > 0) state.tradeRefusedDays--;
  if (state.raidCooldown > 0) state.raidCooldown--;
}

function raidPower(state: GameState, rng: () => number): number {
  const r = CONFIG.raid;
  const wealth = edibleFoodTotal(state) + state.resources.hide + state.resources.tools * 2;
  // 연차 스케일은 상한을 둔다 — 승격 후 장기전에서 습격이 무한정 세지지 않게
  const scaledYears = Math.min(getYear(state.day), r.powerYearCap) - 1;
  const base =
    r.basePower + scaledYears * r.powerPerYear +
    rng() * r.powerRandom + wealth / r.wealthPowerDiv;
  const raidPowerMultiplier = state.worldSetup?.effective.raidPowerMultiplier ??
    CONFIG.difficulty[state.difficulty ?? 'normal'].raidPower;
  return Math.round(base * raidPowerMultiplier);
}

function pickFaction(state: GameState, rng: () => number): Faction | null {
  // 관계가 나쁜 세력일수록 습격에 나설 확률이 높다.
  // 위협도가 아주 높으면 평화 성향 씨족도 굶주림에 몰려 내려올 수 있다 (절반 가중).
  const cands: { f: Faction; w: number }[] = [];
  for (const f of FACTIONS) {
    if (f.raidEligible === false) continue;
    if (activeDiplomaticPact(state, f.name)) continue;
    const rel = getRelation(state, f.name);
    if (f.hostile) cands.push({ f, w: Math.max(5, 110 - rel) });
    else if (state.threat > 85) cands.push({ f, w: Math.max(2, (90 - rel) * 0.5) });
  }
  if (cands.length === 0) return null;
  let r = rng() * cands.reduce((s, c) => s + c.w, 0);
  for (const c of cands) {
    r -= c.w;
    if (r <= 0) return c.f;
  }
  return cands[cands.length - 1].f;
}

export function openExtortionDemand(
  state: GameState,
  rng: () => number,
  warned: boolean,
  power: number,
  factionName: string,
  warningSource?: RaidWarningSource,
): boolean {
  if (activeDiplomaticPact(state, factionName)) return false;
  const faction = FACTIONS.find(candidate => candidate.name === factionName);
  if (!faction?.extortionDemands?.length) return false;

  const demands = faction.extortionDemands.map(demand => ({
    resource: demand.resource,
    amount: demand.baseAmount + Math.ceil(power / CONFIG.extortion.powerAmountDiv),
  }));
  const affordable = demands.filter(demand => (state.resources[demand.resource] ?? 0) >= demand.amount);
  const pool = affordable.length > 0 ? affordable : demands;
  const demand = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  const resourceName = RESOURCE_NAMES[demand.resource];
  const leader = factionLeaderSubject(state, faction.name);
  const message =
    `${leader}의 무장 사절이 ${resourceName} ${withJosa(demand.amount, '을/를')} 내놓으라고 통보합니다. ` +
    '요구를 들어주면 이번에는 물러나지만, 거절하면 대기 중인 무리가 곧장 마을로 향합니다.';
  const negotiation: TradeNegotiation = {
    faction: faction.name,
    initiatedBy: 'faction',
    mode: 'extortion',
    phase: 'countered',
    give: demand.resource,
    giveAmt: demand.amount,
    get: null,
    getAmt: 0,
    round: 0,
    margin: 1,
    message,
  };
  state.pendingChoice = {
    kind: 'extortion',
    title: `칼끝의 거래 — ${leader}`,
    body: message,
    options: [],
    data: { faction: faction.name, power, warned, warningSource, negotiation },
  };
  addLog(state, `${leader}의 무장 사절이 공물을 요구하며 최후통첩을 전했습니다.`, 'raid', true);
  return true;
}

function buildingAt(state: GameState, buildingId: number): Building | undefined {
  return state.buildings.find(building => building.id === buildingId);
}

export function raiderCanUseBuilding(building: Building): boolean {
  return building.built && (
    building.type === 'bridge' ||
    building.type === 'ferry' ||
    building.type === 'dock' ||
    building.type === 'canal'
  );
}

// 습격자 통행 규칙: 산, 지표 광상, 강물, 건물 발자국은 막는다. 겨울 얼음강과 완공된 교통 건물만 예외다.
function raiderPassable(state: GameState, x: number, y: number): boolean {
  const t = state.map[y]?.[x];
  if (!t || t.terrain === 'mountain' || t.terrain === 'rock') return false;
  if (t.buildingId != null) {
    const building = buildingAt(state, t.buildingId);
    if (building && raiderCanUseBuilding(building)) return true;
    if (building?.breached === true && effectiveWallType(building)) return true;
    return false;
  }
  if (t.terrain === 'river') {
    return getSeason(state.day) === 'winter' && state.weather !== 'thawFlood';
  }
  if (t.terrain === 'lake') return isLakeIceAt(state.map, state.day, x, y);
  return true;
}

function centerApproachPlans(
  state: GameState,
  start: { x: number; y: number },
  center: Building,
  power: number,
  options: { allowBlockedStart?: boolean } = {},
): Array<{ plan: RaidRoutePlan; target: { x: number; y: number } }> {
  const footprint = footprintTilesOf(state, center) ?? [{ x: center.x, y: center.y }];
  const seen = new Set<string>();
  const candidates: Array<{ x: number; y: number }> = [];
  for (const tile of footprint) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = tile.x + dx;
        const y = tile.y + dy;
        const key = `${x},${y}`;
        if (seen.has(key) || footprint.some(part => part.x === x && part.y === y)) continue;
        seen.add(key);
        if (isRaidTileTraversable(state, x, y, true)) candidates.push({ x, y });
      }
    }
  }
  return candidates.flatMap(target => {
    const plan = planRaidRoute(state, start, target, power, options);
    return plan ? [{ plan, target }] : [];
  }).sort((a, b) => a.plan.totalCost - b.plan.totalCost);
}

function applyRaidPlan(
  state: GameState,
  band: RaiderBand,
  plan: RaidRoutePlan,
  target: { x: number; y: number },
): void {
  band.route = plan;
  band.path = [...plan.steps];
  band.routeTarget = target;
  band.routeRevision = state.defenseTopologyRevision;
  band.phase = 'approaching';
  delete band.breachTargetId;
}

function replanRaidBand(state: GameState, band: RaiderBand): boolean {
  if (!band.routeTarget) return false;
  const plan = planRaidRoute(state, { x: band.x, y: band.y }, band.routeTarget, band.power);
  if (!plan) return false;
  applyRaidPlan(state, band, plan, band.routeTarget);
  const center = state.buildings.find(building => building.type === 'center');
  band.siege = !!center && plan.kind === 'assault' &&
    isProtectedBoundaryBreach(state, center, plan.breaches[0]);
  return true;
}

function resumeRaidObjectiveAfterTower(state: GameState, band: RaiderBand): boolean {
  const returnTarget = band.towerReturnTarget;
  delete band.towerReturnTarget;
  if (returnTarget) {
    band.routeTarget = returnTarget;
    return replanRaidBand(state, band);
  }
  const center = state.buildings.find(building => building.type === 'center' && building.built);
  if (!center) return false;
  const planned = centerApproachPlans(state, { x: band.x, y: band.y }, center, band.power)[0];
  if (!planned) return false;
  applyRaidPlan(state, band, planned.plan, planned.target);
  band.siege = planned.plan.kind === 'assault' &&
    isProtectedBoundaryBreach(state, center, planned.plan.breaches[0]);
  return true;
}

function breachDamagePerTick(state: GameState, band: RaiderBand): number {
  const weatherMultiplier = CONFIG.raidPathing.breachWeatherMultiplier[state.weather];
  return Math.max(CONFIG.raidPathing.minimumBreachDamage,
    band.power * CONFIG.raidPathing.breachDamagePerPower) * weatherMultiplier;
}

function advanceRaidBreach(state: GameState, band: RaiderBand, building: Building): boolean {
  const starting = band.phase !== 'breaching' || band.breachTargetId !== building.id;
  band.phase = 'breaching';
  band.breachTargetId = building.id;
  building.structureIntegrityMax = wallIntegrityMax(building);
  building.structureIntegrity = wallIntegrity(building);
  if (starting) {
    addLog(state, `${withJosa(factionRaidPartyLabel(state, band.faction), '이/가')} ${BUILDING_DEFS[effectiveWallType(building)!].name} 구간을 부수기 시작했습니다.`, 'raid', true);
  }
  building.structureIntegrity = Math.max(0, building.structureIntegrity - breachDamagePerTick(state, band));
  if (building.structureIntegrity > 0) return false;
  building.breached = true;
  delete building.structureRepair;
  band.phase = 'approaching';
  delete band.breachTargetId;
  bumpDefenseTopology(state);
  state.resources.defense = computeDefense(state);
  addLog(state, `${BUILDING_DEFS[effectiveWallType(building)!].name} 구간이 돌파되어 잔해 통로가 열렸습니다.`, 'raid', true);
  return true;
}

// 습격 발생 판정: 성사되면 지도 가장자리에 습격 무리가 나타나 마을로 접근한다
export function checkRaidTrigger(state: GameState, rng: () => number): void {
  const t = CONFIG.threat;
  if (state.pendingChoice || state.raidHold || state.siegeState || state.raidCooldown > 0 || state.raiders || state.battle || state.tacticalBattle) return;
  if (state.threat < t.raidThreshold) return;
  let chance = (state.threat - t.raidThreshold) / t.raidChanceDiv;
  const season = getSeason(state.day);
  if (season === 'autumn' || season === 'winter') chance *= 1.5;
  if (rng() >= chance) return;

  const hasStructureWarning = countBuilt(state, 'beacon') > 0 || countBuilt(state, 'watchtower') > 0;
  const hasGyrfalcon = (state.specialItems?.gyrfalcon ?? 0) > 0;
  const warningChance = Math.min(0.95,
    (hasStructureWarning ? t.earlyWarnChance : 0) +
    (hasGyrfalcon ? CONFIG.specialEvents.gyrfalconWarningBonus : 0));
  let warned = warningChance > 0 && rng() < warningChance;
  const power = raidPower(state, rng);
  const faction = pickFaction(state, rng);
  if (!faction) return;
  const originSite = findRaidOriginSite(state, faction.name);
  if (!warned && originSite && (originSite.scoutedUntilDay ?? 0) >= state.day) {
    warned = rng() < CONFIG.foreignSites.banditScoutWarningBonus;
  }
  const informant = raidTipInformant(state, faction.name);
  const warningSource = informant ? 'diplomatic' : undefined;
  if (informant) {
    warned = true;
    announceRaidTip(state, informant, faction.name);
  }
  // 첫 습격 경보 — 초회 길잡이(모달). 대기열에 넣어 두면 습격 선택지를 덮지 않는다.
  openGuideOnce(state, 'battle');
  if (openExtortionDemand(state, rng, warned, power, faction.name, warningSource)) return;
  spawnRaiders(state, rng, warned, faction.name, power, warningSource);
}

// 지도 가장자리(주로 북쪽)에서 습격 무리를 스폰
export function spawnRaiders(
  state: GameState,
  rng: () => number,
  warned: boolean,
  factionName?: string,
  powerIn?: number,
  warningSource?: RaidWarningSource,
): void {
  if (factionName && activeDiplomaticPact(state, factionName)) return;
  const center = state.buildings.find(b => b.type === 'center');
  if (!center) return;
  const power = powerIn ?? raidPower(state, rng);
  const faction = FACTIONS.find(candidate => candidate.name === factionName) ?? pickFaction(state, rng);
  if (!faction) return;
  const h = state.map.length, w = state.map[0]?.length ?? 0;
  if (w <= 0 || h <= 0) return;

  let spawn: { x: number; y: number } | null = null;
  let path: { x: number; y: number }[] | null = null;
  let siege = false;
  let route: RaidRoutePlan | undefined;
  let routeTarget: { x: number; y: number } | undefined;
  let originUsed = false;
  const originSite = findRaidOriginSite(state, faction.name);
  if (originSite) {
    const originPassable = (x: number, y: number) =>
      raiderPassable(state, x, y) ||
      (state.map[y]?.[x]?.buildingId == null &&
        (state.map[y]?.[x]?.terrain === 'mountain' || state.map[y]?.[x]?.terrain === 'river' ||
          state.map[y]?.[x]?.terrain === 'lake'));
    const starts: Array<{ x: number; y: number; order: number }> = [];
    for (let y = originSite.y - 1; y <= originSite.y + originSite.height; y++) {
      for (let x = originSite.x - 1; x <= originSite.x + originSite.width; x++) {
        const perimeter = x === originSite.x - 1 || x === originSite.x + originSite.width ||
          y === originSite.y - 1 || y === originSite.y + originSite.height;
        if (perimeter && originPassable(x, y)) starts.push({ x, y, order: rng() });
      }
    }
    starts.sort((a, b) => a.order - b.order);
    for (const start of starts) {
      const planned = centerApproachPlans(state, start, center, power, { allowBlockedStart: true })[0];
      if (planned) {
        path = planned.plan.steps;
        route = planned.plan;
        routeTarget = planned.target;
        siege = planned.plan.kind === 'assault' &&
          isProtectedBoundaryBreach(state, center, planned.plan.breaches[0]);
        spawn = { x: start.x, y: start.y };
        originUsed = true;
        originSite.lastRaidDay = state.day;
        break;
      }
    }
  }
  for (let tryI = 0; tryI < 12 && !path; tryI++) {
    let sx: number, sy: number;
    if (tryI < 6) { sx = 2 + Math.floor(rng() * (w - 4)); sy = 0; }          // 북쪽 우선
    else if (rng() < 0.5) { sx = 0; sy = Math.floor(rng() * h * 0.5); }      // 서쪽 상단
    else { sx = w - 1; sy = Math.floor(rng() * h * 0.5); }                   // 동쪽 상단
    if (!raiderPassable(state, sx, sy)) continue;
    const planned = centerApproachPlans(state, { x: sx, y: sy }, center, power)[0];
    if (planned) {
      path = planned.plan.steps;
      route = planned.plan;
      routeTarget = planned.target;
      siege = planned.plan.kind === 'assault' &&
        isProtectedBoundaryBreach(state, center, planned.plan.breaches[0]);
      spawn = { x: sx, y: sy };
    }
  }
  if (!spawn || !path) {
    // 완전히 막힌 지도에서도 선택 모달은 습격대를 마을 외곽에 배치한 뒤 연다.
    const fallbackTiles = state.map.flat().filter(tile => {
      const distance = Math.abs(tile.x - center.x) + Math.abs(tile.y - center.y);
      return raiderPassable(state, tile.x, tile.y) &&
        distance >= 2 && distance <= CONFIG.raid.arriveDistance;
    });
    const fallback = fallbackTiles[Math.floor(rng() * fallbackTiles.length)];
    if (fallback) {
      state.raiders = {
        x: fallback.x, y: fallback.y, px: fallback.x, py: fallback.y, path: [],
        power,
        size: Math.min(6, 3 + Math.floor(power / 25)),
        faction: faction.name,
        warned,
        spotted: true,
        siege: true,
        speed: 0,
        trail: [],
      };
      if (!canStartLongSiege(state) || !openLongSiegeChoice(state)) {
        openRaidChoice(state, rng, warned, power, faction.name, true);
      }
    } else {
      openRaidChoice(state, rng, warned, power, faction.name);
    }
    return;
  }

  state.raiders = {
    x: spawn.x, y: spawn.y, px: spawn.x, py: spawn.y, path,
    power,
    size: Math.min(6, 3 + Math.floor(power / 25)),
    faction: faction.name,
    warned,
    spotted: warned,
    siege,
    phase: 'approaching',
    route,
    routeRevision: state.defenseTopologyRevision,
    routeTarget,
    speed: warned ? CONFIG.raid.raiderSpeedWarned : CONFIG.raid.raiderSpeedSurprise,
    trail: [],
  };
  if (warned && warningSource !== 'diplomatic') {
    addLog(state, `${originUsed && originSite?.scoutedUntilDay && originSite.scoutedUntilDay >= state.day ? '정찰해 둔 산길에서 움직임을 포착했습니다!' : '봉수와 망루에서 경보!'} ${withJosa(factionRaidPartyLabel(state, faction.name), '이/가')} 접근하고 있습니다. 들이닥치기 전에 대비하십시오.`, 'raid');
  }
}

// 서브틱마다 습격 무리를 이동시키고, 마을에 닿으면 위기 선택지를 연다
export function raidersTick(state: GameState, rng: () => number): void {
  const band = state.raiders;
  if (!band || state.pendingChoice || state.gameOver) return;
  // 보간 기준점을 매 틱 현재 위치로 맞춘다 — 전투로 묶여 있어도 갱신해야
  // 렌더러가 직전 타일에서 미끄러져 들어오는 이동을 반복 재생하지 않는다
  band.px = band.x;
  band.py = band.y;
  if (state.raidHold) return;
  if (state.battle) return; // 전투 중엔 무리가 전선에 묶인다
  if (band.towerTargetId != null) {
    const tower = state.buildings.find(building =>
      building.id === band.towerTargetId && building.type === 'watchtower' && building.built);
    if (!tower || tower.repairing || (tower.structureIntegrity ?? 1) <= 0) {
      delete band.towerTargetId;
      resumeRaidObjectiveAfterTower(state, band);
    } else {
      const adjacent = Math.abs(band.x - tower.x) <= 1 && Math.abs(band.y - tower.y) <= 1;
      if (adjacent && band.path.length === 0) {
        if (watchtowerAssaultDamage(state, band, tower)) {
          delete band.towerTargetId;
          resumeRaidObjectiveAfterTower(state, band);
        }
        return;
      }
    }
  }
  if (band.route && band.routeRevision !== state.defenseTopologyRevision) {
    replanRaidBand(state, band);
  }
  const now = state.day * SUBTICKS + state.subTick;
  const effectiveSpeed = now < (band.suppressedUntilTick ?? 0)
    ? band.speed * CONFIG.watchtower.suppressionSpeedMultiplier
    : band.speed;
  let steps = Math.floor(effectiveSpeed) + (rng() < effectiveSpeed % 1 ? 1 : 0);
  while (steps-- > 0 && band.path.length > 0) {
    const next = band.path[0];
    const nextBuildingId = state.map[next.y]?.[next.x]?.buildingId;
    const nextBuilding = nextBuildingId == null ? undefined : buildingAt(state, nextBuildingId);
    if (nextBuilding && isBlockingDefenseWall(nextBuilding)) {
      if (band.route?.kind !== 'assault') {
        if (!replanRaidBand(state, band)) {
          openRaidChoice(state, rng, band.warned, band.power, band.faction, band.siege);
          return;
        }
        continue;
      }
      if (band.siege) {
        addLog(state, `${withJosa(factionRaidPartyLabel(state, band.faction), '이/가')} 방책 앞에서 멈춰 섰습니다. 보호된 중심지로 통하는 길이 막혔습니다.`, 'raid');
        if (!openLongSiegeChoice(state)) openRaidChoice(state, rng, band.warned, band.power, band.faction, true);
        return;
      }
      advanceRaidBreach(state, band, nextBuilding);
      return;
    }
    if (!isRaidTileTraversable(state, next.x, next.y, band.route?.kind === 'assault')) {
      if (!replanRaidBand(state, band)) {
        openRaidChoice(state, rng, band.warned, band.power, band.faction, band.siege);
        return;
      }
      continue;
    }
    band.path.shift();
    // 지나온 자취를 남긴다 (겨울 눈밭 발자국)
    if (!band.trail) band.trail = [];
    band.trail.push({ x: band.x, y: band.y });
    if (band.trail.length > 26) band.trail.shift();
    band.x = next.x;
    band.y = next.y;
  }
  if (band.towerTargetId != null) {
    const tower = state.buildings.find(building => building.id === band.towerTargetId && building.type === 'watchtower');
    if (tower && Math.abs(band.x - tower.x) <= 1 && Math.abs(band.y - tower.y) <= 1 && band.path.length === 0) {
      if (watchtowerAssaultDamage(state, band, tower)) {
        delete band.towerTargetId;
        resumeRaidObjectiveAfterTower(state, band);
      }
      return;
    }
  }
  const center = state.buildings.find(b => b.type === 'center');
  const dist = center ? Math.abs(band.x - center.x) + Math.abs(band.y - center.y) : 0;
  if (!band.spotted && dist <= CONFIG.raid.spotDistance) {
    band.spotted = true;
    addLog(state, `경계병이 접근하는 무장 무리를 발견했습니다! ${withJosa(factionRaidPartyLabel(state, band.faction), '으로/로')} 보입니다.`, 'raid');
  }
  const remainingBlockingBreach = band.route?.breaches.some(breach => {
    const building = buildingAt(state, breach.buildingId);
    return !!building && isBlockingDefenseWall(building);
  }) ?? false;
  if (band.path.length === 0 || (dist <= CONFIG.raid.arriveDistance && !remainingBlockingBreach)) {
    if (band.siege) {
      addLog(state, `${withJosa(factionRaidPartyLabel(state, band.faction), '이/가')} 방책 앞에서 멈춰 섰습니다. 목책과 토성이 그들을 가로막고 있습니다.`, 'raid');
    }
    if (!band.siege || !openLongSiegeChoice(state)) {
      openRaidChoice(state, rng, band.warned, band.power, band.faction, band.siege);
    }
  }
}

// 무리 없는 폴백 습격의 즉시 전투 판정 (요격/징집 공용) — 승패 확률만 다르고 결과 처리는 같다
function resolveFightFallback(
  state: GameState, rng: () => number, faction: string, successP: number, side: string, mode: BattleMode,
): void {
  const away = new Set([...(state.expedition?.memberIds ?? []), ...(state.warDispatch?.memberIds ?? [])]);
  const defenderIds = state.residents
    .filter(resident => resident.alive && !away.has(resident.id) && !resident.sick && resident.health >= 20 &&
      (mode === 'levy' || resident.job === 'militia' || resident.job === 'watchman'))
    .map(resident => resident.id);
  if (rng() < successP) {
    const injuryAttempts = mode === 'levy' ? 2 : 1;
    let injured = 0;
    for (let i = 0; i < injuryAttempts; i++) {
      if (defenderIds.length > 0 && rng() < CONFIG.raid.victoryInjuryChance[mode]) {
        injured += injure(state, rng, 1, mode === 'levy' ? 24 : 18, defenderIds);
      }
    }
    const damaged = mode === 'levy'
      ? damageBuildings(state, rng, CONFIG.raid.buildingDamage.villageVictory)
      : [];
    state.resources.reputation = Math.min(100, state.resources.reputation + 5);
    moraleShock(state, -8); // 사기 상승
    changeRelation(state, faction, CONFIG.relations.militiaWin); // 물리치면 원한이 남는다
    const winText = mode === 'garrison'
      ? `${withJosa(side, '이/가')} ${withJosa(factionRaidPartyLabel(state, faction), '을/를')} 외곽에서 물리쳤습니다! 부상자 ${injured}명, 건물 피해는 없습니다.`
      : `${withJosa(side, '이/가')} ${withJosa(factionRaidPartyLabel(state, faction), '을/를')} 마을 안에서 물리쳤습니다! 부상자 ${injured}명, 건물 ${damaged.length}채가 파손되었습니다.`;
    addLog(state, winText, 'good', true);
    recordAnnals(state, 'raid', winText);
    state.lifetimeStats.raidsRepelled++;
    if (injured > 0 || damaged.length > 0) state.lifetimeStats.raidsSuffered++;
  } else {
    const killed = killResidents(
      state,
      rng,
      defenderIds.length,
      CONFIG.raid.defeatDeathRate[mode],
      defenderIds,
    );
    const injured = injure(state, rng, 2 + Math.floor(rng() * 3), 30, defenderIds);
    const lootMsg = loot(state, 0.2 + rng() * 0.1);
    const damageCount = mode === 'levy'
      ? CONFIG.raid.buildingDamage.villageDefeat
      : CONFIG.raid.buildingDamage.interceptDefeat;
    const damaged = damageBuildings(state, rng, damageCount);
    moraleShock(state, 15);
    changeRelation(state, faction, CONFIG.relations.militiaLoss);
    const lossText = `${withJosa(side, '이/가')} 밀려났습니다. 전사 ${killed}명, 부상 ${injured}명, ${lootMsg}. 건물 ${damaged.length}채가 파손되었습니다.`;
    addLog(state, lossText, 'raid');
    recordAnnals(state, 'raid', `${factionRaidPartyLabel(state, faction)}의 습격 — ${lossText}`);
    state.lifetimeStats.raidsSuffered++;
  }
}

export function resolveExtortion(state: GameState, optionId: string, rng: () => number): void {
  const choice = state.pendingChoice;
  if (!choice || choice.kind !== 'extortion') return;
  const negotiation = choice.data.negotiation as TradeNegotiation;
  const faction = choice.data.faction as string;
  const power = choice.data.power as number;
  const warned = Boolean(choice.data.warned);
  const warningSource = choice.data.warningSource === 'diplomatic' ? 'diplomatic' : undefined;
  if (!negotiation.give || negotiation.giveAmt <= 0) return;

  if (optionId === 'pay') {
    const stock = state.resources[negotiation.give] ?? 0;
    if (stock < negotiation.giveAmt) {
      negotiation.message = `${withJosa(RESOURCE_NAMES[negotiation.give], '이/가')} 부족합니다. 요구를 거절하고 침입에 대비해야 합니다.`;
      choice.body = negotiation.message;
      return;
    }
    state.resources[negotiation.give] -= negotiation.giveAmt;
    state.resources.reputation = Math.max(0, state.resources.reputation - CONFIG.extortion.payReputationLoss);
    state.threat = Math.max(0, state.threat - CONFIG.extortion.payThreatReduction);
    state.raidCooldown = CONFIG.threat.raidCooldownDays;
    state.raiders = null;
    moraleShock(state, CONFIG.extortion.payMoraleLoss);
    changeRelation(state, faction, CONFIG.relations.tribute);
    addLog(
      state,
      `${factionLeaderSubject(state, faction)}에게 ${RESOURCE_NAMES[negotiation.give]} ${withJosa(negotiation.giveAmt, '을/를')} 넘겼습니다. 무리는 약속대로 길을 돌렸습니다.`,
      'trade',
      true,
    );
    state.pendingChoice = null;
    return;
  }

  if (optionId === 'refuse') {
    state.pendingChoice = null;
    changeRelation(state, faction, CONFIG.relations.negotiateFail);
    addLog(state, `${factionLeaderSubject(state, faction)}의 요구를 거부했습니다. 무장한 무리가 마을을 향해 움직이기 시작합니다!`, 'raid', true);
    spawnRaiders(state, rng, warned, faction, power, warningSource);
  }
}

const EXPEDITION_RAID_HOLD_TICKS = SUBTICKS;

interface RaidChoiceContext {
  expeditionOrder?: ExpeditionRaidOrder;
  forcedDefense?: boolean;
  fortifiedWait?: boolean;
  suppressStartLog?: boolean;
}

function villageResidentIds(state: GameState): number[] {
  const away = new Set([
    ...(state.expedition?.memberIds ?? []),
    ...(state.warDispatch?.memberIds ?? []),
    ...activePredatorScoutIds(state),
  ]);
  return state.residents.filter(resident => resident.alive && !away.has(resident.id)).map(resident => resident.id);
}

function openExpeditionRaidOrderChoice(
  state: GameState,
  power: number,
  faction: string,
  warned: boolean,
  siege: boolean,
): void {
  const eta = estimateExpeditionReturnTicks(state);
  const currentDefense = computeDefense(state);
  const joinedDefense = computeDefense(state, { includeExpedition: true });
  state.pendingChoice = {
    kind: 'expeditionRaidOrder',
    title: `원정 중 습격 — ${factionRaidPartyLabel(state, faction)}`,
    illustration: {
      src: '/assets/events/raid-charge-v2.png',
      alt: '원정대가 자리를 비운 사이 마을로 접근하는 무장 세력',
    },
    body:
      `${withJosa(factionRaidPartyLabel(state, faction), '이/가')} 마을 외곽에 도달했습니다. 먼저 토벌대에 내릴 명령을 정해야 합니다.` +
      `\n현재 잔류 방어도 ${currentDefense} / 원정대 합류 시 ${joinedDefense}` +
      `\n예상 귀환 ${eta == null ? '불명' : `${eta}틱`} / 적 공격 유예 ${EXPEDITION_RAID_HOLD_TICKS}틱`,
    options: [
      {
        id: 'return',
        label: '즉시 회군을 명한다',
        desc: '현재 원정을 중단하고 마을로 돌아옵니다. 도착 전까지는 방어전에 참가하지 못합니다.',
      },
      {
        id: 'continue',
        label: '원정을 계속한다',
        desc: '기존 목표와 일정을 유지합니다. 마을은 남은 인원과 무기로 대응해야 합니다.',
      },
    ],
    data: { power, faction, warned, siege },
  };
  addLog(state, `${factionRaidPartyLabel(state, faction)}의 습격이 시작되었습니다. 원정대에 보낼 명령을 정해야 합니다!`, 'raid', true);
}

export function resolveExpeditionRaidOrder(state: GameState, optionId: string): void {
  const choice = state.pendingChoice;
  if (!choice || choice.kind !== 'expeditionRaidOrder') return;
  let order: ExpeditionRaidOrder = optionId === 'return' ? 'return' : 'continue';
  if (order === 'return') {
    const error = orderExpeditionReturn(state);
    if (error) {
      addLog(state, `${error} 원정대는 기존 명령을 계속 수행합니다.`, 'bad', true);
      order = 'continue';
    }
  }
  const power = Number(choice.data.power ?? 0);
  const faction = String(choice.data.faction ?? '무장 세력');
  const warned = Boolean(choice.data.warned);
  const siege = Boolean(choice.data.siege);
  state.pendingChoice = null;
  openRaidChoice(state, () => 0.5, warned, power, faction, siege, {
    expeditionOrder: order,
    suppressStartLog: true,
  });
}

// 습격 선택지 모달 생성
export function openRaidChoice(
  state: GameState, rng: () => number, warned: boolean,
  powerIn?: number, factionName?: string, siege = false, context: RaidChoiceContext = {},
): void {
  const faction = FACTIONS.find(f => f.name === factionName) ?? pickFaction(state, rng);
  if (!faction) return;
  const power = powerIn ?? raidPower(state, rng);
  if (state.expedition && !context.expeditionOrder && state.expedition.phase !== 'return') {
    openExpeditionRaidOrderChoice(state, power, faction.name, warned, siege);
    return;
  }
  const expeditionOrder = context.expeditionOrder ?? (state.expedition ? 'return' : undefined);
  const hasBeacon = countBuilt(state, 'beacon') > 0;
  const hasMarket = countBuilt(state, 'market') > 0;
  const tributeCost = { food: 20, hide: 8, tools: 2 };
  const canTribute = edibleFoodTotal(state) >= tributeCost.food;

  const choice: PendingChoice = {
    kind: 'raid',
    title: `습격 임박! — ${factionRaidPartyLabel(state, faction.name)}`,
    illustration: {
      src: '/assets/events/raid-charge-v2.png',
      alt: '무기를 들고 말을 몰아 마을로 돌진하는 마적들',
    },
    body:
      `${withJosa(factionRaidPartyLabel(state, faction.name), '이/가')} 마을 외곽에 도달했습니다. 지금 대응을 정해야 합니다.` +
      (warned ? ' 경보 덕분에 미리 대비할 시간이 있었습니다.' : ' 아무런 경보도 없이 들이닥쳤습니다!') +
      (siege ? '\n방책이 무리를 가로막고 있어 방어에 유리합니다.' : '') +
      (getRelation(state, faction.name) >= 60 ? '\n낯익은 얼굴들입니다. 말이 통할지도 모릅니다.'
        : getRelation(state, faction.name) <= 35 ? '\n그들의 눈빛에 해묵은 원한이 서려 있습니다.' : '') +
      `\n추정 규모: ${power < 30 ? '소규모' : power < 50 ? '중간 규모' : '대규모'} / 현재 방어도: ${computeDefense(state)}` +
      (expeditionOrder
        ? `\n원정대 명령: ${expeditionOrder === 'return' ? '즉시 회군' : '원정 계속'} / 귀환 예상: ${estimateExpeditionReturnTicks(state) ?? '불명'}틱`
        : '') +
      (context.fortifiedWait ? '\n마을은 완전 수성 태세이며 방책 방어 보너스를 받습니다.' : ''),
    options: [
      {
        id: 'shelter', label: '목책 안으로 피난한다',
        desc: '전투를 피하지만 적이 마을에 들어와 자원을 약탈하고 건물을 파손합니다.',
      },
      {
        id: 'militia', label: '수비병으로 요격한다',
        desc: '수비병과 파수꾼이 마을 밖에서 맞섭니다. 승리하면 건물 피해가 없지만 패배하면 적이 마을까지 밀고 들어옵니다.',
      },
      {
        id: 'levy', label: '민병을 징집한다',
        desc: '성한 주민 모두가 마을 안에서 방어전을 벌입니다. 방어도는 오르지만 승리해도 부상과 건물 파손이 생깁니다.',
      },
      {
        id: 'manual-garrison', label: '직접 지휘한다 — 수비병 요격',
        desc: '전투 두루마리에서 수비병·파수꾼·사냥꾼을 배치하고 교전별 전략을 선택합니다.',
      },
      {
        id: 'manual-levy', label: '직접 지휘한다 — 민병 방어',
        desc: '성한 주민을 소집해 마을 안에서 방어전을 지휘합니다. 병력을 보존하거나 물자를 지킬 방향을 정할 수 있습니다.',
      },
      {
        id: 'tribute', label: '공물을 내어보낸다',
        desc: `식량 ${tributeCost.food}, 가죽 ${tributeCost.hide}, 도구 ${withJosa(tributeCost.tools, '을/를')} 내주고 싸움을 피합니다.`,
        disabled: !canTribute,
        disabledReason: '내어줄 식량이 부족합니다',
      },
      {
        id: 'negotiate', label: '장터를 통해 협상한다',
        desc: '명성이 높으면 교역으로 돌릴 수 있습니다. 실패하면 피해가 커집니다.',
        disabled: !hasMarket,
        disabledReason: '장터가 필요합니다',
      },
      {
        id: 'beacon', label: '봉수대 경보를 올린다',
        desc: '인근 진보의 지원 신호를 올려 적을 물러나게 합니다. 다음 습격까지 위협도가 크게 줄어듭니다.',
        disabled: !hasBeacon,
        disabledReason: '봉수대가 필요합니다',
      },
    ],
    data: {
      power,
      faction: faction.name,
      warned,
      siege: siege || Boolean(context.fortifiedWait),
      expeditionOrder,
      fortifiedWait: Boolean(context.fortifiedWait),
    },
  };
  if (context.forcedDefense) {
    choice.title = `수성 교전 임박! — ${factionRaidPartyLabel(state, faction.name)}`;
    choice.options = choice.options.filter(option => option.id === 'levy' || option.id === 'manual-levy');
  } else if (expeditionOrder) {
    choice.options.splice(1, 0, {
      id: 'fortify-wait',
      label: '완전 수성으로 굳히고 기다린다',
      desc: `일반 작업을 멈추고 ${EXPEDITION_RAID_HOLD_TICKS}틱 동안 방책 안에서 원정대를 기다립니다. 먼저 닥치는 쪽에 따라 참전 인원이 결정됩니다.`,
    });
  }
  state.pendingChoice = choice;
  if (!context.suppressStartLog) addLog(state, `${factionRaidPartyLabel(state, faction.name)}의 습격이 시작되었습니다!`, 'raid');
}

export function raidHoldTick(state: GameState, rng: () => number): void {
  const hold = state.raidHold;
  if (!hold || state.pendingChoice || state.battle || state.tacticalBattle || state.gameOver) return;
  hold.ticksRemaining = Math.max(0, hold.ticksRemaining - 1);
  const expeditionArrived = state.expedition == null;
  if (!expeditionArrived && hold.ticksRemaining > 0) return;

  state.raidHold = null;
  if (state.raiders) state.raiders.siege = true;
  state.resources.defense = computeDefense(state);
  addLog(
    state,
    expeditionArrived
      ? '회군한 원정대가 방책 안의 잔류군과 합류했습니다. 적의 총공세가 시작됩니다!'
      : '원정대가 돌아오기 전에 적의 공격 시한이 끝났습니다. 잔류군만으로 총공세를 막아야 합니다!',
    'raid',
    true,
  );
  openRaidChoice(state, rng, hold.warned, hold.power, hold.faction, true, {
    expeditionOrder: hold.expeditionOrder,
    forcedDefense: true,
    fortifiedWait: true,
    suppressStartLog: true,
  });
}

// 선택지 결과 판정
export function resolveRaid(state: GameState, optionId: string, rng: () => number): void {
  const c = state.pendingChoice;
  if (!c || c.kind !== 'raid') return;
  if (resolveSiegeChoice(state, optionId)) return;
  const power = c.data.power as number;
  const faction = c.data.faction as string;
  const warned = c.data.warned as boolean;
  const expeditionOrder = c.data.expeditionOrder as ExpeditionRaidOrder | undefined;

  // 경보/공성/궂은 날씨 보정 — 지도 전투와 같은 배율 (눈보라·혹한은 침입자에게 더 가혹하다)
  const battleMods = { warned, siege: Boolean(c.data.siege) };

  switch (optionId) {
    case 'fortify-wait': {
      if (!expeditionOrder) return;
      state.raidHold = {
        power,
        faction,
        warned,
        siege: true,
        expeditionOrder,
        ticksRemaining: EXPEDITION_RAID_HOLD_TICKS,
      };
      if (state.raiders) {
        state.raiders.siege = true;
        state.raiders.speed = 0;
        state.raiders.path = [];
      }
      state.pendingChoice = null;
      addLog(
        state,
        `마을이 모든 문을 걸어 잠그고 완전 수성에 들어갔습니다. ${EXPEDITION_RAID_HOLD_TICKS}틱 안에 원정대가 돌아오지 못하면 잔류군만으로 맞섭니다.`,
        'raid',
        true,
      );
      return;
    }
    case 'shelter': {
      const lootMsg = loot(state, 0.22 + rng() * 0.1);
      const injured = rng() < 0.25 ? injure(state, rng, 1, 15, villageResidentIds(state)) : 0;
      const damaged = damageBuildings(state, rng, CONFIG.raid.buildingDamage.shelter);
      moraleShock(state, 8);
      changeRelation(state, faction, CONFIG.relations.shelter);
      addLog(state, `주민들이 피신한 사이 적이 마을을 휩쓸었습니다. ${lootMsg}. 건물 ${damaged.length}채 파손.${injured > 0 ? ` 미처 피하지 못한 ${injured}명이 다쳤습니다.` : ''}`, 'raid');
      break;
    }
    // 요격/징집: 지도에 무리가 있으면 실제 전투를 연다 (승패·후처리는 battleTick이 맡는다).
    // 무리 없이 열린 폴백 습격(접근 경로 없음)만 즉시 판정으로 처리한다.
    case 'militia': {
      if (startBattle(state, 'garrison')) return;
      const fightDefense = applyBattleDefenseMultipliers(
        state.resources.defense * cannonBattleMult(state), battleMods, state.weather);
      consumeBattlePowder(state);
      resolveFightFallback(state, rng, faction, fightDefense / (fightDefense + power), '수비병', 'garrison');
      break;
    }
    case 'levy': {
      if (startBattle(state, 'levy')) return;
      const levyDefense = applyBattleDefenseMultipliers(
        (state.resources.defense + levyDefenseBonus(state)) * cannonBattleMult(state),
        battleMods, state.weather);
      consumeBattlePowder(state);
      resolveFightFallback(state, rng, faction, levyDefense / (levyDefense + power), '징집된 주민들', 'levy');
      break;
    }
    case 'manual-garrison': {
      createTacticalBattle(state, {
        factionName: faction,
        power,
        warned,
        siege: battleMods.siege,
        mode: 'garrison',
      });
      return;
    }
    case 'manual-levy': {
      createTacticalBattle(state, {
        factionName: faction,
        power,
        warned,
        siege: battleMods.siege,
        mode: 'levy',
      });
      return;
    }
    case 'tribute': {
      consumeEdibleFood(state, 20);
      state.resources.hide = Math.max(0, state.resources.hide - 8);
      state.resources.tools = Math.max(0, state.resources.tools - 2);
      state.resources.reputation = Math.max(0, state.resources.reputation - 2);
      state.threat = Math.max(0, state.threat - 25);
      moraleShock(state, 4);
      changeRelation(state, faction, CONFIG.relations.tribute);
      addLog(state, `${factionLeaderSubject(state, faction)}에게 공물을 내어보냈습니다. 싸움은 피했지만 그들과의 사이는 눅어졌습니다.`, 'raid');
      recordAnnals(state, 'raid', `${factionRaidPartyLabel(state, faction)}의 위협에 공물을 내어보내고 싸움을 피했습니다.`);
      state.lifetimeStats.raidsSuffered++;
      break;
    }
    case 'negotiate': {
      // 조정에서의 명성과 그 세력과의 관계가 함께 작용한다
      const negotiateP = (state.resources.reputation * 0.6 + getRelation(state, faction) * 0.4) / 100 + 0.1;
      if (rng() < negotiateP) {
        // 협상 성공: 소규모 교환으로 마무리
        const give = Math.min(10, edibleFoodTotal(state));
        consumeEdibleFood(state, give);
        state.resources.hide += 4;
        state.resources.reputation = Math.min(100, state.resources.reputation + 5);
        state.threat = Math.max(0, state.threat - 30);
        changeRelation(state, faction, CONFIG.relations.negotiateSuccess);
        addLog(state, `장터에서의 협상이 통했습니다. ${withJosa(factionRaidPartyLabel(state, faction), '이/가')} 식량 ${withJosa(give, '을/를')} 받고 가죽 4를 남기고 물러갑니다. 명성이 올랐습니다.`, 'good', true);
        recordAnnals(state, 'raid', `${factionRaidPartyLabel(state, faction)}의 습격을 장터의 협상으로 물렸습니다.`);
        state.lifetimeStats.raidsRepelled++;
      } else {
        if (expeditionOrder) {
          addLog(state, `협상이 결렬되었습니다. 격분한 ${withJosa(factionRaidPartyLabel(state, faction), '이/가')} 방책을 공격하기 시작합니다!`, 'raid', true);
          openRaidChoice(state, rng, warned, power, faction, true, {
            expeditionOrder,
            forcedDefense: true,
            fortifiedWait: true,
            suppressStartLog: true,
          });
          return;
        }
        const injured = injure(state, rng, 2, 25);
        const lootMsg = loot(state, 0.3 + rng() * 0.1);
        const damaged = damageBuildings(state, rng, CONFIG.raid.buildingDamage.shelter + 1);
        moraleShock(state, 12);
        changeRelation(state, faction, CONFIG.relations.negotiateFail);
        addLog(state, `협상이 결렬되었습니다. 격분한 ${withJosa(factionRaidPartyLabel(state, faction), '이/가')} 마을을 휩쓸었습니다. 부상자 ${injured}명, ${lootMsg}, 건물 ${damaged.length}채 파손.`, 'raid');
        recordAnnals(state, 'raid', `협상 결렬 — ${withJosa(factionRaidPartyLabel(state, faction), '이/가')} 마을을 휩쓸었습니다 (부상 ${injured}명, 건물 ${damaged.length}채 파손).`);
        state.lifetimeStats.raidsSuffered++;
      }
      break;
    }
    case 'beacon': {
      state.resources.firewood = Math.max(0, state.resources.firewood - 5);
      state.threat = Math.max(0, state.threat - 35);
      const lootMsg = loot(state, 0.1);
      changeRelation(state, faction, CONFIG.relations.beacon);
      addLog(state, `봉수대에 불길이 올랐습니다. 인근 진보의 응원 신호에 ${withJosa(factionRaidPartyLabel(state, faction), '이/가')} 서둘러 물러갑니다. ${lootMsg}.`, 'good', true);
      recordAnnals(state, 'raid', `봉수 신호로 ${factionRaidPartyLabel(state, faction)}의 습격을 물렸습니다.`);
      state.lifetimeStats.raidsRepelled++;
      state.lifetimeStats.raidsSuffered++; // 물러가며 소량을 약탈해 간다
      break;
    }
  }

  state.threat = Math.min(state.threat, CONFIG.threat.afterRaidThreat + 20);
  if (optionId !== 'tribute' && optionId !== 'beacon' && optionId !== 'negotiate') {
    state.threat = CONFIG.threat.afterRaidThreat;
  }
  state.raidCooldown = CONFIG.threat.raidCooldownDays;
  state.raiders = null; // 무리는 물러간다
  state.raidHold = null;
  state.pendingChoice = null;
}
