import { performance } from 'node:perf_hooks';
import {
  releaseAutoplayContext,
  loadCompiledGameModule,
  placementCandidates,
  tryQueueBuilding,
  handleChoice,
  emptyMetrics,
  reserveForTribute,
  tryTradeForTarget,
  living,
  housingCapacity,
  foodDays,
  fuelDays,
  clothingTotal,
  builtCount,
} from './simulate_trade_autoplay.mjs';

const DEFAULT_RUNS = 16;
const DEFAULT_YEARS = 10;
const DEFAULT_SEED = 2026071800;

export const AUTOPLAY_POLICY_DESCRIPTION = [
  '보통 난이도와 고정 시드를 사용한다.',
  '기존 trade autoplay의 공개 건설·교역 API와 보수적인 선택 정책을 재사용한다.',
  '겨울에는 놀게 되는 농부를 연료·사냥 노동으로 돌리고, 화면에 보이는 식량·땔감 일수에 따라 건설과 교역을 보류한다.',
  '화면에 보이는 자원·주거·계절·방어 정보만 사용하며 미래 RNG나 숨은 사건 결과를 읽지 않는다.',
  '세공은 준비한 최선의 납부, 김장은 가능한 최대 규모, 이주는 확대 인구 기준 20일 식량과 계절별 난방 여유가 있을 때만 수용한다.',
  '서당이 실제 가동될 때 좌석 절반 이내의 소년을 결정적으로 취학시키고 나머지는 일 돕기로 둔다.',
  '대형 경작지·의원·묘지·서당·축사는 기존 해금·비용·배치 API를 통해서만 추가 운용한다.',
].join(' ');

function optionNumber(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const smokeMode = process.argv.includes('--smoke');
const runCount = optionNumber('runs', DEFAULT_RUNS);
const years = smokeMode
  ? Math.max(1, optionNumber('years', 1))
  : Math.max(DEFAULT_YEARS, optionNumber('years', DEFAULT_YEARS));
const seedBase = optionNumber('seed', DEFAULT_SEED);
const compact = process.argv.includes('--compact');
const summaryOnly = process.argv.includes('--summary-only');

const {
  simulation,
  buildings,
  consumption,
  workerSlots,
  CONFIG,
} = releaseAutoplayContext;
const education = await loadCompiledGameModule('education');
const crops = await loadCompiledGameModule('crops');
const livestock = await loadCompiledGameModule('livestock');
const weapons = await loadCompiledGameModule('weapons');
const spoilage = await loadCompiledGameModule('spoilage');
const saveLoad = await loadCompiledGameModule('saveLoad');

class MemoryStorage {
  #values = new Map();
  get length() { return this.#values.size; }
  clear() { this.#values.clear(); }
  getItem(key) { return this.#values.get(String(key)) ?? null; }
  key(index) { return [...this.#values.keys()][index] ?? null; }
  removeItem(key) { this.#values.delete(String(key)); }
  setItem(key, value) { this.#values.set(String(key), String(value)); }
}
globalThis.localStorage ??= new MemoryStorage();

const RANKS = ['settlement', 'bo', 'jin', 'bu'];
const PRESERVED_RESOURCES = ['curedMeat', 'saltedFish', 'driedFish'];
const CRITICAL_JOBS = ['farmer', 'builder', 'miner', 'herder', 'physician', 'teacher', 'undertaker'];

function round(value, digits = 2) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(digits));
}

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

function average(values) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function stockTotal(state, resource) {
  let total = Number(state.resources[resource] ?? 0);
  for (const building of state.buildings) total += Number(building.inventory?.[resource] ?? 0);
  for (const resident of state.residents) total += Number(resident.carrying?.[resource] ?? 0);
  return Number.isFinite(total) ? total : 0;
}

function plotArea(building) {
  return Math.max(1, Number(building.w) || 1) * Math.max(1, Number(building.h) || 1);
}

function ageStages(state) {
  const result = { infant: 0, child: 0, youth: 0, adult: 0, elder: 0 };
  for (const resident of living(state)) {
    if (resident.stage) result[resident.stage] += 1;
    else if (resident.age >= CONFIG.lifecycle.elderLaborAge) result.elder += 1;
    else result.adult += 1;
  }
  return result;
}

function totalLivestock(state) {
  return state.buildings
    .filter(building => building.type === 'stable' && building.built)
    .reduce((sum, building) => sum + Math.max(0, Number(building.livestock?.headcount) || 0), 0);
}

function builtStableSpecies(state) {
  return new Set(state.buildings
    .filter(building => building.type === 'stable' && building.built && (building.livestock?.headcount ?? 0) > 0)
    .map(building => building.livestock.species));
}

function activeConstructionCount(state) {
  return state.buildings.filter(building => !building.built).length;
}

function tryQueueLargePlot(state, type, desired, candidates) {
  const planned = state.buildings.filter(building => building.type === type && plotArea(building) >= 9).length;
  if (planned >= desired) return false;
  if (!buildings.canAffordCost(state, buildings.buildingCostFor(type, 3, 3))) return false;
  for (const { x, y } of candidates) {
    if (simulation.tryPlaceBuilding(state, type, x, y, 3, 3) == null) return true;
  }
  return false;
}

function manageReleaseConstruction(state, candidates) {
  const pop = living(state).length;
  const constructionLimit = pop >= 30 ? 2 : 1;
  if (activeConstructionCount(state) >= constructionLimit) return;

  const desiredFields = Math.max(1, Math.ceil((pop + 8) / 14));
  const hasLargeField = state.buildings.some(building => building.type === 'field' && plotArea(building) >= 9);
  const canExpandFood = !hasLargeField || (foodDays(state) >= 18 && fuelDays(state) >= 40);
  if (canExpandFood && tryQueueLargePlot(state, 'field', desiredFields, candidates)) return;

  for (const [type, desired] of [
    ['woodShed', 1],
    ['lumberCamp', 1],
    ['market', 1],
    ['huntLodge', 1],
    ['herbHut', 1],
    ['smithy', 1],
  ]) {
    if (tryQueueBuilding(state, type, desired, candidates)) return;
  }

  const desiredHuts = Math.max(2, Math.ceil((pop + 8 - buildings.BUILDING_DEFS.center.capacity) /
    buildings.BUILDING_DEFS.hut.capacity));
  if (tryQueueBuilding(state, 'hut', desiredHuts, candidates)) return;

  const reserveReady = foodDays(state) >= 28 && fuelDays(state) >= 55;
  if (!reserveReady) return;
  if ((state.corpses?.length ?? 0) > 0 && tryQueueBuilding(state, 'cemetery', 1, candidates)) return;

  for (const [type, desired] of [
    ['cellar', 1],
    ['smokehouse', 1],
    ['storehouse', 1],
    ['tannery', 1],
    ['beacon', 1],
    ['garrison', 1],
    ['watchtower', 4],
    ['palisade', 14],
  ]) {
    if (tryQueueBuilding(state, type, desired, candidates)) return;
  }

  if (state.rank !== 'settlement') {
    const desiredPaddies = Math.max(1, Math.ceil(pop / 28));
    if (tryQueueLargePlot(state, 'paddy', desiredPaddies, candidates)) return;
    for (const [type, desired] of [
      ['mine', 1], ['ferry', 1], ['watermill', 1], ['weavingHouse', 1],
      ['ondol', Math.max(2, Math.ceil(pop / 15))], ['dryingRack', 1],
      ['onggiKiln', 1], ['jangdokdae', 1],
    ]) {
      if (tryQueueBuilding(state, type, desired, candidates)) return;
    }
  }
  if (state.rank === 'jin' || state.rank === 'bu') {
    for (const [type, desired] of [
      ['clinic', 1], ['school', 1], ['stable', 3], ['charcoalKiln', 1], ['earthFort', 8],
    ]) {
      if (tryQueueBuilding(state, type, desired, candidates)) return;
    }
  }
  if (state.rank === 'bu') {
    for (const [type, desired] of [['office', 1], ['dock', 1], ['stoneWall', 8]]) {
      if (tryQueueBuilding(state, type, desired, candidates)) return;
    }
  }
}

function manageCropPlan(state) {
  const cropRotation = ['millet', 'vegetables', 'sorghum', 'beans', 'millet', 'cotton'];
  const season = simulation.getSeason(state.day);
  const fields = state.buildings
    .filter(building => building.type === 'field' && building.built)
    .sort((left, right) => left.id - right.id);
  fields.forEach((field, index) => {
    const rotationCrop = cropRotation[index % cropRotation.length];
    const hasStandingCrop = (field.sownArea ?? 0) > 0 || field.fieldGrowth > 0.5;
    if (hasStandingCrop) {
      if ((field.cropId === 'buckwheat' || field.cropId === 'barley') && field.fieldGrowth > 0.5 &&
        field.queuedCropId !== rotationCrop) {
        simulation.setBuildingCrop(state, field.id, rotationCrop, 'queue');
      }
      return;
    }
    const desired = season === 'summer' ? 'buckwheat' : season === 'autumn' ? 'barley' : rotationCrop;
    if (field.cropId !== desired && field.queuedCropId !== desired) {
      simulation.setBuildingCrop(state, field.id, desired, 'queue');
    }
  });
}

function releaseJobTargets(state, laborCount) {
  const pop = living(state).length;
  const season = simulation.getSeason(state.day);
  const targets = [];
  const add = (job, count) => {
    for (let index = 0; index < Math.max(0, Math.floor(count)); index++) targets.push(job);
  };
  const farmSlots = state.buildings
    .filter(building => building.built && (building.type === 'field' || building.type === 'paddy'))
    .reduce((sum, building) => sum + workerSlots.workerSlotCount(building), 0);
  if (season !== 'winter') add('farmer', farmSlots);

  const fuelUrgent = fuelDays(state) < (season === 'winter' ? 85 : 100);
  if (fuelUrgent) {
    add('woodSplitter', builtCount(state, 'woodShed') > 0 ? 2 : 0);
    add('woodcutter', season === 'winter' ? Math.max(3, Math.ceil(pop * 0.16)) : Math.max(2, Math.ceil(pop * 0.14)));
  }
  const foodUrgent = foodDays(state) < 35;
  if (foodUrgent) add('hunter', Math.max(season === 'winter' ? 3 : 2, Math.ceil(pop * 0.14)));

  add('hauler', Math.max(1, Math.ceil(pop / 18)));
  const firstFoodPlotReady = state.buildings.some(building =>
    building.type === 'field' && building.built && plotArea(building) >= 9);
  const builderCount = activeConstructionCount(state) > 0
    ? (!firstFoodPlotReady ? 2 : Math.min(2, Math.max(1, Math.ceil(pop / 24))))
    : 0;
  add('builder', builderCount);
  add('smith', builtCount(state, 'smithy') > 0 && state.resources.tools < Math.max(8, Math.ceil(pop * 0.5)) ? 1 : 0);
  add('miner', state.resources.stone < Math.max(24, pop) || state.resources.iron < 6 ? 1 : 0);
  add('watchman', Math.max(1, Math.floor(pop / 18)));
  add('herbalist', builtCount(state, 'herbHut') > 0 && state.resources.herbs < Math.max(8, pop * 0.5) ? 1 : 0);
  add('tanner', builtCount(state, 'tannery') > 0 && clothingTotal(state) < pop * 1.15 ? 1 : 0);
  add('curer', builtCount(state, 'smokehouse') > 0 && state.resources.meat > state.processingReserves.meat + 2 ? 1 : 0);
  add('miller', builtCount(state, 'watermill') > 0 && state.resources.rice > 2 ? 1 : 0);
  add('fisher', builtCount(state, 'ferry') > 0 ? Math.max(1, Math.floor(pop / 24)) : 0);
  add('herder', builtCount(state, 'stable') > 0 ? Math.max(1, Math.floor(pop / 30)) : 0);
  add('potter', builtCount(state, 'onggiKiln') > 0 && state.resources.onggi < 8 ? 1 : 0);
  add('charcoalBurner', builtCount(state, 'charcoalKiln') > 0 && fuelDays(state) < 80 ? 1 : 0);
  add('weaver', builtCount(state, 'weavingHouse') > 0 && state.resources.cotton > 1 ? 1 : 0);

  if (!fuelUrgent) {
    add('woodSplitter', builtCount(state, 'woodShed') > 0 ? 1 : 0);
    add('woodcutter', Math.max(2, Math.ceil(pop * 0.1)));
  }
  if (!foodUrgent) add('hunter', Math.max(2, Math.ceil(pop * 0.1)));
  while (targets.length < laborCount) {
    if (foodDays(state) < fuelDays(state)) targets.push('hunter');
    else targets.push(targets.length % 3 === 0 ? 'woodSplitter' : 'woodcutter');
  }
  return targets.slice(0, laborCount);
}

function rebalanceReleaseJobs(state) {
  const adults = living(state).filter(resident => !resident.stage).sort((left, right) => left.id - right.id);
  const targets = releaseJobTargets(state, adults.length);
  adults.forEach((resident, index) => {
    if (resident.job !== targets[index]) simulation.setResidentJob(state, resident.id, targets[index]);
  });
  const workYouths = living(state)
    .filter(resident => resident.stage === 'youth' && resident.youthActivity === 'work')
    .sort((left, right) => left.id - right.id);
  const youthJobs = simulation.getSeason(state.day) === 'winter'
    ? ['woodSplitter', 'hauler', 'idle']
    : ['farmer', 'hauler', 'woodSplitter'];
  workYouths.forEach((resident, index) => {
    const desired = youthJobs[index % youthJobs.length];
    if (resident.job !== desired) simulation.setResidentJob(state, resident.id, desired);
  });
  for (const building of state.buildings.filter(candidate => candidate.built)) {
    workerSlots.autoAssignWorkersToBuilding(state, building.id);
  }
}

function tryReleaseTrade(state, metrics) {
  const pop = living(state).length;
  const season = simulation.getSeason(state.day);
  let target = null;
  if ((season === 'autumn' || season === 'winter') && fuelDays(state) < 85) {
    target = { resource: 'firewood', amount: Math.max(4, Math.ceil(pop * 1.8)) };
  } else if (foodDays(state) < 35) {
    target = { resource: 'grain', amount: Math.max(4, Math.ceil(pop * 1.5)) };
  } else if (state.resources.tools < Math.max(6, Math.ceil(pop * 0.35))) {
    target = { resource: 'tools', amount: Math.max(2, Math.ceil(pop * 0.12)) };
  } else if (clothingTotal(state) < pop) {
    target = { resource: 'hideClothes', amount: Math.max(2, Math.ceil(pop * 0.15)) };
  } else if (state.resources.iron < 6) {
    target = { resource: 'iron', amount: 4 };
  } else if (season === 'autumn' && state.resources.salt < 6) {
    target = { resource: 'salt', amount: Math.ceil(6 - state.resources.salt) };
  } else if (fuelDays(state) < 65) {
    target = { resource: 'firewood', amount: Math.max(4, Math.ceil(pop * 1.2)) };
  }
  return tryTradeForTarget(state, metrics, target);
}

function assignServiceWorker(state, buildingType, job, literate) {
  const building = state.buildings.find(candidate => candidate.type === buildingType && candidate.built);
  if (!building) return;
  const already = living(state).find(resident => resident.job === job && resident.assignedBuildingId === building.id);
  if (already) return;
  const candidate = living(state)
    .filter(resident => !resident.stage && !resident.special && (!literate || resident.literate === true))
    .sort((left, right) => left.id - right.id)[0];
  if (!candidate) return;
  simulation.setResidentJob(state, candidate.id, job);
  if (candidate.job === job) simulation.assignResidentToBuilding(state, candidate.id, building.id);
}

function manageServiceJobs(state) {
  assignServiceWorker(state, 'school', 'teacher', true);
  assignServiceWorker(state, 'clinic', 'physician', true);
  assignServiceWorker(state, 'cemetery', 'undertaker', false);
  assignServiceWorker(state, 'office', 'clerk', true);
  for (const building of state.buildings.filter(candidate => candidate.built)) {
    workerSlots.autoAssignWorkersToBuilding(state, building.id);
  }
}

function manageYouthPolicy(state) {
  const youths = living(state).filter(resident => resident.stage === 'youth').sort((a, b) => a.id - b.id);
  const seats = education.schoolSeatCount(state);
  const schoolCount = foodDays(state) >= 12 && fuelDays(state) >= 12
    ? Math.min(youths.length, Math.floor(seats / 2))
    : 0;
  youths.forEach((resident, index) => {
    const desired = index < schoolCount ? 'school' : 'work';
    if (resident.youthActivity !== desired) simulation.setYouthActivity(state, resident.id, desired);
  });
}

function prepareLivestockCapacity(state, metrics) {
  const stables = state.buildings
    .filter(building => building.type === 'stable' && building.built)
    .sort((left, right) => left.id - right.id);
  const occupiedSpecies = builtStableSpecies(state);
  for (let index = 1; index < stables.length; index++) {
    const stable = stables[index];
    const herd = stable.livestock;
    if (!herd) continue;
    if (herd.species === 'chicken' && herd.headcount > 0) {
      const amount = Math.floor(herd.headcount);
      const error = simulation.slaughterLivestock(state, stable.id, amount);
      if (!error) metrics.livestockSlaughtered += amount;
    }
    if ((stable.livestock?.headcount ?? 0) > 0) continue;
    const desired = ['cattle', 'horse', 'sheep', 'goat']
      .find(species => state.unlockedLivestock.includes(species) && !occupiedSpecies.has(species));
    if (desired) simulation.setLivestockSpecies(state, stable.id, desired);
  }
}

function manageOxenAndMounts(state) {
  let remainingOxen = livestock.plowOxenPool(state);
  const plots = state.buildings
    .filter(building => building.built && (building.type === 'field' || building.type === 'paddy'))
    .sort((left, right) => plotArea(right) - plotArea(left) || left.id - right.id);
  for (const plot of plots) {
    const requested = Math.min(remainingOxen, livestock.plotPlowOxenMax(plot));
    simulation.assignPlotPlowOxen(state, plot.id, requested);
    remainingOxen -= requested;
  }
  const mounted = new Set(Object.keys(weapons.resolvedMountAssignments(state)).map(Number));
  let remainingHorses = Math.max(0, weapons.horseStock(state) - mounted.size);
  if (remainingHorses <= 0) return;
  for (const resident of living(state).sort((left, right) => left.id - right.id)) {
    if (remainingHorses <= 0) break;
    if (mounted.has(resident.id)) continue;
    if (weapons.setResidentMount(state, resident.id, 'horse') == null) remainingHorses--;
  }
}

function kimjangBounds(year) {
  const start = (year - 1) * CONFIG.time.yearDays + 1;
  const end = year * CONFIG.time.yearDays;
  let occurrenceDay = start;
  let expiresDay = end;
  for (let day = start; day <= end; day++) {
    const inWindow = (simulation.getSeason(day) === 'autumn' &&
      simulation.getDayOfSeason(day) >= CONFIG.fermentation.kimjangAutumnStartDay) ||
      (simulation.getSeason(day) === 'winter' &&
        simulation.getDayOfSeason(day) <= CONFIG.fermentation.kimjangWinterEndDay);
    if (!inWindow) continue;
    occurrenceDay = Math.min(occurrenceDay === start ? day : occurrenceDay, day);
    expiresDay = day;
  }
  return { occurrenceDay, expiresDay };
}

function choiceDescriptor(state, choice, scheduledIncidentDay = null) {
  const displayDay = state.day;
  const eventId = String(choice.data.eventId ?? '');
  if (choice.kind === 'incident' && eventId === 'kimjang') {
    const year = Number(choice.data.year) || simulation.getYear(displayDay);
    return { key: `kimjang:${year}`, type: 'incident:kimjang', ...kimjangBounds(year) };
  }
  if (choice.kind === 'tribute') {
    const year = Number(choice.data.year) || simulation.getYear(displayDay);
    const occurrenceDay = (year - 1) * CONFIG.time.yearDays + CONFIG.time.seasonDays * 3 + 1;
    return { key: `tribute:${year}`, type: 'tribute', occurrenceDay, expiresDay: year * CONFIG.time.yearDays };
  }
  if (choice.kind === 'incident' && scheduledIncidentDay != null && scheduledIncidentDay <= displayDay) {
    return {
      key: `incident-scheduled:${scheduledIncidentDay}`,
      type: `incident:${eventId || 'unknown'}`,
      occurrenceDay: scheduledIncidentDay,
    };
  }
  if (choice.kind === 'territory') {
    const siteId = Number(choice.data.siteId);
    const violation = state.territoryViolations?.find(candidate => candidate.siteId === siteId);
    const occurrenceDay = violation?.warningDay ?? displayDay;
    return { key: `territory:${siteId}:${occurrenceDay}`, type: 'territory', occurrenceDay };
  }
  if (choice.kind === 'crackdown') {
    const occurrenceDay = state.crackdownDeadline || displayDay;
    return { key: `crackdown:${occurrenceDay}`, type: 'crackdown', occurrenceDay };
  }
  if (choice.kind === 'silverVein') {
    const occurrenceDay = state.silverVein?.discoveredDay ?? state.silverVein?.lastOfferDay ?? displayDay;
    return { key: `silverVein:${occurrenceDay}`, type: 'silverVein', occurrenceDay };
  }
  const identity = choice.data.specialResidentId ?? choice.data.id ?? choice.data.faction ?? choice.title;
  return {
    key: `${choice.kind}:${identity}:${displayDay}`,
    type: eventId ? `${choice.kind}:${eventId}` : choice.kind,
    occurrenceDay: displayDay,
  };
}

function dueCandidates(state, scheduledIncidentDay = null) {
  const candidates = [];
  const push = candidate => {
    if (!candidates.some(existing => existing.key === candidate.key)) candidates.push(candidate);
  };
  if (state.pendingChoice) push(choiceDescriptor(state, state.pendingChoice, scheduledIncidentDay));
  const year = simulation.getYear(state.day);
  if (simulation.getSeason(state.day) === 'winter' && state.courtTribute && !state.courtTribute.resolved) {
    const occurrenceDay = (state.courtTribute.year - 1) * CONFIG.time.yearDays + CONFIG.time.seasonDays * 3 + 1;
    push({ key: `tribute:${state.courtTribute.year}`, type: 'tribute', occurrenceDay, expiresDay: state.courtTribute.year * CONFIG.time.yearDays });
  }
  const kimjang = kimjangBounds(year);
  const inKimjangWindow = state.day >= kimjang.occurrenceDay && state.day <= kimjang.expiresDay;
  if (inKimjangWindow && state.lastKimjangYear < year) {
    push({ key: `kimjang:${year}`, type: 'incident:kimjang', ...kimjang });
  }
  const scheduled = state.incidents?.scheduledDays?.[0];
  if (scheduled != null && scheduled <= state.day) {
    push({ key: `incident-scheduled:${scheduled}`, type: 'incident:scheduled', occurrenceDay: scheduled });
  }
  if (state.crackdownDeadline > 0 && state.day >= state.crackdownDeadline) {
    push({ key: `crackdown:${state.crackdownDeadline}`, type: 'crackdown', occurrenceDay: state.crackdownDeadline });
  }
  for (const violation of state.territoryViolations ?? []) {
    if (violation.warningDay <= state.day) {
      push({ key: `territory:${violation.siteId}:${violation.warningDay}`, type: 'territory', occurrenceDay: violation.warningDay });
    }
  }
  if (state.silverVein?.status === 'offered') {
    const occurrenceDay = state.silverVein.discoveredDay ?? state.day;
    push({ key: `silverVein:${occurrenceDay}`, type: 'silverVein', occurrenceDay });
  }
  for (const [id, record] of Object.entries(state.specialResidentRecords ?? {})) {
    if (record?.status === 'active' && record.nextDemandDay != null && record.nextDemandDay <= state.day) {
      push({ key: `special-demand:${id}:${record.nextDemandDay}`, type: 'specialResident:followup', occurrenceDay: record.nextDemandDay });
    }
  }
  return candidates;
}

function observeCandidates(state, audit, scheduledIncidentDay) {
  const candidates = dueCandidates(state, scheduledIncidentDay);
  if (candidates.length > 1) audit.multipleCandidateDays++;
  for (const candidate of candidates) {
    const known = audit.candidates.get(candidate.key) ?? { ...candidate, seenDays: 0, displayed: false, fulfilled: false };
    known.seenDays++;
    audit.candidates.set(candidate.key, known);
  }
  return candidates;
}

function reconcileCandidateFulfillment(state, audit) {
  for (const candidate of audit.candidates.values()) {
    if (candidate.fulfilled) continue;
    if (candidate.key.startsWith('tribute:')) {
      const year = Number(candidate.key.slice('tribute:'.length));
      if (state.courtTribute?.year === year && state.courtTribute?.resolved) candidate.fulfilled = true;
      continue;
    }
    if (candidate.key.startsWith('kimjang:')) {
      const year = Number(candidate.key.slice('kimjang:'.length));
      if (state.lastKimjangYear >= year) candidate.fulfilled = true;
    }
  }
}

function recordOpenedChoice(state, audit, scheduledIncidentDay) {
  const choice = state.pendingChoice;
  if (!choice || audit.seenChoices.has(choice)) return;
  audit.seenChoices.add(choice);
  const descriptor = choiceDescriptor(state, choice, scheduledIncidentDay);
  const candidate = audit.candidates.get(descriptor.key) ?? { ...descriptor, seenDays: 1, displayed: false };
  candidate.displayed = true;
  audit.candidates.set(descriptor.key, candidate);
  const occurrenceDay = candidate.occurrenceDay ?? descriptor.occurrenceDay ?? state.day;
  const expiresDay = candidate.expiresDay ?? descriptor.expiresDay;
  const waitDays = Math.max(0, state.day - occurrenceDay);
  const entry = {
    key: descriptor.key,
    type: descriptor.type,
    occurrenceDay,
    displayDay: state.day,
    waitDays,
    expiresDay: expiresDay ?? null,
    expired: expiresDay != null && state.day > expiresDay,
    retryCount: Math.max(waitDays, (candidate.seenDays ?? 1) - 1),
  };
  audit.timeline.push(entry);
  if (!audit.longestWait || entry.waitDays > audit.longestWait.waitDays) audit.longestWait = entry;
}

function handleReleaseChoice(state, policyMetrics) {
  const choice = state.pendingChoice;
  if (!choice) return;
  if (choice.kind === 'immigration') {
    const count = Math.max(0, Number(choice.data.count) || 0);
    const projectedPopulation = living(state).length + count;
    const projectedFoodDays = projectedPopulation > 0
      ? consumption.foodTotal(state) / (projectedPopulation * CONFIG.needs.foodPerDay)
      : 0;
    const projectedFuelDays = projectedPopulation > 0
      ? consumption.fuelHeatTotal(state) / (projectedPopulation * CONFIG.needs.firewoodPerPerson)
      : 0;
    const season = simulation.getSeason(state.day);
    const requiredFuelDays = season === 'autumn' || season === 'winter' ? 75 : 45;
    const supportedPopulation = state.buildings
      .filter(building => building.type === 'field' && plotArea(building) >= 9)
      .length * 14;
    const accept = housingCapacity(state) >= projectedPopulation &&
      projectedFoodDays >= 20 && projectedFuelDays >= requiredFuelDays &&
      supportedPopulation >= projectedPopulation;
    policyMetrics[accept ? 'immigrantsAccepted' : 'immigrantsRejected'] += count;
    simulation.resolveChoice(state, accept ? 'accept' : 'reject');
    return;
  }
  handleChoice(state, 'active', policyMetrics);
}

function resolvePendingChoices(state, audit, policyMetrics, scheduledIncidentDay = null) {
  let guard = 0;
  while (state.pendingChoice && guard++ < 16) {
    observeCandidates(state, audit, scheduledIncidentDay);
    recordOpenedChoice(state, audit, scheduledIncidentDay);
    const choice = state.pendingChoice;
    handleReleaseChoice(state, policyMetrics);
    if (state.pendingChoice === choice) {
      const fallback = choice.options.find(option => !option.disabled)?.id;
      if (fallback) simulation.resolveChoice(state, fallback);
    }
    if (state.pendingChoice === choice) break;
  }
  return state.pendingChoice == null;
}

function createMetrics(state) {
  return {
    startPopulation: living(state).length,
    finalPopulation: 0,
    minimumPopulation: living(state).length,
    ageStages: ageStages(state),
    ageStagePersonDays: { infant: 0, child: 0, youth: 0, adult: 0, elder: 0 },
    marriages: 0,
    births: 0,
    deathCauses: { natural: 0, combat: 0, starvation: 0, cold: 0, disease: 0, other: 0 },
    minFoodDays: Infinity,
    minFuelDays: Infinity,
    spoilageLoss: 0,
    preservedFoodProduced: 0,
    kimjangSuccesses: 0,
    jangProduced: 0,
    saltShortageDays: 0,
    livestockBirths: 0,
    livestockStarvationDeaths: 0,
    livestockSlaughtered: 0,
    hayShortageDays: 0,
    silverIncome: 0,
    silverSpending: 0,
    secretMiningDays: 0,
    youthWorkDays: 0,
    youthSchoolDays: 0,
    largePlotSowingRateTotal: 0,
    largePlotSowingRateSamples: 0,
    largePlotSowingPeaks: {},
    largePlotAverageSowingRate: 0,
    unsownTiles: 0,
    unharvestedLosses: 0,
    plowOxUseDays: 0,
    longVacancies: Object.fromEntries(CRITICAL_JOBS.map(job => [job, { current: 0, max: 0, total: 0 }])),
    moraleTotal: 0,
    moraleSamples: 0,
    averageMorale: 0,
    minimumMorale: 100,
    unmetSatisfactionByRank: Object.fromEntries(RANKS.map(rank => [rank, {}])),
    burialDelayDays: [],
    maxUnburiedCorpses: 0,
    specialResidentsJoined: 0,
    specialResidentsDeparted: 0,
    maxSuspicion: state.suspicion,
    inspections: 0,
    censures: 0,
    crackdowns: 0,
    rankReach: { settlement: state.day, bo: null, jin: null, bu: null },
    survivedTenYears: false,
    gameOverReason: null,
    structuralFailures: [],
  };
}

function vacancyRequired(state, job) {
  if (job === 'farmer') return state.buildings.some(building => building.built && (building.type === 'field' || building.type === 'paddy'));
  if (job === 'builder') return activeConstructionCount(state) > 0;
  if (job === 'miner') return builtCount(state, 'mine') > 0;
  if (job === 'herder') return builtCount(state, 'stable') > 0;
  if (job === 'physician') return builtCount(state, 'clinic') > 0;
  if (job === 'teacher') return builtCount(state, 'school') > 0;
  if (job === 'undertaker') return (state.corpses?.length ?? 0) > 0;
  return false;
}

function sampleDailyState(state, metrics) {
  const people = living(state);
  metrics.minimumPopulation = Math.min(metrics.minimumPopulation, people.length);
  const stages = ageStages(state);
  for (const [stage, count] of Object.entries(stages)) metrics.ageStagePersonDays[stage] += count;
  metrics.minFoodDays = Math.min(metrics.minFoodDays, foodDays(state));
  metrics.minFuelDays = Math.min(metrics.minFuelDays, fuelDays(state));
  if ((state.resources.salt ?? 0) < 1) metrics.saltShortageDays++;
  if (state.silverVein?.status === 'secret') metrics.secretMiningDays++;
  if (state.buildings.some(building => building.type === 'stable' && building.built && (building.livestock?.feedShortageDays ?? 0) > 0)) {
    metrics.hayShortageDays++;
  }
  for (const resident of people) {
    if (resident.stage !== 'youth') continue;
    if (resident.youthActivity === 'school') metrics.youthSchoolDays++;
    else metrics.youthWorkDays++;
  }
  const largePlots = state.buildings.filter(building => building.built &&
    (building.type === 'field' || building.type === 'paddy') && plotArea(building) >= CONFIG.farming.largePlotOxThreshold);
  for (const plot of largePlots) {
    if ((plot.plowOxen ?? 0) > 0) metrics.plowOxUseDays++;
    const crop = crops.CROP_DEFS[plot.cropId];
    if (!crop) continue;
    const season = simulation.getSeason(state.day);
    const nextSeason = simulation.getSeason(state.day + 1);
    const cycleKey = `${simulation.getYear(state.day)}:${plot.id}:${plot.cropId}`;
    const rate = Math.min(1, Math.max(0, Number(plot.sownArea ?? 0) / plotArea(plot)));
    metrics.largePlotSowingPeaks[cycleKey] = Math.max(metrics.largePlotSowingPeaks[cycleKey] ?? 0, rate);
    if (crop.plantSeasons.includes(season) && !crop.plantSeasons.includes(nextSeason)) {
      metrics.largePlotSowingRateTotal += metrics.largePlotSowingPeaks[cycleKey];
      metrics.largePlotSowingRateSamples++;
      delete metrics.largePlotSowingPeaks[cycleKey];
    }
  }
  const morale = people.length > 0 ? people.reduce((sum, resident) => sum + resident.morale, 0) / people.length : 0;
  metrics.moraleTotal += morale;
  metrics.moraleSamples++;
  metrics.minimumMorale = Math.min(metrics.minimumMorale, morale);
  metrics.maxUnburiedCorpses = Math.max(metrics.maxUnburiedCorpses, state.corpses?.length ?? 0);
  metrics.maxSuspicion = Math.max(metrics.maxSuspicion, state.suspicion);
  for (const factor of state.moraleFactors ?? []) {
    if (!factor.unlocked || factor.delta >= 0) continue;
    const bag = metrics.unmetSatisfactionByRank[state.rank];
    bag[factor.id] = (bag[factor.id] ?? 0) + 1;
  }
  for (const job of CRITICAL_JOBS) {
    const vacancy = metrics.longVacancies[job];
    const occupied = people.some(resident => resident.job === job);
    if (vacancyRequired(state, job) && !occupied) {
      vacancy.current++;
      vacancy.total++;
      vacancy.max = Math.max(vacancy.max, vacancy.current);
    } else vacancy.current = 0;
  }
}

function classifyDeaths(beforeAlive, state, newLogs, metrics) {
  const logText = newLogs.map(entry => entry.text).join('\n');
  for (const [id, before] of beforeAlive) {
    const resident = state.residents.find(candidate => candidate.id === id);
    if (!resident || resident.alive) continue;
    const corpse = state.corpses?.find(candidate => candidate.name === before.name && candidate.deathDay === state.day);
    const cause = corpse?.cause ?? '';
    if (logText.includes(before.name) && logText.includes('전투 중 전사')) metrics.deathCauses.combat++;
    else if (cause.includes('굶') || logText.includes(`${before.name}이(가) 굶`)) metrics.deathCauses.starvation++;
    else if (/동상|추위|혹한|동사/.test(cause) || new RegExp(`${before.name}.*(?:동상|추위|혹한|동사)`).test(logText)) metrics.deathCauses.cold++;
    else if (/병|질병|역병/.test(cause) || new RegExp(`${before.name}.*(?:병|질병|역병)`).test(logText)) metrics.deathCauses.disease++;
    else if (/노환|자연사/.test(cause)) metrics.deathCauses.natural++;
    else metrics.deathCauses.other++;
  }
}

function collectNewLogs(log, beforeLast, beforeLength) {
  if (beforeLast) {
    const retainedIndex = log.indexOf(beforeLast);
    if (retainedIndex >= 0) return log.slice(retainedIndex + 1);
  }
  return log.slice(Math.min(beforeLength, log.length));
}

function parseDailyLogs(logs, metrics) {
  for (const entry of logs) {
    const text = entry.text;
    if (text.includes('혼인했습니다.')) metrics.marriages++;
    const livestockBirth = text.match(/새끼 가축 (\d+)마리/);
    if (livestockBirth) metrics.livestockBirths += Number(livestockBirth[1]);
    const livestockDeath = text.match(/먹이가 모자라 가축 (\d+)마리/);
    if (livestockDeath) metrics.livestockStarvationDeaths += Number(livestockDeath[1]);
    const jang = text.match(/^장 ([\d.]+)이 익었습니다/);
    if (jang) metrics.jangProduced += Number(jang[1]);
    const unsown = text.match(/경작지 (\d+)칸이 씨를 넣지 못한/);
    if (unsown) metrics.unsownTiles += Number(unsown[1]);
    if (text.includes('감찰 어사가 마을에 들었습니다')) metrics.inspections++;
    if (text.includes('조정의 견책이 내려왔습니다')) metrics.censures++;
    if (text.includes('토벌군이 마을 앞에 진을 쳤습니다')) metrics.crackdowns++;
  }
}

function updateSpecialResidentTransitions(before, state, metrics) {
  const after = state.specialResidentRecords ?? {};
  for (const [id, record] of Object.entries(after)) {
    const prior = before[id];
    if (prior?.status !== 'active' && record?.status === 'active') metrics.specialResidentsJoined++;
    if (prior?.status !== 'departed' && record?.status === 'departed') metrics.specialResidentsDeparted++;
  }
}

function validateStructuralIntegrity(state) {
  const failures = [];
  const residents = new Map(state.residents.map(resident => [resident.id, resident]));
  const buildingsById = new Map(state.buildings.map(building => [building.id, building]));
  if (residents.size !== state.residents.length) failures.push('duplicate resident id');
  if (buildingsById.size !== state.buildings.length) failures.push('duplicate building id');
  for (const [resource, amount] of Object.entries(state.resources)) {
    if (!Number.isFinite(amount)) failures.push(`non-finite resource ${resource}`);
    else if (amount < -1e-6) failures.push(`negative resource ${resource}:${amount}`);
  }
  for (const resident of state.residents) {
    for (const [label, id] of [['spouse', resident.spouseId], ['mother', resident.motherId], ['father', resident.fatherId]]) {
      if (id != null && !residents.has(id)) failures.push(`missing ${label} resident ${resident.id}->${id}`);
    }
    for (const [label, id] of [['assigned', resident.assignedBuildingId], ['home', resident.homeBuildingId]]) {
      if (id != null && !buildingsById.has(id)) failures.push(`missing ${label} building ${resident.id}->${id}`);
    }
  }
  const oxenAssigned = livestock.plowOxenAssigned(state);
  const oxenPool = livestock.plowOxenPool(state);
  if (oxenAssigned > oxenPool) failures.push(`plow ox pool exceeded ${oxenAssigned}/${oxenPool}`);
  for (const building of state.buildings) {
    if (!Number.isFinite(building.livestock?.headcount ?? 0) || (building.livestock?.headcount ?? 0) < 0) {
      failures.push(`invalid livestock ${building.id}`);
    }
    if ((building.plowOxen ?? 0) > livestock.plotPlowOxenMax(building)) failures.push(`plot ox limit exceeded ${building.id}`);
    for (const [resource, amount] of Object.entries(building.inventory ?? {})) {
      if (!Number.isFinite(amount) || amount < -1e-6) failures.push(`invalid inventory ${building.id}:${resource}`);
    }
  }
  const mounts = weapons.resolvedMountAssignments(state);
  if (Object.keys(mounts).length > weapons.horseStock(state)) failures.push('horse assignments exceed stock');
  for (const id of Object.keys(state.mountAssignments ?? {}).map(Number)) {
    if (!residents.get(id)?.alive || residents.get(id)?.stage) failures.push(`invalid mounted resident ${id}`);
  }
  for (const id of Object.keys(state.weaponAssignments ?? {}).map(Number)) {
    if (!residents.get(id)?.alive) failures.push(`invalid armed resident ${id}`);
  }
  for (const id of state.expedition?.memberIds ?? []) if (!residents.get(id)?.alive) failures.push(`invalid expedition resident ${id}`);
  for (const id of state.battle?.defenderIds ?? []) if (!residents.has(id)) failures.push(`invalid battle resident ${id}`);
  for (const group of state.tacticalBattle?.defenderGroups ?? []) {
    for (const id of group.residentIds ?? []) if (!residents.has(id)) failures.push(`invalid tactical resident ${id}`);
  }
  const corpses = new Map((state.corpses ?? []).map(corpse => [corpse.id, corpse]));
  const carriedBy = new Map();
  for (const resident of living(state)) {
    if (resident.corpseCarryId == null) continue;
    if (!corpses.has(resident.corpseCarryId)) failures.push(`missing carried corpse ${resident.id}->${resident.corpseCarryId}`);
    carriedBy.set(resident.corpseCarryId, (carriedBy.get(resident.corpseCarryId) ?? 0) + 1);
  }
  for (const corpse of state.corpses ?? []) {
    if (corpse.carried && !corpse.withExpedition && carriedBy.get(corpse.id) !== 1) failures.push(`corpse carrier mismatch ${corpse.id}`);
  }
  if (state.day % CONFIG.time.seasonDays === 1) {
    const visit = (value, path, depth) => {
      if (depth > 10 || value == null) return;
      if (typeof value === 'number' && !Number.isFinite(value)) failures.push(`non-finite ${path}`);
      else if (Array.isArray(value)) value.forEach((entry, index) => visit(entry, `${path}[${index}]`, depth + 1));
      else if (typeof value === 'object') {
        for (const [key, entry] of Object.entries(value)) visit(entry, `${path}.${key}`, depth + 1);
      }
    };
    visit(state, 'state', 0);
  }
  try { JSON.stringify(state); } catch (error) { failures.push(`not serializable: ${error.message}`); }
  return [...new Set(failures)];
}

function finalizeDeadlineAudit(state, audit) {
  const misses = [];
  for (const candidate of audit.candidates.values()) {
    if (candidate.displayed || candidate.fulfilled || candidate.expiresDay == null) continue;
    if (state.day > candidate.expiresDay) misses.push({
      key: candidate.key,
      occurrenceDay: candidate.occurrenceDay,
      expiresDay: candidate.expiresDay,
    });
  }
  return misses;
}

function saveRoundTrip(state) {
  localStorage.clear();
  const saved = saveLoad.saveGame(state, 1);
  const loaded = saved ? saveLoad.loadGame(1) : null;
  const ok = Boolean(loaded && loaded.day === state.day && loaded.schemaVersion === state.schemaVersion &&
    living(loaded).length === living(state).length);
  localStorage.clear();
  return { ok, saved, loadedDay: loaded?.day ?? null, schemaVersion: loaded?.schemaVersion ?? null };
}

function runOne(seed) {
  const state = simulation.newGame(seed, 'normal');
  const candidates = placementCandidates(state);
  const metrics = createMetrics(state);
  const policyMetrics = emptyMetrics();
  const audit = {
    timeline: [],
    candidates: new Map(),
    seenChoices: new WeakSet(),
    multipleCandidateDays: 0,
    longestWait: null,
  };
  let lastPopulation = living(state).length;
  let lastBuilt = state.buildings.filter(building => building.built).length;
  let previousCorpses = new Map((state.corpses ?? []).map(corpse => [corpse.id, { ...corpse }]));
  let previousSpecialRecords = structuredClone(state.specialResidentRecords ?? {});
  let stalledIterations = 0;
  const maxDay = CONFIG.time.yearDays * years + 1;

  while (state.day < maxDay) {
    if (state.gameOver) {
      if (!state.gameOver.won) {
        metrics.gameOverReason = state.gameOver.reason;
        break;
      }
      simulation.continueAfterVictory(state);
    }
    if (!resolvePendingChoices(state, audit, policyMetrics)) {
      metrics.structuralFailures.push(`pendingChoice permanent stop on day ${state.day}`);
      break;
    }
    reserveForTribute(state);
    manageReleaseConstruction(state, candidates);

    const population = living(state).length;
    const built = state.buildings.filter(building => building.built).length;
    if (state.day % 3 === 1 || population !== lastPopulation || built !== lastBuilt) {
      manageYouthPolicy(state);
      rebalanceReleaseJobs(state);
      manageServiceJobs(state);
      manageCropPlan(state);
      prepareLivestockCapacity(state, metrics);
      manageOxenAndMounts(state);
      lastPopulation = population;
      lastBuilt = built;
    }
    if (!state.pendingChoice && !state.battle && state.day % 2 === 0) tryReleaseTrade(state, policyMetrics);
    if (!resolvePendingChoices(state, audit, policyMetrics)) {
      metrics.structuralFailures.push(`pendingChoice permanent stop on day ${state.day}`);
      break;
    }

    sampleDailyState(state, metrics);
    metrics.spoilageLoss += spoilage.spoilagePreview(state).totalLoss;
    const beforeDay = state.day;
    const beforeLogLength = state.log.length;
    const beforeLogLast = state.log.at(-1) ?? null;
    const beforeAlive = new Map(living(state).map(resident => [resident.id, { name: resident.name }]));
    const beforePreserved = PRESERVED_RESOURCES.reduce((sum, resource) => sum + stockTotal(state, resource), 0);
    const beforeSilver = stockTotal(state, 'silver');
    const scheduledIncidentDay = state.incidents?.scheduledDays?.[0] ?? null;
    if (simulation.getSeason(state.day) === 'autumn' && simulation.getSeason(state.day + 1) === 'winter') {
      metrics.unharvestedLosses += state.buildings
        .filter(building => (building.type === 'field' || building.type === 'paddy') && building.fieldGrowth > 1)
        .reduce((sum, building) => sum + (building.fieldGrowth / 100) * Math.max(1, Number(building.sownArea) || 0), 0);
    }

    simulation.advanceDay(state);
    if (state.day === beforeDay) stalledIterations++;
    else stalledIterations = 0;
    if (stalledIterations >= 3) {
      metrics.structuralFailures.push(`day progression permanently stopped on day ${state.day}`);
      break;
    }
    const newLogs = collectNewLogs(state.log, beforeLogLast, beforeLogLength);
    metrics.births += living(state).filter(resident => !beforeAlive.has(resident.id) && resident.motherId != null).length;
    parseDailyLogs(newLogs, metrics);
    classifyDeaths(beforeAlive, state, newLogs, metrics);
    const afterPreserved = PRESERVED_RESOURCES.reduce((sum, resource) => sum + stockTotal(state, resource), 0);
    metrics.preservedFoodProduced += Math.max(0, afterPreserved - beforePreserved);
    const afterSilver = stockTotal(state, 'silver');
    if (afterSilver > beforeSilver) metrics.silverIncome += afterSilver - beforeSilver;
    else metrics.silverSpending += beforeSilver - afterSilver;
    const currentCorpses = new Map((state.corpses ?? []).map(corpse => [corpse.id, { ...corpse }]));
    for (const [id, corpse] of previousCorpses) {
      if (!currentCorpses.has(id)) metrics.burialDelayDays.push(Math.max(0, state.day - corpse.deathDay));
    }
    previousCorpses = currentCorpses;
    updateSpecialResidentTransitions(previousSpecialRecords, state, metrics);
    previousSpecialRecords = structuredClone(state.specialResidentRecords ?? {});
    if (metrics.rankReach[state.rank] == null) metrics.rankReach[state.rank] = state.day;
    reconcileCandidateFulfillment(state, audit);
    observeCandidates(state, audit, scheduledIncidentDay);
    recordOpenedChoice(state, audit, scheduledIncidentDay);
    const failures = validateStructuralIntegrity(state);
    for (const failure of failures) {
      if (!metrics.structuralFailures.includes(failure)) metrics.structuralFailures.push(failure);
    }
  }

  metrics.kimjangSuccesses = policyMetrics.kimjangs;
  metrics.finalPopulation = living(state).length;
  metrics.minimumPopulation = Math.min(metrics.minimumPopulation, metrics.finalPopulation);
  metrics.ageStages = ageStages(state);
  metrics.largePlotAverageSowingRate = metrics.largePlotSowingRateSamples > 0
    ? metrics.largePlotSowingRateTotal / metrics.largePlotSowingRateSamples
    : 0;
  delete metrics.largePlotSowingPeaks;
  metrics.averageMorale = metrics.moraleTotal / Math.max(1, metrics.moraleSamples);
  metrics.minimumMorale = Number.isFinite(metrics.minimumMorale) ? metrics.minimumMorale : 0;
  metrics.minFoodDays = Number.isFinite(metrics.minFoodDays) ? metrics.minFoodDays : 0;
  metrics.minFuelDays = Number.isFinite(metrics.minFuelDays) ? metrics.minFuelDays : 0;
  metrics.survivedTenYears = state.day >= CONFIG.time.yearDays * DEFAULT_YEARS + 1 && !state.gameOver;
  const deadlineMisses = finalizeDeadlineAudit(state, audit);
  const roundTrip = saveRoundTrip(state);
  if (!roundTrip.ok) metrics.structuralFailures.push('save round-trip failed');
  const eventTypeCounts = {};
  const eventWaitByType = {};
  for (const entry of audit.timeline) {
    eventTypeCounts[entry.type] = (eventTypeCounts[entry.type] ?? 0) + 1;
    (eventWaitByType[entry.type] ??= []).push(entry.waitDays);
  }
  return {
    seed,
    difficulty: state.difficulty,
    finalDay: state.day,
    observedYears: round((state.day - 1) / CONFIG.time.yearDays),
    rank: state.rank,
    finalFoodDays: round(foodDays(state)),
    finalFuelDays: round(fuelDays(state)),
    finalDefense: round(state.resources.defense),
    finalBuildings: Object.fromEntries(Object.entries(state.buildings.reduce((bag, building) => {
      if (building.built) bag[building.type] = (bag[building.type] ?? 0) + 1;
      return bag;
    }, {})).sort()),
    ...metrics,
    spoilageLoss: round(metrics.spoilageLoss),
    preservedFoodProduced: round(metrics.preservedFoodProduced),
    jangProduced: round(metrics.jangProduced),
    silverIncome: round(metrics.silverIncome),
    silverSpending: round(metrics.silverSpending),
    largePlotAverageSowingRate: round(metrics.largePlotAverageSowingRate, 3),
    unharvestedLosses: round(metrics.unharvestedLosses),
    averageMorale: round(metrics.averageMorale),
    minimumMorale: round(metrics.minimumMorale),
    minFoodDays: round(metrics.minFoodDays),
    minFuelDays: round(metrics.minFuelDays),
    burialDelayDays: {
      count: metrics.burialDelayDays.length,
      average: round(average(metrics.burialDelayDays)),
      max: Math.max(0, ...metrics.burialDelayDays),
    },
    eventAudit: {
      pendingChoiceCount: audit.timeline.length,
      eventTypeCounts,
      waitByType: Object.fromEntries(Object.entries(eventWaitByType).map(([type, waits]) => [type, {
        average: round(average(waits)),
        p95: percentile(waits, 0.95),
        max: Math.max(0, ...waits),
      }])),
      multipleCandidateDays: audit.multipleCandidateDays,
      longestWait: audit.longestWait,
      deadlineMisses,
      timeline: audit.timeline,
    },
    saveRoundTrip: roundTrip,
  };
}

function sum(results, selector) {
  return results.reduce((total, result) => total + selector(result), 0);
}

function summarize(results, durationMs) {
  const rankReach = Object.fromEntries(RANKS.slice(1).map(rank => [rank,
    results.filter(result => result.rankReach[rank] != null).length / results.length]));
  const eventWaits = results.flatMap(result => result.eventAudit.timeline ?? []);
  const deadlineMisses = results.flatMap(result => result.eventAudit.deadlineMisses.map(miss => ({ seed: result.seed, ...miss })));
  const structuralFailures = results.flatMap(result => result.structuralFailures.map(failure => ({ seed: result.seed, failure })));
  const longestWait = eventWaits.sort((left, right) => right.waitDays - left.waitDays)[0] ?? null;
  const summary = {
    runs: results.length,
    years,
    difficulty: 'normal',
    seeds: results.map(result => result.seed),
    durationMs: round(durationMs),
    autoplayPolicy: AUTOPLAY_POLICY_DESCRIPTION,
    population: {
      averageStart: round(average(results.map(result => result.startPopulation))),
      averageFinal: round(average(results.map(result => result.finalPopulation))),
      minimumObserved: Math.min(...results.map(result => result.minimumPopulation)),
      finalAgeStages: Object.fromEntries(Object.keys(results[0]?.ageStages ?? {}).map(stage => [stage,
        round(average(results.map(result => result.ageStages[stage])))])),
      marriages: sum(results, result => result.marriages),
      births: sum(results, result => result.births),
      deathCauses: Object.fromEntries(Object.keys(results[0]?.deathCauses ?? {}).map(cause => [cause,
        sum(results, result => result.deathCauses[cause])])),
    },
    economy: {
      averageMinFoodDays: round(average(results.map(result => result.minFoodDays))),
      averageMinFuelDays: round(average(results.map(result => result.minFuelDays))),
      spoilageLoss: round(sum(results, result => result.spoilageLoss)),
      preservedFoodProduced: round(sum(results, result => result.preservedFoodProduced)),
      kimjangSuccesses: sum(results, result => result.kimjangSuccesses),
      jangProduced: round(sum(results, result => result.jangProduced)),
      saltShortageDays: sum(results, result => result.saltShortageDays),
      livestockBirths: sum(results, result => result.livestockBirths),
      livestockStarvationDeaths: sum(results, result => result.livestockStarvationDeaths),
      livestockSlaughtered: sum(results, result => result.livestockSlaughtered),
      hayShortageDays: sum(results, result => result.hayShortageDays),
      silverIncome: round(sum(results, result => result.silverIncome)),
      silverSpending: round(sum(results, result => result.silverSpending)),
      secretMiningDays: sum(results, result => result.secretMiningDays),
    },
    labor: {
      youthWorkDays: sum(results, result => result.youthWorkDays),
      youthSchoolDays: sum(results, result => result.youthSchoolDays),
      largePlotAverageSowingRate: round(average(results.map(result => result.largePlotAverageSowingRate)), 3),
      unsownTiles: sum(results, result => result.unsownTiles),
      unharvestedLosses: round(sum(results, result => result.unharvestedLosses)),
      plowOxUseDays: sum(results, result => result.plowOxUseDays),
      longVacancies: Object.fromEntries(CRITICAL_JOBS.map(job => [job, {
        max: Math.max(...results.map(result => result.longVacancies[job].max)),
        total: sum(results, result => result.longVacancies[job].total),
      }])),
    },
    social: {
      averageMorale: round(average(results.map(result => result.averageMorale))),
      minimumMorale: Math.min(...results.map(result => result.minimumMorale)),
      unmetSatisfactionByRank: results.reduce((all, result) => {
        for (const [rank, factors] of Object.entries(result.unmetSatisfactionByRank)) {
          const bag = (all[rank] ??= {});
          for (const [factor, days] of Object.entries(factors)) bag[factor] = (bag[factor] ?? 0) + days;
        }
        return all;
      }, {}),
      burialDelayDays: {
        average: round(average(results.map(result => result.burialDelayDays.average))),
        max: Math.max(...results.map(result => result.burialDelayDays.max)),
      },
      maxUnburiedCorpses: Math.max(...results.map(result => result.maxUnburiedCorpses)),
      specialResidentsJoined: sum(results, result => result.specialResidentsJoined),
      specialResidentsDeparted: sum(results, result => result.specialResidentsDeparted),
      maxSuspicion: Math.max(...results.map(result => result.maxSuspicion)),
      inspections: sum(results, result => result.inspections),
      censures: sum(results, result => result.censures),
      crackdowns: sum(results, result => result.crackdowns),
    },
    events: {
      pendingChoiceCount: sum(results, result => result.eventAudit.pendingChoiceCount),
      multipleCandidateDays: sum(results, result => result.eventAudit.multipleCandidateDays),
      longestWait,
      deadlineMisses,
      eventQueueImplemented: false,
    },
    progression: {
      rankReach,
      survivedTenYears: results.filter(result => result.survivedTenYears).length,
      survivalRate: results.filter(result => result.survivedTenYears).length / results.length,
      gameOverReasons: results.reduce((bag, result) => {
        if (result.gameOverReason) bag[result.gameOverReason] = (bag[result.gameOverReason] ?? 0) + 1;
        return bag;
      }, {}),
    },
    structuralFailures,
    saveRoundTripsPassed: results.filter(result => result.saveRoundTrip.ok).length,
  };
  const warnings = [];
  const releaseLengthRun = years >= DEFAULT_YEARS;
  if (releaseLengthRun && results.filter(result => result.gameOverReason && result.observedYears <= 2).length > results.length / 2) {
    warnings.push('대부분의 시드가 2년 이내 전멸');
  }
  if (releaseLengthRun && summary.population.births === 0) warnings.push('출산이 한 번도 발생하지 않음');
  if (releaseLengthRun && summary.labor.youthWorkDays > 0 && summary.labor.youthSchoolDays === 0) warnings.push('소년 취학이 한 번도 선택되지 않음');
  if (sum(results, result => result.largePlotSowingRateSamples) > 0 && summary.labor.largePlotAverageSowingRate < 0.5) {
    warnings.push('대형 경작지 평균 파종률 50% 미만');
  }
  if (summary.social.averageMorale <= 20) warnings.push('평균 민심이 20 이하');
  if ((longestWait?.waitDays ?? 0) >= CONFIG.time.seasonDays) warnings.push('사건이 한 계절 이상 밀림');
  if (deadlineMisses.length > 0) warnings.push('deadline 사건 누락');
  if (structuralFailures.length > 0) warnings.push('구조 무결성 실패');
  return { ...summary, warnings };
}

const startedAt = performance.now();
const results = [];
for (let index = 0; index < runCount; index++) {
  const result = runOne(seedBase + index);
  results.push(result);
  console.log(`[release candidate] seed ${result.seed}: ${result.observedYears}y, pop ${result.finalPopulation}, rank ${result.rank}, events ${result.eventAudit.pendingChoiceCount}`);
}
const summary = summarize(results, performance.now() - startedAt);
console.table(results.map(result => ({
  seed: result.seed,
  years: result.observedYears,
  population: result.finalPopulation,
  rank: result.rank,
  births: result.births,
  deaths: Object.values(result.deathCauses).reduce((sum, value) => sum + value, 0),
  morale: result.averageMorale,
  eventMaxWait: result.eventAudit.longestWait?.waitDays ?? 0,
  deadlineMisses: result.eventAudit.deadlineMisses.length,
  structuralFailures: result.structuralFailures.length,
  saveRoundTrip: result.saveRoundTrip.ok,
})));
console.log(JSON.stringify({
  summary,
  runs: summaryOnly ? undefined : compact ? results.map(result => ({
    ...result,
    eventAudit: { ...result.eventAudit, timeline: undefined },
  })) : results,
}, null, 2));
