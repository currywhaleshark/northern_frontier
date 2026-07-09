// 상단 바: 자원, 날짜/계절/날씨, 인구 지표, 시간 조절, 저장/불러오기
import { RESOURCE_ICONS, RESOURCE_NAMES, RESOURCE_ORDER, SEASON_NAMES, WEATHER_ICONS, WEATHER_NAMES } from '../game/constants';
import { edibleFoodTotal } from '../game/resources';
import { avg, livingResidents } from '../game/residents';
import { getDayOfSeason, getSeason, getYear } from '../game/seasons';
import { TimeControls } from './TimeControls';
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
}

// 부족 경고를 띄울 자원 기준
function isLow(state: GameState, id: ResourceId, pop: number): boolean {
  if (id === 'food') return edibleFoodTotal(state) < pop * 3;
  if (id === 'firewood') return state.resources.firewood < pop * 2;
  if (id === 'clothes') return state.resources.clothes < pop * 0.5;
  if (id === 'tools') return state.resources.tools < 3;
  return false;
}

export function TopBar({
  state, speed, setSpeed, onSave, onLoad, onNewGame, onClearSave, canLoad,
  soundOn, onToggleSound,
}: Props) {
  const living = livingResidents(state);
  const pop = living.length;
  const sick = living.filter(r => r.sick).length;
  const foodTotal = edibleFoodTotal(state);
  const availableGrain = Math.max(0, state.resources.grain - (state.processingReserves?.grain ?? 0));

  return (
    <div className="topbar">
      <div className="topbar-row">
        {RESOURCE_ORDER.map(id => (
          <span
            key={id}
            className={`res-item${isLow(state, id, pop) ? ' low' : ''}`}
            title={id === 'food'
              ? `식량 총합 ${Math.floor(foodTotal)} (도정 곡식 ${Math.floor(state.resources.food)}, 곡물 사용 가능 ${Math.floor(availableGrain)}/보유 ${Math.floor(state.resources.grain)}, 고기 ${Math.floor(state.resources.meat)}, 생선 ${Math.floor(state.resources.fish)})`
              : RESOURCE_NAMES[id]}
          >
            {RESOURCE_ICONS[id]} <small>{id === 'food' ? '식량' : RESOURCE_NAMES[id]}</small>{' '}
            {Math.floor(id === 'food' ? foodTotal : state.resources[id])}
          </span>
        ))}
      </div>
      <div className="topbar-row">
        <span className="date-box">
          {getYear(state.day)}년차 {SEASON_NAMES[getSeason(state.day)]} {getDayOfSeason(state.day)}일
          {' '}{WEATHER_ICONS[state.weather]} {WEATHER_NAMES[state.weather]}
        </span>
        <span className="pop-box">
          인구 <b>{pop}</b> · 사망 <b>{state.totalDeaths}</b> · 병자 <b>{sick}</b> ·
          평균 건강 <b>{avg(state, 'health').toFixed(0)}</b> ·
          평균 사기 <b>{avg(state, 'morale').toFixed(0)}</b>
        </span>
        <span className={`threat-box${state.threat > 60 ? ' threat-high' : ''}`}>
          위협도 {state.threat.toFixed(0)}
        </span>
        <TimeControls speed={speed} setSpeed={setSpeed} paused={state.pendingChoice != null || state.gameOver != null} />
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
