import { useEffect, useMemo, useRef, useState } from 'react';
import { RESOURCE_NAMES, WEATHER_ICONS, WEATHER_NAMES } from '../game/constants';
import { countBuilt } from '../game/buildings';
import { getSeason } from '../game/seasons';
import {
  tacticalCommandDescription, tacticalCommandUnavailableReason, tacticalLootText,
  tacticalPreparationUnavailableReason,
} from '../game/tacticalBattle';
import { assaultMaxRounds } from '../game/tacticalAssault';
import { huntMaxRounds } from '../game/tacticalHunt';
import {
  nextActiveTacticalGroupId, nextPendingTacticalGroupId, pendingTacticalCommandCount,
  tacticalActiveDefenderCount, tacticalGroupCanReceiveCommand, tacticalGroupHasPendingCommand,
} from '../game/tacticalCommandState';
import type {
  GameState,
  PreparationActionId,
  TacticalAnimationEvent,
  TacticalCommandId,
  TacticalDefenderGroup,
  TacticalFormationLine,
} from '../game/types';
import { playMeleeClash, playSfx, playWeaponSalvo, playWeaponVolley, setBattleDrums, type SfxName } from '../sound/sfx';
import { TacticalGroupChip } from './tactical/TacticalGroupChip';
import { TacticalZoneColumn } from './tactical/TacticalZoneColumn';

interface Props {
  state: GameState;
  onSpendPreparation: (actionId: PreparationActionId) => void;
  onAdvancePhase: () => void;
  onAssignGroup: (groupId: string, zoneId: string) => void;
  onSetFormationLine: (groupId: string, line: TacticalFormationLine) => void;
  onSetCommand: (groupId: string, command: TacticalCommandId) => void;
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
  preliminaryBombardment: '보유한 불랑기포대로 접전 전에 포격합니다. 포대 1문당 화약 2를 소모합니다.',
  musterMilitia: '피난 주민 일부를 민병으로 소집합니다. 마을 기세가 조금 낮아집니다.',
  nightAssault: '밤이 깊기를 기다려 숲길 초기 돌파와 기습 효과를 얻습니다.',
  prepareFireArrows: '목책·움막에 화공 명령을 쓸 수 있게 하지만 노획물이 불탈 수 있습니다.',
  blockLeaderEscape: '사냥꾼 일부를 본대에서 빼 두목의 산길 퇴로에 미리 매복시킵니다.',
  lureGuards: '척후가 초병 일부를 숲길 아래로 유인해 첫 방어대의 전력과 기세를 낮춥니다.',
  setHuntTraps: '몰이 숲의 길목에 덫과 올가미를 설치해 짐승이 지나갈 때 피해를 줍니다.',
  placeBait: '고기 3을 미끼로 써 첫 교전 전에 짐승을 자동으로 드러냅니다.',
  splitDrivers: '포위망 상승이 빨라지지만 흩어진 조가 급습에 더 취약해집니다.',
};

const COMMANDS: TacticalCommandId[] = [
  'hold', 'charge', 'volley', 'ambush', 'guardStorehouse', 'protectCivilians', 'fallback', 'advance',
  'arson', 'blockEscape', 'openRetreat',
];

const COMMAND_LABELS: Record<TacticalCommandId, string> = {
  hold: '고수',
  charge: '돌격',
  volley: '일제 사격',
  ambush: '매복',
  guardStorehouse: '창고 사수',
  protectCivilians: '주민 보호',
  fallback: '후퇴',
  advance: '전진',
  arson: '방화',
  blockEscape: '퇴로 차단',
  openRetreat: '자진 철수',
};

function commandLabel(command: TacticalCommandId, group: TacticalDefenderGroup, hunt = false): string {
  if (hunt) {
    if (command === 'hold') return '창벽';
    if (command === 'volley') return '사격 대기';
    if (command === 'advance') return '몰이';
    if (command === 'ambush') return '길목 매복';
    if (command === 'charge') return '창 돌입';
    if (command === 'fallback') return '포위 유지';
    if (command === 'openRetreat') return '사냥 중지';
  }
  return command === 'ambush' && group.ambushed ? '급습' : COMMAND_LABELS[command];
}

function commandDescription(command: TacticalCommandId, group: TacticalDefenderGroup, hunt: boolean): string {
  if (!hunt) return tacticalCommandDescription(command, group.ambushed);
  if (command === 'hold') return '창과 방패를 세워 짐승 급습 피해를 줄입니다.';
  if (command === 'volley') return '짐승이 모습을 드러내는 순간 활과 조총을 집중합니다.';
  if (command === 'advance') return '소리와 불빛으로 짐승을 밀어 포위망을 빠르게 좁힙니다.';
  if (command === 'ambush') return '사냥꾼이 달아날 길목을 지키며 우두머리를 노립니다.';
  if (command === 'charge') return '발각된 짐승에게 근접 조가 창으로 돌입합니다.';
  if (command === 'fallback') return '무리한 공격을 피하고 현재 포위선을 유지합니다.';
  if (command === 'openRetreat') return '사냥을 중지하고 맹수 위협을 남긴 채 귀환합니다.';
  return tacticalCommandDescription(command, group.ambushed);
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

export function TacticalBattleScreen({
  state,
  onSpendPreparation,
  onAdvancePhase,
  onAssignGroup,
  onSetFormationLine,
  onSetCommand,
  onResolveRound,
  onCompleteSimulation,
  onAcknowledgeReport,
  onFinishBattle,
}: Props) {
  const battle = state.tacticalBattle;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(() => battle
    ? nextActiveTacticalGroupId(battle.defenderGroups, null) ?? battle.defenderGroups[0]?.id ?? null
    : null);
  const [hoveredCommand, setHoveredCommand] = useState<TacticalCommandId | null>(null);
  const [eventIndex, setEventIndex] = useState(0);
  const [viewedZoneId, setViewedZoneId] = useState(battle?.currentZoneId ?? 'approach');
  const [stingerRound, setStingerRound] = useState<number | null>(null);
  const [fast, setFast] = useState(false);
  const fastRef = useRef(false);
  const preparationPlayback = battle?.phase === 'preparationExecution';
  const combatPlayback = battle?.phase === 'simulating';
  const playbackActive = preparationPlayback || combatPlayback;
  const activeEvent = preparationPlayback
    ? battle.preparationEvents[eventIndex] ?? null
    : combatPlayback ? battle.pendingReport?.events[eventIndex] ?? null : null;
  const activeZoneId = activeEvent?.zoneId ?? viewedZoneId;

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
        timer = window.setTimeout(onAdvancePhase, 360);
        return;
      }
      setEventIndex(index);
      playTacticalEventSfx(events[index]);
      const duration = fastRef.current ? Math.min(180, events[index].durationMs) : events[index].durationMs;
      timer = window.setTimeout(() => play(index + 1), duration);
    };
    setEventIndex(0);
    timer = window.setTimeout(() => play(0), 260);
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
        timer = window.setTimeout(onCompleteSimulation, 240);
        return;
      }
      setEventIndex(index);
      playTacticalEventSfx(events[index]);
      // 배속 중에도 마지막(결과) 이벤트는 온전한 길이로 보여준다
      const duration = fastRef.current && index < events.length - 1
        ? Math.min(150, events[index].durationMs)
        : events[index].durationMs;
      timer = window.setTimeout(() => play(index + 1), duration);
    };
    // 라운드 스팅어 배너 + 북 1타 뒤에 이벤트 재생을 시작한다
    setStingerRound(round);
    playSfx('raidDrum');
    timer = window.setTimeout(() => {
      setStingerRound(null);
      play(0);
    }, 820);
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
  }, [battle?.currentZoneId]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const zone = viewport?.querySelector<HTMLElement>(`[data-zone-id="${activeZoneId}"]`);
    if (!viewport || !zone) return;
    viewport.scrollTo({
      left: Math.max(0, zone.offsetLeft - (viewport.clientWidth - zone.clientWidth) / 2),
      behavior: 'smooth',
    });
  }, [activeZoneId]);

  const selectedGroup = useMemo(
    () => battle?.defenderGroups.find(group => group.id === selectedGroupId) ??
      battle?.defenderGroups.find(tacticalGroupCanReceiveCommand) ?? battle?.defenderGroups[0] ?? null,
    [battle?.defenderGroups, selectedGroupId],
  );

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

  if (!battle) return null;
  const assault = battle.orientation === 'assault';
  const hunt = battle.assaultKind === 'predatorHunt';
  const lairAssault = assault && !hunt;
  const roundLimit = hunt ? huntMaxRounds() : assault ? assaultMaxRounds() : 5;
  const commandable = battle.phase === 'command' || battle.phase === 'deployment';
  const pendingCommandCount = pendingTacticalCommandCount(battle.defenderGroups);
  const hintCommand = hoveredCommand ?? selectedGroup?.command ?? null;
  const commandHint = selectedGroup && hintCommand
    ? `${commandLabel(hintCommand, selectedGroup, hunt)} — ${tacticalCommandUnavailableReason(battle, selectedGroup, hintCommand) ?? commandDescription(hintCommand, selectedGroup, hunt)}`
    : '명령 단추 위에 올리면 설명이 여기에 표시됩니다.';
  // 첫 명령 지정이면 아직 명령 대기 중인 다음 부대로 선택을 넘겨 클릭 수를 줄인다
  const assignCommand = (command: TacticalCommandId) => {
    if (!selectedGroup || !tacticalGroupCanReceiveCommand(selectedGroup)) return;
    const firstAssignment = selectedGroup.commandSource !== 'player';
    onSetCommand(selectedGroup.id, command);
    if (!firstAssignment) return;
    const nextId = nextPendingTacticalGroupId(battle.defenderGroups, selectedGroup.id);
    if (nextId) selectGroup(nextId);
  };
  const season = getSeason(state.day);
  const wallRepairApplied = battle.prepActions.some(action => action.id === 'repairWall' && action.applied);
  const fortifyEventIndex = battle.preparationEvents.findIndex(event => event.kind === 'fortify' && event.zoneId === 'wall');
  const barricadeReinforced = wallRepairApplied && (
    !preparationPlayback || fortifyEventIndex < 0 || eventIndex >= fortifyEventIndex
  );
  const plannedRearManeuver = battle.enemyPlan?.stratagems.find(stratagem => stratagem.id === 'rearManeuver');
  const legacyScoutedFlankers = battle.enemyPlan == null
    ? battle.raiderGroups.find(group => group.kind === 'flankers' && group.flankPlanRevealed)
    : undefined;
  const flankerIntel = battle.enemyPlan
    ? plannedRearManeuver
      ? plannedRearManeuver.revealed
        ? '정찰 보고: 적 우회대가 방어선 뒤편을 노리는 듯합니다.'
        : null
      : battle.enemyPlan.objectiveRevealed
        ? '정찰 보고: 적 우회대가 마을 안쪽으로 파고들 낌새입니다.'
        : null
    : legacyScoutedFlankers?.flankPlan === 'rearAssault'
      ? '정찰 보고: 적 우회대가 방어선 뒤편을 노리는 듯합니다.'
      : legacyScoutedFlankers
        ? '정찰 보고: 적 우회대가 마을 안쪽으로 파고들 낌새입니다.'
        : null;
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
      <div className={`tactical-screen${assault ? ' assault' : ' defense'}${hunt ? ' hunt' : ''}${activeEvent?.kind === 'wallAssault' || activeEvent?.kind === 'wallHit' || activeEvent?.kind === 'bombardment' || activeEvent?.kind === 'zoneFall' || activeEvent?.kind === 'artilleryHit' || activeEvent?.kind === 'beastAmbush' ? ' shaking' : ''}`}>
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

        <div className="tactical-stage-shell" onClick={enableFastForward}>
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
                  onSelectGroup={selectGroup}
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
          <div className="tactical-stage-index">
            <strong>{battle.zones[activeZoneIndex]?.name}</strong>
            <span>{activeZoneIndex + 1} / {battle.zones.length}</span>
          </div>
          {activeEvent?.text && <TypewriterCaption text={activeEvent.text} instant={fast} />}
        </div>

        <div className="tactical-controls">
          {battle.phase === 'preparation' && (
            <>
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
                    return (
                      <button
                        key={action.id}
                        className={`tactical-action${action.selected ? ' selected' : ''}${action.applied ? ' applied' : ''}`}
                        disabled={disabled}
                        onClick={() => onSpendPreparation(action.id)}
                      >
                        <span>{action.applied ? '완료' : action.selected ? '취소' : `${action.cost}점`}</span>
                        <strong>{action.label}</strong>
                        <small>{unavailableReason ?? PREP_DESCRIPTIONS[action.id]}</small>
                      </button>
                    );
                  })}
              </div>
            </>
          )}

          {battle.phase === 'preparationExecution' && (
            <div className="tactical-simulating preparation-execution">
              <div className="tactical-loader" />
              <strong>{activeEvent?.text ?? '선택한 준비태세를 실행하고 있습니다.'}</strong>
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
                    : '부대를 고른 뒤 지킬 구역과 전열을 지정합니다.'}{flankerIntel ? ` · ${flankerIntel}` : ''}</span>
                </div>
                <button className="btn primary" onClick={onAdvancePhase}>전투 시작</button>
              </div>
              <UnitDock
                state={state}
                battle={battle}
                hunt={hunt}
                mode="deployment"
                selectedGroupId={selectedGroup.id}
                onSelect={selectGroup}
              />
              <div className="tactical-deploy-row">
                <strong>{selectedGroup.label}{selectedGroup.ambushed && <em className="tactical-state-badge ambushed">매복중</em>}</strong>
                <div className="tactical-zone-buttons" aria-label={`${selectedGroup.label} 배치 구역 선택`}>
                  {battle.zones.map(zone => (
                    <button
                      key={zone.id}
                      className={selectedGroup.zoneId === zone.id ? 'active' : ''}
                      disabled={selectedGroup.commandable === false || tacticalActiveDefenderCount(selectedGroup) <= 0}
                      onClick={() => {
                        onAssignGroup(selectedGroup.id, zone.id);
                        setViewedZoneId(zone.id);
                      }}
                    >{zone.name}</button>
                  ))}
                </div>
                <div className="tactical-line-toggle" aria-label={`${selectedGroup.label} 전열 선택`}>
                  {(['front', 'rear'] as const).map(line => (
                    <button
                      key={line}
                      className={selectedGroup.line === line ? 'active' : ''}
                      disabled={selectedGroup.commandable === false || tacticalActiveDefenderCount(selectedGroup) <= 0}
                      onClick={() => onSetFormationLine(selectedGroup.id, line)}
                    >{line === 'front' ? '전열' : '후열'}</button>
                  ))}
                </div>
              </div>
            </>
          )}

          {battle.phase === 'command' && selectedGroup && (
            <>
              <div className="tactical-panel-heading">
                <div>
                  <strong>제{battle.round}차 교전 지휘</strong>
                  <span>현재 초점: {battle.zones.find(zone => zone.id === battle.currentZoneId)?.name}
                    {pendingCommandCount > 0 ? ` · 명령 대기 ${pendingCommandCount}개 부대` : ' · 모든 부대 명령 지정 완료'}</span>
                </div>
                <button className="btn primary" onClick={onResolveRound}>교전 개시</button>
              </div>
              <UnitDock
                state={state}
                battle={battle}
                hunt={hunt}
                mode="command"
                selectedGroupId={selectedGroup.id}
                onSelect={selectGroup}
              />
              {tacticalGroupCanReceiveCommand(selectedGroup) ? (
                <>
                  <div className="tactical-command-bar-row">
                    <div className="tactical-line-toggle" aria-label={`${selectedGroup.label} 전열 선택`}>
                      {(['front', 'rear'] as const).map(line => (
                        <button
                          key={line}
                          className={selectedGroup.line === line ? 'active' : ''}
                          onClick={() => onSetFormationLine(selectedGroup.id, line)}
                        >{line === 'front' ? '전열' : '후열'}</button>
                      ))}
                    </div>
                    <div className="tactical-command-bar" role="group" aria-label={`${selectedGroup.label} 명령 선택`}>
                      {COMMANDS.map(command => {
                        const unavailableReason = tacticalCommandUnavailableReason(battle, selectedGroup, command);
                        return (
                          <button
                            key={command}
                            className={selectedGroup.command === command ? 'active' : ''}
                            disabled={unavailableReason != null}
                            title={unavailableReason ?? commandDescription(command, selectedGroup, hunt)}
                            onMouseEnter={() => setHoveredCommand(command)}
                            onMouseLeave={() => setHoveredCommand(current => (current === command ? null : current))}
                            onFocus={() => setHoveredCommand(command)}
                            onBlur={() => setHoveredCommand(current => (current === command ? null : current))}
                            onClick={() => assignCommand(command)}
                          >{commandLabel(command, selectedGroup, hunt)}</button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="tactical-command-hint">{commandHint}</div>
                </>
              ) : (
                <div className="tactical-command-hint">
                  {selectedGroup.commandable === false
                    ? '피난 주민은 보호 대상이며 전투 명령을 받지 않습니다.'
                    : '이 부대는 전투 불능이어서 명령을 내릴 수 없습니다.'}
                </div>
              )}
            </>
          )}

          {battle.phase === 'simulating' && (
            <div className="tactical-simulating">
              <div className="tactical-loader" />
              <strong>{activeEvent?.text ?? '전황을 살피는 중입니다.'}</strong>
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
