// 주민 생성과 일일 생존 판정
import { CONFIG } from './config';
import {
  FEMALE_GIVEN_NAMES,
  JOB_NAMES,
  MALE_GIVEN_NAMES,
  SURNAMES,
  SURNAME_WEIGHTS,
} from './constants';
import { BUILDING_DEFS } from './buildings';
import { addLog } from './events';
import { returnResidentCart } from './equipment';
import { getSeason } from './seasons';
import { warmthLossWeatherMult } from './weather';
import { releaseResidentMount } from './weapons';
import type { Building, GameState, Gender, JobId, Resident, Tile } from './types';

export function rollResidentGender(rng: () => number): Gender {
  return rng() < 0.5 ? 'female' : 'male';
}

function weightedSurnameIndex(rng: () => number): number {
  const total = SURNAME_WEIGHTS.reduce((sum, weight) => sum + weight, 0);
  let roll = rng() * total;
  for (let index = 0; index < SURNAME_WEIGHTS.length; index++) {
    roll -= SURNAME_WEIGHTS[index];
    if (roll < 0) return index;
  }
  return SURNAME_WEIGHTS.length - 1;
}

export function rollResidentName(state: GameState, rng: () => number, gender: Gender): string {
  const givenNames = gender === 'female' ? FEMALE_GIVEN_NAMES : MALE_GIVEN_NAMES;
  const surnameStart = weightedSurnameIndex(rng);
  const givenStart = Math.floor(rng() * givenNames.length);
  const usedNames = new Set(state.residents.map(resident => resident.name));

  // 뽑힌 조합부터 순회해 같은 마을 안에서는 가능한 한 동명이인을 피한다.
  for (let offset = 0; offset < SURNAMES.length * givenNames.length; offset++) {
    const surnameOffset = Math.floor(offset / givenNames.length);
    const givenOffset = offset % givenNames.length;
    const surname = SURNAMES[(surnameStart + surnameOffset) % SURNAMES.length];
    const given = givenNames[(givenStart + givenOffset) % givenNames.length];
    const name = surname + given;
    if (!usedNames.has(name)) return name;
  }

  return SURNAMES[surnameStart] + givenNames[givenStart];
}

function isResidentSpawnTile(tile: Tile): boolean {
  return tile.buildingId == null && tile.terrain !== 'mountain' && tile.terrain !== 'river';
}

function hasSpawnExit(state: GameState, start: Tile, cx: number, cy: number): boolean {
  const queue: { tile: Tile; steps: number }[] = [{ tile: start, steps: 0 }];
  const seen = new Set<string>([`${start.x},${start.y}`]);
  for (let index = 0; index < queue.length; index++) {
    const { tile, steps } = queue[index];
    if (steps >= 4 && Math.abs(tile.x - cx) + Math.abs(tile.y - cy) >= 10) return true;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (dx !== 0 && dy !== 0) {
          const horizontal = state.map[tile.y]?.[tile.x + dx];
          const vertical = state.map[tile.y + dy]?.[tile.x];
          if (!horizontal || !vertical || !isResidentSpawnTile(horizontal) || !isResidentSpawnTile(vertical)) continue;
        }
        const next = state.map[tile.y + dy]?.[tile.x + dx];
        const key = next ? `${next.x},${next.y}` : '';
        if (!next || seen.has(key) || !isResidentSpawnTile(next)) continue;
        seen.add(key);
        queue.push({ tile: next, steps: steps + 1 });
      }
    }
  }
  return false;
}

function centerLandTiles(state: GameState, cx: number, cy: number): Set<string> {
  const reachable = new Set<string>([`${cx},${cy}`]);
  const queue = [{ x: cx, y: cy }];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = state.map[current.y + dy]?.[current.x + dx];
      if (!next || next.terrain === 'river' || next.terrain === 'mountain') continue;
      const key = `${next.x},${next.y}`;
      if (reachable.has(key)) continue;
      reachable.add(key);
      queue.push({ x: next.x, y: next.y });
    }
  }
  return reachable;
}

function residentSpawnPoint(
  state: GameState,
  rng: () => number,
  cx: number,
  cy: number,
): { x: number; y: number } {
  const centerLand = centerLandTiles(state, cx, cy);
  for (let radius = 1; radius <= 6; radius++) {
    const candidates: Tile[] = [];
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== radius) continue;
        const tile = state.map[y]?.[x];
        if (tile && centerLand.has(`${tile.x},${tile.y}`) &&
            isResidentSpawnTile(tile) && hasSpawnExit(state, tile, cx, cy)) candidates.push(tile);
      }
    }
    if (candidates.length > 0) {
      const tile = candidates[Math.floor(rng() * candidates.length)];
      return { x: tile.x, y: tile.y };
    }
  }
  const connectedFallback = state.map.flat().find(tile =>
    centerLand.has(`${tile.x},${tile.y}`) && isResidentSpawnTile(tile) && hasSpawnExit(state, tile, cx, cy));
  if (connectedFallback) return { x: connectedFallback.x, y: connectedFallback.y };
  const fallback = state.map[cy]?.[cx];
  if (fallback && isResidentSpawnTile(fallback)) return { x: cx, y: cy };
  return { x: Math.floor(state.map[0].length / 2), y: Math.floor(state.map.length / 2) };
}

export function createResident(
  state: GameState,
  rng: () => number,
  job: JobId = 'idle',
  origin?: string,
): Resident {
  const gender = rollResidentGender(rng);
  const name = rollResidentName(state, rng, gender);
  // 마을 중심지 주변에서 출발한다. 중심지 자체는 solid footprint라 주민을 올려두지 않는다.
  const center = state.buildings.find(b => b.type === 'center');
  const cx = center ? center.x : Math.floor(state.map[0].length / 2);
  const cy = center ? center.y : Math.floor(state.map.length / 2);
  const spawn = residentSpawnPoint(state, rng, cx, cy);
  const resident: Resident = {
    id: state.nextResidentId++,
    name,
    age: 16 + Math.floor(rng() * 34),
    gender,
    job,
    hunger: 80,
    warmth: 80,
    health: 100,
    morale: 60,
    skills: {},
    assignedBuildingId: null,
    homeBuildingId: null,
    task: JOB_NAMES[job],
    alive: true,
    sick: false,
    x: spawn.x,
    y: spawn.y,
    px: spawn.x,
    py: spawn.y,
    phase: 'rest',
    path: [],
    workTimer: 0,
    targetId: null,
    carrying: {},
    cartEquipped: false,
    haulTask: null,
    manualOrder: null,
  };
  if (origin) resident.origin = origin;
  return resident;
}

export function livingResidents(state: GameState): Resident[] {
  return state.residents.filter(r => r.alive);
}

function shuffleInPlace<T>(items: T[], rng: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const roll = Math.max(0, Math.min(0.999999999999, rng()));
    const j = Math.floor(roll * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

export function residentHome(
  state: GameState,
  resident: Pick<Resident, 'homeBuildingId'>,
): Building | null {
  if (resident.homeBuildingId == null) return null;
  const building = state.buildings.find(candidate => candidate.id === resident.homeBuildingId);
  if (!building?.built || BUILDING_DEFS[building.type].capacity <= 0) return null;
  return building;
}

// 유효한 기존 입주는 유지하고, 비어 있는 자리만 무작위로 배정한다.
export function reconcileResidentHomes(state: GameState, rng: () => number): void {
  const homes = state.buildings.filter(building =>
    building.built && BUILDING_DEFS[building.type].capacity > 0);
  const homeById = new Map(homes.map(home => [home.id, home]));
  const occupants = new Map<number, Resident[]>();

  for (const resident of state.residents) {
    if (!resident.alive) {
      resident.homeBuildingId = null;
      continue;
    }
    const home = resident.homeBuildingId == null ? null : homeById.get(resident.homeBuildingId);
    if (!home) {
      resident.homeBuildingId = null;
      continue;
    }
    const group = occupants.get(home.id) ?? [];
    group.push(resident);
    occupants.set(home.id, group);
  }

  for (const home of homes) {
    const group = occupants.get(home.id) ?? [];
    const capacity = BUILDING_DEFS[home.type].capacity;
    if (group.length <= capacity) continue;
    shuffleInPlace(group, rng);
    for (const resident of group.slice(capacity)) resident.homeBuildingId = null;
  }

  const unhoused = state.residents.filter(resident => resident.alive && resident.homeBuildingId == null);
  if (unhoused.length === 0) return;

  const vacantSlots: number[] = [];
  for (const home of homes) {
    const capacity = BUILDING_DEFS[home.type].capacity;
    const occupied = state.residents.filter(resident =>
      resident.alive && resident.homeBuildingId === home.id).length;
    for (let i = occupied; i < capacity; i++) vacantSlots.push(home.id);
  }
  if (vacantSlots.length === 0) return;

  shuffleInPlace(unhoused, rng);
  shuffleInPlace(vacantSlots, rng);
  const assignCount = Math.min(unhoused.length, vacantSlots.length);
  for (let i = 0; i < assignCount; i++) unhoused[i].homeBuildingId = vacantSlots[i];
}

export function countJob(state: GameState, job: JobId): number {
  return state.residents.filter(r => r.alive && r.job === job).length;
}

export function skillOf(r: Resident): number {
  return r.skills[r.job] ?? 0;
}

export function gainSkill(r: Resident): void {
  const cur = r.skills[r.job] ?? 0;
  r.skills[r.job] = Math.min(1, cur + CONFIG.production.skillGainPerDay);
}

const COMBAT_TASKS = new Set(['출전 준비', '출전 중', '전선 대기', '전투 중', '전투 부상']);

function isCombatDeathContext(state: GameState, resident: Resident): boolean {
  return state.battle?.defenderIds.includes(resident.id) === true || COMBAT_TASKS.has(resident.task);
}

export function killResident(
  state: GameState,
  r: Resident,
  cause: string,
  starvation = false,
  combatDeath = false,
): void {
  if (!r.alive) return;
  returnResidentCart(state, r);
  const horseLost = releaseResidentMount(state, r.id, combatDeath);
  r.alive = false;
  r.health = 0;
  r.homeBuildingId = null;
  r.task = '사망';
  state.totalDeaths++;
  if (getSeason(state.day) === 'winter') state.winterDeaths++;
  if (starvation) state.starvationDeathsThisYear++;
  state.lastDeathCause = combatDeath
    ? 'combat'
    : starvation
      ? 'starvation'
      : cause.includes('동상') || cause.includes('추위') || cause.includes('혹한')
        ? 'cold'
        : cause === '병' || cause.includes('질병') || cause.includes('역병')
          ? 'disease'
          : 'other';
  if (combatDeath) {
    addLog(state, `${r.name}이(가) 전투 중 전사했습니다. (${cause})`, 'raid', true);
    if (horseLost) addLog(state, '기수가 쓰러지는 과정에서 군마 한 필도 잃었습니다.', 'bad', true);
  } else if (cause === '호환') {
    addLog(state, `${r.name}이(가) 호환을 당해 목숨을 잃었습니다.`, 'bad', true);
  } else if (cause === '늑대 습격') {
    addLog(state, `${r.name}이(가) 늑대 떼의 습격으로 목숨을 잃었습니다.`, 'bad', true);
  } else {
    addLog(state, `${r.name}이(가) ${cause}(으)로 세상을 떠났습니다.`, 'bad', true);
  }
  // 이웃의 죽음은 마을 전체의 사기를 깎는다
  for (const other of state.residents) {
    if (other.alive) other.morale = Math.max(0, other.morale - 6);
  }
}

// 하루치 식사/난방/체온/건강 처리 (자원 소비는 simulation.ts에서 계산해 비율만 넘겨받는다)
export function updateResidentNeeds(
  state: GameState,
  rng: () => number,
  fedRatio: number,        // 0~1, 식량이 부족하면 1 미만
  firewoodRatio: number,   // 0~1, 장작 충족률
  clothesCoverage: number, // 0~1, 옷 보급률
  dietVarietyScore: number, // 0~1, 그날 먹은 식품군 다양성
  vegetableRatio: number,   // 0~1, 권장 채소 몫 충족률
  excludedResidentIds: ReadonlySet<number> = new Set(),
): void {
  const cfg = CONFIG.needs;
  const hcfg = CONFIG.health;
  const season = getSeason(state.day);
  const living = livingResidents(state).filter(resident => !excludedResidentIds.has(resident.id));
  reconcileResidentHomes(state, rng);

  for (const r of living) {
    // ── 식사 ──
    const ate = rng() < fedRatio;
    if (ate) r.hunger = Math.min(100, r.hunger + cfg.hungerGainFed);
    else r.hunger = Math.max(0, r.hunger - cfg.hungerLossUnfed);

    // ── 실제 입주 중인 집의 난방만 적용 ──
    const home = residentHome(state, r);
    const housingType: 'ondol' | 'hut' | 'none' = home
      ? BUILDING_DEFS[home.type].winterBonus ? 'ondol' : 'hut'
      : 'none';

    // ── 체온 ──
    if (season === 'spring' || season === 'summer') {
      r.warmth = Math.min(100, r.warmth + cfg.warmthRegenWarmSeason);
    } else {
      let loss = season === 'winter' ? cfg.warmthLossWinterBase : cfg.warmthLossWinterBase * 0.35;
      loss *= warmthLossWeatherMult(state.weather);
      loss *= 1 + (1 - clothesCoverage) * cfg.noClothesLossMult;
      if (housingType === 'none') loss *= cfg.homelessLossMult;
      // 난방: 장작 충족률에 비례. 장작이 없으면 온돌 보너스도 사라진다.
      const heat =
        housingType === 'ondol' ? cfg.heatOndol :
        housingType === 'hut' ? cfg.heatHut : cfg.heatHomeless;
      const net = loss - heat * firewoodRatio;
      r.warmth = Math.max(0, Math.min(100, r.warmth - net));
    }

    // ── 질병 발생 ──
    if (!r.sick && r.alive) {
      let chance = hcfg.sickBaseChance;
      if (r.warmth < 30) chance += hcfg.sickColdChance;
      if (season === 'summer') chance += hcfg.sickSummerChance;
      if (r.hunger < 25) chance += hcfg.sickHungryChance;
      if (rng() < chance) {
        r.sick = true;
        addLog(state, `${r.name}이(가) 병에 걸렸습니다.`, 'bad');
      }
    }

    // ── 건강 판정 ──
    let starving = false;
    if (r.warmth < 10) r.health -= hcfg.freezeDamage;
    else if (r.warmth < 25) r.health -= hcfg.coldDamage;
    if (r.hunger <= 0) { r.health -= hcfg.starveDamage; starving = true; }
    else if (r.hunger < 25) { r.health -= hcfg.hungryDamage; starving = true; }
    if (r.hunger > 25 && dietVarietyScore < 0.5) r.health -= hcfg.poorDietDamage;
    if (r.hunger > 25 && vegetableRatio < 0.5) r.health -= cfg.vegetableShortageHealthPenalty;

    if (r.sick) {
      const hasHerbs = state.resources.herbs >= hcfg.herbsPerSickPerDay;
      if (hasHerbs) state.resources.herbs -= hcfg.herbsPerSickPerDay;
      r.health -= hasHerbs ? hcfg.sickDamageWithHerbs : hcfg.sickDamage;
      const recover = hasHerbs ? hcfg.recoverChanceHerbs : hcfg.recoverChance;
      if (rng() < recover) {
        r.sick = false;
        addLog(state, `${r.name}이(가) 병에서 회복했습니다.`, 'good');
      }
    } else if (r.hunger > 50 && r.warmth > 50) {
      r.health = Math.min(100, r.health + hcfg.naturalHeal);
    }

    r.health = Math.max(0, Math.min(100, r.health));
    if (r.health <= 0) {
      const cause = starving ? '굶주림' : r.warmth < 25 ? '동상과 추위' : r.sick ? '병' : '쇠약';
      const combatDeath = isCombatDeathContext(state, r);
      const combatCause = starving && r.warmth < 25
        ? '혹한, 굶주림과 탈진'
        : starving
          ? '굶주림과 탈진'
          : r.warmth < 25
            ? '혹한과 탈진'
            : r.sick
              ? '질병과 부상'
              : '교전 중 입은 부상';
      killResident(state, r, combatDeath ? combatCause : cause, starving, combatDeath);
    }
  }
  reconcileResidentHomes(state, rng);
}

// 사기: 식량/추위/장터 상태에 따라 목표치로 수렴
export function updateMorale(
  state: GameState,
  foodOk: boolean,
  warmthAvg: number,
  hasMarket: boolean,
  dietVarietyScore = 1,
): void {
  let target = 50;
  target += foodOk ? 10 : -18;
  target += warmthAvg > 60 ? 8 : warmthAvg < 35 ? -12 : 0;
  target += hasMarket ? 5 : 0;
  if (dietVarietyScore < 0.5) target -= CONFIG.needs.monotonyMoralePenalty;
  for (const r of livingResidents(state)) {
    const diff = target - r.morale;
    r.morale = Math.max(0, Math.min(100, r.morale + Math.sign(diff) * Math.min(4, Math.abs(diff))));
  }
}

export function avg(state: GameState, key: 'health' | 'morale' | 'warmth' | 'hunger'): number {
  const living = livingResidents(state);
  if (living.length === 0) return 0;
  return living.reduce((s, r) => s + r[key], 0) / living.length;
}
