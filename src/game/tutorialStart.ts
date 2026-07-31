// 튜토리얼 게임 생성 — 고정 시드 + 시작 불변식 보정.
// 맵을 손으로 만들지 않고 시드 생성 결과를 검증·보정한다. 맵 생성이 바뀌어
// 불변식이 깨지면 테스트가 먼저 알려주고, 그때 시드를 다시 고르거나 보정을 넓힌다.
import { CONFIG } from './config';
import { addLog } from './events';
import { newGame } from './simulation';
import { createTutorialScenarioState, dailyScenarioTick } from './scenario';
import { aquiferSampleAt } from './subsurfaceVeins';
import { naturalWaterCoverageTileSets } from './waterCoverage';
import type { GameState } from './types';

// 고른 기준: 마을 근처에 숲·서식지·개활지가 고루 있고, 물 스텝에 쓸 수맥이나
// 강 급수권이 마을 곁에 있는 시드 (테스트가 불변식을 지킨다)
export const TUTORIAL_SEED = 20260718;

// 물 불변식을 재는 반경 — 마을 중심에서 걸어 다니며 우물을 팔 만한 거리
const TUTORIAL_WATER_RADIUS = 8;

export function createTutorialGame(): GameState {
  // 시나리오는 고정된 마을 이름을 쓴다 (설계 §1-1) — 표기는 "길잡이촌"이 된다
  const state = newGame(TUTORIAL_SEED, 'easy', '길잡이');
  ensureTutorialInvariants(state);
  const builtHouses = state.buildings.filter(building =>
    building.built && (building.type === 'hut' || building.type === 'ondol' || building.type === 'tileHouse')).length;
  const builtWoodSheds = state.buildings.filter(building => building.built && building.type === 'woodShed').length;
  state.scenario = createTutorialScenarioState({
    firewoodGoal: Math.ceil(state.resources.firewood) + 25,
    woodShedGoal: builtWoodSheds + 1,
    houseGoal: builtHouses + 1,
    meatGoal: CONFIG.tutorial.meatGoal,
    sownAreaGoal: CONFIG.tutorial.sownAreaGoal,
    foodDaysGoal: CONFIG.tutorial.foodDaysGoal,
    firewoodDaysGoal: CONFIG.tutorial.firewoodDaysGoal,
  });
  dailyScenarioTick(state); // 첫 안내 모달을 게임 시작과 동시에 연다
  return state;
}

export interface TutorialWaterAccess {
  wellSpots: number;         // 마을 근처에서 우물을 팔 수 있는 칸 수 (수맥 위)
  naturalWaterTiles: number; // 마을 근처의 강·농수로 급수권 칸 수
}

// 물 스텝(4단계)이 성립하려면 마을 곁에 수맥이나 강 급수권이 있어야 한다.
// 둘 다 시드로 정해지는 지물이라 이 자리에서 만들어 낼 수 없다 — 어긋나면 시드를 다시 고른다.
export function tutorialWaterAccess(state: GameState): TutorialWaterAccess {
  const center = state.buildings.find(building => building.type === 'center');
  const originX = center?.x ?? Math.floor((state.map[0]?.length ?? 1) / 2);
  const originY = center?.y ?? Math.floor(state.map.length / 2);
  const width = state.map[0]?.length ?? 0;
  const coverage = naturalWaterCoverageTileSets(state);
  let wellSpots = 0;
  let naturalWaterTiles = 0;
  for (let dy = -TUTORIAL_WATER_RADIUS; dy <= TUTORIAL_WATER_RADIUS; dy++) {
    const span = TUTORIAL_WATER_RADIUS - Math.abs(dy);
    for (let dx = -span; dx <= span; dx++) {
      const x = originX + dx;
      const y = originY + dy;
      const tile = state.map[y]?.[x];
      if (!tile) continue;
      if (tile.terrain !== 'river' && tile.terrain !== 'mountain' &&
        aquiferSampleAt(state.seed, width, state.map.length, x, y) != null) {
        wellSpots++;
      }
      if (coverage.river.has(`${x},${y}`) || coverage.canal.has(`${x},${y}`)) naturalWaterTiles++;
    }
  }
  return { wellSpots, naturalWaterTiles };
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

  // 물 스텝: 수맥도 강 급수권도 없으면 4단계를 끝낼 방도가 없다.
  // 지물을 지어낼 수는 없으니 눈에 띄게 남겨 시드 재선정을 부른다 (회귀 테스트가 먼저 잡는다).
  const water = tutorialWaterAccess(state);
  if (water.wellSpots === 0 && water.naturalWaterTiles === 0) {
    addLog(state, '이 지도에는 마을 곁에 물 자리가 없습니다. 길잡이 시드를 다시 골라야 합니다.', 'bad', true);
  }
}
