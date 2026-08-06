import { withJosa } from './josa';
import { CONFIG } from './config';
import { addLog } from './events';
import { addForeignSiteMemory } from './foreignSites';
import { changeRelation } from './relations';
import { breakDiplomaticPact } from './diplomacy';
import { isClaimPermissionActive } from './claimZones';
import type { ClaimZone, ForeignSite, GameState, PointerAction, TerritoryViolation } from './types';

type TerritoryUse = 'passage' | 'work';

function activeSite(site: ForeignSite): boolean {
  return site.discovered && site.status !== 'abandoned' && site.status !== 'burned';
}

function coveringSites(state: GameState, x: number, y: number): Map<number, typeof state.claimZones> {
  const grouped = new Map<number, typeof state.claimZones>();
  for (const zone of state.claimZones) {
    if (!zone.discovered) continue;
    const dx = x - zone.x;
    const dy = y - zone.y;
    if (dx * dx + dy * dy > zone.radius * zone.radius) continue;
    const site = state.foreignSites.find(candidate => candidate.id === zone.siteId);
    if (!site || !activeSite(site)) continue;
    const zones = grouped.get(zone.siteId) ?? [];
    zones.push(zone);
    grouped.set(zone.siteId, zones);
  }
  return grouped;
}

function establishedUseCoversTile(state: GameState, zone: ClaimZone, x: number, y: number): boolean {
  const growth = zone.growth;
  if (!growth?.establishedUseGraceUntilDay || growth.establishedUseGraceUntilDay < state.day) return false;
  const buildingId = state.map[y]?.[x]?.buildingId;
  return buildingId != null && growth.establishedUseBuildingIds.includes(buildingId);
}

export function unauthorizedTerritorySiteIds(
  state: GameState,
  x: number,
  y: number,
  use: TerritoryUse,
  ignoredSiteIds: readonly number[] = [],
): number[] {
  const ignored = new Set(ignoredSiteIds);
  const blocked: number[] = [];
  for (const [siteId, zones] of coveringSites(state, x, y)) {
    if (ignored.has(siteId)) continue;
    const relevant = (use === 'passage' ? zones : zones.filter(zone => zone.kind !== 'passage'))
      .filter(zone => !establishedUseCoversTile(state, zone, x, y));
    if (relevant.length === 0) continue;
    const permitted = relevant.some(zone => isClaimPermissionActive(state, zone));
    if (!permitted) blocked.push(siteId);
  }
  return blocked;
}

export function canEnterForeignTerritory(
  state: GameState,
  x: number,
  y: number,
  ignoredSiteIds: readonly number[] = [],
): boolean {
  return unauthorizedTerritorySiteIds(state, x, y, 'passage', ignoredSiteIds).length === 0;
}

export function canWorkForeignTerritory(
  state: GameState,
  x: number,
  y: number,
  ignoredSiteIds: readonly number[] = [],
): boolean {
  return unauthorizedTerritorySiteIds(state, x, y, 'work', ignoredSiteIds).length === 0;
}

function territorySiteNames(state: GameState, siteIds: readonly number[]): string[] {
  return [...new Set(siteIds.map(id => state.foreignSites.find(site => site.id === id)?.factionName).filter(Boolean) as string[])];
}

export function openTerritoryOrderConfirmation(
  state: GameState,
  residentId: number,
  action: Extract<PointerAction, { kind: 'move' | 'work' }>,
): void {
  const siteIds = action.unauthorizedSiteIds ?? [];
  const factions = territorySiteNames(state, siteIds);
  const subject = factions.length > 0 ? factions.join(', ') : '현지 세력';
  state.pendingChoice = {
    kind: 'territory',
    title: action.kind === 'work' ? '무단 작업 강행' : '무단 통행 강행',
    body: `${subject}의 허락을 받지 않은 생활권입니다. 강행하면 주민이 경계선을 넘을 수 있지만, 실제 통행이나 작업이 확인될 경우 며칠 뒤 항의가 올 수 있습니다.`,
    options: [
      { id: 'force', label: '강행한다', desc: '명령을 수행하고 발각될 위험을 감수합니다.' },
      { id: 'cancel', label: '취소한다', desc: '명령을 거둡니다.' },
    ],
    data: { mode: 'orderConfirm', residentId, action, siteIds },
  };
}

function warningDelay(state: GameState, siteId: number): number {
  const [min, max] = CONFIG.foreignSites.violationWarningDelay;
  return min + Math.abs(state.seed + state.day * 31 + siteId * 17) % (max - min + 1);
}

function unauthorizedZonesForSite(
  state: GameState, siteId: number, x: number, y: number, use: TerritoryUse,
): ClaimZone[] {
  const zones = coveringSites(state, x, y).get(siteId) ?? [];
  return (use === 'passage' ? zones : zones.filter(zone => zone.kind !== 'passage'))
    .filter(zone => !isClaimPermissionActive(state, zone));
}

export function noteTerritoryViolation(
  state: GameState,
  siteIds: readonly number[],
  x: number,
  y: number,
  use: TerritoryUse,
): void {
  const actual = unauthorizedTerritorySiteIds(state, x, y, use).filter(id => siteIds.includes(id));
  state.territoryViolations ??= [];
  for (const siteId of actual) {
    const site = state.foreignSites.find(candidate => candidate.id === siteId);
    if (!site) continue;
    const zoneIds = unauthorizedZonesForSite(state, siteId, x, y, use).map(zone => zone.id);
    let violation = state.territoryViolations.find(candidate => candidate.siteId === siteId);
    if (!violation) {
      violation = {
        siteId,
        zoneIds,
        firstDay: state.day,
        lastDay: state.day,
        warningDay: state.day + warningDelay(state, siteId),
        passage: false,
        work: false,
        count: 0,
      };
      state.territoryViolations.push(violation);
      site.alarm = Math.min(100, site.alarm + 3);
      addLog(state, `${site.factionName ?? site.name}의 경계표를 허락 없이 넘었습니다. 발각되면 항의가 올 수 있습니다.`, 'bad', true);
      addForeignSiteMemory(state, site.id, '개척지 주민이 허락 없이 생활권에 들어왔다는 흔적이 남았습니다.', 'bad');
    }
    violation.zoneIds = [...new Set([...(violation.zoneIds ?? []), ...zoneIds])].slice(0, 24);
    const dayField = use === 'passage' ? 'lastPassageDay' : 'lastWorkDay';
    if (violation[dayField] !== state.day) {
      violation[dayField] = state.day;
      violation.count += 1;
    }
    violation[use] = true;
    violation.lastDay = state.day;
  }
}

function warningBody(site: ForeignSite, violation: TerritoryViolation): string {
  const acts = violation.passage && violation.work ? '무단 통행과 작업' : violation.work ? '무단 작업' : '무단 통행';
  return `${site.name}에서 사절이 찾아와 ${acts}의 흔적을 제시했습니다. 이번 일을 어떻게 수습하느냐에 따라 ${site.factionName ?? '현지 사람들'}과의 관계가 달라집니다.`;
}

export function updateTerritoryWarnings(state: GameState): void {
  if (state.pendingChoice) return;
  state.territoryViolations ??= [];
  const violation = state.territoryViolations.find(candidate => candidate.warningDay <= state.day);
  if (!violation) return;
  const site = state.foreignSites.find(candidate => candidate.id === violation.siteId);
  if (!site || !activeSite(site)) {
    state.territoryViolations = state.territoryViolations.filter(candidate => candidate !== violation);
    return;
  }
  const grain = CONFIG.foreignSites.violationCompensationGrain;
  state.pendingChoice = {
    kind: 'territory',
    title: `${site.factionName ?? site.name}의 항의`,
    body: warningBody(site, violation),
    options: [
      {
        id: 'compensate',
        label: '사과하고 배상한다',
        desc: `곡물 ${withJosa(grain, '을/를')} 내어 관계 악화를 줄입니다.`,
        disabled: state.resources.grain < grain,
        disabledReason: `곡물 ${withJosa(grain, '이/가')} 필요합니다.`,
      },
      { id: 'apologize', label: '잘못을 인정한다', desc: '명성에 작은 손해를 감수하고 사과합니다.' },
      { id: 'ignore', label: '항의를 무시한다', desc: '관계와 경계심이 크게 악화됩니다.' },
      {
        id: 'accord', label: '생활권 협정을 제안한다',
        desc: '은 또는 그들이 받는 물자를 동봉한 사절로, 해당 생활권의 연간 권리를 청합니다.',
        disabled: !site.factionName,
        disabledReason: site.factionName ? undefined : '소속을 확인할 수 없어 협정할 수 없습니다.',
      },
    ],
    data: { mode: 'warning', siteId: site.id },
  };
}

export function resolveTerritoryWarning(state: GameState, optionId: string): void {
  const choice = state.pendingChoice;
  if (!choice || choice.kind !== 'territory' || choice.data.mode !== 'warning') return;
  const siteId = choice.data.siteId as number;
  const site = state.foreignSites.find(candidate => candidate.id === siteId);
  if (!site) {
    state.pendingChoice = null;
    return;
  }
  const faction = site.factionName;
  if (optionId === 'compensate') {
    const grain = CONFIG.foreignSites.violationCompensationGrain;
    if (state.resources.grain < grain) return;
    state.resources.grain -= grain;
    if (faction) changeRelation(state, faction, CONFIG.foreignSites.violationCompensationRelation);
    site.alarm = Math.min(100, site.alarm + 2);
    addLog(state, `${site.name}의 항의에 사과하고 곡물 ${withJosa(grain, '을/를')} 배상했습니다.`, 'info', true);
  } else if (optionId === 'apologize') {
    state.resources.reputation = Math.max(0, state.resources.reputation - 1);
    if (faction) changeRelation(state, faction, CONFIG.foreignSites.violationApologyRelation);
    site.alarm = Math.min(100, site.alarm + 6);
    addLog(state, `${site.name}의 항의에 잘못을 인정하고 재발 방지를 약속했습니다.`, 'bad', true);
  } else if (optionId === 'accord') {
    const violation = state.territoryViolations?.find(candidate => candidate.siteId === siteId);
    const zoneId = violation?.zoneIds.find(id => {
      const zone = state.claimZones.find(candidate => candidate.id === id);
      return zone?.siteId === siteId;
    }) ?? -1;
    if (zoneId < 0 || !faction) return;
    state.pendingChoice = {
      kind: 'claimAccordOffer',
      title: `${site.factionName ?? site.name}의 생활권 협정`,
      body: `${site.name}의 항의에 답해, 침범한 생활권의 채집·작업 권리를 정식으로 청할 수 있습니다.`,
      options: [
        { id: 'propose', label: '협정을 제안한다', desc: '은 또는 그들이 받는 물자를 골라 사절에게 맡깁니다.' },
        { id: 'decline', label: '지금은 제안하지 않는다', desc: '이번 항의는 더는 키우지 않고 물러납니다.' },
      ],
      data: { factionName: faction, zoneId, fallback: 'territoryApology', siteId },
    };
    return;
  } else if (optionId === 'ignore') {
    if (faction) changeRelation(state, faction, CONFIG.foreignSites.violationIgnoreRelation);
    site.alarm = Math.min(100, site.alarm + 15);
    state.threat = Math.min(100, state.threat + 4);
    if (faction) breakDiplomaticPact(state, faction, 'territoryViolation');
    addLog(state, `${site.name}의 항의를 묵살했습니다. 국경의 긴장이 크게 높아집니다.`, 'bad', true);
  } else return;
  addForeignSiteMemory(state, site.id, optionId === 'compensate'
    ? '생활권 침범에 사과하고 배상했습니다.'
    : optionId === 'apologize' ? '침범을 인정했지만 배상은 하지 않았습니다.' : '생활권 침범 항의를 묵살했습니다.', optionId === 'compensate' ? 'neutral' : 'bad');
  state.territoryViolations = (state.territoryViolations ?? []).filter(candidate => candidate.siteId !== siteId);
  state.pendingChoice = null;
}
