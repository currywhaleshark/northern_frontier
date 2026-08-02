import { useState } from 'react';
import { BUILDING_DEFS } from '../game/buildings';
import type { BuildingTypeId, GameState } from '../game/types';
import {
  buildingFinderStatusLabel, buildingTypesInUse, filteredBuildingResults, nextBuildingResult,
  type BuildingFinderStatus,
} from '../ui/buildingFinder';

interface Props {
  state: GameState;
  selectedBuildingId: number | null;
  onFocusBuilding: (buildingId: number) => void;
}

const RESULT_RENDER_LIMIT = 40;

export function BuildingFinder({ state, selectedBuildingId, onFocusBuilding }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<BuildingTypeId | null>(null);
  const [status, setStatus] = useState<BuildingFinderStatus>('all');
  const types = buildingTypesInUse(state.buildings);
  const results = filteredBuildingResults(state.buildings, { query, type, status });
  const selectedIndex = selectedBuildingId == null
    ? -1
    : results.findIndex(building => building.id === selectedBuildingId);

  const cycle = (direction: 1 | -1) => {
    const target = nextBuildingResult(results, selectedBuildingId, direction);
    if (target) onFocusBuilding(target.id);
  };

  return (
    <div className="building-finder">
      <button
        type="button"
        className={`minimap-center-btn${open ? ' active' : ''}`}
        title="건물 찾기"
        aria-label="건물 찾기"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
      >⌕</button>
      {open && (
        <section className="building-finder-popover" aria-label="지도 건물 찾기">
          <header>
            <strong>건물 찾기</strong>
            <button type="button" className="icon-btn" aria-label="건물 찾기 닫기" onClick={() => setOpen(false)}>×</button>
          </header>
          <input
            type="search"
            value={query}
            autoFocus
            placeholder="이름 검색 (예: 벌목장)"
            aria-label="건물 이름 검색"
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') cycle(event.shiftKey ? -1 : 1);
              if (event.key === 'Escape') setOpen(false);
            }}
          />
          <div className="building-finder-filters">
            <select
              value={type ?? ''}
              aria-label="건물 종류 필터"
              onChange={event => setType(event.target.value ? event.target.value as BuildingTypeId : null)}
            >
              <option value="">모든 종류 ({state.buildings.length})</option>
              {types.map(entry => (
                <option key={entry.type} value={entry.type}>{BUILDING_DEFS[entry.type].name} ({entry.count})</option>
              ))}
            </select>
            <select
              value={status}
              aria-label="건물 상태 필터"
              onChange={event => setStatus(event.target.value as BuildingFinderStatus)}
            >
              <option value="all">모든 상태</option>
              <option value="operational">가동 가능</option>
              <option value="construction">건설·변경 중</option>
              <option value="repairing">파손·수리 중</option>
            </select>
          </div>
          <div className="building-finder-nav">
            <button type="button" disabled={results.length === 0} onClick={() => cycle(-1)}>이전</button>
            <span>{selectedIndex >= 0 ? `${selectedIndex + 1}/${results.length}` : `${results.length}개`}</span>
            <button type="button" disabled={results.length === 0} onClick={() => cycle(1)}>다음</button>
          </div>
          <div className="building-finder-results" role="listbox" aria-label="건물 검색 결과">
            {results.length === 0 && <div className="muted small">조건에 맞는 건물이 없습니다.</div>}
            {results.slice(0, RESULT_RENDER_LIMIT).map(building => (
              <button
                type="button"
                role="option"
                aria-selected={building.id === selectedBuildingId}
                className={building.id === selectedBuildingId ? 'active' : ''}
                key={building.id}
                onClick={() => onFocusBuilding(building.id)}
              >
                <span>{BUILDING_DEFS[building.type].name}</span>
                <small>{buildingFinderStatusLabel(building)} · {building.x}, {building.y}</small>
              </button>
            ))}
            {results.length > RESULT_RENDER_LIMIT && (
              <div className="muted small">목록은 처음 {RESULT_RENDER_LIMIT}개만 표시합니다. 이전·다음으로 전체를 순환할 수 있습니다.</div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
