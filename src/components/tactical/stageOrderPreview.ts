// Phase 4·5 무대 명령/방향 표시 문구 — 명령 종류·전력 페널티·이동 문구는 전부 백엔드
// preview 계약 값을 그대로 보여주며 여기서 재계산하지 않는다.
import type {
  TacticalFacingPreview, TacticalStageOrderPreview,
} from '../../game/tacticalBattle';
import type { TacticalBattle, TacticalFacing } from '../../game/types';
import { deploymentLineLabel } from './TacticalDeploymentDock';

export function stageOrderCommandLabel(command: TacticalStageOrderPreview['command']): string {
  if (command === 'redeploy') return '재배치';
  if (command === 'advance') return '전진';
  if (command === 'fallback') return '후퇴';
  return '위치 유지';
}

/** 확인 카드 제목의 `전열 → 중열` / `숲길 잠입로 → 산채 목책` 표기 — 바뀐 축만 짧게 보여준다 */
export function stageOrderTransitionText(battle: TacticalBattle, preview: TacticalStageOrderPreview): string {
  if (preview.origin.zoneId === preview.destination.zoneId) {
    return `${deploymentLineLabel(preview.origin.line)} → ${deploymentLineLabel(preview.destination.line)}`;
  }
  const zoneName = (zoneId: string) => battle.zones.find(zone => zone.id === zoneId)?.name ?? zoneId;
  return `${zoneName(preview.origin.zoneId)} → ${zoneName(preview.destination.zoneId)}`;
}

/** 백엔드 powerPenalty(빠지는 비율)를 사람이 읽는 감소 문구로 — 0이면 null */
export function stageOrderPenaltyText(preview: TacticalStageOrderPreview): string | null {
  const percent = Math.round(preview.powerPenalty * 100);
  if (percent <= 0) return null;
  return `${stageOrderCommandLabel(preview.command)} 중 전투력 ${percent}% 감소`;
}

// ── Phase 5 방향전환 ──

export function facingLabel(facing: TacticalFacing): string {
  return facing === 'towardEnemy' ? '적 방향' : '후방';
}

export function facingTransitionText(preview: TacticalFacingPreview): string {
  return `${facingLabel(preview.origin)} → ${facingLabel(preview.destination)}`;
}

/** 지휘 단계 회전 페널티는 백엔드 preview의 powerPenalty·currentRoundOnly에서만 읽는다. 배치 단계는 0 → null */
export function facingPenaltyText(preview: TacticalFacingPreview): string | null {
  const percent = Math.round(preview.powerPenalty * 100);
  if (percent <= 0) return null;
  return `방향전환으로 전투력 ${percent}% 감소${preview.currentRoundOnly ? ' — 이번 교전만' : ''}`;
}
