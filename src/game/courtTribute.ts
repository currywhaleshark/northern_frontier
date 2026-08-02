// 조정 세공(歲貢) — 해마다 한양 조정에 바치는 공물.
// 봄 첫날 그해 요구량이 공지되어 세 계절 동안 준비하고, 겨울 첫날 사자가 도착해 거둬 간다.
// 바치면 명성이 오르고(격년 하사품), 못 바치면 명성이 크게 떨어지며 국경이 험악해진다.
import { withJosa } from './josa';
import { recordAnnals } from './annals';
import { CONFIG } from './config';
import { RESOURCE_NAMES } from './constants';
import { rollCourtGrantArtifact, rollCourtGrantRewards } from './courtGrants';
import { addLog } from './events';
import { markGuideSeen, openGuideFollowUp } from './guides';
import { makeRng } from './map';
import { acquireLivestock, LIVESTOCK_DEFS } from './livestock';
import { rankEffects } from './promotion';
import { RESOURCE_DEFS } from './resourceCatalog';
import { scenarioActive } from './scenario';
import { lowerSuspicion } from './suspicion';
import { getSeason, getYear } from './seasons';
import { grantSpecialItem, SPECIAL_ITEM_DEFS } from './specialItems';
import { BORDER_COMMANDER_TITLE } from './diplomaticFigures';
import {
  consumeTributeReserve, releaseTributeReserve, tributeReserveRatio,
} from './tributeReserve';
import type { CourtTribute, GameState, Rank, ResourceId } from './types';

const TRIBUTE_POOL = Object.keys(CONFIG.tribute.baseAmounts) as ResourceId[];

// 연차·인구·승격 단계에 따른 요구량 배율 (승격할수록 조정의 요구가 무거워진다)
export function tributeScale(year: number, population: number, rank: Rank = 'settlement'): number {
  const t = CONFIG.tribute;
  return (1 + t.yearScale * (year - 1)) * (t.popScaleBase + population / t.popScaleDiv) * rankEffects(rank).tribute;
}

// 그해 세공 요구 — 시드+연차만으로 결정적 (불러오기 시 재생성 가능)
export function rollCourtTribute(seed: number, year: number, population: number, rank: Rank = 'settlement'): CourtTribute {
  const t = CONFIG.tribute;
  const rng = makeRng(seed + year * 6007 + 11);
  const itemCount = year <= 1 ? 1 : rng() < 0.5 ? 1 : 2; // 1년차는 가볍게 한 품목
  const pool = [...TRIBUTE_POOL];
  const scale = tributeScale(year, population, rank);
  const items: Partial<Record<ResourceId, number>> = {};
  for (let i = 0; i < itemCount; i++) {
    const res = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    items[res] = Math.max(1, Math.round((t.baseAmounts[res as keyof typeof t.baseAmounts] ?? 0) * scale));
  }
  const dueDay = (year - 1) * CONFIG.time.yearDays + CONFIG.time.seasonDays * 3 + 1; // 겨울 첫날
  return { year, items, dueDay, resolved: false, paid: false };
}

export function tributeItemsLabel(items: CourtTribute['items']): string {
  return Object.entries(items)
    .map(([res, amt]) => `${RESOURCE_NAMES[res as ResourceId]} ${amt}`)
    .join(', ');
}

export function maybeOpenCourtTributeAnnouncement(state: GameState): boolean {
  const pendingYear = state.tributeAnnouncementPendingYear;
  if (pendingYear == null || state.pendingChoice) return false;
  const tribute = state.courtTribute;
  if (!tribute || tribute.resolved || tribute.year !== pendingYear) {
    state.tributeAnnouncementPendingYear = undefined;
    return false;
  }
  const label = tributeItemsLabel(tribute.items);
  const isFirstTribute = tribute.year === CONFIG.tribute.firstYear &&
    state.tributePaidStreak === 0 && state.tributeFailStreak === 0;
  state.pendingChoice = {
    kind: 'tributeAnnouncement',
    title: `${state.borderCommander.name} 북병사의 파발 — ${tribute.year}년차 세공`,
    body:
      `${BORDER_COMMANDER_TITLE} ${state.borderCommander.name}의 명을 받은 파발이 올해 세공 문서를 전했습니다.\n` +
      `요구: ${label}\n` +
      `기한: ${tribute.year}년차 겨울 첫날\n\n` +
      '상단의 세공 표시나 조정 창에서 준비 상황을 확인하고, 겨울이 오기 전까지 세공고에 몫을 비축하십시오.',
    illustration: {
      src: '/assets/events/court-tribute-dispatch-v1.png',
      alt: '봄 눈이 녹는 북방 개척지의 관문 앞에서 말을 탄 파발이 세공 공문을 건네는 모습',
    },
    options: [{
      id: 'acknowledge',
      label: '명을 받들겠소',
      desc: '조정 창과 상단 세공 표시에서 올해 요구량과 비축량을 확인할 수 있습니다.',
    }],
    data: { year: tribute.year, firstTribute: isFirstTribute },
  };
  state.tributeAnnouncementPendingYear = undefined;
  return true;
}

export function resolveCourtTributeAnnouncement(state: GameState): void {
  const firstTribute = state.pendingChoice?.kind === 'tributeAnnouncement' &&
    state.pendingChoice.data.firstTribute === true;
  state.pendingChoice = null;
  if (!firstTribute) return;
  markGuideSeen(state, 'tribute');
  openGuideFollowUp(state, 'tribute');
}

export function canPayTribute(state: GameState, tribute: CourtTribute): boolean {
  return tributeReserveRatio(state, tribute) >= 1;
}

// 은 대납 비용 — 요구 품목의 교역 가치 총합을 은 시세로 환산하고 웃돈을 얹는다
export function tributeSilverCost(tribute: CourtTribute): number {
  const totalValue = Object.entries(tribute.items).reduce(
    (sum, [res, amt]) => sum + (amt ?? 0) * RESOURCE_DEFS[res as ResourceId].tradeBaseValue,
    0,
  );
  return Math.max(1, Math.ceil(totalValue * CONFIG.tribute.silverPayMarkup / RESOURCE_DEFS.silver.tradeBaseValue));
}

export function hasLenientTributeGrace(state: Pick<GameState, 'borderCommander'>): boolean {
  return state.borderCommander.temper === 'lenient' && !state.borderCommander.tributeLeniencyUsed;
}

/**
 * 길잡이의 첫 세공은 가죽옷으로 고정한다 — 세공 스텝에서 무두장이·가죽공방 스텝으로
 * 곧장 잇기 위함이다. 수량은 일반 롤과 같은 셈(품목 기준량 × 연차·인구·승격 배율)이라
 * 난이도는 건드리지 않는다.
 *
 * R5에서 판정을 `tutorialGraduate`(완주 표식)에서 `길잡이 중이거나 완주했거나`로 넓혔다.
 * 튜토리얼이 둘째 해까지 이어지면서 파발이 **시나리오가 도는 동안** 오게 되었기 때문이다.
 * (완주 표식은 시나리오가 걷힐 때 서므로, 진행 중에는 아직 false다)
 */
function tributeItemIsGuided(state: GameState): boolean {
  return state.tutorialGraduate === true || scenarioActive(state);
}

function firstGraduateTributeItems(state: GameState, year: number, pop: number): Partial<Record<ResourceId, number>> {
  const scale = tributeScale(year, pop, state.rank);
  return { hideClothes: Math.max(1, Math.round(CONFIG.tribute.baseAmounts.hideClothes * scale)) };
}

// 봄 첫날: 올해 세공 공지 (첫 해는 거두지 않는다 — CONFIG.tribute.firstYear)
export function announceCourtTribute(state: GameState): void {
  releaseTributeReserve(state);
  const year = getYear(state.day);
  if (year < CONFIG.tribute.firstYear) {
    // 첫 해는 정착이 우선 — 요구 없이 예고만 남긴다. 겨울 수거도 courtTribute가 없어 일어나지 않는다.
    state.courtTribute = null;
    addLog(
      state,
      '조정은 첫 해의 정착을 지켜보고 있습니다. ' +
        '이듬해부터는 소출의 일부를 세공으로 바쳐야 합니다.',
      'info',
      true,
    );
    return;
  }
  // "이 게임의 첫 세공"은 아직 한 해분도 공지된 적이 없다는 뜻이다 — 첫 해 공지가 null을
  // 남기므로 연차를 세지 않아도 알 수 있고, 길잡이를 늦게 마친 게임에서도 어긋나지 않는다.
  const isFirstTribute = state.courtTribute == null;
  const pop = state.residents.filter(r => r.alive).length;
  const tribute = rollCourtTribute(state.seed, year, pop, state.rank);
  if (tributeItemIsGuided(state) && isFirstTribute) {
    tribute.items = firstGraduateTributeItems(state, year, pop);
  }
  state.courtTribute = tribute;
  addLog(
    state,
    `${BORDER_COMMANDER_TITLE} ${state.borderCommander.name} 명의의 파발이 왔습니다. ` +
      `올해 세공: ${tributeItemsLabel(state.courtTribute.items)} — 겨울이 오기 전까지 준비하십시오.`,
    'info',
    true,
  );
  // 매해 중요한 공지라 로그에 묻히지 않게 삽화 창을 띄운다.
  // 다른 선택지가 자리를 차지했으면 해소 직후까지 연차를 기억한다.
  state.tributeAnnouncementPendingYear = year;
  maybeOpenCourtTributeAnnouncement(state);
}

// 겨울 첫날(또는 모달 충돌 시 그 다음 날): 조정의 사자가 세공을 거두러 온다
export function openCourtTributeChoice(state: GameState): void {
  const tribute = state.courtTribute;
  if (!tribute || tribute.resolved) return;
  const t = CONFIG.tribute;
  const label = tributeItemsLabel(tribute.items);
  const preparedRatio = tributeReserveRatio(state, tribute);
  const failStreakNext = state.tributeFailStreak + 1;
  const repLoss = t.repFail + (failStreakNext >= 2 ? t.repFailStreakExtra : 0);
  const lenientGrace = hasLenientTributeGrace(state);

  state.pendingChoice = {
    kind: 'tribute',
    title: `${state.borderCommander.name} 북병사의 사자 — 세공 수거`,
    body:
      `${BORDER_COMMANDER_TITLE} ${state.borderCommander.name}의 명을 받은 사자가 당도했습니다. ` +
      `올해 세공을 거두러 왔습니다.\n` +
      `요구: ${label}`,
    illustration: {
      src: '/assets/events/court-tribute-v1.png',
      alt: '눈 덮인 개척지에서 곡물과 가죽 세공품을 검사하는 조정 관리들',
    },
    options: [
      {
        id: 'pay-full',
        label: '세공을 모두 바친다',
        desc: `${label} 납부. 명성 +${t.repPaid}. 성실히 바치면 격년으로 조정의 하사품이 내려옵니다.`,
        disabled: preparedRatio < 1,
        disabledReason: preparedRatio < 1 ? '세공고 준비량이 부족합니다' : undefined,
      },
      {
        id: 'pay-partial',
        label: '준비한 만큼 바친다',
        desc: `현재 준비율 ${(preparedRatio * 100).toFixed(0)}%. 모자란 비율만큼 명성과 위협 불이익을 받습니다.`,
        disabled: preparedRatio <= 0 || preparedRatio >= 1,
        disabledReason: preparedRatio <= 0 ? '세공고에 준비한 물자가 없습니다'
          : preparedRatio >= 1 ? '전량 납부가 준비되었습니다' : undefined,
      },
      {
        id: 'pay-silver',
        label: '은으로 대납한다',
        desc: `은 ${withJosa(tributeSilverCost(tribute), '을/를')} 한 번에 치릅니다. 명성 +${t.repPaid + t.silverPayRepBonus}, ` +
          '은까지 바치는 성실함에 조정의 의심이 깊이 씻깁니다.',
        disabled: (state.resources.silver ?? 0) < tributeSilverCost(tribute),
        disabledReason: (state.resources.silver ?? 0) < tributeSilverCost(tribute) ? '은이 부족합니다' : undefined,
      },
      {
        id: 'use-waiver-decree',
        label: '교지를 내보인다',
        desc: '면세 교지 1장을 내어 올해 세공을 면제받습니다. 명성이나 하사품은 없습니다.',
        disabled: (state.specialItems.tributeWaiverDecree ?? 0) < 1,
        disabledReason: (state.specialItems.tributeWaiverDecree ?? 0) < 1 ? '내보일 면세 교지가 없습니다' : undefined,
      },
      {
        id: 'refuse',
        label: '올해는 바치지 못한다',
        desc: lenientGrace
          ? '현 북병사가 변방 사정을 참작해 이번 임기 한 번은 불이행의 문책을 유예합니다. 성실 납부로 인정되지는 않습니다.'
          : `명성 -${repLoss}, 위협 +${t.threatFail}. 조정의 눈 밖에 나고 국경이 험악해집니다.`,
      },
    ],
    data: { year: tribute.year },
  };
}

function grantFullTributeReward(state: GameState, tribute: CourtTribute): void {
  if (tribute.year % 2 !== 0) return;
  const rewards = rollCourtGrantRewards(state, tribute.year);
  const labels: string[] = [];
  for (const reward of rewards) {
    if ('resource' in reward) {
      state.resources[reward.resource] = (state.resources[reward.resource] ?? 0) + reward.amount;
      labels.push(`${RESOURCE_NAMES[reward.resource]} ${reward.amount}`);
      continue;
    }
    const error = acquireLivestock(state, reward.species, reward.amount);
    if (error) {
      addLog(state, `조정의 ${LIVESTOCK_DEFS[reward.species].name} 하사품을 들이지 못했습니다: ${error}`, 'bad', true);
      continue;
    }
    labels.push(`${LIVESTOCK_DEFS[reward.species].name} ${reward.amount}마리`);
  }
  const artifact = rollCourtGrantArtifact(state, tribute.year);
  if (artifact.item) {
    const isFirstJijaChongtong = artifact.item === 'jijaChongtong' && (state.specialItems.jijaChongtong ?? 0) < 1;
    grantSpecialItem(state, artifact.item);
    if (isFirstJijaChongtong) {
      state.resources.gunpowder += CONFIG.courtGrants.jijaChongtongPowderAward;
      labels.push(`지자총통용 화약 ${CONFIG.courtGrants.jijaChongtongPowderAward}`);
    }
    state.courtGrantArtifactMisses = 0;
    labels.push(SPECIAL_ITEM_DEFS[artifact.item].name);
  } else if (artifact.eligible) {
    state.courtGrantArtifactMisses += 1;
  }
  if (labels.length === 0) return;
  const label = labels.join(', ');
  addLog(
    state,
    `${withJosa(`북병사 ${state.borderCommander.name}`, '이/가')} 전한 교지와 함께 하사품이 내려왔습니다. ` +
      `받은 물목: ${label}.`,
    'good',
    true,
  );
  recordAnnals(
    state,
    'grant',
    `${withJosa(`북병사 ${state.borderCommander.name}`, '이/가')} 전한 교지와 함께 하사품이 내려왔습니다 — ${label}.`,
  );
  state.lifetimeStats.grantsReceived++; // 하사 행사 1회 (품목 수는 세지 않는다)
}

/**
 * 조정이 허한 면제는 실제 납부와 달리 명성·하사품을 주지 않는다. 산삼/해동청
 * 면제권과 하사 면세 교지가 같은 결산 경로를 써서 연속 납부만 유지하게 한다.
 */
export function resolveTributeWaiver(
  state: GameState,
  source: 'legacy' | 'tributeWaiverDecree',
): boolean {
  const tribute = state.courtTribute;
  if (!tribute || tribute.resolved) return false;
  if (source === 'legacy') {
    if (state.tributeWaivers < 1) return false;
    state.tributeWaivers -= 1;
  } else {
    if ((state.specialItems.tributeWaiverDecree ?? 0) < 1) return false;
    state.specialItems.tributeWaiverDecree -= 1;
  }
  releaseTributeReserve(state);
  tribute.paid = true;
  tribute.resolved = true;
  state.tributeFailStreak = 0;
  state.tributePaidStreak += 1;
  lowerSuspicion(state, CONFIG.suspicion.tributeDecay);
  if (state.pendingChoice?.kind === 'tribute') state.pendingChoice = null;
  addLog(
    state,
    source === 'legacy'
      ? '산삼 진상의 공으로 올해 세공이 면제되었습니다. 조정은 이를 성실 납부로 인정했습니다.'
      : '조정의 면세 교지를 내보여 올해 세공을 면제받았습니다. 성실 납부는 유지되지만 별도 하사품은 없습니다.',
    'good',
    true,
  );
  return true;
}

// 세공 선택 처리 — 효과 적용 + resolved 표시 + 모달 해제
export function resolveCourtTribute(state: GameState, optionId: string): void {
  const c = state.pendingChoice;
  if (!c || c.kind !== 'tribute') return;
  const tribute = state.courtTribute;
  if (!tribute || tribute.resolved) return;
  if (optionId === 'use-waiver-decree') {
    if (resolveTributeWaiver(state, 'tributeWaiverDecree')) state.pendingChoice = null;
    return;
  }
  state.pendingChoice = null;
  const t = CONFIG.tribute;
  if (optionId === 'pay') optionId = 'pay-full';
  tribute.resolved = true;

  if (optionId === 'pay-silver' && (state.resources.silver ?? 0) >= tributeSilverCost(tribute)) {
    state.resources.silver -= tributeSilverCost(tribute);
    releaseTributeReserve(state);
    tribute.paid = true;
    state.tributeFailStreak = 0;
    state.tributePaidStreak += 1;
    state.resources.reputation = Math.min(100, state.resources.reputation + t.repPaid + t.silverPayRepBonus);
    lowerSuspicion(state, CONFIG.suspicion.tributeDecay * t.silverPaySuspicionDecayMult);
    addLog(state, '세공을 은으로 대납했습니다. 사자는 은궤의 무게를 달아 보고는 흡족히 돌아갔습니다.', 'good', true);
    grantFullTributeReward(state, tribute);
    return;
  }

  if (optionId === 'pay-full' && canPayTribute(state, tribute)) {
    consumeTributeReserve(state, tribute);
    releaseTributeReserve(state);
    tribute.paid = true;
    state.tributeFailStreak = 0;
    state.tributePaidStreak += 1; // 승격 조건의 "공물 성실도"
    state.resources.reputation = Math.min(100, state.resources.reputation + t.repPaid);
    lowerSuspicion(state, CONFIG.suspicion.tributeDecay); // 성실한 납부는 모반 의심을 씻는다
    addLog(state, '세공을 온전히 바쳤습니다. 조정이 개척지의 공을 기억할 것입니다.', 'good', true);
    grantFullTributeReward(state, tribute);
    return;
  }

  if (optionId === 'pay-partial' && tributeReserveRatio(state, tribute) > 0) {
    const ratio = consumeTributeReserve(state, tribute);
    releaseTributeReserve(state);
    tribute.paid = false;
    state.tributePaidStreak = 0;
    if (ratio >= t.partialFailStreakAvoidRatio) state.tributeFailStreak = 0;
    else state.tributeFailStreak += 1;
    const missing = 1 - ratio;
    const streakExtra = state.tributeFailStreak >= 2 ? t.repFailStreakExtra : 0;
    const repLoss = Math.round((t.repFail + streakExtra) * missing);
    const threatGain = Math.round(t.threatFail * missing);
    state.resources.reputation = Math.max(0, state.resources.reputation - repLoss);
    state.threat = Math.min(100, state.threat + threatGain);
    lowerSuspicion(state, CONFIG.suspicion.tributeDecay * ratio * t.partialSuspicionDecayMult);
    addLog(
      state,
      `준비한 만큼 세공을 바쳤습니다. 납부율 ${(ratio * 100).toFixed(0)}%. 성실 납부로 인정되지는 않습니다.`,
      'bad',
      true,
    );
    return;
  }

  if (optionId === 'refuse' && hasLenientTributeGrace(state)) {
    releaseTributeReserve(state);
    tribute.paid = false;
    state.borderCommander.tributeLeniencyUsed = true;
    state.tributePaidStreak = 0;
    state.tributeFailStreak = 0;
    addLog(
      state,
      `${withJosa(`북병사 ${state.borderCommander.name}`, '이/가')} 변방 사정을 참작해 ` +
        '올해 세공 불이행의 문책을 유예했습니다. 성실 납부로 인정되지는 않습니다.',
      'info',
      true,
    );
    return;
  }

  // 미납 — 명성 하락(연속이면 가중), 위협 상승, 성실도 초기화
  releaseTributeReserve(state);
  state.tributeFailStreak += 1;
  state.tributePaidStreak = 0;
  const repLoss = t.repFail + (state.tributeFailStreak >= 2 ? t.repFailStreakExtra : 0);
  state.resources.reputation = Math.max(0, state.resources.reputation - repLoss);
  state.threat = Math.min(100, state.threat + t.threatFail);
  addLog(
    state,
    state.tributeFailStreak >= 2
      ? '두 해 연속 세공을 바치지 못했습니다. 조정의 눈 밖에 났고, 변방의 소문이 흉흉해집니다.'
      : '올해 세공을 바치지 못했습니다. 조정의 눈 밖에 났습니다.',
    'bad',
    true,
  );
}

// 매일 검사: 겨울이고 올해분이 미처리이며 다른 모달/전투가 없으면 수거 모달을 연다.
// (겨울 진입 시점에 습격 모달이 떠 있을 수 있어 계절 훅 대신 매일 검사한다)
export function maybeCollectTribute(state: GameState): void {
  if (getSeason(state.day) !== 'winter') return;
  if (!state.courtTribute || state.courtTribute.resolved) return;
  if (state.pendingChoice || state.battle) return;
  if (state.tributeWaivers > 0) {
    resolveTributeWaiver(state, 'legacy');
    return;
  }
  openCourtTributeChoice(state);
}
