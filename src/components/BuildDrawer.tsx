// 하단 건설 드로어: 카테고리 바는 상시 노출하고 상세 목록은 비모달로 펼친다.
import { useEffect, useRef, useState } from 'react';
import { BUILDING_DEFS, canAfford, cannonPlacementsUsed, isBuildingUnlocked } from '../game/buildings';
import { RANK_NAMES, RESOURCE_NAMES } from '../game/constants';
import { getSeason } from '../game/seasons';
import { getActiveSprites } from '../render/atlas';
import {
  BUILD_CATEGORIES,
  beginBuildPlacement,
  buildCategoryFor,
  closedBuildDrawerState,
  finishBuildPlacement,
  isBuildableBuildingType,
  toggleBuildDrawerCategory,
  type BuildCategoryId,
  type BuildableBuildingTypeId,
} from '../ui/buildPresentation';
import type { UiPrefs } from '../ui/uiPrefs';
import type { BuildingTypeId, GameState, ResourceId } from '../game/types';
import { BuildingIcon } from './BuildingIcon';
import { UiIcon } from './UiIcon';

interface Props {
  state: GameState;
  placingType: BuildingTypeId | null;
  setPlacingType: (type: BuildingTypeId | null) => void;
  onClearSelection: () => void;
  uiPrefs: UiPrefs;
  onUiPrefsChange: (update: (current: UiPrefs) => UiPrefs) => void;
  shortcutsEnabled?: boolean;
}

function costText(type: BuildableBuildingTypeId): string {
  const parts = Object.entries(BUILDING_DEFS[type].cost).map(
    ([resource, amount]) => `${RESOURCE_NAMES[resource as ResourceId]} ${amount}`,
  );
  return parts.length > 0 ? parts.join(' · ') : '무료';
}

function buildingTooltip(type: BuildableBuildingTypeId, reason: string | null): string {
  const def = BUILDING_DEFS[type];
  return [
    def.desc,
    `${costText(type)} · 공기 ${def.buildDays}일`,
    reason ? `사용 불가: ${reason}` : null,
  ].filter((line): line is string => line != null).join('\n');
}

function unavailableReason(state: GameState, type: BuildableBuildingTypeId): string | null {
  const def = BUILDING_DEFS[type];
  if (!isBuildingUnlocked(state.rank, type)) {
    return `${RANK_NAMES[def.minRank!]} 승격 필요`;
  }
  if (def.unique && state.buildings.some(building => building.type === type)) {
    return '이미 건설 완료';
  }
  if (type === 'cannonEmplacement' && cannonPlacementsUsed(state) >= state.cannonsGranted) {
    return '조정의 불랑기 하사 필요';
  }
  if (type === 'shrine' && !(state.unlockedReligions ?? []).includes('shamanism')) {
    return '무당이 마을에 들어와야 합니다';
  }
  if (type === 'hermitage' && !(state.unlockedReligions ?? []).includes('buddhism')) {
    return '노승이 마을에 의탁해야 합니다';
  }
  if (!canAfford(state, def)) return '자원 부족';
  return null;
}

function isTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

function BuildingThumb({ type, state }: { type: BuildableBuildingTypeId; state: GameState }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    getActiveSprites().drawBuilding(context, {
      type,
      built: true,
      ghost: false,
      progress01: 1,
      season: getSeason(state.day),
      growth01: type === 'field' || type === 'paddy' ? 0.8 : undefined,
      x: 4,
      y: 20,
      size: 24,
    });
  });
  return <canvas ref={ref} className="build-drawer-thumb" width={32} height={44} aria-hidden="true" />;
}

export function BuildDrawer({
  state, placingType, setPlacingType, onClearSelection, uiPrefs, onUiPrefsChange, shortcutsEnabled = true,
}: Props) {
  const [drawerState, setDrawerState] = useState(closedBuildDrawerState);
  const [hoveredTooltipType, setHoveredTooltipType] = useState<BuildableBuildingTypeId | null>(null);
  const [focusedTooltipType, setFocusedTooltipType] = useState<BuildableBuildingTypeId | null>(null);
  const previousPlacingRef = useRef<BuildingTypeId | null>(placingType);
  const openCategory = drawerState.openCategory;
  const tooltipType = hoveredTooltipType ?? focusedTooltipType;
  const activeCategory = BUILD_CATEGORIES.find(category => category.id === openCategory) ?? null;
  const placingCategory = placingType && isBuildableBuildingType(placingType)
    ? buildCategoryFor(placingType)
    : null;
  // BUILD_MENU_ORDER에서 온 카테고리 내 순서는 그대로 두고, 현재 가능한 건물만 앞에 모은다.
  const buildItems = activeCategory?.types.map(type => ({
    type,
    reason: unavailableReason(state, type),
    rankLocked: !isBuildingUnlocked(state.rank, type),
    resourceShortage: isBuildingUnlocked(state.rank, type) && !canAfford(state, BUILDING_DEFS[type]),
  })) ?? [];
  const currentRankBuildItems = buildItems.filter(item => !item.rankLocked);
  const rankLockedBuildItems = buildItems.filter(item => item.rankLocked);

  const rememberCategory = (category: BuildCategoryId) => {
    onUiPrefsChange(current => current.buildDrawerLastCategory === category
      ? current
      : { ...current, buildDrawerLastCategory: category });
  };

  useEffect(() => {
    const previous = previousPlacingRef.current;
    if (previous && !placingType) {
      const fallback = isBuildableBuildingType(previous)
        ? buildCategoryFor(previous)
        : uiPrefs.buildDrawerLastCategory;
      setDrawerState(current => finishBuildPlacement(current, fallback));
    } else if (!previous && placingType) {
      setDrawerState(current => ({ ...current, openCategory: null }));
    }
    previousPlacingRef.current = placingType;
  }, [placingType, uiPrefs.buildDrawerLastCategory]);

  useEffect(() => {
    setHoveredTooltipType(null);
    setFocusedTooltipType(null);
  }, [openCategory]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!shortcutsEnabled || event.key.toLowerCase() !== 'b' || event.altKey || event.ctrlKey || event.metaKey || isTextInput(event.target)) {
        return;
      }
      event.preventDefault();
      if (placingType) {
        setPlacingType(null);
        return;
      }
      setDrawerState(current => toggleBuildDrawerCategory(current, uiPrefs.buildDrawerLastCategory));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [placingType, setPlacingType, shortcutsEnabled, uiPrefs.buildDrawerLastCategory]);

  const toggleCategory = (category: BuildCategoryId) => {
    rememberCategory(category);
    if (placingType) {
      setDrawerState({ openCategory: category, restoreCategory: category });
      setPlacingType(null);
      return;
    }
    setDrawerState(current => toggleBuildDrawerCategory(current, category));
  };

  const startPlacement = (type: BuildableBuildingTypeId) => {
    const category = buildCategoryFor(type);
    rememberCategory(category);
    onClearSelection();
    setDrawerState(current => beginBuildPlacement(current, category));
    setPlacingType(type);
  };

  const renderBuildItem = ({ type, reason, rankLocked, resourceShortage }: {
    type: BuildableBuildingTypeId;
    reason: string | null;
    rankLocked: boolean;
    resourceShortage: boolean;
  }) => {
    const def = BUILDING_DEFS[type];
    return (
      <button
        key={type}
        type="button"
        className={`build-drawer-item${reason ? ' disabled' : ''}${rankLocked ? ' rank-locked' : ''}${resourceShortage ? ' resource-shortage' : ''}`}
        data-tut={`build-item-${type}`}
        aria-disabled={reason != null}
        aria-describedby={tooltipType === type ? 'build-drawer-tooltip' : undefined}
        aria-label={def.name}
        title={reason ? `사용 불가: ${reason}` : def.name}
        onMouseEnter={() => setHoveredTooltipType(type)}
        onMouseLeave={() => setHoveredTooltipType(current => current === type ? null : current)}
        onFocus={() => setFocusedTooltipType(type)}
        onBlur={() => setFocusedTooltipType(current => current === type ? null : current)}
        onClick={() => { if (!reason) startPlacement(type); }}
      >
        <BuildingThumb type={type} state={state} />
        <strong className="build-drawer-item-name">{def.name}</strong>
        {rankLocked && <UiIcon name="lock" size={18} className="build-drawer-item-lock" />}
        {resourceShortage && <span className="build-drawer-item-status">자원 부족</span>}
      </button>
    );
  };

  return (
    <div className="build-drawer-shell" aria-label="건설 도구">
      {placingType && isBuildableBuildingType(placingType) && (
        <div className="build-placement-status" role="status">
          <BuildingIcon type={placingType} size={26} />
          <strong>{BUILDING_DEFS[placingType].name} 배치 중</strong>
          <span>지도 클릭 · Esc/우클릭 취소</span>
          <button type="button" onClick={() => setPlacingType(null)}>취소</button>
        </div>
      )}

      {activeCategory && (
        <section
          id="build-drawer-panel"
          className="build-drawer-panel"
          aria-label={`${activeCategory.label} 건설 목록`}
        >
          {tooltipType && activeCategory.types.includes(tooltipType) && (
            <div id="build-drawer-tooltip" className="build-drawer-tooltip" role="tooltip">
              {buildingTooltip(tooltipType, unavailableReason(state, tooltipType))}
            </div>
          )}
          <header className="build-drawer-head">
            <div>
              <UiIcon name={activeCategory.icon} size={24} />
              <strong>{activeCategory.label}</strong>
              <small>{activeCategory.types.length}종</small>
            </div>
            <button
              type="button"
              aria-label="건설 목록 닫기"
              onClick={() => setDrawerState(current => ({ ...current, openCategory: null }))}
            >×</button>
          </header>
          <div className="build-drawer-list">
            <div className="build-drawer-group-label" role="heading" aria-level={2}>
              <span>현재 단계</span><small>{currentRankBuildItems.length}종 · 자원 부족 항목도 여기에 표시</small>
            </div>
            {currentRankBuildItems.map(renderBuildItem)}
            {rankLockedBuildItems.length > 0 && (
              <div className="build-drawer-group-label unavailable" role="heading" aria-level={2}>
                <span>승격 후 해금</span><small>{rankLockedBuildItems.length}종</small>
              </div>
            )}
            {rankLockedBuildItems.map(renderBuildItem)}
          </div>
        </section>
      )}

      <div className="build-category-bar" role="group" aria-label="건설 카테고리">
        <span className="build-category-bar-label">건설 <kbd>B</kbd></span>
        {BUILD_CATEGORIES.map(category => {
          const open = openCategory === category.id;
          const placing = placingCategory === category.id;
          return (
            <button
              key={category.id}
              type="button"
              className={`${open ? 'active' : ''}${placing ? ' placing' : ''}`}
              data-tut={`build-cat-${category.id}`}
              title={`${category.label} 건설 목록${placing ? ' · 현재 배치 중' : ''}`}
              aria-controls="build-drawer-panel"
              aria-expanded={open}
              aria-pressed={open}
              onClick={() => toggleCategory(category.id)}
            >
              <UiIcon name={category.icon} size={22} />
              <span>{category.label}</span>
              {placing && <i aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
