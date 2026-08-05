import type { Resident, Terrain } from '../game/types';

export interface ResidentWorkStance {
  offsetX: number;
  offsetY: number;
  facing: 1 | -1;
}

export type WorkLayoutResident = Pick<
  Resident,
  'id' | 'alive' | 'phase' | 'job' | 'assignedBuildingId' | 'x' | 'y' | 'px' | 'py'
>;

/** 서 있는 지형을 알려 주면 "<직업>@<지형>" 앵커를 찾는다. 없으면 기존 배치 그대로. */
type WorkLayoutTerrainLookup = (x: number, y: number) => Terrain | undefined;

/** facing 0 = 기존 방향 계산을 유지한다. */
interface WorkStanceAnchor {
  offsetX: number;
  offsetY: number;
  facing: 1 | -1 | 0;
}

type WorkAnchorLookup = (key: string) => WorkStanceAnchor | null;

export interface WorkLayoutTarget {
  x: number;
  y: number;
  terrain: Terrain;
}

type WorkLayoutTargetLookup = (resident: WorkLayoutResident) => WorkLayoutTarget | null;

const WORK_TARGET_FOREGROUND_SORT_EPSILON = 0.01;

/**
 * 작업 대상과 주민의 타일 깊이를 함께 보는 행 정렬값.
 *
 * 대상이 주민보다 아래쪽이면 주민은 실제로 대상 뒤에 있으므로 기존 발끝 정렬을 유지한다.
 * 같은 행(좌우 작업)이거나 대상이 위쪽이면 대상 소품 직후에 그려 큰 노두에 깔리지 않게 한다.
 */
export function residentWorkRenderSortY(
  resident: Pick<WorkLayoutResident, 'x' | 'y'>,
  target: WorkLayoutTarget | null | undefined,
  visualFootY: number,
  tileSize: number,
): number {
  if (!target || target.y > resident.y) return visualFootY;
  return Math.max(visualFootY, (target.y + 1) * tileSize + WORK_TARGET_FOREGROUND_SORT_EPSILON);
}

/**
 * 같은 작업점의 주민을 좌우로 벌리고 실제 타일 중심을 바라보게 한다.
 * 시뮬레이션 좌표는 건드리지 않는 렌더 전용 배치라 생산과 길찾기에 영향이 없다.
 *
 * 여기에 작업 앵커를 얹는다 — 채광꾼이 노두를 밟고 서는 대신 옆으로 비껴서는 것처럼,
 * 대상물과의 관계를 눈으로 보며 맞춘 값이다 (스프라이트 스튜디오에서 편집).
 * 앵커 조회는 주입받는다 — 이 모듈을 레지스트리에 묶지 않고 순수하게 두기 위해서다.
 */
export function residentWorkStances(
  residents: readonly WorkLayoutResident[],
  tileSize: number,
  excludedResidentIds?: ReadonlySet<number>,
  terrainAt?: WorkLayoutTerrainLookup,
  anchorFor?: WorkAnchorLookup,
  targetFor?: WorkLayoutTargetLookup,
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

  // 앵커 조회가 없거나 값이 비면 전부 0이라 기존 배치와 완전히 같다.
  const contextOf = (resident: WorkLayoutResident) => {
    const target = targetFor?.(resident) ?? null;
    const terrain = target?.terrain ?? terrainAt?.(resident.x, resident.y);
    const anchor = terrain && anchorFor ? anchorFor(`${resident.job}@${terrain}`) : null;
    return { anchor, target };
  };
  const facingTowardTarget = (
    resident: WorkLayoutResident,
    target: WorkLayoutTarget | null,
    fallback: 1 | -1,
  ): 1 | -1 => {
    if (!target || target.x === resident.x) return fallback;
    return target.x > resident.x ? 1 : -1;
  };

  const stances = new Map<number, ResidentWorkStance>();
  for (const group of groups.values()) {
    group.sort((a, b) => a.id - b.id);
    if (group.length === 1) {
      const resident = group[0];
      const side = resident.id % 2 === 0 ? -1 : 1;
      const { anchor, target } = contextOf(resident);
      const facing = facingTowardTarget(resident, target, side < 0 ? 1 : -1);
      stances.set(resident.id, {
        offsetX: side * tileSize * 0.12 + (anchor?.offsetX ?? 0),
        offsetY: anchor?.offsetY ?? 0,
        facing: anchor && anchor.facing !== 0 ? anchor.facing : facing,
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
      const { anchor, target } = contextOf(resident);
      const spreadFacing: 1 | -1 = offsetX < 0 ? 1 : offsetX > 0 ? -1 : (resident.id % 2 === 0 ? 1 : -1);
      const facing = facingTowardTarget(resident, target, spreadFacing);
      stances.set(resident.id, {
        offsetX: offsetX + (anchor?.offsetX ?? 0),
        offsetY: offsetY + (anchor?.offsetY ?? 0),
        facing: anchor && anchor.facing !== 0 ? anchor.facing : facing,
      });
    }
  }
  return stances;
}
