// 능동 외교 활동 — E1 예물 사절부터 단계적으로 확장한다.
import { CONFIG } from './config';
import { FACTIONS, RESOURCE_NAMES, SEASON_NAMES } from './constants';
import { DIPLOMATIC_FACTION_NAMES, factionLeaderFor } from './diplomaticFigures';
import { isJurchenFactionName } from './defectors';
import { addLog } from './events';
import { addForeignSiteMemory } from './foreignSites';
import { withJosa } from './josa';
import { revealPassageRoute } from './passage';
import { changeRelation, getRelation } from './relations';
import { LUXURY_RESOURCES } from './resourceCatalog';
import { getSeason, getYear } from './seasons';
import { factionValue } from './tradeValues';
import type { ClaimZone, FactionLeader, GameState, PendingEnvoy, ResourceId } from './types';

const GIFT_RESOURCES = [...LUXURY_RESOURCES, 'silver'] as const satisfies readonly ResourceId[];

function isGiftResource(resource: ResourceId): boolean {
  return (GIFT_RESOURCES as readonly ResourceId[]).includes(resource);
}

function giftEnvoysFor(state: GameState, factionName: string): PendingEnvoy[] {
  return (state.pendingEnvoys ?? []).filter(envoy => envoy.kind === 'gift' && envoy.factionName === factionName);
}

function pactEnvoysFor(state: GameState, factionName: string): PendingEnvoy[] {
  return (state.pendingEnvoys ?? []).filter(envoy => envoy.kind === 'pact' && envoy.factionName === factionName);
}

function claimAccordEnvoysFor(state: GameState, zoneId: number): PendingEnvoy[] {
  return (state.pendingEnvoys ?? []).filter(envoy => envoy.kind === 'claimAccord' && envoy.claimZoneId === zoneId);
}

export function activeDiplomaticPact(state: GameState, factionName: string) {
  return (state.diplomaticPacts ?? []).find(pact => pact.factionName === factionName && pact.untilDay > state.day) ?? null;
}

export function pactRemainingDays(state: GameState, factionName: string): number | null {
  const pact = activeDiplomaticPact(state, factionName);
  return pact ? Math.max(0, pact.untilDay - state.day) : null;
}

export function activeClaimAccord(state: GameState, zoneId: number) {
  return (state.claimAccords ?? []).find(accord => accord.zoneId === zoneId && accord.untilDay > state.day) ?? null;
}

export function claimAccordRemainingDays(state: GameState, zoneId: number): number | null {
  const accord = activeClaimAccord(state, zoneId);
  return accord ? Math.max(0, accord.untilDay - state.day) : null;
}

function claimZoneFor(state: GameState, zoneId: number): ClaimZone | null {
  return state.claimZones.find(zone => zone.id === zoneId) ?? null;
}

function claimZoneFaction(state: GameState, zone: ClaimZone): string | null {
  const site = state.foreignSites.find(candidate => candidate.id === zone.siteId);
  return site?.factionName && site.status !== 'abandoned' && site.status !== 'burned' ? site.factionName : null;
}

export function claimAccordZonesForFaction(state: GameState, factionName: string): ClaimZone[] {
  return state.claimZones
    .filter(zone => zone.discovered && claimZoneFaction(state, zone) === factionName)
    .sort((a, b) => a.id - b.id);
}

const CLAIM_ACCORD_LABELS: Record<ClaimZone['kind'], string> = {
  hunting: '사냥터', fishing: '어로 구역', forest: '숲 이용지', field: '경작지 주변', sacred: '금기 구역', passage: '통행로',
};

export interface ClaimAccordPreview {
  value: number;
  requiredValue: number;
  durationDays: number;
  meetsValue: boolean;
}

// 우호가 100이면 절반, 0이면 정가다. 반경이 큰 생활권은 매년 더 많은 몫을 내야 한다.
function claimAccordRequiredValue(state: GameState, factionName: string, zone: ClaimZone): number {
  const base = CONFIG.diplomacy.claimAccordBaseValue + zone.radius * CONFIG.diplomacy.claimAccordRadiusValue;
  const relation = Math.max(0, Math.min(100, getRelation(state, factionName)));
  const multiplier = 1 - (relation / 100) * (1 - CONFIG.diplomacy.claimAccordMinimumRelationMultiplier);
  return Math.max(1, Math.ceil(base * multiplier));
}

export function claimAccordPreview(
  state: GameState, factionName: string, zoneId: number, resource: ResourceId, amount: number,
): ClaimAccordPreview {
  const zone = claimZoneFor(state, zoneId);
  const safeAmount = Number.isFinite(amount) ? Math.max(1, Math.floor(amount)) : 1;
  const requiredValue = zone ? claimAccordRequiredValue(state, factionName, zone) : Number.POSITIVE_INFINITY;
  const value = safeAmount * factionValue(factionName, resource);
  return { value, requiredValue, durationDays: CONFIG.time.yearDays, meetsValue: value >= requiredValue };
}

export function claimAccordLabel(zone: ClaimZone): string {
  return CLAIM_ACCORD_LABELS[zone.kind];
}

export function eligibleClaimAccordResources(state: GameState, factionName: string): ResourceId[] {
  const faction = FACTIONS.find(candidate => candidate.name === factionName);
  const accepted = new Set<ResourceId>(['silver', ...(faction?.imports ?? [])]);
  accepted.delete('reputation');
  accepted.delete('defense');
  return [...accepted].filter(resource => Math.floor(state.resources[resource] ?? 0) > 0);
}

function claimAccordFactionReason(state: GameState, factionName: string, zoneId: number): string | null {
  if (!FACTIONS.some(faction => faction.name === factionName)) return '세력을 찾을 수 없습니다';
  const zone = claimZoneFor(state, zoneId);
  if (!zone || !zone.discovered || claimZoneFaction(state, zone) !== factionName) return '협정할 생활권을 찾을 수 없습니다';
  if (!factionLeaderFor(state, factionName)) return '협정을 받을 지도자를 찾을 수 없습니다';
  if (activeClaimAccord(state, zoneId)) return '이미 이 생활권 협정이 유효합니다';
  if (claimAccordEnvoysFor(state, zoneId).length > 0) return '이미 이 생활권으로 협정 사절이 왕복 중입니다';
  return null;
}

function hasClaimAccordPaymentCapacity(state: GameState, factionName: string, zoneId: number): boolean {
  const zone = claimZoneFor(state, zoneId);
  if (!zone) return false;
  const required = claimAccordRequiredValue(state, factionName, zone);
  return eligibleClaimAccordResources(state, factionName).some(resource =>
    Math.floor(state.resources[resource] ?? 0) * factionValue(factionName, resource) >= required);
}

export function canOpenClaimAccordEnvoy(state: GameState, factionName: string, zoneId: number): string | null {
  if (state.pendingChoice || state.battle) return '지금은 사절을 보낼 수 없습니다';
  const reason = claimAccordFactionReason(state, factionName, zoneId);
  if (reason) return reason;
  const zone = claimZoneFor(state, zoneId)!;
  if (!hasClaimAccordPaymentCapacity(state, factionName, zoneId)) {
    return `${claimAccordLabel(zone)} 협정에 낼 은이나 물자가 부족합니다`;
  }
  return null;
}

export function openClaimAccordEnvoy(state: GameState, factionName: string, zoneId: number): string | null {
  const reason = canOpenClaimAccordEnvoy(state, factionName, zoneId);
  if (reason) return reason;
  const zone = claimZoneFor(state, zoneId)!;
  const leader = factionLeaderFor(state, factionName)!;
  state.pendingChoice = {
    kind: 'claimAccordEnvoy',
    title: `${leader.name} ${leader.title}에게 생활권 협정 제안`,
    body: `${claimAccordLabel(zone)}의 채집·작업 권리를 1년간 청합니다. 은 또는 그들이 받는 물자를 동봉하면 사절은 여섯 날 뒤 답신을 들고 돌아옵니다.`,
    options: [],
    data: { factionName, zoneId },
  };
  return null;
}

export function cancelClaimAccordEnvoy(state: GameState): void {
  if (state.pendingChoice?.kind === 'claimAccordEnvoy') state.pendingChoice = null;
}

export function sendClaimAccordEnvoy(
  state: GameState, factionName: string, zoneId: number, resource: ResourceId, amount: number,
): string | null {
  if (state.pendingChoice?.kind !== 'claimAccordEnvoy' ||
    state.pendingChoice.data.factionName !== factionName || state.pendingChoice.data.zoneId !== zoneId) {
    return '생활권 협정 사절 준비가 열려 있지 않습니다';
  }
  const reason = claimAccordFactionReason(state, factionName, zoneId);
  if (reason) return reason;
  const accepted = eligibleClaimAccordResources(state, factionName);
  if (!accepted.includes(resource)) return '은 또는 그들이 받는 물자만 협정 대가로 낼 수 있습니다';
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 1) return '물자 수량은 1 이상 정수여야 합니다';
  if ((state.resources[resource] ?? 0) < amount) return `${withJosa(RESOURCE_NAMES[resource], '이/가')} 부족합니다`;
  const preview = claimAccordPreview(state, factionName, zoneId, resource, amount);
  if (!preview.meetsValue) return `제안 가치가 ${preview.requiredValue}에 못 미칩니다`;
  const zone = claimZoneFor(state, zoneId)!;
  const dueDay = state.day + CONFIG.diplomacy.envoyTravelDays;
  state.resources[resource] -= amount;
  state.pendingEnvoys.push({
    factionName, kind: 'claimAccord', payload: { [resource]: amount }, dueDay,
    giftValue: preview.value, claimZoneId: zoneId, claimAccordUntilDay: dueDay + CONFIG.time.yearDays,
  });
  state.pendingChoice = null;
  const leader = factionLeaderFor(state, factionName);
  const recipient = leader ? `${leader.name} ${leader.title}` : factionName;
  addLog(state, `${recipient}에게 ${claimAccordLabel(zone)} 협정을 청하며 ${RESOURCE_NAMES[resource]} ${withJosa(amount, '을/를')} 보냈습니다. 사절은 ${CONFIG.diplomacy.envoyTravelDays}일 뒤 돌아옵니다.`, 'info', true);
  return null;
}

function giftsInSeason(state: GameState, factionName: string): number {
  const season = Math.floor((Math.max(1, state.day) - 1) / CONFIG.time.seasonDays);
  return (state.giftEnvoyDays?.[factionName] ?? []).filter(day =>
    Math.floor((Math.max(1, day) - 1) / CONFIG.time.seasonDays) === season,
  ).length;
}

function giftsInYear(state: GameState, factionName: string): number {
  const year = getYear(state.day);
  return (state.giftEnvoyDays?.[factionName] ?? []).filter(day => getYear(day) === year).length;
}

function giftFactionReason(state: GameState, factionName: string): string | null {
  if (!FACTIONS.some(faction => faction.name === factionName)) return '세력을 찾을 수 없습니다';
  if (!isJurchenFactionName(factionName) || !factionLeaderFor(state, factionName)) {
    return '예물은 여진 부족 지도자에게만 보낼 수 있습니다';
  }
  if (giftEnvoysFor(state, factionName).length > 0) return '이미 이 세력으로 예물 사절이 왕복 중입니다';
  if (giftsInSeason(state, factionName) > 0) {
    return `이번 ${SEASON_NAMES[getSeason(state.day)]}에는 이미 예물을 보냈습니다`;
  }
  return null;
}

export function eligibleGiftResources(state: GameState): ResourceId[] {
  return GIFT_RESOURCES.filter(resource => Math.floor(state.resources[resource] ?? 0) > 0);
}

export function canOpenGiftEnvoy(state: GameState, factionName: string): string | null {
  if (state.pendingChoice || state.battle) return '지금은 사절을 보낼 수 없습니다';
  const factionReason = giftFactionReason(state, factionName);
  if (factionReason) return factionReason;
  if (eligibleGiftResources(state).length === 0) return '보낼 사치품이나 은이 없습니다';
  return null;
}

export interface GiftPreview {
  value: number;
  relationGain: number;
  repeatedThisYear: boolean;
  suspicion: number;
}

export function giftPreview(state: GameState, factionName: string, resource: ResourceId, amount: number): GiftPreview {
  const safeAmount = Number.isFinite(amount) ? Math.max(1, Math.floor(amount)) : 1;
  const value = safeAmount * factionValue(factionName, resource);
  const baseGain = Math.max(1, Math.min(
    CONFIG.diplomacy.giftRelationGainMax,
    Math.floor(Math.sqrt(Math.max(0, value)) * CONFIG.diplomacy.giftRelationGainScale),
  ));
  const repeatedThisYear = giftsInYear(state, factionName) > 0;
  return {
    value,
    relationGain: repeatedThisYear
      ? Math.max(1, Math.floor(baseGain * CONFIG.diplomacy.repeatGiftYearMultiplier))
      : baseGain,
    repeatedThisYear,
    suspicion: CONFIG.diplomacy.giftSuspicion,
  };
}

export interface PactPreview {
  value: number;
  years: number;
  days: number;
  suspicion: number;
  meetsGiftValue: boolean;
}

function pactYearsForRelation(relation: number): number {
  if (relation >= 90) return 4;
  if (relation >= 75) return 3;
  return 2;
}

export function pactPreview(state: GameState, factionName: string, resource: ResourceId, amount: number): PactPreview {
  const safeAmount = Number.isFinite(amount) ? Math.max(1, Math.floor(amount)) : 1;
  const value = safeAmount * factionValue(factionName, resource);
  const years = pactYearsForRelation(getRelation(state, factionName));
  return {
    value,
    years,
    days: years * CONFIG.time.yearDays,
    suspicion: CONFIG.diplomacy.pactSuspicion,
    meetsGiftValue: value >= CONFIG.diplomacy.pactGiftValueMin,
  };
}

function pactFactionReason(state: GameState, factionName: string): string | null {
  if (!FACTIONS.some(faction => faction.name === factionName)) return '세력을 찾을 수 없습니다';
  if (!isJurchenFactionName(factionName) || !factionLeaderFor(state, factionName)) {
    return '맹약은 여진 부족 지도자와만 맺을 수 있습니다';
  }
  if (getRelation(state, factionName) < CONFIG.diplomacy.pactRelationRequired) {
    return `관계 ${CONFIG.diplomacy.pactRelationRequired} 이상이어야 맹약을 제안할 수 있습니다`;
  }
  if (activeDiplomaticPact(state, factionName)) return '이미 이 세력과 화친 맹약이 유효합니다';
  if (pactEnvoysFor(state, factionName).length > 0) return '이미 이 세력으로 맹약 사절이 왕복 중입니다';
  if (giftEnvoysFor(state, factionName).length > 0) return '예물 사절이 돌아온 뒤 맹약을 제안할 수 있습니다';
  return null;
}

function hasPactGiftCapacity(state: GameState, factionName: string): boolean {
  return GIFT_RESOURCES.some(resource =>
    Math.floor(state.resources[resource] ?? 0) * factionValue(factionName, resource) >= CONFIG.diplomacy.pactGiftValueMin);
}

export function canOpenPactEnvoy(state: GameState, factionName: string): string | null {
  if (state.pendingChoice || state.battle) return '지금은 사절을 보낼 수 없습니다';
  const factionReason = pactFactionReason(state, factionName);
  if (factionReason) return factionReason;
  if (!hasPactGiftCapacity(state, factionName)) {
    return `동봉할 예물 가치가 ${CONFIG.diplomacy.pactGiftValueMin} 이상이어야 합니다`;
  }
  return null;
}

export function openPactEnvoy(state: GameState, factionName: string): string | null {
  const reason = canOpenPactEnvoy(state, factionName);
  if (reason) return reason;
  const leader = factionLeaderFor(state, factionName);
  if (!leader) return '맹약을 받을 지도자를 찾을 수 없습니다';
  state.pendingChoice = {
    kind: 'pactEnvoy',
    title: `${leader.name} ${leader.title}에게 화친 맹약 제안`,
    body: '예물을 동봉해 불가침을 청하십시오. 사절은 여섯 날 뒤 답신과 함께 돌아옵니다.',
    options: [],
    data: { factionName },
  };
  return null;
}

export function cancelPactEnvoy(state: GameState): void {
  if (state.pendingChoice?.kind === 'pactEnvoy') state.pendingChoice = null;
}

export function sendPactEnvoy(
  state: GameState,
  factionName: string,
  resource: ResourceId,
  amount: number,
): string | null {
  if (state.pendingChoice?.kind !== 'pactEnvoy' || state.pendingChoice.data.factionName !== factionName) {
    return '맹약 사절 준비가 열려 있지 않습니다';
  }
  const factionReason = pactFactionReason(state, factionName);
  if (factionReason) return factionReason;
  if (!isGiftResource(resource)) return '사치품과 은만 맹약 예물로 보낼 수 있습니다';
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 1) return '예물 수량은 1 이상 정수여야 합니다';
  if ((state.resources[resource] ?? 0) < amount) return `${withJosa(RESOURCE_NAMES[resource], '이/가')} 부족합니다`;

  const preview = pactPreview(state, factionName, resource, amount);
  if (!preview.meetsGiftValue) {
    return `동봉할 예물 가치는 ${CONFIG.diplomacy.pactGiftValueMin} 이상이어야 합니다`;
  }
  state.resources[resource] -= amount;
  state.pendingEnvoys.push({
    factionName,
    kind: 'pact',
    payload: { [resource]: amount },
    dueDay: state.day + CONFIG.diplomacy.envoyTravelDays,
    giftValue: preview.value,
    pactYears: preview.years,
  });
  state.pendingChoice = null;
  const leader = factionLeaderFor(state, factionName);
  const recipient = leader ? `${leader.name} ${leader.title}` : factionName;
  addLog(
    state,
    `${recipient}에게 ${RESOURCE_NAMES[resource]} ${withJosa(amount, '을/를')} 동봉해 화친 맹약을 청했습니다. ` +
      `사절은 ${CONFIG.diplomacy.envoyTravelDays}일 뒤 돌아옵니다.`,
    'info',
    true,
  );
  return null;
}

export function openGiftEnvoy(state: GameState, factionName: string): string | null {
  const reason = canOpenGiftEnvoy(state, factionName);
  if (reason) return reason;
  const leader = factionLeaderFor(state, factionName);
  if (!leader) return '예물을 받을 지도자를 찾을 수 없습니다';
  state.pendingChoice = {
    kind: 'giftEnvoy',
    title: `${leader.name} ${leader.title}에게 예물 보내기`,
    body: '사치품이나 은을 골라 사절에게 맡기십시오. 사절은 여섯 날 뒤 답신과 함께 돌아옵니다.',
    options: [],
    data: { factionName },
  };
  return null;
}

export function cancelGiftEnvoy(state: GameState): void {
  if (state.pendingChoice?.kind === 'giftEnvoy') state.pendingChoice = null;
}

export function sendGiftEnvoy(
  state: GameState,
  factionName: string,
  resource: ResourceId,
  amount: number,
): string | null {
  if (state.pendingChoice?.kind !== 'giftEnvoy' || state.pendingChoice.data.factionName !== factionName) {
    return '예물 사절 준비가 열려 있지 않습니다';
  }
  const factionReason = giftFactionReason(state, factionName);
  if (factionReason) return factionReason;
  if (!isGiftResource(resource)) return '사치품과 은만 예물로 보낼 수 있습니다';
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 1) return '예물 수량은 1 이상 정수여야 합니다';
  if ((state.resources[resource] ?? 0) < amount) return `${withJosa(RESOURCE_NAMES[resource], '이/가')} 부족합니다`;

  const preview = giftPreview(state, factionName, resource, amount);
  state.resources[resource] -= amount;
  state.pendingEnvoys.push({
    factionName,
    kind: 'gift',
    payload: { [resource]: amount },
    dueDay: state.day + CONFIG.diplomacy.envoyTravelDays,
    relationGain: preview.relationGain,
    giftValue: preview.value,
  });
  state.giftEnvoyDays[factionName] = [...(state.giftEnvoyDays[factionName] ?? []), state.day].slice(-16);
  state.suspicion = Math.min(100, state.suspicion + preview.suspicion);
  state.pendingChoice = null;

  const leader = factionLeaderFor(state, factionName);
  const recipient = leader ? `${leader.name} ${leader.title}` : factionName;
  addLog(
    state,
    `${recipient}에게 ${RESOURCE_NAMES[resource]} ${withJosa(amount, '을/를')} 예물로 보냈습니다. ` +
      `사절은 ${CONFIG.diplomacy.envoyTravelDays}일 뒤 돌아옵니다. (모반 의심 +${preview.suspicion})`,
    'info',
    true,
  );
  return null;
}

function giftReply(temper: NonNullable<ReturnType<typeof factionLeaderFor>>['temper']): string {
  return {
    bold: '화끈한 마음씨라며 잔치를 열었다.',
    wily: '뜻은 받되 이 호의의 값을 오래 기억하겠다고 답했다.',
    taciturn: '말없이 예물을 살피고 고개를 끄덕였다고 한다.',
    fierce: '예물을 받은 만큼 국경의 칼을 거두겠다고 전했다.',
  }[temper];
}

function resolveGiftEnvoy(state: GameState, envoy: PendingEnvoy): void {
  const gain = Math.max(0, Math.floor(envoy.relationGain ?? 0));
  const before = getRelation(state, envoy.factionName);
  changeRelation(state, envoy.factionName, gain);
  const actualGain = Math.max(0, Math.round(getRelation(state, envoy.factionName) - before));
  const leader = factionLeaderFor(state, envoy.factionName);
  const recipient = leader ? `${leader.name} ${leader.title}` : envoy.factionName;
  const reply = leader ? giftReply(leader.temper) : '예물을 받고 답신을 보냈다.';
  addLog(
    state,
    `${withJosa(recipient, '이/가')} 예물을 받았습니다. ${reply} (${withJosa(envoy.factionName, '과/와')}의 관계 +${actualGain})`,
    'good',
    true,
  );
}

function pactReply(temper: NonNullable<ReturnType<typeof factionLeaderFor>>['temper']): string {
  return {
    bold: '우리 말이 살아 있는 동안 서로의 길에 칼을 세우지 않겠다고 맹세했다.',
    wily: '약조의 글을 오래 간직하겠다고 하며, 서로 이득을 보는 평화를 택했다.',
    taciturn: '말없이 맹약의 표식을 건네고 고개를 끄덕였다.',
    fierce: '맹약이 살아 있는 동안 국경의 칼을 거두겠다고 맹세했다.',
  }[temper];
}

function resolvePactEnvoy(state: GameState, envoy: PendingEnvoy): void {
  const years = Math.max(2, Math.min(4, Math.floor(envoy.pactYears ?? 2)));
  const untilDay = state.day + years * CONFIG.time.yearDays;
  state.diplomaticPacts = (state.diplomaticPacts ?? []).filter(pact => pact.factionName !== envoy.factionName);
  state.diplomaticPacts.push({ factionName: envoy.factionName, untilDay });
  state.suspicion = Math.min(100, state.suspicion + CONFIG.diplomacy.pactSuspicion);
  const leader = factionLeaderFor(state, envoy.factionName);
  const recipient = leader ? `${leader.name} ${leader.title}` : envoy.factionName;
  const reply = leader ? pactReply(leader.temper) : '화친의 표식을 돌려보냈다.';
  addLog(
    state,
    `${withJosa(recipient, '이/가')} 화친 맹약을 받아들였습니다. ${reply} ` +
      `(${years}년간 불가침 · 모반 의심 +${CONFIG.diplomacy.pactSuspicion})`,
    'good',
    true,
  );
}

function resolveClaimAccordEnvoy(state: GameState, envoy: PendingEnvoy): void {
  const zoneId = Math.floor(envoy.claimZoneId ?? -1);
  const zone = claimZoneFor(state, zoneId);
  if (!zone || claimZoneFaction(state, zone) !== envoy.factionName) {
    addLog(state, `${withJosa(envoy.factionName, '이/가')} 생활권 경계가 달라졌다며 협정 사절을 돌려보냈습니다.`, 'bad', true);
    return;
  }
  const untilDay = Math.max(state.day + 1, Math.floor(envoy.claimAccordUntilDay ?? state.day + CONFIG.time.yearDays));
  state.claimAccords = (state.claimAccords ?? []).filter(accord => accord.zoneId !== zoneId);
  state.claimAccords.push({ zoneId, untilDay });
  const site = state.foreignSites.find(candidate => candidate.id === zone.siteId);
  const revealed = zone.kind === 'passage' && site ? revealPassageRoute(state, site) : 0;
  const leader = factionLeaderFor(state, envoy.factionName);
  const speaker = leader ? `${leader.name} ${leader.title}` : envoy.factionName;
  addLog(
    state,
    `${withJosa(speaker, '이/가')} ${claimAccordLabel(zone)}의 생활권 협정을 받아들였습니다. ` +
      `앞으로 ${CONFIG.time.yearDays}일 동안 그 구역의 채집·작업은 약조로 허락됩니다.` +
      (zone.kind === 'passage' ? ` 길잡이가 산길 ${revealed}칸을 새로 알려 주었습니다.` : ''),
    'good',
    true,
  );
  if (site) addForeignSiteMemory(state, site.id,
    `${untilDay}일까지 ${claimAccordLabel(zone)}의 채집·작업 권리를 약조했습니다.`, 'good');
}

export function breakDiplomaticPact(
  state: GameState,
  factionName: string,
  cause: 'lairAssault' | 'territoryViolation',
): boolean {
  if (!activeDiplomaticPact(state, factionName)) return false;
  state.diplomaticPacts = (state.diplomaticPacts ?? []).filter(pact => pact.factionName !== factionName);
  changeRelation(state, factionName, -CONFIG.diplomacy.pactBreakRelationLoss);
  state.threat = Math.min(100, state.threat + CONFIG.diplomacy.pactBreakThreat);
  const leader = factionLeaderFor(state, factionName);
  const speaker = leader ? `${leader.name} ${leader.title}` : factionName;
  const act = cause === 'lairAssault' ? '그들의 산채를 향해 토벌대를 보낸 일' : '그들의 생활권 항의를 묵살한 일';
  addLog(
    state,
    `${act}로 ${withJosa(speaker, '이/가')} 화친 맹약 파기를 통보했습니다. ` +
      `(관계 -${CONFIG.diplomacy.pactBreakRelationLoss} · 위협 +${CONFIG.diplomacy.pactBreakThreat})`,
    'bad',
    true,
  );
  return true;
}

function offerPactRenewal(state: GameState): void {
  if (state.pendingChoice) return;
  const expired = (state.diplomaticPacts ?? [])
    .filter(pact => pact.untilDay <= state.day)
    .sort((a, b) => a.untilDay - b.untilDay || a.factionName.localeCompare(b.factionName))[0];
  if (!expired) return;
  const leader = factionLeaderFor(state, expired.factionName);
  const reason = pactFactionReason(state, expired.factionName) ??
    (hasPactGiftCapacity(state, expired.factionName) ? null : `동봉할 예물 가치가 ${CONFIG.diplomacy.pactGiftValueMin} 이상이어야 합니다`);
  state.pendingChoice = {
    kind: 'pactRenewal',
    title: `${leader ? `${leader.name} ${leader.title}` : expired.factionName}의 화친 맹약`,
    body: `화친 맹약이 만료되었습니다. ${leader ? `${leader.name} ${leader.title}` : expired.factionName} 쪽에서 약조를 다시 이을 뜻이 있는지 묻습니다.`,
    options: [
      {
        id: 'renew',
        label: '예물을 동봉해 갱신한다',
        desc: '새 사절을 보내 다시 불가침을 청합니다.',
        disabled: !!reason,
        disabledReason: reason ?? undefined,
      },
      { id: 'decline', label: '이번에는 갱신하지 않는다', desc: '만료된 약조를 조용히 끝냅니다.' },
    ],
    data: { factionName: expired.factionName },
  };
}

export function resolvePactRenewal(state: GameState, optionId: string): void {
  const choice = state.pendingChoice;
  if (!choice || choice.kind !== 'pactRenewal') return;
  const factionName = typeof choice.data.factionName === 'string' ? choice.data.factionName : '';
  if (!factionName) {
    state.pendingChoice = null;
    return;
  }
  if (optionId === 'decline') {
    state.diplomaticPacts = (state.diplomaticPacts ?? []).filter(pact => pact.factionName !== factionName);
    state.pendingChoice = null;
    addLog(state, `${withJosa(factionName, '과/와')}의 화친 맹약을 갱신하지 않았습니다.`, 'info', true);
    return;
  }
  if (optionId !== 'renew') return;
  state.pendingChoice = null;
  const reason = openPactEnvoy(state, factionName);
  if (reason) addLog(state, `화친 맹약 갱신을 미뤘습니다. ${reason}`, 'info', true);
}

function offerClaimAccordRenewal(state: GameState): void {
  if (state.pendingChoice) return;
  const expired = (state.claimAccords ?? [])
    .filter(accord => accord.untilDay <= state.day)
    .map(accord => ({ accord, zone: claimZoneFor(state, accord.zoneId) }))
    .filter((entry): entry is { accord: NonNullable<GameState['claimAccords']>[number]; zone: ClaimZone } =>
      !!entry.zone && !!claimZoneFaction(state, entry.zone))
    .sort((a, b) => a.accord.untilDay - b.accord.untilDay || a.accord.zoneId - b.accord.zoneId)[0];
  if (!expired) return;
  const factionName = claimZoneFaction(state, expired.zone)!;
  const leader = factionLeaderFor(state, factionName);
  const reason = claimAccordFactionReason(state, factionName, expired.zone.id) ??
    (hasClaimAccordPaymentCapacity(state, factionName, expired.zone.id) ? null : `${claimAccordLabel(expired.zone)} 협정에 낼 은이나 물자가 부족합니다`);
  state.pendingChoice = {
    kind: 'claimAccordRenewal',
    title: `${leader ? `${leader.name} ${leader.title}` : factionName}의 생활권 협정`,
    body: `${claimAccordLabel(expired.zone)} 협정이 만료되었습니다. 약조를 다시 이을지 정하십시오.`,
    options: [
      { id: 'renew', label: '대가를 보내 갱신한다', desc: '새 사절을 보내 1년간의 채집·작업 권리를 다시 청합니다.', disabled: !!reason, disabledReason: reason ?? undefined },
      { id: 'decline', label: '이번에는 끝낸다', desc: '만료된 약조를 조용히 끝냅니다.' },
    ],
    data: { factionName, zoneId: expired.zone.id },
  };
}

export function resolveClaimAccordRenewal(state: GameState, optionId: string): void {
  const choice = state.pendingChoice;
  if (!choice || choice.kind !== 'claimAccordRenewal') return;
  const factionName = typeof choice.data.factionName === 'string' ? choice.data.factionName : '';
  const zoneId = Number.isFinite(choice.data.zoneId) ? Math.floor(choice.data.zoneId as number) : -1;
  if (!factionName || zoneId < 0) {
    state.pendingChoice = null;
    return;
  }
  if (optionId === 'decline') {
    state.claimAccords = (state.claimAccords ?? []).filter(accord => accord.zoneId !== zoneId);
    state.pendingChoice = null;
    addLog(state, `${withJosa(factionName, '과/와')}의 생활권 협정을 갱신하지 않았습니다.`, 'info', true);
    return;
  }
  if (optionId !== 'renew') return;
  state.pendingChoice = null;
  const reason = openClaimAccordEnvoy(state, factionName, zoneId);
  if (reason) addLog(state, `생활권 협정 갱신을 미뤘습니다. ${reason}`, 'info', true);
}

export function resolveClaimAccordOffer(state: GameState, optionId: string): void {
  const choice = state.pendingChoice;
  if (!choice || choice.kind !== 'claimAccordOffer') return;
  const factionName = typeof choice.data.factionName === 'string' ? choice.data.factionName : '';
  const zoneId = Number.isFinite(choice.data.zoneId) ? Math.floor(choice.data.zoneId as number) : -1;
  const applyTerritoryApologyFallback = (): void => {
    if (choice.data.fallback !== 'territoryApology' || !Number.isFinite(choice.data.siteId)) return;
    const siteId = Math.floor(choice.data.siteId as number);
    const site = state.foreignSites.find(candidate => candidate.id === siteId);
    if (!site) return;
    state.resources.reputation = Math.max(0, state.resources.reputation - 1);
    if (factionName) changeRelation(state, factionName, CONFIG.foreignSites.violationApologyRelation);
    site.alarm = Math.min(100, site.alarm + 6);
    addForeignSiteMemory(state, site.id, '생활권 협정 제안을 접고 침범을 인정했습니다.', 'bad');
    addLog(state, `${site.name}의 항의에 협정을 제안하지 않고 잘못을 인정했습니다.`, 'bad', true);
    state.territoryViolations = (state.territoryViolations ?? []).filter(violation => violation.siteId !== siteId);
  };
  if (optionId === 'decline') {
    applyTerritoryApologyFallback();
    state.pendingChoice = null;
    return;
  }
  if (optionId !== 'propose') return;
  state.pendingChoice = null;
  const reason = openClaimAccordEnvoy(state, factionName, zoneId);
  if (reason) {
    applyTerritoryApologyFallback();
    addLog(state, `생활권 협정 제안을 미뤘습니다. ${reason}`, 'info', true);
  } else if (choice.data.fallback === 'territoryApology' && Number.isFinite(choice.data.siteId)) {
    const siteId = Math.floor(choice.data.siteId as number);
    state.territoryViolations = (state.territoryViolations ?? []).filter(violation => violation.siteId !== siteId);
  }
}

export interface RaidTipInformant {
  factionName: string;
  leader: FactionLeader;
  relation: number;
}

// 공격 세력과 다른 여진 세력 중 관계 문턱을 넘은 가장 가까운 우방이 귀띔한다.
// 동률이면 외교 세력의 고정 순서를 따라 저장·호출 시점과 무관하게 같은 결과를 낸다.
export function raidTipInformant(state: GameState, attackerFactionName: string): RaidTipInformant | null {
  let best: RaidTipInformant | null = null;
  for (const factionName of DIPLOMATIC_FACTION_NAMES) {
    if (factionName === attackerFactionName) continue;
    const relation = getRelation(state, factionName);
    if (relation < CONFIG.diplomacy.raidTipRelation) continue;
    const leader = factionLeaderFor(state, factionName);
    if (!leader) continue;
    if (!best || relation > best.relation) best = { factionName, leader, relation };
  }
  return best;
}

function raidTipWords(leader: FactionLeader, attackerFactionName: string): string {
  const attacker = withJosa(attackerFactionName, '이/가');
  return {
    bold: `${attacker} 움직인다. 칼과 활을 갖추시오.`,
    wily: `${attacker} 길을 나섰소. 이 귀띔의 값은 나중에 기억해 주시오.`,
    taciturn: `${attacker} 움직인다. 대비하시오.`,
    fierce: `${attacker} 칼끝을 너희에게 돌렸다. 먼저 목을 지키시오.`,
  }[leader.temper];
}

export function announceRaidTip(
  state: GameState,
  informant: RaidTipInformant,
  attackerFactionName: string,
): string {
  const sender = `${informant.leader.name} ${informant.leader.title}`;
  const text =
    `${withJosa(sender, '이/가')} 사람을 보내 습격을 귀띔했습니다. ` +
    `“${raidTipWords(informant.leader, attackerFactionName)}”`;
  addLog(state, text, 'raid', true);
  return text;
}

// 하루가 넘어갈 때 왕복이 끝난 사절을 결산한다. 모달 충돌과 무관하게 답신은 온다.
export function dailyDiplomacyTick(state: GameState): void {
  const due = (state.pendingEnvoys ?? []).filter(envoy => envoy.dueDay <= state.day);
  if (due.length > 0) {
    state.pendingEnvoys = (state.pendingEnvoys ?? []).filter(envoy => envoy.dueDay > state.day);
    for (const envoy of due) {
      if (envoy.kind === 'gift') resolveGiftEnvoy(state, envoy);
      else if (envoy.kind === 'pact') resolvePactEnvoy(state, envoy);
      else if (envoy.kind === 'claimAccord') resolveClaimAccordEnvoy(state, envoy);
    }
  }
  offerPactRenewal(state);
  offerClaimAccordRenewal(state);
}

export function giftEnvoyRemainingDays(state: GameState, factionName: string): number | null {
  const envoy = giftEnvoysFor(state, factionName)[0];
  return envoy ? Math.max(0, envoy.dueDay - state.day) : null;
}

export function pactEnvoyRemainingDays(state: GameState, factionName: string): number | null {
  const envoy = pactEnvoysFor(state, factionName)[0];
  return envoy ? Math.max(0, envoy.dueDay - state.day) : null;
}

export function claimAccordEnvoyRemainingDays(state: GameState, zoneId: number): number | null {
  const envoy = claimAccordEnvoysFor(state, zoneId)[0];
  return envoy ? Math.max(0, envoy.dueDay - state.day) : null;
}

export function normalizeDiplomacyState(state: GameState): void {
  state.diplomaticPacts = Array.isArray(state.diplomaticPacts)
    ? state.diplomaticPacts.filter(pact => pact && typeof pact.factionName === 'string' && Number.isFinite(pact.untilDay))
      .map(pact => ({ factionName: pact.factionName, untilDay: Math.max(0, Math.floor(pact.untilDay)) }))
    : [];
  state.claimAccords = Array.isArray(state.claimAccords)
    ? state.claimAccords.filter(accord => accord && Number.isFinite(accord.zoneId) && Number.isFinite(accord.untilDay))
      .map(accord => ({ zoneId: Math.max(0, Math.floor(accord.zoneId)), untilDay: Math.max(0, Math.floor(accord.untilDay)) }))
    : [];
  state.pendingEnvoys = Array.isArray(state.pendingEnvoys)
    ? state.pendingEnvoys.filter(envoy => envoy && typeof envoy.factionName === 'string' &&
      (envoy.kind === 'gift' || envoy.kind === 'pact' || envoy.kind === 'claimAccord' || envoy.kind === 'aidRequest') && Number.isFinite(envoy.dueDay))
      .map(envoy => ({
        factionName: envoy.factionName,
        kind: envoy.kind,
        payload: envoy.payload && typeof envoy.payload === 'object' ? envoy.payload : {},
        dueDay: Math.max(0, Math.floor(envoy.dueDay)),
        relationGain: typeof envoy.relationGain === 'number' && Number.isFinite(envoy.relationGain)
          ? Math.max(0, Math.floor(envoy.relationGain))
          : undefined,
        giftValue: typeof envoy.giftValue === 'number' && Number.isFinite(envoy.giftValue)
          ? Math.max(0, envoy.giftValue)
          : undefined,
        pactYears: typeof envoy.pactYears === 'number' && Number.isFinite(envoy.pactYears)
          ? Math.max(2, Math.min(4, Math.floor(envoy.pactYears)))
          : undefined,
        claimZoneId: typeof envoy.claimZoneId === 'number' && Number.isFinite(envoy.claimZoneId)
          ? Math.max(0, Math.floor(envoy.claimZoneId))
          : undefined,
        claimAccordUntilDay: typeof envoy.claimAccordUntilDay === 'number' && Number.isFinite(envoy.claimAccordUntilDay)
          ? Math.max(0, Math.floor(envoy.claimAccordUntilDay))
          : undefined,
      }))
    : [];
  state.giftEnvoyDays = state.giftEnvoyDays && typeof state.giftEnvoyDays === 'object'
    ? Object.fromEntries(Object.entries(state.giftEnvoyDays).map(([factionName, days]) => [
      factionName,
      Array.isArray(days) ? days.filter(Number.isFinite).map(day => Math.max(1, Math.floor(day))).slice(-16) : [],
    ]))
    : {};
  state.proximityWarnings = Array.isArray(state.proximityWarnings)
    ? state.proximityWarnings.filter((warning): warning is string => typeof warning === 'string').slice(-200)
    : [];
  state.proximityWarningProgress = state.proximityWarningProgress && typeof state.proximityWarningProgress === 'object'
    ? Object.fromEntries(Object.entries(state.proximityWarningProgress)
      .filter(([key, value]) => typeof key === 'string' && key.length <= 120 && Number.isFinite(value))
      .slice(-512)
      .map(([key, value]) => [key, Math.max(0, Math.min(99, Math.floor(value)))]))
    : {};
}
