// localStorage 저장/불러오기
import { CONFIG } from './config';
import { clampPlotSide, computeDefense, rebuildBuildingFootprints } from './buildings';
import { defaultCropForBuildingType } from './crops';
import { rollCourtTribute } from './courtTribute';
import {
  flankPlanFromEnemyPlan, flankPlanRevealedFromEnemyPlan, migrateBanditLairDefensePlan, migrateEnemyPlan,
} from './enemyPlan';
import { spawnAnimalHabitats } from './habitats';
import { makeRng } from './map';
import { ensureMineralDeposits } from './minerals';
import { ensureProcessingReserves } from './processing';
import { initRelations } from './relations';
import { getSeason, getYear } from './seasons';
import { ensureExploration, refreshExploration } from './exploration';
import { tigerTierFromStrength } from './expeditionIntel';
import { RESOURCE_IDS } from './resourceCatalog';
import { reconcileTributeReserve } from './tributeReserve';
import { reconcileResidentHomes } from './residents';
import { ensureIncidentState } from './specialEvents';
import { TUTORIAL_SCENARIO_VERSION, TUTORIAL_STEPS } from './scenario';
import { ensureForeignSiteState, revealForeignSitesFromExploration } from './foreignSites';
import {
  allocateMusketReadiness, reconcileMountAssignments, reconcileWeaponAssignments, resolvedWeaponAssignments,
} from './weapons';
import { beginExpeditionReturn } from './expedition';
import { CURRENT_SCHEMA_VERSION } from './saveSchema';
import { defaultRaiderFormationLine } from './tacticalTargeting';
import { isImplementedLivestockId, normalizeLivestockState } from './livestock';
import { normalizeTacticalGroupTargets } from './tacticalBattle';
import {
  gradeTacticalBattle, raidDefenseObjectiveResult, tacticalClosingSummary, tacticalOutcomeResult,
} from './tacticalCore';
import type {
  CombatWeaponId, CourtTribute, DefenderGroupKind, FermentBatch, GameState, Gender, Resident, ResourceId,
  PreparationActionId, RaiderUnitType, TacticalAnimationEvent, TacticalBattle, TacticalBattleReport, TacticalCommandId,
  TacticalFormationLine, TacticalPreparationEffect, TacticalRaiderGroup, TacticalRoundReport,
} from './types';

export { CURRENT_SCHEMA_VERSION } from './saveSchema';

const SAVE_KEY = 'buksae-save-v3'; // v3: 이동 보간(px/py)과 지도 위 습격 무리 추가
// 저장 슬롯: 1번은 기존 단일 저장 키를 그대로 사용해 예전 저장과 호환된다
export const SAVE_SLOT_COUNT = 4;

function slotKey(slot: number): string {
  return slot <= 1 ? SAVE_KEY : `${SAVE_KEY}-slot${slot}`;
}

const RESOURCE_ID_SET = new Set<string>(RESOURCE_IDS);

type RawSave = Record<string, unknown>;

function clonedRecord(raw: unknown): RawSave {
  if (!raw || typeof raw !== 'object') return {};
  return JSON.parse(JSON.stringify(raw)) as RawSave;
}

export function migrateV3ToV4(raw: RawSave): RawSave {
  return { ...raw, schemaVersion: 4 };
}

export function migrateV4ToV5(raw: RawSave): RawSave {
  return {
    ...raw,
    weaponAssignments: raw.weaponAssignments && typeof raw.weaponAssignments === 'object' ? raw.weaponAssignments : {},
    weaponAllocationMode: raw.weaponAllocationMode === 'manual' ? 'manual' : 'auto',
    schemaVersion: 5,
  };
}

export function migrateV5ToV6(raw: RawSave): RawSave {
  return {
    ...raw,
    tacticalBattle: Object.prototype.hasOwnProperty.call(raw, 'tacticalBattle') ? raw.tacticalBattle : null,
    tacticalBattleReport: Object.prototype.hasOwnProperty.call(raw, 'tacticalBattleReport') ? raw.tacticalBattleReport : null,
    schemaVersion: 6,
  };
}

export function migrateV6ToV7(raw: RawSave): RawSave {
  return { ...raw, schemaVersion: 7 };
}

export function migrateV7ToV8(raw: RawSave): RawSave {
  return { ...raw, schemaVersion: 8 };
}

export function migrateV8ToV9(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  const battle = migrated.tacticalBattle && typeof migrated.tacticalBattle === 'object'
    ? migrated.tacticalBattle as RawSave
    : null;
  const plan = battle?.enemyPlan && typeof battle.enemyPlan === 'object'
    ? battle.enemyPlan as RawSave
    : null;
  if (Array.isArray(plan?.stratagems)) {
    for (const entry of plan.stratagems) {
      if (!entry || typeof entry !== 'object') continue;
      const stratagem = entry as RawSave;
      stratagem.counter = stratagem.counterLevel === 2
        ? { intelligence: 1 }
        : stratagem.counterLevel === 1 ? { preparation: 0.6 } : {};
    }
  }
  const day = Number.isFinite(migrated.day) ? Math.max(1, Math.floor(Number(migrated.day))) : 1;
  if (Array.isArray(migrated.foreignSites)) {
    for (const entry of migrated.foreignSites) {
      if (!entry || typeof entry !== 'object') continue;
      const site = entry as RawSave;
      if (site.type !== 'banditLair') continue;
      site.lairDoctrineRevision = Number.isFinite(site.lairDoctrineRevision)
        ? Math.max(0, Math.floor(Number(site.lairDoctrineRevision))) : 0;
      site.lairDoctrineChosenDay = Number.isFinite(site.lairDoctrineChosenDay)
        ? Math.floor(Number(site.lairDoctrineChosenDay)) : day;
      site.lairDoctrineNextReviewDay = Number.isFinite(site.lairDoctrineNextReviewDay)
        ? Math.floor(Number(site.lairDoctrineNextReviewDay))
        : Math.max(
          day + CONFIG.foreignSites.banditLairDefense.doctrineReviewIntervalDays,
          (Number.isFinite(site.scoutedUntilDay) ? Math.floor(Number(site.scoutedUntilDay)) : -1) + 1,
        );
    }
  }
  migrated.schemaVersion = 9;
  return migrated;
}

export function migrateV9ToV10(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  const battle = migrated.tacticalBattle && typeof migrated.tacticalBattle === 'object'
    ? migrated.tacticalBattle as RawSave
    : null;
  const predatorHunt = battle?.assaultKind === 'predatorHunt' || battle?.encounterKind === 'predatorHunt';
  const legacyZoneIds = new Set(Array.isArray(battle?.zones)
    ? battle.zones.flatMap(entry => entry && typeof entry === 'object' && 'id' in entry
      ? [String((entry as RawSave).id)]
      : [])
    : []);
  if (predatorHunt && (legacyZoneIds.has('huntTracks') || legacyZoneIds.has('huntDrive'))) {
    migrated.tacticalBattle = null;
    migrated.pendingChoice = null;
    migrated.legacyHuntRecoveryNeeded = true;
  }
  migrated.schemaVersion = 10;
  return migrated;
}

export function migrateV10ToV11(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  const resources = migrated.resources && typeof migrated.resources === 'object'
    ? { ...migrated.resources as RawSave }
    : {};
  resources.salt = normalizedAmount(resources.salt);
  migrated.resources = resources;
  migrated.schemaVersion = 11;
  return migrated;
}

export function migrateV11ToV12(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  const resources = migrated.resources && typeof migrated.resources === 'object'
    ? { ...migrated.resources as RawSave }
    : {};
  resources.curedMeat = normalizedAmount(resources.curedMeat);
  resources.saltedFish = normalizedAmount(resources.saltedFish);
  resources.driedFish = normalizedAmount(resources.driedFish);
  migrated.resources = resources;
  if (Array.isArray(migrated.buildings)) {
    for (const entry of migrated.buildings) {
      if (!entry || typeof entry !== 'object') continue;
      const building = entry as RawSave;
      if (building.type === 'dryingRack' && building.dryingProduct !== 'driedFish') {
        building.dryingProduct = 'saltedFish';
      }
    }
  }
  migrated.schemaVersion = 12;
  return migrated;
}

export function migrateV12ToV13(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  const resources = migrated.resources && typeof migrated.resources === 'object'
    ? { ...migrated.resources as RawSave }
    : {};
  resources.beans = normalizedAmount(resources.beans);
  resources.onggi = normalizedAmount(resources.onggi);
  migrated.resources = resources;
  migrated.schemaVersion = 13;
  return migrated;
}

export function migrateV13ToV14(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  const resources = migrated.resources && typeof migrated.resources === 'object'
    ? { ...migrated.resources as RawSave }
    : {};
  resources.jang = normalizedAmount(resources.jang);
  migrated.resources = resources;
  if (Array.isArray(migrated.buildings)) {
    for (const entry of migrated.buildings) {
      if (!entry || typeof entry !== 'object') continue;
      const building = entry as RawSave;
      building.fermentBatches = migrateFermentBatches(building.fermentBatches);
    }
  }
  migrated.schemaVersion = 14;
  return migrated;
}

export function migrateV14ToV15(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  const resources = migrated.resources && typeof migrated.resources === 'object'
    ? { ...migrated.resources as RawSave }
    : {};
  resources.kimchi = normalizedAmount(resources.kimchi);
  migrated.resources = resources;
  const lastKimjangYear = Math.floor(Number(migrated.lastKimjangYear));
  migrated.lastKimjangYear = Number.isFinite(lastKimjangYear) ? Math.max(0, lastKimjangYear) : 0;
  migrated.schemaVersion = 15;
  return migrated;
}

export function migrateV15ToV16(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  const resources = migrated.resources && typeof migrated.resources === 'object'
    ? { ...migrated.resources as RawSave }
    : {};
  resources.eggs = normalizedAmount(resources.eggs);
  migrated.resources = resources;
  migrated.unlockedLivestock = ['chicken'];
  if (Array.isArray(migrated.buildings)) {
    for (const entry of migrated.buildings) {
      if (!entry || typeof entry !== 'object') continue;
      const building = entry as RawSave;
      if (building.type === 'stable') building.livestock = normalizeLivestockState(building.livestock);
    }
  }
  migrated.schemaVersion = 16;
  return migrated;
}

export function migrateV16ToV17(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), schemaVersion: 17 };
}

export function migrateV17ToV18(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), schemaVersion: 18 };
}

// v19: 은 자원과 은맥 상태 추가 — 가산적이라 필드 기본값 채움으로 충분하다
export function migrateV18ToV19(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), schemaVersion: 19 };
}

// v20: 생애 주기(단계·혼인·출산·노년)와 장례(시신·묘지) — 가산적
export function migrateV19ToV20(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), schemaVersion: 20 };
}

// v21: 성분 기반 만족도·서당·종교(당집/암자) — 가산적
export function migrateV20ToV21(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), schemaVersion: 21 };
}

// v22: 드래그 크기 경작지(w/h/sownArea)와 농우(plowOxen) — 가산적, 필드 기본값은 로드 정규화에서 채운다
export function migrateV21ToV22(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), schemaVersion: 22 };
}

// v23: 교육·문해 — 구버전 저장의 현직 의원·아전·훈장과 특수 주민은 문해자로 인정한다
export function migrateV22ToV23(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  if (Array.isArray(migrated.residents)) {
    for (const entry of migrated.residents) {
      if (!entry || typeof entry !== 'object') continue;
      const resident = entry as RawSave;
      if (resident.literate == null &&
          (['physician', 'clerk', 'teacher'].includes(String(resident.job)) || resident.special != null)) {
        resident.literate = true;
      }
    }
  }
  migrated.schemaVersion = 23;
  return migrated;
}

export function migrateToCurrent(raw: unknown): RawSave {
  let migrated = clonedRecord(raw);
  let version = Number.isInteger(migrated.schemaVersion) ? Number(migrated.schemaVersion) : 3;
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Unsupported future schema version: ${version}`);
  }
  while (version < CURRENT_SCHEMA_VERSION) {
    if (version === 3) migrated = migrateV3ToV4(migrated);
    else if (version === 4) migrated = migrateV4ToV5(migrated);
    else if (version === 5) migrated = migrateV5ToV6(migrated);
    else if (version === 6) migrated = migrateV6ToV7(migrated);
    else if (version === 7) migrated = migrateV7ToV8(migrated);
    else if (version === 8) migrated = migrateV8ToV9(migrated);
    else if (version === 9) migrated = migrateV9ToV10(migrated);
    else if (version === 10) migrated = migrateV10ToV11(migrated);
    else if (version === 11) migrated = migrateV11ToV12(migrated);
    else if (version === 12) migrated = migrateV12ToV13(migrated);
    else if (version === 13) migrated = migrateV13ToV14(migrated);
    else if (version === 14) migrated = migrateV14ToV15(migrated);
    else if (version === 15) migrated = migrateV15ToV16(migrated);
    else if (version === 16) migrated = migrateV16ToV17(migrated);
    else if (version === 17) migrated = migrateV17ToV18(migrated);
    else if (version === 18) migrated = migrateV18ToV19(migrated);
    else if (version === 19) migrated = migrateV19ToV20(migrated);
    else if (version === 20) migrated = migrateV20ToV21(migrated);
    else if (version === 21) migrated = migrateV21ToV22(migrated);
    else if (version === 22) migrated = migrateV22ToV23(migrated);
    else break;
    version = Number(migrated.schemaVersion);
  }
  migrated.schemaVersion = CURRENT_SCHEMA_VERSION;
  return migrated;
}

const TACTICAL_PHASES = new Set(['preparation', 'preparationExecution', 'deployment', 'command', 'simulating', 'report', 'finished']);
const DEFENDER_KINDS = new Set<DefenderGroupKind>([
  'militia-spear', 'militia-bow', 'militia-musket', 'militia-unarmed', 'watchman', 'hunter', 'healer', 'civilian',
]);
const TACTICAL_COMMANDS = new Set<TacticalCommandId>([
  'hold', 'volley', 'ambush', 'guardStorehouse', 'protectCivilians', 'redeploy', 'reinforceRear',
  'fallback', 'advance', 'charge',
  'arson', 'blockEscape', 'openRetreat',
]);
const PREPARATION_ACTION_IDS = new Set<PreparationActionId>([
  'evacuateCivilians', 'hideSupplies', 'repairWall', 'setAmbush', 'prepareVolley',
  'firePrevention', 'torchWatch',
  'preliminaryBombardment', 'musterMilitia', 'nightAssault', 'prepareFireArrows',
  'blockLeaderEscape', 'lureGuards', 'setHuntTraps', 'placeBait', 'splitDrivers',
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

function migratePendingReport(raw: unknown, zoneIds: ReadonlySet<string>): TacticalRoundReport | null {
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
    wounded: Math.max(0, Number(report.wounded) || 0),
    treated: Math.max(0, Number(report.treated) || 0),
    killed: Math.max(0, Number(report.killed) || 0),
    raidersKilled: Math.max(0, Number(report.raidersKilled) || 0),
    loot: report.loot && typeof report.loot === 'object' ? report.loot : {},
    buildingsDamaged: Math.max(0, Number(report.buildingsDamaged) || 0),
    villageMoraleDelta: Number(report.villageMoraleDelta) || 0,
    raiderMoraleDelta: Number(report.raiderMoraleDelta) || 0,
    positionsApplied: report.positionsApplied === true,
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

function migratedFormationLinesAdjacent(from: TacticalFormationLine, to: TacticalFormationLine): boolean {
  const lines: readonly TacticalFormationLine[] = ['front', 'middle', 'rear'];
  return Math.abs(lines.indexOf(from) - lines.indexOf(to)) === 1;
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
    const count = ids.length;
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
    return [{
      ...group,
      id: typeof group.id === 'string' ? group.id : `migrated-defender-${index}`,
      kind, role, weapon,
      readyMuskets: weapon === 'musket' ? Math.min(count, Math.max(0, Math.floor(Number(group.readyMuskets) || count))) : 0,
      label: typeof group.label === 'string' ? group.label : String(group.id ?? kind),
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
      ambushed: group.ambushed === true,
      targetGroupId: typeof group.targetGroupId === 'string' ? group.targetGroupId : undefined,
      targetSource: group.targetSource === 'player' ? 'player' : 'auto',
      huntOriginGroupId: encounterKind === 'predatorHunt'
        ? (typeof group.huntOriginGroupId === 'string'
          ? group.huntOriginGroupId
          : String(group.id ?? `migrated-defender-${index}`))
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
      estimatedPower: Number.isFinite(group.estimatedPower) && Number(group.estimatedPower) >= 0
        ? Number(group.estimatedPower)
        : undefined,
      morale: Math.max(0, Math.min(100, Number(group.morale) || 0)),
      engagementsInZone: Math.max(0, Math.floor(Number(group.engagementsInZone) || 0)),
      flankPlan: group.flankPlan === 'rearAssault' || group.flankPlan === 'breakthrough' ? group.flankPlan : undefined,
      flankPlanRevealed: group.flankPlanRevealed === true,
      rearAssault: group.rearAssault === true,
      targetGroupId: typeof group.targetGroupId === 'string' ? group.targetGroupId : undefined,
      targetSource: 'ai',
    }];
  });
  const legacyFlankers = migratedRaiderGroups.find(group => group.kind === 'flankers');
  const enemyPlan = encounterKind === 'raidDefense'
    ? migrateEnemyPlan(source.enemyPlan, {
      flankPlan: legacyFlankers?.flankPlan === 'rearAssault' ? 'rearAssault' : 'breakthrough',
      revealed: legacyFlankers?.flankPlanRevealed === true,
    })
    : undefined;
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

  const reports = (Array.isArray(source.reports) ? source.reports : [])
    .filter(report => report && typeof report === 'object')
    .map(report => {
      const item = report as Record<string, unknown>;
      return {
        ...item,
        lines: Array.isArray(item.lines) ? item.lines.filter(line => typeof line === 'string') : [],
        events: Array.isArray(item.events) ? item.events : [],
        raidersKilled: Math.max(0, Number(item.raidersKilled) || 0),
      } as unknown as TacticalRoundReport;
    });
  const phase = String(source.phase);
  const pendingRequired = phase === 'simulating' || phase === 'report' || phase === 'finished';
  const pendingForbidden = phase === 'preparation' || phase === 'preparationExecution' ||
    phase === 'deployment' || phase === 'command';
  const pendingReport = source.pendingReport == null ? null : migratePendingReport(source.pendingReport, zoneIds);
  if (pendingRequired && !pendingReport) return null;
  if (pendingForbidden && source.pendingReport != null) return null;
  if (pendingReport && !reports.some(report => report.round === pendingReport.round &&
    report.focusZoneId === pendingReport.focusZoneId)) reports.push(pendingReport);
  const migrated = {
    ...source,
    encounterKind,
    orientation: encounterKind === 'raidDefense' ? 'defense' : 'assault',
    assaultKind: encounterKind === 'raidDefense' ? undefined : encounterKind,
    phase,
    prepActions: (Array.isArray(source.prepActions) ? source.prepActions : [])
      .flatMap(action => {
        const migratedAction = migratePreparationAction(action);
        return migratedAction ? [migratedAction] : [];
      }),
    preparationEvents: Array.isArray(source.preparationEvents) ? source.preparationEvents : [],
    zones,
    defenderGroups,
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
  const looted = Object.values(report.loot).some(amount => (amount ?? 0) > 1e-9);
  report.enemyRouted = report.enemyRouted === true || (
    report.encounterKind === 'raidDefense' && report.outcome === 'defenseSuccess' &&
    (Number(report.raiderMorale) <= 20 ||
      Number(report.raidersKilled) / Math.max(1, Number(report.raidersCommitted) || 0) >= 0.65)
  );
  const objective = report.encounterKind === 'raidDefense'
    ? raidDefenseObjectiveResult({
      factionName: report.factionName ?? report.enemyLabel,
      outcome: report.outcome,
      enemyRouted: report.enemyRouted,
      looted,
      defendersCommitted: Number(report.defendersCommitted) || 0,
      defendersKilled: report.killed.length,
      defendersWounded: report.wounded.length,
    })
    : null;
  if (objective) report.result = objective.result;
  report.closingSummary = typeof report.closingSummary === 'string' && report.closingSummary.length > 0
    ? report.closingSummary
    : tacticalClosingSummary(report.encounterKind, report.outcome, report.factionName ?? report.enemyLabel, {
      looted,
      enemyRouted: report.enemyRouted,
    });
  report.initialFriendlyPower = Math.max(1, Number(report.initialFriendlyPower) || Number(report.defendersCommitted) || 1);
  report.initialEnemyPower = Math.max(1, Number(report.initialEnemyPower) || Number(report.raidersCommitted) || 1);
  const migratedGrade = gradeTacticalBattle({
    encounterKind: report.encounterKind,
    result: report.result,
    friendlyPower: report.initialFriendlyPower,
    enemyPower: report.initialEnemyPower,
    defendersCommitted: Number(report.defendersCommitted) || 0,
    defendersKilled: report.killed.length,
    defendersWounded: report.wounded.length,
    enemiesCommitted: Number(report.raidersCommitted) || 0,
    enemiesKilled: Number(report.raidersKilled) || 0,
    loot: report.loot,
  });
  report.grade = objective?.forcedGrade ?? migratedGrade.grade;
  report.gradeScore = migratedGrade.score;
  report.resourceDelta = report.resourceDelta && typeof report.resourceDelta === 'object'
    ? report.resourceDelta
    : Object.fromEntries(Object.entries(report.loot).map(([id, amount]) =>
      [id, report.encounterKind === 'raidDefense' ? -Number(amount) : Number(amount)]));
  return report;
}

function normalizedAmount(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function migrateFermentBatches(raw: unknown): FermentBatch[] {
  if (!Array.isArray(raw)) return [];
  const batches: FermentBatch[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const source = entry as RawSave;
    const kind = source.kind === 'jang' || source.kind === 'kimchi' ? source.kind : null;
    const amount = normalizedAmount(source.amount);
    const readyOnDay = Math.floor(Number(source.readyOnDay));
    if (!kind || amount <= 0 || !Number.isFinite(readyOnDay) || readyOnDay < 1) continue;
    batches.push({ kind, amount, readyOnDay });
  }
  return batches;
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
  const legacyState = state as GameState & { tributeReserve?: unknown };
  state.tributeReserve = migrateResourceBag(legacyState.tributeReserve, false);
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
  if (state.pendingChoice && ['trade', 'tribute', 'petition'].includes(state.pendingChoice.kind)) {
    state.pendingChoice = null;
  }
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

export function saveGame(state: GameState, slot = 1): boolean {
  try {
    localStorage.setItem(slotKey(slot), JSON.stringify({
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
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    const decoded = JSON.parse(raw) as RawSave;
    const parsed = migrateToCurrent(decoded) as unknown as GameState;
    const legacyHuntRecoveryNeeded = (parsed as unknown as RawSave).legacyHuntRecoveryNeeded === true;
    // 최소한의 유효성 검사 (구버전 저장은 무시)
    if (!parsed.map || !parsed.residents || !parsed.resources || !parsed.buildings) return null;
    if (parsed.subTick == null || parsed.residents.some(r => r.x == null || r.px == null)) return null;
    for (const resident of parsed.residents) {
      if (typeof resident.origin !== 'string' || resident.origin.trim().length === 0) delete resident.origin;
      else resident.origin = resident.origin.trim();
    }
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
    ensureMineralDeposits(parsed.map);
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
    if (parsed.lastImmigrationDay == null) parsed.lastImmigrationDay = -999;
    if (!Number.isFinite(parsed.lastKimjangYear)) parsed.lastKimjangYear = 0;
    ensureIncidentState(parsed);
    ensureForeignSiteState(parsed);
    if (!Array.isArray(parsed.territoryViolations)) parsed.territoryViolations = [];
    migrateResourceTaxonomy(parsed);
    // 구버전 저장 마이그레이션: 없는 필드는 기본값으로 채운다
    if (!parsed.relations) parsed.relations = initRelations();
    if (!parsed.difficulty) parsed.difficulty = 'normal';
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
        CONFIG.difficulty[parsed.difficulty].habitatChance,
      );
    }
    // 승격 없는 구버전: 옛 승리(진보 승격)를 이뤘다면 보에서 이어간다
    if (!Object.prototype.hasOwnProperty.call(parsed, 'rank')) {
      parsed.rank = parsed.gameOver?.won ? 'bo' : 'settlement';
    }
    if (parsed.tributePaidStreak == null) parsed.tributePaidStreak = 0;
    parsed.unlockedLivestock = Array.isArray(parsed.unlockedLivestock)
      ? parsed.unlockedLivestock.filter(isImplementedLivestockId)
      : [];
    if (!parsed.unlockedLivestock.includes('chicken')) parsed.unlockedLivestock.push('chicken');
    for (const building of parsed.buildings) {
      if (building.built) building.repairing = false;
      if (building.type === 'smithy' && !building.smithyProduct) building.smithyProduct = 'tools';
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
      if (building.type === 'stable') building.livestock = normalizeLivestockState(building.livestock);
    }
    ensureProcessingReserves(parsed);
    if (parsed.lastPetitionDay == null) parsed.lastPetitionDay = 0;
    if (parsed.cannonsGranted == null) parsed.cannonsGranted = 0;
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
    // 세공 없는 구버전: 시드로 올해분을 재생성. 이미 겨울이면 올해분은 면제 (다음 봄부터 정상 진행)
    if (!Object.prototype.hasOwnProperty.call(parsed, 'courtTribute')) {
      const pop = parsed.residents.filter(r => r.alive).length;
      const tribute = rollCourtTribute(parsed.seed ?? 1, getYear(parsed.day), pop, parsed.rank);
      if (getSeason(parsed.day) === 'winter') {
        tribute.resolved = true;
        tribute.paid = true;
      }
      parsed.courtTribute = tribute;
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
    // 시나리오 저장: 코드의 튜토리얼 버전과 다르면 해제하고 일반 모드로 잇는다 (짧으니 재시작이 정답)
    if (parsed.scenario) {
      const scenario = parsed.scenario;
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
    rebuildBuildingFootprints(parsed);
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

export function hasSave(slot = 1): boolean {
  return localStorage.getItem(slotKey(slot)) != null;
}

export function hasAnySave(): boolean {
  for (let slot = 1; slot <= SAVE_SLOT_COUNT; slot++) {
    if (hasSave(slot)) return true;
  }
  return false;
}

export function clearSave(slot = 1): void {
  localStorage.removeItem(slotKey(slot));
}

export interface SaveSlotSummary {
  slot: number;
  exists: boolean;
  savedAt: number | null;
  day: number | null;
  population: number | null;
  rank: string | null;
  difficulty: string | null;
}

function emptySlotSummary(slot: number): SaveSlotSummary {
  return { slot, exists: false, savedAt: null, day: null, population: null, rank: null, difficulty: null };
}

// 슬롯 목록 UI용 요약 — 전체 마이그레이션 없이 원본 JSON의 표시 필드만 읽는다
export function readSaveSlotSummary(slot: number): SaveSlotSummary {
  const raw = localStorage.getItem(slotKey(slot));
  if (!raw) return emptySlotSummary(slot);
  try {
    const decoded = JSON.parse(raw) as RawSave;
    const day = Number(decoded.day);
    const savedAt = Number(decoded.savedAt);
    const residents = Array.isArray(decoded.residents) ? decoded.residents : [];
    return {
      slot,
      exists: true,
      savedAt: Number.isFinite(savedAt) ? savedAt : null,
      day: Number.isFinite(day) ? Math.max(1, Math.floor(day)) : null,
      population: residents.filter(entry => entry && typeof entry === 'object' &&
        (entry as RawSave).alive === true).length,
      rank: typeof decoded.rank === 'string' ? decoded.rank : null,
      difficulty: typeof decoded.difficulty === 'string' ? decoded.difficulty : null,
    };
  } catch {
    return { ...emptySlotSummary(slot), exists: true };
  }
}

export function readSaveSlotSummaries(): SaveSlotSummary[] {
  return Array.from({ length: SAVE_SLOT_COUNT }, (_, index) => readSaveSlotSummary(index + 1));
}
