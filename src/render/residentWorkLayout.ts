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
  excludedResidentIds?: ReadonlySet<number>,
): Map<number, ResidentWorkStance> {
  const groups = new Map<string, WorkLayoutResident[]>();
  for (const resident of residents) {
    if (!resident.alive || resident.phase !== 'working' ||
        resident.x !== resident.px || resident.y !== resident.py ||
        excludedResidentIds?.has(resident.id)) continue;
    const key = `${resident.x},${resident.y}`;
    const group = groups.get(key) ?? [];
    group.push(resident);
    groups.set(key, group);
  }

  const stances = new Map<number, ResidentWorkStance>();
  for (const group of groups.values()) {
    group.sort((a, b) => a.id - b.id);
    if (group.length === 1) {
      const resident = group[0];
      const side = resident.id % 2 === 0 ? -1 : 1;
      stances.set(resident.id, {
        offsetX: side * tileSize * 0.12,
        offsetY: 0,
        facing: side < 0 ? 1 : -1,
      });
      continue;
    }

    const columns = group.length <= 4 ? 2 : group.length <= 6 ? 3 : 4;
    const rows = Math.ceil(group.length / columns);
    const xSpacing = columns === 2 ? 0.36 : columns === 3 ? 0.24 : 0.18;
    const ySpacing = 0.11;
    for (let index = 0; index < group.length; index++) {
      const resident = group[index];
      const row = Math.floor(index / columns);
      const rowStart = row * columns;
      const rowCount = Math.min(columns, group.length - rowStart);
      const column = index - rowStart;
      const offsetX = (column - (rowCount - 1) / 2) * xSpacing * tileSize;
      const offsetY = (row - (rows - 1) / 2) * ySpacing * tileSize;
      stances.set(resident.id, {
        offsetX,
        offsetY,
        facing: offsetX < 0 ? 1 : offsetX > 0 ? -1 : (resident.id % 2 === 0 ? 1 : -1),
      });
    }
  }
  return stances;
}
