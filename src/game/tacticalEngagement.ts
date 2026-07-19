import { tacticalGroupCapabilities, tacticalGroupPower } from './combatCapabilities';
import { CONFIG } from './config';
import { withJosa } from './josa';
import { tacticalDefenderShotCounts, tacticalRaiderShotCounts } from './tacticalCore';
import { tacticalUnitProfileOrUndefined } from './tacticalUnits';
import {
  canTargetLine,
  tacticalContactLine,
  tacticalTargetingConcentration,
  tacticalTargetingRole,
  type TacticalTargetingContext,
} from './tacticalTargeting';
import type {
  ResourceId,
  EnemyDoctrineId,
  TacticalAnimationEvent,
  TacticalBattleZone,
  TacticalCommandId,
  TacticalDefenderGroup,
  TacticalFormationLine,
  TacticalRaiderGroup,
  WeatherId,
} from './types';

const FRONTAL_LINE_ORDER: readonly TacticalFormationLine[] = ['front', 'middle', 'rear'];
const REAR_ASSAULT_LINE_ORDER: readonly TacticalFormationLine[] = ['rear', 'middle', 'front'];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function activeDefenderCount(group: TacticalDefenderGroup): number {
  return Math.max(0, group.count - group.wounded - group.killed);
}

function activeRaiderCount(group: TacticalRaiderGroup): number {
  return Math.max(0, group.count - group.killed);
}

function defenderWeaponShare(
  defenders: ReadonlyArray<TacticalDefenderGroup>,
  weapon: TacticalDefenderGroup['weapon'],
): number {
  const total = defenders.reduce((sum, defender) => sum + activeDefenderCount(defender), 0);
  if (total <= 0) return 0;
  return defenders.reduce((sum, defender) =>
    sum + (defender.weapon === weapon ? activeDefenderCount(defender) : 0), 0) / total;
}

export function tacticalAttackerMatchupMultiplier(
  attacker: TacticalRaiderGroup,
  defenders: ReadonlyArray<TacticalDefenderGroup>,
  zone: TacticalBattleZone,
  direction: 'frontal' | 'rear',
): number {
  const profile = tacticalUnitProfileOrUndefined(attacker.unitType);
  if (!profile) return 1;
  const ranged = tacticalTargetingRole(attacker) !== 'melee';
  let multiplier = ranged ? profile.rangedMultiplier : profile.meleeMultiplier;
  const firstContactShock = profile.tags.includes('shock') && attacker.engagementsInZone <= 0 &&
    direction === 'frontal';
  if (firstContactShock) multiplier *= profile.chargeMultiplier * CONFIG.tacticalBattle.unitMatchups.firstContactShock;
  if (profile.tags.includes('mounted') && profile.tags.includes('shock')) {
    if (zone.kind === 'wall') multiplier *= CONFIG.tacticalBattle.unitMatchups.mountedShockVsWall;
    if (defenderWeaponShare(defenders, 'spear') > 0) {
      multiplier *= CONFIG.tacticalBattle.unitMatchups.mountedShockVsSpear;
    }
  }
  if (attacker.aiState === 'forming') multiplier *= CONFIG.tacticalBattle.unitMatchups.formingPower;
  else if (attacker.aiState === 'probing' && ranged) {
    multiplier *= CONFIG.tacticalBattle.unitMatchups.probingRangedPower;
  } else if (attacker.aiState === 'withdrawing') {
    multiplier *= CONFIG.tacticalBattle.unitMatchups.withdrawingPower;
  } else if (attacker.aiState === 'committingReserve') {
    multiplier *= CONFIG.tacticalBattle.unitMatchups.reserveCommitPower;
  }
  return multiplier;
}

export function tacticalRaiderWeatherMultiplier(
  attacker: TacticalRaiderGroup,
  weather: WeatherId,
): number {
  const profile = tacticalUnitProfileOrUndefined(attacker.unitType);
  if (!profile || (!profile.tags.includes('ranged') && !profile.tags.includes('firearm') &&
      !profile.tags.includes('artillery'))) return 1;
  if (profile.tags.includes('firearm')) {
    if (weather === 'rain') return CONFIG.tacticalBattle.unitMatchups.firearmWeather.rain;
    if (weather === 'heavySnow') return CONFIG.tacticalBattle.unitMatchups.firearmWeather.heavySnow;
    if (weather === 'blizzard') return CONFIG.tacticalBattle.unitMatchups.firearmWeather.blizzard;
    return 1;
  }
  if (weather === 'heavySnow') return CONFIG.tacticalBattle.unitMatchups.rangedWeather.heavySnow;
  if (weather === 'blizzard') return CONFIG.tacticalBattle.unitMatchups.rangedWeather.blizzard;
  return 1;
}

export function tacticalDefenderMatchupMultiplier(
  defender: TacticalDefenderGroup,
  attackers: ReadonlyArray<TacticalRaiderGroup>,
  direction: 'frontal' | 'rear',
): number {
  const profiles = attackers
    .filter(attacker => !attacker.confused && activeRaiderCount(attacker) > 0)
    .map(attacker => tacticalUnitProfileOrUndefined(attacker.unitType))
    .filter((profile): profile is NonNullable<typeof profile> => profile != null);
  if (profiles.length === 0) return 1;
  let multiplier = 1;
  if (direction === 'frontal' && defender.weapon === 'spear' &&
      profiles.some(profile => profile.tags.includes('mounted'))) {
    multiplier *= CONFIG.tacticalBattle.unitMatchups.spearVsMountedDefense;
  }
  if (profiles.some(profile => profile.tags.includes('shielded'))) {
    if (defender.weapon === 'hornBow') multiplier *= CONFIG.tacticalBattle.unitMatchups.bowVsShieldedDefense;
    if (defender.weapon === 'musket') multiplier *= CONFIG.tacticalBattle.unitMatchups.firearmVsShieldedDefense;
  }
  return multiplier;
}

export function tacticalRaiderLossMatchupMultiplier(
  attacker: TacticalRaiderGroup,
  defenders: ReadonlyArray<TacticalDefenderGroup>,
  direction: 'frontal' | 'rear',
): number {
  const profile = tacticalUnitProfileOrUndefined(attacker.unitType);
  if (!profile) return 1;
  let multiplier = 1 / Math.max(0.1, profile.protectionMultiplier);
  const bowShare = defenderWeaponShare(defenders, 'hornBow');
  const musketShare = defenderWeaponShare(defenders, 'musket');
  const spearShare = defenderWeaponShare(defenders, 'spear');
  if (profile.tags.includes('shielded')) {
    multiplier *= 1 + bowShare * (CONFIG.tacticalBattle.unitMatchups.bowVsShieldedDefense - 1) +
      musketShare * (CONFIG.tacticalBattle.unitMatchups.firearmVsShieldedDefense - 1);
  }
  if (profile.tags.includes('mounted')) {
    multiplier *= 1 + spearShare * (CONFIG.tacticalBattle.unitMatchups.spearVsMountedDefense - 1);
  }
  if (profile.archetype === 'wallBreaker') {
    multiplier *= CONFIG.tacticalBattle.unitMatchups.wallBreakerLossScale;
  }
  if (direction === 'rear' && (profile.tags.includes('ranged') || profile.tags.includes('artillery'))) {
    multiplier *= CONFIG.tacticalBattle.unitMatchups.rearRangedLossScale;
  }
  if (attacker.aiState === 'withdrawing') {
    multiplier *= CONFIG.tacticalBattle.unitMatchups.withdrawingLossScale;
  }
  return Math.max(0.35, multiplier);
}

export function tacticalUnitWallPressure(
  attacker: TacticalRaiderGroup,
  doctrine?: EnemyDoctrineId,
  wallBreakerEffectScale?: number,
): number {
  if (attacker.confused || activeRaiderCount(attacker) <= 0) return 0;
  const profile = tacticalUnitProfileOrUndefined(attacker.unitType);
  if (!profile) return Math.max(0, attacker.wallPressureBonus ?? 0);
  const activeShare = attacker.count > 0 ? activeRaiderCount(attacker) / attacker.count : 0;
  let pressure = profile.wallPressure * activeShare * clamp(attacker.morale / 100, 0, 1);
  if (profile.archetype === 'wallBreaker' && wallBreakerEffectScale != null) {
    pressure *= clamp(wallBreakerEffectScale, 0, 1);
  }
  if (doctrine === 'breachAndStorm' && profile.tags.includes('siege')) pressure *= 1.2;
  return pressure;
}

function defenderVolleyCaption(shots: { arrows?: number; muskets?: number }): string {
  const arrows = (shots.arrows ?? 0) > 0;
  const muskets = (shots.muskets ?? 0) > 0;
  if (arrows && muskets) return '활시위와 총성이 한꺼번에 터집니다.';
  if (muskets) return '조총대의 총성이 한꺼번에 터집니다.';
  return '궁수대의 활시위가 한꺼번에 울립니다.';
}

function randomRoundedBudget(expected: number, capacity: number, rng: () => number): number {
  const bounded = clamp(expected, 0, capacity);
  const base = Math.floor(bounded);
  return Math.min(capacity, base + (rng() < bounded - base ? 1 : 0));
}

function normalizedWeights(weights: ReadonlyArray<number>): number[] {
  const positive = weights.map(weight => Math.max(0, weight));
  const total = positive.reduce((sum, weight) => sum + weight, 0);
  if (total > 0) return positive.map(weight => weight / total);
  return positive.map(() => 0);
}

export function targetedAllocationWeights(
  baseWeights: ReadonlyArray<number>,
  targetDemands: ReadonlyArray<number>,
  capacities: ReadonlyArray<number>,
  maxFocusedShare = CONFIG.tacticalBattle.targeting.maxFocusedLossShare,
): number[] {
  const base = normalizedWeights(baseWeights);
  const demands = targetDemands.map((demand, index) => capacities[index] > 0 ? Math.max(0, demand) : 0);
  const demandTotal = demands.reduce((sum, demand) => sum + demand, 0);
  if (demandTotal <= 0) return base;
  const manualShare = clamp(demandTotal, 0, 1);
  const demandDistribution = demands.map(demand => demand / demandTotal);
  let weights = normalizedWeights(base.map((weight, index) =>
    weight * (1 - manualShare) + demandDistribution[index] * manualShare));
  const live = capacities.filter(capacity => capacity > 0).length;
  if (live <= 1 || maxFocusedShare >= 1) return weights;
  for (let pass = 0; pass < weights.length; pass += 1) {
    const over = weights.map((weight, index) => capacities[index] > 0 ? Math.max(0, weight - maxFocusedShare) : 0);
    const excess = over.reduce((sum, value) => sum + value, 0);
    if (excess <= 1e-12) break;
    weights = weights.map((weight, index) => weight - over[index]);
    const receivers = weights.map((_weight, index) => index)
      .filter(index => capacities[index] > 0 && weights[index] < maxFocusedShare - 1e-12);
    if (receivers.length === 0) break;
    const roomWeight = receivers.reduce((sum, index) => sum + Math.max(base[index], 1e-9), 0);
    for (const index of receivers) {
      weights[index] += excess * Math.max(base[index], 1e-9) / roomWeight;
    }
  }
  return normalizedWeights(weights);
}

function integerAllocation(
  total: number,
  weights: ReadonlyArray<number>,
  capacities: ReadonlyArray<number>,
  enforceFocusedCap = false,
): number[] {
  const allocation = weights.map(() => 0);
  let remaining = Math.min(
    Math.max(0, Math.floor(total)),
    capacities.reduce((sum, capacity) => sum + Math.max(0, Math.floor(capacity)), 0),
  );
  const effectiveCapacities = capacities.map(capacity => Math.max(0, Math.floor(capacity)));
  if (enforceFocusedCap && effectiveCapacities.filter(capacity => capacity > 0).length > 1) {
    const focusedCap = Math.ceil(remaining * CONFIG.tacticalBattle.targeting.maxFocusedLossShare);
    for (let index = 0; index < effectiveCapacities.length; index += 1) {
      const otherCapacity = effectiveCapacities.reduce((sum, capacity, other) =>
        sum + (other === index ? 0 : capacity), 0);
      if (otherCapacity >= remaining - focusedCap) {
        effectiveCapacities[index] = Math.min(effectiveCapacities[index], focusedCap);
      }
    }
  }

  while (remaining > 0) {
    const eligible = weights.map((_, index) => index)
      .filter(index => allocation[index] < effectiveCapacities[index]);
    if (eligible.length === 0) break;
    const eligibleWeight = eligible.reduce((sum, index) => sum + Math.max(0, weights[index]), 0);
    const quotas = eligible.map(index => ({
      index,
      quota: remaining * (eligibleWeight > 0 ? Math.max(0, weights[index]) / eligibleWeight : 1 / eligible.length),
    }));
    let distributed = 0;
    for (const { index, quota } of quotas) {
      const amount = Math.min(effectiveCapacities[index] - allocation[index], Math.floor(quota));
      allocation[index] += amount;
      distributed += amount;
    }
    remaining -= distributed;
    if (remaining <= 0) break;
    const ranked = quotas
      .filter(({ index }) => allocation[index] < effectiveCapacities[index])
      .sort((a, b) => (b.quota - Math.floor(b.quota)) - (a.quota - Math.floor(a.quota)) || a.index - b.index);
    if (ranked.length === 0) continue;
    for (const { index } of ranked) {
      if (remaining <= 0) break;
      allocation[index] += 1;
      remaining -= 1;
    }
  }
  return allocation;
}

function continuousAllocation(
  total: number,
  weights: ReadonlyArray<number>,
  capacities: ReadonlyArray<number>,
  enforceFocusedCap = false,
): number[] {
  const allocation = weights.map(() => 0);
  let remaining = Math.min(
    Math.max(0, total),
    capacities.reduce((sum, capacity) => sum + Math.max(0, capacity), 0),
  );
  const effectiveCapacities = capacities.map(capacity => Math.max(0, capacity));
  if (enforceFocusedCap && effectiveCapacities.filter(capacity => capacity > 0).length > 1) {
    const focusedCap = remaining * CONFIG.tacticalBattle.targeting.maxFocusedLossShare;
    for (let index = 0; index < effectiveCapacities.length; index += 1) {
      const otherCapacity = effectiveCapacities.reduce((sum, capacity, other) =>
        sum + (other === index ? 0 : capacity), 0);
      if (otherCapacity >= remaining - focusedCap) {
        effectiveCapacities[index] = Math.min(effectiveCapacities[index], focusedCap);
      }
    }
  }
  let eligible = weights.map((_, index) => index)
    .filter(index => effectiveCapacities[index] > 0);
  while (remaining > 1e-12 && eligible.length > 0) {
    const eligibleWeight = eligible.reduce((sum, index) => sum + Math.max(0, weights[index]), 0);
    let distributed = 0;
    for (const index of eligible) {
      const share = eligibleWeight > 0 ? Math.max(0, weights[index]) / eligibleWeight : 1 / eligible.length;
      const amount = Math.min(effectiveCapacities[index] - allocation[index], remaining * share);
      allocation[index] += amount;
      distributed += amount;
    }
    if (distributed <= 1e-12) break;
    remaining -= distributed;
    eligible = eligible.filter(index => effectiveCapacities[index] - allocation[index] > 1e-12);
  }
  return allocation;
}

function defenderContactLine(
  defenders: ReadonlyArray<TacticalDefenderGroup>,
  direction: 'frontal' | 'rear',
): TacticalFormationLine | null {
  const order = direction === 'rear' ? REAR_ASSAULT_LINE_ORDER : FRONTAL_LINE_ORDER;
  return order.find(line => defenders.some(group => group.line === line && activeDefenderCount(group) > 0)) ?? null;
}

function targetingContext(
  defenders: ReadonlyArray<TacticalDefenderGroup>,
  attackers: ReadonlyArray<TacticalRaiderGroup>,
  direction: 'frontal' | 'rear',
  prepareVolleyApplied: boolean,
): TacticalTargetingContext {
  const friendlyContactLine = defenderContactLine(defenders, direction);
  return {
    direction,
    contactLine: tacticalContactLine(attackers, direction),
    meleeContact: friendlyContactLine != null && defenders.some(group =>
      group.line === friendlyContactLine && activeDefenderCount(group) > 0 &&
      tacticalGroupCapabilities(group).has('melee')),
    prepareVolleyApplied,
  };
}

export function chooseTacticalEnemyFocusTarget(
  defenders: ReadonlyArray<TacticalDefenderGroup>,
  attackers: ReadonlyArray<TacticalRaiderGroup>,
  direction: 'frontal' | 'rear',
  zoneId: string,
): string | undefined {
  const candidates = defenders.filter(group =>
    group.zoneId === zoneId && activeDefenderCount(group) > 0);
  const activeAttackers = attackers.filter(group =>
    group.zoneId === zoneId && group.intent !== 'withdraw' && group.power > 0 && activeRaiderCount(group) > 0);
  if (candidates.length === 0 || activeAttackers.length === 0) return undefined;
  const dominant = activeAttackers.reduce((best, group) =>
    group.power * (group.combatMultiplier ?? 1) > best.power * (best.combatMultiplier ?? 1) ? group : best);
  const find = (predicate: (group: TacticalDefenderGroup) => boolean): TacticalDefenderGroup | undefined =>
    candidates.find(predicate);
  const ranged = (group: TacticalDefenderGroup): boolean => tacticalGroupCapabilities(group).has('volley');
  const melee = (group: TacticalDefenderGroup): boolean => tacticalGroupCapabilities(group).has('melee');

  if (direction === 'rear' || dominant.rearAssault) {
    return (find(group => group.line === 'rear' && ranged(group))
      ?? find(group => group.line === 'rear' && group.commandable === false)
      ?? find(group => group.line === 'rear')
      ?? find(group => group.line === 'middle' && ranged(group))
      ?? candidates[0])?.id;
  }
  if (dominant.intent === 'loot' || dominant.kind === 'looters') {
    return (find(group => group.command === 'guardStorehouse') ?? candidates[0])?.id;
  }
  if (tacticalTargetingRole(dominant) !== 'melee') {
    return (find(group => group.weapon === 'musket')
      ?? find(group => ranged(group))
      ?? candidates[0])?.id;
  }
  return (find(group => group.line === 'front' && melee(group))
    ?? find(group => group.line === 'front')
    ?? candidates[0])?.id;
}

function animationEvent(
  zoneId: string,
  kind: TacticalAnimationEvent['kind'],
  text: string,
  durationMs = 650,
  extra?: Pick<TacticalAnimationEvent, 'side' | 'direction' | 'groupId' | 'actorGroupIds' | 'casualties' | 'wounded' | 'killed' | 'float' | 'shots' | 'meleeParticipants'>,
): TacticalAnimationEvent {
  return { zoneId, kind, text, durationMs, ...extra };
}

export function stabilizeTacticalCasualtyCaptions(
  events: ReadonlyArray<TacticalAnimationEvent>,
  groupLabels: Readonly<Record<string, string>>,
): TacticalAnimationEvent[] {
  const stabilized = events.map(event => ({ ...event }));
  let start = 0;
  while (start < stabilized.length) {
    const first = stabilized[start];
    if (first.kind !== 'casualty' || !first.side) {
      start += 1;
      continue;
    }
    let end = start + 1;
    while (end < stabilized.length && stabilized[end].kind === 'casualty' && stabilized[end].side === first.side) {
      end += 1;
    }
    const block = stabilized.slice(start, end);
    const labels = [...new Set(block.map(event => event.groupId ? groupLabels[event.groupId] ?? event.groupId : '피해 부대'))];
    const killed = block.reduce((sum, event) => sum + (event.killed ?? 0), 0);
    const wounded = block.reduce((sum, event) => sum + (event.wounded ?? 0), 0);
    const casualties = block.reduce((sum, event) => sum + (event.casualties ?? event.killed ?? 0), 0);
    const caption = first.side === 'raider'
      ? `${labels.join('·')}에서 ${casualties}명이 쓰러졌습니다.`
      : `${labels.join('·')} 피해: ${[
        killed > 0 ? `전사 ${killed}명` : '',
        wounded > 0 ? `부상 ${wounded}명` : '',
      ].filter(Boolean).join(', ')}.`;
    for (let index = start; index < end; index += 1) stabilized[index].text = caption;
    start = end;
  }
  return stabilized;
}

export function commandPowerMultiplier(
  input: EngagementExchangeInput,
  defender: TacticalDefenderGroup,
): number {
  const { zone } = input;
  const command = defender.command ?? 'hold';
  if (command === 'hold') return 0.82;
  const mounted = tacticalGroupCapabilities(defender).has('mounted');
  if (command === 'charge') {
    return 1.72 + (mounted && zone.kind !== 'wall' ? CONFIG.mounted.chargePowerBonus : 0);
  }
  if (command === 'redeploy') return mounted ? CONFIG.mounted.maneuverPowerMultiplier : 0.35;
  if (command === 'fallback') return mounted ? CONFIG.mounted.maneuverPowerMultiplier : 0.22;
  if (command === 'advance') return mounted ? CONFIG.mounted.maneuverPowerMultiplier : 0.45;
  if (command === 'guardStorehouse') return zone.id === 'storehouse' ? 1.42 : 0.78;
  if (command === 'protectCivilians') return zone.id === 'center' || zone.id === 'storehouse' ? 1.05 : 0.72;
  if (command === 'ambush') {
    const surpriseAttack = tacticalGroupCapabilities(defender).has('ambush') && defender.ambushed;
    return surpriseAttack ? 1.48 + zone.ambushBonus / 100 : 0.18;
  }
  if (command === 'volley') {
    const ranged = tacticalGroupCapabilities(defender).has('volley');
    if (!ranged) return 0.68;
    let mult = 1.38 + (input.prepareVolleyApplied ? 0.22 : 0);
    if (input.weather === 'blizzard') mult *= 0.62;
    else if (input.weather === 'heavySnow') mult *= 0.82;
    mult *= input.rangedEfficiency ?? 1;
    return mult;
  }
  return 1;
}

function casualtyMultiplier(
  input: EngagementExchangeInput,
  defender: TacticalDefenderGroup,
): number {
  let mult = defender.command === 'hold' ? 0.55
    : defender.command === 'charge' ? 1.38
    : defender.command === 'fallback' ? 0.38
      : defender.command === 'advance' ? 0.78 : 1;
  if (defender.command === 'guardStorehouse') mult *= 1.18;
  if (defender.command === 'protectCivilians' && defender.kind === 'civilian') mult *= 0.42;
  if (defender.kind === 'civilian' && input.evacuateCiviliansApplied) mult *= 0.42;
  if (defender.command === 'ambush' && tacticalGroupCapabilities(defender).has('ambush')) mult *= 1.08;
  return mult;
}

function activeContactLine(
  defenders: TacticalDefenderGroup[],
  lineOrder: readonly TacticalFormationLine[],
): TacticalFormationLine | null {
  return lineOrder.find(line => defenders.some(group =>
    group.line === line && activeDefenderCount(group) > 0)) ?? null;
}

function activeMeleeGuard(
  defenders: TacticalDefenderGroup[],
  line: TacticalFormationLine,
): boolean {
  return defenders.some(group =>
    group.line === line && tacticalGroupCapabilities(group).has('melee') &&
    group.command !== 'fallback' && group.command !== 'advance' &&
    activeDefenderCount(group) > 0);
}

function rearAssaultGuardStrength(defenders: TacticalDefenderGroup[]): number {
  const mobileRearGuard = (line: TacticalFormationLine) => defenders.some(group => {
    const capabilities = tacticalGroupCapabilities(group);
    return group.line === line &&
      (capabilities.has('melee') || (capabilities.has('mounted') &&
        (line === 'rear' || group.command === 'reinforceRear'))) &&
      group.command !== 'fallback' && group.command !== 'advance' &&
      activeDefenderCount(group) > 0;
  });
  if (mobileRearGuard('rear')) return 1;
  if (mobileRearGuard('middle')) {
    return CONFIG.tacticalBattle.formationExposure.rearAssault.middleGuardStrength;
  }
  return 0;
}

export function formationExposureMultiplier(
  defender: TacticalDefenderGroup,
  defenders: TacticalDefenderGroup[],
): number {
  const exposure = CONFIG.tacticalBattle.formationExposure;
  if (tacticalGroupCapabilities(defender).has('ambush') && defender.ambushed) return exposure.ambushed;
  const contactLine = activeContactLine(defenders, FRONTAL_LINE_ORDER);
  const contactIndex = contactLine == null ? -1 : FRONTAL_LINE_ORDER.indexOf(contactLine);
  const defenderIndex = FRONTAL_LINE_ORDER.indexOf(defender.line);
  const screenedByEarlierLine = contactIndex >= 0 && defenderIndex > contactIndex;
  const chargingMelee = defenders.some(group =>
    group.line === contactLine && tacticalGroupCapabilities(group).has('melee') &&
    group.command === 'charge' && activeDefenderCount(group) > 0);
  const screeningMelee = defenders.some(group =>
    group.line === contactLine && tacticalGroupCapabilities(group).has('melee') &&
    group.command !== 'charge' && group.command !== 'fallback' && group.command !== 'advance' &&
    activeDefenderCount(group) > 0);
  if (tacticalGroupCapabilities(defender).has('volley')) {
    if (chargingMelee) return exposure.frontal.chargingRanged;
    if (screeningMelee) return exposure.frontal.meleeScreenedRanged;
    return screenedByEarlierLine ? exposure.frontal.lineScreened : exposure.frontal.exposedRanged;
  }
  if (screenedByEarlierLine) return exposure.frontal.lineScreened;
  if (tacticalGroupCapabilities(defender).has('melee') && screeningMelee) {
    return exposure.frontal.screeningMelee;
  }
  return exposure.frontal.exposed;
}

export function rearAssaultExposureMultiplier(
  defender: TacticalDefenderGroup,
  defenders: TacticalDefenderGroup[],
): number {
  const rearExposure = CONFIG.tacticalBattle.formationExposure.rearAssault;
  const contactLine = activeContactLine(defenders, REAR_ASSAULT_LINE_ORDER);
  const contactIndex = contactLine == null ? -1 : REAR_ASSAULT_LINE_ORDER.indexOf(contactLine);
  const defenderIndex = REAR_ASSAULT_LINE_ORDER.indexOf(defender.line);
  const distanceBehindContact = contactIndex < 0 ? 0 : defenderIndex - contactIndex;
  if (distanceBehindContact > 0) {
    return distanceBehindContact === 1 ? rearExposure.adjacentProtected : rearExposure.deepProtected;
  }

  const capabilities = tacticalGroupCapabilities(defender);
  const exposed = capabilities.has('volley') ? rearExposure.exposedRanged
    : defender.kind === 'civilian' || defender.kind === 'healer' ? rearExposure.exposedCivilian
      : rearExposure.exposedOther;
  const guarded = capabilities.has('melee') ? rearExposure.guardedMelee : rearExposure.guardedRanged;
  const guardStrength = rearAssaultGuardStrength(defenders);
  return exposed + (guarded - exposed) * guardStrength;
}

function surpriseConfusionChance(zone: TacticalBattleZone, defenders: TacticalDefenderGroup[]): number {
  const hunters = defenders.reduce((sum, defender) => sum + activeDefenderCount(defender), 0);
  return clamp(0.35 + zone.ambushBonus / 100 + Math.min(0.2, hunters * 0.025), 0.35, 1);
}

export interface EngagementExchangeInput {
  zone: TacticalBattleZone;
  defenders: ReadonlyArray<TacticalDefenderGroup>;
  attackers: ReadonlyArray<TacticalRaiderGroup>;
  direction: 'frontal' | 'rear';
  weather: WeatherId;
  prepareVolleyApplied: boolean;
  evacuateCiviliansApplied: boolean;
  roundStartingRaiderPower: number;
  rangedEfficiency?: number;
  defenderPowerMultiplier?: (defender: TacticalDefenderGroup) => number;
  defenderCasualtyMultiplier?: (defender: TacticalDefenderGroup) => number;
  raiderLossRateScale?: number;
  priorRaiderMoraleDelta?: number;
  retreatPowerThreshold?: number;
  rng: () => number;
}

export interface TacticalDefenderLoss {
  groupId: string;
  wounded: number;
  killed: number;
}

export interface TacticalRaiderLoss {
  groupId: string;
  killed: number;
  powerAfter: number;
  confused: boolean;
}

export interface EngagementExchangeResult {
  enemyPower: number;
  defensePower: number;
  enemyShare: number;
  defenseShare: number;
  commands: TacticalCommandId[];
  surpriseAttack: boolean;
  surpriseDefenderIds: string[];
  confusedAttackerIds: string[];
  retreatingAttackerIds: string[];
  defenderLosses: TacticalDefenderLoss[];
  raiderLosses: TacticalRaiderLoss[];
  villageMoraleDelta: number;
  raiderMoraleDelta: number;
  preDefenseEvents: TacticalAnimationEvent[];
  preDefenseLines: string[];
  postDefenseEvents: TacticalAnimationEvent[];
  afterConsequencesEvents: TacticalAnimationEvent[];
}

export function splitTacticalEngagementDefenders(
  defenders: ReadonlyArray<TacticalDefenderGroup>,
  rearAssaultActive: boolean,
): {
  frontal: TacticalDefenderGroup[];
  rear: TacticalDefenderGroup[];
  protectedTargets: TacticalDefenderGroup[];
} {
  const combatants = defenders.filter(defender => defender.commandable !== false);
  const protectedTargets = defenders.filter(defender => defender.commandable === false);
  if (!rearAssaultActive) return { frontal: combatants, rear: [], protectedTargets };
  return {
    frontal: combatants.filter(defender =>
      (defender.line === 'front' || (defender.line === 'middle' && defender.command !== 'reinforceRear'))),
    rear: combatants.filter(defender => defender.line === 'rear' ||
      (defender.line === 'middle' && defender.command === 'reinforceRear')),
    protectedTargets,
  };
}

export function resolveEngagementExchange(input: EngagementExchangeInput): EngagementExchangeResult {
  const zone = { ...input.zone };
  const defenders = input.defenders.map(group => ({ ...group, residentIds: [...group.residentIds] }));
  const attackers = input.attackers.map(group => ({ ...group }));
  const rearEngagement = input.direction === 'rear';
  const rearAttackers = rearEngagement ? attackers : [];
  const combatDefenders = defenders.filter(defender => defender.commandable !== false);
  const surpriseDefenders = defenders.filter(defender => defender.command === 'ambush' && defender.ambushed);
  const surpriseAttack = surpriseDefenders.length > 0;
  const friendlyActionEvents: TacticalAnimationEvent[] = [];
  const enemyActionEvents: TacticalAnimationEvent[] = [];
  const maneuverEvents: TacticalAnimationEvent[] = [];
  const defenderCasualtyEvents: TacticalAnimationEvent[] = [];
  const raiderCasualtyEvents: TacticalAnimationEvent[] = [];
  const confusionEvents: TacticalAnimationEvent[] = [];
  const preDefenseLines: string[] = [];
  const afterConsequencesEvents: TacticalAnimationEvent[] = [];
  const confusedAttackerIds: string[] = [];

  if (surpriseAttack) {
    friendlyActionEvents.push(animationEvent(zone.id, 'ambush', '매복중이던 사냥꾼이 적의 측면을 급습합니다.'));
    const confusionChance = surpriseConfusionChance(zone, surpriseDefenders);
    for (const attacker of attackers) {
      if (attacker.confused || input.rng() >= confusionChance) continue;
      attacker.confused = true;
      confusedAttackerIds.push(attacker.id);
      confusionEvents.push(animationEvent(
        zone.id,
        'ambush',
        `${withJosa(attacker.label, '이/가')} 급습에 주저앉아 이번 교전에서 행동하지 못합니다.`,
        560,
        { side: 'raider', groupId: attacker.id, float: '혼란!' },
      ));
    }
  }

  const rawEnemyPower = attackers.reduce(
    (sum, group) => sum + (group.confused
      ? 0
      : group.power * (group.morale / 100) * (group.combatMultiplier ?? 1) *
        tacticalAttackerMatchupMultiplier(group, defenders, zone, input.direction) *
        tacticalRaiderWeatherMultiplier(group, input.weather) *
        (tacticalTargetingRole(group) === 'melee' ? 1 : input.rangedEfficiency ?? 1)),
    0,
  );
  const enemyPower = rawEnemyPower * (0.88 + input.rng() * 0.24);
  let defensePower = combatDefenders.reduce((sum, defender) => {
    const active = activeDefenderCount(defender);
    const survivingShare = defender.count > 0 ? active / defender.count : 0;
    const readyPower = defender.weapon === 'musket'
      ? tacticalGroupPower(defender, active)
      : defender.power * survivingShare;
    const powerMultiplier = (input.defenderPowerMultiplier?.(defender) ?? commandPowerMultiplier(input, defender)) *
      tacticalDefenderMatchupMultiplier(defender, attackers, input.direction);
    return sum + readyPower * powerMultiplier;
  }, 0);
  defensePower *= 1 + zone.defenseBonus / 100;
  const total = Math.max(1, enemyPower + defensePower);
  const enemyShare = enemyPower / total;
  const defenseShare = defensePower / total;

  const commands = [...new Set(combatDefenders.map(defender => defender.command)
    .filter((command): command is TacticalCommandId => command != null))];
  const chargingMelee = combatDefenders.filter(defender =>
    tacticalGroupCapabilities(defender).has('melee') && defender.command === 'charge');
  const attackingMelee = attackers.filter(attacker =>
    !attacker.confused && tacticalTargetingRole(attacker) === 'melee' && activeRaiderCount(attacker) > 0);
  const exposedRanged = combatDefenders.filter(defender => tacticalGroupCapabilities(defender).has('volley'));
  const activeAttackerCount = attackers.reduce((sum, attacker) => sum + activeRaiderCount(attacker), 0);
  const activeCombatDefenderCount = combatDefenders.reduce((sum, defender) => sum + activeDefenderCount(defender), 0);
  const chargingMeleeCount = chargingMelee.reduce((sum, defender) => sum + activeDefenderCount(defender), 0);
  const exposedRangedCount = exposedRanged.reduce((sum, defender) => sum + activeDefenderCount(defender), 0);
  const rearContactLine = activeContactLine(defenders, REAR_ASSAULT_LINE_ORDER);
  const activeRearTargetCount = defenders
    .filter(defender => defender.line === rearContactLine)
    .reduce((sum, defender) => sum + activeDefenderCount(defender), 0);
  const chargeOpensFlank = chargingMelee.length > 0 && exposedRanged.length > 0 &&
    attackers.some(attacker => !attacker.confused);

  if (commands.includes('volley')) {
    const volleyDefenders = defenders.filter(defender => defender.command === 'volley');
    const shots = tacticalDefenderShotCounts(volleyDefenders);
    friendlyActionEvents.push(animationEvent(zone.id, 'volley', defenderVolleyCaption(shots), 650, {
      side: 'defender', direction: input.direction,
      actorGroupIds: volleyDefenders.map(group => group.id), shots,
    }));
  }
  const raiderShots = tacticalRaiderShotCounts(attackers);
  if (defenders.length > 0 && (raiderShots.arrows ?? 0) + (raiderShots.muskets ?? 0) > 0) {
    enemyActionEvents.push(animationEvent(zone.id, 'volley', '적 사격대가 방어선을 향해 일제히 사격합니다.', 650, {
      side: 'raider', direction: input.direction, actorGroupIds: attackers.map(group => group.id),
      shots: { arrows: raiderShots.arrows, muskets: raiderShots.muskets },
    }));
  }
  for (const attacker of rearAttackers.filter(group => !group.confused && defenders.length > 0)) {
    const attackerCount = activeRaiderCount(attacker);
    if (attackerCount <= 0) continue;
    const continuing = (attacker.engagementsInZone ?? 0) > 0;
    enemyActionEvents.push(animationEvent(
      zone.id,
      'melee',
      continuing
        ? `${withJosa(attacker.label, '이/가')} 급습 이후에도 후열 수비대를 계속 몰아붙입니다.`
        : `${withJosa(attacker.label, '이/가')} 방어선 뒤로 파고들어 후열 수비대와 맞붙습니다.`,
      620,
      {
        side: 'raider', groupId: attacker.id, actorGroupIds: [attacker.id],
        float: continuing ? '후열 공격!' : '후열 돌입!',
        meleeParticipants: attackerCount + Math.max(1, activeRearTargetCount),
      },
    ));
  }
  if (zone.id === 'wall' && !zone.breached) {
    const rangedWallUnits = new Set([
      'nimacha-hunter', 'holaon-horse-archer', 'bandit-rider',
      'court-gunner', 'court-archer', 'court-artillery',
    ]);
    const wallStriker = attackers
      .filter(attacker => !attacker.confused && !attacker.rearAssault &&
        (attacker.unitType == null || !rangedWallUnits.has(attacker.unitType)))
      .sort((a, b) => b.power - a.power)[0];
    if (wallStriker) {
      enemyActionEvents.push(animationEvent(zone.id, 'wallAssault',
        `${withJosa(wallStriker.label, '이/가')} 도끼와 장대로 목책을 거칠게 두드립니다.`, 580, {
          side: 'raider', groupId: wallStriker.id, float: '목책 타격!',
        }));
    }
  }
  if (commands.includes('fallback')) {
    maneuverEvents.push(animationEvent(zone.id, 'retreat', '수비대가 병력을 보존하며 다음 구역으로 물러납니다.'));
  }
  if (commands.includes('advance')) {
    maneuverEvents.push(animationEvent(zone.id, 'advance', '수비대가 교전을 마친 뒤 앞선 방어선으로 전진할 채비를 합니다.', 520, {
      side: 'defender', float: '전진 준비',
    }));
  }
  if (commands.includes('charge')) {
    friendlyActionEvents.push(animationEvent(zone.id, 'melee', '근접 수비대가 대열을 깨고 적진으로 돌격합니다.', 620, {
      side: 'defender', actorGroupIds: chargingMelee.map(group => group.id),
      float: '돌격!', meleeParticipants: chargingMeleeCount + activeAttackerCount,
    }));
  }
  if (chargeOpensFlank) {
    enemyActionEvents.push(animationEvent(zone.id, 'melee', '돌격대가 비운 전열의 틈으로 적이 파고들어 후열 원거리 병종을 우회 타격합니다.', 580, {
      side: 'raider', actorGroupIds: attackingMelee.map(group => group.id),
      float: '후열 노출!', meleeParticipants: exposedRangedCount + activeAttackerCount,
    }));
    preDefenseLines.push(`${zone.name}에서 근접대의 돌격으로 후열 원거리 병종이 우회 타격에 노출됐습니다.`);
  }
  if (!commands.includes('volley') && !surpriseAttack && !commands.includes('charge')) {
    // Undefended lines get their sole presentation from the scheduled route movement below.
    if (defenders.length > 0 && defenders.every(defender => defender.kind === 'civilian')) {
      enemyActionEvents.push(animationEvent(zone.id, 'advance', '무장하지 못한 주민들이 비명을 지르며 전선 뒤로 흩어집니다.', 620, {
        side: 'defender', float: '주민 피난',
      }));
    } else if (defenders.length > 0) {
      enemyActionEvents.push(animationEvent(zone.id, 'melee', '방어선에서 짧고 거친 백병전이 벌어집니다.', 650, {
        side: 'raider', actorGroupIds: attackingMelee.map(group => group.id),
        meleeParticipants: activeCombatDefenderCount + activeAttackerCount,
      }));
    }
  }
  if (zone.id === 'wall' && attackers.some(attacker =>
    attacker.unitType === 'court-artillery' && !attacker.confused)) {
    enemyActionEvents.push(animationEvent(zone.id, 'artilleryHit', '토벌군 화포대의 포탄이 방책을 뒤흔듭니다.', 720, {
      side: 'raider', float: '적 화포 사격!', shots: { cannons: raiderShots.cannons ?? 1 },
    }));
  }

  let rearAssaultCasualties = 0;
  const defenderLosses: TacticalDefenderLoss[] = [];
  const defenderRiskEntries = defenders.flatMap(defender => {
    const active = activeDefenderCount(defender);
    if (active <= 0) return [];
    const exposure = rearEngagement
      ? rearAssaultExposureMultiplier(defender, defenders)
      : formationExposureMultiplier(defender, defenders);
    const commandCasualtyMultiplier = input.defenderCasualtyMultiplier?.(defender) ?? casualtyMultiplier(input, defender);
    let risk = enemyShare * (0.16 + zone.pressure / 650) * commandCasualtyMultiplier * exposure;
    if (defender.kind === 'civilian') risk *= zone.civilianRisk / 50;
    risk = clamp(risk, 0, 0.48);
    const expectedDeaths = enemyShare > 0.55 ? risk * 0.32 : 0;
    return [{ defender, active, risk, expectedCasualties: active * risk + expectedDeaths, expectedDeaths }];
  });
  const defenderCapacities = defenderRiskEntries.map(entry => entry.active);
  const enemyTargetDemands = defenderRiskEntries.map(() => 0);
  const targetContactLine = defenderContactLine(defenders, input.direction);
  const enemyTargetingContext: TacticalTargetingContext = {
    direction: input.direction,
    contactLine: targetContactLine,
    meleeContact: targetContactLine != null && defenders.some(group =>
      group.line === targetContactLine && activeDefenderCount(group) > 0 &&
      tacticalGroupCapabilities(group).has('melee')),
    prepareVolleyApplied: false,
  };
  for (const attacker of attackers) {
    if (attacker.confused || activeRaiderCount(attacker) <= 0 || !attacker.targetGroupId) continue;
    const targetIndex = defenderRiskEntries.findIndex(entry => entry.defender.id === attacker.targetGroupId);
    if (targetIndex < 0) continue;
    const targeting = canTargetLine(attacker, defenderRiskEntries[targetIndex].defender.line, enemyTargetingContext);
    if (!targeting.allowed) continue;
    const effectivePower = attacker.power * (attacker.morale / 100) * (attacker.combatMultiplier ?? 1) *
      tacticalAttackerMatchupMultiplier(attacker, defenders, zone, input.direction) *
      tacticalRaiderWeatherMultiplier(attacker, input.weather) *
      (tacticalTargetingRole(attacker) === 'melee' ? 1 : input.rangedEfficiency ?? 1);
    enemyTargetDemands[targetIndex] += rawEnemyPower > 0
      ? effectivePower * targeting.efficiency * tacticalTargetingConcentration(attacker) / rawEnemyPower
      : 0;
  }
  const defenderWeights = targetedAllocationWeights(
    defenderRiskEntries.map(entry => entry.expectedCasualties),
    enemyTargetDemands,
    defenderCapacities,
  );
  const defenderCapacity = defenderRiskEntries.reduce((sum, entry) => sum + entry.active, 0);
  const defenderCasualtyBudget = randomRoundedBudget(
    defenderRiskEntries.reduce((sum, entry) => sum + entry.expectedCasualties, 0),
    defenderCapacity,
    input.rng,
  );
  const defenderCasualties = integerAllocation(
    defenderCasualtyBudget,
    defenderWeights,
    defenderCapacities,
    enemyTargetDemands.some(demand => demand > 0),
  );
  const defenderDeathBudget = randomRoundedBudget(
    defenderRiskEntries.reduce((sum, entry) => sum + entry.expectedDeaths, 0),
    defenderCasualtyBudget,
    input.rng,
  );
  const defenderDeathWeights = targetedAllocationWeights(
    defenderRiskEntries.map(entry => entry.expectedDeaths),
    enemyTargetDemands,
    defenderCapacities,
  );
  const defenderDeaths = integerAllocation(
    defenderDeathBudget,
    defenderDeathWeights,
    defenderCasualties.map((casualties, index) =>
      Math.min(casualties, Math.max(0, defenderRiskEntries[index].active - 1))),
    enemyTargetDemands.some(demand => demand > 0),
  );
  for (let index = 0; index < defenderRiskEntries.length; index += 1) {
    const { defender } = defenderRiskEntries[index];
    const killed = defenderDeaths[index];
    const wounded = defenderCasualties[index] - killed;
    defenderLosses.push({ groupId: defender.id, wounded, killed });
  }

  const commandEdge = Math.max(
    surpriseAttack ? 0.08 : 0,
    commands.includes('volley') ? 0.06 : 0,
    commands.includes('charge') ? 0.12 : 0,
  );
  const raiderLossRate = clamp(
    defenseShare * (0.08 + commandEdge) * (input.raiderLossRateScale ?? 1),
    0.01,
    0.24,
  );
  const rearGuardStrength = rearAssaultGuardStrength(defenders);
  const rearExposure = CONFIG.tacticalBattle.formationExposure.rearAssault;
  const raiderLosses: TacticalRaiderLoss[] = [];
  const raiderLossEntries = attackers.map(attacker => {
    const activeRaiders = activeRaiderCount(attacker);
    const rearAssaultResistance = attacker.rearAssault
      ? rearExposure.unguardedAttackerLossMultiplier +
        (1 - rearExposure.unguardedAttackerLossMultiplier) * rearGuardStrength
      : 1;
    const groupLossRate = clamp(
      raiderLossRate * (attacker.lossResistance ?? 1) * rearAssaultResistance *
        tacticalRaiderLossMatchupMultiplier(attacker, defenders, input.direction),
      0.005,
      0.24,
    );
    const expectedKilled = activeRaiders * groupLossRate * (0.55 + defenseShare * 0.7);
    return {
      attacker,
      activeRaiders,
      expectedKilled,
      expectedPowerLoss: attacker.power * groupLossRate,
    };
  });
  const raiderCapacities = raiderLossEntries.map(entry => entry.activeRaiders);
  const playerTargetDemands = raiderLossEntries.map(() => 0);
  const context = targetingContext(combatDefenders, attackers, input.direction, input.prepareVolleyApplied);
  const defenderEffectivePowers = combatDefenders.map(defender => {
    const active = activeDefenderCount(defender);
    if (active <= 0) return 0;
    const survivingShare = defender.count > 0 ? active / defender.count : 0;
    const readyPower = defender.weapon === 'musket'
      ? tacticalGroupPower(defender, active)
      : defender.power * survivingShare;
    return readyPower * (input.defenderPowerMultiplier?.(defender) ?? commandPowerMultiplier(input, defender)) *
      tacticalDefenderMatchupMultiplier(defender, attackers, input.direction);
  });
  const totalFriendlyPower = defenderEffectivePowers.reduce((sum, power) => sum + power, 0);
  for (let defenderIndex = 0; defenderIndex < combatDefenders.length; defenderIndex += 1) {
    const defender = combatDefenders[defenderIndex];
    if (defender.targetSource !== 'player' || !defender.targetGroupId) continue;
    const targetIndex = raiderLossEntries.findIndex(entry => entry.attacker.id === defender.targetGroupId &&
      entry.activeRaiders > 0 && entry.attacker.intent !== 'withdraw' && entry.attacker.power > 0);
    if (targetIndex < 0) continue;
    const targeting = canTargetLine(defender, raiderLossEntries[targetIndex].attacker.line, context);
    if (!targeting.allowed) continue;
    playerTargetDemands[targetIndex] += totalFriendlyPower > 0
      ? defenderEffectivePowers[defenderIndex] * targeting.efficiency * tacticalTargetingConcentration(defender) /
        totalFriendlyPower
      : 0;
  }
  const raiderCasualtyWeights = targetedAllocationWeights(
    raiderLossEntries.map(entry => entry.expectedKilled),
    playerTargetDemands,
    raiderCapacities,
  );
  const raiderCasualtyCapacity = raiderLossEntries.reduce((sum, entry) => sum + entry.activeRaiders, 0);
  const raiderCasualtyBudget = randomRoundedBudget(
    raiderLossEntries.reduce((sum, entry) => sum + entry.expectedKilled, 0),
    raiderCasualtyCapacity,
    input.rng,
  );
  const raiderCasualties = integerAllocation(
    raiderCasualtyBudget,
    raiderCasualtyWeights,
    raiderCapacities,
    playerTargetDemands.some(demand => demand > 0),
  );
  const powerLossWeights = targetedAllocationWeights(
    raiderLossEntries.map(entry => entry.expectedPowerLoss),
    playerTargetDemands,
    raiderLossEntries.map(entry => entry.attacker.power),
  );
  const totalPowerLoss = raiderLossEntries.reduce((sum, entry) => sum + entry.expectedPowerLoss, 0);
  const allocatedPowerLoss = continuousAllocation(
    totalPowerLoss,
    powerLossWeights,
    raiderLossEntries.map(entry => entry.attacker.power),
    playerTargetDemands.some(demand => demand > 0),
  );
  for (let index = 0; index < raiderLossEntries.length; index += 1) {
    const { attacker } = raiderLossEntries[index];
    const killed = raiderCasualties[index];
    const powerAfter = Math.max(0, attacker.power - allocatedPowerLoss[index]);
    raiderLosses.push({
      groupId: attacker.id,
      killed,
      powerAfter,
      confused: attacker.confused === true,
    });
    if (killed > 0) {
      raiderCasualtyEvents.push(animationEvent(zone.id, 'casualty', `${attacker.label}에서 ${killed}명이 쓰러졌습니다.`, 480, {
        side: 'raider', groupId: attacker.id, casualties: killed, killed, float: `-${killed}`,
      }));
    }
  }

  for (const loss of raiderLosses) {
    const attacker = attackers.find(group => group.id === loss.groupId);
    if (!attacker) continue;
    attacker.killed += loss.killed;
    attacker.power = loss.powerAfter;
  }
  const postLossPower = attackers.reduce((sum, attacker) => sum + attacker.power, 0);
  const zoneRaiderWeight = postLossPower / input.roundStartingRaiderPower;
  const raiderMoraleDelta = -(defenseShare * 10 + (surpriseAttack ? 3 : 0) +
    (commands.includes('volley') ? 2 : 0) + (commands.includes('charge') ? 4 : 0)) * zoneRaiderWeight;
  const projectedMoraleDelta = (input.priorRaiderMoraleDelta ?? 0) + raiderMoraleDelta;
  const retreatingAttackerIds = attackers
    .filter(attacker => activeRaiderCount(attacker) > 0 && attacker.power > 0 && (
      attacker.morale + projectedMoraleDelta <= 18 ||
      (input.retreatPowerThreshold != null && attacker.power <= input.retreatPowerThreshold)
    ))
    .map(attacker => attacker.id);
  const retreatingAttackerIdSet = new Set(retreatingAttackerIds);
  const raiderRetreatEvents = retreatingAttackerIds.map(attackerId => {
    const attacker = attackers.find(group => group.id === attackerId)!;
    return animationEvent(
      zone.id,
      'moraleBreak',
      `${attacker.label}의 기세가 꺾여 공격을 포기하고 물러납니다.`,
      650,
      { side: 'raider', groupId: attacker.id, actorGroupIds: [attacker.id], float: '퇴각!' },
    );
  });
  const postLossRawEnemyPower = attackers.reduce(
    (sum, group) => sum + (group.confused || activeRaiderCount(group) <= 0
      ? 0
      : group.power * (group.morale / 100) * (group.combatMultiplier ?? 1) *
        tacticalAttackerMatchupMultiplier(group, defenders, zone, input.direction) *
        tacticalRaiderWeatherMultiplier(group, input.weather) *
        (tacticalTargetingRole(group) === 'melee' ? 1 : input.rangedEfficiency ?? 1)),
    0,
  );
  const postStrikeRawEnemyPower = attackers.reduce(
    (sum, group) => sum + (group.confused || retreatingAttackerIdSet.has(group.id) || activeRaiderCount(group) <= 0
      ? 0
      : group.power * (group.morale / 100) * (group.combatMultiplier ?? 1) *
        tacticalAttackerMatchupMultiplier(group, defenders, zone, input.direction) *
        tacticalRaiderWeatherMultiplier(group, input.weather) *
        (tacticalTargetingRole(group) === 'melee' ? 1 : input.rangedEfficiency ?? 1)),
    0,
  );
  const retaliationScale = rawEnemyPower > 0
    ? clamp(postStrikeRawEnemyPower / rawEnemyPower, 0, 1)
    : 0;
  const adjustedDefenderCasualtyBudget = Math.min(
    defenderCasualtyBudget,
    Math.round(defenderCasualtyBudget * retaliationScale),
  );
  const adjustedDefenderCasualties = integerAllocation(
    adjustedDefenderCasualtyBudget,
    defenderCasualties,
    defenderCapacities,
    enemyTargetDemands.some(demand => demand > 0),
  );
  const adjustedDefenderDeathBudget = Math.min(
    adjustedDefenderCasualtyBudget,
    Math.round(defenderDeathBudget * retaliationScale),
  );
  const adjustedDefenderDeaths = integerAllocation(
    adjustedDefenderDeathBudget,
    defenderDeaths,
    adjustedDefenderCasualties.map((casualties, index) =>
      Math.min(casualties, Math.max(0, defenderRiskEntries[index].active - 1))),
    enemyTargetDemands.some(demand => demand > 0),
  );
  defenderLosses.length = 0;
  for (let index = 0; index < defenderRiskEntries.length; index += 1) {
    const { defender } = defenderRiskEntries[index];
    const killed = adjustedDefenderDeaths[index];
    const wounded = adjustedDefenderCasualties[index] - killed;
    defenderLosses.push({ groupId: defender.id, wounded, killed });
    if (rearEngagement && defender.line === rearContactLine) {
      rearAssaultCasualties += wounded + killed;
    }
    if (wounded + killed <= 0) continue;
    const parts = [killed > 0 ? `전사 ${killed}` : '', wounded > 0 ? `부상 ${wounded}` : ''].filter(Boolean);
    defenderCasualtyEvents.push(animationEvent(
      zone.id,
      'casualty',
      `${defender.label}에서 전사 ${killed}, 부상 ${wounded}명이 발생했습니다.`,
      520,
      {
        side: 'defender', groupId: defender.id, casualties: wounded + killed, wounded, killed,
        float: parts.join('·'),
      },
    ));
  }
  if (rearAssaultCasualties > 0) {
    preDefenseLines.push(`후방 급습으로 후열에서 ${rearAssaultCasualties}명의 사상자가 발생해 마을 기세가 흔들렸습니다.`);
  }

  const survivingAttackerIds = new Set(attackers
    .filter(attacker => !attacker.confused && !retreatingAttackerIdSet.has(attacker.id) &&
      activeRaiderCount(attacker) > 0 && attacker.power > 0)
    .map(attacker => attacker.id));
  const survivingRaiderShots = tacticalRaiderShotCounts(
    attackers.filter(attacker => survivingAttackerIds.has(attacker.id)),
  );
  if (raiderCasualtyEvents.length > 0 && friendlyActionEvents.length === 0 && combatDefenders.length > 0) {
    const counterActors = combatDefenders.filter(defender => activeDefenderCount(defender) > 0);
    const counterMeleeActors = counterActors.filter(defender => tacticalGroupCapabilities(defender).has('melee'));
    if (counterMeleeActors.length > 0) {
      friendlyActionEvents.push(animationEvent(
        zone.id,
        'melee',
        '근접 수비대가 달려드는 적을 맞받아칩니다.',
        620,
        {
          side: 'defender', actorGroupIds: counterMeleeActors.map(defender => defender.id),
          meleeParticipants: counterMeleeActors.reduce((sum, defender) => sum + activeDefenderCount(defender), 0) +
            attackers.reduce((sum, attacker) => sum + activeRaiderCount(attacker), 0),
        },
      ));
    } else {
      const shots = tacticalDefenderShotCounts(counterActors);
      friendlyActionEvents.push(animationEvent(
        zone.id,
        'volley',
        '수비대가 접근하는 적을 향해 견제 사격을 퍼붓습니다.',
        620,
        { side: 'defender', shots },
      ));
    }
  }
  const resolvedEnemyActionEvents: TacticalAnimationEvent[] = [];
  for (const currentEvent of enemyActionEvents) {
    if (survivingAttackerIds.size === 0) continue;
    if (currentEvent.groupId && !survivingAttackerIds.has(currentEvent.groupId)) continue;
    const actorGroupIds = currentEvent.actorGroupIds?.filter(groupId => survivingAttackerIds.has(groupId));
    if (currentEvent.actorGroupIds && actorGroupIds?.length === 0) continue;
    if (currentEvent.kind === 'volley' && currentEvent.side === 'raider') {
      const shots = { arrows: survivingRaiderShots.arrows, muskets: survivingRaiderShots.muskets };
      if ((shots.arrows ?? 0) + (shots.muskets ?? 0) <= 0) continue;
      resolvedEnemyActionEvents.push({ ...currentEvent, shots, actorGroupIds });
      continue;
    }
    if (currentEvent.kind === 'artilleryHit' && (survivingRaiderShots.cannons ?? 0) <= 0) continue;
    resolvedEnemyActionEvents.push({ ...currentEvent, actorGroupIds });
  }

  const remainingActionShare = retreatingAttackerIds.length > 0 && postLossRawEnemyPower > 0
    ? clamp(postStrikeRawEnemyPower / postLossRawEnemyPower, 0, 1)
    : 1;
  const resolvedEnemyPower = enemyPower * remainingActionShare;
  const resolvedTotal = Math.max(1, resolvedEnemyPower + defensePower);
  const resolvedEnemyShare = resolvedEnemyPower / resolvedTotal;
  const resolvedDefenseShare = defensePower / resolvedTotal;
  const villageMoraleDelta = (resolvedEnemyShare > 0.5 ? -(2 + resolvedEnemyShare * 7) : 1) -
    (rearAssaultCasualties > 0 ? 3 : 0);

  if (surpriseAttack) {
    afterConsequencesEvents.push(animationEvent(zone.id, 'retreat', '급습을 마친 사냥꾼들이 추격을 피해 다음 방어선으로 빠집니다.', 620, {
      side: 'defender', float: '이탈!',
    }));
  }

  return {
    enemyPower: resolvedEnemyPower,
    defensePower,
    enemyShare: resolvedEnemyShare,
    defenseShare: resolvedDefenseShare,
    commands,
    surpriseAttack,
    surpriseDefenderIds: surpriseDefenders.map(defender => defender.id),
    confusedAttackerIds,
    retreatingAttackerIds,
    defenderLosses,
    raiderLosses,
    villageMoraleDelta,
    raiderMoraleDelta,
    preDefenseEvents: stabilizeTacticalCasualtyCaptions([
      ...friendlyActionEvents,
      ...raiderCasualtyEvents,
      ...confusionEvents,
      ...raiderRetreatEvents,
      ...resolvedEnemyActionEvents,
      ...defenderCasualtyEvents,
      ...maneuverEvents,
    ], Object.fromEntries([...defenders, ...attackers].map(group => [group.id, group.label]))),
    preDefenseLines,
    postDefenseEvents: [],
    afterConsequencesEvents,
  };
}

export interface DefenseZoneConsequencesInput {
  zone: TacticalBattleZone;
  defenders: ReadonlyArray<TacticalDefenderGroup>;
  attackers: ReadonlyArray<TacticalRaiderGroup>;
  commands: ReadonlyArray<TacticalCommandId>;
  enemyPower: number;
  defensePower: number;
  enemyShare: number;
  originalPower: number;
  availableLoot: Partial<Record<ResourceId, number>>;
  fireArrowEffectScale?: number;
  doctrine?: EnemyDoctrineId;
  wallBreakerEffectScale?: number;
  rng: () => number;
}

export interface DefenseZoneConsequencesResult {
  pressure: number;
  breached: boolean;
  buildingsDamaged: number;
  loot: Partial<Record<ResourceId, number>>;
  breachEvents: TacticalAnimationEvent[];
  breachLines: string[];
  lootEvents: TacticalAnimationEvent[];
  lootLines: string[];
}

export function applyDefenseZoneConsequences(
  input: DefenseZoneConsequencesInput,
): DefenseZoneConsequencesResult {
  const zone = { ...input.zone };
  const defenders = input.defenders.map(group => ({ ...group, residentIds: [...group.residentIds] }));
  const attackers = input.attackers.map(group => ({ ...group }));
  const commands = new Set(input.commands);
  const combatDefenders = defenders.filter(defender => defender.commandable !== false);
  const activeDefenders = Math.max(1, combatDefenders.reduce(
    (sum, defender) => sum + activeDefenderCount(defender),
    0,
  ));
  const commandShare = (command: TacticalCommandId): number => combatDefenders.reduce(
    (sum, defender) => sum + (defender.command === command ? activeDefenderCount(defender) : 0),
    0,
  ) / activeDefenders;
  const pressureTotal = Math.max(1, input.enemyPower + input.defensePower);
  const pressureEnemyShare = input.enemyPower / pressureTotal;
  const pressureDefenseShare = input.defensePower / pressureTotal;
  let pressureDelta = 15 + pressureEnemyShare * 32 - pressureDefenseShare * 12;
  if (zone.id === 'wall') {
    pressureDelta += attackers.reduce((sum, attacker) =>
      sum + tacticalUnitWallPressure(attacker, input.doctrine, input.wallBreakerEffectScale), 0);
  }
  pressureDelta -= commandShare('hold') * 8;
  pressureDelta -= commandShare('charge') * 6;
  pressureDelta += commandShare('fallback') * 28;
  pressureDelta += commandShare('advance') * 10;
  if (zone.id === 'wall' && attackers.some(attacker => attacker.kind === 'main' && !attacker.confused)) {
    pressureDelta = Math.max(6, pressureDelta);
  }
  const fireArrowAttack = (input.fireArrowEffectScale ?? 0) > 0 &&
    (zone.id === 'wall' || zone.id === 'storehouse') && attackers.some(attacker =>
      !attacker.confused && tacticalTargetingRole(attacker) !== 'melee');
  if (fireArrowAttack) {
    pressureDelta += CONFIG.tacticalBattle.enemyPlan.effects.fireArrows.pressureBonus *
      (input.fireArrowEffectScale ?? 0);
  }
  const protectedCiviliansOnly = zone.id === 'center' && defenders.length > 0 &&
    defenders.every(defender => defender.commandable === false);
  if (protectedCiviliansOnly) pressureDelta = Math.min(32, pressureDelta);
  else if (zone.id === 'storehouse' || zone.id === 'center') pressureDelta = Math.min(34, pressureDelta);
  const pressure = clamp(zone.pressure + pressureDelta, 0, 100);
  const breachAt = zone.id === 'approach' ? 62 : 100;
  const breachedNow = !zone.breached && pressure >= breachAt;
  const breached = zone.breached || breachedNow;
  let buildingsDamaged = 0;
  const breachEvents: TacticalAnimationEvent[] = [];
  const breachLines: string[] = [];
  const lootEvents: TacticalAnimationEvent[] = [];
  const lootLines: string[] = [];
  const loot: Partial<Record<ResourceId, number>> = {};

  if (fireArrowAttack && input.rng() < CONFIG.tacticalBattle.enemyPlan.effects.fireArrows.buildingDamageChance *
      (input.fireArrowEffectScale ?? 0)) {
    buildingsDamaged += 1;
    breachEvents.push(animationEvent(zone.id, 'fire', '적 불화살이 방책과 지붕에 불씨를 흩뿌립니다.', 720, {
      side: 'raider', float: '불화살!',
    }));
    breachLines.push(`${zone.name}에 불화살이 떨어져 화재 피해가 발생했습니다.`);
  }

  if (breachedNow) {
    const wallBroken = zone.id === 'wall';
    const innerLineFallen = zone.id === 'storehouse' || zone.id === 'center';
    const breachText = wallBroken
      ? `${zone.name}의 방책이 부서져 길이 열립니다.`
      : zone.id === 'center'
        ? '적이 마을 중심지로 쏟아져 들어옵니다 — 최후 방어선이 무너졌습니다.'
        : zone.id === 'storehouse'
          ? '적이 창고 구역으로 밀려들어 비축 방어선이 무너집니다.'
          : `${withJosa(zone.name, '이/가')} 뚫렸습니다.`;
    breachEvents.push(animationEvent(
      zone.id,
      wallBroken ? 'wallHit' : innerLineFallen ? 'zoneFall' : 'advance',
      breachText,
      innerLineFallen ? 980 : 720,
      { side: 'defender', float: wallBroken ? '방책 파괴!' : innerLineFallen ? '방어선 붕괴!' : '돌파!' },
    ));
    if (wallBroken) {
      buildingsDamaged += 1;
      breachLines.push(`${zone.name}의 방책이 파괴되어 적 주력의 진입로가 열렸습니다.`);
    }
  }

  const lootersPresent = attackers.some(attacker => attacker.kind === 'looters' && !attacker.confused);
  if (zone.id === 'storehouse' && lootersPresent && (input.enemyShare > 0.5 || breached || pressure >= 65)) {
    const guarded = commands.has('guardStorehouse');
    if (!guarded || input.enemyShare > 0.68) {
      const factor = clamp((pressure + zone.lootRisk) / 100, 0.15, 1);
      const requests: Partial<Record<ResourceId, number>> = {
        grain: Math.max(1, Math.round((3 + input.originalPower / 18) * factor)),
        firewood: Math.max(1, Math.round((2 + input.originalPower / 24) * factor)),
        hide: Math.max(0, Math.round((input.originalPower / 35) * factor)),
      };
      for (const [key, requested] of Object.entries(requests)) {
        const resource = key as ResourceId;
        const amount = Math.min(Math.max(0, Math.floor(input.availableLoot[resource] ?? 0)), requested ?? 0);
        if (amount > 0) loot[resource] = amount;
      }
      lootEvents.push(animationEvent(zone.id, 'loot', '약탈조가 창고 문을 부수고 비축을 빼냅니다.', 760, {
        side: 'raider', float: '약탈!',
      }));
      if (input.rng() < 0.35 + input.enemyShare * 0.25) buildingsDamaged += 1;
    } else {
      lootLines.push('창고 수비대가 약탈조를 물자 더미 앞에서 막아냈습니다.');
    }
  }

  return {
    pressure,
    breached,
    buildingsDamaged,
    loot,
    breachEvents,
    breachLines,
    lootEvents,
    lootLines,
  };
}
