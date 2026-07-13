import { addLog } from './events';
import {
  beginExpeditionReturn, expeditionCombatPower, expeditionResidentsForIds,
} from './expedition';
import {
  applyBanditLairOutcome, banditLairRaidChance, resolveBanditLairAssault,
} from './siteDiplomacy';
import { predatorHuntChance, resolveWildlifeHunt } from './specialEvents';
import { weaponCountsForResidents } from './weapons';
import type { GameState, ResourceId } from './types';

const EXPEDITION_SCAR_DAYS = 4;

function predatorName(kind: 'wolf' | 'tiger'): string {
  return kind === 'wolf' ? '늑대 떼' : '호랑이';
}

function engagementChance(state: GameState): number {
  const expedition = state.expedition;
  if (!expedition) return 0;
  return expedition.kind === 'lairAssault'
    ? banditLairRaidChance(state, expedition.targetSiteId ?? -1, expedition.memberIds)
    : predatorHuntChance(state, expedition.predatorKind ?? 'wolf', expedition.memberIds);
}

function engagementTargetName(state: GameState): string {
  const expedition = state.expedition;
  if (!expedition) return '알 수 없는 목표';
  if (expedition.kind === 'lairAssault') {
    return state.foreignSites.find(site => site.id === expedition.targetSiteId)?.name ?? '변경 마적 산채';
  }
  return predatorName(expedition.predatorKind ?? 'wolf');
}

export function maybeOpenExpeditionEngagementChoice(state: GameState): void {
  const expedition = state.expedition;
  if (!expedition || expedition.phase !== 'engage' || state.pendingChoice) return;
  const members = expeditionResidentsForIds(state, expedition.memberIds);
  const weapons = weaponCountsForResidents(state, members);
  const chance = engagementChance(state);
  const targetName = engagementTargetName(state);
  const directReason = expedition.kind === 'lairAssault'
    ? '산채 공격전 직접 지휘는 다음 전술 단계에서 개방됩니다.'
    : '맹수 사냥 직접 지휘는 다음 전술 단계에서 개방됩니다.';
  state.pendingChoice = {
    kind: 'expedition',
    title: `${targetName} 개전 결정`,
    body:
      `토벌대가 목표 지점에 도착했습니다.\n` +
      `인원 ${members.length}명 · 전력 ${expeditionCombatPower(state, expedition.memberIds)} · ` +
      `조총 ${weapons.readyMuskets} · 각궁 ${weapons.hornBows} · 창 ${weapons.spears}\n` +
      `자동 전투 예상 성공 ${Math.round(chance * 100)}%`,
    options: [
      { id: 'auto', label: '자동 전투', desc: '원정대 구성과 실제 무장으로 즉시 승패를 판정합니다.' },
      {
        id: 'direct',
        label: '직접 지휘',
        desc: '공격전 전술 화면에서 직접 명령합니다.',
        disabled: true,
        disabledReason: directReason,
      },
      {
        id: 'withdraw',
        label: '철수',
        desc: expedition.kind === 'lairAssault'
          ? '교전 없이 물러납니다. 산채의 경계가 높아집니다.'
          : '교전 없이 물러납니다. 맹수 위협은 그대로 남습니다.',
      },
    ],
    data: {
      expeditionKind: expedition.kind,
      targetSiteId: expedition.targetSiteId,
      predator: expedition.predatorKind,
    },
  };
}

function rememberLoot(state: GameState, loot: Partial<Record<ResourceId, number>>): void {
  if (!state.expedition) return;
  state.expedition.carriedLoot = { ...loot };
}

function addExpeditionScar(state: GameState): void {
  const expedition = state.expedition;
  if (!expedition) return;
  state.battleScars = [
    ...(state.battleScars ?? []).filter(scar => scar.until >= state.day),
    { x: expedition.targetX, y: expedition.targetY, until: state.day + EXPEDITION_SCAR_DAYS },
  ];
}

function returnAfterEngagement(state: GameState, injured: boolean, message: string): void {
  if (injured && state.expedition) {
    state.expedition.speed = Math.max(0.25, state.expedition.speed * 0.7);
  }
  const error = beginExpeditionReturn(state, message);
  if (error) addLog(state, error, 'bad', true);
}

export function resolveExpeditionEngagementChoice(
  state: GameState,
  optionId: string,
  rng: () => number,
): void {
  const choice = state.pendingChoice;
  const expedition = state.expedition;
  if (!choice || choice.kind !== 'expedition' || !expedition || expedition.phase !== 'engage') return;
  const option = choice.options.find(candidate => candidate.id === optionId);
  if (!option || option.disabled) return;
  if (optionId === 'direct') return;
  state.pendingChoice = null;

  if (optionId === 'withdraw') {
    if (expedition.kind === 'lairAssault') {
      const error = applyBanditLairOutcome(state, expedition.targetSiteId ?? -1, 'withdrawal');
      if (error) addLog(state, error, 'bad', true);
    } else {
      addLog(state, `${predatorName(expedition.predatorKind ?? 'wolf')}의 흔적을 뒤로하고 교전 없이 철수했습니다.`, 'info', true);
    }
    returnAfterEngagement(state, false, '토벌대가 공격을 중지하고 귀환길에 올랐습니다.');
    return;
  }

  if (optionId !== 'auto') return;
  if (expedition.kind === 'lairAssault') {
    const result = resolveBanditLairAssault(state, expedition.targetSiteId ?? -1, expedition.memberIds, rng);
    if (typeof result === 'string') {
      addLog(state, result, 'bad', true);
      returnAfterEngagement(state, false, '목표를 공격할 수 없어 토벌대가 귀환길에 올랐습니다.');
      return;
    }
    rememberLoot(state, result.loot);
    addExpeditionScar(state);
    returnAfterEngagement(state, result.injuredResidentId != null, '토벌대가 산채 교전을 마치고 귀환길에 올랐습니다.');
    return;
  }

  const result = resolveWildlifeHunt(
    state,
    expedition.predatorKind ?? 'wolf',
    expedition.memberIds,
    rng,
  );
  if (typeof result === 'string') {
    addLog(state, result, 'bad', true);
    returnAfterEngagement(state, false, '목표를 공격할 수 없어 토벌대가 귀환길에 올랐습니다.');
    return;
  }
  rememberLoot(state, result.loot);
  addExpeditionScar(state);
  returnAfterEngagement(state, result.injuredResidentId != null, '토벌대가 맹수 교전을 마치고 귀환길에 올랐습니다.');
}
