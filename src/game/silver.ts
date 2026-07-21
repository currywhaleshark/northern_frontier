// 은맥 — 바위/철광을 캐다 드러나는 게임당 1회의 딜레마 사건.
// 보고하면 조정이 처분을 정하고(대개 봉인), 숨기고 캐면(잠채) 은은 전부 내 것이지만
// 모반 의심(suspicion)이 그림자처럼 따라붙는다. 계획: docs/superpowers/plans/2026-07-17-silver-currency.md
import { CONFIG } from './config';
import { addLog } from './events';
import { convertToSilverDeposit, mineralRemaining, rollSilverDepositAmount } from './minerals';
import { lowerSuspicion } from './suspicion';
import type { SuspicionFactor } from './suspicion';
import type { GameState, SilverVeinState, Tile } from './types';

function vein(state: GameState): SilverVeinState | null {
  return state.silverVein ?? null;
}

function veinTile(state: GameState): Tile | null {
  const v = vein(state);
  return v ? state.map[v.y]?.[v.x] ?? null : null;
}

function activateSilverDeposit(v: SilverVeinState, tile: Tile, rng: () => number): void {
  v.discoveredAmount ??= rollSilverDepositAmount(rng);
  convertToSilverDeposit(tile, rng, v.discoveredAmount);
}

export function isBuriedSilverVeinTile(
  state: GameState,
  tile: Pick<Tile, 'x' | 'y'>,
): boolean {
  const v = vein(state);
  return !!v && v.status === 'buried' && v.x === tile.x && v.y === tile.y;
}

// 봉인 명령이 떨어진 광상은 은맥만이 아니라 남은 돌·철도 캘 수 없다 (보고의 대가).
export function isVeinSealedTile(state: GameState, tile: Pick<Tile, 'x' | 'y'>): boolean {
  const v = vein(state);
  return !!v && v.status === 'sealed' && v.x === tile.x && v.y === tile.y;
}

// 채광꾼이 바위/철광을 캔 날을 기록한다 — 은맥 발견 판정의 트리거.
export function recordRockMining(state: GameState, tile: Pick<Tile, 'x' | 'y'>): void {
  state.lastRockMiningDay = state.day;
  state.lastRockMiningTile = { x: tile.x, y: tile.y };
}

// 잠채/설점 은 채굴량 누계 — 많이 캘수록 소문이 돈다.
export function recordSilverMined(state: GameState, amount: number): void {
  const v = vein(state);
  if (v && amount > 0) v.minedTotal += amount;
}

function minedRockRecently(state: GameState): boolean {
  return state.day - (state.lastRockMiningDay ?? -999) <= 1;
}

export function openSilverVeinChoice(state: GameState): void {
  const v = vein(state);
  if (!v || state.pendingChoice || state.battle) return;
  v.status = 'offered';
  v.lastOfferDay = state.day;
  const s = CONFIG.silver;
  state.pendingChoice = {
    kind: 'silverVein',
    title: '은맥 발견 — 돌 틈의 은빛',
    body:
      '채광꾼이 곡괭이를 멈췄습니다. 무너진 돌 틈으로 은빛 광맥이 드러났습니다.\n' +
      '법도대로면 조정에 보고해야 합니다. 그러나 보고하면 이 은은 우리 것이 아니게 될 것이고,\n' +
      '숨기고 캐면 — 잠채(潛採)는 중죄입니다.',
    options: [
      {
        id: 'report',
        label: '조정에 보고한다',
        desc: `법도를 지킵니다. 명성 +${s.reportReputation}, 모반 의심이 가라앉습니다. ` +
          '조정은 대개 광상을 봉인하지만, 드물게 설점(設店)을 허가해 세를 걷고 캐게 합니다.',
      },
      {
        id: 'secret',
        label: '은닉하고 캔다 (잠채)',
        desc: '광상이 은광이 됩니다. 산출은 전부 우리 몫 — 대신 캐는 동안 흉흉한 소문이 돌고, ' +
          '발각되면 모반 의심이 크게 치솟습니다. 남은 돌·철은 포기합니다.',
      },
      {
        id: 'bury',
        label: '도로 묻어둔다',
        desc: '아무 일도 없었던 것으로 합니다. 광상은 원래대로 캐고, 은맥은 그 자리에 남습니다. ' +
          '채광장에서 직접 다시 열기 전에는 이 결정이 다시 나타나지 않습니다.',
      },
    ],
    data: { x: v.x, y: v.y },
  };
  addLog(state, '채광장에서 은맥이 드러났습니다. 결정을 내려야 합니다.', 'info', true);
}

export function resolveSilverVeinChoice(state: GameState, optionId: string, rng: () => number): void {
  const choice = state.pendingChoice;
  if (!choice || choice.kind !== 'silverVein') return;
  state.pendingChoice = null;
  const v = vein(state);
  const tile = veinTile(state);
  if (!v || !tile) return;
  const s = CONFIG.silver;

  if (optionId === 'secret') {
    v.status = 'secret';
    activateSilverDeposit(v, tile, rng);
    addLog(state, '은맥을 숨기기로 했습니다. 채광꾼들이 입을 닫고 은을 캐기 시작합니다.', 'info', true);
    return;
  }

  if (optionId === 'report') {
    state.resources.reputation = Math.min(100, state.resources.reputation + s.reportReputation);
    lowerSuspicion(state, s.reportSuspicionDecay);
    if (rng() < s.sanctionChance) {
      v.status = 'sanctioned';
      activateSilverDeposit(v, tile, rng);
      addLog(
        state,
        `조정이 설점(設店)을 허가했습니다. 은을 캘 수 있으나 산출의 ${Math.round(s.sanctionTaxRatio * 100)}%는 조정 몫입니다.`,
        'good',
        true,
      );
    } else {
      v.status = 'sealed';
      addLog(
        state,
        '조정이 광상 봉인을 명했습니다. 은맥은 물론 남은 돌과 철에도 손댈 수 없게 되었습니다.',
        'bad',
        true,
      );
    }
    return;
  }

  // 묻어둔다 — 광상은 원래 광물로 계속 캐지만, 플레이어가 직접 다시 열기 전에는 재제안하지 않는다.
  v.status = 'buried';
  v.lastOfferDay = state.day;
  addLog(state, '은맥을 도로 묻었습니다. 돌 틈의 은빛은 우리끼리의 비밀로 남습니다.', 'info');
}

// 봉인 어기기 — 조정이 위치를 아는 잠채라 발각 시 더 아프다.
export function breakSilverSeal(state: GameState, rng: () => number): string | null {
  const v = vein(state);
  const tile = veinTile(state);
  if (!v || v.status !== 'sealed' || !tile) return '봉인된 은맥이 없습니다.';
  v.status = 'secret';
  v.sealBroken = true;
  v.exposed = false;
  activateSilverDeposit(v, tile, rng);
  addLog(state, '조정의 봉인을 어기고 은맥을 다시 팠습니다. 이제 돌이킬 수 없습니다.', 'bad', true);
  return null;
}

// 묻어둔 은맥 다시 열기 — 3지선다를 다시 연다.
export function reopenBuriedVein(state: GameState): string | null {
  const v = vein(state);
  if (!v || v.status !== 'buried') return '묻어둔 은맥이 없습니다.';
  if (state.pendingChoice || state.battle) return '지금은 결정을 내릴 수 없습니다.';
  openSilverVeinChoice(state);
  return null;
}

// 조정 탭 의심 내역에 얹는 은 관련 요인 — 잠채는 익명 라벨로만 보인다(짐작만 가능).
export function silverSuspicionFactors(state: GameState): SuspicionFactor[] {
  const v = vein(state);
  if (!v || v.status !== 'secret') return [];
  const tile = veinTile(state);
  if (!tile || mineralRemaining(tile) <= 0) return [];
  const s = CONFIG.suspicion;
  // 지관 허생이 있으면 은 소문이 더 빨리 퍼진다 — 산세를 읽는 자가 있다는 소문 자체가 증거가 된다
  const rumorMult = state.residents.some(resident => resident.alive && resident.special === 'geomancer')
    ? CONFIG.specialResidents.geomancerSilverSuspicionMult
    : 1;
  if (v.exposed) {
    return [{ id: 'silverExposed', label: '은광 잠채가 조정에 알려짐', delta: (v.sealBroken ? s.perSealBrokenSilver * 2 : s.perSecretSilver * 2) * rumorMult }];
  }
  return [{
    id: 'silverRumor',
    label: '변방에 도는 흉흉한 소문',
    delta: (v.sealBroken ? s.perSealBrokenSilver : s.perSecretSilver) * rumorMult,
  }];
}

// 일일 갱신 — 최초 발견 판정(보장 포함)과 잠채 발각. 묻은 은맥은 자동으로 다시 열지 않는다.
export function dailySilverTick(state: GameState, rng: () => number): void {
  const s = CONFIG.silver;
  const v = vein(state);

  // 발견 전: 채광이 있었던 날마다 판정을 누적한다. 게임당 1회.
  if (!v) {
    if (!minedRockRecently(state) || !state.lastRockMiningTile) return;
    const pity = (state.silverPityDays ?? 0) + 1;
    state.silverPityDays = pity;
    // 지관 허생 '산세 읽기' — 은맥을 알아볼 확률이 오른다
    const veinChance = s.veinDailyChance *
      (state.residents.some(resident => resident.alive && resident.special === 'geomancer')
        ? CONFIG.specialResidents.geomancerVeinChanceMult
        : 1);
    if (rng() < veinChance || pity >= s.pityMiningDays) {
      if (state.pendingChoice || state.battle) return; // 내일 다시 시도 (판정은 성립)
      const { x, y } = state.lastRockMiningTile;
      state.silverVein = {
        status: 'offered',
        x,
        y,
        discoveredDay: state.day,
        discoveredAmount: rollSilverDepositAmount(rng),
        minedTotal: 0,
      };
      openSilverVeinChoice(state);
    }
    return;
  }

  // 선택 모달이 사라진 offered 상태(저장/불러오기 등) — 다시 연다.
  if (v.status === 'offered' && !state.pendingChoice && !state.battle) {
    openSilverVeinChoice(state);
    return;
  }

  // 잠채 발각 — 캔 은이 쌓일수록 확률이 오른다. 스파이크는 1회, 이후는 일일 요인이 무겁게 남는다.
  if (v.status === 'secret' && !v.exposed) {
    const tile = veinTile(state);
    if (!tile || mineralRemaining(tile) <= 0) return;
    const chance = Math.min(s.exposeChanceMax, s.exposeBaseChance + v.minedTotal * s.exposePerMined);
    if (rng() < chance) {
      v.exposed = true;
      const spike = v.sealBroken ? s.exposeSpikeSealBroken : s.exposeSpike;
      state.suspicion = Math.min(100, state.suspicion + spike);
      addLog(
        state,
        v.sealBroken
          ? '봉인을 어긴 잠채가 조정에 알려졌습니다. 모반 의심이 걷잡을 수 없이 치솟습니다.'
          : '은광 잠채의 소문이 조정의 귀에 들어갔습니다. 모반 의심이 크게 치솟습니다.',
        'bad',
        true,
      );
    }
  }
}
