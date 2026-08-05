// 저장 스키마 버전 사다리 — v3부터 CURRENT_SCHEMA_VERSION까지 한 단계씩 올리는
// migrateVxToVy들과 그 전용 헬퍼. 새 스키마를 올릴 때 단계 함수와 migrateToCurrent의
// 분기를 여기서 함께 추가한다.
// saveLoad.ts는 최종 결과(migrateToCurrent)만 쓰지만, 스키마 회귀 테스트가 단계 함수를
// 이름으로 직접 호출하므로 saveLoad에서 `export *`로 다시 내보낸다.
import { CONFIG } from './config';
import { normalizeDayCycleSubTick } from './dayCycle';
import { edictLevelDef, EDICT_ORDER } from './edicts';
import { normalizeDiscoveredSpecialItems, normalizeSpecialItemInventory } from './specialItems';
import { CURRENT_SCHEMA_VERSION } from './saveSchema';
import { initialAquiferLevels, initialOreVeinRemaining } from './subsurfaceVeins';
import { normalizeLivestockState } from './livestock';
import { normalizeResidentFamilyReferences } from './family';
import { withJosa } from './josa';
import { generateSettlementName } from './settlementName';
import {
  borderCommanderTermIndex, createBorderCommander, createFactionLeaders,
} from './diplomaticFigures';
import { defaultWorldSetupForDifficulty } from './newGameOptions';
import type {
  AnnalsEntry, AnnalsKind, Difficulty, EdictId, EdictLevel, EdictState, FermentBatch,
  LogEntry, Resident, SpecialItemId,
} from './types';

export function normalizedAmount(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

export function migrateFermentBatches(raw: unknown): FermentBatch[] {
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

export type RawSave = Record<string, unknown>;

export function clonedRecord(raw: unknown): RawSave {
  if (!raw || typeof raw !== 'object') return {};
  return JSON.parse(JSON.stringify(raw)) as RawSave;
}

function migrateV3ToV4(raw: RawSave): RawSave {
  return { ...raw, schemaVersion: 4 };
}

function migrateV4ToV5(raw: RawSave): RawSave {
  return {
    ...raw,
    weaponAssignments: raw.weaponAssignments && typeof raw.weaponAssignments === 'object' ? raw.weaponAssignments : {},
    weaponAllocationMode: raw.weaponAllocationMode === 'manual' ? 'manual' : 'auto',
    schemaVersion: 5,
  };
}

function migrateV5ToV6(raw: RawSave): RawSave {
  return {
    ...raw,
    tacticalBattle: Object.prototype.hasOwnProperty.call(raw, 'tacticalBattle') ? raw.tacticalBattle : null,
    tacticalBattleReport: Object.prototype.hasOwnProperty.call(raw, 'tacticalBattleReport') ? raw.tacticalBattleReport : null,
    schemaVersion: 6,
  };
}

function migrateV6ToV7(raw: RawSave): RawSave {
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
function migrateV19ToV20(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), schemaVersion: 20 };
}

// v21: 성분 기반 만족도·서당·종교(당집/암자) — 가산적
function migrateV20ToV21(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), schemaVersion: 21 };
}

// v22: 드래그 크기 경작지(w/h/sownArea)와 농우(plowOxen) — 가산적, 필드 기본값은 로드 정규화에서 채운다
function migrateV21ToV22(raw: RawSave): RawSave {
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

// v24: 만족도 도입 전(v21 이하) 고티어 저장의 새 기대 적응 기간.
// sourceVersion은 연속 마이그레이션 전의 실제 저장 버전이어야 현재 v22/v23 저장을 건드리지 않는다.
export function migrateV23ToV24(raw: RawSave, sourceVersion = 23): RawSave {
  const migrated = clonedRecord(raw);
  const legacyGameOver = migrated.gameOver;
  const legacyWon = legacyGameOver != null && typeof legacyGameOver === 'object'
    && (legacyGameOver as RawSave).won === true;
  const rank = String(migrated.rank ?? (legacyWon ? 'bo' : 'settlement'));
  if (sourceVersion <= 21 && rank !== 'settlement') {
    const day = typeof migrated.day === 'number' && Number.isFinite(migrated.day) ? migrated.day : 1;
    const existing = typeof migrated.expectationTransitionUntil === 'number'
      && Number.isFinite(migrated.expectationTransitionUntil)
      ? migrated.expectationTransitionUntil
      : 0;
    migrated.expectationTransitionUntil = Math.max(
      existing,
      day + CONFIG.satisfaction.legacyTransitionDays,
    );
    if (migrated.expectationTransitionNotified !== true) {
      migrated.expectationTransitionNotified = false;
    }
  }
  if (Array.isArray(migrated.residents)) {
    normalizeResidentFamilyReferences({ residents: migrated.residents as Resident[] });
  }
  migrated.schemaVersion = 24;
  return migrated;
}

// v25: 직접 지휘 전투의 빈 무대 배치·공통 분할·네임드 조 계약. 실제 전투 필드 정규화는
// migrateTacticalBattle에서 수행하고, 구버전 전투는 저장되어 있던 위치를 배치로 합성한다.
export function migrateV24ToV25(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), schemaVersion: 25 };
}

// v26: 직접 지휘 부대의 의미 기반 방향과 현재 라운드 방향전환 페널티 표식.
// 실제 구버전 방향 합성은 전투의 적 상태까지 함께 보는 migrateTacticalBattle에서 수행한다.
export function migrateV25ToV26(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), schemaVersion: 26 };
}

// v27: 직접 지휘 방어전의 좌·우 우회로, 가시성, 실제 이동 단계.
// 전투 내부 필드는 migrateTacticalBattle에서 필드 단위로 정규화한다.
export function migrateV26ToV27(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), schemaVersion: 27 };
}

// v28: route blockers, route-only engagement reports, and player rear raids.
export function migrateV27ToV28(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), schemaVersion: 28 };
}

// v29: explicit ammunition, reload, facing, and non-fatal recovery state for enemy support units.
export function migrateV28ToV29(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), schemaVersion: 29 };
}

// v30: completed-battle doctrine, composition, and flank-route result records.
// Report fields remain optional so older completed battles load without inventing history.
export function migrateV29ToV30(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), schemaVersion: 30 };
}

// v31: 승격 교지를 기물함에 영구 보관하고 중심지 업그레이드로 승격을 확정한다.
// 이미 승격한 구 저장은 지나온 단계의 교지를 소급 보관해 진행을 잃지 않는다.
export function migrateV30ToV31(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  const specialItems = normalizeSpecialItemInventory(migrated.specialItems);
  const discovered = new Set(normalizeDiscoveredSpecialItems(migrated.discoveredSpecialItems));
  const rank = String(migrated.rank ?? 'settlement');
  const achieved: SpecialItemId[] = rank === 'bu'
    ? ['boDecree', 'jinDecree', 'buDecree']
    : rank === 'jin'
      ? ['boDecree', 'jinDecree']
      : rank === 'bo' ? ['boDecree'] : [];
  for (const item of achieved) {
    specialItems[item] = Math.max(1, Number(specialItems[item]) || 0);
    discovered.add(item);
  }
  for (const item of ['boDecree', 'jinDecree', 'buDecree'] as const) {
    specialItems[item] = Math.max(0, Number(specialItems[item]) || 0);
  }
  migrated.specialItems = specialItems;
  migrated.discoveredSpecialItems = [...discovered];
  migrated.pendingPromotionNotice = null;
  migrated.schemaVersion = 31;
  return migrated;
}

// v32: 신규 중심지는 3×2로 시작한다. 이미 배치가 끝난 구 저장은 인접 건물과
// 겹치지 않도록 기존 2×2 발자국을 명시적으로 보존한다.
export function migrateV31ToV32(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  if (Array.isArray(migrated.buildings)) {
    migrated.buildings = migrated.buildings.map(value => {
      if (!value || typeof value !== 'object') return value;
      const building = { ...value as RawSave };
      if (building.type === 'center') {
        building.w = Number.isFinite(Number(building.w)) ? Number(building.w) : 2;
        building.h = 2;
      }
      return building;
    });
  }
  migrated.schemaVersion = 32;
  return migrated;
}

function deterministicSilverAmount(raw: RawSave, vein: RawSave): number {
  const span = CONFIG.minerals.silverMax - CONFIG.minerals.silverMin + 1;
  const seed = Number(raw.seed) || 0;
  const x = Number(vein.x) || 0;
  const y = Number(vein.y) || 0;
  const day = Number(vein.discoveredDay) || 0;
  const hash = ((seed * 73856093) ^ (x * 19349663) ^ (y * 83492791) ^ (day * 2654435761)) >>> 0;
  return CONFIG.minerals.silverMin + (hash % span);
}

// v33: 은맥 매장량은 최초 발견 순간 한 번만 확정하며, 묻은 뒤 자동 재제안하지 않는다.
export function migrateV32ToV33(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  if (migrated.silverVein && typeof migrated.silverVein === 'object') {
    const silverVein = { ...migrated.silverVein as RawSave };
    if (!Number.isFinite(Number(silverVein.discoveredAmount))) {
      const x = Math.floor(Number(silverVein.x));
      const y = Math.floor(Number(silverVein.y));
      const row = Array.isArray(migrated.map) ? migrated.map[y] : null;
      const tile = Array.isArray(row) ? row[x] : null;
      const remaining = tile && typeof tile === 'object' ? Number((tile as RawSave).mineralRemaining) : NaN;
      const mined = Math.max(0, Number(silverVein.minedTotal) || 0);
      silverVein.discoveredAmount = (silverVein.status === 'secret' || silverVein.status === 'sanctioned') && Number.isFinite(remaining)
        ? Math.max(0, remaining + mined)
        : deterministicSilverAmount(migrated, silverVein);
    }
    migrated.silverVein = silverVein;
  }
  migrated.schemaVersion = 33;
  return migrated;
}

function migrateRawTacticalRouteTransit(
  value: unknown,
  fallbackLine: unknown,
  side: 'defender' | 'raider',
): unknown {
  if (!value || typeof value !== 'object') return value;
  const transit = { ...value as RawSave };
  const originZoneId = typeof transit.originZoneId === 'string' ? transit.originZoneId : 'approach';
  const reverse = originZoneId === 'storehouse';
  if (transit.node !== 'approachGate' && transit.node !== 'middle' && transit.node !== 'storehouseGate') {
    transit.node = transit.step === 1
      ? 'middle'
      : transit.step === 2
        ? (reverse ? 'approachGate' : 'storehouseGate')
        : (reverse ? 'storehouseGate' : 'approachGate');
  }
  if (transit.purpose === 'raid' ||
      (transit.purpose !== 'block' && transit.purpose !== 'move' && transit.purpose !== 'return' &&
        transit.purpose !== 'transfer')) {
    transit.purpose = 'flank';
  }
  if (side === 'defender' && typeof transit.returnZoneId !== 'string' &&
      originZoneId === 'approach' && transit.destinationZoneId === 'wall') {
    transit.destinationZoneId = 'storehouse';
  }
  if (transit.destinationLine !== 'front' && transit.destinationLine !== 'middle' && transit.destinationLine !== 'rear') {
    transit.destinationLine = fallbackLine === 'front' || fallbackLine === 'middle' || fallbackLine === 'rear'
      ? fallbackLine
      : 'rear';
  }
  if (transit.destinationNode !== 'approachGate' && transit.destinationNode !== 'middle' &&
      transit.destinationNode !== 'storehouseGate') {
    transit.destinationNode = transit.purpose === 'block'
      ? transit.node
      : transit.destinationZoneId === 'approach' ? 'approachGate' : 'storehouseGate';
  }
  return transit;
}

// v34: 우회로를 정식 전투 무대로 표시하기 위한 양측 endpoint, 물리 node, 목적 열을 저장한다.
// 구형 step은 라운드 판정 호환용으로 보존하되 새 UI와 저장 복원은 node를 기준으로 삼는다.
export function migrateV33ToV34(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  if (migrated.tacticalBattle && typeof migrated.tacticalBattle === 'object') {
    const battle = { ...migrated.tacticalBattle as RawSave };
    if (Array.isArray(battle.flankRoutes)) {
      battle.flankRoutes = battle.flankRoutes.map(value => {
        if (!value || typeof value !== 'object') return value;
        return {
          ...value as RawSave,
          approachZoneId: 'approach',
          interiorZoneId: 'storehouse',
        };
      });
    }
    for (const key of ['defenderGroups', 'raiderGroups']) {
      if (!Array.isArray(battle[key])) continue;
      battle[key] = (battle[key] as unknown[]).map(value => {
        if (!value || typeof value !== 'object') return value;
        const group = { ...value as RawSave };
        if (group.routeTransit) {
          group.routeTransit = migrateRawTacticalRouteTransit(
            group.routeTransit,
            group.line,
            key === 'defenderGroups' ? 'defender' : 'raider',
          );
        }
        return group;
      });
    }
    migrated.tacticalBattle = battle;
  }
  migrated.schemaVersion = 34;
  return migrated;
}

// v35: 하루를 8 노동 서브틱에서 새벽1·노동8·저녁1·밤2의 12서브틱으로 확장한다.
// 구버전의 0~7은 생산 대역 1~8로 그대로 옮겨 진행 중이던 phase/path/carry를 보존한다.
export function migrateV34ToV35(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  const numeric = Number(migrated.subTick);
  const legacySubTick = Number.isFinite(numeric)
    ? Math.min(7, Math.max(0, Math.floor(numeric)))
    : 0;
  migrated.subTick = legacySubTick + 1;
  migrated.schemaVersion = 35;
  return migrated;
}

// v36: 12서브틱 하루를 같은 실시간 틱 cadence의 72서브틱 하루로 확장한다.
// 현재 대역 안에서의 상대 위치를 새 대역으로 옮기며 주민 phase/path/carry는 건드리지 않는다.
export function migrateV35ToV36(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  const numeric = Number(migrated.subTick);
  const oldSubTick = Number.isFinite(numeric)
    ? Math.min(11, Math.max(0, Math.floor(numeric)))
    : 0;
  const oldBands = [
    { start: 0, end: 0, nextStart: 0, nextEnd: 8 },
    { start: 1, end: 8, nextStart: 9, nextEnd: 44 },
    { start: 9, end: 9, nextStart: 45, nextEnd: 57 },
    { start: 10, end: 11, nextStart: 58, nextEnd: 71 },
  ];
  const band = oldBands.find(range => oldSubTick >= range.start && oldSubTick <= range.end)!;
  const oldLength = band.end - band.start + 1;
  const nextLength = band.nextEnd - band.nextStart + 1;
  const relativeMidpoint = (oldSubTick - band.start + 0.5) / oldLength;
  migrated.subTick = band.nextStart + Math.min(
    nextLength - 1,
    Math.floor(relativeMidpoint * nextLength),
  );
  migrated.schemaVersion = 36;
  return migrated;
}

// 절목 상태를 정규화한다. 모르는 령·단계는 버리고, 반포일이 없으면 오늘로 본다.
export function normalizedEdicts(raw: unknown, day: number): Partial<Record<EdictId, EdictState>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Partial<Record<EdictId, EdictState>> = {};
  for (const [id, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!EDICT_ORDER.includes(id as EdictId)) continue;
    const candidate = entry as { level?: unknown; sinceDay?: unknown } | null;
    const level = candidate?.level as EdictLevel;
    if (!edictLevelDef(id as EdictId, level)) continue;
    const since = candidate?.sinceDay;
    result[id as EdictId] = {
      level,
      sinceDay: typeof since === 'number' && Number.isFinite(since) ? since : day,
    };
  }
  return result;
}

// v37: 절목(節目) 도입. 구버전 저장은 반포한 령이 없는 상태 = 전부 평시로 시작한다.
export function migrateV36ToV37(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  const day = Number.isFinite(migrated.day) ? Number(migrated.day) : 1;
  migrated.edicts = normalizedEdicts(migrated.edicts, day);
  migrated.edictWhiplashUntil = 0;
  migrated.schemaVersion = 37;
  return migrated;
}

// v38: 축사별 방목 영역. 구버전 축사는 기존 실내 수용량을 유지하고 새로 지정할 수 있다.
export function migrateV37ToV38(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), schemaVersion: 38 };
}

// v39: 창고의 의복을 개인 착용 상태로 이전한다. 구 저장의 보온 수준이 갑자기
// 사라지지 않도록 생존 주민에게 좋은 옷부터 한 벌씩 배분하고 창고 수량은 그만큼 뺀다.
export function migrateV38ToV39(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  const resources = migrated.resources && typeof migrated.resources === 'object'
    ? migrated.resources as Record<string, unknown>
    : {};
  resources.strawShoes = normalizedAmount(resources.strawShoes);
  resources.leatherShoes = normalizedAmount(resources.leatherShoes);
  const residents = Array.isArray(migrated.residents)
    ? (migrated.residents.filter(entry => entry && typeof entry === 'object') as RawSave[])
      .slice()
    : [];
  residents.sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0));
  for (const resident of residents) {
    if (resident.alive === false) continue;
    const worn = resident.worn && typeof resident.worn === 'object'
      ? resident.worn as RawSave
      : {};
    if (worn.clothing) continue;
    const resource = normalizedAmount(resources.hideClothes) >= 1
      ? 'hideClothes'
      : normalizedAmount(resources.cottonClothes) >= 1
        ? 'cottonClothes'
        : null;
    if (!resource) break;
    resources[resource] = normalizedAmount(resources[resource]) - 1;
    worn.clothing = { resource, wear: 0.5 };
    resident.worn = worn;
  }
  migrated.resources = resources;
  migrated.schemaVersion = 39;
  return migrated;
}

// v40: 하사 전용 기물의 5회째 보장 횟수. 구 저장은 아직 적격 하사를 놓치지 않은 것으로 시작한다.
export function migrateV39ToV40(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  const misses = Math.floor(Number(migrated.courtGrantArtifactMisses));
  migrated.courtGrantArtifactMisses = Number.isFinite(misses) ? Math.max(0, misses) : 0;
  migrated.schemaVersion = 40;
  return migrated;
}

// v41: 정기거래 계약. 구버전 저장에는 맺어 둔 계약도 계약고도 없다.
export function migrateV40ToV41(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  migrated.tradeContracts = [];
  migrated.tradeContractReserve = {};
  migrated.schemaVersion = 41;
  return migrated;
}

// v42: 후속 하사품의 설치·고유 무기 배정 상태. 구 저장은 현판 미설치·무기 미배정으로 시작한다.
export function migrateV41ToV42(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  migrated.royalPlaqueBuildingId = null;
  migrated.artifactWeaponAssignments = {};
  migrated.schemaVersion = 42;
  return migrated;
}

// v43: 연대기 — 정착지 이름·사건 기록·평생 통계·연도별 스냅샷.
// 이름은 시드의 순수 함수라 같은 저장을 다시 마이그레이션해도 바뀌지 않는다.
// 연대기는 로그의 important 항목만큼만 복원한다 (로그가 잘려 있어 불완전함을 감수).
export function migrateV42ToV43(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  const seed = Number.isFinite(Number(migrated.seed)) ? Number(migrated.seed) : 1;
  const day = Math.max(1, Math.floor(Number(migrated.day) || 1));
  const name = generateSettlementName(seed);
  migrated.settlementName = name;
  migrated.pendingSettlementRename = null;
  migrated.settlementRenameCooldownUntil = 0;

  const annals: AnnalsEntry[] = [{
    day: 1,
    kind: 'founding',
    text: `조정의 명을 받아 두만강 이북에 ${withJosa(name, '을/를')} 열었습니다.`,
    dedupeKey: 'founding',
  }];
  const log = Array.isArray(migrated.log) ? migrated.log : [];
  for (const entry of log as Array<Partial<LogEntry>>) {
    if (!entry || entry.important !== true) continue;
    if (typeof entry.text !== 'string' || !entry.text) continue;
    const kind: AnnalsKind = entry.kind === 'raid' ? 'raid' : entry.kind === 'trade' ? 'trade' : 'legacy';
    annals.push({ day: Math.max(1, Math.floor(Number(entry.day) || 1)), kind, text: entry.text });
  }
  if (day > 1) {
    annals.push({
      day,
      kind: 'legacy',
      text: '이전 기록은 남아 있는 주요 소식만 복원되었습니다.',
      dedupeKey: 'legacy:migration',
    });
  }
  migrated.annals = annals;

  migrated.lifetimeStats = {
    trackingSinceDay: day,
    births: 0,
    deathsByCause: { combat: 0, starvation: 0, cold: 0, disease: 0, other: 0 },
    raidsRepelled: 0,
    raidsSuffered: 0,
    tradesCompleted: 0,
    grantsReceived: 0,
  };
  // 첫 스냅샷은 로드 정규화에서 실제 상태로 찍는다 (원시 저장만으로는 산식을 돌릴 수 없다).
  migrated.yearlySnapshots = [];
  migrated.schemaVersion = 43;
  return migrated;
}

// v44: 선택 뒤 실제 날씨·일일 진행으로 판정하는 재해 대기열.
// 구 저장에는 진행 중인 지연 재해가 없으므로 빈 배열로 시작한다.
export function migrateV43ToV44(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  migrated.pendingDisasters = [];
  migrated.schemaVersion = 44;
  return migrated;
}

// v45: 시드에서 재계산하는 수맥·지하 광맥 기하와, 저장해야 하는 수위·잔량 배열.
// 구 저장은 모든 지하 자원을 만수위·만재 상태로 시작한다.
export function migrateV44ToV45(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  const map = Array.isArray(migrated.map) ? migrated.map as unknown[][] : [];
  const width = Array.isArray(map[0]) ? map[0].length : 0;
  const height = map.length;
  const seed = Number.isFinite(Number(migrated.seed)) ? Number(migrated.seed) : 1;
  migrated.aquiferLevels = initialAquiferLevels(seed, width, height, 'plains');
  migrated.oreVeinRemaining = initialOreVeinRemaining(seed, width, height, 'plains');
  migrated.schemaVersion = 45;
  return migrated;
}

// v46: 평시 화재는 pendingDisasters 안에 불길·진화 주민 상태를 보관한다.
// 구 저장에는 활성 화재가 없으므로 별도 필드를 만들지 않고 버전만 올린다.
export function migrateV45ToV46(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), schemaVersion: 46 };
}

// v47: 갱도 붕괴는 pendingDisasters와 주민의 선택형 매몰 상태를 보관한다.
// 구 저장에는 진행 중인 붕괴가 없으므로 버전만 올린다.
export function migrateV46ToV47(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), schemaVersion: 47 };
}

// v48: 외교 인물은 시드와 현재 임기에서 결정적으로 생성한다.
// 구 저장을 여는 행위만으로 과거 부임 로그를 만들지는 않는다.
export function migrateV47ToV48(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  const seed = Number.isFinite(Number(migrated.seed)) ? Number(migrated.seed) : 1;
  const day = Number.isFinite(Number(migrated.day)) ? Math.max(1, Math.floor(Number(migrated.day))) : 1;
  const termIndex = borderCommanderTermIndex(day);
  return {
    ...migrated,
    factionLeaders: createFactionLeaders(seed),
    borderCommander: createBorderCommander(seed, termIndex),
    schemaVersion: 48,
  };
}

// v49: 능동 외교의 사절·맹약·협정 상태. 구 저장에는 진행 중인 사절이 없다.
export function migrateV48ToV49(raw: RawSave): RawSave {
  return {
    ...clonedRecord(raw),
    diplomaticPacts: [],
    claimAccords: [],
    pendingEnvoys: [],
    giftEnvoyDays: {},
    proximityWarnings: [],
    schemaVersion: 49,
  };
}

// v50: 외교 근접 경고는 완충 작업·거점 배회 일수를 저장한다.
// 기존 저장은 아직 경고를 시작하지 않은 것으로 보아 빈 진행값에서 다시 센다.
export function migrateV49ToV50(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), proximityWarningProgress: {}, schemaVersion: 50 };
}

// v51: 생활권 협정 사절은 대상 구역과 출발 당시 고정한 만료일을 함께 저장한다.
// v50 저장에는 진행 중인 협정 사절이 없으므로 기존 외교 상태를 그대로 둔다.
export function migrateV50ToV51(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  if (Array.isArray(migrated.territoryViolations)) {
    migrated.territoryViolations = migrated.territoryViolations.map(entry => ({
      ...(entry && typeof entry === 'object' ? entry as RawSave : {}),
      zoneIds: Array.isArray((entry as RawSave)?.zoneIds)
        ? ((entry as RawSave).zoneIds as unknown[]).filter(Number.isFinite).map(value => Math.max(0, Math.floor(Number(value)))).slice(0, 24)
        : [],
    }));
  }
  migrated.schemaVersion = 51;
  return migrated;
}

// v52: 산채 원병 대기/합류와 부족 전쟁 민병 파견 상태를 저장한다.
export function migrateV51ToV52(raw: RawSave): RawSave {
  return {
    ...clonedRecord(raw),
    militaryAid: null,
    warDispatch: null,
    lastWarParticipationOfferYear: 0,
    schemaVersion: 52,
  };
}

// v53: 초회 도움말(guides) 상태. 이미 시스템을 아는 진행 중인 마을에 뒤늦은 안내가
// 쏟아지지 않도록 구버전 저장은 꺼진 상태로 보정한다. 새 게임만 켜진 채 시작한다.
function migrateV52ToV53(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), guides: { enabled: false, seen: {} }, schemaVersion: 53 };
}

// v54: 방어 지형 revision과 성벽 구조 내구. 구 습격의 siege/path는 그대로 두고
// 새 경로·돌파 단계는 로드 중 임의로 만들지 않는다.
function migrateV53ToV54(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), defenseTopologyRevision: 0, schemaVersion: 54 };
}

// v55: P3 장기 공성 상태 자리. 구 RaiderBand.siege는 호환 의미로만 남기며
// 진행 정보가 없는 저장에서 SiegeState를 합성하지 않는다.
function migrateV54ToV55(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), siegeState: null, schemaVersion: 55 };
}

// v56: P4 망루 사격 궤적·일일 상한·철수 상태. 구 저장의 망루에는 파수꾼을 강제 배정하지 않는다.
export function migrateV55ToV56(raw: RawSave): RawSave {
  return {
    ...clonedRecord(raw),
    watchtowerProjectiles: [],
    nextWatchtowerProjectileId: 1,
    schemaVersion: 56,
  };
}

// v57: 새 게임 설정 스냅샷. 구 저장은 기존 난이도의 밸런스를 보존한 평원·중형으로 잇는다.
export function migrateV56ToV57(raw: RawSave): RawSave {
  const cloned = clonedRecord(raw);
  const difficulty: Difficulty = cloned.difficulty === 'easy' || cloned.difficulty === 'hard'
    ? cloned.difficulty
    : 'normal';
  return {
    ...cloned,
    worldSetup: defaultWorldSetupForDifficulty(difficulty, 'legacy'),
    schemaVersion: 57,
  };
}

// v58: 낚시터·갯벌·호수·바다가 공유하는 유한 어장. 실제 비축 환산은 지형 정규화 뒤 수행한다.
export function migrateV57ToV58(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), fishingGrounds: [], schemaVersion: 58 };
}

// v59: 포구에 계류되는 개별 어선과 다음 선체 ID. 구 저장은 빈 선단으로 시작한다.
function migrateV58ToV59(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), fishingBoats: [], nextFishingBoatId: 1, schemaVersion: 59 };
}

// v60: 호수 출어 중인 어선의 표적 어장·예상 어획·항해 거리·조업 진행 상태.
export function migrateV59ToV60(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), schemaVersion: 60 };
}

// v61: 포구별 좌우 계류 슬롯과 어선별 최대 2인 승무원 배정, 건조 중 선체 엔티티.
export function migrateV60ToV61(raw: RawSave): RawSave {
  return { ...clonedRecord(raw), schemaVersion: 61 };
}

// v62: 빗물 저수조의 액체 저수량·눈 저장량·고갈 경고 날짜.
export function migrateV61ToV62(raw: RawSave): RawSave {
  const migrated = clonedRecord(raw);
  if (Array.isArray(migrated.buildings)) {
    for (const entry of migrated.buildings) {
      if (!entry || typeof entry !== 'object') continue;
      const building = entry as RawSave;
      if (building.type !== 'rainwaterCistern') continue;
      building.cisternStored = normalizedAmount(building.cisternStored);
      building.cisternSnowStored = normalizedAmount(building.cisternSnowStored);
      delete building.cisternDryWarningDay;
    }
  }
  migrated.schemaVersion = 62;
  return migrated;
}

export function migrateToCurrent(raw: unknown): RawSave {
  let migrated = clonedRecord(raw);
  const sourceVersion = Number.isInteger(migrated.schemaVersion) ? Number(migrated.schemaVersion) : 3;
  let version = sourceVersion;
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
    else if (version === 23) migrated = migrateV23ToV24(migrated, sourceVersion);
    else if (version === 24) migrated = migrateV24ToV25(migrated);
    else if (version === 25) migrated = migrateV25ToV26(migrated);
    else if (version === 26) migrated = migrateV26ToV27(migrated);
    else if (version === 27) migrated = migrateV27ToV28(migrated);
    else if (version === 28) migrated = migrateV28ToV29(migrated);
    else if (version === 29) migrated = migrateV29ToV30(migrated);
    else if (version === 30) migrated = migrateV30ToV31(migrated);
    else if (version === 31) migrated = migrateV31ToV32(migrated);
    else if (version === 32) migrated = migrateV32ToV33(migrated);
    else if (version === 33) migrated = migrateV33ToV34(migrated);
    else if (version === 34) migrated = migrateV34ToV35(migrated);
    else if (version === 35) migrated = migrateV35ToV36(migrated);
    else if (version === 36) migrated = migrateV36ToV37(migrated);
    else if (version === 37) migrated = migrateV37ToV38(migrated);
    else if (version === 38) migrated = migrateV38ToV39(migrated);
    else if (version === 39) migrated = migrateV39ToV40(migrated);
    else if (version === 40) migrated = migrateV40ToV41(migrated);
    else if (version === 41) migrated = migrateV41ToV42(migrated);
    else if (version === 42) migrated = migrateV42ToV43(migrated);
    else if (version === 43) migrated = migrateV43ToV44(migrated);
    else if (version === 44) migrated = migrateV44ToV45(migrated);
    else if (version === 45) migrated = migrateV45ToV46(migrated);
    else if (version === 46) migrated = migrateV46ToV47(migrated);
    else if (version === 47) migrated = migrateV47ToV48(migrated);
    else if (version === 48) migrated = migrateV48ToV49(migrated);
    else if (version === 49) migrated = migrateV49ToV50(migrated);
    else if (version === 50) migrated = migrateV50ToV51(migrated);
    else if (version === 51) migrated = migrateV51ToV52(migrated);
    else if (version === 52) migrated = migrateV52ToV53(migrated);
    else if (version === 53) migrated = migrateV53ToV54(migrated);
    else if (version === 54) migrated = migrateV54ToV55(migrated);
    else if (version === 55) migrated = migrateV55ToV56(migrated);
    else if (version === 56) migrated = migrateV56ToV57(migrated);
    else if (version === 57) migrated = migrateV57ToV58(migrated);
    else if (version === 58) migrated = migrateV58ToV59(migrated);
    else if (version === 59) migrated = migrateV59ToV60(migrated);
    else if (version === 60) migrated = migrateV60ToV61(migrated);
    else if (version === 61) migrated = migrateV61ToV62(migrated);
    else break;
    version = Number(migrated.schemaVersion);
  }
  migrated.subTick = normalizeDayCycleSubTick(migrated.subTick);
  migrated.schemaVersion = CURRENT_SCHEMA_VERSION;
  return migrated;
}

