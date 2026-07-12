// 상단 바: 자원, 날짜/계절/날씨, 인구 지표, 시간 조절, 저장/불러오기
import { useState } from 'react';
import { housingCapacity } from '../game/buildings';
import { CONFIG } from '../game/config';
import { RESOURCE_NAMES, RESOURCE_ORDER, SEASON_NAMES, WEATHER_ICONS, WEATHER_NAMES } from '../game/constants';
import { clothingCoverageTotal, foodTotal, fuelHeatTotal, luxuryStockTotal } from '../game/consumption';
import { CLOTHING_RESOURCES, FOOD_RESOURCES, FUEL_RESOURCES, LUXURY_RESOURCES } from '../game/resourceCatalog';
import { avg, livingResidents, residentHome } from '../game/residents';
import { getDayOfSeason, getSeason, getYear } from '../game/seasons';
import { tributeReserved, tributeReserveRatio } from '../game/tributeReserve';
import { TimeControls } from './TimeControls';
import { ResourceBreakdownPopover } from './ResourceBreakdownPopover';
import { ResourceIcon } from './TradeResourceIcon';
import type { ResourceIconId } from '../game/tradePresentation';
import type { GameState, ResourceId } from '../game/types';

interface Props {
  state: GameState;
  speed: number;
  setSpeed: (s: number) => void;
  onSave: () => void;
  onLoad: () => void;
  onNewGame: () => void;
  onClearSave: () => void;
  canLoad: boolean;
  soundOn: boolean;
  onToggleSound: () => void;
  onOpenCourt: () => void;
}

// 부족 경고를 띄울 자원 기준
function isLow(state: GameState, id: ResourceId, pop: number): boolean {
  if (id === 'tools') return state.resources.tools < 3;
  return false;
}

const GROUPED_RESOURCES = new Set<ResourceId>([
  ...FOOD_RESOURCES, ...FUEL_RESOURCES, ...CLOTHING_RESOURCES, ...LUXURY_RESOURCES,
]);

type ResourceGroupId = 'food' | 'fuel' | 'clothing' | 'luxury';

export function TopBar({
  state, speed, setSpeed, onSave, onLoad, onNewGame, onClearSave, canLoad,
  soundOn, onToggleSound, onOpenCourt,
}: Props) {
  const living = livingResidents(state);
  const pop = living.length;
  const sick = living.filter(r => r.sick).length;
  const housing = housingCapacity(state);
  const housed = living.filter(resident => residentHome(state, resident)).length;
  const homeless = pop - housed;
  const food = foodTotal(state);
  const fuel = fuelHeatTotal(state);
  const clothing = clothingCoverageTotal(state);
  const luxuries = luxuryStockTotal(state);
  const regularResources = RESOURCE_ORDER.filter(id => !GROUPED_RESOURCES.has(id));
  const [hoveredGroup, setHoveredGroup] = useState<ResourceGroupId | null>(null);
  const [pinnedGroups, setPinnedGroups] = useState<Partial<Record<ResourceGroupId, boolean>>>({});
  const tribute = state.courtTribute && !state.courtTribute.resolved ? state.courtTribute : null;
  const tributeRatio = tribute ? tributeReserveRatio(state, tribute) : 0;
  const tributeDays = tribute ? Math.max(0, tribute.dueDay - state.day) : 0;
  const crackdownDays = state.crackdownDeadline > 0
    ? Math.max(0, state.crackdownDeadline - state.day)
    : 0;
  const groups: Array<{
    id: ResourceGroupId;
    title: string;
    icon: ResourceIconId;
    total: number;
    low: boolean;
    resources: readonly ResourceId[];
  }> = [
    { id: 'food', title: '식량', icon: 'foodGroup', total: food, low: food < pop * 3, resources: FOOD_RESOURCES },
    { id: 'fuel', title: '땔감', icon: 'fuelGroup', total: fuel, low: fuel < pop * 2, resources: FUEL_RESOURCES },
    { id: 'clothing', title: '옷', icon: 'clothingGroup', total: clothing, low: clothing < pop * 0.5, resources: CLOTHING_RESOURCES },
    { id: 'luxury', title: '사치품', icon: 'luxuryGroup', total: luxuries, low: false, resources: LUXURY_RESOURCES },
  ];

  return (
    <div className="topbar">
      <div className="topbar-row">
        {groups.map(group => {
          const open = hoveredGroup === group.id || !!pinnedGroups[group.id];
          return (
            <div
              key={group.id}
              className={`res-item grouped${group.low ? ' low' : ''}`}
              onMouseEnter={() => setHoveredGroup(group.id)}
              onMouseLeave={() => setHoveredGroup(current => current === group.id ? null : current)}
            >
              <ResourceIcon resource={group.icon} size={18} />
              <small>{group.title}</small> {Math.floor(group.total)}
              {open && (
                <ResourceBreakdownPopover
                  title={group.title}
                  pinned={!!pinnedGroups[group.id]}
                  onTogglePinned={() => setPinnedGroups(current => ({
                    ...current, [group.id]: !current[group.id],
                  }))}
                  items={group.resources.map(id => ({
                    id, label: RESOURCE_NAMES[id], amount: state.resources[id],
                  }))}
                />
              )}
            </div>
          );
        })}
        {regularResources.map(id => (
          <span
            key={id}
            className={`res-item${isLow(state, id, pop) ? ' low' : ''}`}
            title={RESOURCE_NAMES[id]}
          >
            <ResourceIcon resource={id} size={18} />
            <small>{RESOURCE_NAMES[id]}</small>{' '}
            {Math.floor(state.resources[id])}
          </span>
        ))}
      </div>
      {(tribute || state.crackdownDeadline > 0) && (
        <div className="topbar-objectives" aria-label="지속 관리 항목">
          {tribute && (
            <button
              type="button"
              className={`ongoing-objective tribute ${tributeRatio >= 1 ? 'ready' : tributeDays <= 10 ? 'urgent' : ''}`}
              title="조정 탭에서 세공고 비축량 관리"
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
              title="조정 탭에서 모반 의심 관리"
              onClick={onOpenCourt}
            >
              <span className="objective-title">토벌 유예</span>
              <span className="objective-deadline">{crackdownDays}일 남음</span>
              <span>의심 {state.suspicion.toFixed(0)} / {CONFIG.suspicion.crackdownClearBelow} 미만</span>
            </button>
          )}
        </div>
      )}
      <div className="topbar-row">
        <span className="date-box">
          {getYear(state.day)}년차 {SEASON_NAMES[getSeason(state.day)]} {getDayOfSeason(state.day)}일
          {' '}{WEATHER_ICONS[state.weather]} {WEATHER_NAMES[state.weather]}
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
          <TimeControls speed={speed} setSpeed={setSpeed} paused={state.pendingChoice != null || state.tacticalBattle != null || state.tacticalBattleReport != null || state.gameOver != null} />
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button className="btn" onClick={onToggleSound} title={soundOn ? '소리 끄기' : '소리 켜기'}>
            {soundOn ? '🔊' : '🔇'}
          </button>
          <button className="btn" onClick={onSave}>저장</button>
          <button className="btn" onClick={onLoad} disabled={!canLoad}>불러오기</button>
          <button className="btn" onClick={onNewGame}>새 게임</button>
          <button className="btn" onClick={onClearSave}>저장 초기화</button>
        </span>
      </div>
    </div>
  );
}
