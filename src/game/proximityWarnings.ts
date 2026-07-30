// 외교 활동 E4 — 생활권 내부의 기존 침해보다 앞서는 완충 경고와 거점 배회 감시.
import { footprintTilesOf } from './buildings';
import { CONFIG } from './config';
import { factionLeaderFor } from './diplomaticFigures';
import { addLog } from './events';
import { addForeignSiteMemory, isForeignSiteOperational } from './foreignSites';
import { withJosa } from './josa';
import { changeRelation } from './relations';
import { isClaimPermissionActive } from './claimZones';
import type { Building, ClaimZone, ForeignSite, GameState } from './types';

type ProximityReason = 'claimBuffer' | 'siteLoiter';

function warningKey(factionName: string, reason: ProximityReason): string {
  return `E4:${reason}:${factionName}`;
}

function warningDayKey(key: string): string {
  return `warningDay:${key}`;
}

function factionSite(state: GameState, zone: ClaimZone): ForeignSite | null {
  const site = state.foreignSites.find(candidate => candidate.id === zone.siteId);
  return site && site.factionName && isForeignSiteOperational(site) ? site : null;
}

function pointInClaim(zone: ClaimZone, x: number, y: number): boolean {
  const dx = x - zone.x;
  const dy = y - zone.y;
  return dx * dx + dy * dy <= zone.radius * zone.radius;
}

function pointInClaimBuffer(zone: ClaimZone, x: number, y: number): boolean {
  const dx = x - zone.x;
  const dy = y - zone.y;
  const distanceSquared = dx * dx + dy * dy;
  const outer = zone.radius + CONFIG.foreignSites.proximityClaimBufferTiles;
  return distanceSquared > zone.radius * zone.radius && distanceSquared <= outer * outer;
}

function pointInsideAnyClaim(state: GameState, x: number, y: number): boolean {
  return state.claimZones.some(zone => pointInClaim(zone, x, y));
}

function claimBufferContacts(state: GameState, x: number, y: number): ClaimZone[] {
  // 이미 어떤 생활권 안이면 기존 침해 시스템만 처리한다. E4는 경계 바깥의 완충 단계다.
  if (pointInsideAnyClaim(state, x, y)) return [];
  return state.claimZones.filter(zone => !isClaimPermissionActive(state, zone) && pointInClaimBuffer(zone, x, y) && factionSite(state, zone));
}

function siteDistance(site: ForeignSite, x: number, y: number): number {
  const dx = x < site.x ? site.x - x : x >= site.x + site.width ? x - (site.x + site.width - 1) : 0;
  const dy = y < site.y ? site.y - y : y >= site.y + site.height ? y - (site.y + site.height - 1) : 0;
  return Math.max(dx, dy);
}

function leaderSpeaker(state: GameState, site: ForeignSite): string {
  const leader = site.factionName ? factionLeaderFor(state, site.factionName) : null;
  return leader ? `${leader.name} ${leader.title}` : site.name;
}

function issueWarning(
  state: GameState,
  site: ForeignSite,
  reason: ProximityReason,
  subject: string,
  contactZoneId?: number,
): boolean {
  const factionName = site.factionName;
  if (!factionName) return false;
  const key = warningKey(factionName, reason);
  if (state.proximityWarnings.includes(key)) return false;

  state.proximityWarnings.push(key);
  state.proximityWarnings = state.proximityWarnings.slice(-200);
  state.proximityWarningProgress[warningDayKey(key)] = state.day;
  site.discovered = true;
  const speaker = leaderSpeaker(state, site);
  const quote = reason === 'claimBuffer'
    ? `${subject} ${site.name}의 생활권 경계 가까이 들어섰소. 더 다가오지 마시오.`
    : `${subject} ${site.name} 곁을 오래 맴돌고 있소. 우리 전사들이 지켜보고 있소.`;
  const text = `${withJosa(speaker, '이/가')} 사람을 보내 경고했습니다. “${quote}”`;
  addLog(state, text, 'bad', true, true);
  addForeignSiteMemory(state, site.id, reason === 'claimBuffer'
    ? '개척지 시설과 작업이 생활권 경계 가까이 다가와 경고 사절을 보냈습니다.'
    : '개척지 사람들이 거점 주변을 오래 맴돌아 전사들이 경고했습니다.', 'bad');
  if (reason === 'claimBuffer' && !state.pendingChoice && contactZoneId != null) {
    const zone = state.claimZones.find(candidate => candidate.id === contactZoneId && candidate.siteId === site.id);
    if (zone) {
      state.pendingChoice = {
        kind: 'claimAccordOffer',
        title: `${speaker}의 생활권 경고`,
        body: '경계 가까이의 작업을 계속하려면 해당 생활권의 권리를 정식으로 청할 수 있습니다.',
        options: [
          { id: 'propose', label: '생활권 협정을 제안한다', desc: '은 또는 그들이 받는 물자를 동봉해 1년간의 채집·작업 권리를 청합니다.' },
          { id: 'decline', label: '지금은 제안하지 않는다', desc: '경고를 받아들이고 작업을 물립니다.' },
        ],
        data: { factionName, zoneId: zone.id },
      };
    }
  }
  return true;
}

function pressureDue(state: GameState, factionName: string, reason: ProximityReason): boolean {
  const key = warningKey(factionName, reason);
  if (!state.proximityWarnings.includes(key)) return false;
  const warnedDay = state.proximityWarningProgress[warningDayKey(key)] ?? 0;
  if (state.day <= warnedDay) return false;
  const interval = CONFIG.foreignSites.proximityPressureInterval;
  const salt = [...factionName].reduce((sum, char) => sum + char.charCodeAt(0), reason === 'claimBuffer' ? 17 : 43);
  return (state.day + salt) % interval === 0;
}

function applyContinuedPressure(state: GameState, site: ForeignSite, reason: ProximityReason): void {
  const factionName = site.factionName;
  if (!factionName || !pressureDue(state, factionName, reason)) return;
  site.alarm = Math.min(100, site.alarm + 1);
  changeRelation(state, factionName, -1);
  if (reason === 'siteLoiter') state.threat = Math.min(100, state.threat + 1);
  const action = reason === 'claimBuffer' ? '생활권 경계 가까이의 일을 멈추지 않아' : '거점 주변 배회를 계속해';
  addLog(state, `${withJosa(factionName, '이/가')} ${action} 경계심을 더 높였습니다. (관계 -1${reason === 'siteLoiter' ? ' · 위협 +1' : ''})`, 'bad');
  addForeignSiteMemory(state, site.id, reason === 'claimBuffer'
    ? '경계 가까이의 개척 작업이 계속되어 불쾌감이 쌓였습니다.'
    : '거점 주변 배회가 계속되어 전사들이 더 경계합니다.', 'bad');
}

function firstSiteByFaction(sites: Iterable<ForeignSite>): Map<string, ForeignSite> {
  const result = new Map<string, ForeignSite>();
  for (const site of sites) {
    if (!site.factionName || result.has(site.factionName)) continue;
    result.set(site.factionName, site);
  }
  return result;
}

export function noteProximityBuildingCompletion(state: GameState, building: Building): void {
  const contacts: Array<{ site: ForeignSite; zone: ClaimZone }> = [];
  for (const tile of footprintTilesOf(state, building) ?? []) {
    for (const zone of claimBufferContacts(state, tile.x, tile.y)) {
      const site = factionSite(state, zone);
      if (!site) continue;
      zone.discovered = true;
      contacts.push({ site, zone });
    }
  }
  const firstContact = new Map<string, { site: ForeignSite; zone: ClaimZone }>();
  for (const contact of contacts) {
    const factionName = contact.site.factionName;
    if (factionName && !firstContact.has(factionName)) firstContact.set(factionName, contact);
  }
  for (const contact of firstContact.values()) {
    issueWarning(state, contact.site, 'claimBuffer', '새 건물이', contact.zone.id);
  }
}

function recordBufferWork(state: GameState): Map<string, ForeignSite> {
  const activeContacts: Array<{ zone: ClaimZone; site: ForeignSite; x: number; y: number }> = [];
  for (const resident of state.residents) {
    if (!resident.alive || resident.phase !== 'working') continue;
    for (const zone of claimBufferContacts(state, resident.x, resident.y)) {
      const site = factionSite(state, zone);
      if (!site) continue;
      activeContacts.push({ zone, site, x: resident.x, y: resident.y });
    }
  }

  const pressureSites = firstSiteByFaction(activeContacts.map(contact => contact.site));
  const seen = new Set<string>();
  for (const contact of activeContacts) {
    const progressKey = `claimWork:${contact.zone.id}:${contact.x},${contact.y}`;
    if (seen.has(progressKey)) continue;
    seen.add(progressKey);
    const days = Math.min(99, (state.proximityWarningProgress[progressKey] ?? 0) + 1);
    state.proximityWarningProgress[progressKey] = days;
    if (days < CONFIG.foreignSites.proximityWorkDays) continue;
    delete state.proximityWarningProgress[progressKey];
    contact.zone.discovered = true;
    issueWarning(state, contact.site, 'claimBuffer', '개척지 주민이', contact.zone.id);
  }
  return pressureSites;
}

function recordSiteLoitering(state: GameState): Map<string, ForeignSite> {
  const pressureCandidates: ForeignSite[] = [];
  for (const site of state.foreignSites) {
    if (!site.factionName || !site.discovered || !isForeignSiteOperational(site)) continue;
    const residentNearby = state.residents.some(resident => resident.alive &&
      siteDistance(site, resident.x, resident.y) <= CONFIG.foreignSites.proximitySiteRadius);
    const expeditionNearby = !!state.expedition &&
      siteDistance(site, state.expedition.x, state.expedition.y) <= CONFIG.foreignSites.proximitySiteRadius;
    const progressKey = `siteLoiter:${site.id}`;
    if (!residentNearby && !expeditionNearby) {
      delete state.proximityWarningProgress[progressKey];
      continue;
    }
    pressureCandidates.push(site);
    const days = Math.min(99, (state.proximityWarningProgress[progressKey] ?? 0) + 1);
    state.proximityWarningProgress[progressKey] = days;
    if (days >= CONFIG.foreignSites.proximityLoiterDays) issueWarning(state, site, 'siteLoiter', '개척지 사람들이');
  }
  return firstSiteByFaction(pressureCandidates);
}

// 하루 끝에 한 번만 판정한다. 동일한 세력의 여러 거점/생활권도 한 경고와 한 압박으로 묶는다.
export function dailyProximityWarningTick(state: GameState): void {
  state.proximityWarnings ??= [];
  state.proximityWarningProgress ??= {};
  const claimPressure = new Map<string, ForeignSite>();
  for (const building of state.buildings) {
    if (!building.built) continue;
    const contacts: ForeignSite[] = [];
    for (const tile of footprintTilesOf(state, building) ?? []) {
      for (const zone of claimBufferContacts(state, tile.x, tile.y)) {
        const site = factionSite(state, zone);
        if (site) contacts.push(site);
      }
    }
    for (const [factionName, site] of firstSiteByFaction(contacts)) claimPressure.set(factionName, site);
  }
  for (const [factionName, site] of recordBufferWork(state)) claimPressure.set(factionName, site);
  for (const site of claimPressure.values()) applyContinuedPressure(state, site, 'claimBuffer');

  for (const site of recordSiteLoitering(state).values()) applyContinuedPressure(state, site, 'siteLoiter');
}
