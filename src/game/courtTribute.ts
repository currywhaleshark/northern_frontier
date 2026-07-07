// 조정 세공(歲貢) — 해마다 한양 조정에 바치는 공물.
// 봄 첫날 그해 요구량이 공지되어 세 계절 동안 준비하고, 겨울 첫날 사자가 도착해 거둬 간다.
// 바치면 명성이 오르고(격년 하사품), 못 바치면 명성이 크게 떨어지며 국경이 험악해진다.
import { CONFIG } from './config';
import { RESOURCE_NAMES } from './constants';
import { addLog } from './events';
import { makeRng } from './map';
import { rankEffects } from './promotion';
import { getSeason, getYear } from './seasons';
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

export function canPayTribute(state: GameState, tribute: CourtTribute): boolean {
  return Object.entries(tribute.items).every(
    ([res, amt]) => state.resources[res as ResourceId] >= (amt ?? 0),
  );
}

// 봄 첫날: 올해 세공 공지
export function announceCourtTribute(state: GameState): void {
  const year = getYear(state.day);
  const pop = state.residents.filter(r => r.alive).length;
  state.courtTribute = rollCourtTribute(state.seed, year, pop, state.rank);
  addLog(
    state,
    `조정에서 파발이 왔습니다. 올해 세공: ${tributeItemsLabel(state.courtTribute.items)} — 겨울이 오기 전까지 준비하십시오.`,
    'info',
  );
}

// 겨울 첫날(또는 모달 충돌 시 그 다음 날): 조정의 사자가 세공을 거두러 온다
export function openCourtTributeChoice(state: GameState): void {
  const tribute = state.courtTribute;
  if (!tribute || tribute.resolved) return;
  const t = CONFIG.tribute;
  const label = tributeItemsLabel(tribute.items);
  const lacking = Object.entries(tribute.items)
    .filter(([res, amt]) => state.resources[res as ResourceId] < (amt ?? 0))
    .map(([res]) => RESOURCE_NAMES[res as ResourceId]);
  const failStreakNext = state.tributeFailStreak + 1;
  const repLoss = t.repFail + (failStreakNext >= 2 ? t.repFailStreakExtra : 0);

  state.pendingChoice = {
    kind: 'tribute',
    title: '조정의 사자 — 세공 수거',
    body:
      `한양에서 조정의 사자가 당도했습니다. 올해 세공을 거두러 왔습니다.\n` +
      `요구: ${label}`,
    options: [
      {
        id: 'pay',
        label: '공물을 바친다',
        desc: `${label} 납부. 명성 +${t.repPaid}. 성실히 바치면 격년으로 조정의 하사품이 내려옵니다.`,
        disabled: lacking.length > 0,
        disabledReason: lacking.length > 0 ? `${lacking.join(', ')}이(가) 부족합니다` : undefined,
      },
      {
        id: 'refuse',
        label: '올해는 바치지 못한다',
        desc: `명성 -${repLoss}, 위협 +${t.threatFail}. 조정의 눈 밖에 나고 국경이 험악해집니다.`,
      },
    ],
    data: { year: tribute.year },
  };
}

// 세공 선택 처리 — 효과 적용 + resolved 표시 + 모달 해제
export function resolveCourtTribute(state: GameState, optionId: string): void {
  const c = state.pendingChoice;
  if (!c || c.kind !== 'tribute') return;
  state.pendingChoice = null;
  const tribute = state.courtTribute;
  if (!tribute || tribute.resolved) return;
  const t = CONFIG.tribute;
  tribute.resolved = true;

  if (optionId === 'pay' && canPayTribute(state, tribute)) {
    for (const [res, amt] of Object.entries(tribute.items)) {
      state.resources[res as ResourceId] = Math.max(0, state.resources[res as ResourceId] - (amt ?? 0));
    }
    tribute.paid = true;
    state.tributeFailStreak = 0;
    state.tributePaidStreak += 1; // 승격 조건의 "공물 성실도"
    state.resources.reputation = Math.min(100, state.resources.reputation + t.repPaid);
    addLog(state, '세공을 온전히 바쳤습니다. 조정이 개척지의 공을 기억할 것입니다.', 'good');
    // 격년 하사품: 성실 납부에 대한 답례 (결정적 롤)
    if (tribute.year % 2 === 0) {
      const rng = makeRng(state.seed + tribute.year * 9203 + 5);
      if (rng() < 0.5) {
        state.resources.tools += t.rewardTools;
        addLog(state, `조정에서 하사품이 내려왔습니다. 도구 ${t.rewardTools}을(를) 받았습니다.`, 'good');
      } else {
        state.resources.clothes += t.rewardClothes;
        addLog(state, `조정에서 하사품이 내려왔습니다. 옷 ${t.rewardClothes}벌을 받았습니다.`, 'good');
      }
    }
    return;
  }

  // 미납 — 명성 하락(연속이면 가중), 위협 상승, 성실도 초기화
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
  );
}

// 매일 검사: 겨울이고 올해분이 미처리이며 다른 모달/전투가 없으면 수거 모달을 연다.
// (겨울 진입 시점에 습격 모달이 떠 있을 수 있어 계절 훅 대신 매일 검사한다)
export function maybeCollectTribute(state: GameState): void {
  if (getSeason(state.day) !== 'winter') return;
  if (!state.courtTribute || state.courtTribute.resolved) return;
  if (state.pendingChoice || state.battle) return;
  openCourtTributeChoice(state);
}
