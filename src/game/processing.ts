import { CONFIG } from './config';
import type { GameState, ProcessingInputId } from './types';

export const PROCESSING_INPUTS: ProcessingInputId[] = ['wood', 'grain', 'game', 'hide', 'iron'];

export function defaultProcessingReserves(): Record<ProcessingInputId, number> {
  return { ...CONFIG.production.processingReserves };
}

function normalizeReserve(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function ensureProcessingReserves(state: GameState): void {
  const existing = (state as GameState & {
    processingReserves?: Partial<Record<ProcessingInputId, number>>;
  }).processingReserves ?? {};
  const next = defaultProcessingReserves();
  for (const id of PROCESSING_INPUTS) {
    if (Object.prototype.hasOwnProperty.call(existing, id)) {
      next[id] = normalizeReserve(existing[id]);
    }
  }
  state.processingReserves = next;
}

export function processingReserve(state: GameState, resource: ProcessingInputId): number {
  ensureProcessingReserves(state);
  return state.processingReserves[resource];
}

export function processableAmount(state: GameState, resource: ProcessingInputId): number {
  return Math.max(0, state.resources[resource] - processingReserve(state, resource));
}

export function setProcessingReserve(state: GameState, resource: ProcessingInputId, amount: number): void {
  ensureProcessingReserves(state);
  state.processingReserves[resource] = normalizeReserve(amount);
}
