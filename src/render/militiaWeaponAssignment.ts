import { militiaWeaponAllocation } from '../game/buildings';
import type { GameState, Resident } from '../game/types';
import type { MilitiaWeaponSpriteId } from './militiaWeaponAssets';

export function militiaWeaponForResident(
  state: GameState,
  resident: Resident,
): MilitiaWeaponSpriteId | undefined {
  if (!resident.alive || resident.job !== 'militia') return undefined;
  const militiaIds = state.residents
    .filter(r => r.alive && r.job === 'militia')
    .map(r => r.id)
    .sort((a, b) => a - b);
  const index = militiaIds.indexOf(resident.id);
  if (index < 0) return undefined;

  const allocation = militiaWeaponAllocation(state);
  if (index < allocation.muskets) return 'muskets';
  if (index < allocation.muskets + allocation.hornBows) return 'hornBows';
  if (index < allocation.muskets + allocation.hornBows + allocation.spears) return 'spears';
  return undefined;
}
