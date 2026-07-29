import { withJosa } from './josa';
import { recordAnnals } from './annals';
import { CONFIG } from './config';
import { footprintTilesOf, sownAreaOf } from './buildings';
import { cropIdForBuilding, CROP_DEFS } from './crops';
import { addLog } from './events';
import { consumeExpeditionPowder, expeditionResidentsForIds } from './expedition';
import {
  activePredatorScoutIds, availablePredatorScouts, generatedPredatorThreatProfile, materializePredatorThreat,
  predatorScoutDuration, predatorThreatProfile, tigerTierDangerMultiplier, tigerTierFromStrength, tigerTierLabel,
} from './expeditionIntel';
import { makeRng } from './map';
import { hasActivePhysician } from './medicine';
import { createResident, killResident, livingResidents, reconcileResidentHomes } from './residents';
import { getSeason, getYear } from './seasons';
import { createCombatRoster } from './combatRoster';
import { RESIDENT_ORIGINS } from './defectors';
import { acquireLivestock, ensureLivestockState, livestockCapacity } from './livestock';
import { normalizeDiscoveredSpecialItems, normalizeSpecialItemInventory } from './specialItems';
import {
  disasterChoiceChance,
  disasterChoiceForecast,
  disasterOccurrenceWeight,
} from './disasterClimate';
import type {
  Building,
  EpidemicState,
  GameState,
  IncidentState,
  Resident,
  ResourceId,
  PredatorKind,
  SpecialEventId,
  SpecialItemId,
  WildlifeKind,
} from './types';

const EVENT_COOLDOWNS: Record<SpecialEventId, number> = {
  wolf: CONFIG.specialEvents.wolfCooldownDays,
  tiger: CONFIG.specialEvents.tigerCooldownDays,
  boar: CONFIG.specialEvents.boarCooldownDays,
  wildGinseng: CONFIG.specialEvents.ginsengCooldownDays,
  plagueSuspicion: CONFIG.specialEvents.plagueCooldownDays,
  grainRequisition: CONFIG.specialEvents.grainRequisitionCooldownDays,
  shipwreck: CONFIG.specialEvents.shipwreckCooldownDays,
  earlyFrost: CONFIG.specialEvents.earlyFrostCooldownDays,
  gyrfalcon: CONFIG.specialEvents.gyrfalconCooldownDays,
  horseDefectors: CONFIG.defectors.horseOfferCooldownDays,
};

const FOOD_RESOURCES: ResourceId[] = ['grain', 'rice', 'meat', 'eggs', 'milk', 'fish', 'vegetables', 'beans'];

function incidentSchedule(seed: number, year: number): number[] {
  const rng = makeRng(seed + year * 15485863 + 41);
  const yearStart = (year - 1) * CONFIG.time.yearDays + 1;
  const count = year === 1 || rng() >= CONFIG.specialEvents.secondEventChance ? 1 : 2;
  if (count === 1) return [yearStart + 7 + Math.floor(rng() * 34)];
  return [
    yearStart + 6 + Math.floor(rng() * 13),
    yearStart + 27 + Math.floor(rng() * 15),
  ];
}

export function createIncidentState(seed: number, year = 1): IncidentState {
  return {
    year,
    scheduledDays: incidentSchedule(seed, year),
    resolutionCount: 0,
    cooldownUntil: {},
    predatorThreats: {},
    plagueCase: null,
    epidemic: null,
  };
}

export function ensureIncidentState(state: GameState): void {
  const year = getYear(state.day);
  if (!state.incidents) state.incidents = createIncidentState(state.seed, year);
  state.incidents.scheduledDays ??= [];
  state.incidents.resolutionCount ??= 0;
  state.incidents.cooldownUntil ??= {};
  state.incidents.predatorThreats ??= {};
  state.incidents.plagueCase ??= null;
  state.incidents.epidemic ??= null;
  if (state.incidents.year !== year) {
    state.incidents = {
      year,
      scheduledDays: incidentSchedule(state.seed, year),
      resolutionCount: state.incidents.resolutionCount ?? 0,
      cooldownUntil: state.incidents.cooldownUntil ?? {},
      predatorThreats: state.incidents.predatorThreats ?? {},
      plagueCase: state.incidents.plagueCase ?? null,
      epidemic: state.incidents.epidemic ?? null,
    };
  }
  state.specialItems = normalizeSpecialItemInventory(state.specialItems);
  state.discoveredSpecialItems = normalizeDiscoveredSpecialItems(state.discoveredSpecialItems);
  const artifactMisses = Math.floor(Number(state.courtGrantArtifactMisses));
  state.courtGrantArtifactMisses = Number.isFinite(artifactMisses) ? Math.max(0, artifactMisses) : 0;
  state.tributeWaivers ??= 0;
  for (const kind of ['wolf', 'tiger', 'boar'] as const) {
    const threat = state.incidents.predatorThreats[kind];
    if (!threat) continue;
    if (threat.size == null || threat.strength == null) {
      const generated = generatedPredatorThreatProfile(state.seed, kind, threat.untilDay);
      threat.size ??= generated.size;
      threat.strength ??= generated.strength;
    }
    if (kind === 'tiger' && threat.strength != null) {
      threat.tigerTier ??= tigerTierFromStrength(threat.strength);
    }
  }
  for (const resident of state.residents) resident.quarantinedUntil ??= 0;
}

function weightedPick<T>(rng: () => number, entries: Array<{ value: T; weight: number }>): T {
  let roll = rng() * entries.reduce((sum, entry) => sum + entry.weight, 0);
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.value;
  }
  return entries[entries.length - 1].value;
}

function standingFarms(state: GameState): Building[] {
  return state.buildings.filter(building =>
    building.built &&
    (building.type === 'field' || building.type === 'paddy') &&
    cropIdForBuilding(building) != null &&
    building.fieldGrowth > 1);
}

function weaponReadiness(state: GameState, memberIds?: Iterable<number>) {
  const combatants = memberIds
    ? createCombatRoster(state, { context: 'expedition', memberIds }).combatants
    : createCombatRoster(state, { context: 'villageDefense' }).combatants;
  const hunters = combatants.filter(resident => resident.role === 'hunter').length;
  const militia = combatants.filter(resident => resident.role === 'militia').length;
  const watchmen = combatants.filter(resident => resident.role === 'watchman').length;
  const team = hunters + militia + watchmen;
  const bows = combatants.filter(resident => resident.readyWeapon === 'hornBow').length;
  const spears = combatants.filter(resident => resident.readyWeapon === 'spear').length;
  const muskets = combatants.filter(resident => resident.readyWeapon === 'musket').length;
  return { hunters, militia, watchmen, team, bows, spears, muskets };
}

export function predatorHuntChance(
  state: GameState,
  kind: WildlifeKind,
  memberIds?: Iterable<number>,
): number {
  const r = weaponReadiness(state, memberIds);
  const base = kind === 'wolf' ? 0.34 : kind === 'tiger' ? 0.16 : 0.48;
  const hunterValue = kind === 'wolf' ? 0.11 : kind === 'tiger' ? 0.09 : 0.1;
  const baselineStrength = kind === 'wolf' ? 55 : kind === 'tiger' ? 67 : 48;
  const threatAdjustment = (predatorThreatProfile(state, kind).strength - baselineStrength) /
    (kind === 'tiger' ? 160 : 280);
  const chance = base + r.hunters * hunterValue + r.militia * 0.1 +
    r.watchmen * 0.045 + r.bows * 0.045 + r.spears * 0.025 + r.muskets * 0.09 - threatAdjustment;
  return Math.max(0.12, Math.min(0.94, chance));
}

export function predatorReadinessLabel(state: GameState, kind: WildlifeKind): string {
  const r = weaponReadiness(state);
  const intel = state.incidents.predatorThreats[kind]?.intel;
  const chance = Math.round(predatorHuntChance(state, kind) * 100);
  const chanceLabel = kind === 'boar' || intel?.precision === 'exact'
    ? `${chance}%`
    : intel?.precision === 'rough'
      ? `약 ${Math.round(chance / 5) * 5}%`
      : '???';
  return `사냥꾼 ${r.hunters} · 수비병 ${r.militia} · 파수꾼 ${r.watchmen} · ` +
    `각궁 ${r.bows} · 창 ${r.spears} · 조총 ${r.muskets} / 예상 성공 ${chanceLabel}`;
}

function wildlifeName(kind: WildlifeKind, state?: GameState): string {
  if (kind === 'wolf') return '늑대 떼';
  if (kind === 'tiger') {
    const exact = state?.incidents.predatorThreats.tiger?.intel?.precision === 'exact';
    return state && exact ? tigerTierLabel(predatorThreatProfile(state, kind).tigerTier) : '호랑이';
  }
  return '멧돼지 떼';
}

function wildlifeIllustration(kind: WildlifeKind) {
  if (kind === 'wolf') return {
    src: '/assets/events/wolf-sighting-v1.png',
    alt: '북방 숲의 늑대 떼와 토벌을 준비하는 개척지 사냥꾼들',
  };
  if (kind === 'tiger') return {
    src: '/assets/events/tiger-sighting-v1.png',
    alt: '눈 덮인 개척지 숲에 나타난 호랑이와 토벌대',
  };
  return {
    src: '/assets/events/boar-raid-v1.png',
    alt: '개척지 논밭으로 몰려들어 작물을 헤치는 멧돼지 떼',
  };
}

function openWildlifeEvent(state: GameState, kind: WildlifeKind, rng: () => number): void {
  if (kind === 'boar') {
    const farms = standingFarms(state);
    const target = farms[Math.floor(rng() * farms.length)];
    if (!target) return;
    const before = target.fieldGrowth;
    target.fieldGrowth *= 1 - CONFIG.specialEvents.boarInitialCropLoss;
    const lost = Math.max(1, Math.round(before - target.fieldGrowth));
    state.pendingChoice = {
      kind: 'incident',
      title: '멧돼지 떼 습격',
      body: `멧돼지 떼가 ${withJosa(target.type === 'paddy' ? '논' : '밭', '으로/로')} 몰려들어 작물을 헤쳤습니다. 이번 소출이 약 ${lost}% 줄었습니다.\n${predatorReadinessLabel(state, kind)}`,
      illustration: wildlifeIllustration(kind),
      options: [
        { id: 'hunt-now', label: '토벌한다', desc: '부상 위험을 감수하고 몰아냅니다. 성공하면 고기와 가죽을 얻습니다.' },
        {
          id: 'trap',
          label: '덫을 놓는다',
          desc: `목재 ${CONFIG.specialEvents.boarTrapWood}, 도구 ${withJosa(CONFIG.specialEvents.boarTrapTools, '을/를')} 써서 안전하게 수를 줄입니다. 보상은 적습니다.`,
          disabled: state.resources.wood < CONFIG.specialEvents.boarTrapWood || state.resources.tools < CONFIG.specialEvents.boarTrapTools,
          disabledReason: `목재 ${CONFIG.specialEvents.boarTrapWood}, 도구 ${withJosa(CONFIG.specialEvents.boarTrapTools, '이/가')} 필요합니다`,
        },
        { id: 'leave', label: '그냥 둔다', desc: '멧돼지가 주변에 눌러앉아 밤마다 농작물과 저장 식량을 노릴 수 있습니다.' },
      ],
      data: { eventId: kind, predator: kind, targetBuildingId: target.id },
    };
    return;
  }

  const wolf = kind === 'wolf';
  const scoutAvailable = availablePredatorScouts(state).length > 0;
  state.pendingChoice = {
    kind: 'incident',
    title: wolf ? '늑대 떼 발견' : '호랑이 출몰',
    body: `${wolf ? '벌목꾼들이 숲 가장자리에서 늑대 떼의 흔적을 발견했습니다.' : '산길에서 커다란 호랑이의 발자국과 울음소리가 확인되었습니다.'}\n` +
      predatorReadinessLabel(state, kind),
    illustration: wildlifeIllustration(kind),
    options: [
      {
        id: 'hunt-now',
        label: '토벌대를 즉시 소집한다',
        desc: wolf
          ? '편성창에서 출정 인원과 무장을 정한 뒤 늑대 서식지로 보냅니다.'
          : '편성창에서 출정 인원과 무장을 정한 뒤 호랑이 서식지로 보냅니다.',
      },
      {
        id: 'track-first',
        label: '우선 흔적을 쫓는다',
        desc: '사냥꾼 한 명을 골라 2~4일 동안 파견한 뒤 규모를 파악합니다. 그동안에도 맹수의 위협은 계속됩니다.',
        disabled: !scoutAvailable,
        disabledReason: '파견할 수 있는 건강한 사냥꾼이 없습니다',
      },
      {
        id: 'prepare',
        label: '경계를 세우고 준비한다',
        desc: wolf
          ? '늑대가 당분간 숲을 어슬렁댑니다. 장비와 인원을 갖춘 뒤 다시 토벌할 수 있습니다.'
          : '호랑이가 숲에 자리를 잡습니다. 낮에는 숲, 밤에는 마을 전체가 위험하지만 나중에 토벌할 수 있습니다.',
      },
      ...(wolf ? [{
        id: 'bait',
        label: '고기를 내어 멀리 유인한다',
        desc: `고기 ${withJosa(CONFIG.specialEvents.wolfBaitMeat, '을/를')} 써서 늑대 떼를 마을에서 떼어 놓습니다.`,
        disabled: state.resources.meat < CONFIG.specialEvents.wolfBaitMeat,
        disabledReason: `고기 ${withJosa(CONFIG.specialEvents.wolfBaitMeat, '이/가')} 필요합니다`,
      }] : []),
    ],
    data: { eventId: kind, predator: kind },
  };
}

function openGinsengEvent(state: GameState): void {
  const currentWaiver = state.courtTribute && !state.courtTribute.resolved ? '올해' : '다음';
  state.pendingChoice = {
    kind: 'incident',
    title: '깊은 산의 산삼',
    body: `약초꾼이 오래 묵은 산삼 한 뿌리를 발견했습니다. 조정에 올리면 ${currentWaiver} 세공을 면제받을 수 있습니다.`,
    illustration: { src: '/assets/events/wild-ginseng-v1.png', alt: '북방 산림에서 오래 묵은 산삼을 발견한 개척지 약초꾼들' },
    options: [
      { id: 'present', label: '조정에 진상한다', desc: `${currentWaiver} 세공 면제권 1회와 구휼 물자를 받고 명성을 높입니다.` },
      { id: 'keep', label: '기물함에 보관한다', desc: '산삼 1뿌리를 보관합니다. 모든 세력과의 교역에서 고가 제시품으로 쓸 수 있습니다.' },
    ],
    data: { eventId: 'wildGinseng' },
  };
}

function openPlagueSuspicionEvent(state: GameState, rng: () => number): void {
  const residents = livingResidents(state);
  const suspect = residents[Math.floor(rng() * residents.length)];
  if (!suspect) return;
  suspect.sick = true;
  const localPhysician = hasActivePhysician(state);
  const isolationDays = Math.max(
    1,
    CONFIG.specialEvents.plagueIsolationDays - (localPhysician ? CONFIG.medicine.isolationDaysReduction : 0),
  );
  state.pendingChoice = {
    kind: 'incident',
    title: '역병 의심 증상',
    body: `${withJosa(suspect.name, '이/가')} 고열과 기침으로 쓰러졌습니다. 단순한 병치레일 수도 있지만 역병의 첫 증상일 수도 있습니다.`,
    illustration: { src: '/assets/events/plague-suspicion-v1.png', alt: '고열로 누운 주민을 살피며 격리를 고민하는 개척지 사람들' },
    options: [
      ...(localPhysician ? [{
        id: 'physician-diagnose',
        label: '의원에게 진맥을 맡긴다',
        desc: `${CONFIG.medicine.diagnosisDays}일 동안 안전하게 격리해 역병 여부를 빠르게 가립니다.`,
      }] : []),
      { id: 'isolate', label: '격리한다', desc: `${isolationDays}일 동안 일을 쉬게 합니다. 역병이라도 전염을 막을 수 있습니다.` },
      { id: 'observe', label: '그냥 둔다', desc: '단순한 병이면 혼자 낫지만 실제 역병이면 며칠 안에 마을로 번집니다.' },
    ],
    data: {
      eventId: 'plagueSuspicion',
      residentId: suspect.id,
      real: rng() < disasterChoiceChance(state, 'plagueSuspicion', 'real-case'),
    },
  };
}

function openEpidemicEvent(state: GameState): void {
  const epidemic = state.incidents.epidemic;
  if (!epidemic) return;
  const cost = CONFIG.specialEvents;
  const localPhysician = hasActivePhysician(state);
  state.pendingChoice = {
    kind: 'incident',
    title: '역병이 돌기 시작했다',
    body: `의심 환자와 접촉한 주민들까지 같은 증상을 보입니다. 현재 환자 ${epidemic.infectedIds.length}명. 더 퍼지기 전에 결단해야 합니다.`,
    illustration: { src: '/assets/events/plague-outbreak-v1.png', alt: '역병 환자를 격리하고 의원의 진료를 준비하는 북방 개척지' },
    options: [
      {
        id: 'isolate-all',
        label: '환자를 모두 격리한다',
        desc: localPhysician
          ? `의원이 방역과 치료를 맡아 격리 기간을 ${CONFIG.medicine.isolationDaysReduction}일 줄입니다.`
          : '환자들의 작업을 중단하고 전염을 막습니다. 회복까지 시간이 걸립니다.',
      },
      {
        id: 'request-physician',
        label: '의원 파견을 요청한다',
        desc: `명성 ${cost.physicianReputationCost}, 곡물 ${cost.physicianGrainCost}, 약초 ${withJosa(cost.physicianHerbCost, '을/를')} 들여 조정 의원과 수행 인력을 맞이합니다.`,
        disabled: state.resources.reputation < cost.physicianReputationCost ||
          state.resources.grain < cost.physicianGrainCost || state.resources.herbs < cost.physicianHerbCost,
        disabledReason: `명성 ${cost.physicianReputationCost}, 곡물 ${cost.physicianGrainCost}, 약초 ${withJosa(cost.physicianHerbCost, '이/가')} 필요합니다`,
      },
      { id: 'leave-epidemic', label: '그냥 둔다', desc: '생업은 유지하지만 환자가 늘고 중환자나 사망자가 생길 수 있습니다.' },
    ],
    data: { eventId: 'plagueOutbreak' },
  };
  // 발병 자체가 연대기감이다 — 대응 결과와 무관하게 여기서 1회 기록한다.
  recordAnnals(state, 'disaster', `역병이 돌기 시작했습니다. 환자 ${epidemic.infectedIds.length}명.`);
}

function openGrainRequisitionEvent(state: GameState): void {
  const amount = Math.max(20, Math.round(12 + livingResidents(state).length * 1.5));
  const half = Math.ceil(amount / 2);
  state.pendingChoice = {
    kind: 'incident',
    title: '긴급 군량 징발',
    body: `변방으로 향하는 관군이 군량으로 곡물 ${withJosa(amount, '을/를')} 요구합니다. 현재 곡물 ${Math.floor(state.resources.grain)}.`,
    illustration: { src: '/assets/events/grain-requisition-v1.png', alt: '북방 개척지에 도착해 군량을 요구하는 조선 관군 행렬' },
    options: [
      { id: 'give-full', label: '전량 제공한다', desc: `곡물 ${withJosa(amount, '을/를')} 제공합니다. 명성이 오르고 전역의 습격 위협이 크게 줄어듭니다.`, disabled: state.resources.grain < amount, disabledReason: `곡물 ${withJosa(amount, '이/가')} 필요합니다` },
      { id: 'give-half', label: '절반만 제공한다', desc: `곡물 ${withJosa(half, '을/를')} 제공합니다. 명성과 치안이 조금 나아집니다.`, disabled: state.resources.grain < half, disabledReason: `곡물 ${withJosa(half, '이/가')} 필요합니다` },
      { id: 'refuse', label: '거부한다', desc: '곡물은 지키지만 명성이 떨어지고 조정의 의심을 삽니다.' },
    ],
    data: { eventId: 'grainRequisition', amount },
  };
}

function openShipwreckEvent(state: GameState): void {
  state.pendingChoice = {
    kind: 'incident',
    title: '상선 좌초',
    body: '강물이 불며 상선 한 척이 여울에 걸려 기울었습니다. 선원들의 구조 요청과 떠내려가는 화물이 동시에 눈에 들어옵니다.',
    illustration: { src: '/assets/events/shipwreck-v1.png', alt: '거센 북방 강 여울에 좌초한 상선과 구조에 나선 개척지 주민들' },
    options: [
      { id: 'rescue-people', label: '사람부터 구조한다', desc: '선원들을 구하고 작은 사례와 명성을 얻습니다.' },
      { id: 'salvage-cargo', label: '화물부터 건진다', desc: '더 많은 물자를 얻지만 사람을 외면했다는 소문으로 명성이 떨어집니다.' },
    ],
    data: { eventId: 'shipwreck' },
  };
}

function openEarlyFrostEvent(state: GameState, rng: () => number): void {
  const farms = standingFarms(state);
  const target = farms[Math.floor(rng() * farms.length)];
  if (!target) return;
  const cropId = cropIdForBuilding(target);
  state.pendingChoice = {
    kind: 'incident',
    title: '이른 서리',
    body: `수확을 앞둔 ${cropId ? CROP_DEFS[cropId].name : '작물'} 위로 찬 기운이 내려앉았습니다. 지금 거두면 양은 적지만 확실하고, 기다리면 온전히 거두거나 큰 손실을 볼 수 있습니다.`,
    illustration: { src: '/assets/events/early-frost-v1.png', alt: '이른 서리가 내려 하얗게 얼어붙은 북방 개척지의 수확 전 논밭' },
    options: [
      { id: 'harvest-early', label: '조기 수확한다', desc: '현재 예상 소출의 약 절반을 즉시 확보합니다.' },
      {
        id: 'wait-harvest',
        label: '수확철을 기다린다',
        desc: disasterChoiceForecast(state, 'earlyFrost', 'wait-harvest') ??
          '서리가 걷히면 정상 수확하지만, 버티지 못하면 소출 대부분을 잃습니다.',
      },
    ],
    data: { eventId: 'earlyFrost', targetBuildingId: target.id },
  };
  recordAnnals(state, 'disaster', '수확을 앞둔 경작지에 이른 서리가 내렸습니다.');
}

function openGyrfalconEvent(state: GameState): void {
  const currentWaiver = state.courtTribute && !state.courtTribute.resolved ? '올해' : '다음';
  state.pendingChoice = {
    kind: 'incident',
    title: '해동청 둥지 발견',
    body: `절벽에서 북방의 귀한 매, 해동청의 둥지를 발견했습니다. 조정에 진상하거나 개척지에 길들여 둘 수 있습니다.`,
    illustration: { src: '/assets/events/gyrfalcon-nest-v1.png', alt: '북방 절벽 둥지에서 발견한 흰 해동청과 이를 바라보는 개척지 주민' },
    options: [
      { id: 'present', label: '조정에 진상한다', desc: `${currentWaiver} 세공 면제권과 물자를 받고 명성을 크게 높입니다.` },
      { id: 'keep', label: '보관하고 길들인다', desc: '해동청이 습격 무리의 접근을 조기에 발견할 확률을 높입니다.' },
    ],
    data: { eventId: 'gyrfalcon' },
  };
}

function horseCapacityAvailable(state: GameState): number {
  return state.buildings
    .filter(building => building.type === 'stable' && building.built)
    .reduce((total, stable) => {
      const livestock = ensureLivestockState(stable);
      if (livestock.species !== 'horse' && livestock.headcount > 0) return total;
      const occupied = livestock.species === 'horse' ? livestock.headcount : 0;
      return total + livestockCapacity('horse') - occupied;
    }, 0);
}

export function maybeOpenHorseDefectorEvent(state: GameState, rng: () => number): boolean {
  ensureIncidentState(state);
  if (state.pendingChoice || state.battle || state.gameOver) return false;
  if (state.unlockedLivestock.includes('horse')) return false;
  if ((state.incidents.cooldownUntil.horseDefectors ?? 0) > state.day) return false;
  if (horseCapacityAvailable(state) < CONFIG.defectors.horseCount) return false;
  if (rng() >= CONFIG.defectors.horseOfferChance) return false;
  state.incidents.cooldownUntil.horseDefectors = state.day + CONFIG.defectors.horseOfferCooldownDays;
  state.pendingChoice = {
    kind: 'incident',
    title: '말을 몰고 온 홀라온 귀순자',
    body:
      `홀라온 야인 ${CONFIG.defectors.horseGroupSize}명이 군마 ${CONFIG.defectors.horseCount}필을 몰고 성책 앞에 나타났습니다. ` +
      '옛 무리를 떠나 개척지의 주민이 되겠다고 합니다. 받아들이면 군마 사육이 열리지만 귀순 야인은 조정 감찰의 눈에 띕니다.',
    illustration: {
      src: '/assets/events/immigration-arrival-v2.png',
      alt: '군마를 몰고 성책 앞에서 귀순을 청하는 홀라온 사람들',
    },
    options: [
      {
        id: 'accept', label: '사람과 말을 받아들인다',
        desc: `홀라온 출신 주민 +${CONFIG.defectors.horseGroupSize}, 군마 +${CONFIG.defectors.horseCount}, 군마 사육 해금.`,
      },
      {
        id: 'reject', label: '돌려보낸다',
        desc: '관계와 의심은 변하지 않습니다. 군마 사육도 열리지 않습니다.',
      },
    ],
    data: { eventId: 'horseDefectors' },
  };
  return true;
}

export function maybeOpenSpecialEvent(state: GameState, rng: () => number): boolean {
  ensureIncidentState(state);
  if (state.pendingChoice || state.battle) return false;
  const scheduled = state.incidents.scheduledDays[0];
  if (scheduled == null || scheduled > state.day) return false;

  const forestExists = state.map.some(row => row.some(tile => tile.terrain === 'forest'));
  const riverExists = state.map.some(row => row.some(tile => tile.terrain === 'river'));
  const farms = standingFarms(state);
  const season = getSeason(state.day);
  const candidates: Array<{ value: Exclude<SpecialEventId, 'horseDefectors'>; weight: number }> = [];
  const ready = (event: SpecialEventId) => (state.incidents.cooldownUntil[event] ?? 0) <= state.day;
  if (forestExists && !state.incidents.predatorThreats.wolf && ready('wolf')) candidates.push({ value: 'wolf', weight: CONFIG.specialEvents.wolfWeight });
  if (forestExists && !state.incidents.predatorThreats.tiger && ready('tiger')) candidates.push({ value: 'tiger', weight: CONFIG.specialEvents.tigerWeight });
  if (farms.length > 0 && !state.incidents.predatorThreats.boar && ready('boar')) candidates.push({ value: 'boar', weight: CONFIG.specialEvents.boarWeight });
  if (forestExists && ready('wildGinseng')) candidates.push({ value: 'wildGinseng', weight: CONFIG.specialEvents.ginsengWeight });
  if (!state.incidents.plagueCase && !state.incidents.epidemic && livingResidents(state).length > 2 && ready('plagueSuspicion')) {
    candidates.push({ value: 'plagueSuspicion', weight: disasterOccurrenceWeight(state, 'plagueSuspicion') });
  }
  if (ready('grainRequisition')) candidates.push({ value: 'grainRequisition', weight: CONFIG.specialEvents.grainRequisitionWeight });
  if (riverExists && ready('shipwreck')) candidates.push({ value: 'shipwreck', weight: CONFIG.specialEvents.shipwreckWeight });
  if (farms.length > 0 && (season === 'summer' || season === 'autumn') && ready('earlyFrost')) {
    candidates.push({ value: 'earlyFrost', weight: disasterOccurrenceWeight(state, 'earlyFrost') });
  }
  if (forestExists && ready('gyrfalcon')) candidates.push({ value: 'gyrfalcon', weight: CONFIG.specialEvents.gyrfalconWeight });
  if (candidates.length === 0) return false;

  state.incidents.scheduledDays.shift();
  const eventId = weightedPick(rng, candidates);
  state.incidents.cooldownUntil[eventId] = state.day + EVENT_COOLDOWNS[eventId];
  if (eventId === 'wildGinseng') openGinsengEvent(state);
  else if (eventId === 'plagueSuspicion') openPlagueSuspicionEvent(state, rng);
  else if (eventId === 'grainRequisition') openGrainRequisitionEvent(state);
  else if (eventId === 'shipwreck') openShipwreckEvent(state);
  else if (eventId === 'earlyFrost') openEarlyFrostEvent(state, rng);
  else if (eventId === 'gyrfalcon') openGyrfalconEvent(state);
  else openWildlifeEvent(state, eventId, rng);
  return state.pendingChoice != null;
}

function discoverItem(state: GameState, item: SpecialItemId): void {
  state.specialItems[item] += 1;
  if (!state.discoveredSpecialItems.includes(item)) state.discoveredSpecialItems.push(item);
}

function threatDuration(kind: WildlifeKind, rng: () => number): number {
  const range = kind === 'wolf'
    ? CONFIG.specialEvents.wolfThreatDays
    : kind === 'tiger'
      ? CONFIG.specialEvents.tigerThreatDays
      : CONFIG.specialEvents.boarThreatDays;
  return range[0] + Math.floor(rng() * (range[1] - range[0] + 1));
}

function activateWildlifeThreat(state: GameState, kind: WildlifeKind, rng: () => number): void {
  const untilDay = state.day + threatDuration(kind, rng);
  const existing = state.incidents.predatorThreats[kind];
  const finalUntilDay = Math.max(existing?.untilDay ?? 0, untilDay);
  state.incidents.predatorThreats[kind] = materializePredatorThreat(state, kind, finalUntilDay, existing);
  const threatName = wildlifeName(kind, state);
  const message = kind === 'wolf'
    ? `늑대 떼가 숲에 자리를 잡았습니다. ${untilDay - state.day}일 동안 숲에 드나드는 주민이 위험합니다.`
    : kind === 'tiger'
      ? `${withJosa(threatName, '이/가')} 개척지 주변에 자리를 잡았습니다. ${untilDay - state.day}일 동안 낮의 숲과 밤의 마을이 위험합니다.`
      : `멧돼지 떼가 개척지 주변에 눌러앉았습니다. ${untilDay - state.day}일 동안 밤마다 농작물과 저장 식량이 위험합니다.`;
  addLog(state, message, 'bad', true);
}

function huntCandidates(state: GameState, memberIds?: Iterable<number>): Resident[] {
  const selected = memberIds ? new Set(memberIds) : null;
  const away = new Set([...(state.expedition?.memberIds ?? []), ...activePredatorScoutIds(state)]);
  const available = livingResidents(state).filter(resident =>
    (selected ? selected.has(resident.id) : !away.has(resident.id)) &&
    state.day >= (resident.quarantinedUntil ?? 0));
  const trained = available.filter(resident => resident.job === 'hunter' || resident.job === 'militia' || resident.job === 'watchman');
  return trained.length > 0 ? trained : available;
}

interface HuntCasualty {
  residentId: number;
  killed: boolean;
  damage?: number;
}

function huntFailure(
  state: GameState,
  kind: WildlifeKind,
  memberIds: Iterable<number>,
  rng: () => number,
): HuntCasualty | null {
  const candidates = huntCandidates(state, memberIds);
  const victim = candidates[Math.floor(rng() * candidates.length)];
  if (!victim) return null;
  const tigerDanger = kind === 'tiger'
    ? tigerTierDangerMultiplier(predatorThreatProfile(state, kind).tigerTier)
    : 1;
  const deathChance = (kind === 'wolf'
    ? CONFIG.specialEvents.wolfHuntDeathChance
    : kind === 'tiger'
      ? CONFIG.specialEvents.tigerHuntDeathChance
      : 0) * tigerDanger;
  if (rng() < deathChance) {
    killResident(state, victim, kind === 'tiger' ? '호환' : '늑대 습격');
    return { residentId: victim.id, killed: true };
  }
  const damage = kind === 'wolf'
    ? 24 + Math.floor(rng() * 13)
    : kind === 'tiger'
      ? Math.round((38 + Math.floor(rng() * 23)) * tigerDanger)
      : 18 + Math.floor(rng() * 13);
  victim.health = Math.max(1, victim.health - damage);
  addLog(state, `${withJosa(victim.name, '이/가')} ${wildlifeName(kind, state)} 토벌 중 부상을 입었습니다. (건강 -${damage})`, 'bad', true);
  return { residentId: victim.id, killed: false, damage };
}

export type WildlifeHuntOutcome = 'victory' | 'repelled' | 'escaped' | 'defeat';

export interface WildlifeStrategicResult {
  loot: Partial<Record<ResourceId, number>>;
  specialItem?: SpecialItemId;
}

export interface WildlifeHuntResult extends WildlifeStrategicResult {
  outcome: WildlifeHuntOutcome;
  chance: number;
  powderUsed: number;
  injuredResidentId?: number;
  injuryDamage?: number;
  killedResidentId?: number;
}

export function applyWildlifeHuntOutcome(
  state: GameState,
  kind: WildlifeKind,
  outcome: WildlifeHuntOutcome,
  rng: () => number,
): WildlifeStrategicResult {
  ensureIncidentState(state);
  const threatProfile = predatorThreatProfile(state, kind);
  const knownThreatName = wildlifeName(kind, state);
  const defeatedThreatName = kind === 'tiger'
    ? tigerTierLabel(threatProfile.tigerTier)
    : knownThreatName;
  const tigerTier = kind === 'tiger' ? threatProfile.tigerTier ?? 'tiger' : undefined;
  if (outcome === 'victory') {
    delete state.incidents.predatorThreats[kind];
    if (kind === 'wolf') {
      const meat = 4 + threatProfile.size + Math.floor(rng() * (3 + Math.ceil(threatProfile.size / 2)));
      const hide = Math.max(2, Math.floor(threatProfile.size * 0.6) + Math.floor(rng() * 3));
      const reputation = 1 + Math.floor(threatProfile.size / 5);
      state.resources.meat += meat;
      state.resources.hide += hide;
      state.resources.reputation = Math.min(100, state.resources.reputation + reputation);
      addLog(state, `늑대 ${threatProfile.size}마리 무리를 토벌했습니다. 고기 ${meat}, 가죽 ${hide}, 명성 +${reputation}.`, 'good', true);
      return { loot: { meat, hide } };
    } else if (kind === 'tiger') {
      const meatBase = tigerTier === 'mountainLord' ? 28 : tigerTier === 'greatTiger' ? 18 : 12;
      const meatRange = tigerTier === 'mountainLord' ? 13 : tigerTier === 'greatTiger' ? 9 : 7;
      const hide = tigerTier === 'mountainLord' ? 9 : tigerTier === 'greatTiger' ? 6 : 4;
      const reputation = tigerTier === 'mountainLord' ? 15 : tigerTier === 'greatTiger' ? 10 : 7;
      const meat = meatBase + Math.floor(rng() * meatRange);
      state.resources.meat += meat;
      state.resources.hide += hide;
      state.resources.reputation = Math.min(100, state.resources.reputation + reputation);
      discoverItem(state, 'tigerPelt');
      addLog(state, `${withJosa(defeatedThreatName, '을/를')} 토벌했습니다. 고기 ${meat}, 가죽 ${hide}, 호피 1, 명성 +${reputation}.`, 'good', true);
      return { loot: { meat, hide }, specialItem: 'tigerPelt' };
    } else {
      const meat = 13 + Math.floor(rng() * 8);
      const hide = 5 + Math.floor(rng() * 4);
      state.resources.meat += meat;
      state.resources.hide += hide;
      addLog(state, `멧돼지 떼를 토벌했습니다. 고기 ${meat}, 가죽 ${hide}.`, 'good', true);
      return { loot: { meat, hide } };
    }
  }
  if (outcome === 'repelled' && kind === 'wolf') {
    delete state.incidents.predatorThreats.wolf;
    const meat = 3 + Math.ceil(threatProfile.size * 0.45) + Math.floor(rng() * 3);
    const hide = 1 + Math.floor(threatProfile.size * 0.25) + Math.floor(rng() * 2);
    const reputation = threatProfile.size >= 10 ? 2 : 1;
    state.resources.meat += meat;
    state.resources.hide += hide;
    state.resources.reputation = Math.min(100, state.resources.reputation + reputation);
    addLog(state, `우두머리를 잃은 늑대 ${threatProfile.size}마리 무리를 쫓아냈습니다. 고기 ${meat}, 가죽 ${hide}, 명성 +${reputation}.`, 'good', true);
    return { loot: { meat, hide } };
  }
  if (outcome === 'escaped') {
    addLog(state, `${withJosa(knownThreatName, '이/가')} 포위망을 빠져나갔습니다. 위협은 그대로 남습니다.`, 'info', true);
    return { loot: {} };
  }
  activateWildlifeThreat(state, kind, rng);
  return { loot: {} };
}

export function resolveWildlifeHunt(
  state: GameState,
  kind: WildlifeKind,
  memberIds: Iterable<number>,
  rng: () => number,
): WildlifeHuntResult | string {
  ensureIncidentState(state);
  const readyIds = new Set(createCombatRoster(state, { context: 'expedition', memberIds }).combatants
    .map(member => member.residentId));
  const members = expeditionResidentsForIds(state, readyIds);
  if (members.length === 0) return '토벌에 나설 주민이 없습니다.';
  const ids = members.map(resident => resident.id);
  const chance = predatorHuntChance(state, kind, ids);
  const powderUsed = consumeExpeditionPowder(state, ids);
  const outcome = rng() < chance ? 'victory' : 'defeat';
  const casualty = outcome === 'defeat' ? huntFailure(state, kind, ids, rng) : null;
  const strategic = applyWildlifeHuntOutcome(state, kind, outcome, rng);
  return {
    ...strategic,
    outcome,
    chance,
    powderUsed,
    injuredResidentId: casualty && !casualty.killed ? casualty.residentId : undefined,
    injuryDamage: casualty && !casualty.killed ? casualty.damage : undefined,
    killedResidentId: casualty?.killed ? casualty.residentId : undefined,
  };
}

export function openPredatorHunt(state: GameState, kind: WildlifeKind): string | null {
  ensureIncidentState(state);
  if (!state.incidents.predatorThreats[kind]) return '현재 추적 중인 짐승이 없습니다.';
  if (state.pendingChoice || state.battle) return '지금은 토벌대를 조직할 수 없습니다.';
  state.pendingChoice = {
    kind: 'incident',
    title: `${wildlifeName(kind, state)} 토벌대 조직`,
    body: `현재 인원과 무장을 점검했습니다.\n${predatorReadinessLabel(state, kind)}`,
    illustration: wildlifeIllustration(kind),
    options: [
      { id: 'hunt', label: '토벌을 시작한다', desc: '현재 인원과 무장으로 토벌에 나섭니다.' },
      { id: 'cancel', label: '조금 더 준비한다', desc: '위험 상태는 계속되지만 토벌은 미룹니다.' },
    ],
    data: { eventId: 'predator-hunt', predator: kind },
  };
  return null;
}

export function startPredatorScout(state: GameState, kind: PredatorKind, residentId: number): string | null {
  ensureIncidentState(state);
  const threat = state.incidents.predatorThreats[kind];
  if (!threat) return '현재 추적 중인 맹수가 없습니다.';
  if (threat.scouting) return '이미 사냥꾼 한 명이 흔적을 쫓고 있습니다.';
  if (threat.intel?.precision === 'exact') return '이미 맹수 규모를 정확히 파악했습니다.';
  if (state.battle || state.raiders || state.raidHold) return '습격 대응 중에는 사냥꾼을 추적에 보낼 수 없습니다.';
  const hunter = availablePredatorScouts(state).find(resident => resident.id === residentId);
  if (!hunter) return '지금 흔적 추적에 보낼 수 있는 사냥꾼이 아닙니다.';

  const hunterSkill = hunter.skills.hunter ?? 0;
  const usedGyrfalcon = (state.specialItems?.gyrfalcon ?? 0) > 0;
  const expertTracker = state.residents.some(resident => resident.alive && resident.special === 'tigerHunter');
  const duration = predatorScoutDuration(hunterSkill, usedGyrfalcon, expertTracker);
  const completesOnDay = state.day + duration;
  if (completesOnDay > threat.untilDay) return '흔적이 사라지기 전에 정찰을 마칠 시간이 부족합니다.';

  threat.scouting = {
    residentId: hunter.id,
    startedDay: state.day,
    completesOnDay,
    hunterSkill,
    usedGyrfalcon,
  };
  hunter.path = [];
  hunter.manualOrder = null;
  hunter.task = `${kind === 'wolf' ? '늑대' : '호랑이'} 흔적 추적 출발`;
  addLog(
    state,
    `${withJosa(hunter.name, '이/가')} ${kind === 'wolf' ? '늑대 떼' : '호랑이'}의 흔적을 쫓으러 떠났습니다. ${duration}일 뒤 규모를 보고합니다.` +
      (usedGyrfalcon ? ' 해동청도 함께 띄웠습니다.' : ''),
    'info',
    true,
  );
  return null;
}

function openPredatorScoutSelection(state: GameState, kind: PredatorKind): void {
  const usedGyrfalcon = (state.specialItems?.gyrfalcon ?? 0) > 0;
  const expertTracker = state.residents.some(resident => resident.alive && resident.special === 'tigerHunter');
  const scouts = availablePredatorScouts(state);
  state.pendingChoice = {
    kind: 'incident',
    title: `${kind === 'wolf' ? '늑대 떼' : '호랑이'} 흔적 추적`,
    body: '흔적을 쫓을 사냥꾼을 고르십시오. 숙련된 사냥꾼은 더 빨리 돌아오며, 해동청이 있으면 추적 기간과 정보 정확도가 좋아집니다.',
    illustration: wildlifeIllustration(kind),
    options: [
      ...scouts.map(scout => {
        const skill = scout.skills.hunter ?? 0;
        const duration = predatorScoutDuration(skill, usedGyrfalcon, expertTracker);
        return {
          id: `scout:${scout.id}`,
          label: `${withJosa(scout.name, '을/를')} 보낸다`,
          desc: `사냥 숙련 ${Math.round(skill * 100)}% · ${duration}일 소요${usedGyrfalcon ? ' · 해동청 동행' : ''}`,
        };
      }),
      { id: 'cancel-scout', label: '나중에 정한다', desc: '맹수 위협은 유지되며 사건 탭에서 다시 추적을 지시할 수 있습니다.' },
    ],
    data: { eventId: 'predator-scout-select', predator: kind },
  };
}

function resolveGinseng(state: GameState, optionId: string): void {
  if (optionId === 'present') {
    state.tributeWaivers += 1;
    state.resources.tools += 4;
    state.resources.cottonClothes += 4;
    state.resources.grain += 12;
    state.resources.reputation = Math.min(100, state.resources.reputation + 5);
    const timing = state.courtTribute?.resolved && state.courtTribute.year === getYear(state.day)
      ? ' 올해 세공은 이미 처리되어, 면제권은 내년 세공에 쓰입니다.'
      : '';
    addLog(state, `산삼을 조정에 진상했습니다. 세공 면제권 1회와 곡물 12, 도구 4, 무명옷 4를 하사받았습니다.${timing}`, 'good', true);
  } else if (optionId === 'keep') {
    discoverItem(state, 'wildGinseng');
    addLog(state, '산삼 한 뿌리를 기물함에 보관했습니다. 교역에서 고가 제시품으로 쓸 수 있습니다.', 'good', true);
  }
}

function resolvePlagueSuspicion(state: GameState, optionId: string, data: Record<string, unknown>): void {
  const residentId = data.residentId as number;
  const resident = state.residents.find(candidate => candidate.id === residentId && candidate.alive);
  if (!resident) return;
  const physicianDiagnosis = optionId === 'physician-diagnose' && hasActivePhysician(state);
  const isolated = optionId === 'isolate' || physicianDiagnosis;
  const isolationDays = Math.max(
    1,
    CONFIG.specialEvents.plagueIsolationDays - (hasActivePhysician(state) ? CONFIG.medicine.isolationDaysReduction : 0),
  );
  const duration = physicianDiagnosis
    ? CONFIG.medicine.diagnosisDays
    : isolated ? isolationDays : CONFIG.specialEvents.plagueObservationDays;
  if (isolated) {
    resident.quarantinedUntil = state.day + duration;
    resident.task = '격리 중';
    addLog(state, physicianDiagnosis
      ? `의원이 ${withJosa(resident.name, '을/를')} 진맥합니다. ${duration}일 동안 격리해 역병 여부를 가립니다.`
      : `${withJosa(resident.name, '을/를')} ${duration}일 동안 격리했습니다. 배정은 유지되지만 일을 쉬게 됩니다.`, 'info', true);
  } else {
    addLog(state, `${withJosa(resident.name, '을/를')} 격리하지 않고 경과를 지켜봅니다.`, 'bad', true);
  }
  state.incidents.plagueCase = {
    residentId,
    resolvesOnDay: state.day + duration,
    real: data.real === true,
    isolated,
  };
}

function resolveEpidemic(state: GameState, optionId: string): void {
  const epidemic = state.incidents.epidemic;
  if (!epidemic) return;
  if (optionId === 'request-physician') {
    const cost = CONFIG.specialEvents;
    if (state.resources.reputation < cost.physicianReputationCost || state.resources.grain < cost.physicianGrainCost || state.resources.herbs < cost.physicianHerbCost) return;
    state.resources.reputation -= cost.physicianReputationCost;
    state.resources.grain -= cost.physicianGrainCost;
    state.resources.herbs -= cost.physicianHerbCost;
    for (const id of epidemic.infectedIds) {
      const resident = state.residents.find(candidate => candidate.id === id);
      if (resident?.alive) {
        resident.sick = false;
        resident.quarantinedUntil = 0;
      }
    }
    state.incidents.epidemic = null;
    addLog(state, '조정에서 파견된 의원이 환자를 돌보고 방역을 마쳤습니다. 역병이 잦아들었습니다.', 'good', true);
    return;
  }
  const range = CONFIG.specialEvents.epidemicDays;
  epidemic.untilDay = state.day + range[0];
  if (optionId === 'isolate-all') {
    if (hasActivePhysician(state)) {
      epidemic.untilDay = state.day + Math.max(1, range[0] - CONFIG.medicine.isolationDaysReduction);
    }
    epidemic.mode = 'isolated';
    for (const id of epidemic.infectedIds) {
      const resident = state.residents.find(candidate => candidate.id === id && candidate.alive);
      if (resident) resident.quarantinedUntil = epidemic.untilDay;
    }
    addLog(state, `환자 ${epidemic.infectedIds.length}명을 모두 격리했습니다. 생업은 줄지만 전염을 막습니다.`, 'info', true);
  } else if (optionId === 'leave-epidemic') {
    epidemic.mode = 'uncontained';
    epidemic.untilDay = state.day + range[1];
    addLog(state, '환자들을 따로 격리하지 않았습니다. 역병이 마을 안에서 번지기 시작합니다.', 'bad', true);
  }
}

function resolveGrainRequisition(state: GameState, optionId: string, amount: number): void {
  const half = Math.ceil(amount / 2);
  if (optionId === 'give-full' && state.resources.grain >= amount) {
    state.resources.grain -= amount;
    state.resources.reputation = Math.min(100, state.resources.reputation + 5);
    state.threat = Math.max(0, state.threat - 28);
    addLog(state, `관군에 군량 ${withJosa(amount, '을/를')} 모두 내주었습니다. 명성 +5, 습격 위협 -28.`, 'good', true);
  } else if (optionId === 'give-half' && state.resources.grain >= half) {
    state.resources.grain -= half;
    state.resources.reputation = Math.min(100, state.resources.reputation + 2);
    state.threat = Math.max(0, state.threat - 10);
    addLog(state, `관군에 군량 ${withJosa(half, '을/를')} 내주었습니다. 명성 +2, 습격 위협 -10.`, 'good', true);
  } else if (optionId === 'refuse') {
    state.resources.reputation = Math.max(0, state.resources.reputation - 4);
    state.suspicion = Math.min(100, state.suspicion + 8);
    addLog(state, '군량 징발을 거부했습니다. 명성 -4, 모반 의심 +8.', 'bad', true);
  }
}

function resolveShipwreck(state: GameState, optionId: string): void {
  if (optionId === 'rescue-people') {
    state.resources.wood += 5;
    state.resources.tools += 2;
    state.resources.reputation = Math.min(100, state.resources.reputation + 4);
    addLog(state, '선원들을 먼저 구조했습니다. 사례로 목재 5와 도구 2를 받고 명성 +4.', 'good', true);
  } else if (optionId === 'salvage-cargo') {
    state.resources.wood += 12;
    state.resources.iron += 4;
    state.resources.tools += 3;
    state.resources.cotton += 6;
    state.resources.reputation = Math.max(0, state.resources.reputation - 4);
    addLog(state, '떠내려가는 화물을 먼저 건졌습니다. 목재 12, 철 4, 도구 3, 목화 6을 얻었지만 명성 -4.', 'bad', true);
  }
}

function resolveEarlyFrost(state: GameState, optionId: string, buildingId: number, rng: () => number): void {
  const farm = state.buildings.find(building => building.id === buildingId);
  const cropId = farm ? cropIdForBuilding(farm) : null;
  if (!farm || !cropId || farm.fieldGrowth <= 0) return;
  const crop = CROP_DEFS[cropId];
  if (optionId === 'harvest-early') {
    const footprint = footprintTilesOf(state, farm) ?? [];
    const fertileFraction = footprint.length > 0
      ? footprint.filter(tile => tile.terrain === 'fertile').length / footprint.length
      : 0;
    const fertile = farm.type === 'field' ? 1 + fertileFraction * (CONFIG.production.fertileBonus - 1) : 1;
    const sown = Math.max(1, sownAreaOf(farm));
    const amount = (farm.fieldGrowth / 100) * crop.yield * sown * fertile * 0.55;
    farm.inventory ??= {};
    farm.inventory[crop.output] = (farm.inventory[crop.output] ?? 0) + amount;
    farm.fieldGrowth = 0;
    farm.sownArea = 0;
    addLog(state, `${withJosa(crop.name, '을/를')} 서둘러 거두어 ${withJosa(amount.toFixed(1), '을/를')} 확보했습니다.`, 'good', true);
  } else if (optionId === 'wait-harvest') {
    if (rng() < disasterChoiceChance(state, 'earlyFrost', 'wait-harvest')) {
      addLog(state, '이른 서리가 곧 걷혔습니다. 작물이 버텨 정상 수확을 기대할 수 있습니다.', 'good', true);
    } else {
      const before = farm.fieldGrowth;
      farm.fieldGrowth *= 0.25;
      addLog(state, `${withJosa(crop.name, '이/가')} 서리를 견디지 못해 예상 소출의 ${Math.round(before - farm.fieldGrowth)}%를 잃었습니다.`, 'bad', true);
    }
  }
}

function resolveGyrfalcon(state: GameState, optionId: string): void {
  if (optionId === 'present') {
    state.tributeWaivers += 1;
    state.resources.grain += 15;
    state.resources.tools += 4;
    state.resources.cottonClothes += 3;
    state.resources.reputation = Math.min(100, state.resources.reputation + 7);
    const timing = state.courtTribute?.resolved && state.courtTribute.year === getYear(state.day)
      ? ' 올해 세공은 이미 처리되어, 면제권은 내년 세공에 쓰입니다.'
      : '';
    addLog(state, `해동청을 조정에 진상했습니다. 세공 면제권 1회와 곡물 15, 도구 4, 무명옷 3을 하사받고 명성 +7.${timing}`, 'good', true);
  } else if (optionId === 'keep') {
    discoverItem(state, 'gyrfalcon');
    addLog(state, '해동청을 길들여 기물함에 두었습니다. 습격 무리를 조기에 발견할 확률이 높아집니다.', 'good', true);
  }
}

function resolveHorseDefectors(state: GameState, optionId: string, rng: () => number): void {
  if (optionId !== 'accept') {
    addLog(state, '홀라온 귀순자들을 돌려보냈습니다. 서로 칼을 뽑지 않고 각자의 길로 물러났습니다.', 'info', true);
    return;
  }
  const error = acquireLivestock(state, 'horse', CONFIG.defectors.horseCount);
  if (error) {
    addLog(state, `군마를 들일 수 없었습니다. ${error}`, 'bad', true);
    return;
  }
  for (let index = 0; index < CONFIG.defectors.horseGroupSize; index++) {
    state.residents.push(createResident(state, rng, 'idle', RESIDENT_ORIGINS.holaon));
  }
  reconcileResidentHomes(state, rng);
  addLog(
    state,
    `홀라온 귀순자 ${CONFIG.defectors.horseGroupSize}명과 군마 ${CONFIG.defectors.horseCount}필을 받아들였습니다. 군마 사육이 열렸습니다.`,
    'good', true,
  );
}

export function resolveSpecialEvent(state: GameState, optionId: string, rng: () => number): void {
  const choice = state.pendingChoice;
  if (!choice || choice.kind !== 'incident') return;
  const eventId = choice.data.eventId as string;
  const wildlife = choice.data.predator as WildlifeKind | undefined;
  state.pendingChoice = null;

  if (eventId === 'wildGinseng') return resolveGinseng(state, optionId);
  if (eventId === 'plagueSuspicion') return resolvePlagueSuspicion(state, optionId, choice.data);
  if (eventId === 'plagueOutbreak') return resolveEpidemic(state, optionId);
  if (eventId === 'grainRequisition') return resolveGrainRequisition(state, optionId, choice.data.amount as number);
  if (eventId === 'shipwreck') return resolveShipwreck(state, optionId);
  if (eventId === 'earlyFrost') return resolveEarlyFrost(state, optionId, choice.data.targetBuildingId as number, rng);
  if (eventId === 'gyrfalcon') return resolveGyrfalcon(state, optionId);
  if (eventId === 'horseDefectors') return resolveHorseDefectors(state, optionId, rng);
  if (!wildlife) return;
  if (eventId === 'predator-scout-select') {
    if ((wildlife === 'wolf' || wildlife === 'tiger') && optionId.startsWith('scout:')) {
      const error = startPredatorScout(state, wildlife, Number(optionId.slice('scout:'.length)));
      if (error) addLog(state, error, 'info', true);
    }
    return;
  }
  if (eventId === 'predator-hunt') {
    if (optionId === 'hunt') {
      const memberIds = huntCandidates(state).map(resident => resident.id);
      resolveWildlifeHunt(state, wildlife, memberIds, rng);
    }
    return;
  }
  if (optionId === 'hunt-now') {
    if (wildlife === 'boar') {
      const memberIds = huntCandidates(state).map(resident => resident.id);
      resolveWildlifeHunt(state, wildlife, memberIds, rng);
    } else {
      activateWildlifeThreat(state, wildlife, rng);
      addLog(state, `${wildlifeName(wildlife, state)} 토벌대를 소집합니다. 출정 인원과 무장을 정해야 합니다.`, 'info', true);
    }
  } else if (optionId === 'track-first' && (wildlife === 'wolf' || wildlife === 'tiger')) {
    activateWildlifeThreat(state, wildlife, rng);
    openPredatorScoutSelection(state, wildlife);
  } else if (optionId === 'prepare' || optionId === 'leave') {
    activateWildlifeThreat(state, wildlife, rng);
  } else if (wildlife === 'wolf' && optionId === 'bait' && state.resources.meat >= CONFIG.specialEvents.wolfBaitMeat) {
    state.resources.meat -= CONFIG.specialEvents.wolfBaitMeat;
    addLog(state, '고기를 미끼로 늑대 떼를 개척지에서 멀리 유인했습니다.', 'info', true);
  } else if (wildlife === 'boar' && optionId === 'trap' &&
    state.resources.wood >= CONFIG.specialEvents.boarTrapWood && state.resources.tools >= CONFIG.specialEvents.boarTrapTools) {
    state.resources.wood -= CONFIG.specialEvents.boarTrapWood;
    state.resources.tools -= CONFIG.specialEvents.boarTrapTools;
    if (rng() < CONFIG.specialEvents.boarTrapSuccessChance) {
      state.resources.meat += 7;
      state.resources.hide += 3;
      addLog(state, '멧돼지 길목에 놓은 덫이 성공했습니다. 고기 7, 가죽 3을 얻었습니다.', 'good', true);
    } else {
      addLog(state, '멧돼지 떼가 덫을 피해 달아났다가 개척지 주변에 눌러앉았습니다.', 'bad', true);
      activateWildlifeThreat(state, 'boar', rng);
    }
  }
}

function forestResidents(state: GameState): Resident[] {
  const scouts = activePredatorScoutIds(state);
  return livingResidents(state).filter(resident =>
    !scouts.has(resident.id) && state.map[resident.y]?.[resident.x]?.terrain === 'forest');
}

function predatorEncounter(state: GameState, kind: 'wolf' | 'tiger', candidates: Resident[], rng: () => number): void {
  const victim = candidates[Math.floor(rng() * candidates.length)];
  if (!victim) return;
  const tigerDanger = kind === 'tiger'
    ? tigerTierDangerMultiplier(predatorThreatProfile(state, kind).tigerTier)
    : 1;
  const deathChance = (kind === 'wolf'
    ? CONFIG.specialEvents.wolfEncounterDeathChance
    : CONFIG.specialEvents.tigerEncounterDeathChance) * tigerDanger;
  if (rng() < deathChance) {
    killResident(state, victim, kind === 'tiger' ? '호환' : '늑대 습격');
    return;
  }
  const damage = kind === 'wolf'
    ? 16 + Math.floor(rng() * 13)
    : Math.round((28 + Math.floor(rng() * 19)) * tigerDanger);
  victim.health = Math.max(1, victim.health - damage);
  addLog(state, `${withJosa(victim.name, '이/가')} ${kind === 'wolf' ? '숲에서 늑대에게 물려' : `${wildlifeName(kind, state)}의 습격을 받아`} 부상을 입었습니다. (건강 -${damage})`, 'bad', true);
}

function damageBoarTargets(state: GameState, rng: () => number): void {
  const farms = standingFarms(state);
  if (farms.length > 0 && rng() < CONFIG.specialEvents.boarCropDamageChance) {
    const farm = farms[Math.floor(rng() * farms.length)];
    const before = farm.fieldGrowth;
    farm.fieldGrowth *= 1 - (0.08 + rng() * 0.08);
    addLog(state, `밤사이 멧돼지가 ${withJosa(farm.type === 'paddy' ? '논' : '밭', '을/를')} 헤쳐 예상 소출 ${Math.max(1, Math.round(before - farm.fieldGrowth))}%를 잃었습니다.`, 'bad', true);
  }
  if (rng() < CONFIG.specialEvents.boarStoredFoodDamageChance) {
    const available = FOOD_RESOURCES.filter(resource => state.resources[resource] >= 1);
    const resource = available[Math.floor(rng() * available.length)];
    if (resource) {
      const lost = Math.min(state.resources[resource], 2 + Math.floor(rng() * 5));
      state.resources[resource] -= lost;
      addLog(state, `멧돼지가 저장고를 헤쳐 식량 ${withJosa(lost.toFixed(0), '을/를')} 망쳤습니다.`, 'bad', true);
    }
  }
}

function startEpidemic(state: GameState, patient: Resident, rng: () => number): void {
  const contacts = livingResidents(state).filter(resident => resident.id !== patient.id);
  const infectedIds = [patient.id];
  const firstContact = contacts[Math.floor(rng() * contacts.length)];
  if (firstContact) infectedIds.push(firstContact.id);
  for (const id of infectedIds) {
    const resident = state.residents.find(candidate => candidate.id === id);
    if (resident) resident.sick = true;
  }
  state.incidents.epidemic = { infectedIds, untilDay: state.day, mode: 'pending' };
  openEpidemicEvent(state);
}

function updatePlagueCase(state: GameState, rng: () => number): void {
  const plagueCase = state.incidents.plagueCase;
  if (!plagueCase || state.day < plagueCase.resolvesOnDay) return;
  const resident = state.residents.find(candidate => candidate.id === plagueCase.residentId);
  if (!resident?.alive) {
    state.incidents.plagueCase = null;
    return;
  }
  if (plagueCase.isolated || !plagueCase.real) {
    resident.sick = false;
    resident.quarantinedUntil = 0;
    addLog(state, plagueCase.real
      ? `${withJosa(resident.name, '이/가')} 격리 중 회복했습니다. 실제 역병이었지만 마을 안 전염은 막았습니다.`
      : `${resident.name}의 증상은 역병이 아니었습니다. 며칠 앓은 뒤 회복했습니다.`, 'good', true);
    state.incidents.plagueCase = null;
    return;
  }
  if (state.pendingChoice || state.battle) return;
  state.incidents.plagueCase = null;
  startEpidemic(state, resident, rng);
}

function finishEpidemic(state: GameState, epidemic: EpidemicState): void {
  for (const id of epidemic.infectedIds) {
    const resident = state.residents.find(candidate => candidate.id === id);
    if (resident?.alive) {
      resident.sick = false;
      resident.quarantinedUntil = 0;
    }
  }
  state.incidents.epidemic = null;
  addLog(state, '긴 역병이 마침내 잦아들었습니다. 살아남은 환자들이 일터로 돌아옵니다.', 'good', true);
  recordAnnals(state, 'disaster', '긴 역병이 마침내 잦아들었습니다.');
}

function updateEpidemic(state: GameState, rng: () => number): void {
  const epidemic = state.incidents.epidemic;
  if (!epidemic || epidemic.mode === 'pending') return;
  if (state.day > epidemic.untilDay) {
    finishEpidemic(state, epidemic);
    return;
  }
  const physicianActive = hasActivePhysician(state);
  // 의녀 단심 '방역' — 역병이 번질 확률 자체를 줄인다
  const uinyeoActive = state.residents.some(resident => resident.alive && resident.special === 'uinyeo');
  const spreadChance = CONFIG.specialEvents.epidemicSpreadChance *
    (physicianActive ? CONFIG.medicine.epidemicSpreadMult : 1) *
    (uinyeoActive ? CONFIG.specialResidents.uinyeoEpidemicSpreadMult : 1);
  if (epidemic.mode === 'uncontained' && rng() < spreadChance) {
    const candidates = livingResidents(state).filter(resident => !epidemic.infectedIds.includes(resident.id));
    const infected = candidates[Math.floor(rng() * candidates.length)];
    if (infected) {
      infected.sick = true;
      epidemic.infectedIds.push(infected.id);
      addLog(state, `${infected.name}에게도 역병 증상이 나타났습니다. 환자가 ${epidemic.infectedIds.length}명으로 늘었습니다.`, 'bad', true);
    }
  }
  for (const id of [...epidemic.infectedIds]) {
    const resident = state.residents.find(candidate => candidate.id === id && candidate.alive);
    if (!resident) continue;
    resident.sick = true;
    const deathChance = CONFIG.specialEvents.epidemicDeathChance *
      (physicianActive ? CONFIG.medicine.epidemicDeathMult : 1);
    if (epidemic.mode === 'uncontained' && rng() < deathChance) {
      killResident(state, resident, '역병');
      continue;
    }
    const rawDamage = epidemic.mode === 'isolated' ? 1 + Math.floor(rng() * 3) : 3 + Math.floor(rng() * 5);
    const damage = physicianActive
      ? Math.max(1, Math.round(rawDamage * CONFIG.medicine.epidemicDamageMult))
      : rawDamage;
    resident.health = Math.max(1, resident.health - damage);
  }
}

function updatePredatorScouting(state: GameState): void {
  for (const kind of ['wolf', 'tiger'] as const) {
    const threat = state.incidents.predatorThreats[kind];
    const scouting = threat?.scouting;
    if (!threat || !scouting) continue;
    const hunter = state.residents.find(resident => resident.id === scouting.residentId && resident.alive);
    if (!hunter) {
      delete threat.scouting;
      addLog(state, `${kind === 'wolf' ? '늑대' : '호랑이'} 흔적을 쫓던 사냥꾼에게서 보고가 오지 않습니다.`, 'bad', true);
      continue;
    }
    if (state.day < scouting.completesOnDay) continue;

    const exact = scouting.hunterSkill >= 0.72 ||
      (scouting.usedGyrfalcon && scouting.hunterSkill >= 0.35);
    threat.intel = {
      precision: exact ? 'exact' : 'rough',
      revealedDay: state.day,
      scoutResidentId: scouting.residentId,
      hunterSkill: scouting.hunterSkill,
      usedGyrfalcon: scouting.usedGyrfalcon,
    };
    delete threat.scouting;
    hunter.task = '흔적 추적 보고 후 귀환';
    addLog(
      state,
      `${withJosa(hunter.name, '이/가')} ${kind === 'wolf' ? '늑대 떼' : exact ? wildlifeName(kind, state) : '큰 호랑이'}의 흔적을 쫓고 돌아왔습니다. ` +
        `적 규모를 ${exact ? '정확히' : '대략'} 파악했습니다.`,
      exact ? 'good' : 'info',
      true,
    );
  }
}

export function updateSpecialEvents(state: GameState, rng: () => number): void {
  ensureIncidentState(state);
  updatePredatorScouting(state);
  for (const kind of ['wolf', 'tiger', 'boar'] as const) {
    const threat = state.incidents.predatorThreats[kind];
    if (!threat) continue;
    if (state.day > threat.untilDay) {
      const expiredName = wildlifeName(kind, state);
      delete state.incidents.predatorThreats[kind];
      const message = kind === 'wolf'
        ? '늑대 떼의 흔적이 숲에서 사라졌습니다.'
        : kind === 'tiger'
          ? `${withJosa(expiredName, '이/가')} 다른 산줄기로 자취를 감췄습니다.`
          : '멧돼지 떼가 다른 골짜기로 이동해 밤의 피해가 멎었습니다.';
      addLog(state, message, 'info', true);
    }
  }

  const forest = forestResidents(state);
  if (state.incidents.predatorThreats.wolf && forest.length > 0 && rng() < CONFIG.specialEvents.wolfForestEncounterChance) {
    predatorEncounter(state, 'wolf', forest, rng);
  }
  if (state.incidents.predatorThreats.tiger) {
    if (forest.length > 0 && rng() < CONFIG.specialEvents.tigerForestEncounterChance) {
      predatorEncounter(state, 'tiger', forest, rng);
    } else {
      const all = livingResidents(state);
      if (all.length > 0 && rng() < CONFIG.specialEvents.tigerNightEncounterChance) predatorEncounter(state, 'tiger', all, rng);
    }
  }
  if (state.incidents.predatorThreats.boar) damageBoarTargets(state, rng);

  updatePlagueCase(state, rng);
  updateEpidemic(state, rng);
  if (!state.pendingChoice) maybeOpenHorseDefectorEvent(state, rng);
  if (!state.pendingChoice) maybeOpenSpecialEvent(state, rng);
}
