// 주요 위기 알림 패널
import { CONFIG } from '../game/config';
import { foodTotal, fuelHeatTotal } from '../game/consumption';
import { avg, livingResidents, residentHome } from '../game/residents';
import { getSeason } from '../game/seasons';
import { firewoodWeatherMult } from '../game/weather';
import type { AlertItem, GameState } from '../game/types';

export function computeAlerts(state: GameState): AlertItem[] {
  const alerts: AlertItem[] = [];
  const living = livingResidents(state);
  const pop = living.length;
  if (pop === 0) return alerts;
  const season = getSeason(state.day);

  const homeless = living.filter(resident => !residentHome(state, resident)).length;
  if (homeless > 0) {
    alerts.push({
      id: 'homeless',
      text: `노숙 주민 ${homeless}명: 입주할 집이 부족합니다.`,
      level: homeless >= Math.max(2, Math.ceil(pop * 0.25)) ? 'danger' : 'warn',
    });
  }

  const foodDays = foodTotal(state) / (pop * CONFIG.needs.foodPerDay);
  if (foodDays < 4) alerts.push({ id: 'food2', text: `식량 부족! 남은 식량이 ${Math.floor(foodDays)}일치뿐입니다.`, level: 'danger' });
  else if (foodDays < 10) alerts.push({ id: 'food1', text: `식량이 넉넉하지 않습니다. (약 ${Math.floor(foodDays)}일치)`, level: 'warn' });

  const fwPerDay = pop * CONFIG.needs.firewoodPerPerson *
    CONFIG.seasons.firewoodMult[season] * firewoodWeatherMult(state.weather);
  const fwDays = fwPerDay > 0 ? fuelHeatTotal(state) / fwPerDay : 99;
  if (season === 'winter' || season === 'autumn') {
    if (fwDays < 4) alerts.push({ id: 'fw2', text: `장작 부족! 현재 속도라면 ${Math.floor(fwDays)}일이면 바닥납니다.`, level: 'danger' });
    else if (fwDays < 10) alerts.push({ id: 'fw1', text: `장작이 빠르게 줄고 있습니다. (약 ${Math.floor(fwDays)}일치)`, level: 'warn' });
  }

  const warmth = avg(state, 'warmth');
  if (warmth < 30) alerts.push({ id: 'cold2', text: '주민들이 얼어붙고 있습니다! 장작과 옷, 온돌집이 필요합니다.', level: 'danger' });
  else if (warmth < 45) alerts.push({ id: 'cold1', text: '추위 위험: 주민 평균 체온이 낮습니다.', level: 'warn' });

  const sick = living.filter(r => r.sick).length;
  if (sick > 0) alerts.push({ id: 'sick', text: `질병 발생: ${sick}명이 앓고 있습니다. 약초가 회복을 돕습니다.`, level: sick >= pop * 0.25 ? 'danger' : 'warn' });

  const damagedBuildings = state.buildings.filter(building => building.repairing).length;
  if (damagedBuildings > 0) {
    alerts.push({
      id: 'buildingDamage',
      text: `습격 피해: 건물 ${damagedBuildings}채가 파손되었습니다. 건설담당이 수리를 우선합니다.`,
      level: 'danger',
    });
  }

  const wolfThreat = state.incidents?.predatorThreats.wolf;
  const tigerThreat = state.incidents?.predatorThreats.tiger;
  const boarThreat = state.incidents?.predatorThreats.boar;
  if (tigerThreat) {
    alerts.push({
      id: 'tigerThreat',
      text: `호랑이 출몰 ${Math.max(1, tigerThreat.untilDay - state.day)}일: 낮의 숲과 밤의 마을이 위험합니다.`,
      level: 'danger',
    });
  }
  if (wolfThreat) {
    alerts.push({
      id: 'wolfThreat',
      text: `늑대 출몰 ${Math.max(1, wolfThreat.untilDay - state.day)}일: 숲에 드나드는 주민이 위험합니다.`,
      level: 'warn',
    });
  }
  if (boarThreat) {
    alerts.push({
      id: 'boarThreat',
      text: `멧돼지 출몰 ${Math.max(1, boarThreat.untilDay - state.day)}일: 밤마다 농작물과 저장 식량이 위험합니다.`,
      level: 'warn',
    });
  }
  if (state.incidents?.plagueCase) {
    alerts.push({
      id: 'plagueCase',
      text: `역병 의심 환자 관찰 중: ${Math.max(1, state.incidents.plagueCase.resolvesOnDay - state.day)}일 뒤 경과를 확인합니다.`,
      level: state.incidents.plagueCase.isolated ? 'warn' : 'danger',
    });
  }
  if (state.incidents?.epidemic) {
    alerts.push({
      id: 'epidemic',
      text: `역병 유행: 환자 ${state.incidents.epidemic.infectedIds.length}명${state.incidents.epidemic.mode === 'isolated' ? ' 격리 중' : ''}.`,
      level: 'danger',
    });
  }

  if (state.raiders) {
    alerts.push({
      id: 'raidIncoming',
      text: state.battle
        ? state.battle.location === 'village' || state.battle.mode === 'levy'
          ? `마을 안에서 ${state.raiders.faction}과(와) 방어전이 벌어지고 있습니다!`
          : `마을 외곽에서 ${state.raiders.faction}을(를) 요격 중입니다.`
        : state.raiders.spotted
          ? `습격 임박! ${state.raiders.faction}이(가) 마을로 접근 중입니다. 방비를 갖추십시오.`
          : '불길한 기척이 감돕니다. 국경 쪽 개들이 짖어댑니다.',
      level: 'danger',
    });
  } else if (state.threat > 80) {
    alerts.push({ id: 'threat2', text: '습격 위협이 매우 높습니다!', level: 'danger' });
  } else if (state.threat > 60) {
    alerts.push({ id: 'threat1', text: '습격 위협이 커지고 있습니다. 방어를 점검하십시오.', level: 'warn' });
  }

  if (state.crackdownDeadline > 0) {
    alerts.push({
      id: 'crackdown',
      text: `토벌 유예 ${Math.max(0, state.crackdownDeadline - state.day)}일 — 모반 의심을 60 아래로 내려 결백을 증명하십시오!`,
      level: 'danger',
    });
  } else if (state.suspicion >= CONFIG.suspicion.censureAt) {
    alerts.push({ id: 'susp2', text: '조정의 의심이 위험 수위입니다. 견책과 강등이 눈앞입니다.', level: 'danger' });
  } else if (state.suspicion >= CONFIG.suspicion.inspectionAt) {
    alerts.push({ id: 'susp1', text: '조정이 마을을 의심하기 시작했습니다. 감찰 어사가 올 수 있습니다.', level: 'warn' });
  }

  return alerts;
}

export function AlertsPanel({ state }: { state: GameState }) {
  const alerts = computeAlerts(state);
  if (alerts.length === 0) return null;
  return (
    <div className="alert-stack" aria-label="경보" aria-live="polite">
      {alerts.map(a => (
        <div key={a.id} className={`alert ${a.level}`}>{a.text}</div>
      ))}
    </div>
  );
}
