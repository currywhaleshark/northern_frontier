import { withJosa } from './josa';
import { BUILDING_DEFS, footprintTilesOf } from './buildings';
import { CONFIG } from './config';
import { addLog } from './events';
import { addForeignSiteMemory, isForeignSiteOperational } from './foreignSites';
import { changeRelation } from './relations';
import { activeClaimAccord } from './diplomacy';
import type { Building, ClaimZone, GameState } from './types';

export function claimZonesAt(state: GameState, x: number, y: number): ClaimZone[] {
  return state.claimZones.filter(zone => {
    const dx = x - zone.x;
    const dy = y - zone.y;
    return dx * dx + dy * dy <= zone.radius * zone.radius;
  });
}

export function isClaimPermissionActive(state: GameState, zone: ClaimZone): boolean {
  return (zone.permittedUntilDay ?? 0) >= state.day || !!activeClaimAccord(state, zone.id);
}

function claimLabel(zone: ClaimZone): string {
  const labels: Record<ClaimZone['kind'], string> = {
    hunting: '사냥터',
    fishing: '어로 구역',
    forest: '숲 이용지',
    field: '경작지 주변',
    sacred: '금기 구역',
    passage: '통행로',
  };
  return labels[zone.kind];
}

function noteClaimIntrusion(state: GameState, zone: ClaimZone, reason: string): void {
  const site = state.foreignSites.find(candidate => candidate.id === zone.siteId);
  if (!site) return;
  if (!zone.discovered) {
    zone.discovered = true;
    addLog(state, `나무에 낯선 표식이 발견되었습니다. 이곳은 ${withJosa(site.factionName ?? '누군가', '이/가')} 오래 이용해 온 ${claimLabel(zone)}인 듯합니다.`, 'info', true);
  }
  if (isClaimPermissionActive(state, zone)) {
    addLog(state, `허락받은 ${claimLabel(zone)} 안에서 ${withJosa(reason, '을/를')} 시작했습니다. 약조는 아직 유효합니다.`, 'good');
    addForeignSiteMemory(state, site.id, `약조에 따라 ${withJosa(reason, '을/를')} 묵인했습니다.`, 'good');
    return;
  }
  site.alarm = Math.min(100, site.alarm + 8);
  if (site.factionName) changeRelation(state, site.factionName, -2);
  const text = `${withJosa(reason, '이/가')} ${site.factionName ?? '현지 사람들'}의 ${claimLabel(zone)} 안에 들어섰습니다. 곧 항의가 올지도 모릅니다.`;
  addLog(state, text, 'bad', true);
  addForeignSiteMemory(state, site.id, `${withJosa(reason, '이/가')} 허락 없이 ${claimLabel(zone)}에 들어섰습니다.`, 'bad');
}

export function noteBuildingClaimIntrusions(state: GameState, building: Building): void {
  const footprint = footprintTilesOf(state, building) ?? [];
  const zones = new Map<number, ClaimZone>();
  for (const tile of footprint) {
    for (const zone of claimZonesAt(state, tile.x, tile.y)) zones.set(zone.id, zone);
  }
  for (const zone of zones.values()) {
    noteClaimIntrusion(state, zone, BUILDING_DEFS[building.type].name);
  }
}

export function dailyClaimTensionTick(state: GameState): void {
  const interval = CONFIG.foreignSites.claimDailyInterval;
  for (const zone of state.claimZones) {
    if ((state.day + zone.id) % interval !== 0 || isClaimPermissionActive(state, zone)) continue;
    if (zone.growth?.establishedUseGraceUntilDay != null &&
        zone.growth.establishedUseGraceUntilDay < state.day) {
      zone.growth.establishedUseGraceUntilDay = undefined;
      zone.growth.establishedUseBuildingIds = [];
    }
    const graceIds = zone.growth?.establishedUseGraceUntilDay != null &&
      zone.growth.establishedUseGraceUntilDay >= state.day
      ? new Set(zone.growth.establishedUseBuildingIds)
      : new Set<number>();
    const site = state.foreignSites.find(candidate => candidate.id === zone.siteId);
    if (!site || !isForeignSiteOperational(site)) continue;
    const occupied = state.buildings.find(building => {
      if (graceIds.has(building.id)) return false;
      const footprint = footprintTilesOf(state, building) ?? [];
      return footprint.some(tile => claimZonesAt(state, tile.x, tile.y).some(candidate => candidate.id === zone.id));
    });
    if (!occupied) continue;
    zone.discovered = true;
    zone.growth ??= {
      baseRadius: zone.radius, targetRadius: zone.radius, pressure: 0,
      lastBoundaryChangeDay: state.day, establishedUseBuildingIds: [],
    };
    if (zone.growth.warningTargetBuildingId != null) continue;
    zone.growth.warningTargetBuildingId = occupied.id;
    zone.growth.warningScheduledDay = state.day;
    zone.growth.warningPatrolPartyId = undefined;
    if (site.discovered) {
      addLog(state, `${site.name}에서 ${claimLabel(zone)} 안의 시설을 확인할 경계 순찰대를 보냈습니다.`, 'info');
    }
  }
}

export function applyScheduledClaimWarning(state: GameState, zoneId: number): boolean {
  const zone = state.claimZones.find(candidate => candidate.id === zoneId);
  const site = zone ? state.foreignSites.find(candidate => candidate.id === zone.siteId) : null;
  if (!zone || !site || !zone.growth?.warningTargetBuildingId) return false;
  const targetStillExists = state.buildings.some(
    building => building.id === zone.growth?.warningTargetBuildingId,
  );
  if (!targetStillExists || isClaimPermissionActive(state, zone)) {
    zone.growth.warningTargetBuildingId = undefined;
    zone.growth.warningScheduledDay = undefined;
    zone.growth.warningPatrolPartyId = undefined;
    return false;
  }
  site.alarm = Math.min(100, site.alarm + 2);
  if (site.factionName) changeRelation(state, site.factionName, -1);
  addForeignSiteMemory(state, site.id, `${claimLabel(zone)} 안의 개척지 시설을 순찰대가 확인해 경계심이 커졌습니다.`, 'bad');
  addLog(state, `${withJosa(site.factionName ?? '현지 사람들', '이/가')} ${claimLabel(zone)} 안의 개척지 시설을 확인하고 항의했습니다.`, 'bad');
  zone.growth.warningTargetBuildingId = undefined;
  zone.growth.warningScheduledDay = undefined;
  zone.growth.warningPatrolPartyId = undefined;
  return true;
}
