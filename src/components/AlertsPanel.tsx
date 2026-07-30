// 주요 위기 알림 패널
import { withJosa } from '../game/josa';
import { CONFIG } from '../game/config';
import { foodTotal, fuelHeatTotal } from '../game/consumption';
import { avg, livingResidents, residentHome } from '../game/residents';
import {
  normalizeLivestockState, settlementLivestockDailyFeedNeed, settlementLivestockWinterHayNeed,
} from '../game/livestock';
import { activePhysicianCount } from '../game/medicine';
import { getDayOfSeason, getSeason } from '../game/seasons';
import { firewoodWeatherMult } from '../game/weather';
import { contractsInGrace } from '../game/tradeContracts';
import { RESOURCE_NAMES } from '../game/constants';
import { pendingDisasterDaysRemaining } from '../game/disasters';
import { nearestFireWaterSource } from '../game/fire';
import { mineCollapseRepairLocked, mineCollapseSurvivalChance } from '../game/mineCollapse';
import { buildingRepairCause } from '../game/raidDamage';
import type { AlertItem, BuildingRepairCause, GameState } from '../game/types';

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

  const occupiedStables = state.buildings
    .filter(building => building.type === 'stable' && building.built)
    .map(building => normalizeLivestockState(building.livestock))
    .filter(livestock => livestock.headcount > 0);
  const feedShortageDays = occupiedStables.reduce((max, livestock) => Math.max(max, livestock.feedShortageDays), 0);
  if (feedShortageDays > 0) {
    alerts.push({
      id: 'livestockFeedDanger',
      text: `가축 사료가 ${feedShortageDays}일째 부족합니다. 곡물·건초를 확보하거나 일부를 도축하십시오.`,
      level: 'danger',
    });
  } else if ((season === 'autumn' || season === 'winter') && occupiedStables.length > 0) {
    const grainPerDay = settlementLivestockDailyFeedNeed(state);
    const grainDaysToCover = season === 'autumn'
      ? (CONFIG.time.seasonDays - getDayOfSeason(state.day) + 1) + CONFIG.time.seasonDays
      : CONFIG.time.seasonDays - getDayOfSeason(state.day) + 1;
    const hayDaysToCover = season === 'autumn'
      ? CONFIG.time.seasonDays
      : CONFIG.time.seasonDays - getDayOfSeason(state.day) + 1;
    const grainNeeded = grainPerDay * grainDaysToCover;
    const hayNeeded = settlementLivestockWinterHayNeed(state, hayDaysToCover);
    const grainShort = state.resources.grain + 1e-9 < grainNeeded;
    const hayShort = state.resources.hay + 1e-9 < hayNeeded;
    if (grainShort || hayShort) {
      const needs = [
        grainShort ? `곡물 약 ${grainNeeded.toFixed(1)}` : null,
        hayShort ? `건초 약 ${hayNeeded.toFixed(1)}` : null,
      ].filter(Boolean).join(' · ');
      const coverage = Math.min(
        grainNeeded > 0 ? state.resources.grain / grainNeeded : 1,
        hayNeeded > 0 ? state.resources.hay / hayNeeded : 1,
      );
      alerts.push({
        id: 'livestockFeedForecast',
        text: `겨울 가축 사료가 부족합니다. ${withJosa(needs, '이/가')} 필요하니 비축하거나 일부를 도축하십시오.`,
        level: coverage < 0.3 ? 'danger' : 'warn',
      });
    }
  }

  if (state.incidents?.livestockEpidemic) {
    const epidemic = state.incidents.livestockEpidemic;
    const epidemicName = epidemic.group === 'ruminant' ? '우역' :
      epidemic.group === 'pig' ? '저역' : epidemic.group === 'horse' ? '마역' : '계역';
    alerts.push({
      id: 'livestockEpidemic',
      text: `${epidemicName} 유행: 감염 축사 ${epidemic.infectedStableIds.length}곳 · 오늘 새 감염 ${epidemic.newInfectedStableIds?.length ?? 0}곳 · 폐사 ${epidemic.totalDeaths ?? 0}마리.`,
      level: 'danger',
    });
  }

  const warmth = avg(state, 'warmth');
  if (warmth < 30) alerts.push({ id: 'cold2', text: '주민들이 얼어붙고 있습니다! 장작과 옷, 온돌집이 필요합니다.', level: 'danger' });
  else if (warmth < 45) alerts.push({ id: 'cold1', text: '추위 위험: 주민 평균 체온이 낮습니다.', level: 'warn' });

  const sick = living.filter(r => r.sick).length;
  if (sick > 0) {
    const physicians = activePhysicianCount(state);
    alerts.push({
      id: 'sick',
      text: physicians > 0
        ? `질병 발생: ${sick}명이 앓고 있으며 의원 ${physicians}명이 치료 중입니다.`
        : `질병 발생: ${sick}명이 앓고 있습니다. 약초와 의원이 필요합니다.`,
      level: sick >= pop * 0.25 ? 'danger' : 'warn',
    });
  }

  const damagedBuildings: Record<BuildingRepairCause, number> = {
    raid: 0,
    snowDamage: 0,
    springFlood: 0,
    fire: 0,
    mineCollapse: 0,
  };
  for (const building of state.buildings) {
    if (!building.repairing || mineCollapseRepairLocked(state, building)) continue;
    damagedBuildings[buildingRepairCause(state, building)]++;
  }
  const damageAlerts: Array<{ cause: BuildingRepairCause; label: string; subject: string }> = [
    { cause: 'raid', label: '습격 피해', subject: '건물' },
    { cause: 'snowDamage', label: '설해 피해', subject: '주거' },
    { cause: 'springFlood', label: '대홍수 피해', subject: '건물' },
    { cause: 'fire', label: '화재 피해', subject: '건물' },
    { cause: 'mineCollapse', label: '갱도 붕괴 피해', subject: '채광갱' },
  ];
  for (const { cause, label, subject } of damageAlerts) {
    const count = damagedBuildings[cause];
    if (count <= 0) continue;
    alerts.push({
      id: `buildingDamage-${cause}`,
      text: `${label}: ${subject} ${count}채가 파손되었습니다. 건설담당이 수리합니다.`,
      level: 'danger',
    });
  }

  // 정기거래 유예 — 기한 안에 못 채우면 불이행이 되고 연속 2회면 계약이 파기된다
  for (const grace of contractsInGrace(state)) {
    alerts.push({
      id: `tradeContractGrace-${grace.contract.factionName}-${grace.contract.get}`,
      text: `정기거래 물량 부족 — ${grace.daysLeft}일 내 ` +
        `${RESOURCE_NAMES[grace.contract.give]} ${grace.shortfall} 필요 (${grace.contract.factionName})`,
      level: grace.daysLeft <= 1 ? 'danger' : 'warn',
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
    const epidemic = state.incidents.epidemic;
    const containment = epidemic.mode === 'isolated'
      ? `격리 ${epidemic.quarantinedResidentIds?.length ?? epidemic.infectedIds.length}명`
      : epidemic.mode === 'pending'
        ? '대응 결정 대기'
        : '미격리';
    alerts.push({
      id: 'epidemic',
      text: `역병 유행: 환자 ${epidemic.infectedIds.length}명 · 오늘 신규 ${epidemic.newInfectionsToday ?? 0}명 · ${containment}.`,
      level: 'danger',
    });
  }
  for (const disaster of state.pendingDisasters) {
    if (disaster.id === 'mineCollapse') {
      const trapped = disaster.trappedResidentIds?.length ?? 0;
      if (disaster.choiceId === 'warning') {
        alerts.push({
          id: 'pendingDisaster-mineCollapse',
          text: `갱도 붕괴 전조 · ${pendingDisasterDaysRemaining(state, disaster)}일 안에 붕괴할 조짐입니다. 채광꾼을 빼면 인명 피해를 피할 수 있습니다.`,
          level: 'danger',
        });
      } else if (disaster.choiceId === 'awaitingRescueChoice') {
        alerts.push({
          id: 'pendingDisaster-mineCollapse',
          text: `채광갱 붕괴 · ${trapped}명 매몰 · 구조 방식 결정 대기`,
          level: 'danger',
        });
      } else {
        alerts.push({
          id: 'pendingDisaster-mineCollapse',
          text: `갱도 구조 중 · ${trapped}명 매몰 · ${pendingDisasterDaysRemaining(state, disaster)}일 뒤 도달 · 생존 가능성 약 ${Math.round(mineCollapseSurvivalChance(disaster) * 100)}%`,
          level: 'danger',
        });
      }
      continue;
    }
    if (disaster.id === 'fire') {
      const sites = disaster.fireSites ?? [];
      const activeSiteIds = new Set(sites.map(site => site.buildingId));
      const responders = living.filter(resident => resident.fireResponse && activeSiteIds.has(resident.fireResponse.buildingId)).length;
      const waterless = sites.filter(site => {
        const building = state.buildings.find(candidate => candidate.id === site.buildingId);
        return !building || !nearestFireWaterSource(state, building);
      }).length;
      alerts.push({
        id: 'pendingDisaster-fire',
        text: `화재 발생 · 불길 ${sites.length}곳 · 진화 ${responders}명${waterless > 0 ? ` · 급수 불가 ${waterless}곳` : ''}`,
        level: 'danger',
      });
      continue;
    }
    if (disaster.id === 'drought') {
      alerts.push({
        id: `pendingDisaster-${disaster.id}`,
        text: '가뭄 지속 중 · 논밭 성장과 어획이 줄었습니다. 비를 기다리거나 보의 관개권을 활용하십시오.',
        level: 'danger',
      });
      continue;
    }
    if (disaster.id === 'locust') {
      alerts.push({
        id: `pendingDisaster-${disaster.id}`,
        text: '황충 떼가 경작지를 갉아먹고 있습니다.',
        level: 'danger',
      });
      continue;
    }
    if (disaster.id === 'springFlood') {
      alerts.push({
        id: `pendingDisaster-${disaster.id}`,
        text: `대홍수 범람 중 · 강변 통행이 막혔습니다. ${pendingDisasterDaysRemaining(state, disaster)}일 안에 물이 빠질 전망입니다.`,
        level: 'danger',
      });
      continue;
    }
    if (disaster.id === 'snowDamage') {
      continue;
    }
    if (disaster.id !== 'earlyFrost' && disaster.id !== 'lateFrost') continue;
    const daysLeft = pendingDisasterDaysRemaining(state, disaster);
    const title = disaster.id === 'earlyFrost' ? '이른 서리' : '늦서리';
    alerts.push({
      id: `pendingDisaster-${disaster.id}`,
      text: `${title} 경과 관찰 중 · 찬 날 ${Math.floor(disaster.progress ?? 0)}일 · ${daysLeft}일 뒤 판정`,
      level: 'warn',
    });
  }

  if (state.raiders) {
    alerts.push({
      id: 'raidIncoming',
      text: state.battle
        ? state.battle.location === 'village' || state.battle.mode === 'levy'
          ? `마을 안에서 ${withJosa(state.raiders.faction, '과/와')} 방어전이 벌어지고 있습니다!`
          : `마을 외곽에서 ${withJosa(state.raiders.faction, '을/를')} 요격 중입니다.`
        : state.raiders.spotted
          ? `습격 임박! ${withJosa(state.raiders.faction, '이/가')} 마을로 접근 중입니다. 방비를 갖추십시오.`
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
