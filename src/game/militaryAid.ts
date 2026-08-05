import { resetAgent } from './agents';
import { CONFIG } from './config';
import { DIPLOMATIC_FACTION_NAMES, factionLeaderFor } from './diplomaticFigures';
import { addLog } from './events';
import { activePredatorScoutIds } from './expeditionIntel';
import { changeRelation, getRelation } from './relations';
import { killResident } from './residents';
import { getYear } from './seasons';
import { combatWeaponTotalPower } from './combatCapabilities';
import type {
  ExpeditionExternalAid, FactionLeader, GameState, PendingEnvoy, Resident, WarDispatch,
} from './types';

function aidEnvoy(state: GameState) {
  return (state.pendingEnvoys ?? []).find(envoy => envoy.kind === 'aidRequest') ?? null;
}

function operationalBanditLairs(state: GameState) {
  return state.foreignSites
    .filter(site => site.type === 'banditLair' && site.discovered &&
      site.status !== 'burned' && site.status !== 'abandoned')
    .sort((a, b) => a.id - b.id);
}

export function aidWarriorCount(state: GameState, factionName: string): number {
  const relationBonus = Math.floor(Math.max(0, getRelation(state, factionName) -
    CONFIG.diplomacy.aidRelationRequired) / 10);
  return Math.min(
    CONFIG.diplomacy.aidMaxWarriors,
    CONFIG.diplomacy.aidBaseWarriors + relationBonus,
  );
}

export function aidRequestCost(state: GameState, factionName: string) {
  const warriors = aidWarriorCount(state, factionName);
  return {
    warriors,
    grain: warriors * CONFIG.diplomacy.aidGrainPerWarrior,
    meat: warriors * CONFIG.diplomacy.aidMeatPerWarrior,
  };
}

export function canOpenAidRequest(state: GameState, factionName: string): string | null {
  const leader = factionLeaderFor(state, factionName);
  if (!leader) return '원병을 청할 여진 지도자를 찾을 수 없습니다';
  if (getRelation(state, factionName) < CONFIG.diplomacy.aidRelationRequired) {
    return `관계 ${CONFIG.diplomacy.aidRelationRequired} 이상이어야 원병을 청할 수 있습니다`;
  }
  if (state.pendingChoice || state.battle || state.raiders || state.tacticalBattle) {
    return '다른 중대 사건에 대응 중에는 원병 사절을 보낼 수 없습니다';
  }
  if (state.expedition) return '토벌대가 귀환한 뒤 원병을 청할 수 있습니다';
  if (aidEnvoy(state)) return '이미 원병 사절이 왕복 중입니다';
  if (state.militaryAid) return '이미 합류를 기다리는 원병이 있습니다';
  if (operationalBanditLairs(state).length === 0) return '원병과 함께 토벌할 발견된 산채가 없습니다';
  const cost = aidRequestCost(state, factionName);
  if (state.resources.grain < cost.grain || state.resources.meat < cost.meat) {
    return `군량이 부족합니다 (곡물 ${cost.grain} · 고기 ${cost.meat} 필요)`;
  }
  return null;
}

function aidRequestWords(leader: FactionLeader): string {
  return {
    bold: '산채를 찍어 말하라. 우리 창잡이들이 함께 길을 열겠다.',
    wily: '군량과 목표가 분명하다면, 서로에게 남는 싸움이 되겠지.',
    taciturn: '목표와 군량을 보내라. 전사를 붙이겠다.',
    fierce: '마적의 목을 벨 자리라면 우리 칼도 빠질 까닭이 없다.',
  }[leader.temper];
}

export function openAidRequest(state: GameState, factionName: string): string | null {
  const reason = canOpenAidRequest(state, factionName);
  if (reason) return reason;
  const leader = factionLeaderFor(state, factionName)!;
  const cost = aidRequestCost(state, factionName);
  state.pendingChoice = {
    kind: 'aidRequestEnvoy',
    title: `${leader.name} ${leader.title}에게 원병 요청`,
    body:
      `“${aidRequestWords(leader)}”\n` +
      `${cost.warriors}명의 여진 전사를 산채 토벌대에 합류시키려면 ` +
      `곡물 ${cost.grain}과 고기 ${cost.meat}을 군량으로 보내야 합니다. ` +
      `사절은 ${CONFIG.diplomacy.envoyTravelDays}일 뒤 돌아옵니다.`,
    options: operationalBanditLairs(state).map(site => ({
      id: `target-${site.id}`,
      label: `${site.name} 토벌을 청한다`,
      desc: `목표 산채를 고정하고 군량을 즉시 보냅니다. 모반 의심 +${CONFIG.diplomacy.aidSuspicion}.`,
    })).concat([{
      id: 'cancel',
      label: '그만둔다',
      desc: '사절을 보내지 않습니다.',
    }]),
    data: { factionName },
  };
  return null;
}

export function resolveAidRequestChoice(state: GameState, optionId: string): void {
  const choice = state.pendingChoice;
  if (!choice || choice.kind !== 'aidRequestEnvoy') return;
  if (optionId === 'cancel') {
    state.pendingChoice = null;
    return;
  }
  const factionName = typeof choice.data.factionName === 'string' ? choice.data.factionName : '';
  const siteId = optionId.startsWith('target-') ? Number(optionId.slice(7)) : NaN;
  const site = operationalBanditLairs(state).find(candidate => candidate.id === siteId);
  const reason = canOpenAidRequest({ ...state, pendingChoice: null }, factionName);
  if (!site || reason) {
    state.pendingChoice = null;
    addLog(state, reason ?? '목표 산채를 찾을 수 없어 원병 요청을 거두었습니다.', 'info', true);
    return;
  }
  const cost = aidRequestCost(state, factionName);
  state.resources.grain -= cost.grain;
  state.resources.meat -= cost.meat;
  state.pendingEnvoys.push({
    kind: 'aidRequest',
    factionName,
    payload: { grain: cost.grain, meat: cost.meat },
    dueDay: state.day + CONFIG.diplomacy.envoyTravelDays,
    aidTargetSiteId: site.id,
    aidWarriorCount: cost.warriors,
  });
  state.suspicion = Math.min(100, state.suspicion + CONFIG.diplomacy.aidSuspicion);
  state.pendingChoice = null;
  const leader = factionLeaderFor(state, factionName)!;
  addLog(
    state,
    `${leader.name} ${leader.title}에게 ${site.name} 토벌 원병을 청했습니다. ` +
      `(곡물 -${cost.grain} · 고기 -${cost.meat} · 모반 의심 +${CONFIG.diplomacy.aidSuspicion})`,
    'info',
    true,
  );
}

export function resolveAidEnvoy(state: GameState, envoy: PendingEnvoy): void {
  const siteId = Math.floor(envoy.aidTargetSiteId ?? -1);
  const site = operationalBanditLairs(state).find(candidate => candidate.id === siteId);
  if (!site) {
    addLog(state, `${envoy.factionName}의 원병이 목표 산채가 사라진 것을 확인하고 돌아갔습니다.`, 'info', true);
    return;
  }
  const warriorCount = Math.max(1, Math.min(
    CONFIG.diplomacy.aidMaxWarriors,
    Math.floor(envoy.aidWarriorCount ?? CONFIG.diplomacy.aidBaseWarriors),
  ));
  state.militaryAid = {
    factionName: envoy.factionName,
    targetSiteId: site.id,
    warriorCount,
    arrivedDay: state.day,
  };
  const leader = factionLeaderFor(state, envoy.factionName);
  addLog(
    state,
    `${leader ? `${leader.name} ${leader.title}` : envoy.factionName}의 전사 ${warriorCount}명이 ` +
      `${site.name} 토벌대 합류를 기다립니다.`,
    'good',
    true,
  );
}

export function aidEnvoyRemainingDays(state: GameState, factionName: string): number | null {
  const envoy = (state.pendingEnvoys ?? []).find(candidate =>
    candidate.kind === 'aidRequest' && candidate.factionName === factionName);
  return envoy ? Math.max(0, envoy.dueDay - state.day) : null;
}

export function attachReadyAidToExpedition(
  state: GameState,
  targetSiteId: number | undefined,
): ExpeditionExternalAid | undefined {
  const aid = state.militaryAid;
  if (!aid || targetSiteId == null || aid.targetSiteId !== targetSiteId) return undefined;
  state.militaryAid = null;
  return { factionName: aid.factionName, committed: aid.warriorCount, killed: 0, wounded: 0 };
}

export function externalAidActiveCount(aid: ExpeditionExternalAid | undefined): number {
  return aid ? Math.max(0, aid.committed - aid.killed - aid.wounded) : 0;
}

export function externalAidCombatPower(aid: ExpeditionExternalAid | undefined): number {
  const count = externalAidActiveCount(aid);
  if (count <= 0 || !aid) return 0;
  return count * combatWeaponTotalPower('militia', 'spear', aid.factionName, 'jurchenWarrior');
}

export function militaryAidForLair(
  state: GameState,
  targetSiteId: number,
): ExpeditionExternalAid | undefined {
  if (state.expedition?.kind === 'lairAssault' && state.expedition.targetSiteId === targetSiteId) {
    return state.expedition.externalAid;
  }
  const ready = state.militaryAid;
  return ready?.targetSiteId === targetSiteId
    ? { factionName: ready.factionName, committed: ready.warriorCount, killed: 0, wounded: 0 }
    : undefined;
}

function activeWarDispatchResidentIds(state: Pick<GameState, 'warDispatch'>): Set<number> {
  return new Set(state.warDispatch?.memberIds ?? []);
}

function eligibleWarDispatchResidents(state: GameState): Resident[] {
  const scouts = activePredatorScoutIds(state);
  const away = activeWarDispatchResidentIds(state);
  return state.residents
    .filter(resident =>
      resident.alive && !resident.stage && resident.job === 'militia' &&
      !resident.sick && resident.health >= 20 && state.day >= (resident.quarantinedUntil ?? 0) &&
      !away.has(resident.id) && !scouts.has(resident.id) &&
      !state.expedition?.memberIds.includes(resident.id) &&
      !state.battle?.defenderIds.includes(resident.id))
    .sort((a, b) => a.id - b.id);
}

function stableRoll(state: GameState, salt: number): number {
  let value = (state.seed ^ Math.imul(salt, 0x45d9f3b)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  return value >>> 0;
}

function warRequestWords(leader: FactionLeader, opponent: string): string {
  return {
    bold: `${opponent}의 기세를 꺾을 때다. 너희 창도 우리 대열에 세워라.`,
    wily: `${opponent}와의 셈을 치르려 하오. 이번에 손을 보태면 그 몫을 잊지 않겠소.`,
    taciturn: `${opponent}와 싸운다. 민병을 보낼 뜻이 있는가.`,
    fierce: `${opponent}의 피를 눈밭에 뿌릴 것이다. 함께 설 자를 보내라.`,
  }[leader.temper];
}

export function openWarParticipationRequest(
  state: GameState,
  requesterFactionName: string,
  opposingFactionName: string,
): string | null {
  if (state.pendingChoice || state.warDispatch) return '이미 처리 중인 사건이나 파견이 있습니다';
  const leader = factionLeaderFor(state, requesterFactionName);
  if (!leader || !factionLeaderFor(state, opposingFactionName)) return '분쟁 당사자의 지도자를 찾을 수 없습니다';
  const eligible = eligibleWarDispatchResidents(state);
  const sizes = [2, 4, 6].filter(size => size <= eligible.length);
  state.pendingChoice = {
    kind: 'warParticipationRequest',
    title: `${leader.name} ${leader.title}의 참전 요청`,
    body:
      `${requesterFactionName}에서 ${opposingFactionName}와의 부족 전쟁에 민병을 보내 달라고 청했습니다.\n` +
      `“${warRequestWords(leader, opposingFactionName)}”\n` +
      `파견 민병은 ${CONFIG.diplomacy.warDispatchDays}일 동안 마을 노동과 방어에서 빠집니다.`,
    options: [
      ...sizes.map(size => ({
        id: `dispatch-${size}`,
        label: `민병 ${size}명을 보낸다`,
        desc: '전술 전투 없이 원정 결과가 결정되며 사상자가 날 수 있습니다.',
      })),
      {
        id: 'decline',
        label: '참전하지 않는다',
        desc: `관계 -${CONFIG.diplomacy.warDispatchDeclineRelationLoss}. 다른 불이익은 없습니다.`,
      },
    ],
    data: { requesterFactionName, opposingFactionName },
  };
  return null;
}

export function resolveWarParticipationChoice(state: GameState, optionId: string): void {
  const choice = state.pendingChoice;
  if (!choice || choice.kind !== 'warParticipationRequest') return;
  const requesterFactionName = String(choice.data.requesterFactionName ?? '');
  const opposingFactionName = String(choice.data.opposingFactionName ?? '');
  if (optionId === 'decline') {
    changeRelation(state, requesterFactionName, -CONFIG.diplomacy.warDispatchDeclineRelationLoss);
    state.pendingChoice = null;
    addLog(state, `${requesterFactionName}의 참전 요청을 거절했습니다. 상대는 잠시 실망했지만 원한을 품지는 않았습니다.`, 'info', true);
    return;
  }
  const count = optionId.startsWith('dispatch-') ? Number(optionId.slice(9)) : NaN;
  const members = eligibleWarDispatchResidents(state).slice(0, Number.isFinite(count) ? count : 0);
  if (members.length < 2 || members.length !== count || state.warDispatch) return;
  state.warDispatch = {
    requesterFactionName,
    opposingFactionName,
    memberIds: members.map(member => member.id),
    sentDay: state.day,
    dueDay: state.day + CONFIG.diplomacy.warDispatchDays,
  };
  for (const member of members) {
    resetAgent(state, member);
    member.task = '부족 전쟁 파견 중';
  }
  state.pendingChoice = null;
  addLog(
    state,
    `${requesterFactionName}의 참전 요청을 받아 민병 ${members.length}명을 보냈습니다. ` +
      `${CONFIG.diplomacy.warDispatchDays}일 뒤 돌아올 예정입니다.`,
    'raid',
    true,
  );
}

export function resolveWarParticipationResult(state: GameState): void {
  if (state.pendingChoice?.kind === 'warParticipationResult') state.pendingChoice = null;
}

function resolveWarDispatch(state: GameState, dispatch: WarDispatch): void {
  const living = dispatch.memberIds
    .map(id => state.residents.find(resident => resident.id === id))
    .filter((resident): resident is Resident => !!resident?.alive);
  const roll = stableRoll(state, dispatch.dueDay + dispatch.memberIds.reduce((sum, id) => sum + id, 0));
  const killedCount = living.length >= 4 && roll % 100 < 35 ? 1 : 0;
  const woundedCount = Math.min(living.length - killedCount, 1 + ((roll >>> 8) % 2));
  const start = living.length > 0 ? (roll >>> 16) % living.length : 0;
  const rotated = [...living.slice(start), ...living.slice(0, start)];
  const killed = rotated.slice(0, killedCount);
  const wounded = rotated.slice(killedCount, killedCount + woundedCount);
  for (const resident of killed) {
    const corpseCount = state.corpses?.length ?? 0;
    killResident(state, resident, '부족 전쟁 원정에서 입은 상처', false, true);
    // 먼 전장에서 전사한 시신은 마을 공동묘지의 수습 대기열에 생기지 않는다.
    if ((state.corpses?.length ?? 0) > corpseCount) state.corpses!.splice(corpseCount);
  }
  for (const resident of wounded) {
    resident.health = Math.max(5, resident.health - 30);
    resident.task = '부상 회복 중';
  }
  const lootGrain = Math.max(2, living.length * 2 - killedCount);
  const lootHide = Math.max(1, Math.floor(living.length / 2));
  state.resources.grain += lootGrain;
  state.resources.hide += lootHide;
  changeRelation(state, dispatch.requesterFactionName, CONFIG.diplomacy.warDispatchRelationGain);
  changeRelation(state, dispatch.opposingFactionName, -CONFIG.diplomacy.warDispatchOpposingRelationLoss);
  state.suspicion = Math.min(100, state.suspicion + CONFIG.diplomacy.warDispatchSuspicion);
  for (const resident of living) {
    if (!resident.alive || wounded.includes(resident)) continue;
    resetAgent(state, resident);
    resident.task = '대기';
  }
  state.warDispatch = null;
  const resultText =
    `부족 전쟁에 나간 민병이 돌아왔습니다. 전사 ${killedCount}명 · 부상 ${woundedCount}명 · ` +
      `노획 곡물 ${lootGrain} · 가죽 ${lootHide}. ` +
      `(${dispatch.requesterFactionName} 관계 +${CONFIG.diplomacy.warDispatchRelationGain} · ` +
      `${dispatch.opposingFactionName} 관계 -${CONFIG.diplomacy.warDispatchOpposingRelationLoss} · ` +
      `모반 의심 +${CONFIG.diplomacy.warDispatchSuspicion})`;
  addLog(
    state,
    resultText,
    killedCount > 0 ? 'bad' : 'good',
    true,
  );
  if (!state.pendingChoice) {
    const leader = factionLeaderFor(state, dispatch.requesterFactionName);
    state.pendingChoice = {
      kind: 'warParticipationResult',
      title: `${leader ? `${leader.name} ${leader.title}` : dispatch.requesterFactionName}의 전쟁 장계`,
      body: resultText,
      options: [{ id: 'close', label: '장계를 접는다', desc: '파견 결산을 확인합니다.' }],
      data: {
        requesterFactionName: dispatch.requesterFactionName,
        opposingFactionName: dispatch.opposingFactionName,
        killed: killedCount,
        wounded: woundedCount,
      },
    };
  }
}

// scenario.ts의 scenarioActive와 같은 판정 — 순환 import를 피해 여기서 직접 본다
// (scenario → raids → diplomacy → militaryAid 경로가 이미 있어 되짚어 부를 수 없다).
function scenarioRunning(state: GameState): boolean {
  return state.scenario != null && !state.scenario.completed;
}

export function dailyMilitaryDiplomacyTick(state: GameState): void {
  if (state.warDispatch && state.warDispatch.dueDay <= state.day) {
    resolveWarDispatch(state, state.warDispatch);
  }
  if (state.pendingChoice || state.warDispatch || getYear(state.day) <= state.lastWarParticipationOfferYear) return;
  const year = getYear(state.day);
  if (year < 2) return;
  // 참전 요청은 랜덤 사건이 아니라 연 1회의 결정론 사건이라 게이트 밖에 있다.
  // 그러나 둘째 해부터 오므로 R5로 길잡이가 둘째 해까지 늘어나면서 스텝 안내를 덮게 되었고,
  // 수락하면 수비병이 마을을 비워 16단계의 통제 습격까지 어그러진다.
  // 여기서는 미루기만 한다 — lastWarParticipationOfferYear를 적지 않으므로
  // 길잡이가 끝나는 즉시(같은 해라도) 전령이 다시 온다.
  if (scenarioRunning(state)) return;
  const offerDay = 10 + stableRoll(state, year) % 20;
  const dayOfYear = (state.day - 1) % CONFIG.time.yearDays + 1;
  if (dayOfYear < offerDay) return;
  const requesterIndex = stableRoll(state, year * 17) % DIPLOMATIC_FACTION_NAMES.length;
  const opponentOffset = 1 + stableRoll(state, year * 31) % (DIPLOMATIC_FACTION_NAMES.length - 1);
  const requester = DIPLOMATIC_FACTION_NAMES[requesterIndex];
  const opponent = DIPLOMATIC_FACTION_NAMES[(requesterIndex + opponentOffset) % DIPLOMATIC_FACTION_NAMES.length];
  state.lastWarParticipationOfferYear = year;
  const reason = openWarParticipationRequest(state, requester, opponent);
  if (reason) addLog(state, `${requester}의 참전 요청 전령이 사정이 여의치 않아 돌아갔습니다.`, 'info');
}

export function normalizeMilitaryAidState(state: GameState): void {
  const aid = state.militaryAid;
  const knownFactions = new Set<string>(DIPLOMATIC_FACTION_NAMES);
  state.militaryAid = aid && knownFactions.has(aid.factionName) &&
    Number.isFinite(aid.targetSiteId) && Number.isFinite(aid.warriorCount)
    && operationalBanditLairs(state).some(site => site.id === Math.floor(aid.targetSiteId))
    ? {
      factionName: aid.factionName,
      targetSiteId: Math.max(0, Math.floor(aid.targetSiteId)),
      warriorCount: Math.max(1, Math.min(CONFIG.diplomacy.aidMaxWarriors, Math.floor(aid.warriorCount))),
      arrivedDay: Math.max(1, Math.floor(aid.arrivedDay || state.day)),
    }
    : null;
  const dispatch = state.warDispatch;
  const validDispatchMemberIds = dispatch && Array.isArray(dispatch.memberIds)
    ? [...new Set(dispatch.memberIds.filter(Number.isFinite).map(id => Math.floor(id)))]
      .filter(id => state.residents.some(resident => resident.id === id && resident.alive &&
        !resident.stage && resident.job === 'militia'))
    : [];
  state.warDispatch = dispatch &&
    knownFactions.has(dispatch.requesterFactionName) &&
    knownFactions.has(dispatch.opposingFactionName) &&
    dispatch.requesterFactionName !== dispatch.opposingFactionName &&
    validDispatchMemberIds.length >= 2 &&
    Number.isFinite(dispatch.dueDay)
    ? {
      requesterFactionName: dispatch.requesterFactionName,
      opposingFactionName: dispatch.opposingFactionName,
      memberIds: validDispatchMemberIds,
      sentDay: Math.max(1, Math.floor(dispatch.sentDay || state.day)),
      dueDay: Math.max(state.day, Math.floor(dispatch.dueDay)),
    }
    : null;
  state.lastWarParticipationOfferYear = Number.isFinite(state.lastWarParticipationOfferYear)
    ? Math.max(0, Math.floor(state.lastWarParticipationOfferYear))
    : 0;
}
