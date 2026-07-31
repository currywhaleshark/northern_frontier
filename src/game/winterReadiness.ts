// 겨울 점검 — "지금 곳간으로 며칠을 나는가"를 한 자리에서 계산한다.
// 실제 소모는 endOfDay가 배급령·날씨까지 얹어 처리하지만, 점검은 앞을 내다보는 눈금이라
// 전일 소모를 그대로 쓰지 않고 같은 식을 겨울 기준으로 다시 세워 근사한다.
// 길잡이 9단계(겨울 점검)와 후속 겨울 점검 패널이 이 한 함수를 함께 쓴다.
import { housingCapacity } from './buildings';
import { CONFIG } from './config';
import { foodTotal, fuelHeatTotal } from './consumption';
import { consumptionWeight } from './lifecycle';
import { livingResidents, residentHome } from './residents';
import { getSeason } from './seasons';
import { tributeReserved } from './tributeReserve';
import { firewoodWeatherMult } from './weather';
import type { GameState, ResourceId } from './types';

export interface WinterReadiness {
  weight: number;          // 소비 몫 합계 — 아이는 성인보다 적게 먹고 적게 땐다
  foodStock: number;       // 곳간의 모든 식품 (부패 전 기준)
  foodPerDay: number;      // 겨울 하루치 식량 소모
  foodDays: number;        // 식량 일분
  fuelHeatStock: number;   // 땔감의 열량 합계 (섶·장작·숯)
  fuelHeatPerDay: number;  // 겨울 하루치 열량 소모
  firewoodDays: number;    // 장작 일분
}

/** 오늘의 실제 열량 소모 근사 — 계절·날씨 배율까지 반영한다 (통제 사건의 배율 계산용). */
export function dailyFuelHeatNeed(state: GameState): number {
  return consumptionWeight(state) * CONFIG.needs.firewoodPerPerson *
    CONFIG.seasons.firewoodMult[getSeason(state.day)] * firewoodWeatherMult(state.weather);
}

/** 겨울 기준 일분. 가을에 미리 눌러 봐도 겨울 소모로 셈해 준다 (날씨 가중은 빼고 평시 겨울). */
export function winterReadiness(state: GameState): WinterReadiness {
  const weight = consumptionWeight(state);
  const foodStock = foodTotal(state);
  const foodPerDay = weight * CONFIG.needs.foodPerDay;
  const fuelHeatStock = fuelHeatTotal(state);
  const fuelHeatPerDay = weight * CONFIG.needs.firewoodPerPerson * CONFIG.seasons.firewoodMult.winter;
  const days = (stock: number, perDay: number): number =>
    perDay <= 0.000001 ? Infinity : stock / perDay;
  return {
    weight,
    foodStock,
    foodPerDay,
    foodDays: days(foodStock, foodPerDay),
    fuelHeatStock,
    fuelHeatPerDay,
    firewoodDays: days(fuelHeatStock, fuelHeatPerDay),
  };
}

// ── 겨울 점검표 ──
// 판정은 전부 여기에 둔다. 패널은 이 결과를 그리기만 한다 (표시와 판정을 섞지 않는다).

export type WinterCheckVerdict = 'ok' | 'warn' | 'bad';

export interface WinterCheckItem {
  id: 'food' | 'firewood' | 'housing' | 'wearables' | 'tribute' | 'sick';
  label: string;
  verdict: WinterCheckVerdict;
  value: string;   // 지금 수치 한 줄
  advice: string;  // 무엇을 보면 되는지 (해결책을 강요하지 않는다)
}

/** 시나리오가 목표치를 주입했으면 그것을, 아니면 기본 기준을 쓴다 — 9단계와 같은 눈금을 본다 */
function goalDays(state: GameState, key: string, fallback: number): number {
  const injected = state.scenario?.flags[key];
  return typeof injected === 'number' && injected > 0 ? injected : fallback;
}

function dayVerdict(days: number, goal: number): WinterCheckVerdict {
  if (days >= goal) return 'ok';
  return days >= CONFIG.time.seasonDays ? 'warn' : 'bad';
}

function daysText(days: number): string {
  return Number.isFinite(days) ? `${Math.floor(days)}일분` : '넉넉함';
}

export function winterChecklist(state: GameState): WinterCheckItem[] {
  const readiness = winterReadiness(state);
  const living = livingResidents(state);
  const population = living.length;
  const foodGoal = goalDays(state, 'foodDaysGoal', CONFIG.tutorial.foodDaysGoal);
  const firewoodGoal = goalDays(state, 'firewoodDaysGoal', CONFIG.tutorial.firewoodDaysGoal);

  const housing = housingCapacity(state);
  const housed = living.filter(resident => residentHome(state, resident)).length;
  const homeless = population - housed;
  const spare = Math.max(0, housing.total - housed);

  const barefoot = living.filter(resident => !resident.worn?.footwear).length;
  const unclothed = living.filter(resident => !resident.worn?.clothing).length;
  const exposed = Math.max(barefoot, unclothed);

  const tribute = state.courtTribute && !state.courtTribute.resolved ? state.courtTribute : null;
  const tributeEntries = tribute
    ? (Object.entries(tribute.items) as [ResourceId, number][]).filter(([, required]) => required > 0)
    : [];
  const tributeMet = tributeEntries.filter(([resource, required]) =>
    tributeReserved(state, resource) >= required).length;

  const sick = living.filter(resident => resident.sick).length;

  return [
    {
      id: 'food',
      label: '식량',
      verdict: dayVerdict(readiness.foodDays, foodGoal),
      value: `${daysText(readiness.foodDays)} (하루 ${readiness.foodPerDay.toFixed(1)})`,
      advice: `겨울 소모로 셈한 일분입니다. ${foodGoal}일분이면 넉넉합니다.`,
    },
    {
      id: 'firewood',
      label: '땔감',
      verdict: dayVerdict(readiness.firewoodDays, firewoodGoal),
      value: `${daysText(readiness.firewoodDays)} (섶·장작·숯 열량 합)`,
      advice: `${firewoodGoal}일분이 기준입니다. 혹한이 닥친 날은 하루 소모가 껑충 뜁니다.`,
    },
    {
      id: 'housing',
      label: '주거',
      verdict: homeless > 0 ? 'bad' : spare > 0 ? 'ok' : 'warn',
      value: homeless > 0
        ? `노숙 ${homeless}명 (입주 ${housed}/${housing.total})`
        : `빈자리 ${spare} (입주 ${housed}/${housing.total})`,
      advice: '노숙하는 이는 겨울을 넘기지 못합니다. 온돌집은 웃풍이 덜합니다.',
    },
    {
      id: 'wearables',
      label: '옷과 신발',
      verdict: exposed === 0 ? 'ok' : exposed * 4 <= population ? 'warn' : 'bad',
      value: `옷 없음 ${unclothed}명 · 신 없음 ${barefoot}명`,
      advice: '베틀집과 가죽공방이 옷과 신을 냅니다. 헐벗으면 체온이 더 빨리 식습니다.',
    },
    {
      id: 'tribute',
      label: '세공고',
      verdict: tributeEntries.length === 0
        ? 'ok'
        : tributeMet >= tributeEntries.length ? 'ok' : tributeMet > 0 ? 'warn' : 'bad',
      value: tributeEntries.length === 0
        ? '올해 거둘 세공이 없습니다'
        : `요구 ${tributeEntries.length}품목 중 ${tributeMet}품목 충당`,
      advice: '세공고에 넣어 둔 몫은 겨울 소비와 분리되어 잠깁니다. 조정 창에서 채우십시오.',
    },
    {
      id: 'sick',
      label: '병자',
      verdict: sick === 0 ? 'ok' : sick * 10 <= population ? 'warn' : 'bad',
      value: sick === 0 ? '없음' : `${sick}명 (인구 ${population})`,
      advice: '병자는 일을 못 하고 약초를 씁니다. 곳간의 약초 잔량을 함께 보십시오.',
    },
  ];
}
