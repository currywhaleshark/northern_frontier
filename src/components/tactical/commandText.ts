import { tacticalCommandDescription } from '../../game/tacticalBattle';
import type { TacticalCommandId, TacticalDefenderGroup } from '../../game/types';

const COMMAND_LABELS: Record<TacticalCommandId, string> = {
  hold: '고수',
  attack: '공격',
  charge: '돌격',
  volley: '일제 사격',
  ambush: '매복',
  guardStorehouse: '창고 사수',
  protectCivilians: '주민 보호',
  redeploy: '전열 재배치',
  reinforceRear: '후방 증원',
  fallback: '후퇴',
  advance: '전진',
  arson: '방화',
  blockEscape: '퇴로 차단',
  openRetreat: '자진 철수',
  flankRoute: '우회 기동',
};

export function commandLabel(
  command: TacticalCommandId,
  group: TacticalDefenderGroup,
  hunt = false,
): string {
  if (hunt) {
    if (command === 'hold') return '창벽';
    if (command === 'volley') return '사격 대기';
    if (command === 'advance') return '몰이';
    if (command === 'ambush') return '반격 대기';
    if (command === 'charge') return '창 돌입';
    if (command === 'openRetreat') return '사냥 중지';
  }
  if (command === 'redeploy' && group.pendingLine) {
    const target = group.pendingLine === 'front' ? '전열' : group.pendingLine === 'middle' ? '중열' : '후열';
    return `재배치 → ${target}`;
  }
  return command === 'ambush' && group.ambushed ? '급습' : COMMAND_LABELS[command];
}

export function commandDescription(
  command: TacticalCommandId,
  group: TacticalDefenderGroup,
  hunt: boolean,
): string {
  if (!hunt) return tacticalCommandDescription(command, group.ambushed);
  if (command === 'hold') return '창과 방패를 세워 짐승 급습 피해를 줄입니다.';
  if (command === 'volley') return '짐승이 모습을 드러내는 순간 활과 조총을 집중합니다.';
  if (command === 'advance') return '소리와 불빛으로 짐승을 밀어 포위망을 빠르게 좁힙니다.';
  if (command === 'ambush') return '모든 전투조가 짐승이 자기 또는 인접 길목에 나타나는 순간 반격합니다. 사냥꾼·파수꾼은 더 능숙합니다.';
  if (command === 'charge') return '발각된 짐승에게 근접 조가 창으로 돌입합니다.';
  if (command === 'openRetreat') return '사냥을 중지하고 맹수 위협을 남긴 채 귀환합니다.';
  return tacticalCommandDescription(command, group.ambushed);
}
