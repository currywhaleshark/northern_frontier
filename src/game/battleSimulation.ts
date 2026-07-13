// 전투 시뮬레이션 모드 — 메인 메뉴에서 전술 전투만 따로 테스트한다.
// 격리된 샌드박스 GameState를 만들어 지정/랜덤 조건으로 createTacticalBattle을 연다.
// 결과는 저장되지 않고, 전투가 끝나면 메뉴로 돌아간다.
import { CONFIG } from './config';
import { addLog } from './events';
import { makeRng } from './map';
import { createResident } from './residents';
import { newGame } from './simulation';
import { createTacticalBattle } from './tacticalBattle';
import type { BattleMode, GameState, JobId, Season, WeatherId } from './types';

// 각 항목은 구체값 또는 'random' (시작할 때마다 새로 굴린다)
export type SimSetting<T> = T | 'random';

export interface BattleSimDefenderCounts {
  muskets: number;        // 조총 수비대
  bows: number;           // 각궁 수비대
  spears: number;         // 창 수비대
  unarmedMilitia: number; // 맨손 수비병
  watchmen: number;       // 파수꾼
  hunters: number;        // 사냥꾼
  civilians: number;      // 피난 주민
}

export interface BattleSimulationOptions {
  mode: SimSetting<BattleMode>;
  factionName: SimSetting<string>;
  power: SimSetting<number>;          // 적 전력 (일반 15~180, 토벌군 최소 120)
  warned: SimSetting<boolean>;        // 경보 여부
  siege: SimSetting<boolean>;         // 방책 공성 여부
  season: SimSetting<Season>;
  weather: SimSetting<WeatherId>;
  prepPoints: SimSetting<number> | 'auto'; // 'auto'면 기존 규칙대로 계산
  defenders: SimSetting<BattleSimDefenderCounts>;
  cannonEmplacements: SimSetting<number>; // 완성된 불랑기포대 수
  seed?: number;
}

const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
const WEATHERS: WeatherId[] = ['clear', 'rain', 'frost', 'heavySnow', 'blizzard', 'coldSnap', 'thawFlood'];

export const BATTLE_SIMULATION_ENEMIES = [
  {
    name: '니마차 우디캐',
    description: '숲 사냥꾼과 창잡이 우회대가 매복과 측면 공격을 노립니다.',
  },
  {
    name: '홀라온 야인',
    description: '기마 선봉과 기마 궁수가 빠르게 방어선의 빈틈을 파고듭니다.',
  },
  {
    name: '변경 마적',
    description: '두목 친위대와 기마 마적, 약탈패가 창고와 주민을 노립니다.',
  },
  {
    name: '조정 토벌군',
    description: '훈련도감식 포수·사수·살수에 관군 기병과 화포대가 합류한 최고 난도 편제입니다.',
  },
] as const;

// 계절 중간 날짜 — getSeason이 해당 계절을 돌려주는 day 값
function dayForSeason(season: Season): number {
  const index = SEASONS.indexOf(season);
  return index * CONFIG.time.seasonDays + Math.ceil(CONFIG.time.seasonDays / 2);
}

function pick<T>(setting: SimSetting<T>, roll: () => T): T {
  return setting === 'random' ? roll() : setting;
}

export function randomDefenderCounts(rng: () => number): BattleSimDefenderCounts {
  const counts: BattleSimDefenderCounts = {
    muskets: Math.floor(rng() * 4),
    bows: Math.floor(rng() * 5),
    spears: Math.floor(rng() * 5),
    unarmedMilitia: Math.floor(rng() * 4),
    watchmen: Math.floor(rng() * 4),
    hunters: Math.floor(rng() * 5),
    civilians: 4 + Math.floor(rng() * 7),
  };
  // 전투원이 하나도 없으면 최소한의 수비대는 세운다
  if (counts.muskets + counts.bows + counts.spears + counts.unarmedMilitia + counts.watchmen + counts.hunters === 0) {
    counts.spears = 2;
    counts.watchmen = 1;
  }
  return counts;
}

export function createBattleSimulation(options: BattleSimulationOptions): GameState {
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = makeRng(seed);
  const state = newGame(seed, 'normal');

  const season = pick(options.season, () => SEASONS[Math.floor(rng() * SEASONS.length)]);
  state.day = dayForSeason(season);
  state.weather = pick(options.weather, () => WEATHERS[Math.floor(rng() * WEATHERS.length)]);

  // 시작 주민을 걷어내고 지정 구성으로 다시 채운다
  const counts = pick(options.defenders, () => randomDefenderCounts(rng));
  state.residents = [];
  state.nextResidentId = 1;
  const add = (job: JobId, amount: number) => {
    for (let i = 0; i < amount; i++) state.residents.push(createResident(state, rng, job));
  };
  add('militia', counts.muskets + counts.bows + counts.spears + counts.unarmedMilitia);
  add('watchman', counts.watchmen);
  add('hunter', counts.hunters);
  add('idle', counts.civilians);

  // 무기 배분(militiaWeaponAllocation)이 지정한 수와 정확히 일치하게 비축을 맞춘다
  state.resources.muskets = counts.muskets;
  state.resources.hornBows = counts.bows;
  state.resources.spears = counts.spears;
  const cannonSetting = options.cannonEmplacements ?? 0;
  const cannonCount = Math.max(0, Math.min(8, Math.round(
    pick(cannonSetting, () => Math.floor(rng() * 5)),
  )));
  state.cannonsGranted = Math.max(state.cannonsGranted, cannonCount);
  for (let i = 0; i < cannonCount; i++) {
    state.buildings.push({
      id: state.nextBuildingId++,
      type: 'cannonEmplacement',
      x: 0,
      y: 0,
      progress: 999,
      built: true,
      fieldGrowth: 0,
    });
  }
  state.resources.gunpowder = counts.muskets > 0 || cannonCount > 0
    ? Math.max(10, cannonCount * CONFIG.raid.powderPerCannon, state.resources.gunpowder)
    : 0;

  const factionName = pick(options.factionName, () =>
    BATTLE_SIMULATION_ENEMIES[Math.floor(rng() * BATTLE_SIMULATION_ENEMIES.length)].name);
  const mode = pick(options.mode, () => (rng() < 0.5 ? 'garrison' : 'levy'));
  const warned = pick(options.warned, () => rng() < 0.5);
  const siege = pick(options.siege, () => rng() < 0.35);
  const rolledPower = pick(options.power, () =>
    factionName === '조정 토벌군' ? 140 + rng() * 40 : 55 + rng() * 45);
  // 토벌군은 낮은 수치를 골라도 정예 상비군 편제 자체가 무너지지 않도록 최소 전력을 보장한다.
  const power = factionName === '조정 토벌군'
    ? Math.max(120, Math.round(rolledPower))
    : Math.round(rolledPower);

  const battle = createTacticalBattle(state, { factionName, power, warned, siege, mode });
  if (options.prepPoints !== 'auto') {
    const points = pick(options.prepPoints, () => Math.floor(rng() * (CONFIG.tacticalBattle.prep.max + 1)));
    battle.prepPoints = Math.max(0, Math.min(CONFIG.tacticalBattle.prep.max, Math.round(points)));
  }
  addLog(state, '전투 시뮬레이션 — 이 전투의 결과는 저장되지 않습니다.', 'info');
  return state;
}
