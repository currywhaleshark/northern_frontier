import type { Resident } from '../game/types';

export interface ResidentWorkStance {
  offsetX: number;
  offsetY: number;
  facing: 1 | -1;
}

type WorkLayoutResident = Pick<Resident, 'id' | 'alive' | 'phase' | 'x' | 'y' | 'px' | 'py'>;

/**
 * 같은 작업점의 주민을 좌우로 벌리고 실제 타일 중심을 바라보게 한다.
 * 시뮬레이션 좌표는 건드리지 않는 렌더 전용 배치라 생산과 길찾기에 영향이 없다.
 */
export function residentWorkStances(
  residents: readonly WorkLayoutResident[],
  tileSize: number,
): Map<number, ResidentWorkStance> {
  const groups = new Map<string, WorkLayoutResident[]>();
  for (const resident of residents) {
    if (!resident.alive || resident.phase !== 'working' ||
        resident.x !== resident.px || resident.y !== resident.py) continue;
    const key = `${resident.x},${resident.y}`;
    const group = groups.get(key) ?? [];
    group.push(resident);
    groups.set(key, group);
  }

  const stances = new Map<number, ResidentWorkStance>();
  for (const group of groups.values()) {
    group.sort((a, b) => a.id - b.id);
    for (let index = 0; index < group.length; index++) {
      const resident = group[index];
      const pair = Math.floor(index / 2);
      const side = group.length === 1
        ? (resident.id % 2 === 0 ? -1 : 1)
        : (index % 2 === 0 ? -1 : 1);
      const distance = tileSize * (0.16 + Math.min(2, pair) * 0.07);
      stances.set(resident.id, {
        offsetX: side * distance,
        offsetY: pair === 0 ? 0 : -tileSize * 0.09 * Math.min(2, pair),
        facing: side < 0 ? 1 : -1,
      });
    }
  }
  return stances;
}
