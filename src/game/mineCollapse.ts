import { recordAnnals } from './annals';
import { CONFIG } from './config';
import { addLog } from './events';
import { makeRng } from './map';
import { injure, damageBuildingTargets } from './raidDamage';
import { residentLogName } from './residentLogName';
import { killResident } from './residents';
import { oreSampleAt } from './subsurfaceVeins';
import { assignedWorkers } from './workerSlots';
import type { Building, GameState, PendingDisaster, Resident } from './types';

type MineCollapseAdvanceResult = 'keep' | 'resolved';

function activeMineCollapse(state: Pick<GameState, 'pendingDisasters'>): PendingDisaster | undefined {
  return state.pendingDisasters.find(disaster => disaster.id === 'mineCollapse');
}

export function mineCollapseRepairLocked(
  state: Pick<GameState, 'pendingDisasters'>,
  building: Pick<Building, 'id' | 'built' | 'repairing' | 'repairCause'>,
): boolean {
  if (building.built || !building.repairing || building.repairCause !== 'mineCollapse') return false;
  return state.pendingDisasters.some(disaster =>
    disaster.id === 'mineCollapse' &&
    disaster.choiceId !== 'warning' &&
    disaster.targetBuildingIds?.includes(building.id));
}

function wetWeatherMultiplier(state: Pick<GameState, 'weather'>): number {
  if (state.weather === 'thawFlood') return CONFIG.disasters.mineCollapse.thawFloodMultiplier;
  if (state.weather === 'rain') return CONFIG.disasters.mineCollapse.rainMultiplier;
  return 1;
}

export function mineCollapseDailyChance(state: GameState, mine: Building): number {
  if (!mine.built || mine.repairing || mine.type !== 'deepMine' || assignedWorkers(state, mine).length === 0) return 0;
  const sample = oreSampleAt(
    state.seed,
    state.map[0]?.length ?? 0,
    state.map.length,
    mine.x,
    mine.y,
    state.worldSetup?.region,
    state.worldSetup?.effective.resourceDensityMultiplier,
  );
  if (!sample) return 0;
  const remaining = Math.max(0, state.oreVeinRemaining[sample.vein.id] ?? 0);
  if (remaining <= 0) return 0;
  const depletion = 1 - Math.min(1, remaining / Math.max(1, sample.vein.capacity));
  const riskMultiplier = CONFIG.disasters.mineCollapse.minimumRiskMultiplier +
    depletion * (CONFIG.disasters.mineCollapse.maximumRiskMultiplier -
      CONFIG.disasters.mineCollapse.minimumRiskMultiplier);
  return CONFIG.disasters.mineCollapse.dailyBaseChance * riskMultiplier * wetWeatherMultiplier(state);
}

function chooseCollapseMine(state: GameState, rng: () => number): Building | null {
  const candidates = state.buildings
    .filter(building => building.type === 'deepMine')
    .map(building => ({ building, chance: mineCollapseDailyChance(state, building) }))
    .filter(candidate => candidate.chance > 0);
  const total = candidates.reduce((sum, candidate) => sum + candidate.chance, 0);
  if (total <= 0 || rng() >= Math.min(1, total)) return null;
  let roll = rng() * total;
  for (const candidate of candidates) {
    roll -= candidate.chance;
    if (roll <= 0) return candidate.building;
  }
  return candidates[candidates.length - 1]?.building ?? null;
}

function trappedResidents(state: GameState, disaster: PendingDisaster): Resident[] {
  const ids = new Set(disaster.trappedResidentIds ?? []);
  return state.residents.filter(resident => ids.has(resident.id) && resident.alive);
}

function trappedNames(state: GameState, disaster: PendingDisaster): string {
  const names = trappedResidents(state, disaster).map(residentLogName);
  return names.length > 0 ? names.join(', ') : '없음';
}

function openRescueChoice(state: GameState, disaster: PendingDisaster): void {
  if (state.pendingChoice || disaster.choiceId !== 'awaitingRescueChoice') return;
  state.pendingChoice = {
    kind: 'mineCollapse',
    title: '채광갱 붕괴 — 매몰자 구조',
    body: `채광갱이 무너져 ${trappedResidents(state, disaster).length}명이 갱 안에 갇혔습니다.\n` +
      `매몰자: ${trappedNames(state, disaster)}\n` +
      '서두르면 빨리 닿지만 구조대가 2차 붕괴에 휘말릴 수 있고, 조심스럽게 파면 구조대는 안전하지만 매몰자가 버틸 시간이 줄어듭니다.',
    illustration: {
      src: '/assets/events/mine-collapse-v1.png',
      alt: '무너진 채광갱 입구에서 부서진 갱목과 토사를 살피며 구조를 준비하는 조선 시대 광부들',
    },
    options: [
      {
        id: 'urgent',
        label: '서둘러 판다',
        desc: `${CONFIG.disasters.mineCollapse.urgentRescueDays}일 뒤 구조. 생존 가능성은 높지만 2차 붕괴로 구조대가 다칠 수 있습니다.`,
      },
      {
        id: 'careful',
        label: '조심스럽게 판다',
        desc: `${CONFIG.disasters.mineCollapse.carefulRescueDays}일 뒤 구조. 구조대는 안전하지만 매몰자 생존 가능성이 더 낮습니다.`,
      },
    ],
    data: { buildingId: disaster.targetBuildingIds?.[0] ?? -1 },
  };
}

function triggerCollapse(state: GameState, disaster: PendingDisaster, mine: Building, rng: () => number): MineCollapseAdvanceResult {
  const trapped = assignedWorkers(state, mine);
  const [repairMin, repairMax] = CONFIG.disasters.mineCollapse.repairProgress;
  damageBuildingTargets(state, rng, [mine], 'mineCollapse', { min: repairMin, max: repairMax });
  disaster.startedDay = state.day;
  disaster.resolveDay = state.day;
  disaster.targetBuildingIds = [mine.id];
  disaster.data = {
    ...(disaster.data ?? {}),
    collapseDay: state.day,
    resolutionSeed: Math.floor(rng() * 0x7fffffff),
  };
  disaster.trappedResidentIds = trapped.map(resident => resident.id);
  for (const resident of trapped) {
    resident.trappedInMineId = mine.id;
    resident.path = [];
    resident.phase = 'rest';
    resident.task = '갱도에 매몰됨';
  }
  recordAnnals(
    state,
    'disaster',
    trapped.length > 0
      ? `채광갱이 무너져 채광꾼 ${trapped.length}명이 매몰되었습니다.`
      : '채광갱이 무너졌으나 갱을 비워 둔 덕분에 인명 피해는 없었습니다.',
  );
  if (trapped.length === 0) {
    addLog(state, '채광갱이 무너졌지만 갱 안에 일하던 사람이 없어 인명 피해는 없었습니다. 건설담당이 갱도를 복구합니다.', 'bad', true);
    return 'resolved';
  }
  disaster.choiceId = 'awaitingRescueChoice';
  addLog(state, `채광갱이 무너져 채광꾼 ${trapped.length}명이 매몰되었습니다. 구조 방식을 정해야 합니다.`, 'bad', true);
  openRescueChoice(state, disaster);
  return 'keep';
}

export function startMineCollapse(
  state: GameState,
  mine: Building,
  rng: () => number,
  withWarning: boolean,
): boolean {
  if (activeMineCollapse(state) || mine.type !== 'deepMine' || !mine.built) return false;
  const disaster: PendingDisaster = {
    id: 'mineCollapse',
    choiceId: withWarning ? 'warning' : 'collapse',
    startedDay: state.day,
    resolveDay: state.day,
    targetBuildingIds: [mine.id],
    progress: 0,
    data: {},
  };
  if (withWarning) {
    const [minimum, maximum] = CONFIG.disasters.mineCollapse.warningLeadDays;
    const leadDays = minimum + Math.floor(rng() * (maximum - minimum + 1));
    disaster.resolveDay = state.day + leadDays;
    state.pendingDisasters.push(disaster);
    addLog(state, `채광갱 안쪽에서 갱목이 우는 소리가 납니다. ${leadDays}일 안에 무너질 조짐이니 채광꾼을 뺄 수 있습니다.`, 'bad', true);
    return true;
  }
  if (triggerCollapse(state, disaster, mine, rng) === 'keep') state.pendingDisasters.push(disaster);
  return true;
}

export function maybeStartMineCollapse(state: GameState, rng: () => number): boolean {
  if (activeMineCollapse(state)) return false;
  const mine = chooseCollapseMine(state, rng);
  if (!mine) return false;
  return startMineCollapse(state, mine, rng, rng() < CONFIG.disasters.mineCollapse.warningChance);
}

export function resolveMineCollapseChoice(state: GameState, optionId: string): void {
  if (state.pendingChoice?.kind !== 'mineCollapse') return;
  const disaster = activeMineCollapse(state);
  if (!disaster || disaster.choiceId !== 'awaitingRescueChoice') {
    state.pendingChoice = null;
    return;
  }
  if (optionId !== 'urgent' && optionId !== 'careful') return;
  const duration = optionId === 'urgent'
    ? CONFIG.disasters.mineCollapse.urgentRescueDays
    : CONFIG.disasters.mineCollapse.carefulRescueDays;
  disaster.choiceId = optionId;
  disaster.resolveDay = state.day + duration;
  disaster.progress = 0;
  state.pendingChoice = null;
  addLog(
    state,
    optionId === 'urgent'
      ? `구조대를 급히 들여보냈습니다. ${duration}일 안에 매몰자에게 닿을 예정입니다.`
      : `갱목을 받쳐 가며 조심스럽게 파기 시작했습니다. ${duration}일 안에 매몰자에게 닿을 예정입니다.`,
    'info',
    true,
  );
}

export function mineCollapseSurvivalChance(disaster: PendingDisaster): number {
  const duration = disaster.choiceId === 'urgent'
    ? CONFIG.disasters.mineCollapse.urgentRescueDays
    : CONFIG.disasters.mineCollapse.carefulRescueDays;
  return Math.max(0.05, Math.min(0.98,
    CONFIG.disasters.mineCollapse.baseSurvivalChance -
      duration * CONFIG.disasters.mineCollapse.dailySurvivalLoss));
}

function resolveRescue(state: GameState, disaster: PendingDisaster): void {
  const rng = makeRng(Math.floor(disaster.data?.resolutionSeed ?? (state.seed + state.day * 31337)));
  const survivalChance = mineCollapseSurvivalChance(disaster);
  let rescued = 0;
  let killed = 0;
  for (const resident of trappedResidents(state, disaster)) {
    delete resident.trappedInMineId;
    if (rng() >= survivalChance) {
      killResident(state, resident, '갱도 붕괴');
      killed++;
      continue;
    }
    const [minimumInjury, maximumInjury] = CONFIG.disasters.mineCollapse.survivorInjury;
    const injury = minimumInjury + Math.floor(rng() * (maximumInjury - minimumInjury + 1));
    resident.health = Math.max(5, resident.health - injury);
    resident.task = '갱도 붕괴 부상 회복 중';
    resident.path = [];
    resident.phase = 'rest';
    rescued++;
  }
  for (const id of disaster.trappedResidentIds ?? []) {
    const resident = state.residents.find(candidate => candidate.id === id);
    if (resident) delete resident.trappedInMineId;
  }

  let rescueInjuries = 0;
  if (disaster.choiceId === 'urgent' && rng() < CONFIG.disasters.mineCollapse.urgentSecondaryCollapseChance) {
    const formerlyTrapped = new Set(disaster.trappedResidentIds ?? []);
    const candidates = state.residents.filter(resident =>
      resident.alive && !resident.sick && !formerlyTrapped.has(resident.id) &&
      resident.trappedInMineId == null &&
      (resident.job === 'builder' || resident.job === 'miner'));
    const [minimum, maximum] = CONFIG.disasters.mineCollapse.urgentRescuerInjuries;
    const count = Math.min(candidates.length, minimum + Math.floor(rng() * (maximum - minimum + 1)));
    rescueInjuries = injure(
      state,
      rng,
      count,
      CONFIG.disasters.mineCollapse.urgentRescuerInjurySeverity,
      candidates.map(resident => resident.id),
      true,
    );
    if (rescueInjuries > 0) addLog(state, `서두르던 구조대가 2차 붕괴에 휘말려 ${rescueInjuries}명이 다쳤습니다.`, 'bad', true);
  }

  const mine = state.buildings.find(building =>
    building.id === disaster.targetBuildingIds?.[0] &&
    building.type === 'deepMine' &&
    !building.built &&
    building.repairing &&
    building.repairCause === 'mineCollapse');
  const text = `갱도 구조가 끝났습니다. 생존 구조 ${rescued}명, 사망 ${killed}명` +
    (rescueInjuries > 0 ? `, 구조대 부상 ${rescueInjuries}명` : '') +
    (mine ? '. 붕괴한 채광갱은 이제 건설담당이 수리할 수 있습니다.' : '.');
  addLog(state, text, killed > 0 ? 'bad' : 'good', true);
  recordAnnals(state, 'disaster', text);
}

export function advanceMineCollapseDisaster(
  state: GameState,
  disaster: PendingDisaster,
): MineCollapseAdvanceResult {
  if (disaster.id !== 'mineCollapse') return 'resolved';
  const mineId = disaster.targetBuildingIds?.[0];
  const mine = mineId == null ? undefined : state.buildings.find(building => building.id === mineId);
  if (disaster.choiceId === 'warning') {
    if (state.day < disaster.resolveDay) return 'keep';
    if (!mine?.built || mine.type !== 'deepMine') {
      addLog(state, '위험하던 채광갱이 사라져 붕괴 경보를 해제했습니다.', 'info');
      return 'resolved';
    }
    const rng = makeRng(Math.floor((state.seed + state.day * 65537 + mine.id * 257) >>> 0));
    return triggerCollapse(state, disaster, mine, rng);
  }
  if (disaster.choiceId === 'awaitingRescueChoice') {
    openRescueChoice(state, disaster);
    return 'keep';
  }
  if (disaster.choiceId !== 'urgent' && disaster.choiceId !== 'careful') return 'resolved';
  disaster.progress = Math.max(0, state.day - Math.floor(disaster.data?.collapseDay ?? disaster.startedDay));
  if (state.day < disaster.resolveDay) return 'keep';
  resolveRescue(state, disaster);
  return 'resolved';
}
