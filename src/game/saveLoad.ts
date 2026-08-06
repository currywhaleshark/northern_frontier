// localStorage 저장/불러오기
import { CONFIG } from './config';
import { ensureResidentsOnPassableTiles } from './agents';
import { clampPlotSide, computeDefense, rebuildBuildingFootprints } from './buildings';
import { combatGroupLabel } from './combatCapabilities';
import { defaultCropForBuildingType } from './crops';
import { rollCourtTribute } from './courtTribute';
import {
  enemyDoctrineDefinitions, enemyObjectiveDefinition, flankPlanFromEnemyPlan, flankPlanRevealedFromEnemyPlan,
  migrateBanditLairDefensePlan, migrateEnemyPlan,
} from './enemyPlan';
import { rebalanceLoadedHabitatReserve, spawnAnimalHabitats } from './habitats';
import { makeRng } from './map';
import { ensureMineralDeposits } from './minerals';
import { ensureForestGrowth } from './forestGrowth';
import { ensureTidalFlatStocks } from './tidalFlats';
import { ensureFishingGrounds } from './fishingGrounds';
import { normalizeFishingBoats } from './fishingBoats';
import { ensureProcessingReserves } from './processing';
import { initRelations } from './relations';
import { getSeason, getYear } from './seasons';
import { ensureExploration, refreshExploration } from './exploration';
import { tigerTierFromStrength } from './expeditionIntel';
import { RESOURCE_IDS } from './resourceCatalog';
import { reconcileTributeReserve } from './tributeReserve';
import { reconcileResidentHomes } from './residents';
import { ensureIncidentState } from './specialEvents';
import {
  normalizeArtifactWeaponAssignments,
  normalizeDiscoveredSpecialItems,
  normalizeSpecialItemInventory,
} from './specialItems';
import { specialResidentDefinition } from './specialResidents';
import { TUTORIAL_SCENARIO_VERSION, TUTORIAL_STEPS } from './scenario';
import { ensureForeignSiteState, revealForeignSitesFromExploration } from './foreignSites';
import {
  allocateMusketReadiness, reconcileMountAssignments, reconcileWeaponAssignments, resolvedWeaponAssignments,
} from './weapons';
import { beginExpeditionReturn } from './expedition';
import { CURRENT_SCHEMA_VERSION } from './saveSchema';
import { normalizeCisternState } from './rainwaterCistern';
import { normalizeSubsurfaceState } from './subsurfaceVeins';
import { defaultRaiderFormationLine } from './tacticalTargeting';
import { legacyTacticalPlanMetadata, tacticalCompositionTemplate } from './tacticalCompositions';
import { createTacticalRaiderSupportState, tacticalSupportKindForUnitType } from './tacticalSupport';
import { isImplementedLivestockId, normalizeLivestockState } from './livestock';
import { normalizePastureArea } from './pastures';
import { normalizeTacticalGroupTargets } from './tacticalBattle';
import {
  initializeEnemyTacticalRouteTransit,
  migrateTacticalFlankRoutes,
  migrateTacticalRouteTransit,
  syncTacticalRouteVisibility,
} from './tacticalRoutes';
import { isYouthWorkJob } from './youth';
import { initializeWallIntegrity } from './raidRoutes';
import { initializeWatchtowerIntegrity } from './watchtowers';
import { normalizeResidentFamilyReferences } from './family';
import { normalizeResidentWearables, TANNERY_PRODUCT_DEFS } from './wearables';
import { generateSettlementName, normalizeSettlementNameInput } from './settlementName';
import { recordYearlySnapshot } from './chronicleStats';
import { normalizeRoyalPlaqueBinding } from './royalPlaque';
import { normalizePendingDisasters } from './disasters';
import { normalizeDiplomaticFigures } from './diplomaticFigures';
import { normalizeDiplomacyState } from './diplomacy';
import { addLog } from './events';
import { assignResidentToBuilding, assignedBuildingForResident } from './workerSlots';
import { normalizeLodgingHutState } from './lodgingHuts';
import { mapSizeForDimensions, normalizeWorldSetupSnapshot } from './newGameOptions';
import {
  gradeTacticalBattle, raidDefenseObjectiveResult, tacticalClosingSummary, tacticalOutcomeResult,
} from './tacticalCore';
import type {
  AnnalsEntry, AnnalsKind, YearlySnapshot,
  CombatWeaponId, CourtTribute, DefenderGroupKind,
  EnemyObjectiveId, GameState, Gender, Resident, ResourceId,
  PreparationActionId, RaiderUnitType, TacticalAnimationEvent, TacticalBattle, TacticalBattleReport, TacticalBattleZone, TacticalCommandId,
  SpecialResidentId, TacticalAiState, TacticalDeploymentPlacement, TacticalFeaturedResident, TacticalFormationLine,
  TacticalBattleFlankOutcome, TacticalBattleTacticsReport, TacticalFacing, TacticalPreparationEffect,
  TacticalRaiderGroup, TacticalRoundReport, TradeContract,
} from './types';
import { SAVE_SLOT_COUNT, saveSlotStorageKey } from './saveStorage';
import {
  clonedRecord, migrateFermentBatches, migrateToCurrent, normalizedAmount, normalizedEdicts,
  type RawSave,
} from './saveMigrations';

export { CURRENT_SCHEMA_VERSION } from './saveSchema';
export { SAVE_SLOT_COUNT } from './saveStorage';
// 단계별 migrateVxToVy는 스키마 회귀 테스트가 saveLoad를 통해 직접 호출한다.
export * from './saveMigrations';

const RESOURCE_ID_SET = new Set<string>(RESOURCE_IDS);
const TACTICAL_AI_STATES = new Set<TacticalAiState>([
  'forming', 'probing', 'engaging', 'withdrawing', 'committingReserve',
  'routeTransit', 'routeEngagement', 'exiting',
]);

const TACTICAL_PHASES = new Set(['preparation', 'preparationExecution', 'deployment', 'command', 'simulating', 'report', 'finished']);
const DEFENDER_KINDS = new Set<DefenderGroupKind>([
  'militia-spear', 'militia-bow', 'militia-musket', 'militia-unarmed', 'watchman', 'hunter', 'healer', 'civilian',
]);
const SPECIAL_RESIDENT_IDS = new Set<SpecialResidentId>([
  'mudang', 'nosung', 'exiledScholar', 'jurchenWarrior', 'tigerHunter',
  'geomancer', 'uinyeo', 'runawaySmith', 'interpreter', 'hangwae',
]);
const TACTICAL_COMMANDS = new Set<TacticalCommandId>([
  'hold', 'attack', 'volley', 'ambush', 'guardStorehouse', 'protectCivilians', 'redeploy', 'reinforceRear',
  'fallback', 'advance', 'charge',
  'arson', 'blockEscape', 'openRetreat', 'flankRoute',
]);
const PREPARATION_ACTION_IDS = new Set<PreparationActionId>([
  'evacuateCivilians', 'hideSupplies', 'repairWall', 'setAmbush', 'prepareVolley',
  'firePrevention', 'torchWatch',
  'preliminaryBombardment', 'musterMilitia', 'nightAssault', 'prepareFireArrows',
  'openFlankRoute',
  'blockLeaderEscape', 'lureGuards', 'setHuntTraps', 'placeBait', 'splitDrivers', 'preInfiltration',
]);

function migratePreparationAction(raw: unknown): TacticalPreparationEffect | null {
  if (!raw || typeof raw !== 'object') return null;
  const action = raw as Record<string, unknown>;
  if (!PREPARATION_ACTION_IDS.has(action.id as PreparationActionId)) return null;
  if (!Number.isFinite(action.cost) || Number(action.cost) < 0) return null;
  if (typeof action.selected !== 'boolean' || typeof action.applied !== 'boolean') return null;
  return {
    ...action,
    id: action.id as PreparationActionId,
    label: typeof action.label === 'string' ? action.label : String(action.id),
    cost: Number(action.cost),
    selected: action.selected,
    applied: action.applied,
  } as TacticalPreparationEffect;
}

function migrateRouteAdvances(raw: unknown, routeIds: ReadonlySet<string>): TacticalRoundReport['routeAdvances'] {
  if (!Array.isArray(raw)) return undefined;
  const advances = raw.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return [];
    const source = entry as Record<string, unknown>;
    if (typeof source.groupId !== 'string' || !routeIds.has(String(source.routeId))) return [];
    if ((source.fromStep !== 0 && source.fromStep !== 1 && source.fromStep !== 2) ||
        (source.toStep !== 0 && source.toStep !== 1 && source.toStep !== 2)) return [];
    return [{
      groupId: source.groupId,
      routeId: String(source.routeId),
      fromStep: source.fromStep as 0 | 1 | 2,
      toStep: source.toStep as 0 | 1 | 2,
      visibleToDefender: source.visibleToDefender === true,
      arrivedAtExit: source.toStep === 2,
    }];
  });
  return advances.length > 0 ? advances : undefined;
}

function migrateRouteEngagements(raw: unknown, routeIds: ReadonlySet<string>): TacticalRoundReport['routeEngagements'] {
  if (!Array.isArray(raw)) return undefined;
  const engagements = raw.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return [];
    const source = entry as Record<string, unknown>;
    if (!routeIds.has(String(source.routeId))) return [];
    if (source.outcome !== 'defenderHeld' && source.outcome !== 'raiderBreakthrough' && source.outcome !== 'contested') {
      return [];
    }
    return [{
      routeId: String(source.routeId),
      defenderGroupIds: Array.isArray(source.defenderGroupIds)
        ? source.defenderGroupIds.filter(id => typeof id === 'string') as string[] : [],
      raiderGroupIds: Array.isArray(source.raiderGroupIds)
        ? source.raiderGroupIds.filter(id => typeof id === 'string') as string[] : [],
      outcome: source.outcome as 'defenderHeld' | 'raiderBreakthrough' | 'contested',
      defenderLosses: Math.max(0, Math.floor(Number(source.defenderLosses) || 0)),
      raiderLosses: Math.max(0, Math.floor(Number(source.raiderLosses) || 0)),
      defenderRetreated: source.defenderRetreated === true,
      raiderRetreated: source.raiderRetreated === true,
      lines: Array.isArray(source.lines) ? source.lines.filter(line => typeof line === 'string') as string[] : [],
    }];
  });
  return engagements.length > 0 ? engagements : undefined;
}

function migrateRouteArrivals(raw: unknown, routeIds: ReadonlySet<string>): TacticalRoundReport['routeArrivals'] {
  if (!Array.isArray(raw)) return undefined;
  const arrivals = raw.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return [];
    const source = entry as Record<string, unknown>;
    if (!routeIds.has(String(source.routeId)) || typeof source.groupId !== 'string' ||
        typeof source.destinationZoneId !== 'string' || (source.side !== 'defender' && source.side !== 'raider')) return [];
    return [{ routeId: String(source.routeId), groupId: source.groupId,
      side: source.side as 'defender' | 'raider',
      destinationZoneId: source.destinationZoneId, rearAssault: source.rearAssault === true }];
  });
  return arrivals.length > 0 ? arrivals : undefined;
}

function migratePendingReport(
  raw: unknown,
  zoneIds: ReadonlySet<string>,
  routeIds: ReadonlySet<string>,
): TacticalRoundReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const report = raw as Record<string, unknown>;
  if (!Number.isInteger(report.round) || Number(report.round) < 1) return null;
  if (!zoneIds.has(String(report.focusZoneId)) || !zoneIds.has(String(report.nextFocusZoneId))) return null;
  if (!Array.isArray(report.events) || !Array.isArray(report.lines)) return null;
  if (!report.lines.every(line => typeof line === 'string')) return null;
  if (!report.events.every(event => event && typeof event === 'object' &&
    zoneIds.has(String((event as Record<string, unknown>).zoneId)))) return null;
  return {
    ...report,
    round: Number(report.round),
    focusZoneId: String(report.focusZoneId),
    nextFocusZoneId: String(report.nextFocusZoneId),
    summary: typeof report.summary === 'string' ? report.summary : '',
    lines: [...report.lines] as string[],
    events: report.events.map(event => ({
      ...(event as Record<string, unknown>),
    })) as unknown as TacticalAnimationEvent[],
    routeAdvances: migrateRouteAdvances(report.routeAdvances, routeIds),
    routeEngagements: migrateRouteEngagements(report.routeEngagements, routeIds),
    routeArrivals: migrateRouteArrivals(report.routeArrivals, routeIds),
    wounded: Math.max(0, Number(report.wounded) || 0),
    treated: Math.max(0, Number(report.treated) || 0),
    raiderPowerRestored: Math.max(0, Number(report.raiderPowerRestored) || 0),
    killed: Math.max(0, Number(report.killed) || 0),
    raidersKilled: Math.max(0, Number(report.raidersKilled) || 0),
    loot: report.loot && typeof report.loot === 'object' ? report.loot : {},
    buildingsDamaged: Math.max(0, Number(report.buildingsDamaged) || 0),
    villageMoraleDelta: Number(report.villageMoraleDelta) || 0,
    raiderMoraleDelta: Number(report.raiderMoraleDelta) || 0,
    positionsApplied: report.positionsApplied === true,
    stageTransition: report.stageTransition === 'villageDefense' ? 'villageDefense' : undefined,
  } as TacticalRoundReport;
}

function inferredGroupIdentity(kind: DefenderGroupKind): {
  role: TacticalBattle['defenderGroups'][number]['role']; weapon: CombatWeaponId | null;
} {
  if (kind === 'watchman') return { role: 'watchman', weapon: null };
  if (kind === 'hunter') return { role: 'hunter', weapon: null };
  if (kind === 'healer') return { role: 'healer', weapon: null };
  if (kind === 'civilian') return { role: 'civilian', weapon: null };
  if (kind === 'militia-musket') return { role: 'militia', weapon: 'musket' };
  if (kind === 'militia-bow') return { role: 'militia', weapon: 'hornBow' };
  if (kind === 'militia-spear') return { role: 'militia', weapon: 'spear' };
  return { role: 'militia', weapon: null };
}

function defaultMigratedFormationLine(
  role: TacticalBattle['defenderGroups'][number]['role'],
  weapon: CombatWeaponId | null,
): TacticalFormationLine {
  if (role === 'civilian' || role === 'healer') return 'rear';
  if (weapon === 'musket') return 'middle';
  return weapon === 'spear' || (weapon == null && (role === 'militia' || role === 'watchman'))
    ? 'front'
    : 'rear';
}

function isTacticalFormationLine(value: unknown): value is TacticalFormationLine {
  return value === 'front' || value === 'middle' || value === 'rear';
}

function isTacticalFacing(value: unknown): value is TacticalFacing {
  return value === 'towardEnemy' || value === 'towardRear';
}

function migratedFeaturedResidents(
  ids: readonly number[],
  state: GameState,
): TacticalFeaturedResident[] {
  return ids.flatMap(residentId => {
    const resident = state.residents.find(candidate => candidate.id === residentId);
    if (!resident?.special || !SPECIAL_RESIDENT_IDS.has(resident.special)) return [];
    const definition = specialResidentDefinition(resident.special);
    return [{
      residentId,
      special: resident.special,
      name: resident.name,
      shortName: definition.shortName,
      traitLabel: (definition.skills ?? []).map(skill => skill.name).join(' · ') || definition.epithet,
      spriteScale: CONFIG.tacticalBattle.deployment.featuredSpriteScale,
      ...(resident.origin ? { origin: resident.origin } : {}),
    }];
  });
}

function migratedFormationLinesAdjacent(from: TacticalFormationLine, to: TacticalFormationLine): boolean {
  const lines: readonly TacticalFormationLine[] = ['front', 'middle', 'rear'];
  return Math.abs(lines.indexOf(from) - lines.indexOf(to)) === 1;
}

function normalizeTacticalWallSection(
  raw: unknown,
  state: GameState,
): TacticalBattleZone['wallSection'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const source = raw as Record<string, unknown>;
  const buildingId = Number(source.buildingId);
  const wallType = source.wallType;
  const integrityMax = Number(source.integrityMax);
  if (!Number.isInteger(buildingId) || !state.buildings.some(building => building.id === buildingId)) return undefined;
  if (wallType !== 'palisade' && wallType !== 'earthFort' && wallType !== 'stoneWall') return undefined;
  if (!Number.isFinite(integrityMax) || integrityMax <= 0) return undefined;
  const ids = (value: unknown): number[] => Array.isArray(value)
    ? [...new Set(value.map(Number).filter(id => Number.isInteger(id) && id >= 0))]
    : [];
  return {
    buildingId,
    wallType,
    integrity: Math.max(0, Math.min(integrityMax, Number(source.integrity) || 0)),
    integrityMax,
    gate: source.gate === true,
    watchtowerIds: ids(source.watchtowerIds),
    stationedWatchmanIds: ids(source.stationedWatchmanIds),
    bowWatchmanIds: ids(source.bowWatchmanIds),
  };
}

export function migrateTacticalBattle(raw: unknown, state: GameState): TacticalBattle | null {
  if (raw == null) return null;
  if (typeof raw !== 'object') return null;
  const source = clonedRecord(raw);
  if (!Array.isArray(source.zones) || source.zones.length === 0 ||
      !Array.isArray(source.defenderGroups) || !Array.isArray(source.raiderGroups)) return null;
  if (!TACTICAL_PHASES.has(String(source.phase))) return null;

  const rawZones = source.zones.filter(zone => zone && typeof zone === 'object') as Array<Record<string, unknown>>;
  const zoneIds = new Set(rawZones.map(zone => String(zone.id ?? '')).filter(Boolean));
  if (zoneIds.size === 0) return null;
  const residentIds = new Set(state.residents.map(resident => resident.id));
  const defaultZoneId = zoneIds.has(String(source.currentZoneId)) ? String(source.currentZoneId) : [...zoneIds][0];
  const encounterKind = source.encounterKind === 'banditLair' || source.assaultKind === 'banditLair'
    ? 'banditLair'
    : source.encounterKind === 'predatorHunt' || source.assaultKind === 'predatorHunt'
      ? 'predatorHunt'
      : 'raidDefense';
  const defenseStage = encounterKind === 'raidDefense' &&
    (source.defenseStage === 'wallBreach' || source.defenseStage === 'villageDefense')
    ? source.defenseStage
    : undefined;
  const legacyRearEngagedZoneIds = new Set((source.raiderGroups as unknown[]).flatMap(entry => {
    if (!entry || typeof entry !== 'object') return [];
    const group = entry as Record<string, unknown>;
    const active = Number(group.power) > 0 && Number(group.count) - Number(group.killed ?? 0) > 0;
    return group.rearAssault === true && Number(group.engagementsInZone) > 0 && active
      ? [String(group.zoneId ?? '')]
      : [];
  }).filter(Boolean));
  const zones = rawZones.filter(zone => zoneIds.has(String(zone.id))).map((zone, index) => ({
    ...zone,
    id: String(zone.id),
    name: typeof zone.name === 'string' ? zone.name : String(zone.id),
    kind: zone.kind === 'approach' || zone.kind === 'forest' || zone.kind === 'ford' || zone.kind === 'wall' ||
      zone.kind === 'storehouse' || zone.kind === 'center' ? zone.kind : 'approach',
    order: Number.isFinite(zone.order) ? Number(zone.order) : index,
    pressure: Math.max(0, Number(zone.pressure) || 0),
    breached: zone.breached === true,
    defenseBonus: Number(zone.defenseBonus) || 0,
    ambushBonus: Number(zone.ambushBonus) || 0,
    lootRisk: Math.max(0, Number(zone.lootRisk) || 0),
    civilianRisk: Math.max(0, Number(zone.civilianRisk) || 0),
    description: typeof zone.description === 'string' ? zone.description : '',
    wallSection: normalizeTacticalWallSection(zone.wallSection, state),
    focusTargetGroupId: typeof zone.focusTargetGroupId === 'string' ? zone.focusTargetGroupId : undefined,
    focusTargetSource: zone.focusTargetSource === 'player' ? 'player' : 'auto',
  }));

  const defenderGroups = (source.defenderGroups as unknown[]).flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const group = entry as Record<string, unknown>;
    if (!DEFENDER_KINDS.has(group.kind as DefenderGroupKind)) return [];
    const kind = group.kind as DefenderGroupKind;
    const inferred = inferredGroupIdentity(kind);
    const ids = Array.isArray(group.residentIds)
      ? [...new Set(group.residentIds.filter(id => Number.isInteger(id) && residentIds.has(Number(id))).map(Number))]
      : [];
    const externalAidFactionName = typeof group.externalAidFactionName === 'string' &&
      group.externalAidFactionName.length > 0 ? group.externalAidFactionName : undefined;
    const count = externalAidFactionName
      ? Math.max(0, Math.floor(Number(group.count) || 0))
      : ids.length;
    const killed = Math.min(count, Math.max(0, Math.floor(Number(group.killed) || 0)));
    const wounded = Math.min(count - killed, Math.max(0, Math.floor(Number(group.wounded) || 0)));
    const weapon = kind === 'healer' ? null : group.weapon === 'musket' || group.weapon === 'hornBow' || group.weapon === 'spear'
      ? group.weapon as CombatWeaponId
      : group.weapon === null ? null : inferred.weapon;
    const role = kind === 'healer' ? 'healer' : group.role === 'militia' || group.role === 'watchman' ||
        group.role === 'hunter' || group.role === 'healer' || group.role === 'civilian'
      ? group.role : inferred.role;
    const protectedCivilian = kind === 'civilian';
    const protectedSupport = protectedCivilian || kind === 'healer';
    const civilianZoneId = zoneIds.has('center') ? 'center' : defaultZoneId;
    const line = kind === 'healer' ? 'rear' : isTacticalFormationLine(group.line)
      ? group.line
      : defaultMigratedFormationLine(role, weapon);
    const storedCommand = protectedSupport || !TACTICAL_COMMANDS.has(group.command as TacticalCommandId)
      ? null
      : group.command as TacticalCommandId;
    const pendingLine = storedCommand === 'redeploy' && isTacticalFormationLine(group.pendingLine) &&
        migratedFormationLinesAdjacent(line, group.pendingLine)
      ? group.pendingLine
      : undefined;
    const command = storedCommand === 'redeploy' && pendingLine == null ? null : storedCommand;
    const legacyRearFacing = legacyRearEngagedZoneIds.has(String(group.zoneId)) &&
      (line === 'rear' || (line === 'middle' && command === 'reinforceRear'));
    const facing: TacticalFacing = protectedCivilian
      ? 'towardEnemy'
      : isTacticalFacing(group.facing) ? group.facing : legacyRearFacing ? 'towardRear' : 'towardEnemy';
    const pendingFacing = isTacticalFacing(group.pendingFacing) && group.pendingFacing === facing
      ? group.pendingFacing
      : undefined;
    const id = typeof group.id === 'string' ? group.id : `migrated-defender-${index}`;
    const featuredResidents = migratedFeaturedResidents(ids, state);
    const baseLabel = typeof group.baseLabel === 'string' && group.baseLabel.trim().length > 0
      ? group.baseLabel
      : combatGroupLabel(role, weapon);
    const featuredDetachment = featuredResidents.length > 0 && group.featuredDetachment === true;
    const label = featuredResidents[0]
      ? featuredDetachment
        ? `${featuredResidents[0].shortName}의 조 분리`
        : `${featuredResidents[0].shortName}의 ${baseLabel}`
      : typeof group.label === 'string' ? group.label : id;
    return [{
      ...group,
      id,
      kind, role, weapon,
      externalAidFactionName,
      readyMuskets: weapon === 'musket' ? Math.min(count, Math.max(0, Math.floor(Number(group.readyMuskets) || count))) : 0,
      label,
      baseLabel,
      featuredResidents: featuredResidents.length > 0 ? featuredResidents : undefined,
      featuredDetachment,
      special: featuredResidents[0]?.special,
      deploymentCohortId: typeof group.deploymentCohortId === 'string' && group.deploymentCohortId.length > 0
        ? group.deploymentCohortId
        : id,
      residentIds: ids, count, killed, wounded,
      zoneId: protectedCivilian
        ? civilianZoneId
        : zoneIds.has(String(group.zoneId)) ? String(group.zoneId) : defaultZoneId,
      command,
      commandSource: command == null
        ? undefined
        : group.commandSource === 'player' ? 'player' : 'recommended',
      commandable: protectedSupport ? false : group.commandable === false ? false : undefined,
      lockedZoneId: protectedCivilian ? civilianZoneId : undefined,
      power: protectedCivilian ? 0 : Math.max(0, Number(group.power) || 0),
      line,
      pendingLine,
      facing,
      pendingFacing,
      ambushed: group.ambushed === true,
      ambushAftermath: group.ambushAftermath === 'hold' || group.ambushAftermath === 'fallback'
        ? group.ambushAftermath
        : undefined,
      targetGroupId: typeof group.targetGroupId === 'string' ? group.targetGroupId : undefined,
      targetSource: group.targetSource === 'player' ? 'player' : 'auto',
      rearRaidRound: Number.isFinite(group.rearRaidRound)
        ? Math.max(1, Math.floor(Number(group.rearRaidRound)))
        : undefined,
      routeTransit: group.routeTransit,
      huntOriginGroupId: encounterKind === 'predatorHunt'
        ? (typeof group.huntOriginGroupId === 'string'
          ? group.huntOriginGroupId
          : id)
        : undefined,
    }];
  });

  const rawRaiderPower = (source.raiderGroups as unknown[]).reduce<number>((sum, entry) =>
    entry && typeof entry === 'object' ? sum + Math.max(0, Number((entry as Record<string, unknown>).power) || 0) : sum, 0);
  const estimatedRaiders = Math.max(1, Math.round((Number(source.originalPower) || 3) / CONFIG.tacticalBattle.raiderPowerPerFighter));
  const migratedRaiderGroups = (source.raiderGroups as unknown[]).flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const group = entry as Record<string, unknown>;
    const power = Math.max(0, Number(group.power) || 0);
    const count = Number.isFinite(group.count)
      ? Math.max(0, Math.floor(Number(group.count)))
      : Math.max(1, Math.round(estimatedRaiders * (rawRaiderPower > 0 ? (Number(group.power) || 0) / rawRaiderPower : 1 / 3)));
    const unitType = group.unitType as RaiderUnitType | undefined;
    const expectedSupportKind = tacticalSupportKindForUnitType(unitType);
    const rawSupport = group.supportState && typeof group.supportState === 'object'
      ? group.supportState as Record<string, unknown>
      : null;
    const defaultSupport = createTacticalRaiderSupportState(unitType,
      zoneIds.has(String(group.zoneId)) ? String(group.zoneId) : defaultZoneId);
    const supportState = expectedSupportKind && defaultSupport ? {
      ...defaultSupport,
      shotsRemaining: Number.isFinite(rawSupport?.shotsRemaining)
        ? Math.max(0, Math.floor(Number(rawSupport?.shotsRemaining))) : defaultSupport.shotsRemaining,
      readyOnRound: Number.isFinite(rawSupport?.readyOnRound)
        ? Math.max(1, Math.floor(Number(rawSupport?.readyOnRound))) : defaultSupport.readyOnRound,
      facingZoneId: zoneIds.has(String(rawSupport?.facingZoneId))
        ? String(rawSupport?.facingZoneId) : defaultSupport.facingZoneId,
      firing: rawSupport?.firing === true,
      lastFiredRound: Number.isFinite(rawSupport?.lastFiredRound)
        ? Math.max(1, Math.floor(Number(rawSupport?.lastFiredRound))) : undefined,
      totalRestored: Math.max(0, Number(rawSupport?.totalRestored) || 0),
    } : undefined;
    return [{
      ...group,
      id: typeof group.id === 'string' ? group.id : `migrated-raider-${index}`,
      kind: group.kind === 'looters' || group.kind === 'flankers' ? group.kind : 'main',
      zoneId: zoneIds.has(String(group.zoneId)) ? String(group.zoneId) : defaultZoneId,
      line: isTacticalFormationLine(group.line)
        ? group.line
        : defaultRaiderFormationLine(group.unitType as RaiderUnitType | undefined, group.leader === true),
      targetZoneId: zoneIds.has(String(group.targetZoneId)) ? String(group.targetZoneId) : defaultZoneId,
      count,
      killed: Math.min(count, Math.max(0, Math.floor(Number(group.killed) || 0))),
      power,
      maximumPower: Math.max(power, Number(group.maximumPower) || power),
      estimatedPower: Number.isFinite(group.estimatedPower) && Number(group.estimatedPower) >= 0
        ? Number(group.estimatedPower)
        : undefined,
      morale: Math.max(0, Math.min(100, Number(group.morale) || 0)),
      aiState: TACTICAL_AI_STATES.has(group.aiState as TacticalAiState)
        ? group.aiState as TacticalAiState
        : undefined,
      aiStateChangedRound: Number.isFinite(group.aiStateChangedRound)
        ? Math.max(1, Math.floor(Number(group.aiStateChangedRound)))
        : undefined,
      intentLockedUntilRound: Number.isFinite(group.intentLockedUntilRound)
        ? Math.max(1, Math.floor(Number(group.intentLockedUntilRound)))
        : undefined,
      engagementsInZone: Math.max(0, Math.floor(Number(group.engagementsInZone) || 0)),
      flankPlan: group.flankPlan === 'rearAssault' || group.flankPlan === 'breakthrough' ? group.flankPlan : undefined,
      flankPlanRevealed: group.flankPlanRevealed === true,
      rearAssault: group.rearAssault === true,
      targetGroupId: typeof group.targetGroupId === 'string' ? group.targetGroupId : undefined,
      targetSource: 'ai',
      supportState,
    }];
  });
  const legacyFlankers = migratedRaiderGroups.find(group => group.kind === 'flankers');
  const enemyPlan = encounterKind === 'raidDefense'
    ? migrateEnemyPlan(source.enemyPlan, {
      flankPlan: legacyFlankers?.flankPlan === 'rearAssault' ? 'rearAssault' : 'breakthrough',
      revealed: legacyFlankers?.flankPlanRevealed === true,
    })
    : undefined;
  const legacyPlanMetadata = typeof source.factionName === 'string'
    ? legacyTacticalPlanMetadata(source.factionName)
    : undefined;
  if (enemyPlan && legacyPlanMetadata) {
    enemyPlan.doctrine ??= legacyPlanMetadata.doctrine;
    enemyPlan.doctrineRevealed ??= false;
    enemyPlan.compositionTemplateId ??= legacyPlanMetadata.compositionTemplateId;
    enemyPlan.compositionRevealed ??= false;
  }
  if (enemyPlan && !enemyPlan.flankRouteSide &&
      enemyPlan.stratagems.some(stratagem => stratagem.id === 'rearManeuver')) {
    // v26 이전 저장은 계책만 있고 경로 선택이 없을 수 있다. 임의 RNG를 새로 쓰지 않고 좌측으로 고정한다.
    enemyPlan.flankRouteSide = 'left';
  }
  const derivedFlankPlan = enemyPlan ? flankPlanFromEnemyPlan(enemyPlan) : undefined;
  const derivedFlankPlanRevealed = enemyPlan ? flankPlanRevealedFromEnemyPlan(enemyPlan) : undefined;
  const raiderGroups = migratedRaiderGroups.map(group => encounterKind === 'raidDefense' && group.kind === 'flankers'
    ? {
      ...group,
      flankPlan: derivedFlankPlan,
      flankPlanRevealed: derivedFlankPlanRevealed,
      rearAssault: group.rearAssault === true,
    }
    : group) as unknown as TacticalRaiderGroup[];
  if (!defenderGroups.some(group => group.count > 0) || !raiderGroups.some(group => group.count > 0)) return null;

  const flankRoutes = encounterKind === 'raidDefense'
    ? migrateTacticalFlankRoutes(source.flankRoutes, enemyPlan)
    : undefined;
  const flankRouteIds = new Set((flankRoutes ?? []).map(route => route.id));

  const prepActions = (Array.isArray(source.prepActions) ? source.prepActions : [])
    .flatMap(action => {
      const migratedAction = migratePreparationAction(action);
      return migratedAction ? [migratedAction] : [];
    });
  if (encounterKind === 'raidDefense' && !prepActions.some(action => action.id === 'openFlankRoute')) {
    prepActions.push({
      id: 'openFlankRoute',
      label: '우회로 개방',
      cost: CONFIG.tacticalBattle.flankRoutes.preparationCost,
      selected: flankRoutes?.some(route => route.openedByDefender) === true,
      applied: String(source.phase) !== 'preparation' && flankRoutes?.some(route => route.openedByDefender) === true,
    });
  }
  const flankRouteAction = prepActions.find(action => action.id === 'openFlankRoute');
  if (flankRouteAction) {
    flankRouteAction.selected = flankRoutes?.some(route => route.openedByDefender) === true;
    if (String(source.phase) === 'preparation') flankRouteAction.applied = false;
  }

  const reports = (Array.isArray(source.reports) ? source.reports : [])
    .filter(report => report && typeof report === 'object')
    .map(report => {
      const item = report as Record<string, unknown>;
      return {
        ...item,
        lines: Array.isArray(item.lines) ? item.lines.filter(line => typeof line === 'string') : [],
        events: Array.isArray(item.events) ? item.events : [],
        routeAdvances: migrateRouteAdvances(item.routeAdvances, flankRouteIds),
        routeEngagements: migrateRouteEngagements(item.routeEngagements, flankRouteIds),
        routeArrivals: migrateRouteArrivals(item.routeArrivals, flankRouteIds),
        raidersKilled: Math.max(0, Number(item.raidersKilled) || 0),
        raiderPowerRestored: Math.max(0, Number(item.raiderPowerRestored) || 0),
        stageTransition: item.stageTransition === 'villageDefense' ? 'villageDefense' : undefined,
      } as unknown as TacticalRoundReport;
    });
  const phase = String(source.phase);
  const pendingRequired = phase === 'simulating' || phase === 'report' || phase === 'finished';
  const pendingForbidden = phase === 'preparation' || phase === 'preparationExecution' ||
    phase === 'deployment' || phase === 'command';
  const pendingReport = source.pendingReport == null
    ? null
    : migratePendingReport(source.pendingReport, zoneIds, flankRouteIds);
  if (pendingRequired && !pendingReport) return null;
  if (pendingForbidden && source.pendingReport != null) return null;
  if (pendingReport && !reports.some(report => report.round === pendingReport.round &&
    report.focusZoneId === pendingReport.focusZoneId)) reports.push(pendingReport);
  const rawPlacementRecord = source.deploymentPlacements && typeof source.deploymentPlacements === 'object' &&
      !Array.isArray(source.deploymentPlacements)
    ? source.deploymentPlacements as Record<string, unknown>
    : null;
  const prepApplied = (id: PreparationActionId) => prepActions.some(action => action.id === id && action.applied);
  const canRemainWaiting = phase === 'preparation' || phase === 'preparationExecution' || phase === 'deployment';
  const defaultPlacement = (group: typeof defenderGroups[number]): TacticalDeploymentPlacement => {
    if (group.kind === 'civilian') {
      return { zoneId: zoneIds.has('center') ? 'center' : defaultZoneId, line: 'rear', fixed: true };
    }
    if (encounterKind === 'predatorHunt') {
      const huntZone = zoneIds.has('huntSectorRidge')
        ? 'huntSectorRidge'
        : [...zoneIds].find(zoneId => zoneId !== 'huntDen') ?? defaultZoneId;
      return { zoneId: huntZone, line: group.kind === 'healer' ? 'rear' : group.line };
    }
    if (encounterKind === 'banditLair') {
      return {
        zoneId: zoneIds.has('lairTrail') ? 'lairTrail' : defaultZoneId,
        line: group.kind === 'healer' ? 'rear' : group.line,
      };
    }
    if (defenseStage === 'wallBreach') {
      return { zoneId: zoneIds.has('wall') ? 'wall' : defaultZoneId, line: group.kind === 'healer' ? 'rear' : group.line };
    }
    if (defenseStage === 'villageDefense') {
      return {
        zoneId: group.kind === 'healer' && zoneIds.has('center')
          ? 'center'
          : zoneIds.has('storehouse') ? 'storehouse' : defaultZoneId,
        line: group.kind === 'healer' ? 'rear' : group.line,
      };
    }
    const preferred = group.kind === 'hunter' ? 'approach' : group.id.includes('-levy') ? 'storehouse' : 'wall';
    return {
      zoneId: zoneIds.has(preferred) ? preferred : defaultZoneId,
      line: group.kind === 'healer' ? 'rear' : group.line,
      ...(group.kind === 'hunter' && prepApplied('setAmbush') ? { hidden: true } : {}),
    };
  };
  const deploymentPlacements: Record<string, TacticalDeploymentPlacement | null> = {};
  for (const group of defenderGroups) {
    const fallback = defaultPlacement(group);
    if (group.kind === 'civilian') {
      deploymentPlacements[group.id] = fallback;
      group.zoneId = fallback.zoneId;
      group.line = fallback.line;
      group.ambushed = false;
      continue;
    }
    if (!rawPlacementRecord) {
      const legacyPlacement: TacticalDeploymentPlacement = {
        zoneId: zoneIds.has(group.zoneId) ? group.zoneId : fallback.zoneId,
        line: group.kind === 'healer' ? 'rear' : group.line,
        ...(group.kind === 'hunter' && encounterKind === 'raidDefense' && group.zoneId === 'approach' && prepApplied('setAmbush')
          ? { hidden: true }
          : {}),
      };
      deploymentPlacements[group.id] = legacyPlacement;
      group.zoneId = legacyPlacement.zoneId;
      group.line = legacyPlacement.line;
      group.ambushed = legacyPlacement.hidden === true;
      continue;
    }
    const rawPlacement = rawPlacementRecord[group.id];
    const required = group.commandable !== false && group.count - group.wounded - group.killed > 0;
    let placement: TacticalDeploymentPlacement | null = rawPlacement == null
      ? required && canRemainWaiting ? null : fallback
      : null;
    if (rawPlacement && typeof rawPlacement === 'object') {
      const candidate = rawPlacement as Record<string, unknown>;
      const zoneId = typeof candidate.zoneId === 'string' ? candidate.zoneId : '';
      const line = isTacticalFormationLine(candidate.line)
        ? (group.kind === 'healer' ? 'rear' : candidate.line)
        : null;
      const assaultZoneAllowed = encounterKind !== 'banditLair' || zoneId === 'lairTrail' ||
        (group.kind === 'hunter' && zoneId === 'lairWall' && prepApplied('preInfiltration'));
      const huntZoneAllowed = encounterKind !== 'predatorHunt' || zoneId !== 'huntDen';
      const defenseStageZoneAllowed = defenseStage === 'wallBreach'
        ? zoneId === 'wall'
        : defenseStage === 'villageDefense'
          ? zoneId === 'storehouse' || zoneId === 'center'
          : true;
      const routeId = typeof candidate.routeId === 'string' && flankRouteIds.has(candidate.routeId)
        ? candidate.routeId : undefined;
      const rawGroup = group as unknown as Record<string, unknown>;
      const rawTransit = rawGroup.routeTransit && typeof rawGroup.routeTransit === 'object'
        ? rawGroup.routeTransit as Record<string, unknown>
        : undefined;
      const routePlacementAllowed = encounterKind === 'raidDefense' && line && routeId != null &&
        rawTransit?.routeId === routeId;
      if (routePlacementAllowed) {
        placement = { zoneId: '', line, routeId };
      } else if (zoneIds.has(zoneId) && line && assaultZoneAllowed && huntZoneAllowed && defenseStageZoneAllowed) {
        const hidden = (encounterKind === 'banditLair' && group.kind === 'hunter' && zoneId === 'lairWall' &&
            prepApplied('preInfiltration')) ||
          (encounterKind === 'raidDefense' && group.kind === 'hunter' && zoneId === 'approach' && prepApplied('setAmbush'));
        placement = { zoneId, line, ...(hidden ? { hidden: true } : {}) };
      } else if (!required || !canRemainWaiting) {
        placement = fallback;
      }
    }
    deploymentPlacements[group.id] = placement;
    group.zoneId = placement?.zoneId ?? '';
    if (placement) group.line = placement.line;
    if (canRemainWaiting) group.pendingLine = undefined;
    group.ambushed = placement?.hidden === true;
  }
  const defenderGroupIds = new Set(defenderGroups.map(group => group.id));
  const deploymentGroupAliases = source.deploymentGroupAliases && typeof source.deploymentGroupAliases === 'object' &&
      !Array.isArray(source.deploymentGroupAliases)
    ? Object.fromEntries(Object.entries(source.deploymentGroupAliases as Record<string, unknown>)
      .filter(([alias, target]) => alias.length > 0 && typeof target === 'string' && defenderGroupIds.has(target)))
    : {};
  const migrated = {
    ...source,
    encounterKind,
    defenseStage,
    wallStageRoundLimit: defenseStage
      ? Math.max(1, Math.floor(Number(source.wallStageRoundLimit) || CONFIG.tacticalBattle.wallStageMaxRounds))
      : undefined,
    villageStageStartRound: defenseStage === 'villageDefense'
      ? Math.max(1, Math.floor(Number(source.villageStageStartRound) || 1))
      : undefined,
    orientation: encounterKind === 'raidDefense' ? 'defense' : 'assault',
    assaultKind: encounterKind === 'raidDefense' ? undefined : encounterKind,
    phase,
    prepActions,
    preparationEvents: Array.isArray(source.preparationEvents) ? source.preparationEvents : [],
    zones,
    flankRoutes,
    defenderGroups,
    deploymentPlacements,
    deploymentSerial: Number.isInteger(source.deploymentSerial) && Number(source.deploymentSerial) >= 0
      ? Number(source.deploymentSerial)
      : 0,
    deploymentGroupAliases,
    deploymentForced: source.deploymentForced === 'nightAmbush' ? 'nightAmbush' : undefined,
    raiderGroups,
    enemyPlan,
    lairDefensePlan: encounterKind === 'banditLair'
      ? migrateBanditLairDefensePlan(source.lairDefensePlan)
      : undefined,
    lairLootPreRemoved: encounterKind === 'banditLair'
      ? Number.isFinite(source.lairLootPreRemoved)
        ? Math.min(3, Math.max(0, Math.floor(Number(source.lairLootPreRemoved))))
        : 0
      : undefined,
    initialFriendlyPower: Number.isFinite(source.initialFriendlyPower)
      ? Math.max(1, Number(source.initialFriendlyPower))
      : Math.max(1, defenderGroups.reduce((sum, group) => sum + group.power, 0)),
    initialEnemyPower: Number.isFinite(source.initialEnemyPower)
      ? Math.max(1, Number(source.initialEnemyPower))
      : Math.max(1, raiderGroups.reduce((sum, group) => sum + group.power, 0)),
    reports,
    pendingReport,
    currentZoneId: defaultZoneId,
    enemyPlanDeploymentApplied: source.enemyPlanDeploymentApplied === true,
  } as unknown as TacticalBattle;
  if (migrated.flankRoutes) {
    const routeIds = new Set(migrated.flankRoutes.map(route => route.id));
    const fallbackRound = Math.max(1, Math.floor(Number(source.round) || 1));
    for (const group of migrated.defenderGroups) {
      const transit = migrateTacticalRouteTransit(group.routeTransit, routeIds, fallbackRound, 'defender');
      if (transit && zoneIds.has(transit.destinationZoneId)) group.routeTransit = transit;
      else group.routeTransit = undefined;
    }
    for (const group of migrated.raiderGroups) {
      const transit = migrateTacticalRouteTransit(group.routeTransit, routeIds, fallbackRound, 'raider');
      if (transit && zoneIds.has(transit.destinationZoneId)) group.routeTransit = transit;
      else group.routeTransit = undefined;
    }
    initializeEnemyTacticalRouteTransit(migrated, state.weather);
    syncTacticalRouteVisibility(migrated);
  }
  for (const zone of zones) {
    if (zone.focusTargetSource !== 'player' || !zone.focusTargetGroupId) continue;
    for (const defender of migrated.defenderGroups.filter(group =>
      group.zoneId === zone.id && group.commandable !== false && group.targetSource !== 'player')) {
      defender.targetGroupId = zone.focusTargetGroupId;
      defender.targetSource = 'player';
    }
  }
  normalizeTacticalGroupTargets(migrated);
  for (const zone of migrated.zones) {
    zone.focusTargetGroupId = undefined;
    zone.focusTargetSource = undefined;
  }
  return migrated;
}

const TACTICAL_FLANK_OUTCOMES = new Set<TacticalBattleFlankOutcome>([
  'unused', 'defenderHeld', 'raiderReachedRear', 'defenderReachedRear', 'contested',
]);

function migrateTacticalBattleTacticsReport(raw: unknown): TacticalBattleTacticsReport | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const source = clonedRecord(raw);
  const objectiveId = source.objectiveId === 'breakthrough' || source.objectiveId === 'plunder' ||
    source.objectiveId === 'arson'
    ? source.objectiveId as EnemyObjectiveId
    : undefined;
  const doctrine = enemyDoctrineDefinitions().find(entry => entry.id === source.doctrineId);
  const compositionTemplateId = typeof source.compositionTemplateId === 'string'
    ? source.compositionTemplateId
    : undefined;
  const composition = tacticalCompositionTemplate(compositionTemplateId);
  const flankRoutes: TacticalBattleTacticsReport['flankRoutes'] = [];
  for (const rawRoute of Array.isArray(source.flankRoutes) ? source.flankRoutes : []) {
    const route = clonedRecord(rawRoute);
    const routeId = typeof route.routeId === 'string' ? route.routeId.trim() : '';
    const side = route.side === 'left' || route.side === 'right' ? route.side : null;
    const finalControl = route.finalControl === 'defender' || route.finalControl === 'raider' ||
      route.finalControl === 'contested' || route.finalControl === 'neutral'
      ? route.finalControl
      : null;
    const outcome = TACTICAL_FLANK_OUTCOMES.has(route.outcome as TacticalBattleFlankOutcome)
      ? route.outcome as TacticalBattleFlankOutcome
      : null;
    if (!routeId || !side || !finalControl || !outcome) continue;
    const count = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));
    const label = typeof route.label === 'string' && route.label.trim().length > 0
      ? route.label.trim()
      : side === 'left' ? '숲 능선길' : '하천 둥길';
    flankRoutes.push({
      routeId,
      side,
      label,
      finalControl,
      outcome,
      engagements: count(route.engagements),
      defenderHolds: count(route.defenderHolds),
      raiderBreakthroughs: count(route.raiderBreakthroughs),
      contestedEngagements: count(route.contestedEngagements),
      defenderArrivals: count(route.defenderArrivals),
      raiderArrivals: count(route.raiderArrivals),
      summary: typeof route.summary === 'string' && route.summary.trim().length > 0
        ? route.summary.trim()
        : `${label} 우회 결과`,
    });
  }
  if (!objectiveId && !doctrine && !composition && flankRoutes.length === 0) return undefined;
  return {
    objectiveId,
    objectiveLabel: typeof source.objectiveLabel === 'string' && source.objectiveLabel.trim().length > 0
      ? source.objectiveLabel.trim()
      : objectiveId ? enemyObjectiveDefinition(objectiveId).label : '미확인 목표',
    objectiveAchieved: typeof source.objectiveAchieved === 'boolean' ? source.objectiveAchieved : undefined,
    doctrineId: doctrine?.id,
    doctrineLabel: typeof source.doctrineLabel === 'string' && source.doctrineLabel.trim().length > 0
      ? source.doctrineLabel.trim()
      : doctrine?.label ?? '미확인 교리',
    compositionTemplateId: composition?.id,
    compositionLabel: typeof source.compositionLabel === 'string' && source.compositionLabel.trim().length > 0
      ? source.compositionLabel.trim()
      : composition?.label ?? '미확인 편제',
    flankRoutes,
  };
}

function migrateTacticalBattleReport(raw: unknown): TacticalBattleReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const report = clonedRecord(raw) as unknown as TacticalBattleReport;
  if (!Number.isFinite(report.battleId) || typeof report.outcome !== 'string') return null;
  report.encounterKind ??= 'raidDefense';
  report.title ??= report.encounterKind === 'banditLair' ? '토벌 장계' : report.encounterKind === 'predatorHunt' ? '사냥 장계' : '전투 장계';
  report.friendlyLabel ??= report.encounterKind === 'raidDefense' ? '수비대' : report.encounterKind === 'banditLair' ? '원정대' : '사냥대';
  report.enemyLabel ??= report.factionName ?? '적';
  report.result = report.result === 'victory' || report.result === 'defeat'
    ? report.result
    : tacticalOutcomeResult(report.outcome);
  report.killed = Array.isArray(report.killed) ? report.killed : [];
  report.wounded = Array.isArray(report.wounded) ? report.wounded : [];
  report.damagedBuildings = Array.isArray(report.damagedBuildings) ? report.damagedBuildings : [];
  report.highlights = Array.isArray(report.highlights) ? report.highlights : [];
  report.loot = report.loot && typeof report.loot === 'object' ? report.loot : {};
  report.recoveredLoot = report.recoveredLoot && typeof report.recoveredLoot === 'object' ? report.recoveredLoot : {};
  if (report.externalAid && typeof report.externalAid.factionName === 'string') {
    const committed = Math.max(0, Math.floor(Number(report.externalAid.committed) || 0));
    const killed = Math.min(committed, Math.max(0, Math.floor(Number(report.externalAid.killed) || 0)));
    report.externalAid = {
      factionName: report.externalAid.factionName,
      committed,
      killed,
      wounded: Math.min(committed - killed, Math.max(0, Math.floor(Number(report.externalAid.wounded) || 0))),
    };
  } else {
    delete report.externalAid;
  }
  report.tactics = migrateTacticalBattleTacticsReport(report.tactics);
  const looted = Object.values(report.loot).some(amount => (amount ?? 0) > 1e-9);
  report.enemyRouted = report.enemyRouted === true || (
    report.encounterKind === 'raidDefense' && report.outcome === 'defenseSuccess' &&
    (Number(report.raiderMorale) <= 20 ||
      Number(report.raidersKilled) / Math.max(1, Number(report.raidersCommitted) || 0) >= 0.65)
  );
  const objectiveResult = report.encounterKind === 'raidDefense'
    ? raidDefenseObjectiveResult({
      factionName: report.factionName ?? report.enemyLabel,
      outcome: report.outcome,
      objective: report.tactics?.objectiveId,
      objectiveAchieved: report.tactics?.objectiveAchieved,
      buildingsDamaged: report.damagedBuildings.length,
      enemyRouted: report.enemyRouted,
      looted,
      defendersCommitted: Number(report.defendersCommitted) || 0,
      defendersKilled: report.killed.length,
      defendersWounded: report.wounded.length,
    })
    : null;
  if (objectiveResult) report.result = objectiveResult.result;
  report.closingSummary = typeof report.closingSummary === 'string' && report.closingSummary.length > 0
    ? report.closingSummary
    : tacticalClosingSummary(report.encounterKind, report.outcome, report.factionName ?? report.enemyLabel, {
      looted,
      enemyRouted: report.enemyRouted,
      objective: report.tactics?.objectiveId,
      objectiveAchieved: report.tactics?.objectiveAchieved,
      result: report.result,
    });
  report.initialFriendlyPower = Math.max(1, Number(report.initialFriendlyPower) || Number(report.defendersCommitted) || 1);
  report.initialEnemyPower = Math.max(1, Number(report.initialEnemyPower) || Number(report.raidersCommitted) || 1);
  const migratedGrade = gradeTacticalBattle({
    encounterKind: report.encounterKind,
    result: report.result,
    friendlyPower: report.initialFriendlyPower,
    enemyPower: report.initialEnemyPower,
    defendersCommitted: Number(report.defendersCommitted) || 0,
    defendersKilled: report.killed.length + (report.externalAid?.killed ?? 0),
    defendersWounded: report.wounded.length + (report.externalAid?.wounded ?? 0),
    enemiesCommitted: Number(report.raidersCommitted) || 0,
    enemiesKilled: Number(report.raidersKilled) || 0,
    loot: report.loot,
  });
  report.grade = objectiveResult?.forcedGrade ?? migratedGrade.grade;
  report.gradeScore = migratedGrade.score;
  report.resourceDelta = report.resourceDelta && typeof report.resourceDelta === 'object'
    ? report.resourceDelta
    : Object.fromEntries(Object.entries(report.loot).map(([id, amount]) =>
      [id, report.encounterKind === 'raidDefense' ? -Number(amount) : Number(amount)]));
  return report;
}


function migrateResourceBag(
  raw: unknown,
  complete: boolean,
): Partial<Record<ResourceId, number>> {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const next: Partial<Record<ResourceId, number>> = {};
  for (const id of RESOURCE_IDS) {
    const amount = normalizedAmount(source[id]);
    if (complete || amount > 0) next[id] = amount;
  }

  const legacyFood = normalizedAmount(source.food);
  if (legacyFood > 0) next.grain = (next.grain ?? 0) + legacyFood;
  const legacyClothes = normalizedAmount(source.clothes);
  if (legacyClothes > 0) next.hideClothes = (next.hideClothes ?? 0) + legacyClothes;
  const game = normalizedAmount(source.game);
  if (game > 0) {
    next.meat = (next.meat ?? 0) + game * CONFIG.production.meatPerGame;
    next.hide = (next.hide ?? 0) + game * CONFIG.production.hidePerGame;
  }
  return next;
}

function migrateTributeItems(items: CourtTribute['items']): CourtTribute['items'] {
  const next: CourtTribute['items'] = {};
  for (const [legacyId, rawAmount] of Object.entries(items ?? {})) {
    const mappedId = legacyId === 'food' ? 'grain'
      : legacyId === 'clothes' ? 'hideClothes'
      : legacyId === 'game' ? 'meat'
      : legacyId;
    if (!RESOURCE_ID_SET.has(mappedId)) continue;
    const id = mappedId as ResourceId;
    const multiplier = legacyId === 'game' ? CONFIG.production.meatPerGame : 1;
    next[id] = (next[id] ?? 0) + normalizedAmount(rawAmount) * multiplier;
  }
  return next;
}

function migrateResourceTaxonomy(state: GameState): void {
  state.resources = migrateResourceBag(state.resources, true) as Record<ResourceId, number>;
  const legacyState = state as GameState & { tributeReserve?: unknown; tradeContractReserve?: unknown };
  state.tributeReserve = migrateResourceBag(legacyState.tributeReserve, false);
  state.tradeContractReserve = migrateResourceBag(legacyState.tradeContractReserve, false);
  for (const resident of state.residents) {
    resident.carrying = migrateResourceBag(resident.carrying, false);
  }
  for (const building of state.buildings ?? []) {
    building.inventory = migrateResourceBag(building.inventory, false);
    building.fermentBatches = migrateFermentBatches(building.fermentBatches);
  }
  if (state.courtTribute) state.courtTribute.items = migrateTributeItems(state.courtTribute.items);

  // 레거시 모달에는 삭제된 자원 ID와 이미 계산된 교환량이 들어 있을 수 있다.
  // 다시 열 수 있는 선택지만 닫아 두어 다음 틱에 현재 규칙으로 재생성한다.
  if (state.pendingChoice && ['trade', 'tribute', 'tradeContract', 'petition'].includes(state.pendingChoice.kind)) {
    state.pendingChoice = null;
  }
}

const CONTRACT_SEASONS = new Set<string>(['spring', 'summer', 'autumn', 'winter']);

// 정기거래 계약 정규화 — 삭제된 자원 ID나 없어진 세력을 참조하는 계약은 버린다.
// (계약고는 살아남은 계약 기준으로 뒤에서 다시 맞춰진다)
function sanitizeTradeContracts(state: GameState): void {
  const raw = Array.isArray(state.tradeContracts) ? state.tradeContracts : [];
  const kept: TradeContract[] = [];
  for (const entry of raw as Array<Partial<TradeContract>>) {
    if (!entry || typeof entry !== 'object') continue;
    if (typeof entry.factionName !== 'string') continue;
    if (!RESOURCE_ID_SET.has(String(entry.give)) || !RESOURCE_ID_SET.has(String(entry.get))) continue;
    if (!CONTRACT_SEASONS.has(String(entry.executeSeason))) continue;
    const giveAmt = Math.floor(normalizedAmount(entry.giveAmt));
    const getAmt = Math.floor(normalizedAmount(entry.getAmt));
    const durationYears = Math.floor(normalizedAmount(entry.durationYears));
    if (giveAmt < 1 || getAmt < 1 || durationYears < 1) continue;
    const signedYear = Math.max(1, Math.floor(normalizedAmount(entry.signedYear) || 1));
    kept.push({
      factionName: entry.factionName,
      give: entry.give as ResourceId, giveAmt,
      get: entry.get as ResourceId, getAmt,
      executeSeason: entry.executeSeason as TradeContract['executeSeason'],
      signedYear,
      durationYears,
      yearsExecuted: Math.min(durationYears, Math.floor(normalizedAmount(entry.yearsExecuted))),
      missedStreak: Math.floor(normalizedAmount(entry.missedStreak)),
      // 구버전·손상 저장은 체결 연도까지 정산한 것으로 본다 (되돌아가 이중 실행하지 않게)
      lastSettledYear: Math.max(signedYear, Math.floor(normalizedAmount(entry.lastSettledYear))),
    });
  }
  state.tradeContracts = kept;
  if (!state.tradeContractReserve || typeof state.tradeContractReserve !== 'object') {
    state.tradeContractReserve = {};
  }
}

const ANNALS_KINDS = new Set<AnnalsKind>([
  'legacy', 'founding', 'promotion', 'winter', 'disaster', 'raid', 'battle',
  'special', 'grant', 'population', 'building', 'trade', 'court', 'ending',
]);

// 연대기 정규화 — 손상된 항목은 버리고, 카운터는 유한값으로 강제한다.
// 마이그레이션 직후의 저장은 스냅샷이 비어 있으므로 현재 상태를 첫 건으로 찍는다.
function sanitizeChronicle(state: GameState): void {
  if (typeof state.settlementName !== 'string' || !state.settlementName.trim()) {
    state.settlementName = generateSettlementName(state.seed ?? 1);
  }
  // 행정단위 표기(촌·보·진·부)는 등급이 정한다 — 저장에는 밑이름만 남긴다.
  state.settlementName = normalizeSettlementNameInput(state.settlementName) ||
    generateSettlementName(state.seed ?? 1);
  const pending = state.pendingSettlementRename;
  state.pendingSettlementRename =
    pending && typeof pending === 'object' && typeof pending.requestedName === 'string' &&
    pending.requestedName.trim() && Number.isFinite(pending.sentDay) && Number.isFinite(pending.dueDay)
      ? {
          requestedName: pending.requestedName.trim().slice(0, 12),
          sentDay: Math.max(1, Math.floor(pending.sentDay)),
          dueDay: Math.max(1, Math.floor(pending.dueDay)),
        }
      : null;
  state.settlementRenameCooldownUntil = Math.max(0, Math.floor(
    Number.isFinite(state.settlementRenameCooldownUntil) ? state.settlementRenameCooldownUntil : 0));

  const rawAnnals = Array.isArray(state.annals) ? state.annals : [];
  state.annals = rawAnnals.filter((entry): entry is AnnalsEntry =>
    entry != null && typeof entry === 'object' &&
    typeof entry.text === 'string' && entry.text.length > 0 &&
    Number.isFinite(entry.day) && ANNALS_KINDS.has(entry.kind));

  const stats = state.lifetimeStats;
  const finiteCount = (value: unknown): number =>
    Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
  const causes = stats && typeof stats === 'object' && stats.deathsByCause && typeof stats.deathsByCause === 'object'
    ? stats.deathsByCause
    : {} as Record<string, number>;
  state.lifetimeStats = {
    trackingSinceDay: stats && Number.isFinite(stats.trackingSinceDay)
      ? Math.max(1, Math.floor(stats.trackingSinceDay))
      : Math.max(1, Math.floor(state.day ?? 1)),
    births: finiteCount(stats?.births),
    deathsByCause: {
      combat: finiteCount(causes.combat),
      starvation: finiteCount(causes.starvation),
      cold: finiteCount(causes.cold),
      disease: finiteCount(causes.disease),
      other: finiteCount(causes.other),
    },
    raidsRepelled: finiteCount(stats?.raidsRepelled),
    raidsSuffered: finiteCount(stats?.raidsSuffered),
    tradesCompleted: finiteCount(stats?.tradesCompleted),
    grantsReceived: finiteCount(stats?.grantsReceived),
  };

  const rawSnapshots = Array.isArray(state.yearlySnapshots) ? state.yearlySnapshots : [];
  const seenYears = new Set<number>();
  state.yearlySnapshots = rawSnapshots
    .filter((snapshot): snapshot is YearlySnapshot =>
      snapshot != null && typeof snapshot === 'object' && Number.isFinite(snapshot.year))
    .filter(snapshot => {
      const year = Math.floor(snapshot.year);
      if (seenYears.has(year)) return false;
      seenYears.add(year);
      return true;
    })
    .map(snapshot => ({
      year: Math.floor(snapshot.year),
      population: finiteCount(snapshot.population),
      food: finiteCount(snapshot.food),
      fuelHeat: finiteCount(snapshot.fuelHeat),
      combatReadyResidents: finiteCount(snapshot.combatReadyResidents),
      buildings: finiteCount(snapshot.buildings),
      fieldTiles: finiteCount(snapshot.fieldTiles),
      paddyTiles: finiteCount(snapshot.paddyTiles),
      wallSegments: finiteCount(snapshot.wallSegments),
      silver: finiteCount(snapshot.silver),
    }));
  if (state.yearlySnapshots.length === 0) recordYearlySnapshot(state);
}

function isGender(value: unknown): value is Gender {
  return value === 'male' || value === 'female';
}

function stableGenderForResident(resident: Pick<Resident, 'id' | 'name'>): Gender {
  let hash = (resident.id * 2166136261) >>> 0;
  for (let i = 0; i < resident.name.length; i++) {
    hash ^= resident.name.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return (hash & 1) === 0 ? 'female' : 'male';
}

function migrateResidentGender(state: GameState): void {
  for (const resident of state.residents as Array<Resident & { gender?: unknown }>) {
    if (!isGender(resident.gender)) {
      resident.gender = stableGenderForResident(resident);
    }
  }
}

function migrateResidentManualOrders(state: GameState): void {
  for (const resident of state.residents) {
    const mutable = resident as Resident & { manualOrder?: Resident['manualOrder'] };
    const order = mutable.manualOrder as unknown;
    const valid =
      order == null ||
      (typeof order === 'object' &&
        ('kind' in order) &&
        ((order as { kind?: unknown }).kind === 'move' || (order as { kind?: unknown }).kind === 'work') &&
        Number.isInteger((order as { x?: unknown }).x) &&
        Number.isInteger((order as { y?: unknown }).y));
    if (!valid || mutable.manualOrder === undefined) resident.manualOrder = null;
  }
}

function migrateResidentAssignedBuildingIds(state: GameState): void {
  for (const resident of state.residents as Array<Resident & { assignedBuildingId?: unknown }>) {
    if (!Number.isInteger(resident.assignedBuildingId)) resident.assignedBuildingId = null;
  }
}

function migrateResidentHomeBuildingIds(state: GameState): void {
  for (const resident of state.residents as Array<Resident & { homeBuildingId?: unknown }>) {
    if (!Number.isInteger(resident.homeBuildingId)) resident.homeBuildingId = null;
  }
}

function migrateResidentCarts(state: GameState): void {
  for (const resident of state.residents as Array<Resident & { cartEquipped?: unknown }>) {
    resident.cartEquipped = resident.cartEquipped === true;
    if (resident.cartEquipped && (!resident.alive || resident.job !== 'hauler')) {
      resident.cartEquipped = false;
      state.resources.carts += 1;
    }
  }
}

function migrateResidentHaulTasks(state: GameState): void {
  for (const resident of state.residents as Array<Resident & { haulTask?: Resident['haulTask'] }>) {
    const task = resident.haulTask;
    const valid = task != null &&
      Number.isInteger(task.sourceBuildingId) &&
      RESOURCE_ID_SET.has(task.resource) &&
      Number.isFinite(task.amount) && task.amount > 0;
    if (!valid) resident.haulTask = null;
  }
}

function migrateWeaponAssignments(state: GameState): void {
  const legacy = state as GameState & {
    weaponAssignments?: unknown;
    weaponAllocationMode?: unknown;
  };
  if (!legacy.weaponAssignments || typeof legacy.weaponAssignments !== 'object') {
    state.weaponAssignments = {};
  }
  state.weaponAllocationMode = legacy.weaponAllocationMode === 'manual' ? 'manual' : 'auto';
  reconcileWeaponAssignments(state);
}

function migrateMountAssignments(state: GameState): void {
  const legacy = state as GameState & { mountAssignments?: unknown };
  if (!legacy.mountAssignments || typeof legacy.mountAssignments !== 'object') {
    state.mountAssignments = {};
  }
  reconcileMountAssignments(state);
}

function migrateExpeditionState(state: GameState): void {
  const legacy = state as GameState & { expedition?: unknown; raidHold?: unknown };
  const raw = legacy.expedition;
  if (!raw || typeof raw !== 'object') {
    state.expedition = null;
  } else {
    const expedition = raw as GameState['expedition'];
    const validPhase = expedition?.phase === 'muster' || expedition?.phase === 'march' ||
      expedition?.phase === 'engage' || expedition?.phase === 'return';
    const validKind = expedition?.kind === 'lairAssault' || expedition?.kind === 'predatorHunt';
    if (!expedition || !validPhase || !validKind || !Array.isArray(expedition.memberIds) ||
        !Number.isFinite(expedition.x) || !Number.isFinite(expedition.y)) {
      state.expedition = null;
    } else {
      expedition.memberIds = [...new Set(expedition.memberIds.filter(id => Number.isInteger(id) &&
        state.residents.some(resident => resident.id === id && resident.alive)))];
      expedition.path = Array.isArray(expedition.path) ? expedition.path : [];
      expedition.trail = Array.isArray(expedition.trail) ? expedition.trail.slice(-30) : [];
      expedition.px = Number.isFinite(expedition.px) ? expedition.px : expedition.x;
      expedition.py = Number.isFinite(expedition.py) ? expedition.py : expedition.y;
      expedition.musterX = Number.isFinite(expedition.musterX) ? expedition.musterX : expedition.x;
      expedition.musterY = Number.isFinite(expedition.musterY) ? expedition.musterY : expedition.y;
      expedition.speed = Number.isFinite(expedition.speed) ? Math.max(0.25, expedition.speed) : 1.25;
      expedition.ticks = Number.isFinite(expedition.ticks) ? Math.max(0, expedition.ticks) : 0;
      if (expedition.externalAid && typeof expedition.externalAid.factionName === 'string') {
        const committed = Math.max(0, Math.floor(expedition.externalAid.committed || 0));
        const killed = Math.min(committed, Math.max(0, Math.floor(expedition.externalAid.killed || 0)));
        expedition.externalAid = {
          factionName: expedition.externalAid.factionName,
          committed,
          killed,
          wounded: Math.min(committed - killed, Math.max(0, Math.floor(expedition.externalAid.wounded || 0))),
        };
      } else {
        delete expedition.externalAid;
      }
      state.expedition = expedition.memberIds.length >= 1 ? expedition : null;
    }
  }

  const hold = legacy.raidHold;
  if (!hold || typeof hold !== 'object') {
    state.raidHold = null;
  } else {
    const candidate = hold as GameState['raidHold'];
    state.raidHold = candidate && Number.isFinite(candidate.power) && Number.isFinite(candidate.ticksRemaining) &&
      typeof candidate.faction === 'string' &&
      (candidate.expeditionOrder === 'return' || candidate.expeditionOrder === 'continue')
      ? { ...candidate, ticksRemaining: Math.max(0, candidate.ticksRemaining) }
      : null;
  }
  if (state.expedition) {
    for (const resident of state.residents) {
      if (state.expedition.memberIds.includes(resident.id)) resident.task = '토벌 출정';
    }
  }
}

function normalizeSiegeState(state: GameState): void {
  const raw = (state as GameState & { siegeState?: unknown }).siegeState;
  if (!raw || typeof raw !== 'object' || !state.raiders) {
    state.siegeState = null;
    return;
  }
  const candidate = raw as NonNullable<GameState['siegeState']>;
  const phases = new Set(['evacuation', 'encirclement', 'wallCombat', 'sortie', 'withdrawal']);
  const stances = new Set(['hold', 'wall', 'field']);
  if (!phases.has(candidate.phase) || !stances.has(candidate.stance) ||
      typeof candidate.faction !== 'string' || !Number.isFinite(candidate.raiderPower) ||
      !Number.isFinite(candidate.enemySupply) || !Number.isFinite(candidate.evacuationDeadlineTick)) {
    state.siegeState = null;
    return;
  }
  const livingIds = new Set(state.residents.filter(resident => resident.alive).map(resident => resident.id));
  const buildingIds = new Set(state.buildings.map(building => building.id));
  const idList = (value: unknown, valid: ReadonlySet<number>): number[] => Array.isArray(value)
    ? [...new Set(value.filter((id): id is number => Number.isInteger(id) && valid.has(id)))]
    : [];
  const estimate = candidate.enemySupplyEstimate;
  const plunderTargetIds = idList(candidate.plunderTargetIds, buildingIds);
  const min = Number.isFinite(estimate?.min) ? Math.max(0, Math.floor(estimate.min)) : 0;
  const max = Number.isFinite(estimate?.max) ? Math.max(min, Math.ceil(estimate.max)) : min;
  const loot: Partial<Record<ResourceId, number>> = {};
  if (candidate.loot && typeof candidate.loot === 'object') {
    for (const [resource, amount] of Object.entries(candidate.loot) as Array<[ResourceId, number]>) {
      if (RESOURCE_ID_SET.has(resource) && Number.isFinite(amount) && amount > 0) loot[resource] = amount;
    }
  }
  state.siegeState = {
    ...candidate,
    raiderPower: Math.max(0, candidate.raiderPower),
    enemySupply: Math.max(0, candidate.enemySupply),
    enemySupplyEstimate: { min, max },
    intelLevel: Number.isFinite(candidate.intelLevel) ? Math.max(0, Math.min(4, Math.floor(candidate.intelLevel))) : 0,
    warned: candidate.warned === true,
    startedDay: Number.isFinite(candidate.startedDay) ? Math.max(1, Math.floor(candidate.startedDay)) : state.day,
    lastProcessedDay: Number.isFinite(candidate.lastProcessedDay)
      ? Math.min(state.day, Math.max(0, Math.floor(candidate.lastProcessedDay))) : state.day,
    lastStanceChangeDay: Number.isFinite(candidate.lastStanceChangeDay)
      ? Math.max(0, Math.floor(candidate.lastStanceChangeDay)) : state.day,
    evacuationDeadlineTick: Math.max(0, Math.floor(candidate.evacuationDeadlineTick)),
    defenderIds: idList(candidate.defenderIds, livingIds),
    strandedResidentIds: idList(candidate.strandedResidentIds, livingIds),
    plunderTargetIds,
    plunderedTargetIds: idList(candidate.plunderedTargetIds, buildingIds),
    activePlunderTargetId: Number.isInteger(candidate.activePlunderTargetId) &&
      plunderTargetIds.includes(candidate.activePlunderTargetId as number)
      ? candidate.activePlunderTargetId : undefined,
    // 약탈조 현재 좌표는 RaiderBand에 남으므로, 로드 뒤 경로는 현 지형에서 다시 계산한다.
    plunderPath: [],
    loot,
    protectedInterior: Array.isArray(candidate.protectedInterior)
      ? [...new Set(candidate.protectedInterior.filter((tile): tile is string => typeof tile === 'string' && /^\d+,\d+$/.test(tile)))]
      : [],
    topologyRevision: Number.isFinite(candidate.topologyRevision)
      ? Math.max(0, Math.floor(candidate.topologyRevision)) : state.defenseTopologyRevision,
    breachTargetId: Number.isInteger(candidate.breachTargetId) &&
      buildingIds.has(candidate.breachTargetId as number)
      ? candidate.breachTargetId : undefined,
    wallEngagement: Number.isFinite(candidate.wallEngagement?.day) &&
      (candidate.wallEngagement?.mode === 'automatic' || candidate.wallEngagement?.mode === 'manual')
      ? {
          day: Math.min(state.day, Math.max(0, Math.floor(candidate.wallEngagement.day))),
          mode: candidate.wallEngagement.mode,
        }
      : undefined,
  };
  if (state.siegeState.phase === 'sortie' && !state.battle && !state.tacticalBattle) state.siegeState = null;
}

export function saveGame(state: GameState, slot = 1): boolean {
  try {
    localStorage.setItem(saveSlotStorageKey(slot), JSON.stringify({
      ...state,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAt: Date.now(),
    }));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(slot = 1): GameState | null {
  try {
    const raw = localStorage.getItem(saveSlotStorageKey(slot));
    if (!raw) return null;
    const decoded = JSON.parse(raw) as RawSave;
    const parsed = migrateToCurrent(decoded) as unknown as GameState;
    const legacyHuntRecoveryNeeded = (parsed as unknown as RawSave).legacyHuntRecoveryNeeded === true;
    // 최소한의 유효성 검사 (구버전 저장은 무시)
    if (!parsed.map || !parsed.residents || !parsed.resources || !parsed.buildings) return null;
    if (parsed.subTick == null || parsed.residents.some(r => r.x == null || r.px == null)) return null;
    for (const resident of parsed.residents) {
      normalizeResidentWearables(resident);
      const escapeTower = Number.isInteger(resident.watchtowerEscapeTowerId)
        ? parsed.buildings.find(building => building.id === resident.watchtowerEscapeTowerId && building.type === 'watchtower')
        : undefined;
      if (!resident.alive || !escapeTower || !Number.isFinite(resident.watchtowerEscapeDeadlineTick)) {
        delete resident.watchtowerEscapeTowerId;
        delete resident.watchtowerEscapeDeadlineTick;
        delete resident.watchtowerEscapeHasRoute;
      } else {
        resident.assignedBuildingId = null;
        resident.watchtowerEscapeDeadlineTick = Math.max(0, Math.floor(resident.watchtowerEscapeDeadlineTick!));
        resident.watchtowerEscapeHasRoute = resident.watchtowerEscapeHasRoute === true;
        resident.path = Array.isArray(resident.path) ? resident.path : [];
      }
      if (typeof resident.origin !== 'string' || resident.origin.trim().length === 0) delete resident.origin;
      else resident.origin = resident.origin.trim();
      if (resident.religiousVocation !== 'shaman' && resident.religiousVocation !== 'monk') {
        delete resident.religiousVocation;
      }
      if (!Number.isInteger(resident.religiousMentorId)) delete resident.religiousMentorId;
      if (resident.stage === 'youth') {
        resident.youthActivity = resident.youthActivity === 'school' ? 'school' : 'work';
        resident.education = typeof resident.education === 'number' && Number.isFinite(resident.education)
          ? Math.max(0, resident.education)
          : 0;
        if (resident.religiousVocation === 'monk') {
          resident.job = 'idle';
          resident.youthActivity = 'work';
          resident.assignedBuildingId = null;
          resident.task = '동자승';
        } else if (resident.youthActivity === 'school' || !isYouthWorkJob(resident.job)) {
          resident.job = 'idle';
          resident.assignedBuildingId = null;
        }
      } else {
        delete resident.youthActivity;
        if (resident.alive && resident.religiousVocation) {
          resident.job = resident.religiousVocation;
        }
      }
    }
    normalizeResidentFamilyReferences(parsed);
    const rawAmbientSpeech = parsed.ambientSpeech;
    parsed.ambientSpeech = {
      lastProcessedDay: Number.isInteger(rawAmbientSpeech?.lastProcessedDay)
        ? Math.max(0, rawAmbientSpeech.lastProcessedDay)
        : 0,
      consumedSlotIds: Array.isArray(rawAmbientSpeech?.consumedSlotIds)
        ? rawAmbientSpeech.consumedSlotIds.filter((id): id is string => typeof id === 'string').slice(-8)
        : [],
      deliveredRumorIds: Array.isArray(rawAmbientSpeech?.deliveredRumorIds)
        ? rawAmbientSpeech.deliveredRumorIds.filter((id): id is string => typeof id === 'string').slice(-32)
        : [],
      recentLines: Array.isArray(rawAmbientSpeech?.recentLines)
        ? rawAmbientSpeech.recentLines.filter(entry =>
          entry && typeof entry.id === 'string' && Number.isFinite(entry.day)).slice(-24)
        : [],
      recentFacts: Array.isArray(rawAmbientSpeech?.recentFacts)
        ? rawAmbientSpeech.recentFacts.filter(entry =>
          entry && typeof entry.id === 'string' && Number.isFinite(entry.day)).slice(-16)
        : [],
      lastDietVarietyScore: Number.isFinite(rawAmbientSpeech?.lastDietVarietyScore)
        ? Math.min(1, Math.max(0, rawAmbientSpeech.lastDietVarietyScore))
        : 1,
      lastDominantFood: typeof rawAmbientSpeech?.lastDominantFood === 'string' &&
        RESOURCE_ID_SET.has(rawAmbientSpeech.lastDominantFood)
        ? rawAmbientSpeech.lastDominantFood as ResourceId
        : undefined,
    };
    if (!('raiders' in parsed)) return null;
    if (!Object.prototype.hasOwnProperty.call(parsed, 'battle')) parsed.battle = null;
    if (!Array.isArray(parsed.battleScars)) parsed.battleScars = [];
    if (!Object.prototype.hasOwnProperty.call(parsed, 'tacticalBattle')) parsed.tacticalBattle = null;
    if (!Object.prototype.hasOwnProperty.call(parsed, 'tacticalBattleReport')) parsed.tacticalBattleReport = null;
    const tacticalBattleWasPresent = decoded.tacticalBattle != null;
    parsed.tacticalBattle = migrateTacticalBattle(parsed.tacticalBattle, parsed);
    const tacticalRecoveryNeeded = tacticalBattleWasPresent && parsed.tacticalBattle == null && !legacyHuntRecoveryNeeded;
    parsed.tacticalBattleReport = migrateTacticalBattleReport(parsed.tacticalBattleReport);
    if (parsed.tacticalBattle) {
      parsed.tacticalBattle.orientation = parsed.tacticalBattle.orientation === 'assault' ? 'assault' : 'defense';
      const assault = parsed.tacticalBattle.orientation === 'assault';
      if (!Array.isArray(parsed.tacticalBattle.preparationEvents)) parsed.tacticalBattle.preparationEvents = [];
      for (const action of parsed.tacticalBattle.prepActions) {
        if (action.selected == null) action.selected = action.applied;
        if (!assault && (action.id === 'setAmbush' || action.id === 'prepareVolley')) action.cost = 2;
      }
      if (!assault && !parsed.tacticalBattle.prepActions.some(action => action.id === 'preliminaryBombardment')) {
        parsed.tacticalBattle.prepActions.push({
          id: 'preliminaryBombardment',
          label: '사전포격',
          cost: 3,
          selected: false,
          applied: false,
        });
      }
      const totalPower = parsed.tacticalBattle.raiderGroups.reduce((sum, group) => sum + group.power, 0);
      const estimatedTotal = Math.max(3, Math.round(parsed.tacticalBattle.originalPower / CONFIG.tacticalBattle.raiderPowerPerFighter));
      for (const group of parsed.tacticalBattle.raiderGroups) {
        if (group.count == null) {
          group.count = Math.max(1, Math.round(estimatedTotal * (totalPower > 0 ? group.power / totalPower : 1 / 3)));
        }
        if (group.killed == null) group.killed = 0;
        if (group.confused == null) group.confused = false;
        if (group.engagementsInZone == null) group.engagementsInZone = 0;
        if (!assault && group.kind === 'flankers' && group.flankPlan !== 'rearAssault' && group.flankPlan !== 'breakthrough') {
          group.flankPlan = 'breakthrough';
        }
        if (group.rearAssault == null) group.rearAssault = false;
        if (group.flankPlanRevealed == null) group.flankPlanRevealed = false;
      }
      const preparedAmbush = parsed.tacticalBattle.prepActions.some(action =>
        action.id === 'setAmbush' && action.applied);
      for (const group of parsed.tacticalBattle.defenderGroups) {
        if (group.line !== 'front' && group.line !== 'middle' && group.line !== 'rear') {
          group.line = defaultMigratedFormationLine(group.role, group.weapon);
        }
        if (group.ambushed != null) continue;
        group.ambushed = !assault && group.kind === 'hunter' && group.zoneId === 'approach' && preparedAmbush;
        const enemyHere = parsed.tacticalBattle.raiderGroups.some(raider =>
          raider.zoneId === group.zoneId && raider.intent !== 'withdraw' && raider.power > 0);
        if (group.command === 'ambush' && !group.ambushed && enemyHere) group.command = 'hold';
      }
      for (const report of parsed.tacticalBattle.reports) {
        if (report.raidersKilled == null) report.raidersKilled = 0;
      }
      if (assault) {
        parsed.tacticalBattle.assaultKind ??= 'banditLair';
        if (parsed.tacticalBattle.assaultKind === 'predatorHunt') {
          parsed.tacticalBattle.prepActions = parsed.tacticalBattle.prepActions
            .filter(action => action.id !== 'splitDrivers');
          parsed.tacticalBattle.huntPredatorKind ??= parsed.expedition?.predatorKind ?? 'wolf';
          if (parsed.tacticalBattle.huntPredatorKind === 'tiger') {
            parsed.tacticalBattle.huntTigerTier ??= tigerTierFromStrength(parsed.tacticalBattle.originalPower);
            for (const group of parsed.tacticalBattle.raiderGroups) {
              if (group.beastKind === 'tiger') group.tigerTier ??= parsed.tacticalBattle.huntTigerTier;
            }
          }
          parsed.tacticalBattle.huntPredatorState ??= 'hidden';
          parsed.tacticalBattle.huntEncirclement ??= 0;
          parsed.tacticalBattle.huntEngagements ??= Math.max(0, parsed.tacticalBattle.round - 1);
          parsed.tacticalBattle.huntDriversSplit = false;
          parsed.tacticalBattle.huntTrapSet ??= false;
          parsed.tacticalBattle.huntBaitPlaced ??= false;
          parsed.tacticalBattle.huntLeaderKilled ??= false;
          parsed.tacticalBattle.huntCornered ??= false;
          parsed.tacticalBattle.huntCounterattackCount ??= 0;
          parsed.tacticalBattle.huntDetachmentSerial ??= 0;
          parsed.tacticalBattle.huntOpenSectorRounds ??= Object.fromEntries(
            parsed.tacticalBattle.zones
              .filter(zone => zone.id !== 'huntDen')
              .map(zone => [zone.id, 0]),
          );
          const huntSectorIds = new Set(parsed.tacticalBattle.zones
            .filter(zone => zone.id !== 'huntDen').map(zone => zone.id));
          if (!parsed.tacticalBattle.huntBaitZoneId ||
              !huntSectorIds.has(parsed.tacticalBattle.huntBaitZoneId)) {
            parsed.tacticalBattle.huntBaitZoneId = undefined;
          }
          if (!parsed.tacticalBattle.huntTrapZoneId ||
              !huntSectorIds.has(parsed.tacticalBattle.huntTrapZoneId)) {
            parsed.tacticalBattle.huntTrapZoneId = undefined;
            parsed.tacticalBattle.huntTrapSet = false;
          }
          for (const group of parsed.tacticalBattle.defenderGroups) group.huntOriginGroupId ??= group.id;
        } else {
          parsed.tacticalBattle.leaderEscapeBlocked ??= false;
          parsed.tacticalBattle.leaderEscaped ??= false;
          parsed.tacticalBattle.assaultFireDamage ??= 0;
        }
      }
    }
    if (parsed.difficulty !== 'easy' && parsed.difficulty !== 'hard' && parsed.difficulty !== 'normal') {
      parsed.difficulty = 'normal';
    }
    parsed.worldSetup = normalizeWorldSetupSnapshot(parsed.worldSetup, parsed.difficulty);
    const actualMapSize = mapSizeForDimensions(parsed.map[0]?.length ?? 0, parsed.map.length);
    if (actualMapSize) parsed.worldSetup.mapSize = actualMapSize;
    ensureMineralDeposits(parsed.map);
    ensureTidalFlatStocks(parsed.map);
    ensureFishingGrounds(parsed);
    normalizeFishingBoats(parsed);
    normalizeSubsurfaceState(parsed);
    ensureForestGrowth(parsed.map);
    if (parsed.battle && !parsed.battle.mode) parsed.battle.mode = 'garrison';
    if (parsed.battle && !parsed.battle.location) {
      parsed.battle.location = parsed.battle.mode === 'levy' ? 'village' : 'outskirts';
    }
    if (!parsed.lastTradeByFaction) parsed.lastTradeByFaction = {};
    const currentTradeSeason = Math.floor((Math.max(1, parsed.day) - 1) / CONFIG.time.seasonDays);
    if (parsed.tradeCapacitySeason == null || parsed.tradeCapacitySeason !== currentTradeSeason) {
      parsed.tradeCapacitySeason = currentTradeSeason;
      parsed.tradeCapacityUsed = {};
    } else if (!parsed.tradeCapacityUsed || typeof parsed.tradeCapacityUsed !== 'object') {
      parsed.tradeCapacityUsed = {};
    }
    sanitizeTradeContracts(parsed);
    sanitizeChronicle(parsed);
    if (parsed.lastImmigrationDay == null) parsed.lastImmigrationDay = -999;
    if (!Number.isFinite(parsed.lastKimjangYear)) parsed.lastKimjangYear = 0;
    ensureIncidentState(parsed);
    parsed.pendingDisasters = normalizePendingDisasters(parsed.pendingDisasters);
    const buildingIds = new Set(parsed.buildings.map(building => building.id));
    const residentIds = new Set(parsed.residents.filter(resident => resident.alive).map(resident => resident.id));
    parsed.pendingDisasters = parsed.pendingDisasters.flatMap(disaster => {
      if (disaster.id === 'fire') {
        const fireSites = (disaster.fireSites ?? []).filter(site => buildingIds.has(site.buildingId));
        return fireSites.length > 0 ? [{ ...disaster, fireSites }] : [];
      }
      if (disaster.id === 'mineCollapse') {
        const mineId = disaster.targetBuildingIds?.[0];
        const mine = mineId == null ? undefined : parsed.buildings.find(building =>
          building.id === mineId && building.type === 'deepMine');
        if (!mine) return [];
        if (disaster.choiceId === 'warning') return [{ ...disaster, trappedResidentIds: undefined }];
        const trappedResidentIds = (disaster.trappedResidentIds ?? []).filter(id => residentIds.has(id));
        return trappedResidentIds.length > 0 ? [{ ...disaster, trappedResidentIds }] : [];
      }
      return [disaster];
    });
    const activeFireSiteIds = new Set(
      parsed.pendingDisasters
        .filter(disaster => disaster.id === 'fire')
        .flatMap(disaster => disaster.fireSites?.map(site => site.buildingId) ?? []),
    );
    for (const resident of parsed.residents) {
      const fireResponse = resident.fireResponse;
      if (!fireResponse) continue;
      const valid = activeFireSiteIds.has(fireResponse.buildingId) &&
        (fireResponse.sourceKind === 'well' || fireResponse.sourceKind === 'river' ||
          fireResponse.sourceKind === 'lake') &&
        (fireResponse.phase === 'toWater' || fireResponse.phase === 'toFire') &&
        Number.isFinite(fireResponse.sourceX) && Number.isFinite(fireResponse.sourceY) &&
        Number.isFinite(fireResponse.carriedWater) && fireResponse.carriedWater >= 0 &&
        (fireResponse.sourceKind !== 'well' || buildingIds.has(fireResponse.sourceBuildingId ?? -1));
      if (!valid) {
        delete resident.fireResponse;
        continue;
      }
      fireResponse.sourceX = Math.floor(fireResponse.sourceX);
      fireResponse.sourceY = Math.floor(fireResponse.sourceY);
      fireResponse.carriedWater = Math.max(0, fireResponse.carriedWater);
    }
    const trappedMineByResidentId = new Map<number, number>();
    for (const disaster of parsed.pendingDisasters) {
      if (disaster.id !== 'mineCollapse' || disaster.choiceId === 'warning') continue;
      const mineId = disaster.targetBuildingIds?.[0];
      if (mineId == null) continue;
      for (const residentId of disaster.trappedResidentIds ?? []) {
        trappedMineByResidentId.set(residentId, mineId);
      }
    }
    for (const resident of parsed.residents) {
      const mineId = trappedMineByResidentId.get(resident.id);
      if (resident.alive && mineId != null) resident.trappedInMineId = mineId;
      else delete resident.trappedInMineId;
    }
    if (parsed.pendingChoice?.kind === 'mineCollapse' &&
        !parsed.pendingDisasters.some(disaster =>
          disaster.id === 'mineCollapse' && disaster.choiceId === 'awaitingRescueChoice')) {
      parsed.pendingChoice = null;
    }
    parsed.lastSpringFloodYear = Number.isFinite(Number(parsed.lastSpringFloodYear))
      ? Math.max(0, Math.floor(Number(parsed.lastSpringFloodYear)))
      : 0;
    parsed.lastSnowDamageYear = Number.isFinite(Number(parsed.lastSnowDamageYear))
      ? Math.max(0, Math.floor(Number(parsed.lastSnowDamageYear)))
      : 0;
    ensureForeignSiteState(parsed);
    if (!Array.isArray(parsed.territoryViolations)) parsed.territoryViolations = [];
    migrateResourceTaxonomy(parsed);
    // 구버전 저장 마이그레이션: 없는 필드는 기본값으로 채운다
    if (!parsed.relations) parsed.relations = initRelations();
    normalizeDiplomaticFigures(parsed);
    normalizeDiplomacyState(parsed);
    if (!parsed.habitats) {
      // 사냥터 지형이 있던 구버전: 사냥터를 숲으로 바꾸고 시드로 서식지를 새로 뽑는다
      let cx = Math.floor(parsed.map[0].length / 2);
      let cy = Math.floor(parsed.map.length / 2);
      for (const row of parsed.map) {
        for (const tile of row) {
          if ((tile.terrain as string) === 'hunting') tile.terrain = 'forest';
          if (tile.terrain === 'center') { cx = tile.x; cy = tile.y; }
        }
      }
      parsed.habitats = spawnAnimalHabitats(
        parsed.map, cx, cy, makeRng(parsed.seed ?? 1),
        parsed.worldSetup.effective.habitatChance,
      );
    }
    for (const habitat of parsed.habitats) rebalanceLoadedHabitatReserve(parsed.map, habitat);
    // 승격 없는 구버전: 옛 승리(진보 승격)를 이뤘다면 보에서 이어간다
    if (!Object.prototype.hasOwnProperty.call(parsed, 'rank')) {
      parsed.rank = parsed.gameOver?.won ? 'bo' : 'settlement';
    }
    parsed.specialItems = normalizeSpecialItemInventory(parsed.specialItems);
    parsed.discoveredSpecialItems = normalizeDiscoveredSpecialItems(parsed.discoveredSpecialItems);
    parsed.royalPlaqueBuildingId = Number.isInteger(parsed.royalPlaqueBuildingId) && Number(parsed.royalPlaqueBuildingId) > 0
      ? Number(parsed.royalPlaqueBuildingId)
      : null;
    parsed.artifactWeaponAssignments = normalizeArtifactWeaponAssignments(parsed.artifactWeaponAssignments);
    const courtGrantArtifactMisses = Math.floor(Number(parsed.courtGrantArtifactMisses));
    parsed.courtGrantArtifactMisses = Number.isFinite(courtGrantArtifactMisses)
      ? Math.max(0, courtGrantArtifactMisses)
      : 0;
    if (parsed.pendingPromotionNotice !== 'bo' && parsed.pendingPromotionNotice !== 'jin' && parsed.pendingPromotionNotice !== 'bu') {
      parsed.pendingPromotionNotice = null;
    }
    if (parsed.tributePaidStreak == null) parsed.tributePaidStreak = 0;
    parsed.unlockedLivestock = Array.isArray(parsed.unlockedLivestock)
      ? parsed.unlockedLivestock.filter(isImplementedLivestockId)
      : [];
    parsed.defenseTopologyRevision = Number.isFinite(Number(parsed.defenseTopologyRevision))
      ? Math.max(0, Math.floor(Number(parsed.defenseTopologyRevision)))
      : 0;
    if (!parsed.unlockedLivestock.includes('chicken')) parsed.unlockedLivestock.push('chicken');
    for (const building of parsed.buildings) {
      normalizeCisternState(building);
      if (building.built) building.repairing = false;
      const validGateWallType = building.gateWallType === 'palisade' ||
        building.gateWallType === 'earthFort' || building.gateWallType === 'stoneWall';
      if (building.type === 'gate') {
        building.gateWallType = validGateWallType ? building.gateWallType : 'palisade';
        delete building.gateConversion;
      } else if (building.type === 'palisade' || building.type === 'earthFort' || building.type === 'stoneWall') {
        const conversion = building.gateConversion;
        const progress = Number(conversion?.progress);
        const required = Number(conversion?.required);
        if (conversion && conversion.wallType === building.type && Number.isFinite(progress) &&
            Number.isFinite(required) && required > 0 && conversion.paidCost && typeof conversion.paidCost === 'object') {
          building.gateWallType = building.type;
          conversion.progress = Math.max(0, progress);
          conversion.required = required;
          conversion.paidCost = Object.fromEntries(Object.entries(conversion.paidCost)
            .filter(([, amount]) => typeof amount === 'number' && Number.isFinite(amount) && amount >= 0));
        } else {
          delete building.gateConversion;
          delete building.gateWallType;
        }
      } else {
        delete building.gateConversion;
        delete building.gateWallType;
      }
      if (building.type === 'palisade' || building.type === 'earthFort' ||
          building.type === 'stoneWall' || building.type === 'gate') {
        initializeWallIntegrity(building);
        if (building.structureRepair) {
          const repair = building.structureRepair;
          const progress = Number(repair.progress);
          const required = Number(repair.required);
          if (!building.breached || !Number.isFinite(progress) || !Number.isFinite(required) || required <= 0 ||
              !repair.paidCost || typeof repair.paidCost !== 'object') {
            delete building.structureRepair;
          } else {
            repair.progress = Math.max(0, Math.min(required, progress));
            repair.required = required;
            repair.paidCost = Object.fromEntries(Object.entries(repair.paidCost)
              .filter(([, amount]) => typeof amount === 'number' && Number.isFinite(amount) && amount >= 0));
          }
        }
      } else if (building.type === 'watchtower') {
        initializeWatchtowerIntegrity(building);
        delete building.breached;
        delete building.structureRepair;
        building.watchtowerLastShotTick = Number.isFinite(building.watchtowerLastShotTick)
          ? Math.floor(building.watchtowerLastShotTick!) : undefined;
        building.watchtowerDamageDay = Number.isFinite(building.watchtowerDamageDay)
          ? Math.max(0, Math.floor(building.watchtowerDamageDay!)) : undefined;
        building.watchtowerDamageToday = Number.isFinite(building.watchtowerDamageToday)
          ? Math.max(0, Math.min(CONFIG.watchtower.bowDailyDamageCap, building.watchtowerDamageToday!)) : 0;
        building.watchtowerHadTarget = building.watchtowerHadTarget === true;
      } else {
        delete building.structureIntegrity;
        delete building.structureIntegrityMax;
        delete building.breached;
        delete building.structureRepair;
      }
      if (building.workOrder) {
        const order = building.workOrder;
        const validKind = order.kind === 'demolish' || order.kind === 'relocate';
        const validPhase = order.phase === 'dismantling' || order.phase === 'rebuilding';
        const progress = Number(order.progress);
        const required = Number(order.required);
        const destination = normalizePastureArea(order.destination);
        const validDestination = order.kind !== 'relocate' || destination != null;
        if (!validKind || !validPhase || !Number.isFinite(progress) ||
            !Number.isFinite(required) || required <= 0 || !validDestination) {
          delete building.workOrder;
          building.built = true;
        } else {
          building.workOrder = {
            kind: order.kind,
            phase: order.phase,
            progress: Math.max(0, progress),
            required,
            ...(destination ? { destination } : {}),
          };
          building.built = false;
        }
      }
      if (building.expansion) {
        const expansion = building.expansion;
        const fromArea = normalizePastureArea(expansion.fromArea);
        const targetArea = normalizePastureArea(expansion.targetArea);
        const progress = Number(expansion.progress);
        const required = Number(expansion.required);
        const addedTiles = Number(expansion.addedTiles);
        const validKind = expansion.kind === 'footprint' || expansion.kind === 'pasture';
        if (!building.built || !validKind || !fromArea || !targetArea ||
            !Number.isFinite(progress) || !Number.isFinite(required) || required <= 0 ||
            !Number.isFinite(addedTiles) || addedTiles <= 0) {
          delete building.expansion;
        } else {
          building.expansion = {
            kind: expansion.kind,
            fromArea,
            targetArea,
            progress: Math.max(0, progress),
            required,
            addedTiles: Math.max(1, Math.floor(addedTiles)),
          };
        }
      }
      if (building.type === 'cemetery') {
        // v20 이전 묘지는 고정 2×2 건물이었으므로 저장된 발자국이 없으면 그대로 보존한다.
        if (!Number.isFinite(building.w)) building.w = 2;
        if (!Number.isFinite(building.h)) building.h = 2;
        const graveCount = Math.max(0, Math.floor(building.graves ?? 0));
        building.graves = graveCount;
        building.burialRecords = Array.isArray(building.burialRecords)
          ? building.burialRecords.slice(0, graveCount)
          : [];
        while (building.burialRecords.length < graveCount) building.burialRecords.push({});
      }
      if (building.type === 'smithy' && !building.smithyProduct) building.smithyProduct = 'tools';
      if (building.type === 'tannery' &&
          (!building.tanneryProduct ||
           !Object.prototype.hasOwnProperty.call(TANNERY_PRODUCT_DEFS, building.tanneryProduct))) {
        building.tanneryProduct = 'auto';
      }
      if (building.type === 'dryingRack' && building.dryingProduct !== 'driedFish') {
        building.dryingProduct = 'saltedFish';
      }
      if ((building.type === 'field' || building.type === 'paddy') &&
          !Object.prototype.hasOwnProperty.call(building, 'cropId')) {
        building.cropId = defaultCropForBuildingType(building.type);
      }
      if ((building.type === 'field' || building.type === 'paddy') &&
          !Object.prototype.hasOwnProperty.call(building, 'queuedCropId')) {
        building.queuedCropId = null;
      }
      if (building.type === 'field' || building.type === 'paddy') {
        // v22 경작지: 구버전 1×1은 크기 기본값을 채우고, 파종 칸 수는 자라던 밭이면 전체로 본다
        building.w = clampPlotSide(building.w);
        building.h = clampPlotSide(building.h);
        const area = building.w * building.h;
        const rawSown = typeof building.sownArea === 'number' && Number.isFinite(building.sownArea)
          ? building.sownArea
          : (building.fieldGrowth > 0 ? area : 0);
        building.sownArea = Math.min(area, Math.max(0, rawSown));
        const rawOxen = typeof building.plowOxen === 'number' && Number.isFinite(building.plowOxen)
          ? Math.floor(building.plowOxen)
          : 0;
        building.plowOxen = Math.max(0, rawOxen);
      }
      if (building.type === 'stable') {
        building.livestock = normalizeLivestockState(building.livestock);
        const pasture = normalizePastureArea(building.pasture);
        if (pasture) building.pasture = pasture;
        else delete building.pasture;
      }
    }
    normalizeRoyalPlaqueBinding(parsed);
    const priorityBuilding = parsed.buildings.find(building => building.id === parsed.priorityBuildingId);
    parsed.priorityBuildingId = priorityBuilding &&
      (!priorityBuilding.built || priorityBuilding.repairing || priorityBuilding.expansion || priorityBuilding.workOrder ||
        priorityBuilding.gateConversion || priorityBuilding.structureRepair || priorityBuilding.boatWorkOrder)
      ? priorityBuilding.id
      : null;
    if (parsed.raiders) {
      const band = parsed.raiders;
      band.proximityAlerted = band.proximityAlerted === true;
      if (band.warningSource !== 'diplomatic') delete band.warningSource;
      band.path = Array.isArray(band.path) ? band.path.filter(step => Number.isFinite(step?.x) && Number.isFinite(step?.y)) : [];
      band.trail = Array.isArray(band.trail) ? band.trail.slice(-30) : [];
      band.phase = band.phase === 'breaching' ? 'breaching' : 'approaching';
      if (!Number.isFinite(band.routeRevision)) delete band.routeRevision;
      else band.routeRevision = Math.max(0, Math.floor(band.routeRevision!));
      if (!band.routeTarget || !Number.isFinite(band.routeTarget.x) || !Number.isFinite(band.routeTarget.y)) {
        delete band.routeTarget;
      }
      if (!Number.isInteger(band.breachTargetId) ||
          !parsed.buildings.some(building => building.id === band.breachTargetId && building.breached !== true)) {
        delete band.breachTargetId;
        if (band.phase === 'breaching') band.phase = 'approaching';
      }
      const validTowerTarget = Number.isInteger(band.towerTargetId) && parsed.buildings.some(building =>
        building.id === band.towerTargetId && building.type === 'watchtower' && building.built && !building.repairing);
      const validTowerReturnTarget = !!band.towerReturnTarget &&
        Number.isFinite(band.towerReturnTarget.x) && Number.isFinite(band.towerReturnTarget.y) &&
        parsed.map[Math.floor(band.towerReturnTarget.y)]?.[Math.floor(band.towerReturnTarget.x)] != null;
      if (!validTowerTarget) {
        delete band.towerTargetId;
        if (validTowerReturnTarget) {
          band.routeTarget = {
            x: Math.floor(band.towerReturnTarget!.x),
            y: Math.floor(band.towerReturnTarget!.y),
          };
          band.path = [];
          delete band.route;
        }
        delete band.towerReturnTarget;
      } else if (validTowerReturnTarget) {
        band.towerReturnTarget = {
          x: Math.floor(band.towerReturnTarget!.x),
          y: Math.floor(band.towerReturnTarget!.y),
        };
      } else {
        delete band.towerReturnTarget;
      }
      band.suppressedUntilTick = Number.isFinite(band.suppressedUntilTick)
        ? Math.max(0, Math.floor(band.suppressedUntilTick!)) : undefined;
      const route = band.route;
      if (!route || (route.kind !== 'open' && route.kind !== 'assault') || !Array.isArray(route.steps) ||
          !Array.isArray(route.breaches) || !Number.isFinite(route.totalCost)) {
        delete band.route;
      } else {
        route.steps = route.steps.filter(step => Number.isFinite(step?.x) && Number.isFinite(step?.y) &&
          parsed.map[Math.floor(step.y)]?.[Math.floor(step.x)] != null)
          .map(step => ({ x: Math.floor(step.x), y: Math.floor(step.y) }));
        const seenBreaches = new Set<number>();
        route.breaches = route.breaches.filter(breach => {
          if (!Number.isInteger(breach?.buildingId) || seenBreaches.has(breach.buildingId)) return false;
          const building = parsed.buildings.find(candidate => candidate.id === breach.buildingId);
          if (!building || building.breached === true || !Number.isFinite(breach.x) || !Number.isFinite(breach.y)) return false;
          seenBreaches.add(breach.buildingId);
          return true;
        }).map(breach => ({
          buildingId: breach.buildingId,
          x: Math.floor(breach.x),
          y: Math.floor(breach.y),
        }));
        route.totalCost = Math.max(0, route.totalCost);
      }
    }
    const projectileIds = new Set<number>();
    parsed.watchtowerProjectiles = Array.isArray(parsed.watchtowerProjectiles)
      ? parsed.watchtowerProjectiles.filter(shot => {
        if (!shot || !Number.isInteger(shot.id) || projectileIds.has(shot.id) ||
            !Number.isInteger(shot.towerId) || !parsed.buildings.some(building => building.id === shot.towerId) ||
            !Number.isFinite(shot.fromX) || !Number.isFinite(shot.fromY) ||
            !Number.isFinite(shot.toX) || !Number.isFinite(shot.toY) ||
            !Number.isFinite(shot.ageTicks) || !Number.isFinite(shot.durationTicks) || shot.durationTicks <= 0) return false;
        projectileIds.add(shot.id);
        shot.ageTicks = Math.max(0, Math.floor(shot.ageTicks));
        shot.durationTicks = Math.max(1, Math.floor(shot.durationTicks));
        shot.bow = shot.bow === true;
        return shot.ageTicks < shot.durationTicks;
      }).slice(-24)
      : [];
    parsed.nextWatchtowerProjectileId = Number.isInteger(parsed.nextWatchtowerProjectileId)
      ? Math.max(1, parsed.nextWatchtowerProjectileId) : 1;
    parsed.nextWatchtowerProjectileId = Math.max(
      parsed.nextWatchtowerProjectileId,
      ...parsed.watchtowerProjectiles.map(shot => shot.id + 1),
    );
    ensureProcessingReserves(parsed);
    if (parsed.lastPetitionDay == null) parsed.lastPetitionDay = 0;
    if (parsed.cannonsGranted == null) parsed.cannonsGranted = 0;
    // 절목 — 저장에 없거나 깨진 항목은 평시로 본다 (지금까지와 같은 거동)
    parsed.edicts = normalizedEdicts(parsed.edicts, parsed.day);
    if (parsed.edictWhiplashUntil == null || !Number.isFinite(parsed.edictWhiplashUntil)) {
      parsed.edictWhiplashUntil = 0;
    }
    // 모반 의심 없는 구버전
    if (parsed.suspicion == null) parsed.suspicion = 0;
    if (parsed.nitrePaused == null) parsed.nitrePaused = false;
    if (parsed.nitreHiddenUntil == null) parsed.nitreHiddenUntil = 0;
    if (!parsed.initiatedTradeDays) parsed.initiatedTradeDays = [];
    if (parsed.inspectionCooldownUntil == null) parsed.inspectionCooldownUntil = 0;
    if (parsed.censured == null) parsed.censured = false;
    if (parsed.crackdownDeadline == null) parsed.crackdownDeadline = 0;
    // 은맥 없는 구버전
    if (!Object.prototype.hasOwnProperty.call(parsed, 'silverVein')) parsed.silverVein = null;
    if (parsed.silverPityDays == null) parsed.silverPityDays = 0;
    if (!parsed.spoilageStockAtDayStart || typeof parsed.spoilageStockAtDayStart !== 'object') {
      parsed.spoilageStockAtDayStart = {
        fish: parsed.resources.fish ?? 0,
        milk: parsed.resources.milk ?? 0,
        meat: parsed.resources.meat ?? 0,
        eggs: parsed.resources.eggs ?? 0,
        vegetables: parsed.resources.vegetables ?? 0,
      };
    }
    // 생애 주기·장례 없는 구버전
    if (!Array.isArray(parsed.corpses)) parsed.corpses = [];
    if (parsed.nextCorpseId == null) parsed.nextCorpseId = 1;
    // 만족도·종교 없는 구버전
    if (!Array.isArray(parsed.unlockedReligions)) parsed.unlockedReligions = [];
    if (!Array.isArray(parsed.spentSpecialIds)) parsed.spentSpecialIds = [];
    if (!parsed.specialResidentRecords || typeof parsed.specialResidentRecords !== 'object'
      || Array.isArray(parsed.specialResidentRecords)) parsed.specialResidentRecords = {};
    if (parsed.religionOfferCooldownUntil == null) parsed.religionOfferCooldownUntil = 0;
    if (parsed.promotionCheerUntil == null) parsed.promotionCheerUntil = 0;
    if (parsed.expectationTransitionUntil != null &&
        (!Number.isFinite(parsed.expectationTransitionUntil) || parsed.expectationTransitionUntil <= 0)) {
      delete parsed.expectationTransitionUntil;
    }
    if (parsed.expectationTransitionUntil != null && parsed.expectationTransitionNotified !== true) {
      if (!Array.isArray(parsed.log)) parsed.log = [];
      parsed.log.push({
        day: parsed.day,
        text: '마을의 규모가 커지며 주민들이 바라는 살림의 기준도 달라졌습니다. 새 기대에 적응하는 동안 승격의 여운이 민심을 받쳐 줍니다.',
        kind: 'info',
        important: true,
      });
      parsed.expectationTransitionNotified = true;
    }
    // 세공 없는 구버전: 시드로 올해분을 재생성. 이미 겨울이면 올해분은 면제 (다음 봄부터 정상 진행).
    // 첫 해는 조정이 거두지 않으므로(R4) 재생성 없이 비워 둔다.
    if (!Object.prototype.hasOwnProperty.call(parsed, 'courtTribute')) {
      const year = getYear(parsed.day);
      if (year < CONFIG.tribute.firstYear) {
        parsed.courtTribute = null;
      } else {
        const pop = parsed.residents.filter(r => r.alive).length;
        const tribute = rollCourtTribute(parsed.seed ?? 1, year, pop, parsed.rank);
        if (getSeason(parsed.day) === 'winter') {
          tribute.resolved = true;
          tribute.paid = true;
        }
        parsed.courtTribute = tribute;
      }
    }
    const pendingTributeAnnouncementYear = parsed.tributeAnnouncementPendingYear;
    if (typeof pendingTributeAnnouncementYear !== 'number' ||
        !Number.isFinite(pendingTributeAnnouncementYear) ||
        pendingTributeAnnouncementYear < CONFIG.tribute.firstYear) {
      delete parsed.tributeAnnouncementPendingYear;
    } else {
      parsed.tributeAnnouncementPendingYear = Math.floor(pendingTributeAnnouncementYear);
    }
    if (parsed.tributeFailStreak == null) parsed.tributeFailStreak = 0;
    reconcileTributeReserve(parsed);
    migrateResidentGender(parsed);
    migrateResidentCarts(parsed);
    migrateResidentManualOrders(parsed);
    migrateResidentAssignedBuildingIds(parsed);
    migrateResidentHomeBuildingIds(parsed);
    migrateResidentHaulTasks(parsed);
    migrateExpeditionState(parsed);
    migrateWeaponAssignments(parsed);
    migrateMountAssignments(parsed);
    if (parsed.tacticalBattle) {
      const assignments = resolvedWeaponAssignments(parsed);
      for (const group of parsed.tacticalBattle.defenderGroups) {
        if (group.weapon == null && (group.role === 'watchman' || group.role === 'hunter')) {
          const assigned = [...new Set(group.residentIds.map(id => assignments[id] ?? null))];
          if (assigned.length === 1) group.weapon = assigned[0];
        }
      }
      const musketGroups = parsed.tacticalBattle.defenderGroups.filter(group => group.weapon === 'musket');
      const readiness = allocateMusketReadiness(
        parsed,
        musketGroups.map(group => ({ id: group.id, residentIds: group.residentIds })),
        CONFIG.raid.powderPerMusket,
      );
      for (const group of musketGroups) group.readyMuskets = readiness.byGroup[group.id] ?? 0;
    }
    if (legacyHuntRecoveryNeeded) {
      parsed.tacticalBattle = null;
      parsed.tacticalBattleReport = null;
      parsed.pendingChoice = null;
      if (parsed.expedition?.kind === 'predatorHunt') parsed.expedition.phase = 'engage';
      delete (parsed as unknown as RawSave).legacyHuntRecoveryNeeded;
      parsed.log ??= [];
      parsed.log.push({
        day: parsed.day,
        text: '이전 형식의 사냥 전투를 닫았습니다. 현장에서 사냥 방식을 다시 선택할 수 있습니다.',
        kind: 'info',
        important: true,
      });
    } else if (tacticalRecoveryNeeded) {
      parsed.tacticalBattle = null;
      parsed.tacticalBattleReport = null;
      if (parsed.expedition?.phase === 'engage') {
        const returnError = beginExpeditionReturn(parsed);
        if (returnError && parsed.expedition) {
          const expedition = parsed.expedition;
          for (const resident of parsed.residents.filter(candidate => expedition.memberIds.includes(candidate.id))) {
            resident.x = expedition.musterX;
            resident.y = expedition.musterY;
            resident.px = expedition.musterX;
            resident.py = expedition.musterY;
            resident.path = [];
            resident.task = '대기';
          }
          parsed.expedition = null;
        }
      }
      parsed.log ??= [];
      parsed.log.push({
        day: parsed.day,
        text: '저장된 전술전 데이터가 손상되어 전투만 취소하고 원정대의 안전 귀환을 처리했습니다.',
        kind: 'info',
        important: true,
      });
    }
    // 시나리오 저장: v7→v8은 스텝 순서가 같고 완료 조건만 느슨해져 안전하게 호환 승격한다.
    // 그 밖에 코드의 튜토리얼 버전과 다르면 해제하고 일반 모드로 잇는다.
    if (parsed.scenario) {
      const scenario = parsed.scenario;
      if (scenario.id === 'tutorial' && scenario.version === 7 && TUTORIAL_SCENARIO_VERSION === 8) {
        scenario.version = TUTORIAL_SCENARIO_VERSION;
      }
      const valid = scenario.id === 'tutorial'
        && scenario.version === TUTORIAL_SCENARIO_VERSION
        && Number.isInteger(scenario.stepIndex)
        && scenario.stepIndex >= 0 && scenario.stepIndex <= TUTORIAL_STEPS.length
        && scenario.flags != null && typeof scenario.flags === 'object';
      if (!valid) {
        parsed.scenario = null;
        parsed.log ??= [];
        parsed.log.push({
          day: parsed.day,
          text: '길잡이 시나리오가 갱신되어 이 저장은 일반 모드로 이어집니다. 새 길잡이는 메인 메뉴에서 시작할 수 있습니다.',
          kind: 'info',
          important: true,
        });
      }
    } else {
      parsed.scenario = null;
    }
    // 길잡이 출신 표식: 없으면 아닌 것으로 본다 (새 게임 기본값과 같으므로 스키마를 올리지 않는다)
    parsed.tutorialGraduate = parsed.tutorialGraduate === true;
    // 치트 표식: 같은 규칙 — 없으면 건드리지 않은 저장으로 본다 (스키마 상승 불요)
    parsed.debugTouched = parsed.debugTouched === true;
    // 초회 도움말: 손상되었거나 없으면 꺼진 상태로 본다 (구버전 저장 보정과 같은 규칙)
    const guides = parsed.guides;
    parsed.guides = guides && typeof guides === 'object' && guides.seen != null && typeof guides.seen === 'object'
      ? { enabled: guides.enabled === true, seen: { ...guides.seen } }
      : { enabled: false, seen: {} };
    // 떠 있던 카드와 미뤄 둔 모달은 표시용이라 형태만 맞춰 둔다 (1회성은 seen이 지킨다)
    parsed.guideCards = Array.isArray(parsed.guideCards)
      ? parsed.guideCards.filter((card: unknown) => {
        const entry = card as { moduleId?: unknown; title?: unknown; body?: unknown };
        return typeof entry?.moduleId === 'string' && typeof entry.title === 'string' && typeof entry.body === 'string';
      })
      : [];
    parsed.guideModalQueue = Array.isArray(parsed.guideModalQueue)
      ? parsed.guideModalQueue.filter((id: unknown) => typeof id === 'string')
      : [];
    rebuildBuildingFootprints(parsed);
    ensureResidentsOnPassableTiles(parsed);
    normalizeSiegeState(parsed);
    migrateGatheringAssignments(parsed);
    normalizeLodgingHutState(parsed);
    reconcileResidentHomes(parsed, makeRng((parsed.seed ?? 1) + parsed.day * 32452843));
    ensureExploration(parsed);
    refreshExploration(parsed);
    revealForeignSitesFromExploration(parsed);
    parsed.resources.defense = computeDefense(parsed);
    return parsed;
  } catch {
    return null;
  }
}

const GATHERING_ASSIGNMENT_BUILDINGS: Partial<Record<Resident['job'], readonly GameState['buildings'][number]['type'][]>> = {
  woodcutter: ['lumberCamp'],
  hunter: ['huntLodge'],
  herbalist: ['herbHut'],
  miner: ['mine', 'deepMine'],
};

/** G3 저장 호환: 방랑 채집꾼을 가까운 거점 빈 슬롯에 붙이고, 자리가 없으면 무직으로 돌린다. */
export function migrateGatheringAssignments(state: GameState): { assigned: number; idled: number } {
  let assigned = 0;
  let idled = 0;
  const activeDutyResidentIds = new Set([
    ...(state.expedition?.memberIds ?? []),
    ...(state.warDispatch?.memberIds ?? []),
    ...(state.battle?.defenderIds ?? []),
    ...(state.tacticalBattle?.defenderGroups.flatMap(group => group.residentIds) ?? []),
    ...(state.siegeState?.defenderIds ?? []),
  ]);
  const residents = [...state.residents].sort((a, b) => a.id - b.id);
  for (const resident of residents) {
    if (!resident.alive) continue;
    const buildingTypes = GATHERING_ASSIGNMENT_BUILDINGS[resident.job];
    if (!buildingTypes) continue;
    const current = assignedBuildingForResident(state, resident);
    if (current && buildingTypes.includes(current.type)) continue;
    const activeDuty = activeDutyResidentIds.has(resident.id);
    const activeDutyTask = resident.task;
    resident.assignedBuildingId = null;
    const candidates = state.buildings
      .filter(building => building.built && buildingTypes.includes(building.type))
      .sort((a, b) =>
        Math.abs(resident.x - a.x) + Math.abs(resident.y - a.y) -
        (Math.abs(resident.x - b.x) + Math.abs(resident.y - b.y)) || a.id - b.id);
    const target = candidates.find(building => assignResidentToBuilding(state, resident.id, building.id) == null);
    resident.path = [];
    resident.phase = 'rest';
    resident.targetId = null;
    resident.manualOrder = null;
    if (target) {
      assigned++;
      resident.task = activeDuty ? activeDutyTask : '가까운 채집 거점에 다시 배정됨';
    } else if (activeDuty) {
      // 출정·전투 중인 주민은 임무와 직업을 보존한다. 복귀 뒤 플레이어가 새 거점을 배정할 수 있다.
      continue;
    } else {
      resident.job = 'idle';
      resident.task = '채집 거점이 없어 무직 전환';
      idled++;
    }
  }
  if (assigned > 0 || idled > 0) {
    addLog(
      state,
      `채집 거점 체제로 전환했습니다. 가까운 거점 자동 배정 ${assigned}명 · 거점이 없어 무직 전환 ${idled}명.`,
      'info',
      true,
    );
  }
  return { assigned, idled };
}

export function hasSave(slot = 1): boolean {
  return localStorage.getItem(saveSlotStorageKey(slot)) != null;
}

export function hasAnySave(): boolean {
  for (let slot = 1; slot <= SAVE_SLOT_COUNT; slot++) {
    if (hasSave(slot)) return true;
  }
  return false;
}

export function clearSave(slot = 1): void {
  localStorage.removeItem(saveSlotStorageKey(slot));
}

export interface SaveSlotSummary {
  slot: number;
  exists: boolean;
  savedAt: number | null;
  day: number | null;
  population: number | null;
  rank: string | null;
  difficulty: string | null;
  difficultyPreset: string | null;
  region: string | null;
  mapSize: string | null;
  settlementName: string | null;
}

function emptySlotSummary(slot: number): SaveSlotSummary {
  return {
    slot, exists: false, savedAt: null, day: null, population: null,
    rank: null, difficulty: null, difficultyPreset: null, region: null, mapSize: null, settlementName: null,
  };
}

// 슬롯 목록 UI용 요약 — 전체 마이그레이션 없이 원본 JSON의 표시 필드만 읽는다
export function readSaveSlotSummary(slot: number): SaveSlotSummary {
  const raw = localStorage.getItem(saveSlotStorageKey(slot));
  if (!raw) return emptySlotSummary(slot);
  try {
    const decoded = JSON.parse(raw) as RawSave;
    const day = Number(decoded.day);
    const savedAt = Number(decoded.savedAt);
    const residents = Array.isArray(decoded.residents) ? decoded.residents : [];
    const worldSetup = decoded.worldSetup && typeof decoded.worldSetup === 'object'
      ? decoded.worldSetup as RawSave
      : {};
    const legacyDifficulty = typeof decoded.difficulty === 'string' ? decoded.difficulty : null;
    const savedMap = Array.isArray(decoded.map) ? decoded.map : [];
    const actualMapSize = mapSizeForDimensions(
      Array.isArray(savedMap[0]) ? savedMap[0].length : 0,
      savedMap.length,
    );
    return {
      slot,
      exists: true,
      savedAt: Number.isFinite(savedAt) ? savedAt : null,
      day: Number.isFinite(day) ? Math.max(1, Math.floor(day)) : null,
      population: residents.filter(entry => entry && typeof entry === 'object' &&
        (entry as RawSave).alive === true).length,
      rank: typeof decoded.rank === 'string' ? decoded.rank : null,
      difficulty: legacyDifficulty,
      difficultyPreset: typeof worldSetup.difficultyPreset === 'string'
        ? worldSetup.difficultyPreset
        : legacyDifficulty,
      region: typeof worldSetup.region === 'string' ? worldSetup.region : 'plains',
      mapSize: actualMapSize ?? (typeof worldSetup.mapSize === 'string' ? worldSetup.mapSize : 'medium'),
      settlementName: typeof decoded.settlementName === 'string' && decoded.settlementName.trim()
        ? decoded.settlementName.trim()
        : null,
    };
  } catch {
    return { ...emptySlotSummary(slot), exists: true };
  }
}

export function readSaveSlotSummaries(): SaveSlotSummary[] {
  return Array.from({ length: SAVE_SLOT_COUNT }, (_, index) => readSaveSlotSummary(index + 1));
}
