// 주민 생성과 일일 생존 판정
import { CONFIG } from './config';
import { GIVEN_NAMES, JOB_NAMES, SURNAMES } from './constants';
import { housingCapacity } from './buildings';
import { addLog } from './events';
import { getSeason } from './seasons';
import { warmthLossWeatherMult } from './weather';
import type { GameState, JobId, Resident } from './types';

export function createResident(state: GameState, rng: () => number, job: JobId = 'idle'): Resident {
  const name = SURNAMES[Math.floor(rng() * SURNAMES.length)] + GIVEN_NAMES[Math.floor(rng() * GIVEN_NAMES.length)];
  // 마을 중심지에서 출발한다
  const center = state.buildings.find(b => b.type === 'center');
  const cx = center ? center.x : Math.floor(state.map[0].length / 2);
  const cy = center ? center.y : Math.floor(state.map.length / 2);
  return {
    id: state.nextResidentId++,
    name,
    age: 16 + Math.floor(rng() * 34),
    job,
    hunger: 80,
    warmth: 80,
    health: 100,
    morale: 60,
    skills: {},
    task: JOB_NAMES[job],
    alive: true,
    sick: false,
    x: cx,
    y: cy,
    px: cx,
    py: cy,
    phase: 'rest',
    path: [],
    workTimer: 0,
    targetId: null,
    carrying: {},
  };
}

export function livingResidents(state: GameState): Resident[] {
  return state.residents.filter(r => r.alive);
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

function kill(state: GameState, r: Resident, cause: string, starvation: boolean): void {
  r.alive = false;
  r.health = 0;
  r.task = '사망';
  state.totalDeaths++;
  if (getSeason(state.day) === 'winter') state.winterDeaths++;
  if (starvation) state.starvationDeathsThisYear++;
  addLog(state, `${r.name}이(가) ${cause}(으)로 세상을 떠났습니다.`, 'bad');
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
): void {
  const cfg = CONFIG.needs;
  const hcfg = CONFIG.health;
  const season = getSeason(state.day);
  const living = livingResidents(state);
  const housing = housingCapacity(state);

  // 온돌집 → 초가집 → 노숙 순으로 배정된다고 가정
  let ondolLeft = housing.ondol;
  let hutLeft = housing.total - housing.ondol;

  for (const r of living) {
    // ── 식사 ──
    const ate = rng() < fedRatio;
    if (ate) r.hunger = Math.min(100, r.hunger + cfg.hungerGainFed);
    else r.hunger = Math.max(0, r.hunger - cfg.hungerLossUnfed);

    // ── 주거 배정 ──
    let housingType: 'ondol' | 'hut' | 'none' = 'none';
    if (ondolLeft > 0) { ondolLeft--; housingType = 'ondol'; }
    else if (hutLeft > 0) { hutLeft--; housingType = 'hut'; }

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
      kill(state, r, cause, starving);
    }
  }
}

// 사기: 식량/추위/장터 상태에 따라 목표치로 수렴
export function updateMorale(state: GameState, foodOk: boolean, warmthAvg: number, hasMarket: boolean): void {
  let target = 50;
  target += foodOk ? 10 : -18;
  target += warmthAvg > 60 ? 8 : warmthAvg < 35 ? -12 : 0;
  target += hasMarket ? 5 : 0;
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
