// 겨울 점검 — "지금 곳간으로 며칠을 나는가"를 한 자리에서 계산한다.
// 실제 소모는 endOfDay가 배급령·날씨까지 얹어 처리하지만, 점검은 앞을 내다보는 눈금이라
// 전일 소모를 그대로 쓰지 않고 같은 식을 겨울 기준으로 다시 세워 근사한다.
// 길잡이 9단계(겨울 점검)와 후속 겨울 점검 패널이 이 한 함수를 함께 쓴다.
import { CONFIG } from './config';
import { foodTotal, fuelHeatTotal } from './consumption';
import { consumptionWeight } from './lifecycle';
import { getSeason } from './seasons';
import { firewoodWeatherMult } from './weather';
import type { GameState } from './types';

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
