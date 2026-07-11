// 모반 의심 — 조정의 눈에 "변방 수령이 딴마음을 품었는가" (0~100).
// 화약 자급(염초장), 조정 하사량을 넘는 화기 비축, 먼저 청하는 월경 교역,
// 북방 세력과의 지나친 유착이 의심을 올리고, 세공 납부·청원(조정과의 접촉)이 낮춘다.
// 40+ 감찰 어사 / 70+ 견책·몰수 / 100 강등과 토벌 유예 — 유예 안에 결백을 증명하지
// 못하면 조정 토벌군이 내려온다.
import { CONFIG } from './config';
import { applyBattleDefenseMultipliers, cannonBattleMult, consumeBattlePowder } from './battles';
import { countBuilt } from './buildings';
import { FACTIONS, RANK_NAMES, RANK_ORDER } from './constants';
import { addLog } from './events';
import { getRelation } from './relations';
import { consumeEdibleFood, edibleFoodTotal } from './resources';
import type { GameState, Rank } from './types';

export interface SuspicionFactor {
  id: string;
  label: string;
  delta: number; // 하루 변화량 (+상승 / -감소)
}

// 염초장이 실제로 가동 중인지 (토글/은닉 반영)
export function nitreYardsActive(state: GameState): number {
  if (state.nitrePaused || state.day < state.nitreHiddenUntil) return 0;
  return countBuilt(state, 'nitreYard');
}

// 최근 한 계절 안의 플레이어 주도 교역 성사 횟수
export function recentInitiatedTrades(state: GameState): number {
  const s = CONFIG.suspicion;
  return (state.initiatedTradeDays ?? []).filter(d => state.day - d < s.tradeWindowDays).length;
}

// 일일 의심 변화 요인 내역 — UI(조정 탭)와 일일 갱신이 같은 계산을 쓴다
export function suspicionBreakdown(state: GameState): SuspicionFactor[] {
  const s = CONFIG.suspicion;
  const factors: SuspicionFactor[] = [];

  const yards = nitreYardsActive(state);
  if (yards > 0) {
    factors.push({ id: 'nitre', label: `화약 자급 (염초장 ${yards}곳 가동)`, delta: yards * s.perNitreYard });
  }
  if (state.resources.gunpowder + state.resources.muskets > s.stockThreshold) {
    factors.push({ id: 'stock', label: '하사량을 넘는 화기 비축', delta: s.stockExtra });
  }
  const trades = recentInitiatedTrades(state);
  if (trades > 0) {
    factors.push({ id: 'trade', label: `월경 교역 (최근 먼저 청한 거래 ${trades}건)`, delta: trades * s.perInitiatedTrade });
  }
  let cozy = 0;
  for (const f of FACTIONS) {
    if (f.foreignTrade === false) continue;
    if (getRelation(state, f.name) >= s.cozyRelationAbove) cozy += f.hostile ? 2 : 1;
  }
  if (cozy > 0) {
    factors.push({ id: 'cozy', label: '북방 세력과의 유착 (관계 75 이상)', delta: cozy * s.perCozyFaction });
  }
  factors.push({ id: 'decay', label: '세월이 눈총을 씻는다', delta: -s.baseDecay });
  return factors;
}

export function lowerSuspicion(state: GameState, amount: number): void {
  state.suspicion = Math.max(0, state.suspicion - amount);
}

function demote(state: GameState): Rank {
  const idx = RANK_ORDER.indexOf(state.rank);
  const target = RANK_ORDER[Math.max(0, idx - 1)];
  state.rank = target;
  state.tributePaidStreak = 0; // 조정의 신뢰를 잃었다 — 성실도부터 다시 쌓아야 한다
  return target;
}

function seizeFirearms(state: GameState, ratio: number): string {
  const powder = state.resources.gunpowder * ratio;
  const muskets = Math.floor(state.resources.muskets * ratio);
  state.resources.gunpowder = Math.max(0, state.resources.gunpowder - powder);
  state.resources.muskets = Math.max(0, state.resources.muskets - muskets);
  const parts: string[] = [];
  if (powder > 0.1) parts.push(`화약 ${powder.toFixed(1)}`);
  if (muskets > 0) parts.push(`조총 ${muskets}정`);
  return parts.length > 0 ? parts.join(', ') : '없음';
}

// ── 감찰 어사 (의심 40+) ──

export function openInspection(state: GameState): void {
  const s = CONFIG.suspicion;
  const canBribe = edibleFoodTotal(state) >= s.bribeCost.food && state.resources.hide >= s.bribeCost.hide;
  const hasYards = countBuilt(state, 'nitreYard') > 0;
  state.pendingChoice = {
    kind: 'inspection',
    title: '감찰 어사 — 조정의 눈',
    body:
      '한양에서 감찰 어사가 내려왔습니다. 변방 수령이 화약을 만들고 오랑캐와 내통한다는\n' +
      `소문의 진위를 캐러 온 것입니다. (현재 모반 의심: ${Math.round(state.suspicion)})`,
    illustration: {
      src: '/assets/events/royal-inspection-v1.png',
      alt: '개척지 창고와 장부를 조사하는 감찰 어사와 서리',
    },
    options: [
      {
        id: 'bribe', label: '후하게 대접한다',
        desc: `식량 ${s.bribeCost.food}, 가죽 ${s.bribeCost.hide}을 들여 어사의 붓끝을 무디게 합니다. (의심 -${s.bribeDecay})`,
        disabled: !canBribe,
        disabledReason: '대접할 물자가 부족합니다',
      },
      {
        id: 'hide', label: '염초장을 감춘다',
        desc: hasYards
          ? `염초장을 ${s.hideDays}일간 세워 두고 흔적을 지웁니다. (의심 -${s.hideDecay}, 그동안 화약 생산 중지)`
          : `감출 것이 없어도 며칠 몸을 사립니다. (의심 -${s.hideDecay})`,
      },
      {
        id: 'honest', label: '정직하게 보여준다',
        desc: '창고와 장부를 열어 보입니다. 명성이 높고 화기가 적으면 결백이 통하지만, 실패하면 의심이 커집니다.',
      },
    ],
    data: {},
  };
  addLog(state, '감찰 어사가 마을에 들었습니다. 조정이 이곳을 의심하고 있습니다.', 'bad', true);
}

export function resolveInspection(state: GameState, optionId: string, rng: () => number): void {
  const c = state.pendingChoice;
  if (!c || c.kind !== 'inspection') return;
  state.pendingChoice = null;
  const s = CONFIG.suspicion;

  if (optionId === 'bribe' &&
      edibleFoodTotal(state) >= s.bribeCost.food && state.resources.hide >= s.bribeCost.hide) {
    consumeEdibleFood(state, s.bribeCost.food);
    state.resources.hide -= s.bribeCost.hide;
    lowerSuspicion(state, s.bribeDecay);
    addLog(state, '어사는 후한 대접을 받고 좋은 장계를 올리기로 했습니다. 의심이 가라앉습니다.', 'good');
    return;
  }
  if (optionId === 'hide') {
    state.nitreHiddenUntil = state.day + s.hideDays;
    lowerSuspicion(state, s.hideDecay);
    addLog(state, `염초장의 불을 끄고 흔적을 지웠습니다. ${s.hideDays}일간 화약을 만들 수 없습니다.`, 'info');
    return;
  }
  // 정직하게 보여주기 — 명성과 화기 비축량에 따라 갈리는 도박
  const stockPenalty =
    state.resources.gunpowder + state.resources.muskets > s.stockThreshold ? 0.2 : 0;
  const successP = s.honestBase + state.resources.reputation / 200 - stockPenalty;
  if (rng() < successP) {
    lowerSuspicion(state, s.honestSuccessDecay);
    state.resources.reputation = Math.min(100, state.resources.reputation + 4);
    addLog(state, '어사가 장부와 창고를 살피고 고개를 끄덕였습니다. 결백이 통했습니다.', 'good');
  } else {
    state.suspicion = Math.min(100, state.suspicion + s.honestFailRise);
    state.resources.reputation = Math.max(0, state.resources.reputation - 6);
    addLog(state, '어사의 눈에 화약 궤짝이 들어왔습니다. 장계에 좋지 않은 말이 오를 것입니다.', 'bad');
  }
}

// ── 조정 토벌군 (유예 만료) ──

export function openCrackdown(state: GameState): void {
  const s = CONFIG.suspicion;
  state.pendingChoice = {
    kind: 'crackdown',
    title: '조정 토벌군 — 모반 혐의',
    body:
      '유예가 끝났습니다. 조정이 모반 혐의로 토벌군을 내려보냈습니다.\n' +
      '어떤 습격 무리보다 크고, 깃발에는 관군의 위엄이 서려 있습니다.\n' +
      `추정 규모: ${s.crackdownPower} / 현재 방어도: ${state.resources.defense}`,
    illustration: {
      src: '/assets/events/royal-crackdown-v1.png',
      alt: '눈 덮인 개척지 성책으로 진군하는 조정 토벌군',
    },
    options: [
      {
        id: 'surrender', label: '성문을 열고 결백을 빈다',
        desc: '화약과 조총을 모두 내놓고 처분을 기다립니다. 몰수와 굴욕으로 끝나지만 마을은 지킵니다.',
      },
      {
        id: 'fight', label: '맞서 싸운다',
        desc: '사실상의 모반입니다. 이기더라도 조정과는 완전히 결별하며, 지면 마을이 함락됩니다.',
      },
    ],
    data: {},
  };
  addLog(state, '조정 토벌군이 마을 앞에 진을 쳤습니다. 선택의 시간입니다.', 'raid');
}

export function resolveCrackdown(state: GameState, optionId: string, rng: () => number): void {
  const c = state.pendingChoice;
  if (!c || c.kind !== 'crackdown') return;
  state.pendingChoice = null;
  const s = CONFIG.suspicion;
  state.crackdownDeadline = 0;

  if (optionId === 'fight') {
    // 사실상의 모반 — 지도 전투 없이 즉시 판정 (조총·포대 보정 포함)
    const defense = applyBattleDefenseMultipliers(
      state.resources.defense * cannonBattleMult(state), { warned: true, siege: false }, state.weather);
    consumeBattlePowder(state);
    const successP = defense / (defense + s.crackdownPower);
    if (rng() < successP) {
      state.suspicion = 0;
      state.resources.reputation = 5;
      state.threat = Math.max(0, state.threat - 20);
      addLog(state, '토벌군을 물리쳤습니다. 이제 조정과는 돌이킬 수 없는 강을 건넜습니다 — 변방은 스스로의 힘으로 서야 합니다.', 'raid');
      addLog(state, '조정의 하사와 배급은 더 이상 기대할 수 없습니다. (명성이 바닥까지 떨어졌습니다)', 'bad');
    } else {
      state.gameOver = {
        won: false,
        reason: '조정 토벌군이 성문을 부수고 들어왔습니다. 첨사는 모반의 죄로 압송되었고, 개척지는 조정의 손에 해체되었습니다.',
      };
    }
    return;
  }

  // 성문을 열고 결백을 빈다 — 대량 몰수로 종결
  const seized = seizeFirearms(state, 1);
  state.suspicion = Math.min(state.suspicion, 40);
  state.resources.reputation = Math.max(0, state.resources.reputation - 10);
  addLog(state, `성문을 열고 처분을 기다렸습니다. 토벌군이 ${seized}을(를) 모두 거두어 돌아갑니다. 마을은 무사합니다.`, 'info');
}

// ── 일일 갱신: 의심 누적과 구간별 사건 ──

export function updateSuspicion(state: GameState, rng: () => number): void {
  const s = CONFIG.suspicion;
  const delta = suspicionBreakdown(state).reduce((sum, f) => sum + f.delta, 0);
  state.suspicion = Math.max(0, Math.min(100, state.suspicion + delta));

  // 견책 구간에서 내려오면 다음 고조 때 다시 견책될 수 있다
  if (state.suspicion < s.censureAt) state.censured = false;

  // 토벌 유예 중: 결백을 증명하거나, 기한이 지나면 토벌군이 온다
  if (state.crackdownDeadline > 0) {
    if (state.suspicion < s.crackdownClearBelow) {
      state.crackdownDeadline = 0;
      addLog(state, '조정이 토벌 방침을 거두었습니다. 의심의 눈초리는 남았지만 칼은 칼집으로 돌아갔습니다.', 'good');
    } else if (state.day >= state.crackdownDeadline && !state.pendingChoice && !state.battle) {
      openCrackdown(state);
    }
    return;
  }

  // 100: 강등 + 몰수 + 토벌 유예 시작
  if (state.suspicion >= 100) {
    const before = state.rank;
    const after = demote(state);
    const seized = seizeFirearms(state, s.censureSeizeRatio);
    state.suspicion = s.crackdownStartSuspicion;
    state.crackdownDeadline = state.day + s.crackdownGraceDays;
    if (before !== after) {
      addLog(state, `조정이 모반 혐의로 ${RANK_NAMES[before]}을(를) ${RANK_NAMES[after]}(으)로 강등하였습니다. (몰수: ${seized})`, 'bad', true);
    } else {
      addLog(state, `조정이 모반 혐의를 물어 물자를 몰수했습니다. (몰수: ${seized})`, 'bad', true);
    }
    addLog(state, `조정이 마지막 기회를 주었습니다 — ${s.crackdownGraceDays}일 안에 의심을 ${s.crackdownClearBelow} 아래로 내려 결백을 증명하십시오. 못하면 토벌군이 내려옵니다.`, 'raid');
    return;
  }

  // 70+: 조정 견책 (구간당 한 번)
  if (state.suspicion >= s.censureAt && !state.censured) {
    state.censured = true;
    const seized = seizeFirearms(state, s.censureSeizeRatio);
    state.resources.reputation = Math.max(0, state.resources.reputation - s.censureRep);
    addLog(state, `조정의 견책이 내려왔습니다. 명성이 크게 깎이고 화기가 몰수되었습니다. (몰수: ${seized}) 이대로면 강등을 면치 못합니다.`, 'bad', true);
    return;
  }

  // 40+: 감찰 어사 (쿨다운·모달 충돌 회피)
  if (state.suspicion >= s.inspectionAt &&
      state.day >= state.inspectionCooldownUntil &&
      !state.pendingChoice && !state.battle &&
      rng() < s.inspectionChance) {
    state.inspectionCooldownUntil = state.day + s.inspectionCooldownDays;
    openInspection(state);
  }
}

// 염초장 가동 토글 (조정 탭)
export function toggleNitreYards(state: GameState): void {
  state.nitrePaused = !state.nitrePaused;
  addLog(state, state.nitrePaused
    ? '염초장의 불을 껐습니다. 화약 생산이 멈춥니다.'
    : '염초장이 다시 불을 지폈습니다.', 'info');
}
