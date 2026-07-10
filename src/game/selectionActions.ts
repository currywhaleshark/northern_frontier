import { BUILDING_DEFS, buildingFootprintTiles, getBuilding, isBuildingUnlocked } from './buildings';
import { CONFIG } from './config';
import { JOB_NAMES } from './constants';
import { collectHuntableTiles } from './habitats';
import { isPassable } from './agents';
import { getSeason } from './seasons';
import { isExplored } from './exploration';
import { isHaulSourceBuilding } from './inventory';
import { canAssignResidentToBuilding, workerSlotConfig } from './workerSlots';
import type { Building, GameState, JobId, PointerAction, SelectedEntity, Tile } from './types';

export interface BuildingActionItem {
  id: string;
  label: string;
  disabled?: boolean;
  reason?: string;
}

const NONE_ACTION: PointerAction = { kind: 'none', cursor: 'default', label: '' };

function actionBuilding(state: GameState, building: Building): PointerAction {
  const def = BUILDING_DEFS[building.type];
  return { kind: 'building', cursor: 'pointer', label: `${def.name} 작업`, buildingId: building.id };
}

function actionInvalid(label: string): PointerAction {
  return { kind: 'invalid', cursor: 'not-allowed', label };
}

function tileBuilding(state: GameState, tile: Tile): Building | undefined {
  return tile.buildingId == null ? undefined : getBuilding(state, tile.buildingId);
}

export function tileBelongsToBuilding(state: GameState, tile: Tile, building: Building): boolean {
  const footprint = buildingFootprintTiles(state, building.type, building.x, building.y);
  return !!footprint?.some(part => part.x === tile.x && part.y === tile.y);
}

function activeHuntableTiles(state: GameState): Map<string, number> {
  return collectHuntableTiles(state.map, state.habitats, CONFIG.agents.hunting);
}

function buildingMatches(tile: Tile, building: Building | undefined, types: readonly Building['type'][]): boolean {
  return !!building && building.built && tile.buildingId === building.id && types.includes(building.type);
}

function workLabel(job: JobId, tile: Tile, building?: Building): string {
  if (job === 'hauler' && tile.terrain === 'rock') return tile.hasIron ? '철광 채석' : '채석';
  if (building) return `${BUILDING_DEFS[building.type].name} 작업`;
  return `${JOB_NAMES[job]} 작업`;
}

function isMoveTargetTile(tile: Tile): boolean {
  return tile.terrain !== 'forest' && tile.terrain !== 'rock';
}

function slottedAssignmentAction(state: GameState, residentId: number, tile: Tile): PointerAction | null {
  const building = tileBuilding(state, tile);
  if (!building || !building.built || tile.buildingId !== building.id || !workerSlotConfig(building.type)) {
    return null;
  }

  const reason = canAssignResidentToBuilding(state, residentId, building.id);
  if (reason) {
    return actionInvalid(reason === 'no available worker slots' ? 'No available worker slots' : reason);
  }

  return {
    kind: 'work',
    cursor: 'copy',
    label: `${BUILDING_DEFS[building.type].name} assignment`,
    x: tile.x,
    y: tile.y,
    buildingId: building.id,
  };
}

export function canResidentWorkTarget(
  state: GameState,
  job: JobId,
  tile: Tile,
): { ok: boolean; label: string; buildingId?: number } {
  const building = tileBuilding(state, tile);
  switch (job) {
    case 'farmer':
      return buildingMatches(tile, building, ['field', 'paddy'])
        ? { ok: true, label: '농사', buildingId: building?.id }
        : { ok: false, label: '농부가 일할 수 없는 대상입니다' };
    case 'miller':
      return buildingMatches(tile, building, ['watermill'])
        ? { ok: true, label: '방앗간 작업', buildingId: building?.id }
        : { ok: false, label: '방앗간이 아닙니다' };
    case 'builder':
      return building && !building.built
        ? { ok: true, label: '건설', buildingId: building.id }
        : { ok: false, label: '건설할 건물이 아닙니다' };
    case 'woodcutter':
      return tile.terrain === 'forest'
        ? { ok: true, label: '벌목' }
        : { ok: false, label: '벌목할 숲이 아닙니다' };
    case 'hunter':
      return activeHuntableTiles(state).has(`${tile.x},${tile.y}`)
        ? { ok: true, label: '사냥' }
        : { ok: false, label: '사냥 가능한 서식지가 아닙니다' };
    case 'herbalist':
      return getSeason(state.day) !== 'winter' && tile.terrain === 'forest'
        ? { ok: true, label: '약초 채집' }
        : { ok: false, label: '약초꾼이 일할 수 없는 대상입니다' };
    case 'miner':
      return buildingMatches(tile, building, ['mine'])
        ? { ok: true, label: '채광', buildingId: building?.id }
        : { ok: false, label: '채광장이 아닙니다' };
    case 'fisher':
      return buildingMatches(tile, building, ['ferry'])
        ? { ok: true, label: '고기잡이', buildingId: building?.id }
        : { ok: false, label: '나루터가 아닙니다' };
    case 'smith':
      return buildingMatches(tile, building, ['smithy'])
        ? { ok: true, label: '대장간 작업', buildingId: building?.id }
        : { ok: false, label: '대장간이 아닙니다' };
    case 'hauler':
      if (tile.terrain === 'rock') return { ok: true, label: workLabel(job, tile) };
      if (building && tile.buildingId === building.id && isHaulSourceBuilding(building)) {
        return {
          ok: true,
          label: `${BUILDING_DEFS[building.type].name} 강제 운송`,
          buildingId: building.id,
        };
      }
      return buildingMatches(tile, building, ['center', 'storehouse'])
        ? { ok: true, label: '하역/가공', buildingId: building?.id }
        : { ok: false, label: '운반꾼이 처리할 수 없는 대상입니다' };
    case 'charcoalBurner':
      return buildingMatches(tile, building, ['charcoalKiln'])
        ? { ok: true, label: '숯 굽기', buildingId: building?.id }
        : { ok: false, label: '숯가마가 아닙니다' };
    case 'herder':
      return buildingMatches(tile, building, ['stable'])
        ? { ok: true, label: '가축 돌보기', buildingId: building?.id }
        : { ok: false, label: '축사가 아닙니다' };
    case 'powderMaker':
      return buildingMatches(tile, building, ['nitreYard'])
        ? { ok: true, label: '화약 제조', buildingId: building?.id }
        : { ok: false, label: '염초장이 아닙니다' };
    case 'clerk':
      return buildingMatches(tile, building, ['office'])
        ? { ok: true, label: '관청 업무', buildingId: building?.id }
        : { ok: false, label: '관청이 아닙니다' };
    case 'watchman':
      return building && building.built && (building.type === 'center' || BUILDING_DEFS[building.type].defense > 0)
        ? { ok: true, label: '경계 근무', buildingId: building.id }
        : { ok: false, label: '경계 근무지가 아닙니다' };
    case 'militia':
      return buildingMatches(tile, building, ['garrison'])
        ? { ok: true, label: '조련', buildingId: building?.id }
        : { ok: false, label: '군영이 아닙니다' };
    default:
      return { ok: false, label: '현재 직업으로는 작업할 수 없습니다' };
  }
}

export function selectedEntityFromTile(state: GameState, tile: Tile): SelectedEntity {
  const building = tileBuilding(state, tile);
  return building ? { kind: 'building', id: building.id } : { kind: 'tile', x: tile.x, y: tile.y };
}

export function getPointerAction(
  state: GameState,
  selected: SelectedEntity | null,
  tile: Tile | null | undefined,
): PointerAction {
  if (!tile) return NONE_ACTION;

  const explored = isExplored(state, tile.x, tile.y);

  if (selected?.kind === 'building') {
    const building = getBuilding(state, selected.id);
    if (!building) return actionInvalid('건물을 찾을 수 없습니다');
    return tileBelongsToBuilding(state, tile, building) ? actionBuilding(state, building) : NONE_ACTION;
  }

  if (selected?.kind !== 'resident') {
    if (!explored) return NONE_ACTION;
    const building = tileBuilding(state, tile);
    return building ? actionBuilding(state, building) : NONE_ACTION;
  }

  const resident = state.residents.find(r => r.id === selected.id);
  if (!resident || !resident.alive) return actionInvalid('선택한 주민이 없습니다');

  if (!explored) {
    return isPassable(state, tile.x, tile.y)
      ? { kind: 'move', cursor: 'move', label: '탐색 이동', x: tile.x, y: tile.y }
      : actionInvalid('길을 찾을 수 없습니다');
  }

  const targetBuilding = tileBuilding(state, tile);
  const forcedHaulTarget = resident.job === 'hauler' && !!targetBuilding && isHaulSourceBuilding(targetBuilding);
  const assignment = forcedHaulTarget ? null : slottedAssignmentAction(state, resident.id, tile);
  if (assignment) return assignment;

  const work = canResidentWorkTarget(state, resident.job, tile);
  if (work.ok) {
    return {
      kind: 'work',
      cursor: 'copy',
      label: work.label,
      x: tile.x,
      y: tile.y,
      buildingId: work.buildingId,
    };
  }

  if (tile.buildingId == null && isMoveTargetTile(tile) && isPassable(state, tile.x, tile.y)) {
    return { kind: 'move', cursor: 'move', label: '이동', x: tile.x, y: tile.y };
  }

  return actionInvalid(work.label);
}

export function getBuildingActions(state: GameState, building: Building): BuildingActionItem[] {
  if (!building.built) return [];
  if (building.type === 'hut' && isBuildingUnlocked(state.rank, 'ondol')) {
    return [{ id: 'upgrade:ondol', label: '온돌집으로 개량' }];
  }
  if (building.type === 'ondol' && isBuildingUnlocked(state.rank, 'tileHouse')) {
    return [{ id: 'upgrade:tileHouse', label: '기와집으로 개량' }];
  }
  if (building.type === 'smithy') return [{ id: 'smithy', label: '생산 전환' }];
  if (building.type === 'market' || building.type === 'dock') return [{ id: 'trade', label: '교역 대상 선택' }];
  if (building.type === 'nitreYard') {
    return [{ id: 'nitre-toggle', label: state.nitrePaused ? '염초장 가동 재개' : '염초장 가동 중지' }];
  }
  return [];
}
