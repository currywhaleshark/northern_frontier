// Phase 3 배치 카드 독 — 지휘 가능 부대를 `배치 대기`/`배치 완료` 카드로 보여주고,
// 카드를 무대 전열 앵커로 끌어 즉시 배치한다(확인 카드 없음, 13.8 확정).
// 배치 규칙 판정은 전부 백엔드 unavailable-reason/mutation이 담당하고, 이 컴포넌트는
// 카드 표시·드래그 좌표·피드백 문구만 책임진다.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { combatDefaultWeaponName } from '../../game/combatCapabilities';
import {
  placeTacticalDeploymentGroup,
  placeTacticalRouteBlocker,
  removeTacticalDeploymentGroup,
  tacticalDeploymentPlacementUnavailableReason,
  tacticalRoutePlacementUnavailableReason,
} from '../../game/tacticalBattle';
import { parseRouteAnchorId } from './TacticalRouteRibbon';
import {
  defaultTacticalDeploymentPlacement,
  type TacticalDeploymentGroupView,
  type TacticalDeploymentView,
} from '../../game/tacticalDeployment';
import type {
  CombatWeaponId,
  GameState,
  TacticalDefenderGroup,
  TacticalFormationLine,
} from '../../game/types';
import { playSfx } from '../../sound/sfx';
import { DockDefenderSprite } from './TacticalGroupChip';
import { useStagePointerDrag } from './stagePointerDrag';

export const DEPLOY_ANCHOR_ATTRIBUTE = 'data-deploy-anchor';
export const DEPLOY_DOCK_ANCHOR_ID = 'dock-waiting';

export interface DeploymentDragSnapshot {
  groupId: string;
  hoverAnchorId: string | null;
}

interface DockFeedback {
  text: string;
  tone: 'ok' | 'warn';
}

interface Props {
  state: GameState;
  battle: NonNullable<GameState['tacticalBattle']>;
  view: TacticalDeploymentView;
  selectedGroupId: string | null;
  onSelect: (groupId: string) => void;
  onAction: (action: (state: GameState) => string | null) => void;
  onDragChange: (groupId: string, drag: DeploymentDragSnapshot | null) => void;
}

const WEAPON_NAMES: Record<CombatWeaponId, string> = { musket: '조총', hornBow: '각궁', spear: '창' };

export function deploymentLineLabel(line: TacticalFormationLine): string {
  return line === 'front' ? '전열' : line === 'middle' ? '중열' : '후열';
}

export function parseDeployAnchorId(
  anchorId: string,
): { zoneId: string; line: TacticalFormationLine } | null {
  const separator = anchorId.lastIndexOf('|');
  if (separator <= 0) return null;
  const line = anchorId.slice(separator + 1);
  if (line !== 'front' && line !== 'middle' && line !== 'rear') return null;
  return { zoneId: anchorId.slice(0, separator), line };
}

function cardWeaponText(view: TacticalDeploymentGroupView, group: TacticalDefenderGroup): string {
  const weaponName = view.weapon ? WEAPON_NAMES[view.weapon] : combatDefaultWeaponName(view.role);
  return group.mount === 'horse' ? `${weaponName} · 기마` : weaponName;
}

function DeploymentCard({
  battle, view, group, gender, selected, locked, mustered, disabled, onSelect, onDrop, onDragChange,
}: {
  battle: NonNullable<GameState['tacticalBattle']>;
  view: TacticalDeploymentGroupView;
  group: TacticalDefenderGroup;
  gender: 'male' | 'female';
  selected: boolean;
  locked: boolean;
  mustered: boolean;
  disabled: boolean;
  onSelect: () => void;
  onDrop: (anchorId: string | null) => void;
  onDragChange: (drag: DeploymentDragSnapshot | null) => void;
}) {
  const { state: dragState, handleProps } = useStagePointerDrag({
    anchorAttribute: DEPLOY_ANCHOR_ATTRIBUTE,
    disabled: disabled || locked,
    // 카드 touch-action은 pan-x — 가로 스와이프는 독 슬라이드, 세로 스와이프만 배치 드래그다.
    touchAxis: 'vertical',
    onDrop: anchorId => {
      onDragChange(null);
      onDrop(anchorId);
    },
    onClick: onSelect,
    onCancel: () => onDragChange(null),
  });

  useEffect(() => {
    if (!dragState.dragging) return;
    onDragChange({ groupId: view.groupId, hoverAnchorId: dragState.hoverAnchorId });
    // 좌표는 카드가 자체 렌더하는 고스트만 쓰므로 hover 앵커가 바뀔 때만 위로 알린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState.dragging, dragState.hoverAnchorId]);

  const placement = view.placement;
  const placementZoneName = placement
    ? battle.zones.find(zone => zone.id === placement.zoneId)?.name ?? placement.zoneId
    : null;
  const recommended = defaultTacticalDeploymentPlacement(battle, group);
  const recommendedZoneName = battle.zones.find(zone => zone.id === recommended.zoneId)?.name ?? '';
  const featured = view.featuredResidents[0];

  const hoverAnchor = dragState.dragging ? dragState.hoverAnchorId : null;
  const hoverRouteSide = hoverAnchor ? parseRouteAnchorId(hoverAnchor) : null;
  const hoverRoute = hoverRouteSide
    ? battle.flankRoutes?.find(route => route.side === hoverRouteSide)
    : undefined;
  const hoverRouteReason = hoverRouteSide
    ? tacticalRoutePlacementUnavailableReason(battle, view.groupId, hoverRouteSide)
    : null;
  const hoverPlacement = hoverAnchor && hoverAnchor !== DEPLOY_DOCK_ANCHOR_ID && !hoverRouteSide
    ? parseDeployAnchorId(hoverAnchor)
    : null;
  const hoverReason = hoverPlacement
    ? tacticalDeploymentPlacementUnavailableReason(battle, view.groupId, hoverPlacement)
    : null;
  const ghostText = hoverAnchor === DEPLOY_DOCK_ANCHOR_ID
    ? placement ? '배치 대기로 되돌리기' : '이미 배치 대기 중입니다'
    : hoverRouteSide
      ? hoverRouteReason ?? `${hoverRoute?.label ?? '우회로'} 중간 차단 배치`
      : hoverPlacement
        ? hoverReason ?? `${battle.zones.find(zone => zone.id === hoverPlacement.zoneId)?.name ?? ''} ${deploymentLineLabel(hoverPlacement.line)}${battle.orientation === 'assault' && hoverPlacement.zoneId === 'lairWall' ? ' · 전방 은닉' : ''} 배치`
        : '무대의 아군 전열 위로 끌어 배치';

  return (
    <>
      <button
        type="button"
        className={`tactical-deploy-card${locked ? ' locked' : ' stage-drag-handle'}${selected ? ' active' : ''}${placement ? ' placed' : ' waiting'}${dragState.dragging ? ' dragging' : ''}${mustered ? ' just-mustered' : ''}${featured ? ' featured' : ''}`}
        aria-label={`${view.label} ${locked ? '보호 대상' : placement ? '배치됨' : '배치 대기'}`}
        title={locked
          ? '피난 주민은 마을 중심지 최후열에 고정됩니다.'
          : placement
            ? '무대의 다른 전열로 끌어 재배치하거나, 배치 대기 영역으로 끌어 되돌립니다.'
            : '무대의 아군 전열로 끌어 배치합니다. 아래 구역·전열 단추로도 배치할 수 있습니다.'}
        {...(locked ? { onClick: onSelect } : {
          ...handleProps,
          // 포인터 클릭 선택은 훅의 onClick(pointerup) 경로가 처리한다 — 여기서는 키보드
          // Enter/Space가 만드는 detail 0 클릭만 받아 카드 선택의 키보드 경로를 살린다.
          onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
            if (event.detail === 0) onSelect();
          },
        })}
      >
        <span className="tactical-dock-thumb" aria-hidden="true">
          <DockDefenderSprite group={group} gender={gender} />
        </span>
        <span className="tactical-dock-info">
          <strong>
            {view.label}
            <em>{view.count}명</em>
          </strong>
          <span>{locked ? '보호 대상' : cardWeaponText(view, group)}</span>
          {featured && (
            <span className="tactical-deploy-card-featured" title={featured.traitLabel}>
              ★ {featured.name} · {featured.traitLabel}
            </span>
          )}
          <span className={`tactical-deploy-card-placement${placement ? '' : ' pending'}`}>
            {locked
              ? `${placementZoneName ?? ''} 최후열 고정`
              : placement?.routeId
                ? `${battle.flankRoutes?.find(route => route.id === placement.routeId)?.label ?? '우회로'} · 경로 차단`
                : placement
                  ? `${placementZoneName} · ${deploymentLineLabel(placement.line)}${placement.hidden ? ' · 은닉' : ''}${group.facing === 'towardRear' ? ' · 후방 경계' : ''}`
                  : `추천: ${recommendedZoneName} · ${deploymentLineLabel(recommended.line)}`}
          </span>
          {mustered && <em className="tactical-deploy-card-badge">긴급 소집</em>}
        </span>
      </button>
      {dragState.dragging && dragState.position && (
        <div
          className="stage-drag-ghost tactical-deploy-ghost"
          aria-hidden="true"
          style={{ left: dragState.position.x, top: dragState.position.y }}
        >
          <strong>{view.label} {view.count}명</strong>
          <span className={(hoverRouteSide && hoverRouteReason) || (hoverPlacement && hoverReason) ? 'blocked' : ''}>{ghostText}</span>
        </div>
      )}
    </>
  );
}

function DeployCardRow({ children }: { children: ReactNode }) {
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    // React 루트의 wheel 리스너는 passive라 onWheel로는 페이지 스크롤을 못 막는다 —
    // 행에 직접 non-passive로 달아 세로 휠을 카드열 가로 스크롤로 옮긴다.
    const onWheel = (event: WheelEvent) => {
      if (row.scrollWidth <= row.clientWidth) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      row.scrollLeft += event.deltaY;
      event.preventDefault();
    };
    row.addEventListener('wheel', onWheel, { passive: false });
    return () => row.removeEventListener('wheel', onWheel);
  }, []);
  return <div className="tactical-deploy-cards" ref={rowRef}>{children}</div>;
}

export function TacticalDeploymentDock({
  state, battle, view, selectedGroupId, onSelect, onAction, onDragChange,
}: Props) {
  const [feedback, setFeedback] = useState<DockFeedback | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (feedbackTimerRef.current != null) window.clearTimeout(feedbackTimerRef.current);
  }, []);
  const showFeedback = (text: string, tone: DockFeedback['tone']) => {
    if (feedbackTimerRef.current != null) window.clearTimeout(feedbackTimerRef.current);
    setFeedback({ text, tone });
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback(null);
      feedbackTimerRef.current = null;
    }, 2600);
  };

  const musterApplied = battle.prepActions.some(action => action.id === 'musterMilitia' && action.applied);
  const groupById = (groupId: string) =>
    battle.defenderGroups.find(candidate => candidate.id === groupId);

  const dropCard = (card: TacticalDeploymentGroupView, anchorId: string | null) => {
    if (anchorId === DEPLOY_DOCK_ANCHOR_ID) {
      if (!card.placement) return;
      onAction(current => removeTacticalDeploymentGroup(current, card.groupId));
      showFeedback(`${card.label} — 배치 대기로 되돌렸습니다.`, 'ok');
      return;
    }
    const routeSide = anchorId ? parseRouteAnchorId(anchorId) : null;
    if (routeSide) {
      // P7 경로 차단 배치 — 유효성·적용은 전부 백엔드 route placement 계약이 처리한다
      const routeReason = tacticalRoutePlacementUnavailableReason(battle, card.groupId, routeSide);
      if (routeReason) {
        showFeedback(routeReason, 'warn');
        return;
      }
      onAction(current => placeTacticalRouteBlocker(current, card.groupId, routeSide));
      playSfx('hammer');
      const routeLabel = battle.flankRoutes?.find(route => route.side === routeSide)?.label ?? '우회로';
      showFeedback(`${card.label} — ${routeLabel} 중간 차단 배치.`, 'ok');
      onSelect(card.groupId);
      return;
    }
    const target = anchorId ? parseDeployAnchorId(anchorId) : null;
    if (!target) {
      showFeedback('유효한 배치 위치가 아닙니다. 무대의 아군 전열 위에 놓으십시오.', 'warn');
      return;
    }
    const reason = tacticalDeploymentPlacementUnavailableReason(battle, card.groupId, target);
    if (reason) {
      showFeedback(reason, 'warn');
      return;
    }
    onAction(current => placeTacticalDeploymentGroup(current, card.groupId, target));
    playSfx('hammer');
    const zoneName = battle.zones.find(zone => zone.id === target.zoneId)?.name ?? '';
    showFeedback(`${card.label} — ${zoneName} ${deploymentLineLabel(target.line)} 배치.`, 'ok');
    onSelect(card.groupId);
  };

  const renderCard = (card: TacticalDeploymentGroupView, locked: boolean) => {
    const group = groupById(card.groupId);
    if (!group) return null;
    return (
      <DeploymentCard
        key={card.groupId}
        battle={battle}
        view={card}
        group={group}
        gender={state.residents.find(resident => resident.id === group.residentIds[0])?.gender ?? 'male'}
        selected={selectedGroupId === card.groupId}
        locked={locked}
        mustered={!locked && !card.placement && musterApplied && card.cohortId === 'militia-unarmed-mustered'}
        disabled={battle.phase !== 'deployment'}
        onSelect={() => onSelect(card.groupId)}
        onDrop={anchorId => dropCard(card, anchorId)}
        onDragChange={drag => onDragChange(card.groupId, drag)}
      />
    );
  };

  return (
    <div className="tactical-deploy-dock" role="group" aria-label="배치 카드">
      <section
        className="tactical-deploy-area waiting"
        {...{ [DEPLOY_ANCHOR_ATTRIBUTE]: DEPLOY_DOCK_ANCHOR_ID }}
        aria-label={`배치 대기 ${view.waiting.length}개 조`}
      >
        <header>
          <strong>배치 대기</strong>
          <em>{view.waiting.length}</em>
        </header>
        <DeployCardRow>
          {view.waiting.map(card => renderCard(card, false))}
          {view.waiting.length === 0 && (
            <span className="tactical-deploy-empty">모든 부대가 배치되었습니다.</span>
          )}
        </DeployCardRow>
      </section>
      <section className="tactical-deploy-area placed" aria-label={`배치 완료 ${view.placed.length}개 조`}>
        <header>
          <strong>배치 완료</strong>
          <em>{view.placed.length}</em>
        </header>
        <DeployCardRow>
          {view.placed.map(card => renderCard(card, false))}
          {view.fixed.map(card => renderCard(card, true))}
          {view.placed.length === 0 && view.fixed.length === 0 && (
            <span className="tactical-deploy-empty">카드를 무대로 끌어 배치하십시오.</span>
          )}
        </DeployCardRow>
      </section>
      {feedback && (
        <p className={`tactical-deploy-feedback ${feedback.tone}`} role="status">{feedback.text}</p>
      )}
    </div>
  );
}
