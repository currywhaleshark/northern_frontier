// 계약고 — 정기거래 이행분으로 잠가 두는 중심지 재고.
// 세공고(tributeReserve.ts)와 같은 구조이며, 넣어 둔 물자는 취사·난방 같은
// 일반 소비에서 격리된다. 소금·곡물을 계약 몫으로 지켜 두는 것이 핵심 가치다.
// 품목별 풀 하나로 관리한다 — 계약별 칸막이는 관리만 늘린다.
import type { GameState, ResourceId, TradeContract } from './types';

function normalized(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function wholeUnits(value: unknown): number {
  const amount = normalized(value);
  return Math.floor(Math.round(amount * 1_000_000_000) / 1_000_000_000);
}

export function contractReserved(state: GameState, resource: ResourceId): number {
  return wholeUnits(state.tradeContractReserve?.[resource]);
}

// 채움 상한 = 활성 계약들의 다음 1회분 giveAmt 합 (품목별)
export function contractReserveNeeds(state: GameState): Partial<Record<ResourceId, number>> {
  const needs: Partial<Record<ResourceId, number>> = {};
  for (const contract of state.tradeContracts ?? []) {
    if (contract.yearsExecuted >= contract.durationYears) continue;
    needs[contract.give] = (needs[contract.give] ?? 0) + Math.max(0, Math.round(contract.giveAmt));
  }
  return needs;
}

export function contractReserveNeed(state: GameState, resource: ResourceId): number {
  return contractReserveNeeds(state)[resource] ?? 0;
}

// 다음 1회분 전체를 계약고 + 일반 재고로 얼마나 댈 수 있는지 (0~1).
// 상단바 칩의 미충당 경고(⚠)가 이 값을 쓴다.
export function contractReadinessRatio(state: GameState): number {
  const needs = Object.entries(contractReserveNeeds(state))
    .filter((entry): entry is [ResourceId, number] => entry[1] > 0);
  if (needs.length === 0) return 1;
  const covered = needs.reduce((sum, [resource, need]) => {
    const available = contractReserved(state, resource) + normalized(state.resources[resource]);
    return sum + Math.min(1, available / need);
  }, 0);
  return covered / needs.length;
}

// 계약 1건의 이번 몫이 계약고 + 일반 재고로 충당되는지
export function canCoverContract(state: GameState, give: ResourceId, giveAmt: number): boolean {
  return contractReserved(state, give) + normalized(state.resources[give]) >= giveAmt;
}

// 이행 시 인출 — 계약고를 먼저 비우고 모자란 만큼 일반 재고에서 가져온다.
// 실제로 인출한 양을 돌려준다.
export function drawForContract(state: GameState, give: ResourceId, giveAmt: number): number {
  if (!(giveAmt > 0)) return 0;
  if (!state.tradeContractReserve) state.tradeContractReserve = {};
  const fromReserve = Math.min(giveAmt, contractReserved(state, give));
  if (fromReserve > 0) {
    state.tradeContractReserve[give] = contractReserved(state, give) - fromReserve;
  }
  const fromStock = Math.min(giveAmt - fromReserve, normalized(state.resources[give]));
  if (fromStock > 0) state.resources[give] = normalized(state.resources[give]) - fromStock;
  return fromReserve + fromStock;
}

// 계약이 전부 만료·파기되면 잔여분은 일반 재고로 돌려준다
export function releaseTradeContractReserve(state: GameState): void {
  for (const [resource, rawAmount] of Object.entries(state.tradeContractReserve ?? {}) as [ResourceId, number][]) {
    const amount = normalized(rawAmount);
    if (amount > 0) state.resources[resource] = normalized(state.resources[resource]) + amount;
  }
  state.tradeContractReserve = {};
}

// 계약이 바뀌면(체결·만료·파기·해지) 상한을 넘긴 몫은 일반 재고로 돌려준다
export function reconcileTradeContractReserve(state: GameState): void {
  const contracts: TradeContract[] = state.tradeContracts ?? [];
  if (contracts.length === 0) {
    releaseTradeContractReserve(state);
    return;
  }
  const needs = contractReserveNeeds(state);
  const next: Partial<Record<ResourceId, number>> = {};
  for (const [resource, rawAmount] of Object.entries(state.tradeContractReserve ?? {}) as [ResourceId, number][]) {
    const raw = normalized(rawAmount);
    const kept = Math.min(wholeUnits(raw), needs[resource] ?? 0);
    const released = raw - kept;
    if (kept > 0) next[resource] = kept;
    if (released > 0) state.resources[resource] = normalized(state.resources[resource]) + released;
  }
  state.tradeContractReserve = next;
}

// 일반 재고 ↔ 계약고 이동 (장터·부두 패널의 조작)
export function setTradeContractReserve(
  state: GameState,
  resource: ResourceId,
  requestedAmount: number,
): string | null {
  const cap = contractReserveNeed(state, resource);
  if (cap <= 0) return '계약으로 내주는 품목이 아닙니다.';
  if (!state.tradeContractReserve) state.tradeContractReserve = {};
  const current = contractReserved(state, resource);
  const target = Math.max(0, Math.min(cap, wholeUnits(requestedAmount)));
  if (target > current) {
    const moved = Math.min(target - current, wholeUnits(state.resources[resource]));
    state.resources[resource] = Math.max(0, normalized(state.resources[resource]) - moved);
    state.tradeContractReserve[resource] = current + moved;
    return moved === target - current ? null : '사용 가능한 재고만큼만 계약고에 옮겼습니다.';
  }
  const released = current - target;
  state.resources[resource] = normalized(state.resources[resource]) + released;
  state.tradeContractReserve[resource] = target;
  return null;
}
