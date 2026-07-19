import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { RESOURCE_NAMES, WEATHER_ICONS, WEATHER_NAMES } from '../game/constants';
import { countBuilt } from '../game/buildings';
import { getSeason } from '../game/seasons';
import { banditLairDoctrineDefinition, enemyPlanCounterLabelsForAction, enemyPlanSummaryView } from '../game/enemyPlan';
import { withJosa } from '../game/josa';
import {
  applyTacticalPlaybackEvent,
  tacticalCommandUnavailableReason, tacticalLootText,
  tacticalFormationLineUnavailableReason, tacticalPreparationUnavailableReason, tacticalRearResponseOptions,
  tacticalRearAssaultIsEngaged, tacticalRearManeuverEffectiveCounterStrengthForZone,
  tacticalSupportedCommands,
} from '../game/tacticalBattle';
import { assaultMaxRounds } from '../game/tacticalAssault';
import { huntDeploymentUnavailableReason, huntMaxRounds } from '../game/tacticalHunt';
import {
  nextActiveTacticalGroupId, nextPendingTacticalGroupId, pendingTacticalCommandCount,
  tacticalActiveDefenderCount, tacticalGroupCanReceiveCommand, tacticalGroupHasPendingCommand,
} from '../game/tacticalCommandState';
import type {
  GameState,
  PreparationActionId,
  TacticalAnimationEvent,
  TacticalCommandId,
  TacticalFormationLine,
} from '../game/types';
import { playMeleeClash, playSfx, playWeaponSalvo, playWeaponVolley, setBattleDrums, type SfxName } from '../sound/sfx';
import { StageDragSpike } from './tactical/StageDragSpike';
import { TacticalGroupChip } from './tactical/TacticalGroupChip';
import { TacticalCommandPopover } from './tactical/TacticalCommandPopover';
import { TacticalMiniMap } from './tactical/TacticalMiniMap';
import { EnemyPlanPanel } from './tactical/EnemyPlanPanel';
import { TacticalZoneColumn } from './tactical/TacticalZoneColumn';
import { commandDescription, commandLabel } from './tactical/commandText';
import { computeCommandPopoverPlacement } from './tactical/popoverPlacement';

// P1.5 스파이크 전용 플래그 — `?dragSpike` URL로만 켜지는 개발용 드래그 검증 하네스
const DRAG_SPIKE_ENABLED = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('dragSpike');

interface Props {
  state: GameState;
  onSpendPreparation: (actionId: PreparationActionId) => void;
  onAdvancePhase: () => void;
  onAssignGroup: (groupId: string, zoneId: string) => void;
  onSplitHuntGroup: (groupId: string, detachCount: number) => void;
  onMergeHuntGroups: (destinationGroupId: string, sourceGroupId: string) => void;
  onSetHuntPreparationZone: (actionId: 'placeBait' | 'setHuntTraps', zoneId: string) => void;
  onSetFormationLine: (groupId: string, line: TacticalFormationLine) => void;
  onSetCommand: (groupId: string, command: TacticalCommandId) => void;
  onSetGroupTarget: (defenderGroupId: string, enemyGroupId: string | null) => void;
  onResolveRound: () => void;
  onCompleteSimulation: () => void;
  onAcknowledgeReport: () => void;
  onFinishBattle: () => void;
}

const PREP_DESCRIPTIONS: Record<PreparationActionId, string> = {
  evacuateCivilians: '중심지 주민 피해를 크게 줄이고 마을 기세를 높입니다.',
  hideSupplies: '창고가 뚫려도 곡물과 땔감 약탈량을 줄입니다.',
  repairWall: '방어선의 방어 보너스를 높이고 초기 압박을 낮춥니다.',
  setAmbush: '접근로 사냥꾼을 즉시 매복중 상태로 만들고 숨은 적 조를 미리 드러냅니다.',
  prepareVolley: '각궁·조총·파수꾼의 일제 사격 효과를 높입니다.',
  firePrevention: '물통과 젖은 가죽을 배치해 적 불화살의 압박과 화재 피해를 줄입니다.',
  torchWatch: '접근로를 밝혀 야간 접근의 첫 교전 기세와 사격 교란을 줄입니다.',
  preliminaryBombardment: '보유한 불랑기포대로 접전 전에 포격합니다. 포대 1문당 화약 2를 소모합니다.',
  musterMilitia: '피난 주민 일부를 민병으로 소집합니다. 마을 기세가 조금 낮아집니다.',
  nightAssault: '밤이 깊기를 기다려 숲길 초기 돌파와 기습 효과를 얻습니다.',
  prepareFireArrows: '목책·움막에 화공 명령을 쓸 수 있게 하지만 노획물이 불탈 수 있습니다.',
  blockLeaderEscape: '사냥꾼 일부를 본대에서 빼 두목의 산길 퇴로에 미리 매복시킵니다.',
  lureGuards: '척후가 초병 일부를 숲길 아래로 유인해 첫 방어대의 전력과 기세를 낮춥니다.',
  setHuntTraps: '준비를 예약한 뒤 배치 단계에서 길목 하나를 골라 첫 돌파나 도주를 막습니다.',
  placeBait: '고기 3을 예약하고 배치 단계에서 길목 하나를 골라 첫 급습을 그쪽으로 유도합니다.',
  splitDrivers: '구 형식 저장 호환용 행동이며 새 사냥에서는 실제 분견대 편성을 사용합니다.',
  preInfiltration: '사냥꾼을 토벌대보다 앞서 보내 적 소굴 전방에 은닉 배치할 수 있게 합니다.',
};

interface CommandPopoverState {
  groupId: string;
  x: number;
  y: number;
  placement: 'above' | 'below';
  caretShift: number;
  maxHeight: number;
}

// 연출 이벤트 종류별 효과음 매핑 — camera/report처럼 소리가 없는 이벤트는 생략
const EVENT_SFX: Partial<Record<TacticalAnimationEvent['kind'], SfxName>> = {
  fortify: 'hammer',
  prepareAmbush: 'ambush',
  readyVolley: 'battleReady',
  muster: 'militiaMuster',
  evacuate: 'raidDrum',
  conceal: 'hammer',
  zoneFall: 'wallHit',
  wallAssault: 'wallHit',
  rearAssault: 'raidHorn',
  ambush: 'ambush',
  casualty: 'casualty',
  wallHit: 'wallHit',
  moraleBreak: 'moraleBreak',
  loot: 'lootCrash',
  advance: 'raidDrum',
  retreat: 'raidDrum',
  doctrineShift: 'raidDrum',
  leaderEscape: 'raidHorn',
  escapeBlocked: 'ambush',
  beastReveal: 'hunt',
  beastAmbush: 'ambush',
  beastRout: 'moraleBreak',
};

function playTacticalEventSfx(event: TacticalAnimationEvent): void {
  const shots = event.shots;
  if (shots && (shots.arrows ?? 0) + (shots.muskets ?? 0) + (shots.cannons ?? 0) > 0) {
    playWeaponSalvo(shots);
    return;
  }
  if (event.kind === 'bombardment' || event.kind === 'artilleryHit') {
    playWeaponVolley('cannon', 1);
    return;
  }
  if (event.kind === 'volley') {
    playWeaponVolley('arrow', 1);
    playWeaponVolley('musket', 1);
    return;
  }
  if (event.kind === 'fire') {
    playWeaponVolley('arrow', 1);
    return;
  }
  if (event.kind === 'melee') {
    playMeleeClash(event.meleeParticipants ?? 2);
    return;
  }
  const sfx = EVENT_SFX[event.kind];
  if (sfx) playSfx(sfx);
}

// 하단 부대 독 — 배치·지휘 단계에서 모든 부대를 가로 한 줄 칩으로 보여준다
function UnitDock({ state, battle, hunt, mode, selectedGroupId, onSelect }: {
  state: GameState;
  battle: NonNullable<GameState['tacticalBattle']>;
  hunt: boolean;
  mode: 'deployment' | 'command';
  selectedGroupId: string | null;
  onSelect: (groupId: string) => void;
}) {
  return (
    <div className="tactical-unit-dock" role="group" aria-label="부대 목록">
      {battle.defenderGroups.map(group => {
        const active = tacticalActiveDefenderCount(group);
        const zoneName = battle.zones.find(zone => zone.id === group.zoneId)?.name ?? '';
        const pending = mode === 'command' && tacticalGroupHasPendingCommand(group);
        const gender = state.residents.find(resident => resident.id === group.residentIds[0])?.gender ?? 'male';
        const targetText = group.targetSource === 'player'
          ? battle.raiderGroups.find(enemy => enemy.id === group.targetGroupId)?.label ?? '자동'
          : '자동';
        return (
          <TacticalGroupChip
            key={group.id}
            group={group}
            gender={gender}
            active={active}
            zoneName={zoneName}
            mode={mode}
            selected={selectedGroupId === group.id}
            pending={pending}
            commandText={group.command ? commandLabel(group.command, group, hunt) : null}
            targetText={targetText}
            onSelect={() => onSelect(group.id)}
          />
        );
      })}
    </div>
  );
}

// 자막 타자기 효과 — 텍스트가 바뀔 때마다 한 글자씩 드러난다. 배속 중에는 즉시 표시.
function TypewriterCaption({ text, instant }: { text: string; instant: boolean }) {
  const [shown, setShown] = useState(text.length);
  useEffect(() => {
    if (instant) {
      setShown(text.length);
      return;
    }
    setShown(0);
    let revealed = 0;
    const timer = window.setInterval(() => {
      revealed += 1;
      setShown(revealed);
      if (revealed >= text.length) window.clearInterval(timer);
    }, 24);
    return () => window.clearInterval(timer);
  }, [text, instant]);
  return (
    <div className="tactical-caption" aria-label={text}>
      {text.slice(0, shown)}
      {shown < text.length && <span className="tactical-caption-cursor" aria-hidden="true" />}
    </div>
  );
}

// 기존 이벤트 길이는 빠른 재생 기준으로 보존하고, 기본 재생에서는 동작과 자막을 여유 있게 보여준다.
const TACTICAL_PLAYBACK_NORMAL_SCALE = 1.6;

function tacticalPlaybackDuration(durationMs: number, fast: boolean): number {
  return Math.round(durationMs * (fast ? 1 : TACTICAL_PLAYBACK_NORMAL_SCALE));
}

export function TacticalBattleScreen({
  state,
  onSpendPreparation,
  onAdvancePhase,
  onAssignGroup,
  onSplitHuntGroup,
  onMergeHuntGroups,
  onSetHuntPreparationZone,
  onSetFormationLine,
  onSetCommand,
  onSetGroupTarget,
  onResolveRound,
  onCompleteSimulation,
  onAcknowledgeReport,
  onFinishBattle,
}: Props) {
  const battle = state.tacticalBattle;
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageShellRef = useRef<HTMLDivElement>(null);
  const popoverAnchorRef = useRef<HTMLElement | null>(null);
  const commandBoardRef = useRef<HTMLDivElement>(null);
  const commandBoardAttentionTimerRef = useRef<number | null>(null);
  const nextPendingTimerRef = useRef<number | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(() => battle
    ? nextActiveTacticalGroupId(battle.defenderGroups, null) ?? battle.defenderGroups[0]?.id ?? null
    : null);
  const [hoveredCommand, setHoveredCommand] = useState<TacticalCommandId | null>(null);
  const [eventIndex, setEventIndex] = useState(0);
  const [viewedZoneId, setViewedZoneId] = useState(battle?.currentZoneId ?? 'approach');
  const [stingerRound, setStingerRound] = useState<number | null>(null);
  const [fast, setFast] = useState(false);
  const [commandPopover, setCommandPopover] = useState<CommandPopoverState | null>(null);
  const [commandBoardEmphasis, setCommandBoardEmphasis] = useState(false);
  const [nextPendingGroupId, setNextPendingGroupId] = useState<string | null>(null);
  const fastRef = useRef(false);
  const preparationPlayback = battle?.phase === 'preparationExecution';
  const combatPlayback = battle?.phase === 'simulating';
  const playbackActive = preparationPlayback || combatPlayback;
  const activeEvent = preparationPlayback
    ? battle.preparationEvents[eventIndex] ?? null
    : combatPlayback ? battle.pendingReport?.events[eventIndex] ?? null : null;
  const activeZoneId = activeEvent?.zoneId ?? viewedZoneId;

  const closePopover = (options?: { restoreFocus?: boolean }) => {
    setCommandPopover(null);
    if (options?.restoreFocus) popoverAnchorRef.current?.focus();
  };

  const openCommandBoard = () => {
    setCommandPopover(null);
    setCommandBoardEmphasis(false);
    window.requestAnimationFrame(() => {
      setCommandBoardEmphasis(true);
      commandBoardRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
      if (commandBoardAttentionTimerRef.current != null) {
        window.clearTimeout(commandBoardAttentionTimerRef.current);
      }
      commandBoardAttentionTimerRef.current = window.setTimeout(() => {
        setCommandBoardEmphasis(false);
        commandBoardAttentionTimerRef.current = null;
      }, 1200);
    });
  };

  const pulseNextPending = (groupId: string) => {
    if (nextPendingTimerRef.current != null) window.clearTimeout(nextPendingTimerRef.current);
    setNextPendingGroupId(groupId);
    nextPendingTimerRef.current = window.setTimeout(() => {
      setNextPendingGroupId(null);
      nextPendingTimerRef.current = null;
    }, 1800);
  };

  useEffect(() => () => {
    if (nextPendingTimerRef.current != null) window.clearTimeout(nextPendingTimerRef.current);
    if (commandBoardAttentionTimerRef.current != null) {
      window.clearTimeout(commandBoardAttentionTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (commandPopover && selectedGroupId !== commandPopover.groupId) setCommandPopover(null);
  }, [selectedGroupId, commandPopover?.groupId]);

  useEffect(() => {
    setCommandPopover(null);
  }, [battle?.phase, viewedZoneId]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const close = () => setCommandPopover(null);
    window.addEventListener('resize', close);
    viewport?.addEventListener('scroll', close);
    return () => {
      window.removeEventListener('resize', close);
      viewport?.removeEventListener('scroll', close);
    };
  }, [battle?.id]);

  useEffect(() => {
    if (!battle) return;
    playSfx('raidHorn');
  }, [battle?.id]);

  useEffect(() => {
    if (!battle || battle.phase !== 'preparationExecution') return;
    let cancelled = false;
    let timer = 0;
    const events = battle.preparationEvents;
    fastRef.current = false;
    setFast(false);
    const play = (index: number) => {
      if (cancelled) return;
      if (index >= events.length) {
        timer = window.setTimeout(onAdvancePhase, tacticalPlaybackDuration(360, fastRef.current));
        return;
      }
      setEventIndex(index);
      playTacticalEventSfx(events[index]);
      const duration = tacticalPlaybackDuration(events[index].durationMs, fastRef.current);
      timer = window.setTimeout(() => play(index + 1), duration);
    };
    setEventIndex(0);
    timer = window.setTimeout(() => play(0), tacticalPlaybackDuration(260, false));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // Phase and battle id uniquely identify a preparation playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle?.id, battle?.phase]);

  useEffect(() => {
    if (!battle || battle.phase !== 'simulating' || !battle.pendingReport) return;
    let cancelled = false;
    let timer = 0;
    const events = battle.pendingReport.events;
    const round = battle.pendingReport.round;
    fastRef.current = false;
    setFast(false);
    setEventIndex(-1); // 스팅어 동안 이전 라운드 이벤트 연출이 남지 않게
    setBattleDrums(true);
    const play = (index: number) => {
      if (cancelled) return;
      if (index >= events.length) {
        setBattleDrums(false);
        timer = window.setTimeout(onCompleteSimulation, tacticalPlaybackDuration(240, fastRef.current));
        return;
      }
      setEventIndex(index);
      playTacticalEventSfx(events[index]);
      const duration = tacticalPlaybackDuration(events[index].durationMs, fastRef.current);
      timer = window.setTimeout(() => {
        applyTacticalPlaybackEvent(battle, events[index]);
        play(index + 1);
      }, duration);
    };
    // 라운드 스팅어 배너 + 북 1타 뒤에 이벤트 재생을 시작한다
    setStingerRound(round);
    playSfx('raidDrum');
    timer = window.setTimeout(() => {
      setStingerRound(null);
      play(0);
    }, tacticalPlaybackDuration(820, false));
    return () => {
      cancelled = true;
      setBattleDrums(false);
      setStingerRound(null);
      window.clearTimeout(timer);
    };
    // The battle round and phase are the stable playback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle?.id, battle?.phase, battle?.pendingReport?.round]);

  // 재생 중 스페이스로 남은 연출을 배속한다 (클릭은 무대 영역에서 처리)
  useEffect(() => {
    if (!playbackActive) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      event.preventDefault();
      fastRef.current = true;
      setFast(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playbackActive]);

  useEffect(() => {
    if (!battle) return;
    setViewedZoneId(battle.currentZoneId);
  }, [battle?.currentZoneId, battle?.phase]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const zone = viewport?.querySelector<HTMLElement>(`[data-zone-id="${activeZoneId}"]`);
    if (!viewport || !zone) return;
    viewport.scrollTo({
      left: Math.max(0, zone.offsetLeft - (viewport.clientWidth - zone.clientWidth) / 2),
      behavior: battle?.assaultKind === 'predatorHunt' ? 'auto' : 'smooth',
    });
  }, [activeZoneId, battle?.assaultKind]);

  const selectedGroup = useMemo(
    () => battle?.defenderGroups.find(group => group.id === selectedGroupId) ??
      battle?.defenderGroups.find(tacticalGroupCanReceiveCommand) ?? battle?.defenderGroups[0] ?? null,
    [battle?.defenderGroups, selectedGroupId],
  );
  const popoverGroup = commandPopover
    ? battle?.defenderGroups.find(group => group.id === commandPopover.groupId) ?? null
    : null;

  useEffect(() => {
    if (!battle) return;
    const selected = battle.defenderGroups.find(group => group.id === selectedGroupId);
    if (selected && tacticalActiveDefenderCount(selected) > 0) return;
    const nextId = nextActiveTacticalGroupId(battle.defenderGroups, selectedGroupId);
    if (!nextId || nextId === selectedGroupId) return;
    setSelectedGroupId(nextId);
    const zoneId = battle.defenderGroups.find(group => group.id === nextId)?.zoneId;
    if (zoneId) setViewedZoneId(zoneId);
  });

  // 부대 선택 시 무대도 해당 부대의 구역으로 따라간다 (독 칩·무대 클릭 공용)
  const selectGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
    const zoneId = battle?.defenderGroups.find(group => group.id === groupId)?.zoneId;
    if (zoneId) setViewedZoneId(zoneId);
  };

  const openCommandPopover = (groupId: string, element: HTMLElement) => {
    const shell = stageShellRef.current;
    if (!shell || battle?.phase !== 'command') {
      selectGroup(groupId);
      return;
    }
    if (commandPopover?.groupId === groupId) {
      closePopover();
      return;
    }
    const unit = element.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    const placement = computeCommandPopoverPlacement({
      left: unit.left - shellRect.left,
      top: unit.top - shellRect.top,
      width: unit.width,
      height: unit.height,
    }, {
      width: shellRect.width,
      height: shellRect.height,
    });
    popoverAnchorRef.current = element;
    selectGroup(groupId);
    setCommandPopover({ groupId, ...placement });
  };

  if (!battle) return null;
  const assault = battle.orientation === 'assault';
  const hunt = battle.assaultKind === 'predatorHunt';
  const lairAssault = assault && !hunt;
  const mergeableHuntGroups = hunt && selectedGroup
    ? battle.defenderGroups.filter(group =>
      group.id !== selectedGroup.id &&
      group.huntOriginGroupId === selectedGroup.huntOriginGroupId &&
      group.role === selectedGroup.role &&
      group.weapon === selectedGroup.weapon &&
      group.zoneId === selectedGroup.zoneId &&
      group.wounded === 0 && group.killed === 0)
    : [];
  const huntNeedsMoreGroups = hunt && battle.defenderGroups.reduce(
    (sum, group) => sum + tacticalActiveDefenderCount(group),
    0,
  ) >= 3 && battle.defenderGroups.filter(group => tacticalActiveDefenderCount(group) > 0).length < 3;
  const huntDeploymentReason = hunt ? huntDeploymentUnavailableReason(state) : null;
  const roundLimit = hunt ? huntMaxRounds() : assault ? assaultMaxRounds() : 5;
  const commandable = battle.phase === 'command' || battle.phase === 'deployment';
  const showTacticalMiniMap = battle.phase === 'preparation' || battle.phase === 'preparationExecution' ||
    battle.phase === 'deployment' || battle.phase === 'command' || battle.phase === 'simulating' ||
    battle.phase === 'report';
  const pendingCommandCount = pendingTacticalCommandCount(battle.defenderGroups);
  const rearResponseZoneIds = !assault && !hunt
    ? [...new Set(battle.raiderGroups.filter(group =>
      tacticalRearAssaultIsEngaged(group) && group.intent !== 'withdraw' && group.power > 0 &&
      group.count - group.killed > 0).map(group => group.zoneId))]
    : [];
  const rearResponseZoneId = rearResponseZoneIds.includes(viewedZoneId)
    ? viewedZoneId
    : rearResponseZoneIds[0] ?? null;
  const rearResponseOptions = rearResponseZoneId
    ? tacticalRearResponseOptions(battle, rearResponseZoneId)
    : [];
  const effectiveRearCounterStrength = rearResponseZoneId
    ? tacticalRearManeuverEffectiveCounterStrengthForZone(battle, rearResponseZoneId)
    : undefined;
  const effectiveCounterStrengths = effectiveRearCounterStrength == null
    ? undefined
    : { rearManeuver: effectiveRearCounterStrength };
  const effectiveRearCounterZoneName = rearResponseZoneId
    ? battle.zones.find(zone => zone.id === rearResponseZoneId)?.name
    : undefined;
  // 적 계획 요약은 백엔드 selector가 단일 소스다 — 프론트에서 공개 여부를 재판정하지 않는다.
  const enemyPlanSummary = battle.enemyPlan ? enemyPlanSummaryView(battle) : null;
  const hintCommand = hoveredCommand ?? selectedGroup?.command ?? null;
  const commandHint = selectedGroup && hintCommand
    ? `${commandLabel(hintCommand, selectedGroup, hunt)} — ${tacticalCommandUnavailableReason(battle, selectedGroup, hintCommand) ?? commandDescription(hintCommand, selectedGroup, hunt)}`
    : '명령 단추 위에 올리면 설명이 여기에 표시됩니다.';
  // 첫 명령 지정이면 아직 명령 대기 중인 다음 부대로 선택을 넘겨 클릭 수를 줄인다
  const assignCommandTo = (groupId: string, command: TacticalCommandId) => {
    const group = battle.defenderGroups.find(candidate => candidate.id === groupId);
    if (!group || !tacticalGroupCanReceiveCommand(group)) return;
    const firstAssignment = group.commandSource !== 'player';
    onSetCommand(group.id, command);
    if (!firstAssignment) return;
    const nextId = nextPendingTacticalGroupId(battle.defenderGroups, group.id);
    if (nextId) {
      selectGroup(nextId);
      pulseNextPending(nextId);
    }
  };
  const assignFormationLineTo = (groupId: string, line: TacticalFormationLine) => {
    const group = battle.defenderGroups.find(candidate => candidate.id === groupId);
    if (!group) return;
    const queuesRedeploy = battle.phase === 'command' && !assault && !hunt && line !== group.line;
    const firstAssignment = group.commandSource !== 'player';
    onSetFormationLine(group.id, line);
    if (!queuesRedeploy || !firstAssignment) return;
    const nextId = nextPendingTacticalGroupId(battle.defenderGroups, group.id);
    if (nextId) {
      selectGroup(nextId);
      pulseNextPending(nextId);
    }
  };
  const season = getSeason(state.day);
  const wallRepairApplied = battle.prepActions.some(action => action.id === 'repairWall' && action.applied);
  const fortifyEventIndex = battle.preparationEvents.findIndex(event => event.kind === 'fortify' && event.zoneId === 'wall');
  const barricadeReinforced = wallRepairApplied && (
    !preparationPlayback || fortifyEventIndex < 0 || eventIndex >= fortifyEventIndex
  );
  const activeZoneIndex = Math.max(0, battle.zones.findIndex(zone => zone.id === activeZoneId));
  const showZone = (index: number) => {
    const zone = battle.zones[Math.max(0, Math.min(battle.zones.length - 1, index))];
    if (zone) setViewedZoneId(zone.id);
  };
  const report = battle.pendingReport;
  const roundLabel = report && (battle.phase === 'simulating' || battle.phase === 'report' || battle.phase === 'finished')
    ? report.round
    : battle.round;
  const finalLoot = battle.reports.reduce((sum, item) => {
    for (const [resource, amount] of Object.entries(item.loot)) sum[resource] = (sum[resource] ?? 0) + (amount ?? 0);
    return sum;
  }, {} as Record<string, number>);
  const finalWounded = battle.reports.reduce((sum, item) => sum + item.wounded, 0);
  const finalKilled = battle.reports.reduce((sum, item) => sum + item.killed, 0);
  const finalEnemyKilled = battle.reports.reduce((sum, item) => sum + item.raidersKilled, 0);
  const finalDamaged = battle.reports.reduce((sum, item) => sum + item.buildingsDamaged, 0);
  const displayedFactionName = hunt && battle.huntPredatorState !== 'hidden'
    ? battle.raiderGroups.find(group => group.beastKind)?.label ?? battle.factionName
    : battle.factionName;

  // 구역별 누적 피해 자국 — 지나간 라운드 전체 + 지금 재생 중인 라운드는 재생된 이벤트까지만
  const zoneScarCounts: Record<string, number> = {};
  const burningZoneIds = new Set<string>();
  for (const roundReport of battle.reports) {
    const isLive = battle.phase === 'simulating' && roundReport === battle.pendingReport;
    roundReport.events.forEach((item, index) => {
      if (isLive && index > eventIndex) return;
      if (item.kind === 'casualty') zoneScarCounts[item.zoneId] = (zoneScarCounts[item.zoneId] ?? 0) + 1;
      if (item.kind === 'fire') burningZoneIds.add(item.zoneId);
    });
  }
  const enableFastForward = () => {
    if (!playbackActive) return;
    fastRef.current = true;
    setFast(true);
  };
  const snowfall = state.weather === 'heavySnow' || state.weather === 'blizzard' || state.weather === 'coldSnap';
  const flakeCount = state.weather === 'blizzard' ? 70 : state.weather === 'heavySnow' ? 42 : 16;

  return (
    <div className="tactical-overlay" role="dialog" aria-modal="true" aria-label={`${displayedFactionName} ${hunt ? '사냥' : assault ? '토벌' : '습격'} 직접 지휘`}>
      <div className={`tactical-screen${assault ? ' assault' : ' defense'}${hunt ? ' hunt' : ''}${fast ? ' fast-playback' : ''}${activeEvent?.kind === 'wallAssault' || activeEvent?.kind === 'wallHit' || activeEvent?.kind === 'bombardment' || activeEvent?.kind === 'zoneFall' || activeEvent?.kind === 'artilleryHit' || activeEvent?.kind === 'beastAmbush' ? ' shaking' : ''}`}>
        <header className="tactical-header">
          <div>
            <div className="tactical-kicker">{hunt ? '맹수 몰이사냥 지휘' : assault ? '산채 토벌 지휘' : '습격 방어 지휘'}</div>
            <h1>{displayedFactionName}</h1>
          </div>
          <div className="tactical-status-row">
            <div><span>교전</span><strong>{Math.min(roundLabel, roundLimit)} / {roundLimit}</strong></div>
            <div className="tactical-morale-board">
              <div className={`tactical-morale-row ${hunt ? 'encirclement' : 'village'}`}>
                <span>{hunt ? '포위망' : assault ? '토벌대' : '우리 기세'}</span>
                <div className="tactical-morale-gauge" aria-label={hunt ? `포위망 ${Math.round(battle.huntEncirclement ?? 0)}%` : `${assault ? '토벌대' : '우리'} 기세 ${Math.round(battle.villageMorale)}`}>
                  <i style={{ width: `${hunt ? battle.huntEncirclement ?? 0 : battle.villageMorale}%` }} />
                </div>
                <strong>{Math.round(hunt ? battle.huntEncirclement ?? 0 : battle.villageMorale)}{hunt ? '%' : ''}</strong>
              </div>
              <div className={`tactical-morale-row ${hunt ? 'village' : 'raiders'}`}>
                <span>{hunt ? '사냥대' : assault ? '산채' : '적 기세'}</span>
                <div className="tactical-morale-gauge" aria-label={`${hunt ? '사냥대' : assault ? '산채' : '적'} 기세 ${Math.round(hunt ? battle.villageMorale : battle.raiderMorale)}`}>
                  <i style={{ width: `${hunt ? battle.villageMorale : battle.raiderMorale}%` }} />
                </div>
                <strong>{Math.round(hunt ? battle.villageMorale : battle.raiderMorale)}</strong>
              </div>
            </div>
            <div><span>준비점수</span><strong>{battle.prepPoints}</strong></div>
            <div><span>{hunt ? '짐승 상태' : assault ? '정보' : '전황'}</span><strong>{hunt
              ? battle.huntPredatorState === 'hidden' ? '은닉' : battle.huntPredatorState === 'wounded' ? '부상' : battle.huntPredatorState === 'fled' ? '도주' : '발각'
              : assault ? (battle.warned ? '정찰 완료' : '정보 부족') : battle.warned ? '경보됨' : '기습'}</strong></div>
            <div><span>날씨</span><strong>{WEATHER_ICONS[state.weather]} {WEATHER_NAMES[state.weather]}</strong></div>
          </div>
        </header>

        <div className="tactical-stage-shell" ref={stageShellRef} onClick={() => {
          setCommandPopover(null);
          enableFastForward();
        }}>
          <div className="tactical-battlefield" ref={viewportRef}>
            <div className="tactical-strip" style={{ width: `${battle.zones.length * 100}%` }}>
              {battle.zones.map(zone => (
                <TacticalZoneColumn
                  key={zone.id}
                  state={state}
                  battle={battle}
                  zone={zone}
                  season={season}
                  hunt={hunt}
                  assault={assault}
                  activeEvent={activeEvent}
                  eventIndex={eventIndex}
                  activeZoneId={activeZoneId}
                  scarCount={zoneScarCounts[zone.id] ?? 0}
                  burning={burningZoneIds.has(zone.id)}
                  barricadeReinforced={barricadeReinforced}
                  commandable={commandable}
                  selectedGroupId={selectedGroup?.id ?? null}
                  nextPendingGroupId={nextPendingGroupId}
                  onSelectGroup={openCommandPopover}
                  onSelectTarget={(defenderGroupId, enemyGroupId) => {
                    const defender = battle.defenderGroups.find(group => group.id === defenderGroupId);
                    onSetGroupTarget(defenderGroupId,
                      defender?.targetSource === 'player' && defender.targetGroupId === enemyGroupId
                        ? null
                        : enemyGroupId);
                  }}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            className="tactical-stage-nav previous"
            disabled={activeZoneIndex <= 0 || playbackActive}
            onClick={() => showZone(activeZoneIndex - 1)}
            title={assault ? '이전 공략 구역' : '이전 방어선'}
            aria-label={assault ? '이전 공략 구역' : '이전 방어선'}
          >&#x2039;</button>
          <button
            type="button"
            className="tactical-stage-nav next"
            disabled={activeZoneIndex >= battle.zones.length - 1 || playbackActive}
            onClick={() => showZone(activeZoneIndex + 1)}
            title={assault ? '다음 공략 구역' : '다음 방어선'}
            aria-label={assault ? '다음 공략 구역' : '다음 방어선'}
          >&#x203A;</button>
          {showTacticalMiniMap && (
            <TacticalMiniMap
              battle={battle}
              hunt={hunt}
              assault={assault}
              viewedZoneId={activeZoneId}
              selectedGroupId={selectedGroupId}
              eventIndex={eventIndex}
              playback={playbackActive}
              onViewZone={setViewedZoneId}
              onSelectGroup={selectGroup}
            />
          )}
          {DRAG_SPIKE_ENABLED && (
            <StageDragSpike battle={battle} shellRef={stageShellRef} disabled={playbackActive} />
          )}
          {snowfall && (
            <div className={`tactical-weather-layer weather-${state.weather}`} aria-hidden="true">
              {Array.from({ length: flakeCount }, (_, index) => (
                <span
                  key={index}
                  className="tactical-snowflake"
                  style={{
                    left: `${(index * 37) % 100}%`,
                    width: 2 + (index * 5) % 3,
                    height: 2 + (index * 5) % 3,
                    opacity: 0.45 + ((index * 11) % 5) / 10,
                    animationDuration: `${2.4 + ((index * 13) % 12) / 4}s`,
                    animationDelay: `${-(((index * 7) % 30) / 6)}s`,
                  }}
                />
              ))}
            </div>
          )}
          {state.weather === 'blizzard' && <div className="tactical-visibility-veil" aria-hidden="true" />}
          {(activeEvent?.kind === 'wallHit' || activeEvent?.kind === 'bombardment' || activeEvent?.kind === 'zoneFall' || activeEvent?.kind === 'rearAssault' || activeEvent?.kind === 'leaderEscape' || activeEvent?.kind === 'escapeBlocked' || activeEvent?.kind === 'fire') && (
            <div
              className={`tactical-vignette${activeEvent.kind === 'bombardment' ? ' bombardment' : ''}${activeEvent.kind === 'rearAssault' ? ' rear-assault' : ''}${activeEvent.kind === 'fire' ? ' arson' : ''}${activeEvent.kind === 'leaderEscape' ? ' leader-escape' : ''}${activeEvent.kind === 'escapeBlocked' ? ' escape-blocked' : ''}`}
              key={`vignette-${eventIndex}`}
              aria-hidden="true"
            />
          )}
          {stingerRound != null && (
            <div className="tactical-round-stinger" key={`stinger-${stingerRound}`} aria-hidden="true">
              <div>
                <strong>제{Math.min(stingerRound, roundLimit)}차 교전</strong>
                <span>{battle.factionName} {hunt ? '몰이사냥' : assault ? '산채 토벌' : '습격 방어'}</span>
              </div>
            </div>
          )}
          {activeEvent?.text && <TypewriterCaption text={activeEvent.text} instant={fast} />}
          {commandPopover && popoverGroup && battle.phase === 'command' && (
            <TacticalCommandPopover
              battle={battle}
              group={popoverGroup}
              hunt={hunt}
              placement={commandPopover.placement}
              style={{
                left: commandPopover.x,
                top: commandPopover.y,
                '--caret-shift': `${commandPopover.caretShift}px`,
              } as CSSProperties}
              maxHeight={commandPopover.maxHeight}
              onCommand={command => {
                assignCommandTo(popoverGroup.id, command);
                closePopover();
              }}
              onSetLine={line => {
                const displayedLine = popoverGroup.pendingLine ?? popoverGroup.line;
                assignFormationLineTo(popoverGroup.id, line);
                if (line !== displayedLine) closePopover();
              }}
              onMoveZone={zoneId => {
                if (zoneId === popoverGroup.zoneId) return;
                onAssignGroup(popoverGroup.id, zoneId);
                setViewedZoneId(zoneId);
                closePopover();
              }}
              onOpenCommandBoard={openCommandBoard}
              onClose={restoreFocus => closePopover({ restoreFocus })}
            />
          )}
        </div>

        <div className="tactical-controls">
          {battle.enemyPlan && enemyPlanSummary && !assault && !hunt && battle.phase === 'command' && (
            <EnemyPlanPanel
              plan={battle.enemyPlan}
              summary={enemyPlanSummary}
              effectiveCounterStrengths={effectiveCounterStrengths}
              effectiveRearCounterZoneName={effectiveRearCounterZoneName}
            />
          )}
          {assault && !hunt && battle.lairDefensePlan &&
            (battle.phase === 'preparation' || battle.phase === 'deployment' || battle.phase === 'command') && (
            <aside className="tactical-enemy-plan tactical-lair-intel" aria-label="산채 방어 정보">
              <div className="tactical-enemy-plan-heading">
                <strong>{battle.lairDefensePlan.doctrineRevealed
                  ? `산채 교리: ${banditLairDoctrineDefinition(battle.lairDefensePlan.doctrine).label}`
                  : '산채 교리: 미확인'}</strong>
                {battle.lairDefensePlan.doctrineRevealed &&
                  <span>계책점수 {battle.lairDefensePlan.stratagemPoints}</span>}
              </div>
              {!battle.lairDefensePlan.doctrineRevealed &&
                <span className="muted small">이전 정찰 정보가 오래되었습니다.</span>}
            </aside>
          )}
          {battle.phase === 'preparation' && (
            <>
              {battle.enemyPlan && enemyPlanSummary && !assault && !hunt && (
                <EnemyPlanPanel
                  plan={battle.enemyPlan}
                  summary={enemyPlanSummary}
                  effectiveCounterStrengths={effectiveCounterStrengths}
                  effectiveRearCounterZoneName={effectiveRearCounterZoneName}
                />
              )}
              <div className="tactical-panel-heading">
                <div>
                  <strong>준비태세 선택</strong>
                  <span>남은 준비점수 {battle.prepPoints} · 선택한 태세는 실행 전까지 취소할 수 있습니다.</span>
                </div>
                <button className="btn primary" onClick={onAdvancePhase}>선택한 준비 실행</button>
              </div>
              <div className="tactical-action-grid">
                {battle.prepActions
                  .filter(action => action.id !== 'preliminaryBombardment' || countBuilt(state, 'cannonEmplacement') > 0)
                  .map(action => {
                    const unavailableReason = tacticalPreparationUnavailableReason(state, action.id);
                    const disabled = action.applied || (!action.selected && (
                      battle.prepPoints < action.cost || unavailableReason != null
                    ));
                    const counterLabels = enemyPlanCounterLabelsForAction(battle.enemyPlan, action.id);
                    return (
                      <button
                        key={action.id}
                        className={`tactical-action${action.selected ? ' selected' : ''}${action.applied ? ' applied' : ''}${counterLabels.length > 0 ? ' counters-plan' : ''}`}
                        disabled={disabled}
                        onClick={() => onSpendPreparation(action.id)}
                      >
                        <span>{action.applied ? '완료' : action.selected ? '취소' : `${action.cost}점`}</span>
                        <strong>{action.label}</strong>
                        <small>{unavailableReason ?? PREP_DESCRIPTIONS[action.id]}</small>
                        {counterLabels.length > 0 && <em>대응: {counterLabels.join(' · ')}</em>}
                      </button>
                    );
                  })}
              </div>
            </>
          )}

          {battle.phase === 'preparationExecution' && (
            <div className="tactical-simulating preparation-execution">
              <div className="tactical-loader" />
              <span>준비 실행 {Math.min(eventIndex + 1, battle.preparationEvents.length)} / {battle.preparationEvents.length}</span>
              <span className={`tactical-fast-hint${fast ? ' active' : ''}`}>
                {fast ? '배속 재생 중' : '화면 클릭 또는 스페이스로 빨리감기'}</span>
            </div>
          )}

          {battle.phase === 'deployment' && selectedGroup && (
            <>
              <div className="tactical-panel-heading">
                <div>
                  <strong>{hunt ? '사냥대 배치' : assault ? '토벌대 배치' : '수비대 배치'}</strong>
                  <span>{battle.preliminaryBombardmentCannons
                    ? `사전포격 ${battle.preliminaryBombardmentCannons}문 · 적 ${battle.preliminaryBombardmentCasualties ?? 0}명 전투불능`
                    : '부대를 고른 뒤 지킬 구역과 전열을 지정합니다.'}</span>
                </div>
                <button
                  className="btn primary"
                  disabled={huntDeploymentReason != null}
                  title={huntDeploymentReason ?? undefined}
                  onClick={onAdvancePhase}
                >전투 시작</button>
              </div>
              <UnitDock
                state={state}
                battle={battle}
                hunt={hunt}
                mode="deployment"
                selectedGroupId={selectedGroup.id}
                onSelect={selectGroup}
              />
              {hunt && battle.prepActions.filter(action =>
                action.selected && (action.id === 'placeBait' || action.id === 'setHuntTraps')).map(action => {
                const selectedZoneId = action.id === 'placeBait' ? battle.huntBaitZoneId : battle.huntTrapZoneId;
                return (
                  <div className="tactical-hunt-preparation-zone" key={action.id}>
                    <strong>{action.id === 'placeBait' ? '미끼 놓을 길목' : '함정 설치할 길목'}</strong>
                    <div role="group" aria-label={action.label}>
                      {battle.zones.filter(zone => zone.id !== 'huntDen').map(zone => (
                        <button
                          type="button"
                          key={zone.id}
                          className={selectedZoneId === zone.id ? 'active' : ''}
                          onClick={() => onSetHuntPreparationZone(
                            action.id as 'placeBait' | 'setHuntTraps',
                            zone.id,
                          )}
                        >{zone.name}</button>
                      ))}
                    </div>
                    <small>{selectedZoneId
                      ? `${battle.zones.find(zone => zone.id === selectedZoneId)?.name ?? '길목'}에 확정됨`
                      : '길목을 정해야 전투를 시작할 수 있습니다.'}</small>
                  </div>
                );
              })}
              {huntNeedsMoreGroups && (
                <div className="tactical-hunt-split-guide" role="status">
                  길목을 모두 막으려면 조를 나누십시오. 얇은 분견대는 급습에 더 취약합니다.
                </div>
              )}
              {hunt && (
                <div className="tactical-hunt-detachment-controls" role="group" aria-label="사냥대 분견대 편성">
                  <strong>분견대 편성</strong>
                  <button
                    type="button"
                    className="btn"
                    disabled={selectedGroup.count < 2 || selectedGroup.wounded > 0 || selectedGroup.killed > 0}
                    title={selectedGroup.count < 2 ? '최소 2명인 조만 나눌 수 있습니다.' : '선택한 조에서 1명을 분리합니다.'}
                    onClick={() => onSplitHuntGroup(selectedGroup.id, 1)}
                  >1명 분리</button>
                  <button
                    type="button"
                    className="btn"
                    disabled={selectedGroup.count < 2 || selectedGroup.wounded > 0 || selectedGroup.killed > 0}
                    title={selectedGroup.count < 2 ? '최소 2명인 조만 나눌 수 있습니다.' : '선택한 조를 가능한 한 반으로 나눕니다.'}
                    onClick={() => onSplitHuntGroup(selectedGroup.id, Math.floor(selectedGroup.count / 2))}
                  >반으로 나누기</button>
                  {mergeableHuntGroups.map(group => (
                    <button
                      type="button"
                      className="btn"
                      key={group.id}
                      title={`${withJosa(group.label, '을/를')} 선택한 조에 합칩니다.`}
                      onClick={() => onMergeHuntGroups(selectedGroup.id, group.id)}
                    >같은 조 합류 · {group.label}</button>
                  ))}
                </div>
              )}
              <div className="tactical-deploy-row">
                <strong>{selectedGroup.label}{selectedGroup.ambushed && <em className="tactical-state-badge ambushed">매복중</em>}</strong>
                <div className="tactical-zone-buttons" aria-label={`${selectedGroup.label} 배치 구역 선택`}>
                  {battle.zones.filter(zone => !hunt || zone.id !== 'huntDen').map(zone => (
                    <button
                      key={zone.id}
                      className={selectedGroup.zoneId === zone.id ? 'active' : ''}
                      disabled={(selectedGroup.commandable === false && selectedGroup.kind !== 'healer') ||
                        tacticalActiveDefenderCount(selectedGroup) <= 0}
                      onClick={() => {
                        onAssignGroup(selectedGroup.id, zone.id);
                        setViewedZoneId(zone.id);
                      }}
                    >{zone.name}</button>
                  ))}
                </div>
                {!hunt && (
                  <div className="tactical-line-toggle" aria-label={`${selectedGroup.label} 전열 선택`}>
                    {(['front', 'middle', 'rear'] as const).map(line => {
                      const unavailableReason = tacticalFormationLineUnavailableReason(battle, selectedGroup, line);
                      return (
                        <button
                          key={line}
                          className={selectedGroup.line === line ? 'active' : ''}
                          disabled={unavailableReason != null || tacticalActiveDefenderCount(selectedGroup) <= 0}
                          title={unavailableReason ?? (line === selectedGroup.line
                            ? '현재 전열'
                            : '배치 단계에서는 원하는 전열로 즉시 이동합니다.')}
                          onClick={() => onSetFormationLine(selectedGroup.id, line)}
                        >{line === 'front' ? '전열' : line === 'middle' ? '중열' : '후열'}</button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {battle.phase === 'command' && selectedGroup && (
            <>
              <div className="tactical-panel-heading">
                <div>
                  <strong>제{battle.round}차 교전 지휘</strong>
                  <span>현재 초점: {battle.zones.find(zone => zone.id === battle.currentZoneId)?.name}
                    {pendingCommandCount > 0 ? ` · 자동 명령 ${pendingCommandCount}개 부대` : ' · 모든 부대 직접 명령 완료'}</span>
                </div>
                <button className="btn primary" onClick={() => {
                  closePopover();
                  onResolveRound();
                }}>교전 개시</button>
              </div>
              <UnitDock
                state={state}
                battle={battle}
                hunt={hunt}
                mode="command"
                selectedGroupId={selectedGroup.id}
                onSelect={groupId => {
                  closePopover();
                  selectGroup(groupId);
                }}
              />
              {rearResponseZoneId && rearResponseOptions.length > 0 && (
                <div className="tactical-rear-response-guide" role="status">
                  <strong>{battle.zones.find(zone => zone.id === rearResponseZoneId)?.name} 후방 급습 대응</strong>
                  <div className="tactical-rear-response-options">
                    {rearResponseOptions.map(option => option.groupIds.length > 0 ? (
                      <button
                        type="button"
                        key={option.id}
                        onClick={() => {
                          closePopover();
                          selectGroup(option.groupIds[0]);
                        }}
                        title={`${option.description} 해당 부대를 선택합니다.`}
                      >
                        <b>{option.label}</b>
                        <span>{option.description}</span>
                      </button>
                    ) : (
                      <span className="tactical-rear-response-option passive" key={option.id}>
                        <b>{option.label}</b>
                        <span>{option.description}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {tacticalGroupCanReceiveCommand(selectedGroup) ? (
                <>
                  <div className="tactical-command-bar-row">
                    {hunt && (
                      <div className="tactical-hunt-sector-movement" role="group" aria-label={`${selectedGroup.label} 길목 이동`}>
                        {battle.zones.filter(zone => zone.id !== 'huntDen').map(zone => (
                          <button
                            type="button"
                            key={zone.id}
                            className={selectedGroup.zoneId === zone.id ? 'active' : ''}
                            title={selectedGroup.zoneId === zone.id
                              ? '현재 지키는 길목입니다.'
                              : '이동한 조는 이번 라운드 몰이 기여가 절반으로 줄어듭니다.'}
                            onClick={() => {
                              onAssignGroup(selectedGroup.id, zone.id);
                              setViewedZoneId(zone.id);
                            }}
                          >{zone.name}</button>
                        ))}
                        <small>이동한 조는 이번 라운드 몰이 기여가 절반입니다.</small>
                      </div>
                    )}
                    {!hunt && (
                      <div className="tactical-line-toggle" aria-label={`${selectedGroup.label} 전열 선택`}>
                        {(['front', 'middle', 'rear'] as const).map(line => {
                          const unavailableReason = tacticalFormationLineUnavailableReason(battle, selectedGroup, line);
                          return (
                            <button
                              key={line}
                              className={(selectedGroup.pendingLine ?? selectedGroup.line) === line ? 'active' : ''}
                              disabled={unavailableReason != null}
                              title={unavailableReason ?? (line === selectedGroup.line
                                ? '현재 전열'
                                : '다음 라운드 목표 전열')}
                              onClick={() => assignFormationLineTo(selectedGroup.id, line)}
                            >{line === 'front' ? '전열' : line === 'middle' ? '중열' : '후열'}</button>
                          );
                        })}
                      </div>
                    )}
                    <div
                      ref={commandBoardRef}
                      className={`tactical-command-bar${commandBoardEmphasis ? ' command-board-emphasis' : ''}`}
                      role="group"
                      aria-label={`${selectedGroup.label} 명령 선택`}
                    >
                      {tacticalSupportedCommands(battle).map(command => {
                        const unavailableReason = tacticalCommandUnavailableReason(battle, selectedGroup, command);
                        return (
                          <button
                            key={command}
                            className={selectedGroup.command === command ? 'active' : ''}
                            aria-pressed={selectedGroup.command === command}
                            disabled={unavailableReason != null}
                            title={unavailableReason ?? commandDescription(command, selectedGroup, hunt)}
                            onMouseEnter={() => setHoveredCommand(command)}
                            onMouseLeave={() => setHoveredCommand(current => (current === command ? null : current))}
                            onFocus={() => setHoveredCommand(command)}
                            onBlur={() => setHoveredCommand(current => (current === command ? null : current))}
                            onClick={() => assignCommandTo(selectedGroup.id, command)}
                          >{commandLabel(command, selectedGroup, hunt)}</button>
                        );
                      })}
                    </div>
                    {!hunt && (
                      <button
                        type="button"
                        className={`tactical-auto-target${selectedGroup.targetSource !== 'player' ? ' active' : ''}`}
                        onClick={() => onSetGroupTarget(selectedGroup.id, null)}
                        title="이 부대가 현재 교전 방향에서 자동으로 유효 표적을 선택합니다."
                      >자동 표적</button>
                    )}
                  </div>
                  <div className="tactical-command-hint">
                    {commandHint}
                  </div>
                </>
              ) : (
                <div className="tactical-command-hint">
                  {selectedGroup.commandable === false
                    ? selectedGroup.kind === 'healer'
                      ? '전술 치료반은 후열 보호 대상이며, 같은 구역의 부상자를 라운드 종료에 자동 치료합니다.'
                      : '피난 주민은 보호 대상이며 전투 명령을 받지 않습니다.'
                    : '이 부대는 전투 불능이어서 명령을 내릴 수 없습니다.'}
                </div>
              )}
            </>
          )}

          {battle.phase === 'simulating' && (
            <div className="tactical-simulating">
              <div className="tactical-loader" />
              <span>제{battle.pendingReport?.round ?? battle.round}차 교전</span>
              <span className={`tactical-fast-hint${fast ? ' active' : ''}`}>
                {fast ? '배속 재생 중 — 결과는 온전히 표시됩니다' : '화면 클릭 또는 스페이스로 빨리감기'}
              </span>
            </div>
          )}

          {battle.phase === 'report' && report && (
            <div className="tactical-report">
              <div>
                <span className="tactical-report-label">제{report.round}차 교전 보고</span>
                <h2>{report.summary}</h2>
                {report.lines.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}
              </div>
              <div className="tactical-report-numbers">
                <div><span>전사</span><strong>{report.killed}</strong></div>
                <div><span>부상</span><strong>{report.wounded}</strong></div>
                <div><span>{hunt ? '짐승 피해' : assault ? '적 피해' : '건물 위험'}</span><strong>{assault ? report.raidersKilled : report.buildingsDamaged}</strong></div>
                <div><span>{hunt ? '포위망' : assault ? '돌파 구역' : '약탈'}</span><strong>{hunt ? `${Math.round(battle.huntEncirclement ?? 0)}%` : assault ? battle.zones.filter(zone => zone.breached).length : tacticalLootText(report) || '없음'}</strong></div>
              </div>
              <button className="btn primary" onClick={onAcknowledgeReport}>
                {report.ended ? '전투 장계 확인' : '다음 교전 지휘'}
              </button>
            </div>
          )}

          {battle.phase === 'finished' && report && (
            <div className="tactical-final-report">
              <div>
                <span className="tactical-report-label">전투 장계</span>
                <h2>{report.summary}</h2>
                <p>{battle.factionName} {hunt ? '맹수 몰이사냥' : lairAssault ? '산채 공격전' : `습격 방어전 · ${battle.mode === 'levy' ? '민병 방어' : '수비병 요격'}`}</p>
              </div>
              <div className="tactical-report-numbers">
                <div><span>전사</span><strong>{finalKilled}</strong></div>
                <div><span>부상</span><strong>{finalWounded}</strong></div>
                <div><span>{hunt ? '짐승 처치' : '건물 피해'}</span><strong>{hunt ? finalEnemyKilled : finalDamaged}</strong></div>
                <div><span>{hunt ? '전리품' : '자원 피해'}</span><strong>{Object.keys(finalLoot).length > 0 ? Object.entries(finalLoot).map(([key, amount]) => `${RESOURCE_NAMES[key as keyof typeof RESOURCE_NAMES]} ${amount}`).join(', ') : '없음'}</strong></div>
              </div>
              <button className="btn primary" onClick={onFinishBattle}>{assault ? '결과 적용 후 귀환' : '상세 전투 장계 보기'}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
