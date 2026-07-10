import type { CourtTribute, GameState, ResourceId } from './types';

function normalized(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

export function tributeRequirement(tribute: CourtTribute | null, resource: ResourceId): number {
  return normalized(tribute?.items[resource]);
}

export function tributeReserved(state: GameState, resource: ResourceId): number {
  return normalized(state.tributeReserve?.[resource]);
}

export function tributeReserveRatio(state: GameState, tribute: CourtTribute): number {
  const requirements = Object.entries(tribute.items)
    .filter((entry): entry is [ResourceId, number] => normalized(entry[1]) > 0);
  if (requirements.length === 0) return 1;
  const fulfillment = requirements.reduce((sum, [resource, required]) =>
    sum + Math.min(1, tributeReserved(state, resource) / required), 0);
  return fulfillment / requirements.length;
}

export function setTributeReserve(
  state: GameState,
  resource: ResourceId,
  requestedAmount: number,
): string | null {
  const required = tributeRequirement(state.courtTribute, resource);
  if (required <= 0 || state.courtTribute?.resolved) return '올해 세공 품목이 아닙니다.';
  if (!state.tributeReserve) state.tributeReserve = {};
  const current = tributeReserved(state, resource);
  const target = Math.max(0, Math.min(required, Math.floor(normalized(requestedAmount))));
  if (target > current) {
    const moved = Math.min(target - current, normalized(state.resources[resource]));
    state.resources[resource] = Math.max(0, state.resources[resource] - moved);
    state.tributeReserve[resource] = current + moved;
    return moved === target - current ? null : '사용 가능한 재고만큼만 세공고에 옮겼습니다.';
  }
  const released = current - target;
  state.resources[resource] = normalized(state.resources[resource]) + released;
  state.tributeReserve[resource] = target;
  return null;
}

export function releaseTributeReserve(state: GameState): void {
  for (const [resource, rawAmount] of Object.entries(state.tributeReserve ?? {}) as [ResourceId, number][]) {
    const amount = normalized(rawAmount);
    if (amount > 0) state.resources[resource] = normalized(state.resources[resource]) + amount;
  }
  state.tributeReserve = {};
}

export function reconcileTributeReserve(state: GameState): void {
  const tribute = state.courtTribute;
  if (!tribute || tribute.resolved) {
    releaseTributeReserve(state);
    return;
  }
  const next: Partial<Record<ResourceId, number>> = {};
  for (const [resource, rawAmount] of Object.entries(state.tributeReserve ?? {}) as [ResourceId, number][]) {
    const amount = normalized(rawAmount);
    const required = tributeRequirement(tribute, resource);
    const kept = Math.min(amount, required);
    const released = amount - kept;
    if (kept > 0) next[resource] = kept;
    if (released > 0) state.resources[resource] = normalized(state.resources[resource]) + released;
  }
  state.tributeReserve = next;
}

export function consumeTributeReserve(state: GameState, tribute: CourtTribute): number {
  const ratio = tributeReserveRatio(state, tribute);
  for (const [resource, rawRequired] of Object.entries(tribute.items) as [ResourceId, number][]) {
    const used = Math.min(normalized(rawRequired), tributeReserved(state, resource));
    state.tributeReserve[resource] = Math.max(0, tributeReserved(state, resource) - used);
  }
  return ratio;
}
