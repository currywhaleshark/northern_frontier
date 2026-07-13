import { assignedWeapon } from '../game/weapons';
import type { GameState, Resident } from '../game/types';
import type { MilitiaWeaponSpriteId } from './militiaWeaponAssets';

export function militiaWeaponForResident(
  state: GameState,
  resident: Resident,
): MilitiaWeaponSpriteId | undefined {
  if (!resident.alive || resident.job !== 'militia') return undefined;
  const weapon = assignedWeapon(state, resident.id);
  if (weapon === 'musket') return 'muskets';
  if (weapon === 'hornBow') return 'hornBows';
  if (weapon === 'spear') return 'spears';
  return undefined;
}
