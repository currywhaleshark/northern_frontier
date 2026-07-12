import { useEffect, useMemo, useRef, useState } from 'react';
import { RESOURCE_NAMES, WEATHER_ICONS, WEATHER_NAMES } from '../game/constants';
import { getSeason } from '../game/seasons';
import { tacticalCommandDescription, tacticalLootText } from '../game/tacticalBattle';
import type {
  DefenderGroupKind,
  GameState,
  PreparationActionId,
  TacticalAnimationEvent,
  TacticalCommandId,
  TacticalDefenderGroup,
} from '../game/types';
import { tacticalBackgroundAsset } from '../render/tacticalBackgroundAssets';
import {
  TACTICAL_CHARACTER_SHEET, TACTICAL_MILITIA_SHEET, TACTICAL_RAIDER_SHEET, tacticalRaiderColumn,
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
  setAmbush: '접근로 매복을 강화하고 숨은 적 조를 미리 드러냅니다.',
  prepareVolley: '각궁·조총·파수꾼의 일제 사격 효과를 높입니다.',
  musterMilitia: '피난 주민 일부를 민병으로 소집합니다. 마을 기세가 조금 낮아집니다.',
};

const COMMANDS: TacticalCommandId[] = [
  'hold', 'volley', 'ambush', 'guardStorehouse', 'protectCivilians', 'fallback',
];

const COMMAND_LABELS: Record<TacticalCommandId, string> = {
  hold: '고수',
  volley: '일제 사격',
  ambush: '매복',
  guardStorehouse: '창고 사수',
  protectCivilians: '주민 보호',
  fallback: '후퇴',
  counterattack: '반격',
  openRetreat: '퇴로 개방',
};

// 연출 이벤트 종류별 효과음 매핑 — camera/report처럼 소리가 없는 이벤트는 생략
const EVENT_SFX: Partial<Record<TacticalAnimationEvent['kind'], SfxName>> = {
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

function RaiderSprite({ faction, hidden, offset, falling = false }: {
  faction: string;
  hidden: boolean;
  offset: number;
  falling?: boolean;
}) {
  const column = tacticalRaiderColumn(faction);
  if (hidden || column == null) return <span className="tactical-raider-unknown" aria-hidden="true">?</span>;
  return (
    <span
      className={`tactical-sprite tactical-raider${falling ? ' falling' : ''}`}
      style={{
        backgroundImage: `url(${TACTICAL_RAIDER_SHEET.src})`,
        backgroundPosition: `${-column * TACTICAL_RAIDER_SHEET.spriteWidth}px 0px`,
        backgroundSize: `${TACTICAL_RAIDER_SHEET.columns * TACTICAL_RAIDER_SHEET.spriteWidth}px ${TACTICAL_RAIDER_SHEET.spriteHeight}px`,
        marginLeft: offset > 0 ? -54 : 0,
      }}
      aria-hidden="true"
    />
  );
}

function GroupSprites({ state, group, falling = 0 }: {
  state: GameState;
  group: TacticalDefenderGroup;
  falling?: number; // 지금 재생 중인 피해 이벤트로 쓰러지는 인원 — 그만큼 추가로 그려 쓰러뜨린다
}) {
  const active = Math.max(0, group.count - group.wounded - group.killed);
  const shown = Math.min(4, active);
  const fallingShown = Math.min(2, falling);
  const gender = (index: number) => {
    const residentId = group.residentIds[index];
    return state.residents.find(resident => resident.id === residentId)?.gender ?? (index % 2 ? 'female' : 'male');
  };
  return (
    <div className="tactical-unit-line" aria-label={`${group.label} ${active}명 전투 가능`}>
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
  if (zoneId === 'approach' && active.has('setAmbush')) labels.push('매복 준비');
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
  const activeEvent = battle?.phase === 'simulating'
    ? battle.pendingReport?.events[eventIndex] ?? null
    : null;
  const activeZoneId = activeEvent?.zoneId ?? viewedZoneId;

  useEffect(() => {
    if (!battle || battle.phase !== 'simulating' || !battle.pendingReport) return;
    let cancelled = false;
    let timer = 0;
    const events = battle.pendingReport.events;
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
      timer = window.setTimeout(() => play(index + 1), events[index].durationMs);
    };
    play(0);
    return () => {
      cancelled = true;
      setBattleDrums(false);
      window.clearTimeout(timer);
    };
    // The battle round and phase are the stable playback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle?.id, battle?.phase, battle?.pendingReport?.round]);

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

  return (
    <div className="tactical-overlay" role="dialog" aria-modal="true" aria-label={`${battle.factionName} 습격 직접 지휘`}>
      <div className="tactical-screen">
        <header className="tactical-header">
          <div>
            <div className="tactical-kicker">습격 방어 지휘</div>
            <h1>{battle.factionName}</h1>
          </div>
          <div className="tactical-status-row">
            <div><span>라운드</span><strong>{Math.min(roundLabel, 5)} / 5</strong></div>
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

        <div className="tactical-stage-shell">
          <div className="tactical-battlefield" ref={viewportRef}>
            <div className="tactical-strip">
              {battle.zones.map(zone => {
              const defenders = battle.defenderGroups.filter(group => group.zoneId === zone.id);
              const raiders = battle.raiderGroups.filter(group => group.zoneId === zone.id && group.intent !== 'withdraw');
              const effects = zoneEffects(zone.id, battle);
              return (
                <section
                  key={zone.id}
                  data-zone-id={zone.id}
                  className={`tactical-zone zone-${zone.kind}${zone.id === activeZoneId ? ' focused' : ''}${zone.breached ? ' breached' : ''}${eventClass(activeEvent, zone.id)}`}
                  style={{ backgroundImage: `url(${tacticalBackgroundAsset(zone.kind, season)})` }}
                >
                  <div className="tactical-zone-heading">
                    <div>
                      <strong>{zone.name}</strong>
                      <span>{zone.breached ? '돌파됨' : `압박 ${Math.round(zone.pressure)}`}</span>
                    </div>
                    <div className="tactical-pressure" aria-label={`압박 ${Math.round(zone.pressure)}`}>
                      <i style={{ width: `${zone.pressure}%` }} />
                    </div>
                  </div>
                  <div className="tactical-prep-tags">
                    {effects.map(label => <span key={label}>{label}</span>)}
                  </div>
                  <div className="tactical-raider-rank">
                    {raiders.map((raider, index) => (
                      <div className="tactical-raider-group" key={raider.id}>
                        <div className="tactical-raider-sprites">
                          <RaiderSprite faction={battle.factionName} hidden={!raider.revealed} offset={index} />
                          {raider.revealed && raider.power > battle.originalPower * 0.2 && (
                            <RaiderSprite faction={battle.factionName} hidden={false} offset={1} />
                          )}
                          {activeEvent?.kind === 'casualty' && activeEvent.groupId === raider.id && raider.revealed && (
                            <RaiderSprite key={`fall-${eventIndex}`} faction={battle.factionName} hidden={false} offset={1} falling />
                          )}
                        </div>
                        <span>{raider.revealed ? `${raider.label} ${Math.max(0, raider.count - raider.killed)}명 · ${raider.intent === 'loot' ? '약탈' : raider.intent === 'flank' ? '우회' : '전진'}` : '정체불명'}</span>
                      </div>
                    ))}
                  </div>
                  <div className="tactical-defender-rank">
                    {defenders.map(group => (
                      <div className="tactical-field-group" key={group.id}>
                        <GroupSprites
                          state={state}
                          group={group}
                          falling={activeEvent?.kind === 'casualty' && activeEvent.groupId === group.id ? activeEvent.casualties ?? 0 : 0}
                        />
                        <span>{group.label}</span>
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
              })}
            </div>
          </div>
          <button
            type="button"
            className="tactical-stage-nav previous"
            disabled={activeZoneIndex <= 0 || battle.phase === 'simulating'}
            onClick={() => showZone(activeZoneIndex - 1)}
            title="이전 방어선"
            aria-label="이전 방어선"
          >&#x2039;</button>
          <button
            type="button"
            className="tactical-stage-nav next"
            disabled={activeZoneIndex >= battle.zones.length - 1 || battle.phase === 'simulating'}
            onClick={() => showZone(activeZoneIndex + 1)}
            title="다음 방어선"
            aria-label="다음 방어선"
          >&#x203A;</button>
          <div className="tactical-stage-index">
            <strong>{battle.zones[activeZoneIndex]?.name}</strong>
            <span>{activeZoneIndex + 1} / {battle.zones.length}</span>
          </div>
          {activeEvent?.text && <div className="tactical-caption">{activeEvent.text}</div>}
        </div>

        <div className="tactical-controls">
          {battle.phase === 'preparation' && (
            <>
              <div className="tactical-panel-heading">
                <div><strong>전투 준비</strong><span>남은 준비점수 {battle.prepPoints}</span></div>
                <button className="btn primary" onClick={onAdvancePhase}>배치로 이동</button>
              </div>
              <div className="tactical-action-grid">
                {battle.prepActions.map(action => (
                  <button
                    key={action.id}
                    className={`tactical-action${action.applied ? ' applied' : ''}`}
                    disabled={action.applied || battle.prepPoints < action.cost}
                    onClick={() => onSpendPreparation(action.id)}
                  >
                    <span>{action.applied ? '완료' : `${action.cost}점`}</span>
                    <strong>{action.label}</strong>
                    <small>{PREP_DESCRIPTIONS[action.id]}</small>
                  </button>
                ))}
              </div>
            </>
          )}

          {battle.phase === 'deployment' && (
            <>
              <div className="tactical-panel-heading">
                <div><strong>수비대 배치</strong><span>각 병력을 지킬 구역에 배치합니다.</span></div>
                <button className="btn primary" onClick={onAdvancePhase}>전투 시작</button>
              </div>
              <div className="tactical-deployment-list">
                {battle.defenderGroups.map(group => (
                  <div className="tactical-deployment-row" key={group.id}>
                    <div className="tactical-deployment-unit">
                      <GroupSprites state={state} group={group} />
                      <strong>{group.label}</strong>
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
                <div><strong>{battle.round}라운드 지휘</strong><span>현재 초점: {battle.zones.find(zone => zone.id === battle.currentZoneId)?.name}</span></div>
                <button className="btn primary" onClick={onResolveRound}>라운드 진행</button>
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
                      <span>{battle.zones.find(zone => zone.id === group.zoneId)?.name} · {group.command ? COMMAND_LABELS[group.command] : '명령 대기'}</span>
                    </button>
                  ))}
                </div>
                <div className="tactical-command-options">
                  <div className="tactical-selected-group">
                    <GroupSprites state={state} group={selectedGroup} />
                    <div><strong>{selectedGroup.label}</strong><span>{battle.zones.find(zone => zone.id === selectedGroup.zoneId)?.name}</span></div>
                  </div>
                  <div className="tactical-command-grid">
                    {COMMANDS.map(command => (
                      <button
                        key={command}
                        className={selectedGroup.command === command ? 'active' : ''}
                        onClick={() => onSetCommand(selectedGroup.id, command)}
                      >
                        <strong>{COMMAND_LABELS[command]}</strong>
                        <span>{tacticalCommandDescription(command)}</span>
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
              <span>제{battle.pendingReport?.round ?? battle.round}라운드</span>
            </div>
          )}

          {battle.phase === 'report' && report && (
            <div className="tactical-report">
              <div>
                <span className="tactical-report-label">제{report.round}라운드 보고</span>
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
                {report.ended ? '전투 장계 확인' : '다음 라운드 지휘'}
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
