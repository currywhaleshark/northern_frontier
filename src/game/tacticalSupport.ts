import { CONFIG } from './config';
import type {
  TacticalAnimationEvent,
  TacticalBattle,
  TacticalRaiderGroup,
  TacticalRaiderSupportKind,
  TacticalRaiderSupportState,
} from './types';

export interface TacticalSupportUnitView {
  kind: TacticalRaiderSupportKind;
  status: 'ready' | 'firing' | 'reloading' | 'spent' | 'treating';
  statusLabel: string;
  shotsRemaining: number;
  readyOnRound: number;
  facingZoneId: string;
}

export function tacticalSupportKindForUnitType(
  unitType: TacticalRaiderGroup['unitType'],
): TacticalRaiderSupportKind | undefined {
  if (unitType === 'court-artillery') return 'directArtillery';
  if (unitType === 'court-hwacha') return 'hwacha';
  if (unitType === 'court-medic') return 'medic';
  return undefined;
}

export function createTacticalRaiderSupportState(
  unitType: TacticalRaiderGroup['unitType'],
  zoneId: string,
): TacticalRaiderSupportState | undefined {
  const kind = tacticalSupportKindForUnitType(unitType);
  if (!kind) return undefined;
  const shotsRemaining = kind === 'directArtillery'
    ? CONFIG.tacticalBattle.supportUnits.directArtillery.maxShots
    : kind === 'hwacha' ? CONFIG.tacticalBattle.supportUnits.hwacha.maxShots : 0;
  return { kind, shotsRemaining, readyOnRound: 1, facingZoneId: zoneId, totalRestored: 0 };
}

export function tacticalSupportUnitView(
  battle: Pick<TacticalBattle, 'round'>,
  group: TacticalRaiderGroup,
): TacticalSupportUnitView | null {
  const state = group.supportState;
  if (!state) return null;
  let status: TacticalSupportUnitView['status'];
  if (state.kind === 'medic') status = 'treating';
  else if (state.shotsRemaining <= 0) status = 'spent';
  else if (state.firing) status = 'firing';
  else if (battle.round < state.readyOnRound || state.facingZoneId !== group.zoneId) status = 'reloading';
  else status = 'ready';
  const statusLabel = status === 'ready' ? '발사 준비'
    : status === 'firing' ? '발사 중'
      : status === 'reloading' ? `재장전 · ${Math.max(0, state.readyOnRound - battle.round)}교전`
        : status === 'spent' ? '탄약 소진' : '부상병 치료 중';
  return {
    kind: state.kind,
    status,
    statusLabel,
    shotsRemaining: state.shotsRemaining,
    readyOnRound: state.readyOnRound,
    facingZoneId: state.facingZoneId,
  };
}

export function prepareTacticalRaiderSupportRound(
  battle: TacticalBattle,
  events: TacticalAnimationEvent[],
  lines: string[],
): void {
  for (const group of battle.raiderGroups) {
    const state = group.supportState;
    if (!state) continue;
    state.firing = false;
    if (state.kind === 'medic' || group.routeTransit || group.intent === 'withdraw' ||
        group.power <= 0 || group.count - group.killed <= 0) continue;
    if (state.facingZoneId !== group.zoneId) {
      state.facingZoneId = group.zoneId;
      state.readyOnRound = Math.max(state.readyOnRound, battle.round + 1);
      events.push({
        zoneId: group.zoneId, kind: 'supportReload', side: 'raider', groupId: group.id,
        actorGroupIds: [group.id], durationMs: 540,
        text: `${group.label}가 새 전선으로 포구 방향을 맞춥니다.`, float: '방향 조정',
      });
      lines.push(`${group.label}: 이동 뒤 포구 방향을 다시 맞추느라 이번 교전에는 발사하지 못합니다.`);
      continue;
    }
    if (state.shotsRemaining <= 0) continue;
    if (battle.round < state.readyOnRound) {
      events.push({
        zoneId: group.zoneId, kind: 'supportReload', side: 'raider', groupId: group.id,
        actorGroupIds: [group.id], durationMs: 500,
        text: `${group.label}가 다음 사격을 준비합니다.`, float: '재장전',
      });
      continue;
    }
    const hasTarget = battle.defenderGroups.some(defender =>
      !defender.routeTransit && defender.zoneId === group.zoneId &&
      defender.count - defender.wounded - defender.killed > 0);
    if (!hasTarget) continue;
    state.firing = true;
    state.lastFiredRound = battle.round;
    state.shotsRemaining -= 1;
    const reloadRounds = state.kind === 'directArtillery'
      ? CONFIG.tacticalBattle.supportUnits.directArtillery.reloadRounds
      : CONFIG.tacticalBattle.supportUnits.hwacha.reloadRounds;
    state.readyOnRound = battle.round + reloadRounds + 1;
  }
}

export function applyTacticalRaiderSupportTreatment(
  battle: TacticalBattle,
  events: TacticalAnimationEvent[],
  lines: string[],
): number {
  const medics = battle.raiderGroups.filter(group =>
    group.supportState?.kind === 'medic' && !group.routeTransit && group.intent !== 'withdraw' &&
    group.power > 0 && group.count - group.killed > 0);
  const battleCap = battle.initialEnemyPower * CONFIG.tacticalBattle.supportUnits.medic.maximumBattleRecoveryShare;
  let alreadyRestored = medics.reduce((sum, medic) => sum + (medic.supportState?.totalRestored ?? 0), 0);
  let restored = 0;
  for (const medic of medics) {
    const state = medic.supportState!;
    let capacity = Math.min(
      (medic.count - medic.killed) * CONFIG.tacticalBattle.supportUnits.medic.recoveryPerActiveMedic,
      Math.max(0, battleCap - alreadyRestored),
    );
    const candidates = battle.raiderGroups
      .filter(group => group.id !== medic.id && group.zoneId === medic.zoneId && !group.routeTransit &&
        group.power > 0 && (group.maximumPower ?? group.power) > group.power)
      .sort((a, b) => ((b.maximumPower ?? b.power) - b.power) - ((a.maximumPower ?? a.power) - a.power));
    let medicRestored = 0;
    for (const candidate of candidates) {
      if (capacity <= 0) break;
      const survivingCeiling = (candidate.maximumPower ?? candidate.power) *
        (candidate.count > 0 ? Math.max(0, candidate.count - candidate.killed) / candidate.count : 0);
      const amount = Math.min(capacity, Math.max(0, survivingCeiling - candidate.power));
      if (amount <= 0) continue;
      candidate.power += amount;
      capacity -= amount;
      medicRestored += amount;
    }
    if (medicRestored <= 0) continue;
    state.totalRestored = (state.totalRestored ?? 0) + medicRestored;
    alreadyRestored += medicRestored;
    restored += medicRestored;
    events.push({
      zoneId: medic.zoneId, kind: 'enemyTreatment', side: 'raider', groupId: medic.id,
      actorGroupIds: [medic.id], durationMs: 560,
      text: `${medic.label}가 전열의 부상병을 수습합니다.`, float: `전력 +${Math.round(medicRestored)}`,
    });
    lines.push(`${medic.label}: 생존 부상병을 치료해 적 전력 ${Math.round(medicRestored)}을 회복했습니다.`);
  }
  return restored;
}
