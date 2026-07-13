import { CONFIG } from './config';
import { RESOURCE_NAMES } from './constants';
import { addLog } from './events';
import { addForeignSiteMemory, isForeignSiteOperational } from './foreignSites';
import { changeRelation, getRelation } from './relations';
import { revealPassageRoute } from './passage';
import { livingResidents } from './residents';
import {
  consumeExpeditionPowder, expeditionCombatPower, expeditionResidentsForIds,
} from './expedition';
import { weaponCountsForResidents } from './weapons';
import type { ForeignSite, GameState, ResourceId } from './types';

export type SiteGiftType = 'grain' | 'hide' | 'tools';

export const SITE_GIFTS: Record<SiteGiftType, { resource: ResourceId; amount: number; label: string }> = {
  grain: { resource: 'grain', amount: 10, label: '곡물 10' },
  hide: { resource: 'hide', amount: 5, label: '가죽 5' },
  tools: { resource: 'tools', amount: 2, label: '도구 2' },
};

function getSite(state: GameState, siteId: number): ForeignSite | null {
  return state.foreignSites.find(site => site.id === siteId) ?? null;
}

function canAddressSite(site: ForeignSite): string | null {
  if (!site.discovered) return '아직 위치를 확인하지 못한 거점입니다.';
  if (!isForeignSiteOperational(site)) return site.type === 'seasonalCamp'
    ? '사람들이 계절 야영지를 비워 지금은 약조를 청할 수 없습니다.'
    : '이 거점은 더 이상 활동하지 않습니다.';
  if (site.type === 'banditLair') return '산채에는 예를 갖춘 외교 요청을 보낼 수 없습니다.';
  return null;
}

function diplomacyScore(state: GameState, site: ForeignSite): number {
  const relation = site.factionName ? getRelation(state, site.factionName) : 50;
  return site.goodwill + relation + site.trust * 0.5 - site.alarm * 0.4;
}

export function sendGiftToSite(state: GameState, siteId: number, giftType: SiteGiftType): string | null {
  const site = getSite(state, siteId);
  if (!site) return '거점을 찾을 수 없습니다.';
  const blocked = canAddressSite(site);
  if (blocked) return blocked;
  const gift = SITE_GIFTS[giftType];
  if (state.resources[gift.resource] < gift.amount) return `${RESOURCE_NAMES[gift.resource]} ${gift.amount}이(가) 필요합니다.`;

  state.resources[gift.resource] -= gift.amount;
  site.goodwill = Math.min(100, site.goodwill + CONFIG.foreignSites.giftGoodwill);
  site.trust = Math.min(100, site.trust + 3);
  site.alarm = Math.max(0, site.alarm - 4);
  site.favors += CONFIG.foreignSites.giftFavor;
  site.lastInteractionDay = state.day;
  if (site.factionName) changeRelation(state, site.factionName, CONFIG.foreignSites.giftRelation);
  if (giftType === 'tools' && site.factionName && site.factionName !== '조정') {
    state.suspicion = Math.min(100, state.suspicion + 2);
  }
  addForeignSiteMemory(state, site.id, `개척지에서 ${gift.label}을(를) 예물로 보냈습니다.`, 'good');
  addLog(state, `${site.name}에 ${gift.label}을(를) 예물로 보내 예를 갖췄습니다.`, 'good', true);
  return null;
}

export function requestPassagePermission(state: GameState, siteId: number): string | null {
  const site = getSite(state, siteId);
  if (!site) return '거점을 찾을 수 없습니다.';
  const blocked = canAddressSite(site);
  if (blocked) return blocked;
  const zones = state.claimZones.filter(zone => zone.siteId === site.id && zone.kind === 'passage');
  if (zones.length === 0) return '이 거점과 협의할 통행로가 없습니다.';
  const score = diplomacyScore(state, site);
  if (score < 105) {
    site.alarm = Math.min(100, site.alarm + 6);
    if (site.factionName) changeRelation(state, site.factionName, -2);
    addForeignSiteMemory(state, site.id, '통행 약조를 맺기에는 아직 신용이 부족하다고 답했습니다.', 'bad');
    return '아직 신용이 부족해 통행 허락을 받지 못했습니다. 먼저 예를 갖추는 편이 좋겠습니다.';
  }
  const cost = score >= 170 ? 0 : CONFIG.foreignSites.passageGiftGrain;
  if (state.resources.grain < cost) return `통행 예물로 곡물 ${cost}이 필요합니다.`;
  state.resources.grain -= cost;
  const until = state.day + CONFIG.foreignSites.passageDays;
  for (const zone of zones) zone.permittedUntilDay = until;
  const revealed = revealPassageRoute(state, site);
  site.trust = Math.min(100, site.trust + 5);
  site.goodwill = Math.min(100, site.goodwill + 3);
  site.lastInteractionDay = state.day;
  addForeignSiteMemory(state, site.id, `${until}일까지 산길 통행과 상단 왕래를 보장하기로 약조했습니다.`, 'good');
  addLog(state,
    `${site.name}에 통행을 청해 ${CONFIG.foreignSites.passageDays}일 동안 산길을 이용하기로 약조했습니다` +
      `${cost > 0 ? ` (곡물 -${cost})` : ''}. 길잡이가 산길 ${revealed}칸을 새로 알려 주었습니다.`,
    'good', true);
  return null;
}

export function requestHuntingRights(state: GameState, siteId: number): string | null {
  const site = getSite(state, siteId);
  if (!site) return '거점을 찾을 수 없습니다.';
  const blocked = canAddressSite(site);
  if (blocked) return blocked;
  const zones = state.claimZones.filter(zone => zone.siteId === site.id && (zone.kind === 'hunting' || zone.kind === 'forest'));
  if (zones.length === 0) return '이 거점과 협의할 사냥터가 없습니다.';
  const score = diplomacyScore(state, site);
  if (score < 100) {
    site.alarm = Math.min(100, site.alarm + 5);
    if (site.factionName) changeRelation(state, site.factionName, -2);
    addForeignSiteMemory(state, site.id, '사냥터를 함께 쓰자는 청을 거절했습니다.', 'bad');
    return '사냥터를 나눌 만큼 신뢰가 쌓이지 않았습니다. 예물을 보내거나 관계를 다져야 합니다.';
  }
  const cost = site.trust >= 65 || (site.factionName ? getRelation(state, site.factionName) : 0) >= 70
    ? CONFIG.foreignSites.highTrustHuntingGiftGrain
    : CONFIG.foreignSites.huntingGiftGrain;
  if (state.resources.grain < cost) return `사냥터 사용의 답례로 곡물 ${cost}이 필요합니다.`;
  state.resources.grain -= cost;
  const until = state.day + CONFIG.foreignSites.huntingRightsDays;
  for (const zone of zones) zone.permittedUntilDay = until;
  site.trust = Math.min(100, site.trust + 6);
  site.lastInteractionDay = state.day;
  addForeignSiteMemory(state, site.id, `${until}일까지 사냥터와 숲을 함께 쓰기로 약조했습니다.`, 'good');
  addLog(state, `${site.name}에 사냥터 사용을 청했습니다. 곡물 ${cost}을 답례하고 ${CONFIG.foreignSites.huntingRightsDays}일 동안 이용을 묵인받았습니다.`, 'good', true);
  return null;
}

function fieldTeam(state: GameState, memberIds?: Iterable<number>) {
  const away = new Set(state.expedition?.memberIds ?? []);
  const selected = memberIds ? new Set(memberIds) : null;
  const available = livingResidents(state).filter(resident =>
    (selected ? selected.has(resident.id) : !away.has(resident.id)) &&
    state.day >= (resident.quarantinedUntil ?? 0) && !resident.sick && resident.health >= 20);
  const hunters = available.filter(resident => resident.job === 'hunter').length;
  const watchmen = available.filter(resident => resident.job === 'watchman').length;
  const militia = available.filter(resident => resident.job === 'militia').length;
  return { available, hunters, watchmen, militia };
}

export function scoutBanditLair(state: GameState, siteId: number, rng: () => number): string | null {
  const site = getSite(state, siteId);
  if (!site || site.type !== 'banditLair') return '정찰할 산채가 아닙니다.';
  if (!isForeignSiteOperational(site)) return '이미 비어 있거나 불탄 산채입니다.';
  const team = fieldTeam(state);
  const weatherPenalty = state.weather === 'blizzard' ? 0.24 : state.weather === 'coldSnap' ? 0.12 : 0;
  const chance = Math.max(0.12, Math.min(0.92,
    0.28 + team.hunters * 0.09 + team.watchmen * 0.07 + team.militia * 0.06 - weatherPenalty));
  site.lastInteractionDay = state.day;
  if (rng() < chance) {
    site.discovered = true;
    site.scoutedUntilDay = state.day + 48;
    site.alarm = Math.min(100, site.alarm + 4);
    addForeignSiteMemory(state, site.id, '정찰대가 산채의 인원과 드나드는 길을 파악했습니다.', 'good');
    addLog(state, `정찰대가 ${site.name}의 규모와 길목을 파악했습니다. 다음 산채발 습격을 더 일찍 발견할 수 있습니다.`, 'good', true);
    return null;
  }
  site.alarm = Math.min(100, site.alarm + 12);
  state.threat = Math.min(100, state.threat + 6);
  const candidates = team.available.filter(resident => resident.job === 'hunter' || resident.job === 'watchman' || resident.job === 'militia');
  const victim = (candidates.length > 0 ? candidates : team.available)[Math.floor(rng() * Math.max(1, candidates.length || team.available.length))];
  if (victim) {
    const damage = 14 + Math.floor(rng() * 18);
    victim.health = Math.max(1, victim.health - damage);
    addLog(state, `${victim.name}이(가) 산채 정찰 중 발각되어 부상을 입었습니다. (건강 -${damage})`, 'bad', true);
  }
  addForeignSiteMemory(state, site.id, '개척지 정찰대가 접근했다가 산채 경계병에게 발각되었습니다.', 'bad');
  return '정찰대가 발각되었습니다. 산채의 경계가 강화되고 전역 위협이 높아졌습니다.';
}

export type BanditLairOutcome = 'victory' | 'defeat' | 'withdrawal';

export interface BanditLairAssaultResult {
  outcome: Exclude<BanditLairOutcome, 'withdrawal'>;
  chance: number;
  powderUsed: number;
  injuredResidentId?: number;
  injuryDamage?: number;
  loot: Partial<Record<ResourceId, number>>;
}

export function applyBanditLairOutcome(
  state: GameState,
  siteId: number,
  outcome: BanditLairOutcome,
): string | null {
  const site = getSite(state, siteId);
  if (!site || site.type !== 'banditLair') return '정주 부락은 공격 대상이 아닙니다.';
  if (!isForeignSiteOperational(site)) return '이미 비어 있거나 불탄 산채입니다.';
  site.lastInteractionDay = state.day;
  if (outcome === 'victory') {
    site.status = 'burned';
    site.alarm = 100;
    state.threat = Math.max(0, state.threat - 25);
    state.raidCooldown = Math.max(state.raidCooldown, CONFIG.foreignSites.lairSuppressionDays);
    state.resources.grain += 8;
    state.resources.hide += 6;
    state.resources.tools += 2;
    state.resources.reputation = Math.min(100, state.resources.reputation + 5);
    if (site.factionName) changeRelation(state, site.factionName, -10);
    addForeignSiteMemory(state, site.id, '개척지 토벌대가 산채를 무너뜨리고 불태웠습니다.', 'bad');
    // TODO: 조정 전초기지 시스템에서 futureCourtMerit 보고 훅으로 연결한다.
    addLog(state, `변경 마적 산채를 토벌했습니다. 곡물 8, 가죽 6, 도구 2, 명성 +5. 한동안 산채발 습격이 줄어듭니다.`, 'good', true);
    return null;
  }
  if (outcome === 'withdrawal') {
    site.alarm = Math.min(100, site.alarm + 10);
    addForeignSiteMemory(state, site.id, '개척지 토벌대가 교전을 피하고 물러났습니다.', 'neutral');
    addLog(state, '토벌대가 산채 공격을 중지하고 철수했습니다. 산채의 경계가 높아집니다.', 'info', true);
    return null;
  }
  site.status = 'fortified';
  site.alarm = 100;
  state.threat = Math.min(100, state.threat + 12);
  addForeignSiteMemory(state, site.id, '산채가 개척지 토벌대를 물리치고 방비를 강화했습니다.', 'bad');
  addLog(state, '산채 토벌에 실패했습니다. 변경 마적의 보복 움직임으로 전역 위협이 높아졌습니다.', 'bad', true);
  return null;
}

export function resolveBanditLairAssault(
  state: GameState,
  siteId: number,
  memberIds: Iterable<number>,
  rng: () => number,
): BanditLairAssaultResult | string {
  const site = getSite(state, siteId);
  if (!site || site.type !== 'banditLair') return '정주 부락은 공격 대상이 아닙니다.';
  if (!site.discovered) return '위치를 확인한 산채만 토벌할 수 있습니다.';
  if (!isForeignSiteOperational(site)) return '이미 비어 있거나 불탄 산채입니다.';
  const members = expeditionResidentsForIds(state, memberIds).filter(resident =>
    resident.job === 'militia' || resident.job === 'watchman' || resident.job === 'hunter');
  if (members.length < 2) return '교전할 수 있는 토벌대원이 부족합니다.';
  const ids = members.map(resident => resident.id);
  const chance = banditLairRaidChance(state, siteId, ids);
  const powderUsed = consumeExpeditionPowder(state, ids);
  const outcome = rng() < chance ? 'victory' : 'defeat';
  const applyError = applyBanditLairOutcome(state, siteId, outcome);
  if (applyError) return applyError;
  const result: BanditLairAssaultResult = {
    outcome,
    chance,
    powderUsed,
    loot: outcome === 'victory' ? { grain: 8, hide: 6, tools: 2 } : {},
  };
  if (outcome === 'victory') return result;
  const victim = members[Math.floor(rng() * members.length)];
  if (victim) {
    const damage = 24 + Math.floor(rng() * 25);
    victim.health = Math.max(1, victim.health - damage);
    result.injuredResidentId = victim.id;
    result.injuryDamage = damage;
    addLog(state, `${victim.name}이(가) 산채 토벌 실패로 중상을 입었습니다. (건강 -${damage})`, 'bad', true);
  }
  return result;
}

export function raidBanditLair(state: GameState, siteId: number, rng: () => number): string | null {
  if (state.battle || state.raiders) return '습격에 대응 중에는 산채 토벌대를 보낼 수 없습니다.';
  const team = fieldTeam(state);
  const combatants = team.available.filter(resident =>
    resident.job === 'hunter' || resident.job === 'watchman' || resident.job === 'militia');
  const result = resolveBanditLairAssault(state, siteId, combatants.map(resident => resident.id), rng);
  return typeof result === 'string' ? result : null;
}

export function banditLairRaidChance(
  state: GameState,
  siteId: number,
  memberIds?: Iterable<number>,
): number {
  const site = getSite(state, siteId);
  if (!site || site.type !== 'banditLair' || !site.discovered || !isForeignSiteOperational(site)) return 0;
  const team = fieldTeam(state, memberIds);
  const combatants = team.available.filter(resident =>
    resident.job === 'hunter' || resident.job === 'watchman' || resident.job === 'militia');
  const weapons = weaponCountsForResidents(state, combatants);
  const militia = combatants.filter(resident => resident.job === 'militia').length;
  const watchmen = combatants.filter(resident => resident.job === 'watchman').length;
  const hunters = combatants.filter(resident => resident.job === 'hunter').length;
  const power = expeditionCombatPower(state, combatants.map(resident => resident.id));
  return Math.max(0.1, Math.min(0.9,
    0.18 + power / 240 + militia * 0.07 + watchmen * 0.045 + hunters * 0.04 +
    weapons.readyMuskets * 0.08 + (weapons.hornBows + weapons.spears) * 0.018 - site.militaryPower / 180));
}
