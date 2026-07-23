// 상단 바: 자원, 날짜/계절/날씨, 인구 지표, 시간 조절, 저장/불러오기
import { useState } from 'react';
import { housingCapacity } from '../game/buildings';
import { CONFIG } from '../game/config';
import { RANK_NAMES, RESOURCE_NAMES, SEASON_NAMES, WEATHER_ICONS, WEATHER_NAMES } from '../game/constants';
import { nextRank } from '../game/promotion';
import { avg, livingResidents, residentHome } from '../game/residents';
import { getDayOfSeason, getSeason, getYear } from '../game/seasons';
import { spoilagePreview } from '../game/spoilage';
import { tributeReserved, tributeReserveRatio } from '../game/tributeReserve';
import {
  DISPLAY_RESOURCE_ORDER,
  METRIC_RESOURCE_IDS,
  RESOURCE_DISPLAY_GROUPS,
  isResourceDisplayGroupLow,
  isResourceLow,
  resourceDisplayGroupTotal,
  type ResourceDisplayGroupId,
} from '../ui/resourceDisplay';
import {
  MAX_STARRED_RESOURCES,
  togglePinnedResourceGroup,
  toggleStarredResource,
  type UiPrefs,
} from '../ui/uiPrefs';
import { currentScenarioStep } from '../game/scenario';
import { DAY_BAND_ICONS, DAY_BAND_NAMES, uiDayBand } from '../ui/dayBand';
import { TimeControls } from './TimeControls';
import { ResourceBreakdownPopover } from './ResourceBreakdownPopover';
import { ResourceIcon } from './TradeResourceIcon';
import type { GameState, ResourceId } from '../game/types';

interface Props {
  state: GameState;
  speed: number;
  setSpeed: (s: number) => void;
  onOpenMenu: () => void;
  onOpenCourt: () => void;
  uiPrefs: UiPrefs;
  onUiPrefsChange: (update: (current: UiPrefs) => UiPrefs) => void;
}

export function TopBar({
  state, speed, setSpeed, onOpenMenu, onOpenCourt, uiPrefs, onUiPrefsChange,
}: Props) {
  const living = livingResidents(state);
  const pop = living.length;
  const sick = living.filter(r => r.sick).length;
  const housing = housingCapacity(state);
  const housed = living.filter(resident => residentHome(state, resident)).length;
  const homeless = pop - housed;
  const [hoveredGroup, setHoveredGroup] = useState<ResourceDisplayGroupId | null>(null);
  const [focusedGroup, setFocusedGroup] = useState<ResourceDisplayGroupId | null>(null);
  const starredResources = DISPLAY_RESOURCE_ORDER.filter(resource => uiPrefs.starredResources.includes(resource));
  const starLimitReached = uiPrefs.starredResources.length >= MAX_STARRED_RESOURCES;
  const tribute = state.courtTribute && !state.courtTribute.resolved ? state.courtTribute : null;
  const tributeRatio = tribute ? tributeReserveRatio(state, tribute) : 0;
  const tributeDays = tribute ? Math.max(0, tribute.dueDay - state.day) : 0;
  const crackdownDays = state.crackdownDeadline > 0
    ? Math.max(0, state.crackdownDeadline - state.day)
    : 0;
  const promotionTarget = state.victoryProgressNote ? nextRank(state.rank) : null;
  const scenarioStep = currentScenarioStep(state);
  const spoilage = spoilagePreview(state);
  return (
    <div className="topbar">
      <div className="topbar-row topbar-resource-row" aria-label="자원 현황">
        <div className="topbar-resource-fixed">
          {RESOURCE_DISPLAY_GROUPS.map(group => {
            const pinned = uiPrefs.pinnedResourceGroups.includes(group.id);
            const open = hoveredGroup === group.id || focusedGroup === group.id || pinned;
            const low = isResourceDisplayGroupLow(state, group.id, pop);
            const popoverId = `resource-group-${group.id}-popover`;
            return (
              <div
                key={group.id}
                className="resource-group-wrap"
                onMouseEnter={() => setHoveredGroup(group.id)}
                onMouseLeave={() => setHoveredGroup(current => current === group.id ? null : current)}
                onFocusCapture={() => setFocusedGroup(group.id)}
                onBlurCapture={event => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setFocusedGroup(current => current === group.id ? null : current);
                  }
                }}
              >
                <button
                  type="button"
                  className={`res-item grouped${low ? ' low' : ''}`}
                  title={`${group.title} 상세 재고${pinned ? ' 고정 해제' : ' 열고 고정'}`}
                  aria-haspopup="dialog"
                  aria-expanded={open}
                  aria-controls={popoverId}
                  aria-pressed={pinned}
                  onClick={() => onUiPrefsChange(current => togglePinnedResourceGroup(current, group.id))}
                >
                  <ResourceIcon resource={group.icon} size={18} />
                  <small>{group.title}</small> {Math.floor(resourceDisplayGroupTotal(state, group.id))}
                </button>
                {open && (
                  <ResourceBreakdownPopover
                    id={popoverId}
                    title={group.title}
                    pinned={pinned}
                    starLimitReached={starLimitReached}
                    onTogglePinned={() => onUiPrefsChange(current => togglePinnedResourceGroup(current, group.id))}
                    onToggleStarred={resource => onUiPrefsChange(current => toggleStarredResource(current, resource))}
                    items={group.resources.map(resource => ({
                      id: resource,
                      label: RESOURCE_NAMES[resource],
                      amount: state.resources[resource],
                      spoilagePerDay: spoilage.items[resource]?.loss ?? 0,
                      low: isResourceLow(state, resource, pop),
                      starred: uiPrefs.starredResources.includes(resource),
                    }))}
                  />
                )}
              </div>
            );
          })}
          {METRIC_RESOURCE_IDS.map(resource => (
            <span key={resource} className="res-item metric" title={RESOURCE_NAMES[resource]}>
              <ResourceIcon resource={resource} size={18} />
              <small>{RESOURCE_NAMES[resource]}</small>{' '}
              {Math.floor(state.resources[resource])}
            </span>
          ))}
        </div>
        {starredResources.length > 0 && (
          <div className="topbar-starred-resources" aria-label="별표 자원">
            {starredResources.map(resource => (
              <span
                key={resource}
                className={`res-item starred${isResourceLow(state, resource, pop) ? ' low' : ''}`}
                title={`${RESOURCE_NAMES[resource]} — 그룹 팝오버에서 별표 해제`}
              >
                <ResourceIcon resource={resource} size={18} />
                <small>{RESOURCE_NAMES[resource]}</small>{' '}
                {Math.floor(state.resources[resource])}
              </span>
            ))}
          </div>
        )}
      </div>
      {(scenarioStep || tribute || state.crackdownDeadline > 0 || promotionTarget) && (
        <div className="topbar-objectives" aria-label="지속 관리 항목">
          {scenarioStep && (
            <div className="ongoing-objective scenario" title="길잡이 시나리오의 현재 목표">
              <span className="objective-title">길잡이</span>
              <span className="objective-deadline">{scenarioStep.title}</span>
              <span className="objective-summary">{scenarioStep.goal(state)}</span>
            </div>
          )}
          {tribute && (
            <button
              type="button"
              className={`ongoing-objective tribute ${tributeRatio >= 1 ? 'ready' : tributeDays <= 10 ? 'urgent' : ''}`}
              data-tut="tribute-chip"
              title="조정 창에서 세공고 비축량 관리"
              onClick={onOpenCourt}
            >
              <span className="objective-title">세공</span>
              <span className="objective-deadline">
                {tributeRatio >= 1 ? '준비 완료' : tributeDays > 0 ? `${tributeDays}일 남음` : '수거일'}
              </span>
              <span className="objective-items">
                {(Object.entries(tribute.items) as [ResourceId, number][]).map(([resource, required]) => (
                  <span key={resource} className={tributeReserved(state, resource) >= required ? 'complete' : undefined}>
                    <ResourceIcon resource={resource} size={18} />
                    {RESOURCE_NAMES[resource]} {Math.floor(tributeReserved(state, resource))}/{required}
                  </span>
                ))}
              </span>
            </button>
          )}
          {state.crackdownDeadline > 0 && (
            <button
              type="button"
              className="ongoing-objective urgent"
              title="조정 창에서 모반 의심 관리"
              onClick={onOpenCourt}
            >
              <span className="objective-title">토벌 유예</span>
              <span className="objective-deadline">{crackdownDays}일 남음</span>
              <span>의심 {state.suspicion.toFixed(0)} / {CONFIG.suspicion.crackdownClearBelow} 미만</span>
            </button>
          )}
          {promotionTarget && (
            <button
              type="button"
              className="ongoing-objective promotion"
              title="조정 창에서 다음 승격 조건 확인"
              onClick={onOpenCourt}
            >
              <span className="objective-title">다음 승격</span>
              <span className="objective-deadline">{RANK_NAMES[promotionTarget]}</span>
              <span className="objective-summary">{state.victoryProgressNote}</span>
            </button>
          )}
        </div>
      )}
      <div className="topbar-row">
        <span className="date-box">
          {getYear(state.day)}년차 {SEASON_NAMES[getSeason(state.day)]} {getDayOfSeason(state.day)}일
          {' '}{WEATHER_ICONS[state.weather]} {WEATHER_NAMES[state.weather]}
          {' '}{DAY_BAND_ICONS[uiDayBand(state.subTick)]} {DAY_BAND_NAMES[uiDayBand(state.subTick)]}
        </span>
        <span className="pop-box">
          인구 <b>{pop}</b> · 주거 <b className={homeless > 0 ? 'housing-shortage' : undefined}
            title={`입주 ${housed}명 / 수용 ${housing.total}명`}>{housed}/{housing.total}</b>
          {homeless > 0 && <> · 노숙 <b className="housing-shortage">{homeless}</b></>}
          {' '}· 사망 <b>{state.totalDeaths}</b> · 병자 <b>{sick}</b> ·
          평균 건강 <b>{avg(state, 'health').toFixed(0)}</b> ·
          평균 사기 <b>{avg(state, 'morale').toFixed(0)}</b>
        </span>
        <span className={`threat-box${state.threat > 60 ? ' threat-high' : ''}`}>
          위협도 {state.threat.toFixed(0)}
        </span>
          <TimeControls speed={speed} setSpeed={setSpeed} paused={state.pendingChoice != null || state.pendingPromotionNotice != null || state.tacticalBattle != null || state.tacticalBattleReport != null || state.gameOver != null} />
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button className="btn topbar-menu-button" onClick={onOpenMenu} title="게임 메뉴 (Esc)" aria-label="게임 메뉴 열기">
            ☰ <kbd>Esc</kbd>
          </button>
        </span>
      </div>
    </div>
  );
}
