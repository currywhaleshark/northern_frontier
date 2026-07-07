// 조정 청원 — 명성을 소모해 조정 지원 물자를 받는다 (승격 단계 ≥ 보, 계절당 1회).
// 명성이 높고 승격 단계가 오를수록 더 좋은 물자가 목록에 뜬다:
// 보: 기본 물자와 소량 화약 / 진: 조총·화약·사치품 / 부: 불랑기포(포대 배치권).
import { CONFIG } from './config';
import { RANK_NAMES, RESOURCE_NAMES } from './constants';
import { addLog } from './events';
import { RANK_ORDER } from './promotion';
import { livingResidents } from './residents';
import { lowerSuspicion } from './suspicion';
import type { GameState, Rank, ResourceId } from './types';

export interface PetitionOffer {
  id: string;
  minRank: Rank;      // 이 단계부터 목록에 뜬다
  repMin: number;     // 필요 명성 (미달 시 비활성)
  repCost: number;    // 소모 명성
  label: string;
  desc: string;
  gives?: Partial<Record<ResourceId, number>>;
  morale?: number;    // 사치품: 전 주민 사기 상승
  cannon?: boolean;   // 불랑기포 배치권 +1
}

export const PETITION_OFFERS: PetitionOffer[] = [
  {
    id: 'grain', minRank: 'bo', repMin: 25, repCost: 5,
    label: '구휼 곡식을 청한다', desc: '곡물 30. 흉년의 허리를 잇는다.',
    gives: { grain: 30 },
  },
  {
    id: 'tools', minRank: 'bo', repMin: 30, repCost: 5,
    label: '연장을 청한다', desc: '도구 5. 무뎌진 낫과 도끼를 갈음한다.',
    gives: { tools: 5 },
  },
  {
    id: 'clothes', minRank: 'bo', repMin: 30, repCost: 5,
    label: '겨울옷을 청한다', desc: '옷 8. 혹한을 나는 무명옷.',
    gives: { clothes: 8 },
  },
  {
    id: 'powder-small', minRank: 'bo', repMin: 45, repCost: 8,
    label: '화약 소량을 청한다', desc: '화약 4. 조정은 변방에 화약을 잘 내주지 않는다.',
    gives: { gunpowder: 4 },
  },
  {
    id: 'muskets', minRank: 'jin', repMin: 55, repCost: 12,
    label: '조총을 청한다', desc: '조총 4정. 화약이 있으면 수비병의 방어 기여가 크게 오른다.',
    gives: { muskets: 4 },
  },
  {
    id: 'powder', minRank: 'jin', repMin: 50, repCost: 8,
    label: '화약을 청한다', desc: '화약 10. 진(鎭)의 이름값으로 얻어낸 몫.',
    gives: { gunpowder: 10 },
  },
  {
    id: 'luxury', minRank: 'jin', repMin: 45, repCost: 6,
    label: '비단과 소금을 청한다', desc: '사치품 하사 — 전 주민의 사기가 크게 오른다.',
    morale: CONFIG.petition.luxuryMorale,
  },
  {
    id: 'cannon', minRank: 'bu', repMin: 70, repCost: 18,
    label: '불랑기포를 청한다', desc: '불랑기포 1문 — 포대(불랑기포대)를 지어 얹는다. 방어의 정점.',
    cannon: true,
  },
];

function rankAtLeast(rank: Rank, min: Rank): boolean {
  return RANK_ORDER.indexOf(rank) >= RANK_ORDER.indexOf(min);
}

// 지금 청원할 수 있는지 — 불가하면 사유 문자열 (UI 버튼 비활성 사유와 공유)
export function canPetition(state: GameState): string | null {
  if (!rankAtLeast(state.rank, 'bo')) return '보(堡) 승격 후에 청원할 수 있습니다';
  if (state.pendingChoice || state.battle) return '지금은 청원할 수 없습니다';
  const elapsed = state.day - state.lastPetitionDay;
  if (state.lastPetitionDay > 0 && elapsed < CONFIG.petition.cooldownDays) {
    return `사자가 아직 한양에서 돌아오지 않았습니다 (${CONFIG.petition.cooldownDays - elapsed}일 뒤)`;
  }
  return null;
}

function offerDesc(offer: PetitionOffer): string {
  const parts: string[] = [];
  if (offer.gives) {
    parts.push(Object.entries(offer.gives)
      .map(([res, amt]) => `${RESOURCE_NAMES[res as ResourceId]} +${amt}`).join(', '));
  }
  if (offer.morale) parts.push(`전 주민 사기 +${offer.morale}`);
  if (offer.cannon) parts.push('불랑기포대 배치권 +1');
  parts.push(`명성 -${offer.repCost}`);
  return `${offer.desc} (${parts.join(', ')})`;
}

// 청원 모달을 연다 — 현재 단계에서 가능한 물자 목록
export function requestPetition(state: GameState): string | null {
  const reason = canPetition(state);
  if (reason) return reason;

  const offers = PETITION_OFFERS.filter(o => rankAtLeast(state.rank, o.minRank));
  state.pendingChoice = {
    kind: 'petition',
    title: `조정에 청원 — ${RANK_NAMES[state.rank]}`,
    body:
      `한양에 사자를 보내 지원을 청합니다. 조정은 명성이 높은 수령의 청을 후하게 듣습니다.\n` +
      `현재 명성: ${Math.floor(state.resources.reputation)} · 청원은 계절당 한 번입니다.`,
    options: [
      ...offers.map(o => ({
        id: o.id,
        label: o.label,
        desc: offerDesc(o),
        disabled: state.resources.reputation < o.repMin,
        disabledReason: `명성 ${o.repMin} 이상이 필요합니다`,
      })),
      { id: 'cancel', label: '청원을 거둔다', desc: '사자를 보내지 않습니다. 쿨다운을 쓰지 않습니다.' },
    ],
    data: {},
  };
  return null;
}

// 청원 선택 처리
export function resolvePetition(state: GameState, optionId: string): void {
  const c = state.pendingChoice;
  if (!c || c.kind !== 'petition') return;
  state.pendingChoice = null;
  if (optionId === 'cancel') return;

  const offer = PETITION_OFFERS.find(o => o.id === optionId);
  if (!offer || state.resources.reputation < offer.repMin) return;

  state.resources.reputation = Math.max(0, state.resources.reputation - offer.repCost);
  state.lastPetitionDay = state.day;
  lowerSuspicion(state, CONFIG.suspicion.petitionDecay); // 조정과의 접촉은 의심을 누그러뜨린다

  const grantedParts: string[] = [];
  if (offer.gives) {
    for (const [res, amt] of Object.entries(offer.gives)) {
      state.resources[res as ResourceId] += amt ?? 0;
      grantedParts.push(`${RESOURCE_NAMES[res as ResourceId]} ${amt}`);
    }
  }
  if (offer.morale) {
    for (const r of livingResidents(state)) {
      r.morale = Math.min(100, r.morale + offer.morale);
    }
    grantedParts.push('비단과 소금');
  }
  if (offer.cannon) {
    state.cannonsGranted += 1;
    grantedParts.push('불랑기포 1문');
    addLog(state, '조정이 불랑기포를 내렸습니다. 건설 메뉴에서 포대를 지어 얹으십시오.', 'good');
  }
  addLog(state, `청원이 받아들여졌습니다. 조정에서 ${grantedParts.join(', ')}이(가) 내려왔습니다.`, 'good');
}

// 봄마다: 진(鎭) 이상은 조정이 화약을 소량 정기 지급한다 (의도적으로 부족하게)
export function grantYearlyPowder(state: GameState): void {
  const amount = CONFIG.petition.yearlyPowder[state.rank] ?? 0;
  if (amount <= 0) return;
  state.resources.gunpowder += amount;
  addLog(state, `조정의 연례 화약 배급이 내려왔습니다. (화약 +${amount})`, 'good');
}
