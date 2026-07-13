// 전투 시뮬레이션 모드 — 메인 메뉴에서 전술 전투만 따로 테스트한다.
// 격리된 샌드박스 GameState를 만들어 지정/랜덤 조건으로 createTacticalBattle을 연다.
// 결과는 저장되지 않고, 전투가 끝나면 메뉴로 돌아간다.
import { CONFIG } from './config';
import { FACTIONS } from './constants';
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
  power: SimSetting<number>;          // 적 전력 (15~90 권장)
  warned: SimSetting<boolean>;        // 경보 여부
  siege: SimSetting<boolean>;         // 방책 공성 여부
  season: SimSetting<Season>;
  weather: SimSetting<WeatherId>;
  prepPoints: SimSetting<number> | 'auto'; // 'auto'면 기존 규칙대로 계산
  defenders: SimSetting<BattleSimDefenderCounts>;
  seed?: number;
}

const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
const WEATHERS: WeatherId[] = ['clear', 'rain', 'frost', 'heavySnow', 'blizzard', 'coldSnap', 'thawFlood'];

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
  state.resources.gunpowder = counts.muskets > 0 ? Math.max(10, state.resources.gunpowder) : 0;

  const factionName = pick(options.factionName, () => FACTIONS[Math.floor(rng() * FACTIONS.length)].name);
  const mode = pick(options.mode, () => (rng() < 0.5 ? 'garrison' : 'levy'));
  const warned = pick(options.warned, () => rng() < 0.5);
  const siege = pick(options.siege, () => rng() < 0.35);
  const power = Math.round(pick(options.power, () => 20 + rng() * 50));

  const battle = createTacticalBattle(state, { factionName, power, warned, siege, mode });
  if (options.prepPoints !== 'auto') {
    const points = pick(options.prepPoints, () => Math.floor(rng() * (CONFIG.tacticalBattle.prep.max + 1)));
    battle.prepPoints = Math.max(0, Math.min(CONFIG.tacticalBattle.prep.max, Math.round(points)));
  }
  addLog(state, '전투 시뮬레이션 — 이 전투의 결과는 저장되지 않습니다.', 'info');
  return state;
}
