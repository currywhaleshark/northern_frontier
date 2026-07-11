// 습격 시스템 — 위협도 누적, 지도 위 습격 무리 접근, 위기 선택지와 결과 판정
import { CONFIG } from './config';
import { FACTIONS, RESOURCE_NAMES, type Faction } from './constants';
import { buildingFootprintTiles, countBuilt } from './buildings';
import { addLog } from './events';
import {
  applyBattleDefenseMultipliers, cannonBattleMult, consumeBattlePowder, levyDefenseBonus, startBattle,
} from './battles';
import { findPath } from './agents';
import { damageBuildings, injure, killResidents, loot, moraleShock } from './raidDamage';
import { rankEffects } from './promotion';
import { changeRelation, getRelation, hostileRelationsAvg } from './relations';
import { consumeEdibleFood, edibleFoodTotal } from './resources';
import { countJob } from './residents';
import { getSeason, getYear } from './seasons';
import type { BattleMode, Building, GameState, PendingChoice, TradeNegotiation } from './types';
import { isWallBuilding } from './walls';

// 위협도 일일 갱신
export function updateThreat(state: GameState): void {
  const t = CONFIG.threat;
  let delta = t.basePerDay;
  const season = getSeason(state.day);
  if (season === 'autumn' || season === 'winter') delta += t.coldSeasonExtra;
  if (edibleFoodTotal(state) + state.resources.hide > t.wealthThreshold) delta += t.wealthExtra;
  if (state.resources.reputation < 35) delta += t.lowRepExtra;
  if (state.tradeRefusedDays > 0) delta += t.tradeRefusedExtra;
  delta -= countJob(state, 'watchman') * t.perWatchman;
  delta -= Math.min(state.resources.defense / t.defenseFactor, t.maxDefenseThreatReduction);
  // 적대 세력들과의 관계가 나쁠수록 국경이 험악해진다
  const avgRel = hostileRelationsAvg(state);
  if (avgRel < CONFIG.relations.lowRelThreatBelow) {
    delta += (CONFIG.relations.lowRelThreatBelow - avgRel) * CONFIG.relations.lowRelThreatScale;
  }
  // 난이도·승격 단계: 위협이 오를 때만 배율 적용 (내릴 때는 그대로) — 부유해질수록 노려진다
  if (delta > 0) {
    delta *= CONFIG.difficulty[state.difficulty ?? 'normal'].threatGain * rankEffects(state.rank).threatGain;
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
  return Math.round(base * CONFIG.difficulty[state.difficulty ?? 'normal'].raidPower);
}

function pickFaction(state: GameState, rng: () => number): Faction {
  // 관계가 나쁜 세력일수록 습격에 나설 확률이 높다.
  // 위협도가 아주 높으면 평화 성향 씨족도 굶주림에 몰려 내려올 수 있다 (절반 가중).
  const cands: { f: Faction; w: number }[] = [];
  for (const f of FACTIONS) {
    if (f.raidEligible === false) continue;
    const rel = getRelation(state, f.name);
    if (f.hostile) cands.push({ f, w: Math.max(5, 110 - rel) });
    else if (state.threat > 85) cands.push({ f, w: Math.max(2, (90 - rel) * 0.5) });
  }
  let r = rng() * cands.reduce((s, c) => s + c.w, 0);
  for (const c of cands) {
    r -= c.w;
    if (r <= 0) return c.f;
  }
  return cands[cands.length - 1].f;
}

export function isExtortionFaction(factionName: string): boolean {
  return Boolean(FACTIONS.find(faction => faction.name === factionName)?.extortionDemands?.length);
}

export function openExtortionDemand(
  state: GameState,
  rng: () => number,
  warned: boolean,
  power: number,
  factionName: string,
): boolean {
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
  const message =
    `${faction.name}의 무장 사절이 ${resourceName} ${demand.amount}을(를) 내놓으라고 통보합니다. ` +
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
    title: `칼끝의 거래 — ${faction.name}`,
    body: message,
    options: [],
    data: { faction: faction.name, power, warned, negotiation },
  };
  addLog(state, `${faction.name}의 무장 사절이 공물을 요구하며 최후통첩을 전했습니다.`, 'raid', true);
  return true;
}

function buildingAt(state: GameState, buildingId: number): Building | undefined {
  return state.buildings.find(building => building.id === buildingId);
}

function raiderCanUseBuilding(building: Building): boolean {
  return building.built && (
    building.type === 'bridge' ||
    building.type === 'ferry' ||
    building.type === 'dock'
  );
}

// 습격자 통행 규칙: 산, 강물, 건물 발자국은 막는다. 겨울 얼음강과 완공된 교통 건물만 예외다.
function raiderPassable(state: GameState, x: number, y: number): boolean {
  const t = state.map[y]?.[x];
  if (!t || t.terrain === 'mountain') return false;
  if (t.buildingId != null) {
    const building = buildingAt(state, t.buildingId);
    if (building && raiderCanUseBuilding(building)) return true;
    return false;
  }
  if (t.terrain === 'river') {
    return getSeason(state.day) === 'winter' && state.weather !== 'thawFlood';
  }
  return true;
}

function raiderBuildingApproachGoal(state: GameState, building: Building): (tile: { x: number; y: number }) => boolean {
  const footprint = buildingFootprintTiles(state, building.type, building.x, building.y) ?? [];
  return tile =>
    raiderPassable(state, tile.x, tile.y) &&
    footprint.some(footprintTile =>
      Math.max(Math.abs(footprintTile.x - tile.x), Math.abs(footprintTile.y - tile.y)) === 1);
}

// 습격 발생 판정: 성사되면 지도 가장자리에 습격 무리가 나타나 마을로 접근한다
export function checkRaidTrigger(state: GameState, rng: () => number): void {
  const t = CONFIG.threat;
  if (state.pendingChoice || state.raidCooldown > 0 || state.raiders || state.battle) return;
  if (state.threat < t.raidThreshold) return;
  let chance = (state.threat - t.raidThreshold) / t.raidChanceDiv;
  const season = getSeason(state.day);
  if (season === 'autumn' || season === 'winter') chance *= 1.5;
  if (rng() >= chance) return;

  const hasWarning = countBuilt(state, 'beacon') > 0 || countBuilt(state, 'watchtower') > 0;
  const warned = hasWarning && rng() < t.earlyWarnChance;
  const power = raidPower(state, rng);
  const faction = pickFaction(state, rng);
  if (openExtortionDemand(state, rng, warned, power, faction.name)) return;
  spawnRaiders(state, rng, warned, faction.name, power);
}

// 지도 가장자리(주로 북쪽)에서 습격 무리를 스폰
export function spawnRaiders(
  state: GameState,
  rng: () => number,
  warned: boolean,
  factionName?: string,
  powerIn?: number,
): void {
  const center = state.buildings.find(b => b.type === 'center');
  if (!center) return;
  const power = powerIn ?? raidPower(state, rng);
  const faction = FACTIONS.find(candidate => candidate.name === factionName) ?? pickFaction(state, rng);
  const h = state.map.length, w = state.map[0]?.length ?? 0;
  if (w <= 0 || h <= 0) return;

  // 방책이 마을을 완전히 두르고 있으면 중심지까지의 길이 없다 → 방책 앞 공성
  const barrierTiles = new Set(
    state.buildings.filter(b => b.built && isWallBuilding(b.type)).map(b => b.y * w + b.x));
  const nearBarrier = (tx: number, ty: number) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
      .some(([dx, dy]) => barrierTiles.has((ty + dy) * w + (tx + dx)));

  let spawn: { x: number; y: number } | null = null;
  let path: { x: number; y: number }[] | null = null;
  let siege = false;
  for (let tryI = 0; tryI < 12 && !path; tryI++) {
    let sx: number, sy: number;
    if (tryI < 6) { sx = 2 + Math.floor(rng() * (w - 4)); sy = 0; }          // 북쪽 우선
    else if (rng() < 0.5) { sx = 0; sy = Math.floor(rng() * h * 0.5); }      // 서쪽 상단
    else { sx = w - 1; sy = Math.floor(rng() * h * 0.5); }                   // 동쪽 상단
    if (!raiderPassable(state, sx, sy)) continue;
    const pass = (x: number, y: number) => raiderPassable(state, x, y);
    // 1순위: 중심지까지 직접 (방책에 틈이 있으면 돌아 들어온다)
    path = findPath(state, sx, sy, raiderBuildingApproachGoal(state, center), pass);
    // 2순위: 길이 막혔으면 방책에 붙은 타일까지 가서 공성
    if (!path && barrierTiles.size > 0) {
      path = findPath(state, sx, sy, tile => nearBarrier(tile.x, tile.y), pass);
      siege = !!path;
    }
    if (path) spawn = { x: sx, y: sy };
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
      openRaidChoice(state, rng, warned, power, faction.name, true);
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
    speed: warned ? CONFIG.raid.raiderSpeedWarned : CONFIG.raid.raiderSpeedSurprise,
    trail: [],
  };
  if (warned) {
    addLog(state, `봉수와 망루에서 경보! ${faction.name}이(가) 북쪽에서 접근하고 있습니다. 들이닥치기 전에 대비하십시오.`, 'raid');
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
  if (state.battle) return; // 전투 중엔 무리가 전선에 묶인다
  let steps = Math.floor(band.speed) + (rng() < band.speed % 1 ? 1 : 0);
  while (steps-- > 0 && band.path.length > 0) {
    const next = band.path.shift()!;
    // 지나온 자취를 남긴다 (겨울 눈밭 발자국)
    if (!band.trail) band.trail = [];
    band.trail.push({ x: band.x, y: band.y });
    if (band.trail.length > 26) band.trail.shift();
    band.x = next.x;
    band.y = next.y;
  }
  const center = state.buildings.find(b => b.type === 'center');
  const dist = center ? Math.abs(band.x - center.x) + Math.abs(band.y - center.y) : 0;
  if (!band.spotted && dist <= CONFIG.raid.spotDistance) {
    band.spotted = true;
    addLog(state, `경계병이 접근하는 무장 무리를 발견했습니다! ${band.faction}(으)로 보입니다.`, 'raid');
  }
  if (band.path.length === 0 || dist <= CONFIG.raid.arriveDistance) {
    if (band.siege) {
      addLog(state, `${band.faction}이(가) 방책 앞에서 멈춰 섰습니다. 목책과 토성이 그들을 가로막고 있습니다.`, 'raid');
    }
    openRaidChoice(state, rng, band.warned, band.power, band.faction, band.siege);
  }
}

// 무리 없는 폴백 습격의 즉시 전투 판정 (요격/징집 공용) — 승패 확률만 다르고 결과 처리는 같다
function resolveFightFallback(
  state: GameState, rng: () => number, faction: string, successP: number, side: string, mode: BattleMode,
): void {
  const defenderIds = state.residents
    .filter(resident => resident.alive && !resident.sick && resident.health >= 20 &&
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
    addLog(state, mode === 'garrison'
      ? `${side}이(가) ${faction}을(를) 외곽에서 물리쳤습니다! 부상자 ${injured}명, 건물 피해는 없습니다.`
      : `${side}이(가) ${faction}을(를) 마을 안에서 물리쳤습니다! 부상자 ${injured}명, 건물 ${damaged.length}채가 파손되었습니다.`, 'good', true);
  } else {
    const killed = killResidents(
      state,
      rng,
      defenderIds.length,
      CONFIG.raid.defeatDeathRate[mode],
      defenderIds,
    );
    const injured = injure(state, rng, 2 + Math.floor(rng() * 3), 30);
    const lootMsg = loot(state, 0.2 + rng() * 0.1);
    const damageCount = mode === 'levy'
      ? CONFIG.raid.buildingDamage.villageDefeat
      : CONFIG.raid.buildingDamage.interceptDefeat;
    const damaged = damageBuildings(state, rng, damageCount);
    moraleShock(state, 15);
    changeRelation(state, faction, CONFIG.relations.militiaLoss);
    addLog(state, `${side}이(가) 밀려났습니다. 전사 ${killed}명, 부상 ${injured}명, ${lootMsg}. 건물 ${damaged.length}채가 파손되었습니다.`, 'raid');
  }
}

export function resolveExtortion(state: GameState, optionId: string, rng: () => number): void {
  const choice = state.pendingChoice;
  if (!choice || choice.kind !== 'extortion') return;
  const negotiation = choice.data.negotiation as TradeNegotiation;
  const faction = choice.data.faction as string;
  const power = choice.data.power as number;
  const warned = Boolean(choice.data.warned);
  if (!negotiation.give || negotiation.giveAmt <= 0) return;

  if (optionId === 'pay') {
    const stock = state.resources[negotiation.give] ?? 0;
    if (stock < negotiation.giveAmt) {
      negotiation.message = `${RESOURCE_NAMES[negotiation.give]}이(가) 부족합니다. 요구를 거절하고 침입에 대비해야 합니다.`;
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
      `${faction}에게 ${RESOURCE_NAMES[negotiation.give]} ${negotiation.giveAmt}을(를) 넘겼습니다. 무리는 약속대로 길을 돌렸습니다.`,
      'trade',
      true,
    );
    state.pendingChoice = null;
    return;
  }

  if (optionId === 'refuse') {
    state.pendingChoice = null;
    changeRelation(state, faction, CONFIG.relations.negotiateFail);
    addLog(state, `${faction}의 요구를 거부했습니다. 무장한 무리가 마을을 향해 움직이기 시작합니다!`, 'raid', true);
    spawnRaiders(state, rng, warned, faction, power);
  }
}

// 습격 선택지 모달 생성
export function openRaidChoice(
  state: GameState, rng: () => number, warned: boolean,
  powerIn?: number, factionName?: string, siege = false,
): void {
  const faction = FACTIONS.find(f => f.name === factionName) ?? pickFaction(state, rng);
  const power = powerIn ?? raidPower(state, rng);
  const hasBeacon = countBuilt(state, 'beacon') > 0;
  const hasMarket = countBuilt(state, 'market') > 0;
  const tributeCost = { food: 20, hide: 8, tools: 2 };
  const canTribute = edibleFoodTotal(state) >= tributeCost.food;

  const choice: PendingChoice = {
    kind: 'raid',
    title: `습격 임박! — ${faction.name}`,
    illustration: {
      src: '/assets/events/raid-charge-v2.png',
      alt: '무기를 들고 말을 몰아 마을로 돌진하는 마적들',
    },
    body:
      `${faction.name}이 마을 외곽에 도달했습니다. 지금 대응을 정해야 합니다.` +
      (warned ? ' 경보 덕분에 미리 대비할 시간이 있었습니다.' : ' 아무런 경보도 없이 들이닥쳤습니다!') +
      (siege ? '\n방책이 무리를 가로막고 있어 방어에 유리합니다.' : '') +
      (getRelation(state, faction.name) >= 60 ? '\n낯익은 얼굴들입니다. 말이 통할지도 모릅니다.'
        : getRelation(state, faction.name) <= 35 ? '\n그들의 눈빛에 해묵은 원한이 서려 있습니다.' : '') +
      `\n추정 규모: ${power < 30 ? '소규모' : power < 50 ? '중간 규모' : '대규모'} / 현재 방어도: ${state.resources.defense}`,
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
        id: 'tribute', label: '공물을 내어보낸다',
        desc: `식량 ${tributeCost.food}, 가죽 ${tributeCost.hide}, 도구 ${tributeCost.tools}을(를) 내주고 싸움을 피합니다.`,
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
    data: { power, faction: faction.name, warned, siege },
  };
  state.pendingChoice = choice;
  addLog(state, `${faction.name}의 습격이 시작되었습니다!`, 'raid');
}

// 선택지 결과 판정
export function resolveRaid(state: GameState, optionId: string, rng: () => number): void {
  const c = state.pendingChoice;
  if (!c || c.kind !== 'raid') return;
  const power = c.data.power as number;
  const faction = c.data.faction as string;
  const warned = c.data.warned as boolean;

  // 경보/공성/궂은 날씨 보정 — 지도 전투와 같은 배율 (눈보라·혹한은 침입자에게 더 가혹하다)
  const battleMods = { warned, siege: Boolean(c.data.siege) };

  switch (optionId) {
    case 'shelter': {
      const lootMsg = loot(state, 0.22 + rng() * 0.1);
      const injured = rng() < 0.25 ? injure(state, rng, 1, 15) : 0;
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
    case 'tribute': {
      consumeEdibleFood(state, 20);
      state.resources.hide = Math.max(0, state.resources.hide - 8);
      state.resources.tools = Math.max(0, state.resources.tools - 2);
      state.resources.reputation = Math.max(0, state.resources.reputation - 2);
      state.threat = Math.max(0, state.threat - 25);
      moraleShock(state, 4);
      changeRelation(state, faction, CONFIG.relations.tribute);
      addLog(state, `${faction}에게 공물을 내어보냈습니다. 싸움은 피했지만 그들과의 사이는 눅어졌습니다.`, 'raid');
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
        addLog(state, `장터에서의 협상이 통했습니다. ${faction}이(가) 식량 ${give}을(를) 받고 가죽 4를 남기고 물러갑니다. 명성이 올랐습니다.`, 'good', true);
      } else {
        const injured = injure(state, rng, 2, 25);
        const lootMsg = loot(state, 0.3 + rng() * 0.1);
        const damaged = damageBuildings(state, rng, CONFIG.raid.buildingDamage.shelter + 1);
        moraleShock(state, 12);
        changeRelation(state, faction, CONFIG.relations.negotiateFail);
        addLog(state, `협상이 결렬되었습니다. 격분한 ${faction}이(가) 마을을 휩쓸었습니다. 부상자 ${injured}명, ${lootMsg}, 건물 ${damaged.length}채 파손.`, 'raid');
      }
      break;
    }
    case 'beacon': {
      state.resources.firewood = Math.max(0, state.resources.firewood - 5);
      state.threat = Math.max(0, state.threat - 35);
      const lootMsg = loot(state, 0.1);
      changeRelation(state, faction, CONFIG.relations.beacon);
      addLog(state, `봉수대에 불길이 올랐습니다. 인근 진보의 응원 신호에 ${faction}이(가) 서둘러 물러갑니다. ${lootMsg}.`, 'good', true);
      break;
    }
  }

  state.threat = Math.min(state.threat, CONFIG.threat.afterRaidThreat + 20);
  if (optionId !== 'tribute' && optionId !== 'beacon' && optionId !== 'negotiate') {
    state.threat = CONFIG.threat.afterRaidThreat;
  }
  state.raidCooldown = CONFIG.threat.raidCooldownDays;
  state.raiders = null; // 무리는 물러간다
  state.pendingChoice = null;
}
