// 능동 외교 활동 — E1 예물 사절부터 단계적으로 확장한다.
import { CONFIG } from './config';
import { FACTIONS, RESOURCE_NAMES, SEASON_NAMES } from './constants';
import { DIPLOMATIC_FACTION_NAMES, factionLeaderFor } from './diplomaticFigures';
import { isJurchenFactionName } from './defectors';
import { addLog } from './events';
import { withJosa } from './josa';
import { changeRelation, getRelation } from './relations';
import { LUXURY_RESOURCES } from './resourceCatalog';
import { getSeason, getYear } from './seasons';
import { factionValue } from './tradeValues';
import type { FactionLeader, GameState, PendingEnvoy, ResourceId } from './types';

const GIFT_RESOURCES = [...LUXURY_RESOURCES, 'silver'] as const satisfies readonly ResourceId[];

function isGiftResource(resource: ResourceId): boolean {
  return (GIFT_RESOURCES as readonly ResourceId[]).includes(resource);
}

function giftEnvoysFor(state: GameState, factionName: string): PendingEnvoy[] {
  return (state.pendingEnvoys ?? []).filter(envoy => envoy.kind === 'gift' && envoy.factionName === factionName);
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
  if (due.length === 0) return;
  state.pendingEnvoys = (state.pendingEnvoys ?? []).filter(envoy => envoy.dueDay > state.day);
  for (const envoy of due) {
    if (envoy.kind === 'gift') resolveGiftEnvoy(state, envoy);
  }
}

export function giftEnvoyRemainingDays(state: GameState, factionName: string): number | null {
  const envoy = giftEnvoysFor(state, factionName)[0];
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
      (envoy.kind === 'gift' || envoy.kind === 'pact' || envoy.kind === 'aidRequest') && Number.isFinite(envoy.dueDay))
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
}
