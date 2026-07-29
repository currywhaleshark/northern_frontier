// 승격 사다리 — 개척지 → 보(堡) → 진(鎭) → 부(府).
// 옛 "승리 조건" 충족은 이제 끝이 아니라 첫 계단(보 승격)이고, 부 승격이 최종 승리다.
// 승격할수록 이주민이 늘고, 국경 너머의 눈길(위협)과 조정의 세공 요구도 무거워진다.
import { CONFIG } from './config';
import { endGame, recordAnnals } from './annals';
import { BUILDING_DEFS, countBuilt } from './buildings';
import { RANK_NAMES, RANK_ORDER } from './constants';
import { addLog } from './events';
import { withJosa } from './josa';
import { foodTotal, fuelHeatTotal } from './consumption';
import { livingResidents } from './residents';
import type { BuildingTypeId, GameState, Rank, SpecialItemId } from './types';

export { RANK_ORDER };

export type PromotionRank = Exclude<Rank, 'settlement'>;

export function nextRank(rank: Rank): PromotionRank | null {
  const idx = RANK_ORDER.indexOf(rank);
  return idx >= 0 && idx < RANK_ORDER.length - 1 ? RANK_ORDER[idx + 1] as PromotionRank : null;
}

// 현재 승격 단계의 효과 배율 (이주민 유입 / 위협 증가 / 세공 요구량)
export function rankEffects(rank: Rank | undefined) {
  return CONFIG.ranks.effects[rank ?? 'settlement'];
}

const PROMOTION_DECREE_ITEMS: Record<PromotionRank, SpecialItemId> = {
  bo: 'boDecree',
  jin: 'jinDecree',
  bu: 'buDecree',
};

export function promotionDecreeItem(rank: PromotionRank): SpecialItemId {
  return PROMOTION_DECREE_ITEMS[rank];
}

export function hasPromotionDecree(state: GameState, rank: PromotionRank): boolean {
  return (state.specialItems[promotionDecreeItem(rank)] ?? 0) > 0;
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
      [foodTotal(state) >= v.food, `식량 ${v.food} 비축 (현재 ${Math.floor(foodTotal(state))})`],
      [fuelHeatTotal(state) >= v.firewood, `땔감 ${v.firewood} 비축 (현재 ${Math.floor(fuelHeatTotal(state))})`],
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

// 매일 호출: 조건을 모두 채우면 승격 자체가 아니라 조정의 교지 수령 이벤트를 연다.
// 교지는 기물함에 영구 보관되며, 플레이어가 중심지를 업그레이드해야 실제 승격한다.
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
  if (unmet.length > 0) return;
  if (hasPromotionDecree(state, target)) {
    state.victoryProgressNote = `${RANK_NAMES[target]} 승격 교지 수령 완료 · 마을 중심지를 업그레이드하십시오`;
    return;
  }
  state.victoryProgressNote = `${RANK_NAMES[target]} 승격 조건 달성 · 조정의 교지를 기다리는 중`;
  if (state.pendingChoice || state.pendingPromotionNotice || state.gameOver) return;
  state.pendingChoice = {
    kind: 'promotionDecree',
    title: `${RANK_NAMES[target]} 승격 교지가 당도했습니다`,
    body:
      `조정의 사신이 시명지보가 찍힌 ${RANK_NAMES[target]} 승격 교지를 받들고 개척지에 도착했습니다.\n` +
      '교지를 상 위에 정중히 안치하자 첨사와 관속들이 남쪽 한양을 향해 숙배하고 왕명에 사은합니다.\n' +
      '의례를 마치면 교지는 기물함에 영구 보관되며, 마을 중심지를 새 위상에 맞게 업그레이드할 수 있습니다.',
    illustration: {
      src: '/assets/events/promotion-decree-v1.png',
      alt: '교지를 안치한 상 앞에서 남쪽 한양을 향해 숙배하는 변경의 관리들',
    },
    options: [{
      id: 'receive-decree',
      label: '교지를 받들다',
      desc: `숙배와 사은을 마치고 ${RANK_NAMES[target]} 승격 교지를 기물함에 보관합니다.`,
    }],
    data: { targetRank: target },
  };
}

export function resolvePromotionDecreeChoice(state: GameState, optionId: string): void {
  const choice = state.pendingChoice;
  if (!choice || choice.kind !== 'promotionDecree' || optionId !== 'receive-decree') return;
  const target = choice.data.targetRank;
  if (target !== 'bo' && target !== 'jin' && target !== 'bu') return;
  const item = promotionDecreeItem(target);
  state.specialItems[item] = Math.max(1, state.specialItems[item] ?? 0);
  if (!state.discoveredSpecialItems.includes(item)) state.discoveredSpecialItems.push(item);
  state.pendingChoice = null;
  state.victoryProgressNote = `${RANK_NAMES[target]} 승격 교지 수령 완료 · 마을 중심지를 업그레이드하십시오`;
  addLog(state, `${RANK_NAMES[target]} 승격 교지를 받들어 기물함에 영구 보관했습니다. 중심지를 업그레이드하면 승격합니다.`, 'good', true);
}

export function centerPromotionUpgradeReason(state: GameState, buildingId: number): string | null {
  const center = state.buildings.find(building => building.id === buildingId);
  if (!center || center.type !== 'center') return '마을 중심지가 아닙니다';
  if (!center.built) return '중심지가 완공되지 않았습니다';
  const target = nextRank(state.rank);
  if (!target) return '이미 부(府)까지 승격했습니다';
  if (!hasPromotionDecree(state, target)) return `${RANK_NAMES[target]} 승격 교지가 필요합니다`;
  if (state.pendingPromotionNotice) return '먼저 승격 안내를 확인하십시오';
  return null;
}

export function upgradeSettlementCenter(state: GameState, buildingId: number): string | null {
  const reason = centerPromotionUpgradeReason(state, buildingId);
  if (reason) return reason;
  const target = nextRank(state.rank);
  if (!target) return '더 승격할 단계가 없습니다';
  promote(state, target);
  return null;
}

function promote(state: GameState, target: PromotionRank): void {
  state.rank = target;
  state.pendingPromotionNotice = target;
  state.resources.reputation = Math.min(100, state.resources.reputation + CONFIG.ranks.promotionReputation);
  // 승격 직후 완충 — 새 기대 항목이 미충족으로 들어와도 잔치 분위기가 첫 며칠을 받쳐 준다
  state.promotionCheerUntil = state.day + CONFIG.satisfaction.promotionCheerDays;

  if (target === 'bo') {
    addLog(state, '조정이 개척지를 보(堡)로 승격하였습니다! 첨사의 이름이 한양까지 알려집니다.', 'good', true);
    addLog(state, '보 승격으로 온돌집·채광장·나루터·논·방앗간과 어부·방아꾼이 열렸습니다.', 'good');
    addLog(state, '보가 되니 남쪽에서 사람이 모여들지만, 부유해진 만큼 국경 너머의 눈길도 잦아집니다. 조정의 세공도 무거워질 것입니다.', 'info');
    recordAnnals(state, 'promotion', `${withJosa(state.settlementName, '이/가')} 보(堡)로 승격되었습니다.`, 'promotion:bo');
  } else if (target === 'jin') {
    addLog(state, '조정이 보를 진(鎭)으로 승격하였습니다! 첨사는 이제 첨절제사라 불립니다.', 'good', true);
    addLog(state, '진 승격으로 기와집·토성·숯가마·축사·의원과 숯쟁이·목동·의원이 열렸습니다.', 'good');
    addLog(state, '진이 된 마을은 변경 방어의 요충이 되었습니다. 조정의 기대와 세공 요구가 한층 무거워집니다.', 'info');
    recordAnnals(state, 'promotion', `${withJosa(state.settlementName, '이/가')} 진(鎭)으로 승격되었습니다.`, 'promotion:jin');
  } else if (target === 'bu') {
    addLog(state, '부(府) 승격 — 개척의 대업이 완성되었습니다!', 'good', true);
    addLog(state, '부 승격으로 염초장·석벽·관청·부두와 염초장이·아전 직업이 열렸습니다.', 'good');
    recordAnnals(state, 'promotion', `${withJosa(state.settlementName, '이/가')} 부(府)로 승격되었습니다 — 개척의 대업이 완성되었습니다.`, 'promotion:bu');
  }
}

export function acknowledgePromotionNotice(state: GameState): void {
  const target = state.pendingPromotionNotice;
  if (!target) return;
  state.pendingPromotionNotice = null;
  if (target !== 'bu') return;
  endGame(
    state,
    true,
    '변방의 작은 개척지가 마침내 큰 고을, 부(府)로 승격되었습니다. ' +
      '조정은 당신의 공을 사서에 남기게 하였고, 두만강 이북의 혹한도 이 고을의 등불을 끄지 못할 것입니다. ' +
      '원한다면 승리 이후에도 개척을 계속 이어갈 수 있습니다.',
  );
}
