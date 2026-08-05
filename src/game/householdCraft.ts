// 귀가 뒤 가내수공업의 공통 진입점.
// 현재는 짚신뿐이지만 새끼줄·멍석·바구니 등은 이 목록에 제작 규칙을 더해 확장한다.
import { craftStrawShoesAtHome } from './wearables';
import type { GameState, Resident, ResourceId } from './types';

export interface HouseholdCraftResult {
  resource: ResourceId;
  amount: number;
  task: string;
}

interface HouseholdCraftDef {
  resource: ResourceId;
  task: string;
  craft: (state: GameState, resident: Resident) => number;
}

const HOUSEHOLD_CRAFTS: readonly HouseholdCraftDef[] = [
  { resource: 'strawShoes', task: '짚신을 삼고 잠듦', craft: craftStrawShoesAtHome },
];

export function performHouseholdCraftAtHome(
  state: GameState,
  resident: Resident,
): HouseholdCraftResult | null {
  for (const def of HOUSEHOLD_CRAFTS) {
    const amount = def.craft(state, resident);
    if (amount > 0) return { resource: def.resource, amount, task: def.task };
  }
  return null;
}
