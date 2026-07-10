import { housingCapacity } from './buildings';
import { CONFIG } from './config';
import { foodTotal } from './consumption';
import { addLog } from './events';
import { makeRng } from './map';
import { rankEffects } from './promotion';
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
  const story = IMMIGRATION_STORIES[Math.floor(rng() * IMMIGRATION_STORIES.length)];
  const housing = housingCapacity(state);
  const currentFood = foodTotal(state);
  const afterPopulation = living.length + count;
  const freeBeds = Math.max(0, housing.total - living.length);
  const afterHomeless = Math.max(0, afterPopulation - housing.total);
  const currentFoodDays = foodDays(currentFood, living.length);
  const afterFoodDays = foodDays(currentFood, afterPopulation);

  state.pendingChoice = {
    kind: 'immigration',
    title: story.title,
    illustration: {
      src: '/assets/events/immigration-arrival-v2.png',
      alt: '성책 앞에서 받아들여 달라고 청하는 유민들',
    },
    body:
      `${story.body}\n\n` +
      `일행: ${count}명\n` +
      `현재 주거: ${living.length}명 / ${housing.total}명 수용 (빈자리 ${freeBeds}명)\n` +
      `수용 후: ${afterPopulation}명 / ${housing.total}명 수용` +
      (afterHomeless > 0 ? ` · 노숙 ${afterHomeless}명 예상\n` : ' · 전원 입주 가능\n') +
      `현재 식량: ${Math.floor(currentFood)} · 현재 인구 기준 약 ${currentFoodDays.toFixed(1)}일분\n` +
      `수용 후 식량 여유: 약 ${afterFoodDays.toFixed(1)}일분`,
    options: [
      {
        id: 'accept',
        label: '받아들인다',
        desc: `인구 +${count}. ${afterHomeless > 0 ? `노숙 ${afterHomeless}명 발생.` : '전원 입주 가능.'} 식량은 약 ${afterFoodDays.toFixed(1)}일분이 됩니다.`,
      },
      {
        id: 'reject',
        label: '돌려보낸다',
        desc: `인구 변화 없음. 명성 -${im.rejectReputation}.`,
      },
    ],
    data: { count },
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
  state.pendingChoice = null;

  if (optionId === 'accept') {
    const rng = makeRng(state.seed + state.day * 15485863 + count * 17);
    for (let i = 0; i < count; i++) state.residents.push(createResident(state, rng, 'idle'));
    reconcileResidentHomes(state, rng);
    addLog(state, `떠돌던 백성 ${count}명을 받아들였습니다. 새 주민들에게 일자리를 마련해야 합니다.`, 'good', true);
    return;
  }

  if (optionId === 'reject') {
    state.resources.reputation = Math.max(0, state.resources.reputation - CONFIG.immigration.rejectReputation);
    addLog(state, '머물 곳을 청하던 이들을 돌려보냈습니다. 야박하다는 소문이 퍼져 명성이 조금 떨어졌습니다.', 'bad', true);
  }
}
