import { tacticalGroupCapabilities } from '../../game/combatCapabilities';
import {
  tacticalCommandUnavailableReason,
  tacticalSupportedCommands,
} from '../../game/tacticalBattle';
import type {
  TacticalBattle,
  TacticalCommandId,
  TacticalDefenderGroup,
} from '../../game/types';

export const TACTICAL_QUICK_COMMAND_LIMIT = 3;

const CONTEXT_COMMANDS: readonly TacticalCommandId[] = [
  'flankRoute',
  'reinforceRear',
  'guardStorehouse',
  'protectCivilians',
  'blockEscape',
  'arson',
];

export function tacticalAvailableCommands(
  battle: TacticalBattle,
  group: TacticalDefenderGroup,
): readonly TacticalCommandId[] {
  return tacticalSupportedCommands(battle).filter(command =>
    tacticalCommandUnavailableReason(battle, group, command) == null);
}

function representativeCommand(
  battle: TacticalBattle,
  group: TacticalDefenderGroup,
  available: ReadonlySet<TacticalCommandId>,
): TacticalCommandId | null {
  const capabilities = tacticalGroupCapabilities(group);
  if (battle.assaultKind === 'predatorHunt') {
    if (capabilities.has('volley') && available.has('volley')) return 'volley';
    if (capabilities.has('charge') && available.has('charge')) return 'charge';
    if (capabilities.has('melee') && available.has('hold')) return 'hold';
    if (group.role === 'hunter' && available.has('ambush')) return 'ambush';
    return null;
  }

  if (group.role === 'hunter' && available.has('ambush')) return 'ambush';
  if (capabilities.has('volley') && available.has('volley')) return 'volley';
  if ((capabilities.has('charge') || capabilities.has('melee')) && available.has('charge')) return 'charge';
  return null;
}

function quickCommandsFrom(
  battle: TacticalBattle,
  group: TacticalDefenderGroup,
  availableCommands: readonly TacticalCommandId[],
): readonly TacticalCommandId[] {
  const available = new Set(availableCommands);
  const current = group.command && available.has(group.command) ? group.command : null;
  const contextual = CONTEXT_COMMANDS.filter(command => available.has(command));
  const quick: TacticalCommandId[] = [];
  const add = (command: TacticalCommandId | null) => {
    if (command && available.has(command) && !quick.includes(command) &&
        quick.length < TACTICAL_QUICK_COMMAND_LIMIT) quick.push(command);
  };

  // Keep room for a valid current command even in a dense emergency context.
  const reservedForCurrent = current && !contextual.includes(current) ? 1 : 0;
  contextual.slice(0, TACTICAL_QUICK_COMMAND_LIMIT - reservedForCurrent).forEach(add);
  add(current);
  add(representativeCommand(battle, group, available));
  add('hold');
  add('fallback');

  // Fill spare slots in the game-provided order, but keep voluntary withdrawal
  // behind More unless it is effectively the only action beyond holding position.
  availableCommands.filter(command => command !== 'openRetreat').forEach(add);
  const nonRetreatActions = availableCommands.filter(command =>
    command !== 'hold' && command !== 'openRetreat');
  if (nonRetreatActions.length === 0) add('openRetreat');

  return quick;
}

export function tacticalQuickCommands(
  battle: TacticalBattle,
  group: TacticalDefenderGroup,
): readonly TacticalCommandId[] {
  return quickCommandsFrom(battle, group, tacticalAvailableCommands(battle, group));
}

export function tacticalCommandPresentation(
  battle: TacticalBattle,
  group: TacticalDefenderGroup,
): Readonly<{
  quick: readonly TacticalCommandId[];
  more: readonly TacticalCommandId[];
}> {
  const available = tacticalAvailableCommands(battle, group);
  const quick = quickCommandsFrom(battle, group, available);
  const quickSet = new Set(quick);
  return {
    quick,
    more: available.filter(command => !quickSet.has(command)),
  };
}
