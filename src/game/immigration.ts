import { housingCapacity } from './buildings';
import { CONFIG } from './config';
import { foodTotal } from './consumption';
import { addLog } from './events';
import { RESIDENT_ORIGINS, residentOriginLabel } from './defectors';
import { addForeignSiteMemory } from './foreignSites';
import { literateAdults } from './education';
import { applyLifeStage } from './lifecycle';
import { makeRng } from './map';
import { rankEffects } from './promotion';
import { changeRelation } from './relations';
import { createResident, livingResidents, reconcileResidentHomes } from './residents';
import { getSeason } from './seasons';
import type { GameState } from './types';

export const IMMIGRATION_STORIES = [
  {
    title: '흉년을 피해 온 유민들',
    body: '남쪽 고을의 흉년을 견디지 못한 유민들이 북쪽 길을 따라 흘러들었습니다. 이들은 이곳에서 다시 삶을 일구게 해 달라고 청합니다.',
  },
  {
    title: '습격을 피해 온 피란민들',
    body: '국경 마을이 습격을 받아 삶터를 잃은 피란민들이 성책 앞에 도착했습니다. 어린아이와 노인을 데리고 있어 더는 먼 길을 갈 수 없어 보입니다.',
  },
  {
    title: '산에서 내려온 화전민들',
    body: '산골을 떠돌며 화전을 일구던 가족들이 개척지의 연기를 보고 찾아왔습니다. 땅을 일구고 나무를 베며 마을의 일원이 되겠다고 합니다.',
  },
  {
    title: '부역을 피해 달아난 백성들',
    body: '가혹한 부역을 피해 고향을 떠난 백성들이 밤길을 걸어 개척지에 닿았습니다. 돌려보내면 다시 붙잡힐 것이라며 받아 달라고 호소합니다.',
  },
] as const;

function foodDays(food: number, population: number): number {
  const dailyNeed = population * CONFIG.needs.foodPerDay;
  return dailyNeed > 0 ? food / dailyNeed : 0;
}

function arrivalForecast(state: GameState, count: number) {
  const living = livingResidents(state);
  const housing = housingCapacity(state);
  const currentFood = foodTotal(state);
  const afterPopulation = living.length + count;
  const freeBeds = Math.max(0, housing.total - living.length);
  const afterHomeless = Math.max(0, afterPopulation - housing.total);
  return {
    living,
    housing,
    currentFood,
    afterPopulation,
    freeBeds,
    afterHomeless,
    currentFoodDays: foodDays(currentFood, living.length),
    afterFoodDays: foodDays(currentFood, afterPopulation),
  };
}

export function openDefectorImmigrationChoice(
  state: GameState,
  origin: string,
  count: number,
  sourceSiteId?: number,
  favorCost = 0,
): boolean {
  if (state.pendingChoice || state.battle || state.gameOver || livingResidents(state).length === 0) return false;
  const boundedCount = Math.max(1, Math.min(CONFIG.immigration.groupMax, Math.floor(count)));
  const forecast = arrivalForecast(state, boundedCount);
  const originLabel = residentOriginLabel(origin);
  state.pendingChoice = {
    kind: 'immigration',
    title: `${originLabel}의 귀순 청원`,
    illustration: {
      src: '/assets/events/immigration-arrival-v2.png',
      alt: '성책 앞에서 무기를 내려놓고 귀순을 청하는 사람들',
    },
    body:
      `${originLabel} ${boundedCount}명이 가족과 짐을 이끌고 개척지에 귀순을 청합니다. ` +
      '받아들이면 평소에는 다른 주민처럼 일하고, 필요할 때 출신지에서 익힌 전투 경험을 보탭니다.\n\n' +
      `일행: ${boundedCount}명\n` +
      `현재 주거: ${forecast.living.length}명 / ${forecast.housing.total}명 수용 (빈자리 ${forecast.freeBeds}명)\n` +
      `수용 후: ${forecast.afterPopulation}명 / ${forecast.housing.total}명 수용` +
      (forecast.afterHomeless > 0 ? ` · 노숙 ${forecast.afterHomeless}명 예상\n` : ' · 전원 입주 가능\n') +
      `수용 후 식량 여유: 약 ${forecast.afterFoodDays.toFixed(1)}일분\n` +
      '북방 출신 주민은 조정 감찰의 의심을 조금씩 높일 수 있습니다.',
    options: [
      {
        id: 'accept', label: '받아들인다',
        desc: `인구 +${boundedCount}. 출신 전투 경험을 얻지만 조정의 눈총이 늘 수 있습니다.`,
      },
      {
        id: 'reject', label: '돌려보낸다',
        desc: `인구 변화 없음. ${origin}과의 관계 -${CONFIG.defectors.rejectRelation}.`,
      },
    ],
    data: {
      count: boundedCount,
      origin,
      ...(sourceSiteId != null ? { sourceSiteId, favorCost } : {}),
    },
  };
  state.lastImmigrationDay = state.day;
  return true;
}

export function maybeOfferDefectorImmigration(state: GameState, rng: () => number): boolean {
  if (state.pendingChoice || state.battle || state.gameOver) return false;
  const season = getSeason(state.day);
  if (season !== 'spring' && season !== 'summer') return false;
  const lastDay = state.lastImmigrationDay ?? -999;
  if (state.day - lastDay < CONFIG.immigration.cooldownDays) return false;
  if (rng() >= Math.min(1, CONFIG.defectors.immigrationDailyChance * rankEffects(state.rank).immigration)) return false;
  const origins = [RESIDENT_ORIGINS.nimacha, RESIDENT_ORIGINS.holaon] as const;
  const origin = origins[Math.floor(rng() * origins.length)];
  const count = CONFIG.defectors.groupMin +
    Math.floor(rng() * (CONFIG.defectors.groupMax - CONFIG.defectors.groupMin + 1));
  return openDefectorImmigrationChoice(state, origin, count);
}

export function maybeOfferImmigration(state: GameState, rng: () => number): boolean {
  if (state.pendingChoice || state.battle || state.gameOver) return false;
  const season = getSeason(state.day);
  if (season !== 'spring' && season !== 'summer') return false;

  const im = CONFIG.immigration;
  const lastDay = state.lastImmigrationDay ?? -999;
  if (state.day - lastDay < im.cooldownDays) return false;
  if (rng() >= Math.min(1, im.dailyChance * rankEffects(state.rank).immigration)) return false;

  const living = livingResidents(state);
  if (living.length === 0) return false;
  const count = im.groupMin + Math.floor(rng() * (im.groupMax - im.groupMin + 1));
  // 가족 구성 — 홀몸만 오지 않는다. 아이·노부모가 섞이면 즉시 전력은 줄지만 뿌리가 내린다.
  const l = CONFIG.lifecycle;
  const children = count >= 3 && rng() < l.immigrantChildChance ? 1 : 0;
  const elders = count - children >= 2 && rng() < l.immigrantElderChance ? 1 : 0;
  const compositionLabel = children + elders > 0
    ? ` (장정 ${count - children - elders}, ${[children > 0 ? `아이 ${children}` : '', elders > 0 ? `노부모 ${elders}` : ''].filter(Boolean).join(', ')})`
    : '';
  const story = IMMIGRATION_STORIES[Math.floor(rng() * IMMIGRATION_STORIES.length)];
  const forecast = arrivalForecast(state, count);

  state.pendingChoice = {
    kind: 'immigration',
    title: story.title,
    illustration: {
      src: '/assets/events/immigration-arrival-v2.png',
      alt: '성책 앞에서 받아들여 달라고 청하는 유민들',
    },
    body:
      `${story.body}\n\n` +
      `일행: ${count}명${compositionLabel}\n` +
      `현재 주거: ${living.length}명 / ${forecast.housing.total}명 수용 (빈자리 ${forecast.freeBeds}명)\n` +
      `수용 후: ${forecast.afterPopulation}명 / ${forecast.housing.total}명 수용` +
      (forecast.afterHomeless > 0 ? ` · 노숙 ${forecast.afterHomeless}명 예상\n` : ' · 전원 입주 가능\n') +
      `현재 식량: ${Math.floor(forecast.currentFood)} · 현재 인구 기준 약 ${forecast.currentFoodDays.toFixed(1)}일분\n` +
      `수용 후 식량 여유: 약 ${forecast.afterFoodDays.toFixed(1)}일분`,
    options: [
      {
        id: 'accept',
        label: '받아들인다',
        desc: `인구 +${count}. ${forecast.afterHomeless > 0 ? `노숙 ${forecast.afterHomeless}명 발생.` : '전원 입주 가능.'} 식량은 약 ${forecast.afterFoodDays.toFixed(1)}일분이 됩니다.`,
      },
      {
        id: 'reject',
        label: '돌려보낸다',
        desc: `인구 변화 없음. 명성 -${im.rejectReputation}.`,
      },
    ],
    data: { count, children, elders },
  };
  state.lastImmigrationDay = state.day;
  return true;
}

export function resolveImmigration(state: GameState, optionId: string): void {
  const choice = state.pendingChoice;
  if (!choice || choice.kind !== 'immigration') return;
  const rawCount = Number(choice.data.count);
  const count = Number.isFinite(rawCount)
    ? Math.max(1, Math.min(CONFIG.immigration.groupMax, Math.floor(rawCount)))
    : CONFIG.immigration.groupMin;
  const origin = typeof choice.data.origin === 'string' && choice.data.origin.trim().length > 0
    ? choice.data.origin.trim()
    : undefined;
  const sourceSiteId = Number(choice.data.sourceSiteId);
  const sourceSite = Number.isFinite(sourceSiteId)
    ? state.foreignSites.find(site => site.id === sourceSiteId)
    : undefined;
  const favorCost = Math.max(0, Math.floor(Number(choice.data.favorCost) || 0));
  state.pendingChoice = null;

  if (optionId === 'accept') {
    const rng = makeRng(state.seed + state.day * 15485863 + count * 17);
    const children = Math.max(0, Math.min(count - 1, Math.floor(Number(choice.data.children) || 0)));
    const elders = Math.max(0, Math.min(count - children - 1, Math.floor(Number(choice.data.elders) || 0)));
    // 문해자 공급 — 성인 유민 일부는 글을 안다. 마을에 문해 성인이 하나도 없으면
    // 첫 성인은 문해자로 보장한다 (관직 데드락 방지).
    let literateGuaranteeLeft = literateAdults(state).length === 0 ? 1 : 0;
    let literateArrived = 0;
    for (let i = 0; i < count; i++) {
      const resident = createResident(state, rng, 'idle', origin);
      if (i < children) {
        applyLifeStage(resident, rng() < 0.5 ? 'child' : 'youth');
      } else {
        if (i < children + elders) {
          resident.age = 55 + Math.floor(rng() * 10); // 노부모 — 자연사 시계가 곧 돈다
        }
        if (literateGuaranteeLeft > 0 || rng() < CONFIG.education.immigrantLiterateChance) {
          resident.literate = true;
          literateGuaranteeLeft = 0;
          literateArrived += 1;
        }
      }
      state.residents.push(resident);
    }
    if (literateArrived > 0) {
      addLog(state, `새 유민 가운데 글을 아는 이가 ${literateArrived}명 있습니다. 의원·아전·훈장을 맡길 수 있습니다.`, 'good');
    }
    reconcileResidentHomes(state, rng);
    if (sourceSite) {
      sourceSite.favors = Math.max(0, sourceSite.favors - favorCost);
      sourceSite.population = Math.max(0, sourceSite.population - count);
      sourceSite.militaryPower = Math.max(0, sourceSite.militaryPower - count);
      sourceSite.lastInteractionDay = state.day;
      addForeignSiteMemory(state, sourceSite.id, `주민 ${count}명이 개척지로 옮겨 가는 것을 묵인했습니다.`, 'neutral');
    }
    addLog(
      state,
      origin
        ? `${residentOriginLabel(origin)} ${count}명을 받아들였습니다. 평소에는 다른 주민처럼 일하며 출신지의 전투 경험을 간직합니다.`
        : `떠돌던 백성 ${count}명을 받아들였습니다. 새 주민들에게 일자리를 마련해야 합니다.`,
      'good', true,
    );
    return;
  }

  if (optionId === 'reject') {
    if (origin) {
      changeRelation(state, origin, -CONFIG.defectors.rejectRelation);
      if (sourceSite) {
        sourceSite.lastInteractionDay = state.day;
        addForeignSiteMemory(state, sourceSite.id, '개척지가 귀순 청원을 거절해 사람들이 돌아왔습니다.', 'bad');
      }
      addLog(state, `${residentOriginLabel(origin)}의 귀순 청원을 거절했습니다. ${origin}과의 관계가 나빠졌습니다.`, 'bad', true);
      return;
    }
    state.resources.reputation = Math.max(0, state.resources.reputation - CONFIG.immigration.rejectReputation);
    addLog(state, '머물 곳을 청하던 이들을 돌려보냈습니다. 야박하다는 소문이 퍼져 명성이 조금 떨어졌습니다.', 'bad', true);
  }
}
