import type { CSSProperties } from 'react';
import { combatSpriteDescriptor, tacticalGroupCapabilities } from '../../game/combatCapabilities';
import { tacticalFocusTargetUnavailableReason } from '../../game/tacticalBattle';
import type {
  GameState,
  PredatorKind,
  RaiderUnitType,
  Season,
  TacticalAnimationEvent,
  TacticalBattleZone,
  TacticalDefenderGroup,
  TacticalFormationLine,
  TacticalRaiderGroup,
  TigerTier,
} from '../../game/types';
import { tacticalBackgroundAsset } from '../../render/tacticalBackgroundAssets';
import {
  TACTICAL_COURT_POSE_SHEET,
  TACTICAL_DEFENDER_ROLE_POSE_SHEET,
  TACTICAL_DEFENDER_WEAPON_POSE_SHEET,
  TACTICAL_RAIDER_POSE_SHEET,
  tacticalBeastSheet,
  tacticalCourtMuzzleAnchor,
  tacticalCourtPoseCell,
  tacticalDefenderMuzzleAnchor,
  tacticalDefenderPoseCell,
  tacticalRaiderPoseCell,
  type TacticalMuzzleAnchor,
  type TacticalSpritePose,
} from '../../render/tacticalCharacterAssets';

const BARRICADE_SPRITES = {
  normal: '/assets/tactical/barricade-normal-v1.png',
  reinforced: '/assets/tactical/barricade-reinforced-v1.png',
  broken: '/assets/tactical/barricade-broken-v1.png',
} as const;

const DEFENDER_FORMATION_LINES: readonly TacticalFormationLine[] = ['front', 'middle', 'rear'];
const RAIDER_FORMATION_LINES: readonly TacticalFormationLine[] = ['rear', 'middle', 'front'];

interface Props {
  state: GameState;
  battle: NonNullable<GameState['tacticalBattle']>;
  zone: TacticalBattleZone;
  season: Season;
  hunt: boolean;
  assault: boolean;
  activeEvent: TacticalAnimationEvent | null;
  eventIndex: number;
  activeZoneId: string;
  scarCount: number;
  burning: boolean;
  barricadeReinforced: boolean;
  commandable: boolean;
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string) => void;
  onSelectTarget: (zoneId: string, groupId: string) => void;
}

function defenderFormationRole(group: TacticalDefenderGroup): 'melee' | 'ranged' | 'civilian' {
  if (group.role === 'civilian') return 'civilian';
  if (group.weapon === 'spear' || (group.weapon == null && tacticalGroupCapabilities(group).has('melee'))) return 'melee';
  if (tacticalGroupCapabilities(group).has('volley')) return 'ranged';
  return 'civilian';
}

function defenderFormationOrder(group: TacticalDefenderGroup): number {
  const role = defenderFormationRole(group);
  const roleOrder = role === 'melee' ? 0 : role === 'ranged' ? 1 : 2;
  const lineOrder = group.line === 'front' ? 0 : group.line === 'middle' ? 10 : 20;
  return lineOrder + roleOrder;
}

function formationLineLabel(line: TacticalFormationLine): string {
  return line === 'front' ? '전열' : line === 'middle' ? '중열' : '후열';
}

function UnitMuzzleFlash({ anchor }: { anchor: TacticalMuzzleAnchor }) {
  return (
    <i
      className={`tactical-unit-muzzle-flash ${anchor.size}`}
      style={{ left: `${anchor.x}px`, top: `${anchor.y}px` }}
      aria-hidden="true"
    />
  );
}

function DefenderSprite({ group, gender, pose = 'idle', firing = false, faded = false, falling = false }: {
  group: TacticalDefenderGroup;
  gender: 'male' | 'female';
  pose?: TacticalSpritePose;
  firing?: boolean;
  faded?: boolean;
  falling?: boolean;
}) {
  const descriptor = combatSpriteDescriptor(group.role, group.weapon);
  const resolvedPose = falling ? 'hurt' : pose;
  const cell = tacticalDefenderPoseCell(
    group.role,
    descriptor.source === 'weapon' ? descriptor.id : null,
    gender,
    resolvedPose,
  );
  const muzzleAnchor = firing && resolvedPose === 'attack'
    ? tacticalDefenderMuzzleAnchor(group.weapon, gender)
    : null;
  const sheet = cell.sheet === 'weapons'
    ? TACTICAL_DEFENDER_WEAPON_POSE_SHEET
    : TACTICAL_DEFENDER_ROLE_POSE_SHEET;
  return (
    <span
      className={`tactical-sprite tactical-defender role-${group.role} weapon-${group.weapon ?? 'unarmed'} pose-${resolvedPose}${faded ? ' faded' : ''}${falling ? ' falling' : ''}`}
      style={{
        backgroundImage: `url(${sheet.src})`,
        backgroundPosition: `${-cell.column * sheet.spriteWidth}px ${-cell.row * sheet.spriteHeight}px`,
        backgroundSize: `${sheet.columns * sheet.spriteWidth}px ${sheet.rows * sheet.spriteHeight}px`,
      }}
      aria-hidden="true"
    >
      {muzzleAnchor && <UnitMuzzleFlash anchor={muzzleAnchor} />}
    </span>
  );
}

function CourtRaiderSprite({ unitType, pose, firing, falling }: {
  unitType: RaiderUnitType;
  pose: TacticalSpritePose;
  firing: boolean;
  falling: boolean;
}) {
  const resolvedPose = falling ? 'hurt' : pose;
  const cell = tacticalCourtPoseCell(unitType, resolvedPose);
  const muzzleAnchor = firing && resolvedPose === 'attack' ? tacticalCourtMuzzleAnchor(unitType) : null;
  return (
    <span
      className={`tactical-sprite tactical-court-raider unit-${unitType} pose-${resolvedPose}${falling ? ' falling' : ''}`}
      style={{
        backgroundImage: `url(${TACTICAL_COURT_POSE_SHEET.src})`,
        backgroundPosition: `${-cell.column * TACTICAL_COURT_POSE_SHEET.spriteWidth}px ${-cell.row * TACTICAL_COURT_POSE_SHEET.spriteHeight}px`,
        backgroundSize: `${TACTICAL_COURT_POSE_SHEET.columns * TACTICAL_COURT_POSE_SHEET.spriteWidth}px ${TACTICAL_COURT_POSE_SHEET.rows * TACTICAL_COURT_POSE_SHEET.spriteHeight}px`,
      }}
      aria-hidden="true"
    >
      {muzzleAnchor && <UnitMuzzleFlash anchor={muzzleAnchor} />}
    </span>
  );
}

type BeastPose = TacticalSpritePose;

function BeastSprite({ kind, tigerTier, hidden, pose, falling }: {
  kind: PredatorKind;
  tigerTier?: TigerTier;
  hidden: boolean;
  pose: BeastPose;
  falling: boolean;
}) {
  if (hidden) return (
    <span className="tactical-beast-trace" aria-label="덤불 사이에 남은 맹수 발자국">
      <i /><i /><i /><b />
    </span>
  );
  const position = pose === 'attack'
    ? '-192px 0px'
    : pose === 'hurt'
      ? '0px -192px'
      : pose === 'wounded' ? '-192px -192px' : '0px 0px';
  const tierClass = kind === 'wolf' ? 'wolf' : tigerTier ?? 'tiger';
  return (
    <span
      className={`tactical-sprite tactical-beast beast-${tierClass} pose-${pose}${falling ? ' falling' : ''}`}
      style={{
        backgroundImage: `url(${tacticalBeastSheet(kind, tigerTier)})`,
        backgroundPosition: position,
        backgroundSize: '384px 384px',
      }}
      aria-hidden="true"
    />
  );
}

function RaiderSprite({
  faction, unitType, beastKind, tigerTier, hidden, offset, pose = 'idle', firing = false, falling = false,
}: {
  faction: string;
  unitType?: RaiderUnitType;
  beastKind?: PredatorKind;
  tigerTier?: TigerTier;
  hidden: boolean;
  offset: number;
  pose?: BeastPose;
  firing?: boolean;
  falling?: boolean;
}) {
  if (beastKind) return (
    <BeastSprite kind={beastKind} tigerTier={tigerTier} hidden={hidden} pose={pose} falling={falling} />
  );
  if (!hidden && faction === '조정 토벌군' && unitType?.startsWith('court-')) {
    return <CourtRaiderSprite unitType={unitType} pose={pose} firing={firing} falling={falling} />;
  }
  const cell = tacticalRaiderPoseCell(faction, falling ? 'hurt' : pose);
  if (hidden || cell == null) return (
    <span
      className="tactical-raider-unknown"
      style={{ marginLeft: offset > 0 ? -52 : 0, marginBottom: (offset % 3) * 4 }}
      aria-hidden="true"
    >?</span>
  );
  return (
    <span
      className={`tactical-sprite tactical-raider pose-${falling ? 'hurt' : pose}${falling ? ' falling' : ''}`}
      style={{
        backgroundImage: `url(${TACTICAL_RAIDER_POSE_SHEET.src})`,
        backgroundPosition: `${-cell.column * TACTICAL_RAIDER_POSE_SHEET.spriteWidth}px ${-cell.row * TACTICAL_RAIDER_POSE_SHEET.spriteHeight}px`,
        backgroundSize: `${TACTICAL_RAIDER_POSE_SHEET.columns * TACTICAL_RAIDER_POSE_SHEET.spriteWidth}px ${TACTICAL_RAIDER_POSE_SHEET.rows * TACTICAL_RAIDER_POSE_SHEET.spriteHeight}px`,
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

function GroupSprites({
  state, group, pose = 'idle', firing = false, falling = 0, maxVisible = 4, showAll = false,
  formationGroupCount = 1,
}: {
  state: GameState;
  group: TacticalDefenderGroup;
  pose?: TacticalSpritePose;
  firing?: boolean;
  falling?: number;
  maxVisible?: number;
  showAll?: boolean;
  formationGroupCount?: number;
}) {
  const active = Math.max(0, group.count - group.wounded - group.killed);
  const wounded = Math.max(0, Math.min(group.wounded, group.count - group.killed));
  const shown = showAll ? active : Math.min(maxVisible, active);
  const woundedShown = showAll ? Math.min(3, wounded) : Math.min(1, wounded);
  const fallingShown = showAll ? falling : Math.min(2, falling);
  const gender = (index: number) => {
    const residentId = group.residentIds[index];
    return state.residents.find(resident => resident.id === residentId)?.gender ?? (index % 2 ? 'female' : 'male');
  };
  if (showAll && shown + woundedShown + fallingShown > 0) {
    const total = shown + woundedShown + fallingShown;
    const denseFormation = formationGroupCount >= 5
      ? { spriteWidth: 58, xStep: 9, maxColumns: 3 }
      : formationGroupCount >= 4
        ? { spriteWidth: 68, xStep: 12, maxColumns: 4 }
        : { spriteWidth: 84, xStep: 20, maxColumns: 6 };
    const formation = formationDimensions(
      total, denseFormation.spriteWidth, 120, denseFormation.xStep, 13, denseFormation.maxColumns,
    );
    return (
      <div
        className="tactical-unit-line full-formation"
        style={{ width: formation.width, height: formation.height }}
        aria-label={`${group.label} ${active}명 전투 가능`}
      >
        {Array.from({ length: shown }, (_, index) => (
          <span
            className="tactical-formation-slot defender-slot"
            style={formationSlotStyle(
              index, total, denseFormation.spriteWidth, 120, denseFormation.xStep, 13, denseFormation.maxColumns,
            )}
            key={`${group.id}-${index}`}
          >
            <DefenderSprite group={group} gender={gender(index)} pose={pose} firing={firing} />
          </span>
        ))}
        {Array.from({ length: woundedShown }, (_, index) => (
          <span
            className="tactical-formation-slot defender-slot"
            style={formationSlotStyle(
              shown + index, total, denseFormation.spriteWidth, 120, denseFormation.xStep, 13,
              denseFormation.maxColumns,
            )}
            key={`${group.id}-wounded-${index}`}
          >
            <DefenderSprite group={group} gender={gender(shown + index)} pose="wounded" faded />
          </span>
        ))}
        {Array.from({ length: fallingShown }, (_, index) => (
          <span
            className="tactical-formation-slot defender-slot"
            style={formationSlotStyle(
              shown + woundedShown + index, total, denseFormation.spriteWidth, 120, denseFormation.xStep, 13,
              denseFormation.maxColumns,
            )}
            key={`${group.id}-fall-${index}`}
          >
            <DefenderSprite group={group} gender={gender(shown + woundedShown + index)} pose="hurt" falling />
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className={`tactical-unit-line${showAll ? ' full-formation' : ''}`} aria-label={`${group.label} ${active}명 전투 가능`}>
      {Array.from({ length: shown }, (_, index) => (
        <DefenderSprite key={`${group.id}-${index}`} group={group} gender={gender(index)} pose={pose} firing={firing} />
      ))}
      {Array.from({ length: woundedShown }, (_, index) => (
        <DefenderSprite
          key={`${group.id}-wounded-${index}`}
          group={group}
          gender={gender(shown + index)}
          pose="wounded"
          faded
        />
      ))}
      {Array.from({ length: fallingShown }, (_, index) => (
        <DefenderSprite
          key={`${group.id}-fall-${index}`}
          group={group}
          gender={gender(shown + woundedShown + index)}
          pose="hurt"
          falling
        />
      ))}
      {active > shown && <span className="tactical-unit-more">+{active - shown}</span>}
      {active === 0 && woundedShown === 0 && fallingShown === 0 && <span className="tactical-unit-none">전투 불능</span>}
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
  if (zoneId === 'lairTrail' && active.has('nightAssault')) labels.push('야습 접근');
  if (zoneId === 'lairTrail' && active.has('lureGuards')) labels.push('초병 유인');
  if ((zoneId === 'lairWall' || zoneId === 'lairKeep') && active.has('prepareFireArrows')) labels.push('불화살 준비');
  if (zoneId === 'lairKeep' && active.has('blockLeaderEscape')) labels.push('퇴로 매복');
  return labels;
}

function eventClass(event: TacticalAnimationEvent | null, zoneId: string): string {
  if (!event || event.zoneId !== zoneId) return '';
  return ` event-${event.kind}`;
}

function defenderPoseForEvent(
  event: TacticalAnimationEvent | null,
  group: TacticalDefenderGroup,
): TacticalSpritePose {
  if (!event || event.zoneId !== group.zoneId) return 'idle';
  if (event.kind === 'casualty' && event.groupId === group.id) return 'hurt';
  if ((event.kind === 'wallHit' || event.kind === 'zoneFall' || event.kind === 'artilleryHit' ||
      event.kind === 'beastAmbush') && event.side === 'defender') return 'hurt';
  const capabilities = tacticalGroupCapabilities(group);
  if (defenderFiringForEvent(event, group)) return 'attack';
  if (event.kind === 'ambush' && event.side !== 'raider' && capabilities.has('ambush')) return 'attack';
  if (event.kind === 'melee' && event.side !== 'raider' && capabilities.has('melee')) return 'attack';
  if (event.kind === 'escapeBlocked' && group.role === 'hunter') return 'attack';
  return 'idle';
}

function defenderFiringForEvent(
  event: TacticalAnimationEvent | null,
  group: TacticalDefenderGroup,
): boolean {
  if (!event || event.zoneId !== group.zoneId || event.side === 'raider') return false;
  if (event.kind !== 'volley' && event.kind !== 'fire') return false;
  if (!tacticalGroupCapabilities(group).has('volley')) return false;
  if (event.kind === 'volley' && group.command != null && group.command !== 'volley') return false;
  if (event.kind === 'fire' && group.command != null && group.command !== 'arson') return false;
  if (!event.shots) return true;
  return group.weapon === 'musket'
    ? event.kind === 'volley' && (event.shots.muskets ?? 0) > 0
    : (event.shots.arrows ?? 0) > 0;
}

function raiderShotKind(group: TacticalRaiderGroup): 'arrow' | 'musket' | 'cannon' | null {
  if (group.unitType === 'court-gunner') return 'musket';
  if (group.unitType === 'court-artillery') return 'cannon';
  if (group.unitType === 'nimacha-hunter' || group.unitType === 'holaon-horse-archer' ||
      group.unitType === 'bandit-rider' || group.unitType === 'court-archer') return 'arrow';
  return null;
}

function raiderPoseForEvent(
  event: TacticalAnimationEvent | null,
  group: TacticalRaiderGroup,
): TacticalSpritePose {
  if (!event || event.zoneId !== group.zoneId) return 'idle';
  if (event.kind === 'casualty' && event.groupId === group.id) return 'hurt';
  if (event.kind === 'ambush' && event.side === 'raider' &&
      (event.groupId == null || event.groupId === group.id)) return 'hurt';
  if (event.kind === 'rearAssault' && event.groupId === group.id) return 'attack';
  if (event.kind === 'wallAssault' && event.groupId === group.id) return 'attack';
  if (raiderFiringForEvent(event, group)) return 'attack';
  if (event.kind === 'melee' && event.side === 'raider' &&
      (event.groupId == null || event.groupId === group.id)) return 'attack';
  if (event.kind === 'melee' && event.side == null) return 'attack';
  if (event.kind === 'advance' && event.side !== 'defender') return 'attack';
  if (event.kind === 'leaderEscape' && event.groupId === group.id) return 'attack';
  return 'idle';
}

function raiderFiringForEvent(
  event: TacticalAnimationEvent | null,
  group: TacticalRaiderGroup,
): boolean {
  if (!event || event.zoneId !== group.zoneId) return false;
  const shotKind = raiderShotKind(group);
  if (event.kind === 'artilleryHit') {
    return shotKind === 'cannon' && (!event.shots || (event.shots.cannons ?? 0) > 0);
  }
  if (event.kind !== 'volley' || event.side !== 'raider' || shotKind == null) return false;
  if (!event.shots) return true;
  if (shotKind === 'arrow') return (event.shots.arrows ?? 0) > 0;
  if (shotKind === 'musket') return (event.shots.muskets ?? 0) > 0;
  return (event.shots.cannons ?? 0) > 0;
}

function arrowProjectileCountForZone(
  event: TacticalAnimationEvent | null,
  defenders: TacticalDefenderGroup[],
  raiders: TacticalRaiderGroup[],
): number {
  if (!event || (event.kind !== 'volley' && event.kind !== 'fire')) return 0;
  const requestedArrows = Math.max(0, Math.floor(event.shots?.arrows ?? (event.shots ? 0 : 1)));
  if (requestedArrows === 0) return 0;
  const hasArrowShooter = event.side === 'raider'
    ? raiders.some(group => group.count - group.killed > 0 && group.revealed &&
      raiderShotKind(group) === 'arrow' && raiderFiringForEvent(event, group))
    : defenders.some(group => group.count - group.wounded - group.killed > 0 &&
      group.weapon !== 'musket' && defenderFiringForEvent(event, group));
  return hasArrowShooter ? Math.min(12, requestedArrows) : 0;
}

function scarStyle(zoneId: string, index: number): CSSProperties {
  const seed = (zoneId.charCodeAt(0) + zoneId.length * 7) * 31 + index * 53;
  return {
    left: `${14 + (seed * 13) % 70}%`,
    bottom: `${26 + (seed * 29) % 48}px`,
    transform: `rotate(${(seed * 17) % 72 - 36}deg)`,
  };
}

export function TacticalZoneColumn({
  state,
  battle,
  zone,
  season,
  hunt,
  assault,
  activeEvent,
  eventIndex,
  activeZoneId,
  scarCount,
  burning,
  barricadeReinforced,
  commandable,
  selectedGroupId,
  onSelectGroup,
  onSelectTarget,
}: Props) {
  const focused = zone.id === activeZoneId;
  const defenders = battle.defenderGroups
    .filter(group => group.zoneId === zone.id)
    .sort((a, b) => defenderFormationOrder(a) - defenderFormationOrder(b));
  const zoneRaiders = battle.raiderGroups.filter(group => group.zoneId === zone.id &&
    (group.intent !== 'withdraw' || activeEvent?.groupId === group.id));
  const raiders = zoneRaiders.filter(group => !group.rearAssault);
  const rearAssaulters = zoneRaiders.filter(group => {
    if (!group.rearAssault) return false;
    if (battle.phase !== 'simulating') return group.engagementsInZone > 0;
    const revealIndex = battle.pendingReport?.events.findIndex(event =>
      event.kind === 'rearAssault' && event.groupId === group.id) ?? -1;
    return revealIndex < 0 || eventIndex >= revealIndex;
  });
  const effects = zoneEffects(zone.id, battle);
  const zoneVolley = activeEvent?.kind === 'volley' && activeEvent.zoneId === zone.id;
  const zoneArson = activeEvent?.kind === 'fire' && activeEvent.zoneId === zone.id;
  const zoneBombardment = activeEvent?.kind === 'bombardment' && activeEvent.zoneId === zone.id;
  const arrowProjectileCount = arrowProjectileCountForZone(activeEvent, defenders, raiders);
  const projectileMovesRight = assault
    ? activeEvent?.side !== 'raider'
    : activeEvent?.side === 'raider';
  const background = tacticalBackgroundAsset(zone.kind, season, battle.assaultKind, zone.order);
  const scars = Math.min(9, scarCount);
  const liveBreachEventIndex = battle.phase === 'simulating'
    ? battle.pendingReport?.events.findIndex(item =>
      item.zoneId === zone.id && item.side === 'defender' &&
      (item.kind === 'wallHit' || item.float === '돌파!')) ?? -1
    : -1;
  const visibleBreached = zone.breached &&
    (liveBreachEventIndex < 0 || eventIndex >= liveBreachEventIndex);
  const barricadeState = visibleBreached ? 'broken' : barricadeReinforced ? 'reinforced' : 'normal';
  const raidersAdvancing = activeEvent?.kind === 'advance' &&
    activeEvent.zoneId === zone.id && activeEvent.side !== 'defender';

  return (
    <section
      data-zone-id={zone.id}
      className={`tactical-zone zone-${zone.kind}${hunt ? ' hunt-zone' : assault ? ' assault-zone' : ' defense-zone'}${focused ? ' focused' : ''}${visibleBreached ? ' breached' : ''}${burning ? ' burning' : ''}${raidersAdvancing ? ' moving-raiders' : ''}${rearAssaulters.length > 0 ? ' has-rear-assault' : ''}${eventClass(activeEvent, zone.id)}`}
      style={{
        backgroundImage: `url(${background.src})`,
        backgroundSize: background.size,
        backgroundPosition: background.position,
        flexBasis: `${100 / battle.zones.length}%`,
      }}
    >
      <div className="tactical-zone-heading">
        <div>
          <strong>{zone.name}</strong>
          <span>{hunt ? `포위망 ${Math.round(battle.huntEncirclement ?? 0)}%` : visibleBreached ? '돌파됨' : `압박 ${Math.round(zone.pressure)}`}</span>
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
      {(visibleBreached || burning) && (
        <div className={`tactical-ruin-layer${burning ? ' burning' : ''}`} aria-hidden="true">
          <span className="ruin-ember" />
          <span className="ruin-smoke" style={{ left: '24%' }} />
          <span className="ruin-smoke" style={{ left: '47%', animationDelay: '1.4s' }} />
          <span className="ruin-smoke" style={{ left: '68%', animationDelay: '2.6s' }} />
          {burning && (
            <>
              <span className="ruin-flame" style={{ left: '16%' }} />
              <span className="ruin-flame" style={{ left: '30%', animationDelay: '180ms' }} />
              <span className="ruin-flame" style={{ left: '43%', animationDelay: '360ms' }} />
            </>
          )}
        </div>
      )}
      {zoneArson && arrowProjectileCount > 0 && (
        <div className="tactical-fx-layer arson" key={`arson-${eventIndex}`} aria-hidden="true">
          {Array.from({ length: arrowProjectileCount }, (_, index) => (
            <span
              key={index}
              className={`fx-arrow fx-fire-arrow moves-${projectileMovesRight ? 'right' : 'left'}`}
              style={{ animationDelay: `${index * 55}ms`, bottom: `${164 + (index * 19) % 68}px` }}
            />
          ))}
          <span className={`fx-fire-impact moves-${projectileMovesRight ? 'right' : 'left'}`} />
        </div>
      )}
      {zoneVolley && arrowProjectileCount > 0 && (
        <div className="tactical-fx-layer" key={`fx-${eventIndex}`} aria-hidden="true">
          {Array.from({ length: arrowProjectileCount }, (_, index) => (
            <span
              key={index}
              className={`fx-arrow moves-${projectileMovesRight ? 'right' : 'left'}`}
              style={{ animationDelay: `${index * 60}ms`, bottom: `${168 + (index * 23) % 60}px` }}
            />
          ))}
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
          className={`tactical-barricade ${barricadeState}${assault ? ' enemy-held' : ' village-held'}${activeEvent?.kind === 'wallAssault' && activeEvent.zoneId === zone.id ? ' under-attack' : ''}${activeEvent?.kind === 'wallHit' && activeEvent.zoneId === zone.id ? ' breaking' : ''}${activeEvent?.kind === 'fortify' && activeEvent.zoneId === zone.id ? ' fortifying' : ''}${activeEvent?.kind === 'artilleryHit' && activeEvent.zoneId === zone.id ? ' bombarded' : ''}`}
          aria-label={visibleBreached ? '파괴된 방책' : assault ? '마적이 지키는 산채 목책' : barricadeReinforced ? '강화된 방책' : '일반 방책'}
        >
          <img src={BARRICADE_SPRITES[barricadeState]} alt="" aria-hidden="true" />
          <b>{visibleBreached ? (assault ? '산채 목책 돌파' : '방책 파괴') : assault ? '산채 목책' : barricadeReinforced ? '강화 방책' : '방책'}</b>
        </div>
      )}
      <div className="tactical-raider-rank">
        {RAIDER_FORMATION_LINES.map(line => (
          <div
            className={`tactical-formation-lane line-${line}`}
            data-formation-line={line}
            aria-label={`적 ${formationLineLabel(line)}`}
            key={line}
          >
            <span className="tactical-formation-line-label">적 {formationLineLabel(line)}</span>
            {raiders.filter(raider => raider.line === line).map(raider => {
          const activeRaiders = Math.max(0, raider.count - raider.killed);
          const targetingActive = battle.phase === 'command' && !assault && !hunt && activeRaiders > 0;
          const targetUnavailableReason = targetingActive
            ? tacticalFocusTargetUnavailableReason(battle, zone.id, raider.id)
            : null;
          const targetable = targetingActive && targetUnavailableReason == null;
          const focusTarget = zone.focusTargetGroupId === raider.id;
          const fallingRaiders = raider.revealed && activeEvent?.kind === 'casualty' && activeEvent.groupId === raider.id
            ? activeEvent.casualties ?? 0 : 0;
          const totalRaiders = activeRaiders + fallingRaiders;
          const formation = formationDimensions(totalRaiders, 168, 120, 22, 14, 5);
          const leaderMotion = activeEvent?.groupId === raider.id
            ? activeEvent.kind === 'leaderEscape'
              ? ' leader-escaping'
              : activeEvent.kind === 'escapeBlocked'
                ? ' escape-blocked'
                : ''
            : '';
          const beastPose: BeastPose = fallingRaiders > 0
            ? 'hurt'
            : activeEvent?.kind === 'beastAmbush' && activeEvent.zoneId === zone.id
              ? 'attack'
              : hunt && battle.huntPredatorState === 'wounded' ? 'wounded' : 'idle';
          const raiderPose = raider.beastKind ? beastPose : raiderPoseForEvent(activeEvent, raider);
          return (
            <div
              className={`tactical-raider-group${raider.beastKind ? ' beast-group' : ''}${raider.tigerTier ? ` tier-${raider.tigerTier}` : ''}${raider.unitType ? ` unit-${raider.unitType}` : ''}${raider.confused ? ' confused' : ''}${targetable ? ' targetable' : targetingActive ? ' target-unavailable' : ''}${focusTarget ? ' focus-target' : ''}${leaderMotion}`}
              key={leaderMotion ? `${raider.id}-${activeEvent?.kind}-${eventIndex}` : raider.id}
              onClick={targetable ? event => {
                event.stopPropagation();
                onSelectTarget(zone.id, raider.id);
              } : undefined}
              role={targetable ? 'button' : undefined}
              tabIndex={targetable ? 0 : undefined}
              aria-pressed={targetable ? focusTarget : undefined}
              title={targetable
                ? focusTarget ? '집중 표적 해제' : '이 적 부대를 집중 표적으로 지정'
                : targetUnavailableReason ?? undefined}
              onKeyDown={targetable ? event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                onSelectTarget(zone.id, raider.id);
              } : undefined}
            >
              <div
                className="tactical-raider-sprites clustered"
                style={{ width: formation.width, height: formation.height }}
                aria-label={`${raider.label} ${activeRaiders}${raider.beastKind ? '마리' : '명'}`}
              >
                {Array.from({ length: activeRaiders }, (_, spriteIndex) => (
                  <span
                    className="tactical-formation-slot raider-slot"
                    style={formationSlotStyle(spriteIndex, totalRaiders, 168, 120, 22, 14, 5)}
                    key={`${raider.id}-${spriteIndex}`}
                  >
                    <RaiderSprite faction={battle.factionName} unitType={raider.unitType} beastKind={raider.beastKind} tigerTier={raider.tigerTier} hidden={!raider.revealed} offset={0} pose={raiderPose} firing={raiderFiringForEvent(activeEvent, raider)} />
                  </span>
                ))}
                {Array.from({ length: fallingRaiders }, (_, casualtyIndex) => (
                  <span
                    className="tactical-formation-slot raider-slot"
                    style={formationSlotStyle(activeRaiders + casualtyIndex, totalRaiders, 168, 120, 22, 14, 5)}
                    key={`${raider.id}-fall-${eventIndex}-${casualtyIndex}`}
                  >
                    <RaiderSprite faction={battle.factionName} unitType={raider.unitType} beastKind={raider.beastKind} tigerTier={raider.tigerTier} hidden={false} offset={0} pose="hurt" falling />
                  </span>
                ))}
              </div>
              <span>
                {raider.revealed ? `${raider.label} ${activeRaiders}${raider.beastKind ? '마리' : '명'} · ${raider.beastKind ? battle.huntPredatorState === 'wounded' ? '부상' : '경계' : raider.intent === 'loot' ? '약탈' : raider.intent === 'flank' ? '우회' : raider.intent === 'breakWall' ? '공성' : raider.intent === 'defend' ? '수비' : raider.intent === 'escape' ? '도주' : '전진'}` : raider.beastKind ? '덤불 속 흔적' : '정체불명'}
                {raider.confused && <em className="tactical-state-badge confused">혼란</em>}
                {focusTarget && <em className="tactical-state-badge focus-target">집중 표적</em>}
              </span>
            </div>
          );
            })}
          </div>
        ))}
      </div>
      <div className="tactical-contact-line" aria-hidden={!focused}>
        <span>교전선</span>
      </div>
      <div className={`tactical-rear-assault-rank${activeEvent?.kind === 'rearAssault' && activeEvent.zoneId === zone.id ? ' entering' : ''}${activeEvent?.kind === 'melee' && activeEvent.side === 'raider' && activeEvent.zoneId === zone.id && rearAssaulters.some(group => activeEvent.groupId == null || activeEvent.groupId === group.id) ? ' attacking' : ''}`}>
        {rearAssaulters.map(raider => {
          const activeRaiders = Math.max(0, raider.count - raider.killed);
          const targetingActive = battle.phase === 'command' && !assault && !hunt && activeRaiders > 0;
          const targetUnavailableReason = targetingActive
            ? tacticalFocusTargetUnavailableReason(battle, zone.id, raider.id)
            : null;
          const targetable = targetingActive && targetUnavailableReason == null;
          const focusTarget = zone.focusTargetGroupId === raider.id;
          const fallingRaiders = activeEvent?.kind === 'casualty' && activeEvent.groupId === raider.id
            ? activeEvent.casualties ?? 0 : 0;
          const totalRaiders = activeRaiders + fallingRaiders;
          const formation = formationDimensions(totalRaiders, 132, 100, 20, 13, 5);
          return (
            <div
              className={`tactical-raider-group rear-assault${raider.confused ? ' confused' : ''}${targetable ? ' targetable' : targetingActive ? ' target-unavailable' : ''}${focusTarget ? ' focus-target' : ''}`}
              key={raider.id}
              onClick={targetable ? event => {
                event.stopPropagation();
                onSelectTarget(zone.id, raider.id);
              } : undefined}
              role={targetable ? 'button' : undefined}
              tabIndex={targetable ? 0 : undefined}
              aria-pressed={targetable ? focusTarget : undefined}
              title={targetable
                ? focusTarget ? '집중 표적 해제' : '이 적 부대를 집중 표적으로 지정'
                : targetUnavailableReason ?? undefined}
              onKeyDown={targetable ? event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                onSelectTarget(zone.id, raider.id);
              } : undefined}
            >
              <div
                className="tactical-raider-sprites clustered"
                style={{ width: formation.width, height: formation.height }}
                aria-label={`${raider.label} 후방 급습 ${activeRaiders}명`}
              >
                {Array.from({ length: activeRaiders }, (_, spriteIndex) => (
                  <span
                    className="tactical-formation-slot raider-slot"
                    style={formationSlotStyle(spriteIndex, totalRaiders, 132, 100, 20, 13, 5)}
                    key={`${raider.id}-rear-${spriteIndex}`}
                  >
                    <RaiderSprite faction={battle.factionName} unitType={raider.unitType} hidden={false} offset={0} pose={raiderPoseForEvent(activeEvent, raider)} />
                  </span>
                ))}
                {Array.from({ length: fallingRaiders }, (_, casualtyIndex) => (
                  <span
                    className="tactical-formation-slot raider-slot"
                    style={formationSlotStyle(activeRaiders + casualtyIndex, totalRaiders, 132, 100, 20, 13, 5)}
                    key={`${raider.id}-rear-fall-${eventIndex}-${casualtyIndex}`}
                  >
                    <RaiderSprite faction={battle.factionName} unitType={raider.unitType} hidden={false} offset={0} pose="hurt" falling />
                  </span>
                ))}
              </div>
              <span>
                {raider.label} {activeRaiders}명 · 후방 급습
                {focusTarget && <em className="tactical-state-badge focus-target">집중 표적</em>}
              </span>
            </div>
          );
        })}
      </div>
      <div className="tactical-defender-rank">
        {DEFENDER_FORMATION_LINES.map(line => (
          <div
            className={`tactical-formation-lane line-${line}`}
            data-formation-line={line}
            aria-label={`아군 ${formationLineLabel(line)}`}
            key={line}
          >
            <span className="tactical-formation-line-label">아군 {formationLineLabel(line)}</span>
            {defenders.filter(group => group.line === line).map(group => {
          const recoiling = zoneVolley && defenderFiringForEvent(activeEvent, group);
          const blockingEscape = activeEvent?.kind === 'escapeBlocked' &&
            activeEvent.zoneId === zone.id && group.kind === 'hunter';
          const prepMotion = activeEvent?.kind === 'readyVolley' && activeEvent.zoneId === zone.id && tacticalGroupCapabilities(group).has('volley')
            ? ' prep-readyVolley'
            : activeEvent?.groupId === group.id && activeEvent.zoneId === zone.id
              ? ` prep-${activeEvent.kind}`
              : '';
          return (
            <div
              className={`tactical-field-group formation-${defenderFormationRole(group)} line-${group.line}${recoiling ? ' recoil' : ''}${blockingEscape ? ' leader-blocking' : ''}${prepMotion}${commandable ? ' selectable' : ''}${commandable && selectedGroupId === group.id ? ' selected' : ''}`}
              key={recoiling || blockingEscape || prepMotion ? `${group.id}-motion-${eventIndex}` : group.id}
              onClick={commandable ? event => {
                event.stopPropagation();
                onSelectGroup(group.id);
              } : undefined}
              role={commandable ? 'button' : undefined}
              tabIndex={commandable ? 0 : undefined}
              onKeyDown={commandable ? event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                onSelectGroup(group.id);
              } : undefined}
            >
              <GroupSprites
                state={state}
                group={group}
                pose={defenderPoseForEvent(activeEvent, group)}
                firing={recoiling}
                showAll
                formationGroupCount={defenders.length + (rearAssaulters.length > 0 ? 2 : 0)}
                falling={activeEvent?.kind === 'casualty' && activeEvent.groupId === group.id ? activeEvent.casualties ?? 0 : 0}
              />
              <span>{group.label}{group.ambushed && <em className="tactical-state-badge ambushed">매복중</em>}</span>
            </div>
          );
            })}
          </div>
        ))}
      </div>
      {activeEvent?.float && activeEvent.zoneId === zone.id && (
        <span key={`float-${eventIndex}`} className={`tactical-float ${activeEvent.side ?? 'defender'}`}>
          {activeEvent.float}
        </span>
      )}
      <p>{zone.description}</p>
    </section>
  );
}
