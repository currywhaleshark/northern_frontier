// 승격 사다리 — 개척지 → 보(堡) → 진(鎭) → 부(府).
// 옛 "승리 조건" 충족은 이제 끝이 아니라 첫 계단(보 승격)이고, 부 승격이 최종 승리다.
// 승격할수록 이주민이 늘고, 국경 너머의 눈길(위협)과 조정의 세공 요구도 무거워진다.
import { CONFIG } from './config';
import { BUILDING_DEFS, countBuilt } from './buildings';
import { RANK_NAMES, RANK_ORDER } from './constants';
import { addLog } from './events';
import { livingResidents } from './residents';
import type { BuildingTypeId, GameState, Rank } from './types';

export { RANK_ORDER };

export function nextRank(rank: Rank): Rank | null {
  const idx = RANK_ORDER.indexOf(rank);
  return idx >= 0 && idx < RANK_ORDER.length - 1 ? RANK_ORDER[idx + 1] : null;
}

// 현재 승격 단계의 효과 배율 (이주민 유입 / 위협 증가 / 세공 요구량)
export function rankEffects(rank: Rank | undefined) {
  return CONFIG.ranks.effects[rank ?? 'settlement'];
}

// 다음 승격의 요구 조건 목록 — [충족 여부, 표시 문구]
export function promotionConditions(state: GameState, target: Rank): [boolean, string][] {
  const living = livingResidents(state).length;

  if (target === 'bo') {
    // 첫 승격은 기존 승리 조건 그대로
    const v = CONFIG.victory;
    const yearsSurvived = (state.day - 1) / CONFIG.time.yearDays;
    return [
      [yearsSurvived >= v.years, `${v.years}년 생존 (${yearsSurvived.toFixed(1)}년)`],
      [living >= v.population, `인구 ${v.population}명 (현재 ${living}명)`],
      [state.lastWinterDeathRate <= v.maxWinterDeathRate, `겨울 사망률 10% 이하 (직전 ${(state.lastWinterDeathRate * 100).toFixed(0)}%)`],
      [state.resources.defense >= v.defense, `방어도 ${v.defense} (현재 ${state.resources.defense})`],
      [state.resources.food >= v.food, `식량 ${v.food} 비축 (현재 ${Math.floor(state.resources.food)})`],
      [state.resources.firewood >= v.firewood, `장작 ${v.firewood} 비축 (현재 ${Math.floor(state.resources.firewood)})`],
      [countBuilt(state, 'beacon') > 0, '봉수대 건설'],
      [countBuilt(state, 'garrison') > 0, '군영 건설'],
    ];
  }

  const req = target === 'jin' ? CONFIG.ranks.jin : CONFIG.ranks.bu;
  return [
    [living >= req.population, `인구 ${req.population}명 (현재 ${living}명)`],
    [state.resources.defense >= req.defense, `방어도 ${req.defense} (현재 ${state.resources.defense})`],
    [state.tributePaidStreak >= req.tributeYears, `세공 ${req.tributeYears}년 연속 납부 (현재 ${state.tributePaidStreak}년)`],
    ...Object.entries(req.buildings).map(([type, n]): [boolean, string] => {
      const built = countBuilt(state, type as BuildingTypeId);
      return [built >= n, `${BUILDING_DEFS[type as BuildingTypeId].name} ${n}개 (현재 ${built}개)`];
    }),
  ];
}

// 매일 호출: 다음 승격 조건을 점검하고, 전부 충족하면 승격한다.
// 미충족 조건은 victoryProgressNote("다음 승격까지" 패널)에 남긴다.
export function checkPromotion(state: GameState): void {
  const target = nextRank(state.rank);
  if (!target) {
    state.victoryProgressNote = '';
    return;
  }
  // 모반 의심이 짙은 동안(강등 직후 포함) 조정은 승격을 논하지 않는다
  if (state.suspicion >= CONFIG.suspicion.crackdownClearBelow) {
    state.victoryProgressNote = '조정의 의심(모반 혐의)이 걷히기 전에는 승격을 논할 수 없습니다';
    return;
  }
  const conditions = promotionConditions(state, target);
  const unmet = conditions.filter(([ok]) => !ok);
  state.victoryProgressNote = unmet.map(([, txt]) => txt).join(' · ');
  if (unmet.length === 0) promote(state, target);
}

function promote(state: GameState, target: Rank): void {
  state.rank = target;
  state.resources.reputation = Math.min(100, state.resources.reputation + CONFIG.ranks.promotionReputation);

  if (target === 'bo') {
    addLog(state, '조정이 개척지를 보(堡)로 승격하였습니다! 첨사의 이름이 한양까지 알려집니다.', 'good');
    addLog(state, '보 승격으로 채광장·기와집·나루터와 채광꾼·어부가 열렸습니다.', 'good');
    addLog(state, '보가 되니 남쪽에서 사람이 모여들지만, 부유해진 만큼 국경 너머의 눈길도 잦아집니다. 조정의 세공도 무거워질 것입니다.', 'info');
  } else if (target === 'jin') {
    addLog(state, '조정이 보를 진(鎭)으로 승격하였습니다! 첨사는 이제 첨절제사라 불립니다.', 'good');
    addLog(state, '진 승격으로 토성·숯가마·축사와 숯쟁이·목동이 열렸습니다.', 'good');
    addLog(state, '진이 된 마을은 변경 방어의 요충이 되었습니다. 조정의 기대와 세공 요구가 한층 무거워집니다.', 'info');
  } else if (target === 'bu') {
    state.gameOver = {
      won: true,
      reason:
        '변방의 작은 개척지가 마침내 큰 고을, 부(府)로 승격되었습니다. ' +
        '조정은 당신의 공을 사서에 남기게 하였고, 두만강 이북의 혹한도 이 고을의 등불을 끄지 못할 것입니다. ' +
        '원한다면 승리 이후에도 개척을 계속 이어갈 수 있습니다.',
    };
    addLog(state, '부(府) 승격 — 개척의 대업이 완성되었습니다!', 'good');
    addLog(state, '부 승격으로 염초장·석벽·관청·부두와 염초장이·아전 직업이 열렸습니다.', 'good');
  }
}
