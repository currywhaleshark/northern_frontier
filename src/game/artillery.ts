import { countBuilt } from './buildings';
import { CONFIG } from './config';
import type { GameState } from './types';

export interface ActiveArtillery {
  cannonCount: number;
  chongtongCount: number;
  powderCost: number;
  defenseMultiplier: number;
  bombardmentStrength: number;
}

// 화약이 모자라면 더 강한 불랑기포를 먼저 가동한다.
// 방어 배율은 같은 종류의 포대 수에는 중첩하지 않고, 서로 다른 종류가 가동될 때만 곱한다.
export function activeArtillery(
  state: GameState,
  availablePowder = state.resources.gunpowder,
): ActiveArtillery {
  const powderPerPiece = CONFIG.raid.powderPerCannon;
  const availablePieces = powderPerPiece <= 0
    ? Number.MAX_SAFE_INTEGER
    : Math.floor((Math.max(0, availablePowder) + 1e-9) / powderPerPiece);
  const cannonCount = Math.min(countBuilt(state, 'cannonEmplacement'), availablePieces);
  const chongtongCount = Math.min(
    countBuilt(state, 'chongtongEmplacement'),
    Math.max(0, availablePieces - cannonCount),
  );
  const defenseMultiplier =
    (cannonCount > 0 ? CONFIG.raid.cannonBattleMult : 1) *
    (chongtongCount > 0 ? CONFIG.raid.chongtongBattleMult : 1);
  const bombardmentStrength = 1 -
    Math.pow(1 - CONFIG.raid.cannonBombardmentLossRate, cannonCount) *
    Math.pow(1 - CONFIG.raid.chongtongBombardmentLossRate, chongtongCount);

  return {
    cannonCount,
    chongtongCount,
    powderCost: (cannonCount + chongtongCount) * powderPerPiece,
    defenseMultiplier,
    bombardmentStrength,
  };
}

export function artilleryPieceCount(
  artillery: Pick<ActiveArtillery, 'cannonCount' | 'chongtongCount'>,
): number {
  return artillery.cannonCount + artillery.chongtongCount;
}

export function artilleryMoralePenalty(artillery: ActiveArtillery): number {
  if (artilleryPieceCount(artillery) <= 0) return 0;
  return 4 + artillery.cannonCount * 2 + artillery.chongtongCount;
}

export function describeArtillery(
  artillery: Pick<ActiveArtillery, 'cannonCount' | 'chongtongCount'>,
): string {
  const parts: string[] = [];
  if (artillery.cannonCount > 0) parts.push(`불랑기포 ${artillery.cannonCount}문`);
  if (artillery.chongtongCount > 0) parts.push(`지자총통 ${artillery.chongtongCount}문`);
  return parts.join('과 ');
}
