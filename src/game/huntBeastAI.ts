import { CONFIG } from './config';
import type { PredatorKind, TigerTier } from './types';

export type BeastAction =
  | { kind: 'lurk' }
  | { kind: 'ambush'; sectorId: string; targetGroupId: string }
  | { kind: 'breakout'; sectorId: string }
  | { kind: 'cornered' };

interface HuntGroupSnapshot {
  id: string;
  count: number;
  effectivePower: number;
  meleeCapable: boolean;
  spearWall: boolean;
}

interface HuntSectorSnapshot {
  id: string;
  blockade: number;
  groups: HuntGroupSnapshot[];
}

export interface ChooseBeastActionInput {
  sectors: HuntSectorSnapshot[];
  encirclement: number;
  predatorState: 'hidden' | 'revealed' | 'wounded';
  predatorKind: PredatorKind;
  tigerTier?: TigerTier;
  remainingPowerShare: number;
  baitSectorId?: string;
  trapSectorId?: string;
  decisionRoll: number;
}

interface ExposedTarget {
  sectorId: string;
  groupId: string;
  exposure: number;
}

const HUNT_AI = CONFIG.tacticalBattle.hunt.beastAI;

function weakestSector(sectors: HuntSectorSnapshot[]): HuntSectorSnapshot | undefined {
  return [...sectors].sort((left, right) =>
    left.blockade - right.blockade || left.id.localeCompare(right.id))[0];
}

function exposureScore(
  sector: HuntSectorSnapshot,
  group: HuntGroupSnapshot,
  input: ChooseBeastActionInput,
): number {
  const exposure = HUNT_AI.exposure;
  return Math.max(0,
    group.effectivePower + group.count * exposure.perMember +
    (group.meleeCapable ? exposure.meleeBonus : 0) +
    (group.spearWall ? exposure.spearWallBonus : 0) -
    (input.baitSectorId === sector.id ? exposure.baitPenalty : 0) +
    (input.trapSectorId === sector.id ? exposure.trapBonus : 0));
}

function weakestTarget(input: ChooseBeastActionInput): ExposedTarget | undefined {
  return input.sectors.flatMap(sector => sector.groups.map(group => ({
    sectorId: sector.id,
    groupId: group.id,
    exposure: exposureScore(sector, group, input),
  }))).sort((left, right) =>
    left.exposure - right.exposure ||
    left.sectorId.localeCompare(right.sectorId) ||
    left.groupId.localeCompare(right.groupId))[0];
}

function ambushExposureThreshold(input: ChooseBeastActionInput): number {
  if (input.predatorKind === 'wolf') return HUNT_AI.ambushExposureThreshold.wolf;
  return HUNT_AI.ambushExposureThreshold[input.tigerTier ?? 'tiger'];
}

function predatorProfileKey(input: ChooseBeastActionInput): 'wolf' | TigerTier {
  return input.predatorKind === 'wolf' ? 'wolf' : input.tigerTier ?? 'tiger';
}

export function chooseBeastAction(input: ChooseBeastActionInput): BeastAction {
  if (input.encirclement >= HUNT_AI.corneredEncirclement) return { kind: 'cornered' };

  const thinnestSector = weakestSector(input.sectors);
  const profileKey = predatorProfileKey(input);
  const shouldBreakOut = input.predatorState === 'wounded' ||
    input.remainingPowerShare <= HUNT_AI.woundedPowerShare ||
    input.encirclement >= HUNT_AI.breakoutEncirclement[profileKey];
  if (shouldBreakOut && thinnestSector &&
      thinnestSector.blockade <= HUNT_AI.breakoutBlockadeMax[profileKey]) {
    return { kind: 'breakout', sectorId: thinnestSector.id };
  }

  const target = weakestTarget(input);
  if (target && target.exposure <= ambushExposureThreshold(input) &&
    (target.sectorId === input.baitSectorId || input.decisionRoll < HUNT_AI.ambushDecisionChance)) {
    return { kind: 'ambush', sectorId: target.sectorId, targetGroupId: target.groupId };
  }
  return { kind: 'lurk' };
}

export function chooseWolfPackActions(
  input: ChooseBeastActionInput,
  secondaryDecisionRoll: number,
): BeastAction[] {
  const primary = chooseBeastAction({ ...input, predatorKind: 'wolf' });
  if (primary.kind === 'cornered' || primary.kind === 'breakout') return [primary];
  const actions: BeastAction[] = primary.kind === 'ambush' ? [primary] : [];
  const secondarySectors = input.sectors.filter(sector =>
    sector.groups.length > 0 && (primary.kind !== 'ambush' || sector.id !== primary.sectorId));
  if (secondarySectors.length > 0) {
    const secondary = chooseBeastAction({
      ...input,
      predatorKind: 'wolf',
      sectors: secondarySectors,
      decisionRoll: secondaryDecisionRoll,
    });
    if (secondary.kind === 'ambush') actions.push(secondary);
  }
  return actions.length > 0 ? actions : [{ kind: 'lurk' }];
}
