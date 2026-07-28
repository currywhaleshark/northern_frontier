import { CONFIG } from './config';
import type { HuntPreyId } from './types';

export interface HuntPreyDef {
  id: HuntPreyId;
  name: string;
  weight: number;
  meat: number;
  hide: number;
}

export const HUNT_PREY_ORDER = [
  'rabbit', 'pheasant', 'roeDeer', 'wildBoar',
] as const satisfies readonly HuntPreyId[];

const PREY_NAMES: Record<HuntPreyId, string> = {
  rabbit: '토끼',
  pheasant: '꿩',
  roeDeer: '노루',
  wildBoar: '멧돼지',
};

export const HUNT_PREY_DEFS = Object.fromEntries(HUNT_PREY_ORDER.map(id => [
  id,
  {
    id,
    name: PREY_NAMES[id],
    ...CONFIG.agents.hunting.prey[id],
  },
])) as Record<HuntPreyId, HuntPreyDef>;

export function selectHuntPrey(roll: number): HuntPreyDef {
  const normalized = Number.isFinite(roll) ? Math.max(0, Math.min(0.999999999, roll)) : 0;
  const totalWeight = HUNT_PREY_ORDER.reduce((sum, id) => sum + HUNT_PREY_DEFS[id].weight, 0);
  let cursor = normalized * totalWeight;
  for (const id of HUNT_PREY_ORDER) {
    const prey = HUNT_PREY_DEFS[id];
    cursor -= prey.weight;
    if (cursor < 0) return prey;
  }
  return HUNT_PREY_DEFS.wildBoar;
}

export function rollHuntPrey(rng: () => number): HuntPreyDef {
  return selectHuntPrey(rng());
}

export function scaledHuntYield(
  prey: HuntPreyDef,
  baselineMeatAmount: number,
): { meat: number; hide: number } {
  const baseline = Number.isFinite(baselineMeatAmount) ? Math.max(0, baselineMeatAmount) : 0;
  const scale = baseline / CONFIG.production.meatPerGame;
  return {
    meat: prey.meat * scale,
    hide: prey.hide * scale,
  };
}

export function huntPreyName(id: HuntPreyId | undefined): string {
  return id ? HUNT_PREY_DEFS[id]?.name ?? '사냥감' : '사냥감';
}
