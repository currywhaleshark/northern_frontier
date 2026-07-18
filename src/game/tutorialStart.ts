// 튜토리얼 게임 생성 — 고정 시드 + 시작 불변식 보정.
// 맵을 손으로 만들지 않고 시드 생성 결과를 검증·보정한다. 맵 생성이 바뀌어
// 불변식이 깨지면 테스트가 먼저 알려주고, 그때 시드를 다시 고르거나 보정을 넓힌다.
import { newGame } from './simulation';
import { createTutorialScenarioState, dailyScenarioTick } from './scenario';
import type { GameState } from './types';

// 고른 기준: 마을 근처에 숲·서식지·개활지가 고루 있는 시드 (테스트가 불변식을 지킨다)
export const TUTORIAL_SEED = 20260718;

export function createTutorialGame(): GameState {
  const state = newGame(TUTORIAL_SEED, 'easy');
  ensureTutorialInvariants(state);
  const builtHouses = state.buildings.filter(building =>
    building.built && (building.type === 'hut' || building.type === 'ondol' || building.type === 'tileHouse')).length;
  state.scenario = createTutorialScenarioState({
    firewoodGoal: Math.ceil(state.resources.firewood) + 25,
    houseGoal: builtHouses + 1,
    meatGoal: 6,
  });
  dailyScenarioTick(state); // 첫 안내 모달을 게임 시작과 동시에 연다
  return state;
}

// 튜토리얼 진행에 꼭 필요한 지물 보정 — 위반 시 최소한으로 고친다
export function ensureTutorialInvariants(state: GameState): void {
  // 사냥 스텝: 활성 서식지가 하나는 있어야 한다 (newGame이 마을 근처 하나를 보장하지만 이중 안전망)
  if (!state.habitats.some(habitat => habitat.active)) {
    const forest = state.map.flat().find(tile => tile.terrain === 'forest');
    state.habitats.push({
      id: 1 + state.habitats.reduce((max, habitat) => Math.max(max, habitat.id), 0),
      x: forest?.x ?? 5,
      y: forest?.y ?? 5,
      radius: 3,
      active: true,
    });
  }
}
