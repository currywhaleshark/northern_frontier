import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { RESOURCE_NAMES, WEATHER_ICONS, WEATHER_NAMES } from '../game/constants';
import { countBuilt } from '../game/buildings';
import { getSeason } from '../game/seasons';
import {
  tacticalCommandDescription, tacticalCommandUnavailableReason, tacticalLootText,
  tacticalPreparationUnavailableReason,
} from '../game/tacticalBattle';
import type {
  DefenderGroupKind,
  GameState,
  PreparationActionId,
  TacticalAnimationEvent,
  TacticalCommandId,
  TacticalDefenderGroup,
  RaiderUnitType,
} from '../game/types';
import { tacticalBackgroundAsset } from '../render/tacticalBackgroundAssets';
import {
  TACTICAL_CHARACTER_SHEET, TACTICAL_COURT_ARMY_SHEET, TACTICAL_MILITIA_SHEET,
  TACTICAL_RAIDER_SHEET, tacticalRaiderColumn,
} from '../render/tacticalCharacterAssets';
import { playSfx, setBattleDrums, type SfxName } from '../sound/sfx';

interface Props {
  state: GameState;
  onSpendPreparation: (actionId: PreparationActionId) => void;
  onAdvancePhase: () => void;
  onAssignGroup: (groupId: string, zoneId: string) => void;
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
};

const COMMANDS: TacticalCommandId[] = [
  'hold', 'charge', 'volley', 'ambush', 'guardStorehouse', 'protectCivilians', 'fallback', 'advance',
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
  counterattack: '반격',
  openRetreat: '퇴로 개방',
};

function commandLabel(command: TacticalCommandId, group: TacticalDefenderGroup): string {
  return command === 'ambush' && group.ambushed ? '급습' : COMMAND_LABELS[command];
}

// 연출 이벤트 종류별 효과음 매핑 — camera/report처럼 소리가 없는 이벤트는 생략
const EVENT_SFX: Partial<Record<TacticalAnimationEvent['kind'], SfxName>> = {
  bombardment: 'wallHit',
  fortify: 'hammer',
  prepareAmbush: 'ambush',
  readyVolley: 'good',
  muster: 'welcome',
  evacuate: 'raidDrum',
  conceal: 'good',
  volley: 'volley',
  melee: 'melee',
  ambush: 'ambush',
  casualty: 'casualty',
  wallHit: 'wallHit',
  moraleBreak: 'moraleBreak',
  loot: 'lootCrash',
  advance: 'raidDrum',
  retreat: 'raidDrum',
};

// 일제 사격 명령이 유효한 원거리 병종 — volley 이벤트 때 반동 모션을 준다
const RANGED_KINDS = new Set<DefenderGroupKind>(['militia-bow', 'militia-musket']);
const MELEE_FORMATION_KINDS = new Set<DefenderGroupKind>(['militia-spear', 'militia-unarmed', 'watchman']);
const RANGED_FORMATION_KINDS = new Set<DefenderGroupKind>(['militia-bow', 'militia-musket', 'hunter']);

function defenderFormationRole(kind: DefenderGroupKind): 'melee' | 'ranged' | 'civilian' {
  if (MELEE_FORMATION_KINDS.has(kind)) return 'melee';
  if (RANGED_FORMATION_KINDS.has(kind)) return 'ranged';
  return 'civilian';
}

function defenderFormationOrder(kind: DefenderGroupKind): number {
  const role = defenderFormationRole(kind);
  return role === 'melee' ? 0 : role === 'ranged' ? 1 : 2;
}

const KIND_COLUMNS: Partial<Record<DefenderGroupKind, number>> = {
  'militia-unarmed': 9,
  watchman: 8,
  hunter: 2,
  civilian: 0,
};

const WEAPON_COLUMNS: Partial<Record<DefenderGroupKind, number>> = {
  'militia-spear': 0,
  'militia-bow': 1,
  'militia-musket': 2,
};

function DefenderSprite({ kind, gender, faded = false, falling = false }: {
  kind: DefenderGroupKind;
  gender: 'male' | 'female';
  faded?: boolean;
  falling?: boolean;
}) {
  const weaponColumn = WEAPON_COLUMNS[kind];
  const row = gender === 'female' ? 1 : 0;
  const isWeapon = weaponColumn != null;
  const column = isWeapon ? weaponColumn : KIND_COLUMNS[kind] ?? 0;
  const sheet = isWeapon ? TACTICAL_MILITIA_SHEET : TACTICAL_CHARACTER_SHEET;
  const sheetWidth = isWeapon
    ? TACTICAL_MILITIA_SHEET.columns * TACTICAL_MILITIA_SHEET.residentWidth
    : TACTICAL_CHARACTER_SHEET.residentColumns * TACTICAL_CHARACTER_SHEET.residentWidth + TACTICAL_CHARACTER_SHEET.mountedWidth;
  return (
    <span
      className={`tactical-sprite tactical-defender${faded ? ' faded' : ''}${falling ? ' falling' : ''}`}
      style={{
        backgroundImage: `url(${sheet.src})`,
        backgroundPosition: `${-column * sheet.residentWidth}px ${-row * sheet.spriteHeight}px`,
        backgroundSize: `${sheetWidth}px ${sheet.rows * sheet.spriteHeight}px`,
      }}
      aria-hidden="true"
    />
  );
}

const COURT_UNIT_COLUMNS: Partial<Record<RaiderUnitType, number>> = {
  'court-gunner': 0,
  'court-archer': 1,
  'court-melee': 2,
  'court-cavalry': 3,
  'court-artillery': 4,
};

function CourtRaiderSprite({ unitType, falling }: { unitType: RaiderUnitType; falling: boolean }) {
  const column = COURT_UNIT_COLUMNS[unitType] ?? 0;
  return (
    <span
      className={`tactical-sprite tactical-court-raider unit-${unitType}${falling ? ' falling' : ''}`}
      style={{
        backgroundImage: `url(${TACTICAL_COURT_ARMY_SHEET.src})`,
        backgroundPosition: `${-column * TACTICAL_COURT_ARMY_SHEET.spriteWidth}px 0px`,
        backgroundSize: `${TACTICAL_COURT_ARMY_SHEET.columns * TACTICAL_COURT_ARMY_SHEET.spriteWidth}px ${TACTICAL_COURT_ARMY_SHEET.spriteHeight}px`,
      }}
      aria-hidden="true"
    />
  );
}

function RaiderSprite({ faction, unitType, hidden, offset, falling = false }: {
  faction: string;
  unitType?: RaiderUnitType;
  hidden: boolean;
  offset: number;
  falling?: boolean;
}) {
  if (!hidden && faction === '조정 토벌군' && unitType?.startsWith('court-')) {
    return <CourtRaiderSprite unitType={unitType} falling={falling} />;
  }
  const column = tacticalRaiderColumn(faction);
  if (hidden || column == null) return (
    <span
      className="tactical-raider-unknown"
      style={{ marginLeft: offset > 0 ? -52 : 0, marginBottom: (offset % 3) * 4 }}
      aria-hidden="true"
    >?</span>
  );
  return (
    <span
      className={`tactical-sprite tactical-raider${falling ? ' falling' : ''}`}
      style={{
        backgroundImage: `url(${TACTICAL_RAIDER_SHEET.src})`,
        backgroundPosition: `${-column * TACTICAL_RAIDER_SHEET.spriteWidth}px 0px`,
        backgroundSize: `${TACTICAL_RAIDER_SHEET.columns * TACTICAL_RAIDER_SHEET.spriteWidth}px ${TACTICAL_RAIDER_SHEET.spriteHeight}px`,
        marginLeft: offset > 0 ? -140 : 0,
        marginBottom: (offset % 3) * 4,
      }}
      aria-hidden="true"
    />
  );
}

function formationDimensions(
  count: number,
  spriteWidth: number,
  spriteHeight: number,
  xStep: number,
  yStep: number,
  maxColumns: number,
): { columns: number; rows: number; width: number; height: number } {
  const columns = Math.max(1, Math.min(maxColumns, count, Math.ceil(Math.sqrt(Math.max(1, count) * 1.5))));
  const rows = Math.max(1, Math.ceil(Math.max(1, count) / columns));
  return {
    columns,
    rows,
    width: spriteWidth + (columns - 1) * xStep,
    height: spriteHeight + (rows - 1) * yStep,
  };
}

function formationSlotStyle(
  index: number,
  count: number,
  spriteWidth: number,
  spriteHeight: number,
  xStep: number,
  yStep: number,
  maxColumns: number,
): CSSProperties {
  const formation = formationDimensions(count, spriteWidth, spriteHeight, xStep, yStep, maxColumns);
  const row = Math.floor(index / formation.columns);
  const column = index % formation.columns;
  const rowCount = Math.min(formation.columns, count - row * formation.columns);
  const rowWidth = spriteWidth + (rowCount - 1) * xStep;
  const rowInset = (formation.width - rowWidth) / 2;
  const jitterX = ((index * 17) % 7) - 3;
  const jitterY = ((index * 11) % 5) - 2;
  return {
    left: rowInset + column * xStep + jitterX,
    bottom: (formation.rows - 1 - row) * yStep + jitterY,
    zIndex: 20 + row * formation.columns + column,
  };
}

function GroupSprites({ state, group, falling = 0, maxVisible = 4, showAll = false }: {
  state: GameState;
  group: TacticalDefenderGroup;
  falling?: number; // 지금 재생 중인 피해 이벤트로 쓰러지는 인원 — 그만큼 추가로 그려 쓰러뜨린다
  maxVisible?: number;
  showAll?: boolean;
}) {
  const active = Math.max(0, group.count - group.wounded - group.killed);
  const shown = showAll ? active : Math.min(maxVisible, active);
  const fallingShown = showAll ? falling : Math.min(2, falling);
  const gender = (index: number) => {
    const residentId = group.residentIds[index];
    return state.residents.find(resident => resident.id === residentId)?.gender ?? (index % 2 ? 'female' : 'male');
  };
  if (showAll && shown + fallingShown > 0) {
    const total = shown + fallingShown;
    const formation = formationDimensions(total, 84, 120, 20, 13, 6);
    return (
      <div
        className="tactical-unit-line full-formation"
        style={{ width: formation.width, height: formation.height }}
        aria-label={`${group.label} ${active}명 전투 가능`}
      >
        {Array.from({ length: shown }, (_, index) => (
          <span
            className="tactical-formation-slot defender-slot"
            style={formationSlotStyle(index, total, 84, 120, 20, 13, 6)}
            key={`${group.id}-${index}`}
          >
            <DefenderSprite kind={group.kind} gender={gender(index)} />
          </span>
        ))}
        {Array.from({ length: fallingShown }, (_, index) => (
          <span
            className="tactical-formation-slot defender-slot"
            style={formationSlotStyle(shown + index, total, 84, 120, 20, 13, 6)}
            key={`${group.id}-fall-${index}`}
          >
            <DefenderSprite kind={group.kind} gender={gender(shown + index)} falling />
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className={`tactical-unit-line${showAll ? ' full-formation' : ''}`} aria-label={`${group.label} ${active}명 전투 가능`}>
      {Array.from({ length: shown }, (_, index) => (
        <DefenderSprite key={`${group.id}-${index}`} kind={group.kind} gender={gender(index)} />
      ))}
      {Array.from({ length: fallingShown }, (_, index) => (
        <DefenderSprite key={`${group.id}-fall-${index}`} kind={group.kind} gender={gender(shown + index)} falling />
      ))}
      {active > shown && <span className="tactical-unit-more">+{active - shown}</span>}
      {active === 0 && fallingShown === 0 && <span className="tactical-unit-none">전투 불능</span>}
    </div>
  );
}

function zoneEffects(zoneId: string, battle: NonNullable<GameState['tacticalBattle']>): string[] {
  const active = new Set(battle.prepActions.filter(action => action.applied).map(action => action.id));
  const labels: string[] = [];
  if (zoneId === 'approach' && active.has('setAmbush')) labels.push('사냥꾼 매복 배치');
  if (zoneId === 'approach' && active.has('preliminaryBombardment')) {
    labels.push(`사전포격 ${battle.preliminaryBombardmentCannons ?? 0}문`);
  }
  if (zoneId === 'wall' && active.has('repairWall')) labels.push('응급 수리');
  if (zoneId === 'wall' && active.has('prepareVolley')) labels.push('사격 준비');
  if (zoneId === 'storehouse' && active.has('hideSupplies')) labels.push('물자 은닉');
  if (zoneId === 'center' && active.has('evacuateCivilians')) labels.push('주민 대피');
  return labels;
}

function eventClass(event: TacticalAnimationEvent | null, zoneId: string): string {
  if (!event || event.zoneId !== zoneId) return '';
  return ` event-${event.kind}`;
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

// 누적 피해 자국의 결정적 배치 — 같은 구역·순번이면 항상 같은 자리에 남는다
function scarStyle(zoneId: string, index: number): CSSProperties {
  const seed = (zoneId.charCodeAt(0) + zoneId.length * 7) * 31 + index * 53;
  return {
    left: `${14 + (seed * 13) % 70}%`,
    bottom: `${26 + (seed * 29) % 48}px`,
    transform: `rotate(${(seed * 17) % 72 - 36}deg)`,
  };
}

export function TacticalBattleScreen({
  state,
  onSpendPreparation,
  onAdvancePhase,
  onAssignGroup,
  onSetCommand,
  onResolveRound,
  onCompleteSimulation,
  onAcknowledgeReport,
  onFinishBattle,
}: Props) {
  const battle = state.tacticalBattle;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(battle?.defenderGroups[0]?.id ?? null);
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
      const sfx = EVENT_SFX[events[index].kind];
      if (sfx) playSfx(sfx);
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
      const sfx = EVENT_SFX[events[index].kind];
      if (sfx) playSfx(sfx);
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
    () => battle?.defenderGroups.find(group => group.id === selectedGroupId) ?? battle?.defenderGroups[0] ?? null,
    [battle?.defenderGroups, selectedGroupId],
  );

  if (!battle) return null;
  const season = getSeason(state.day);
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
  const finalDamaged = battle.reports.reduce((sum, item) => sum + item.buildingsDamaged, 0);

  // 구역별 누적 피해 자국 — 지나간 라운드 전체 + 지금 재생 중인 라운드는 재생된 이벤트까지만
  const zoneScarCounts: Record<string, number> = {};
  for (const roundReport of battle.reports) {
    const isLive = battle.phase === 'simulating' && roundReport === battle.pendingReport;
    roundReport.events.forEach((item, index) => {
      if (item.kind !== 'casualty') return;
      if (isLive && index > eventIndex) return;
      zoneScarCounts[item.zoneId] = (zoneScarCounts[item.zoneId] ?? 0) + 1;
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
    <div className="tactical-overlay" role="dialog" aria-modal="true" aria-label={`${battle.factionName} 습격 직접 지휘`}>
      <div className={`tactical-screen${activeEvent?.kind === 'wallHit' || activeEvent?.kind === 'bombardment' ? ' shaking' : ''}`}>
        <header className="tactical-header">
          <div>
            <div className="tactical-kicker">습격 방어 지휘</div>
            <h1>{battle.factionName}</h1>
          </div>
          <div className="tactical-status-row">
            <div><span>교전</span><strong>{Math.min(roundLabel, 5)} / 5</strong></div>
            <div className="tactical-morale-board">
              <div className="tactical-morale-row village">
                <span>우리 기세</span>
                <div className="tactical-morale-gauge" aria-label={`우리 기세 ${Math.round(battle.villageMorale)}`}>
                  <i style={{ width: `${battle.villageMorale}%` }} />
                </div>
                <strong>{Math.round(battle.villageMorale)}</strong>
              </div>
              <div className="tactical-morale-row raiders">
                <span>적 기세</span>
                <div className="tactical-morale-gauge" aria-label={`적 기세 ${Math.round(battle.raiderMorale)}`}>
                  <i style={{ width: `${battle.raiderMorale}%` }} />
                </div>
                <strong>{Math.round(battle.raiderMorale)}</strong>
              </div>
            </div>
            <div><span>준비점수</span><strong>{battle.prepPoints}</strong></div>
            <div><span>전황</span><strong>{battle.warned ? '경보됨' : '기습'}</strong></div>
            <div><span>날씨</span><strong>{WEATHER_ICONS[state.weather]} {WEATHER_NAMES[state.weather]}</strong></div>
          </div>
        </header>

        <div className="tactical-stage-shell" onClick={enableFastForward}>
          <div className="tactical-battlefield" ref={viewportRef}>
            <div className="tactical-strip">
              {battle.zones.map(zone => {
              const defenders = battle.defenderGroups
                .filter(group => group.zoneId === zone.id)
                .sort((a, b) => defenderFormationOrder(a.kind) - defenderFormationOrder(b.kind));
              const raiders = battle.raiderGroups.filter(group => group.zoneId === zone.id && group.intent !== 'withdraw');
              const effects = zoneEffects(zone.id, battle);
              const zoneVolley = activeEvent?.kind === 'volley' && activeEvent.zoneId === zone.id;
              const zoneBombardment = activeEvent?.kind === 'bombardment' && activeEvent.zoneId === zone.id;
              const musketsFiring = zoneVolley && defenders.some(group =>
                group.kind === 'militia-musket' && group.count - group.wounded - group.killed > 0);
              const scars = Math.min(9, zoneScarCounts[zone.id] ?? 0);
              const liveBreachEventIndex = battle.phase === 'simulating'
                ? battle.pendingReport?.events.findIndex(item =>
                  item.zoneId === zone.id && item.side === 'defender' &&
                  (item.kind === 'wallHit' || item.float === '돌파!')) ?? -1
                : -1;
              const visibleBreached = zone.breached &&
                (liveBreachEventIndex < 0 || eventIndex >= liveBreachEventIndex);
              const raidersAdvancing = activeEvent?.kind === 'advance' &&
                activeEvent.zoneId === zone.id && activeEvent.side !== 'defender';
              return (
                <section
                  key={zone.id}
                  data-zone-id={zone.id}
                  className={`tactical-zone zone-${zone.kind}${zone.id === activeZoneId ? ' focused' : ''}${visibleBreached ? ' breached' : ''}${raidersAdvancing ? ' moving-raiders' : ''}${eventClass(activeEvent, zone.id)}`}
                  style={{ backgroundImage: `url(${tacticalBackgroundAsset(zone.kind, season)})` }}
                >
                  <div className="tactical-zone-heading">
                    <div>
                      <strong>{zone.name}</strong>
                      <span>{visibleBreached ? '돌파됨' : `압박 ${Math.round(zone.pressure)}`}</span>
                    </div>
                    <div className="tactical-pressure" aria-label={`압박 ${Math.round(zone.pressure)}`}>
                      <i style={{ width: `${zone.pressure}%` }} />
                    </div>
                  </div>
                  <div className="tactical-prep-tags">
                    {effects.map(label => <span key={label}>{label}</span>)}
                  </div>
                  {scars > 0 && (
                    <div className="tactical-scar-layer" aria-hidden="true">
                      {Array.from({ length: scars }, (_, index) => (
                        <span key={index} className="tactical-scar" style={scarStyle(zone.id, index)} />
                      ))}
                    </div>
                  )}
                  {visibleBreached && (
                    <div className="tactical-ruin-layer" aria-hidden="true">
                      <span className="ruin-ember" />
                      <span className="ruin-smoke" style={{ left: '24%' }} />
                      <span className="ruin-smoke" style={{ left: '47%', animationDelay: '1.4s' }} />
                      <span className="ruin-smoke" style={{ left: '68%', animationDelay: '2.6s' }} />
                    </div>
                  )}
                  {zoneVolley && (
                    <div className="tactical-fx-layer" key={`fx-${eventIndex}`} aria-hidden="true">
                      {Array.from({ length: 5 }, (_, index) => (
                        <span
                          key={index}
                          className="fx-arrow"
                          style={{ animationDelay: `${index * 60}ms`, bottom: `${168 + (index * 23) % 60}px` }}
                        />
                      ))}
                      {musketsFiring && (
                        <>
                          <span className="fx-muzzle-flash" />
                          <span className="fx-smoke" style={{ left: '52%' }} />
                          <span className="fx-smoke" style={{ left: '57%', animationDelay: '130ms' }} />
                          <span className="fx-smoke" style={{ left: '54%', animationDelay: '270ms' }} />
                        </>
                      )}
                    </div>
                  )}
                  {zoneBombardment && (
                    <div className="tactical-fx-layer bombardment" key={`bombardment-${eventIndex}`} aria-hidden="true">
                      {Array.from({ length: Math.max(1, battle.preliminaryBombardmentCannons ?? 1) }, (_, index) => (
                        <span key={index}>
                          <i
                            className="fx-cannon-flash"
                            style={{ animationDelay: `${index * 95}ms`, right: `${11 + (index % 4) * 3}%` }}
                          />
                          <i
                            className="fx-cannon-shell"
                            style={{ animationDelay: `${index * 95}ms`, bottom: `${150 + (index % 3) * 18}px` }}
                          />
                          <i
                            className="fx-explosion"
                            style={{ animationDelay: `${430 + index * 95}ms`, left: `${13 + (index * 17) % 31}%` }}
                          />
                        </span>
                      ))}
                    </div>
                  )}
                  {zone.kind === 'wall' && (
                    <div
                      className={`tactical-barricade${visibleBreached ? ' destroyed' : ''}${activeEvent?.kind === 'wallHit' && activeEvent.zoneId === zone.id ? ' breaking' : ''}${activeEvent?.kind === 'fortify' && activeEvent.zoneId === zone.id ? ' fortifying' : ''}`}
                      aria-label={visibleBreached ? '파괴된 방책' : '방어선 방책'}
                    >
                      <b>{visibleBreached ? '방책 파괴' : '방책'}</b>
                      {Array.from({ length: 7 }, (_, index) => <i key={index} />)}
                    </div>
                  )}
                  <div className="tactical-raider-rank">
                    {raiders.map(raider => {
                      const activeRaiders = Math.max(0, raider.count - raider.killed);
                      const fallingRaiders = raider.revealed && activeEvent?.kind === 'casualty' && activeEvent.groupId === raider.id
                        ? activeEvent.casualties ?? 0 : 0;
                      const totalRaiders = activeRaiders + fallingRaiders;
                      const formation = formationDimensions(totalRaiders, 168, 120, 22, 14, 5);
                      return (
                        <div
                          className={`tactical-raider-group${raider.unitType ? ` unit-${raider.unitType}` : ''}${raider.confused ? ' confused' : ''}`}
                          key={raider.id}
                        >
                          <div
                            className="tactical-raider-sprites clustered"
                            style={{ width: formation.width, height: formation.height }}
                            aria-label={`${raider.label} ${activeRaiders}명`}
                          >
                            {Array.from({ length: activeRaiders }, (_, spriteIndex) => (
                              <span
                                className="tactical-formation-slot raider-slot"
                                style={formationSlotStyle(spriteIndex, totalRaiders, 168, 120, 22, 14, 5)}
                                key={`${raider.id}-${spriteIndex}`}
                              >
                                <RaiderSprite faction={battle.factionName} unitType={raider.unitType} hidden={!raider.revealed} offset={0} />
                              </span>
                            ))}
                            {Array.from({ length: fallingRaiders }, (_, casualtyIndex) => (
                              <span
                                className="tactical-formation-slot raider-slot"
                                style={formationSlotStyle(activeRaiders + casualtyIndex, totalRaiders, 168, 120, 22, 14, 5)}
                                key={`${raider.id}-fall-${eventIndex}-${casualtyIndex}`}
                              >
                                <RaiderSprite faction={battle.factionName} unitType={raider.unitType} hidden={false} offset={0} falling />
                              </span>
                            ))}
                          </div>
                          <span>
                            {raider.revealed ? `${raider.label} ${activeRaiders}명 · ${raider.intent === 'loot' ? '약탈' : raider.intent === 'flank' ? '우회' : raider.intent === 'breakWall' ? '공성' : '전진'}` : '정체불명'}
                            {raider.confused && <em className="tactical-state-badge confused">혼란</em>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="tactical-defender-rank">
                    {defenders.map(group => {
                      // volley 순간 사격 병종은 반동 모션 — key를 바꿔 애니메이션을 다시 튼다
                      const recoiling = zoneVolley && RANGED_KINDS.has(group.kind);
                      const prepMotion = activeEvent?.kind === 'readyVolley' && activeEvent.zoneId === zone.id && RANGED_KINDS.has(group.kind)
                        ? ' prep-readyVolley'
                        : activeEvent?.groupId === group.id && activeEvent.zoneId === zone.id
                          ? ` prep-${activeEvent.kind}`
                          : '';
                      return (
                        <div
                          className={`tactical-field-group formation-${defenderFormationRole(group.kind)}${recoiling ? ' recoil' : ''}${prepMotion}`}
                          key={recoiling || prepMotion ? `${group.id}-motion-${eventIndex}` : group.id}
                        >
                          <GroupSprites
                            state={state}
                            group={group}
                            showAll
                            falling={activeEvent?.kind === 'casualty' && activeEvent.groupId === group.id ? activeEvent.casualties ?? 0 : 0}
                          />
                          <span>{group.label}{group.ambushed && <em className="tactical-state-badge ambushed">매복중</em>}</span>
                        </div>
                      );
                    })}
                  </div>
                  {activeEvent?.float && activeEvent.zoneId === zone.id && (
                    <span key={`float-${eventIndex}`} className={`tactical-float ${activeEvent.side ?? 'defender'}`}>
                      {activeEvent.float}
                    </span>
                  )}
                  <p>{zone.description}</p>
                </section>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            className="tactical-stage-nav previous"
            disabled={activeZoneIndex <= 0 || playbackActive}
            onClick={() => showZone(activeZoneIndex - 1)}
            title="이전 방어선"
            aria-label="이전 방어선"
          >&#x2039;</button>
          <button
            type="button"
            className="tactical-stage-nav next"
            disabled={activeZoneIndex >= battle.zones.length - 1 || playbackActive}
            onClick={() => showZone(activeZoneIndex + 1)}
            title="다음 방어선"
            aria-label="다음 방어선"
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
          {(activeEvent?.kind === 'wallHit' || activeEvent?.kind === 'bombardment') && (
            <div className="tactical-vignette" key={`vignette-${eventIndex}`} aria-hidden="true" />
          )}
          {stingerRound != null && (
            <div className="tactical-round-stinger" key={`stinger-${stingerRound}`} aria-hidden="true">
              <div>
                <strong>제{Math.min(stingerRound, 5)}차 교전</strong>
                <span>{battle.factionName} 습격 방어</span>
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

          {battle.phase === 'deployment' && (
            <>
              <div className="tactical-panel-heading">
                <div>
                  <strong>수비대 배치</strong>
                  <span>{battle.preliminaryBombardmentCannons
                    ? `사전포격 ${battle.preliminaryBombardmentCannons}문 · 적 ${battle.preliminaryBombardmentCasualties ?? 0}명 전투불능`
                    : '각 병력을 지킬 구역에 배치합니다.'}</span>
                </div>
                <button className="btn primary" onClick={onAdvancePhase}>전투 시작</button>
              </div>
              <div className="tactical-deployment-list">
                {battle.defenderGroups.map(group => (
                  <div className="tactical-deployment-row" key={group.id}>
                    <div className="tactical-deployment-unit">
                      <GroupSprites state={state} group={group} maxVisible={2} />
                      <strong>{group.label}{group.ambushed && <em className="tactical-state-badge ambushed">매복중</em>}</strong>
                      <span>{group.count}명</span>
                    </div>
                    <div className="tactical-zone-buttons">
                      {battle.zones.map(zone => (
                        <button
                          key={zone.id}
                          className={group.zoneId === zone.id ? 'active' : ''}
                          onClick={() => onAssignGroup(group.id, zone.id)}
                        >{zone.name}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {battle.phase === 'command' && selectedGroup && (
            <>
              <div className="tactical-panel-heading">
                <div><strong>제{battle.round}차 교전 지휘</strong><span>현재 초점: {battle.zones.find(zone => zone.id === battle.currentZoneId)?.name}</span></div>
                <button className="btn primary" onClick={onResolveRound}>교전 개시</button>
              </div>
              <div className="tactical-command-layout">
                <div className="tactical-group-tabs">
                  {battle.defenderGroups.map(group => (
                    <button
                      key={group.id}
                      className={selectedGroup.id === group.id ? 'active' : ''}
                      onClick={() => setSelectedGroupId(group.id)}
                    >
                      <strong>{group.label}</strong>
                      <span>{battle.zones.find(zone => zone.id === group.zoneId)?.name} · {group.command ? commandLabel(group.command, group) : '명령 대기'}{group.ambushed ? ' · 매복중' : ''}</span>
                    </button>
                  ))}
                </div>
                <div className="tactical-command-options">
                  <div className="tactical-selected-group">
                    <GroupSprites state={state} group={selectedGroup} />
                    <div><strong>{selectedGroup.label}</strong><span>{battle.zones.find(zone => zone.id === selectedGroup.zoneId)?.name}{selectedGroup.ambushed ? ' · 매복중' : ''}</span></div>
                  </div>
                  <div className="tactical-command-grid">
                    {COMMANDS
                      .filter(command => tacticalCommandUnavailableReason(battle, selectedGroup, command) == null)
                      .map(command => (
                        <button
                          key={command}
                          className={selectedGroup.command === command ? 'active' : ''}
                          onClick={() => onSetCommand(selectedGroup.id, command)}
                        >
                          <strong>{commandLabel(command, selectedGroup)}</strong>
                          <span>{tacticalCommandDescription(command, selectedGroup.ambushed)}</span>
                        </button>
                      ))}
                  </div>
                </div>
              </div>
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
                <div><span>건물 위험</span><strong>{report.buildingsDamaged}</strong></div>
                <div><span>약탈</span><strong>{tacticalLootText(report) || '없음'}</strong></div>
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
                <p>{battle.factionName} 습격 방어전 · {battle.mode === 'levy' ? '민병 방어' : '수비병 요격'}</p>
              </div>
              <div className="tactical-report-numbers">
                <div><span>전사</span><strong>{finalKilled}</strong></div>
                <div><span>부상</span><strong>{finalWounded}</strong></div>
                <div><span>건물 피해</span><strong>{finalDamaged}</strong></div>
                <div><span>자원 피해</span><strong>{Object.keys(finalLoot).length > 0 ? Object.entries(finalLoot).map(([key, amount]) => `${RESOURCE_NAMES[key as keyof typeof RESOURCE_NAMES]} ${amount}`).join(', ') : '없음'}</strong></div>
              </div>
              <button className="btn primary" onClick={onFinishBattle}>상세 전투 장계 보기</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
