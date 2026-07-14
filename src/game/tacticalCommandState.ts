import type { TacticalDefenderGroup } from './types';

type CommandStateGroup = Pick<
  TacticalDefenderGroup,
  'id' | 'count' | 'wounded' | 'killed' | 'command' | 'commandSource' | 'commandable'
>;

export function tacticalActiveDefenderCount(group: Pick<CommandStateGroup, 'count' | 'wounded' | 'killed'>): number {
  return Math.max(0, group.count - group.wounded - group.killed);
}

export function tacticalGroupCanReceiveCommand(group: CommandStateGroup): boolean {
  return group.commandable !== false && tacticalActiveDefenderCount(group) > 0;
}

export function tacticalGroupHasPendingCommand(group: CommandStateGroup): boolean {
  return tacticalGroupCanReceiveCommand(group) && group.commandSource !== 'player';
}

export function pendingTacticalCommandCount(groups: CommandStateGroup[]): number {
  return groups.filter(tacticalGroupHasPendingCommand).length;
}

function nextMatchingGroupId(
  groups: CommandStateGroup[],
  currentGroupId: string | null,
  predicate: (group: CommandStateGroup) => boolean,
): string | null {
  if (groups.length === 0) return null;
  const currentIndex = groups.findIndex(group => group.id === currentGroupId);
  for (let step = 1; step < groups.length; step += 1) {
    const candidate = groups[(Math.max(-1, currentIndex) + step) % groups.length];
    if (predicate(candidate)) return candidate.id;
  }
  if (currentIndex < 0) {
    const first = groups.find(predicate);
    return first?.id ?? null;
  }
  return null;
}

export function nextPendingTacticalGroupId(
  groups: CommandStateGroup[],
  currentGroupId: string | null,
): string | null {
  return nextMatchingGroupId(groups, currentGroupId, tacticalGroupHasPendingCommand);
}

export function nextActiveTacticalGroupId(
  groups: CommandStateGroup[],
  currentGroupId: string | null,
): string | null {
  return nextMatchingGroupId(groups, currentGroupId, tacticalGroupCanReceiveCommand);
}
