import { combatGroupLabel } from './combatCapabilities';
import { CONFIG } from './config';
import { specialResidentDefinition } from './specialResidents';
import { syncTacticalRouteControl } from './tacticalRoutes';
import type { CombatantSnapshot } from './combatRoster';
import type {
  GameState,
  TacticalBattle,
  TacticalDefenderGroup,
  TacticalDeploymentPlacement,
  TacticalFeaturedResident,
} from './types';

export interface TacticalDeploymentGroupView {
  groupId: string;
  cohortId: string;
  label: string;
  count: number;
  power: number;
  kind: TacticalDefenderGroup['kind'];
  role: TacticalDefenderGroup['role'];
  weapon: TacticalDefenderGroup['weapon'];
  required: boolean;
  placement: TacticalDeploymentPlacement | null;
  featuredResidents: readonly TacticalFeaturedResident[];
}

export interface TacticalDeploymentView {
  waiting: TacticalDeploymentGroupView[];
  placed: TacticalDeploymentGroupView[];
  fixed: TacticalDeploymentGroupView[];
  complete: boolean;
  unavailableReason: string | null;
  forced?: TacticalBattle['deploymentForced'];
}

function activeCount(group: TacticalDefenderGroup): number {
  return Math.max(0, group.count - group.wounded - group.killed);
}

function preparationApplied(battle: TacticalBattle, id: string): boolean {
  return battle.prepActions.some(action => action.id === id && action.applied);
}

function isRequiredGroup(group: TacticalDefenderGroup): boolean {
  return group.commandable !== false && activeCount(group) > 0;
}

function baseGroupLabel(group: TacticalDefenderGroup): string {
  return group.baseLabel ?? combatGroupLabel(group.role, group.weapon);
}

function applyFeaturedLabel(group: TacticalDefenderGroup): void {
  const featured = group.featuredResidents?.[0];
  const baseLabel = baseGroupLabel(group);
  group.baseLabel = baseLabel;
  group.label = featured ? `${featured.shortName}의 ${baseLabel}` : baseLabel;
  group.special = featured?.special;
}

const COHORT_GROUP_ORDINALS = ['갑조', '을조', '병조'] as const;

function cohortGroupOrdinal(index: number): string {
  return COHORT_GROUP_ORDINALS[index] ?? `${index + 1}조`;
}

export function tacticalFeaturedResidentsFromSnapshots(
  state: GameState,
  snapshots: readonly CombatantSnapshot[],
): TacticalFeaturedResident[] {
  return snapshots.flatMap(snapshot => {
    if (!snapshot.special) return [];
    const resident = state.residents.find(candidate => candidate.id === snapshot.residentId);
    if (!resident) return [];
    const definition = specialResidentDefinition(snapshot.special);
    return [{
      residentId: snapshot.residentId,
      special: snapshot.special,
      name: resident.name,
      shortName: definition.shortName,
      traitLabel: (definition.skills ?? []).map(skill => skill.name).join(' · ') || definition.epithet,
      spriteScale: CONFIG.tacticalBattle.deployment.featuredSpriteScale,
      ...(snapshot.origin ? { origin: snapshot.origin } : {}),
    }];
  });
}

/**
 * 이름 있는 전투 주민을 호환 일반 조에 합친다. 특수주민의 전투 특기는 group.special을 통해
 * 소속 조 전체에 적용되고, featuredResidents는 화면 식별용 개별 주민 정보를 보존한다.
 */
export function attachFeaturedResidentsToTacticalGroups(
  groups: TacticalDefenderGroup[],
): TacticalDefenderGroup[] {
  const working = [...groups];
  for (const featuredGroup of [...working]) {
    const featured = featuredGroup.featuredResidents?.[0];
    if (!featured) continue;
    featuredGroup.baseLabel ??= combatGroupLabel(featuredGroup.role, featuredGroup.weapon);
    const featuredCount = featuredGroup.featuredResidents?.length ?? 0;
    const alreadyHasCompanions = featuredGroup.count > featuredCount;
    const target = alreadyHasCompanions ? undefined : working
      .filter(candidate => candidate !== featuredGroup && !(candidate.featuredResidents?.length) &&
        candidate.role === featuredGroup.role && candidate.weapon === featuredGroup.weapon &&
        candidate.mount === featuredGroup.mount && candidate.kind !== 'civilian')
      .sort((left, right) =>
        Number(right.origin === featuredGroup.origin) - Number(left.origin === featuredGroup.origin) ||
        right.count - left.count || left.id.localeCompare(right.id))[0];
    if (!target) {
      applyFeaturedLabel(featuredGroup);
      continue;
    }
    target.baseLabel ??= target.label;
    target.residentIds = [...new Set([...target.residentIds, ...featuredGroup.residentIds])].sort((a, b) => a - b);
    target.count = target.residentIds.length;
    target.power += featuredGroup.power;
    target.readyMuskets = (target.readyMuskets ?? 0) + (featuredGroup.readyMuskets ?? 0);
    target.featuredResidents = [...(featuredGroup.featuredResidents ?? [])];
    target.special = featured.special;
    applyFeaturedLabel(target);
    const index = working.indexOf(featuredGroup);
    if (index >= 0) working.splice(index, 1);
  }
  for (const group of working) {
    group.baseLabel ??= group.label;
    group.deploymentCohortId ??= group.id;
    applyFeaturedLabel(group);
  }
  return working;
}

export function defaultTacticalDeploymentPlacement(
  battle: Pick<TacticalBattle, 'encounterKind' | 'orientation' | 'assaultKind' | 'prepActions'>,
  group: TacticalDefenderGroup,
): TacticalDeploymentPlacement {
  if (group.kind === 'civilian') return { zoneId: 'center', line: 'rear', fixed: true };
  if (battle.assaultKind === 'predatorHunt') {
    return { zoneId: 'huntSectorRidge', line: group.kind === 'healer' ? 'rear' : group.line };
  }
  if (battle.orientation === 'assault') {
    return { zoneId: 'lairTrail', line: group.kind === 'healer' ? 'rear' : group.line };
  }
  const zoneId = group.kind === 'hunter'
    ? 'approach'
    : group.id.includes('-levy') ? 'storehouse' : 'wall';
  return {
    zoneId,
    line: group.kind === 'healer' ? 'rear' : group.line,
    ...(group.kind === 'hunter' && preparationApplied(battle as TacticalBattle, 'setAmbush')
      ? { hidden: true }
      : {}),
  };
}

function syncGroupPlacement(
  group: TacticalDefenderGroup,
  placement: TacticalDeploymentPlacement | null,
): void {
  group.routeTransit = undefined;
  if (!placement) {
    group.zoneId = '';
    group.pendingLine = undefined;
    group.ambushed = false;
    return;
  }
  group.zoneId = placement.zoneId;
  group.line = placement.line;
  group.pendingLine = undefined;
  group.ambushed = placement.hidden === true;
}

export function initializeTacticalDeployment(battle: TacticalBattle): void {
  const placements: Record<string, TacticalDeploymentPlacement | null> = {};
  for (const group of battle.defenderGroups) {
    group.deploymentCohortId ??= group.id;
    group.baseLabel ??= group.label;
    const placement = isRequiredGroup(group) ? null : defaultTacticalDeploymentPlacement(battle, group);
    placements[group.id] = placement;
    syncGroupPlacement(group, placement);
  }
  battle.deploymentPlacements = placements;
  battle.deploymentSerial ??= 0;
  battle.deploymentGroupAliases ??= {};
  syncTacticalRouteControl(battle);
}

export function registerTacticalDeploymentGroup(battle: TacticalBattle, group: TacticalDefenderGroup): void {
  group.deploymentCohortId ??= group.id;
  group.baseLabel ??= group.label;
  battle.deploymentPlacements ??= {};
  const placement = isRequiredGroup(group) ? null : defaultTacticalDeploymentPlacement(battle, group);
  battle.deploymentPlacements[group.id] = placement;
  syncGroupPlacement(group, placement);
}

export function autoDeployTacticalGroups(
  battle: TacticalBattle,
): Record<string, TacticalDeploymentPlacement | null> {
  return Object.fromEntries(battle.defenderGroups.map(group => [
    group.id,
    activeCount(group) > 0 ? defaultTacticalDeploymentPlacement(battle, group) : null,
  ]));
}

export function applyAutoDeployTacticalGroups(
  battle: TacticalBattle,
  forced?: TacticalBattle['deploymentForced'],
): void {
  const defaults = autoDeployTacticalGroups(battle);
  const placements = Object.fromEntries(battle.defenderGroups.map(group => {
    const current = battle.deploymentPlacements?.[group.id];
    const keepRoutePlacement = current?.routeId != null && group.routeTransit?.routeId === current.routeId;
    return [group.id, keepRoutePlacement ? current : defaults[group.id] ?? null];
  })) as Record<string, TacticalDeploymentPlacement | null>;
  battle.deploymentPlacements = placements;
  battle.deploymentForced = forced;
  for (const group of battle.defenderGroups) {
    const placement = placements[group.id] ?? null;
    if (placement?.routeId && group.routeTransit?.routeId === placement.routeId) continue;
    syncGroupPlacement(group, placement);
  }
  syncTacticalRouteControl(battle);
}

export function resetTacticalDeployment(battle: TacticalBattle): void {
  initializeTacticalDeployment(battle);
  battle.deploymentForced = undefined;
}

function samePlacement(
  left: TacticalDeploymentPlacement | null | undefined,
  right: TacticalDeploymentPlacement | null | undefined,
): boolean {
  if (!left || !right) return left == null && right == null;
  return left.zoneId === right.zoneId && left.line === right.line &&
    left.hidden === right.hidden && left.fixed === right.fixed && left.routeId === right.routeId;
}

export function tacticalDeploymentPlacementUnavailableReason(
  battle: TacticalBattle,
  groupId: string,
  placement: Pick<TacticalDeploymentPlacement, 'zoneId' | 'line'>,
): string | null {
  if (battle.phase !== 'deployment') return '배치 단계에서만 부대를 배치할 수 있습니다.';
  const group = battle.defenderGroups.find(candidate => candidate.id === groupId);
  if (!group) return '배치할 아군 조를 찾을 수 없습니다.';
  if (activeCount(group) <= 0) return '전투 가능한 인원이 없는 조는 배치할 수 없습니다.';
  if (!battle.zones.some(zone => zone.id === placement.zoneId)) return '배치할 전투 구역을 찾을 수 없습니다.';
  if (placement.line !== 'front' && placement.line !== 'middle' && placement.line !== 'rear') {
    return '알 수 없는 전열입니다.';
  }
  const current = battle.deploymentPlacements?.[group.id];
  if (current?.fixed || group.kind === 'civilian' || group.lockedZoneId) {
    return samePlacement(current, placement as TacticalDeploymentPlacement)
      ? null
      : '피난 주민은 마을 중심지 최후열에서 이동할 수 없습니다.';
  }
  if (group.kind === 'healer' && placement.line !== 'rear') return '전술 치료반은 후열에만 배치할 수 있습니다.';
  if (battle.assaultKind === 'predatorHunt' && placement.zoneId === 'huntDen') {
    return '결착 전에는 덤불 심처에 사냥대를 배치할 수 없습니다.';
  }
  if (battle.orientation === 'assault' && battle.assaultKind === 'banditLair') {
    if (placement.zoneId === 'lairTrail') return null;
    const infiltratingHunter = group.kind === 'hunter' && placement.zoneId === 'lairWall' &&
      preparationApplied(battle, 'preInfiltration');
    if (!infiltratingHunter) return '토벌대는 진입로에만 배치할 수 있습니다.';
    if (activeCount(group) > 3) return '선행 침투조는 최대 3명까지 전방에 숨길 수 있습니다.';
    if (battle.defenderGroups.some(candidate => candidate.id !== group.id && candidate.kind === 'hunter' &&
        battle.deploymentPlacements?.[candidate.id]?.zoneId === 'lairWall')) {
      return '선행 침투는 사냥꾼 1개 조만 전방에 배치할 수 있습니다.';
    }
  }
  return null;
}

export function placeTacticalDeploymentGroup(
  state: GameState,
  groupId: string,
  placement: Pick<TacticalDeploymentPlacement, 'zoneId' | 'line'>,
): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  const reason = tacticalDeploymentPlacementUnavailableReason(battle, groupId, placement);
  if (reason) return reason;
  const group = battle.defenderGroups.find(candidate => candidate.id === groupId)!;
  const hidden = (battle.orientation === 'assault' && group.kind === 'hunter' &&
      placement.zoneId === 'lairWall' && preparationApplied(battle, 'preInfiltration')) ||
    (battle.orientation !== 'assault' && group.kind === 'hunter' &&
      placement.zoneId === 'approach' && preparationApplied(battle, 'setAmbush'));
  const next: TacticalDeploymentPlacement = {
    zoneId: placement.zoneId,
    line: group.kind === 'healer' ? 'rear' : placement.line,
    ...(hidden ? { hidden: true } : {}),
  };
  battle.deploymentPlacements ??= {};
  battle.deploymentPlacements[group.id] = next;
  syncGroupPlacement(group, next);
  syncTacticalRouteControl(battle);
  return null;
}

export function removeTacticalDeploymentGroup(state: GameState, groupId: string): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  if (battle.phase !== 'deployment') return '배치 단계에서만 부대를 대기 카드로 되돌릴 수 있습니다.';
  const group = battle.defenderGroups.find(candidate => candidate.id === groupId);
  if (!group) return '되돌릴 아군 조를 찾을 수 없습니다.';
  if (!isRequiredGroup(group)) return '고정된 보호·지원 조는 배치 대기로 되돌릴 수 없습니다.';
  battle.deploymentPlacements ??= {};
  battle.deploymentPlacements[group.id] = null;
  syncGroupPlacement(group, null);
  syncTacticalRouteControl(battle);
  return null;
}

export function tacticalDeploymentUnavailableReason(battle: TacticalBattle): string | null {
  if (battle.phase !== 'deployment') return '현재는 배치 완료를 확정할 수 없습니다.';
  const missing = battle.defenderGroups.filter(group =>
    isRequiredGroup(group) && battle.deploymentPlacements?.[group.id] == null);
  if (missing.length > 0) return `지휘 가능 부대 ${missing.length}개를 모두 배치해야 합니다.`;
  return null;
}

function deploymentViewGroup(battle: TacticalBattle, group: TacticalDefenderGroup): TacticalDeploymentGroupView {
  return {
    groupId: group.id,
    cohortId: group.deploymentCohortId ?? group.id,
    label: group.label,
    count: activeCount(group),
    power: group.power,
    kind: group.kind,
    role: group.role,
    weapon: group.weapon,
    required: isRequiredGroup(group),
    placement: battle.deploymentPlacements?.[group.id] ?? null,
    featuredResidents: group.featuredResidents ?? [],
  };
}

export function tacticalDeploymentView(battle: TacticalBattle): TacticalDeploymentView {
  const views = battle.defenderGroups.filter(group => activeCount(group) > 0)
    .map(group => deploymentViewGroup(battle, group));
  const unavailableReason = battle.phase === 'deployment' ? tacticalDeploymentUnavailableReason(battle) : null;
  return {
    waiting: views.filter(view => view.required && view.placement == null),
    placed: views.filter(view => view.placement != null && !view.placement.fixed),
    fixed: views.filter(view => view.placement?.fixed === true),
    complete: battle.phase === 'deployment' && unavailableReason == null,
    unavailableReason,
    ...(battle.deploymentForced ? { forced: battle.deploymentForced } : {}),
  };
}

function tacticalSplitUnavailableReason(battle: TacticalBattle, group: TacticalDefenderGroup): string | null {
  if (battle.phase !== 'deployment' || battle.round !== 1 || battle.reports.length > 0) {
    return '첫 교전 전 배치 단계에서만 조를 나눌 수 있습니다.';
  }
  if (!isRequiredGroup(group)) return '지휘 가능한 전투 조만 나눌 수 있습니다.';
  if (group.wounded > 0 || group.killed > 0) return '사상자가 생긴 조는 나눌 수 없습니다.';
  const cohortId = group.deploymentCohortId ?? group.id;
  if (battle.defenderGroups.filter(candidate => (candidate.deploymentCohortId ?? candidate.id) === cohortId).length >=
      CONFIG.tacticalBattle.deployment.maxCohortGroups) {
    return `한 병종은 최대 ${CONFIG.tacticalBattle.deployment.maxCohortGroups}개 조로 나눌 수 있습니다.`;
  }
  if (battle.defenderGroups.filter(isRequiredGroup).length >= CONFIG.tacticalBattle.deployment.maxCommandableGroups) {
    return `지휘 가능한 조는 최대 ${CONFIG.tacticalBattle.deployment.maxCommandableGroups}개입니다.`;
  }
  return null;
}

function nextDetachmentId(battle: TacticalBattle, cohortId: string): string {
  battle.deploymentSerial = (battle.deploymentSerial ?? 0) + 1;
  return `${cohortId}-detachment-${battle.deploymentSerial}`;
}

function relabelCohort(battle: TacticalBattle, cohortId: string): void {
  const groups = battle.defenderGroups
    .filter(group => (group.deploymentCohortId ?? group.id) === cohortId)
    .sort((left, right) => left.id.localeCompare(right.id));
  const common = groups.filter(group => !(group.featuredResidents?.length));
  for (const group of groups) applyFeaturedLabel(group);
  common.forEach((group, index) => {
    const base = baseGroupLabel(group);
    group.label = common.length > 1 || groups.length > 1 ? `${base} ${cohortGroupOrdinal(index)}` : base;
  });
}

function splitPowerAndReadiness(
  group: TacticalDefenderGroup,
  detachedCount: number,
): { detachedPower: number; detachedReadyMuskets: number } {
  const detachedPower = group.power * detachedCount / group.count;
  const detachedReadyMuskets = Math.min(
    detachedCount,
    Math.round((group.readyMuskets ?? 0) * detachedCount / group.count),
  );
  return { detachedPower, detachedReadyMuskets };
}

export function splitTacticalGroup(state: GameState, groupId: string, detachCount: number): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  const group = battle.defenderGroups.find(candidate => candidate.id === groupId);
  if (!group) return '나눌 아군 조를 찾을 수 없습니다.';
  const unavailable = tacticalSplitUnavailableReason(battle, group);
  if (unavailable) return unavailable;
  if (!Number.isInteger(detachCount) || detachCount < 1 || detachCount >= group.count) {
    return '원대에 1명 이상 남도록 분리 인원을 정해야 합니다.';
  }
  const featuredIds = new Set((group.featuredResidents ?? []).map(featured => featured.residentId));
  const detachableIds = [...group.residentIds].filter(id => !featuredIds.has(id)).sort((a, b) => a - b);
  if (detachCount > detachableIds.length) return '이름 있는 주민은 해당 주민의 조 분리 액션으로 옮겨야 합니다.';
  const detachedIds = detachableIds.slice(detachableIds.length - detachCount);
  const detachedSet = new Set(detachedIds);
  const original = { ...group, residentIds: [...group.residentIds], featuredResidents: group.featuredResidents?.map(item => ({ ...item })) };
  const { detachedPower, detachedReadyMuskets } = splitPowerAndReadiness(group, detachCount);
  const cohortId = group.deploymentCohortId ?? group.id;
  group.deploymentCohortId = cohortId;
  group.residentIds = group.residentIds.filter(id => !detachedSet.has(id));
  group.count = group.residentIds.length;
  group.power -= detachedPower;
  group.readyMuskets = Math.max(0, (group.readyMuskets ?? 0) - detachedReadyMuskets);
  const detached: TacticalDefenderGroup = {
    ...original,
    id: nextDetachmentId(battle, cohortId),
    baseLabel: baseGroupLabel(group),
    featuredResidents: undefined,
    featuredDetachment: false,
    special: undefined,
    deploymentCohortId: cohortId,
    residentIds: detachedIds,
    count: detachedIds.length,
    power: detachedPower,
    readyMuskets: detachedReadyMuskets,
    zoneId: '',
    wounded: 0,
    killed: 0,
    command: null,
    commandSource: undefined,
    targetGroupId: undefined,
    targetSource: 'auto',
    pendingLine: undefined,
    ambushed: false,
    routeTransit: undefined,
  };
  battle.defenderGroups.push(detached);
  battle.deploymentPlacements ??= {};
  battle.deploymentPlacements[detached.id] = null;
  relabelCohort(battle, cohortId);
  return null;
}

export function splitFeaturedTacticalGroup(
  state: GameState,
  groupId: string,
  featuredResidentId: number,
  companionIds: readonly number[] = [],
): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  const group = battle.defenderGroups.find(candidate => candidate.id === groupId);
  if (!group) return '나눌 이름 있는 조를 찾을 수 없습니다.';
  const unavailable = tacticalSplitUnavailableReason(battle, group);
  if (unavailable) return unavailable;
  const featured = group.featuredResidents?.find(candidate => candidate.residentId === featuredResidentId);
  if (!featured) return '이 조에 속한 특수 주민을 찾을 수 없습니다.';
  const uniqueCompanions = [...new Set(companionIds)];
  if (uniqueCompanions.length > 2) return '이름 있는 조 분리에는 동료를 최대 2명까지 붙일 수 있습니다.';
  if (uniqueCompanions.some(id => id === featuredResidentId || !group.residentIds.includes(id))) {
    return '같은 조의 일반 주민만 동료로 선택할 수 있습니다.';
  }
  const movedIds = [featuredResidentId, ...uniqueCompanions];
  if (movedIds.length >= group.count) return '원래 조에 1명 이상 남아야 합니다.';
  const movedSet = new Set(movedIds);
  const original = { ...group, residentIds: [...group.residentIds], featuredResidents: group.featuredResidents?.map(item => ({ ...item })) };
  const { detachedPower, detachedReadyMuskets } = splitPowerAndReadiness(group, movedIds.length);
  const cohortId = group.deploymentCohortId ?? group.id;
  group.deploymentCohortId = cohortId;
  group.residentIds = group.residentIds.filter(id => !movedSet.has(id));
  group.count = group.residentIds.length;
  group.power -= detachedPower;
  group.readyMuskets = Math.max(0, (group.readyMuskets ?? 0) - detachedReadyMuskets);
  group.featuredResidents = (group.featuredResidents ?? []).filter(item => item.residentId !== featuredResidentId);
  group.special = group.featuredResidents[0]?.special;
  const detached: TacticalDefenderGroup = {
    ...original,
    id: nextDetachmentId(battle, cohortId),
    baseLabel: baseGroupLabel(group),
    featuredResidents: [{ ...featured }],
    featuredDetachment: true,
    special: featured.special,
    deploymentCohortId: cohortId,
    residentIds: movedIds,
    count: movedIds.length,
    power: detachedPower,
    readyMuskets: detachedReadyMuskets,
    zoneId: '',
    wounded: 0,
    killed: 0,
    command: null,
    commandSource: undefined,
    targetGroupId: undefined,
    targetSource: 'auto',
    pendingLine: undefined,
    ambushed: false,
    routeTransit: undefined,
  };
  battle.defenderGroups.push(detached);
  battle.deploymentPlacements ??= {};
  battle.deploymentPlacements[detached.id] = null;
  relabelCohort(battle, cohortId);
  return null;
}

export function mergeTacticalGroups(
  state: GameState,
  destinationGroupId: string,
  sourceGroupId: string,
): string | null {
  const battle = state.tacticalBattle;
  if (!battle) return '진행 중인 직접 지휘 전투가 없습니다.';
  if (battle.phase !== 'deployment' || battle.round !== 1 || battle.reports.length > 0) {
    return '첫 교전 전 배치 단계에서만 조를 합칠 수 있습니다.';
  }
  if (destinationGroupId === sourceGroupId) return '서로 다른 두 조를 선택해야 합니다.';
  const destination = battle.defenderGroups.find(group => group.id === destinationGroupId);
  const source = battle.defenderGroups.find(group => group.id === sourceGroupId);
  if (!destination || !source) return '합칠 아군 조를 찾을 수 없습니다.';
  const destinationCohort = destination.deploymentCohortId ?? destination.id;
  const sourceCohort = source.deploymentCohortId ?? source.id;
  if (destinationCohort !== sourceCohort || destination.role !== source.role ||
      destination.weapon !== source.weapon || destination.origin !== source.origin || destination.mount !== source.mount) {
    return '같은 병종과 원래 조에서 나뉜 조끼리만 합칠 수 있습니다.';
  }
  if ((destination.featuredResidents?.length ?? 0) > 0 && (source.featuredResidents?.length ?? 0) > 0) {
    return '서로 다른 이름 있는 조는 합칠 수 없습니다.';
  }
  if (!samePlacement(battle.deploymentPlacements?.[destination.id], battle.deploymentPlacements?.[source.id])) {
    return '같은 배치 위치에 있거나 둘 다 대기 중인 조끼리만 합칠 수 있습니다.';
  }
  if (destination.wounded > 0 || destination.killed > 0 || source.wounded > 0 || source.killed > 0) {
    return '사상자가 생긴 조는 합칠 수 없습니다.';
  }
  const mergedIds = [...new Set([...destination.residentIds, ...source.residentIds])].sort((a, b) => a - b);
  if (mergedIds.length !== destination.count + source.count) return '주민이 중복된 조는 합칠 수 없습니다.';
  destination.residentIds = mergedIds;
  destination.count = mergedIds.length;
  destination.power += source.power;
  destination.readyMuskets = (destination.readyMuskets ?? 0) + (source.readyMuskets ?? 0);
  destination.featuredResidents = [
    ...(destination.featuredResidents ?? []),
    ...(source.featuredResidents ?? []),
  ];
  destination.featuredDetachment = false;
  destination.special = destination.featuredResidents[0]?.special;
  destination.command = null;
  destination.commandSource = undefined;
  destination.targetGroupId = undefined;
  destination.targetSource = 'auto';
  battle.defenderGroups = battle.defenderGroups.filter(group => group.id !== source.id);
  if (battle.deploymentPlacements) delete battle.deploymentPlacements[source.id];
  battle.deploymentGroupAliases ??= {};
  battle.deploymentGroupAliases[source.id] = destination.id;
  relabelCohort(battle, destinationCohort);
  return null;
}

export function resolveTacticalDeploymentGroupId(battle: TacticalBattle, groupId: string): string | undefined {
  let current = groupId;
  const seen = new Set<string>();
  while (!seen.has(current)) {
    if (battle.defenderGroups.some(group => group.id === current)) return current;
    seen.add(current);
    const next = battle.deploymentGroupAliases?.[current];
    if (!next) return undefined;
    current = next;
  }
  return undefined;
}
