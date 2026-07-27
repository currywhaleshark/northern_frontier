// 전투 시뮬레이션 설정 화면 — 메인 메뉴에서 진입해 조건을 지정/랜덤으로 고르고 전투만 테스트한다
import { useState } from 'react';
import { CONFIG } from '../game/config';
import { WEATHER_NAMES } from '../game/constants';
import {
  BATTLE_SIMULATION_COMBAT_SPECIAL_RESIDENTS, BATTLE_SIMULATION_ENEMIES,
  type BattleSimDefenderCounts, type BattleSimDefenderMountCounts, type BattleSimMountableDefenderKey,
  type BattleSimulationOptions, type BattleSimulationScenario, type SimSetting,
} from '../game/battleSimulation';
import {
  enemyDoctrineDefinition, enemyStratagemDefinitions, eligibleEnemyDoctrines,
} from '../game/enemyPlan';
import { tacticalCompositionTemplates, tacticalEnemyFactionId } from '../game/tacticalCompositions';
import { specialResidentDefinition } from '../game/specialResidents';
import type {
  BattleMode, EnemyDoctrineId, EnemyStratagemId, Season, SpecialResidentId, TacticalRouteSide, TigerTier, WeatherId,
} from '../game/types';
import { MenuSnowLayer } from './MenuSnowLayer';
import { UiIcon, WeatherIcon } from './UiIcon';

interface Props {
  onStart: (options: BattleSimulationOptions) => void;
  onBack: () => void;
}

const RANDOM = 'random';

const SEASON_LABELS: Record<Season, string> = {
  spring: '봄', summer: '여름', autumn: '가을', winter: '겨울',
};
const WEATHERS: WeatherId[] = ['clear', 'rain', 'frost', 'heavySnow', 'blizzard', 'coldSnap', 'thawFlood'];

const DEFENDER_FIELDS: Array<{
  key: keyof BattleSimDefenderCounts;
  label: string;
  offensiveLabel?: string;
  max: number;
}> = [
  { key: 'muskets', label: '조총 수비대', offensiveLabel: '조총 토벌대', max: 8 },
  { key: 'bows', label: '각궁 수비대', offensiveLabel: '각궁 토벌대', max: 8 },
  { key: 'spears', label: '창 수비대', offensiveLabel: '창 토벌대', max: 8 },
  { key: 'unarmedMilitia', label: '기본 장비 수비대', offensiveLabel: '기본 장비 토벌대', max: 8 },
  { key: 'watchmen', label: '파수꾼', max: 6 },
  { key: 'hunters', label: '사냥꾼', max: 8 },
  { key: 'physicians', label: '의원', offensiveLabel: '원정 의원', max: 4 },
  { key: 'civilians', label: '피난 주민', max: 16 },
];

const DEFAULT_DEFENDERS: BattleSimDefenderCounts = {
  muskets: 1, bows: 2, spears: 2, unarmedMilitia: 1, watchmen: 2, hunters: 2, physicians: 1, civilians: 6,
};
const DEFAULT_MOUNTED_DEFENDERS: BattleSimDefenderMountCounts = {
  muskets: 0, bows: 0, spears: 0, unarmedMilitia: 0, watchmen: 0, hunters: 0,
};
const MOUNTABLE_DEFENDER_KEYS = new Set<keyof BattleSimDefenderCounts>(
  Object.keys(DEFAULT_MOUNTED_DEFENDERS) as BattleSimMountableDefenderKey[],
);
const COMBAT_SPECIAL_OPTIONS = BATTLE_SIMULATION_COMBAT_SPECIAL_RESIDENTS.map(id => specialResidentDefinition(id));

function isMountableDefenderKey(key: keyof BattleSimDefenderCounts): key is BattleSimMountableDefenderKey {
  return MOUNTABLE_DEFENDER_KEYS.has(key);
}

export function BattleSimulationSetup({ onStart, onBack }: Props) {
  const [scenario, setScenario] = useState<BattleSimulationScenario>('defense');
  const [mode, setMode] = useState<SimSetting<BattleMode>>('garrison');
  const [factionName, setFactionName] = useState<SimSetting<string>>(RANDOM);
  const [powerRandom, setPowerRandom] = useState(true);
  const [power, setPower] = useState(75);
  const [warned, setWarned] = useState<SimSetting<boolean>>(RANDOM);
  const [siege, setSiege] = useState<SimSetting<boolean>>(false);
  const [season, setSeason] = useState<SimSetting<Season>>('winter');
  const [weather, setWeather] = useState<SimSetting<WeatherId>>(RANDOM);
  const [prepMode, setPrepMode] = useState<'auto' | 'random' | 'fixed'>('auto');
  const [prepPoints, setPrepPoints] = useState(4);
  const [defendersRandom, setDefendersRandom] = useState(true);
  const [defenders, setDefenders] = useState<BattleSimDefenderCounts>(DEFAULT_DEFENDERS);
  const [mountedDefenders, setMountedDefenders] = useState<BattleSimDefenderMountCounts>(DEFAULT_MOUNTED_DEFENDERS);
  const [combatSpecialResidents, setCombatSpecialResidents] = useState<SpecialResidentId[]>([]);
  const [mountedSpecialResidents, setMountedSpecialResidents] = useState<SpecialResidentId[]>([]);
  const [cannonMode, setCannonMode] = useState<'none' | 'fixed' | 'random'>('none');
  const [cannonCount, setCannonCount] = useState(1);
  const [tigerTier, setTigerTier] = useState<SimSetting<TigerTier>>(RANDOM);
  const [wolfCountRandom, setWolfCountRandom] = useState(true);
  const [wolfCount, setWolfCount] = useState(6);
  const [enemyDoctrine, setEnemyDoctrine] = useState<EnemyDoctrineId | 'auto'>('auto');
  const [enemyTemplateId, setEnemyTemplateId] = useState<string>('auto');
  const [enemyStratagem, setEnemyStratagem] = useState<EnemyStratagemId | 'none' | 'auto'>('auto');
  const [enemyFlankRoute, setEnemyFlankRoute] = useState<TacticalRouteSide | 'none' | 'auto'>('auto');
  const offensive = scenario !== 'defense';
  const selectedEnemy = factionName === RANDOM
    ? null
    : BATTLE_SIMULATION_ENEMIES.find(enemy => enemy.name === factionName);
  const courtArmy = factionName === '조정 토벌군';
  // 강제 옵션 후보는 백엔드 정의에서만 가져온다 — 교리·편제의 단일 소스는 게임 도메인이다.
  const enemyFactionKnown = !offensive && factionName !== RANDOM;
  const doctrineOptions = enemyFactionKnown ? eligibleEnemyDoctrines(factionName, 8) : [];
  // P8에서 지원·화포 병과 판정이 활성화되어 실전과 같은 8단계까지 노출한다.
  const templateOptions = enemyFactionKnown
    ? tacticalCompositionTemplates().filter(template =>
      template.faction === tacticalEnemyFactionId(factionName) &&
      template.implementationPhase <= 8 &&
      (enemyDoctrine === 'auto' || template.doctrines.includes(enemyDoctrine)))
    : [];
  const combatantTotal = defenders.muskets + defenders.bows + defenders.spears +
    defenders.unarmedMilitia + defenders.watchmen + defenders.hunters;

  const setCount = (key: keyof BattleSimDefenderCounts, value: number) => {
    const next = Math.max(0, Math.min(20, Math.round(value) || 0));
    setDefenders(prev => ({ ...prev, [key]: next }));
    if (isMountableDefenderKey(key)) {
      setMountedDefenders(prev => ({ ...prev, [key]: Math.min(prev[key], next) }));
    }
  };
  const setMountedCount = (key: BattleSimMountableDefenderKey, value: number) =>
    setMountedDefenders(prev => ({
      ...prev,
      [key]: Math.max(0, Math.min(defenders[key], Math.round(value) || 0)),
    }));
  const toggleSpecialResident = (id: SpecialResidentId) => {
    setCombatSpecialResidents(prev => prev.includes(id)
      ? prev.filter(candidate => candidate !== id)
      : [...prev, id]);
    if (combatSpecialResidents.includes(id)) {
      setMountedSpecialResidents(prev => prev.filter(candidate => candidate !== id));
    }
  };

  const start = () => onStart({
    scenario,
    mode,
    factionName,
    power: powerRandom ? RANDOM : power,
    warned,
    siege,
    season,
    weather,
    prepPoints: prepMode === 'auto' ? 'auto' : prepMode === 'random' ? RANDOM : prepPoints,
    defenders: defendersRandom ? RANDOM : defenders,
    cannonEmplacements: cannonMode === 'random' ? RANDOM : cannonMode === 'fixed' ? cannonCount : 0,
    tigerTier,
    wolfCount: wolfCountRandom ? RANDOM : wolfCount,
    enemyDoctrine: enemyFactionKnown ? enemyDoctrine : 'auto',
    enemyCompositionTemplateId: enemyFactionKnown ? enemyTemplateId : 'auto',
    enemyStratagem: enemyFactionKnown ? enemyStratagem : 'auto',
    enemyFlankRoute: offensive ? 'auto' : enemyFlankRoute,
    combatSpecialResidents: defendersRandom ? RANDOM : combatSpecialResidents,
    mountedDefenders: defendersRandom ? RANDOM : mountedDefenders,
    mountedSpecialResidents: defendersRandom ? RANDOM : mountedSpecialResidents,
  });

  // boolean 항목용 3택(랜덤/예/아니오) 버튼 열
  const triState = (
    value: SimSetting<boolean>,
    onChange: (next: SimSetting<boolean>) => void,
    yesLabel: string,
    noLabel: string,
  ) => (
    <div className="sim-choice-row">
      {([['random', '랜덤'], [true, yesLabel], [false, noLabel]] as const).map(([option, label]) => (
        <button
          key={String(option)}
          className={`sim-choice${value === option ? ' active' : ''}`}
          onClick={() => onChange(option)}
        >{label}</button>
      ))}
    </div>
  );

  return (
    <div className="main-menu">
      <MenuSnowLayer />
      <div className="menu-panel sim-panel">
        <h1 className="menu-title">전투 시뮬레이션</h1>
        <div className="menu-subtitle">본 게임 진행과 무관하게 전술 전투만 시험합니다 — 결과는 저장되지 않습니다.</div>

        <section className="sim-section">
          <h3>시나리오</h3>
          <div className="sim-choice-row">
            {([
              ['defense', '마을 방어전'],
              ['banditLair', '산채 토벌'],
              ['tigerHunt', '호랑이 사냥'],
              ['wolfHunt', '늑대 사냥'],
            ] as const).map(([option, label]) => (
              <button
                key={option}
                className={`sim-choice${scenario === option ? ' active' : ''}`}
                onClick={() => setScenario(option)}
              >{label}</button>
            ))}
          </div>
        </section>

        <div className="sim-grid">
          <section className="sim-section">
            <h3>{offensive ? '토벌 대상' : '교전 조건'}</h3>
            {!offensive && (<>
            <label className="sim-field">
              <span>지휘 방식</span>
              <div className="sim-choice-row">
                {([['garrison', '수비병 요격'], ['levy', '민병 방어'], [RANDOM, '랜덤']] as const).map(([option, label]) => (
                  <button
                    key={option}
                    className={`sim-choice${mode === option ? ' active' : ''}`}
                    onClick={() => setMode(option)}
                  >{label}</button>
                ))}
              </div>
            </label>
            <label className="sim-field">
              <span>습격 세력</span>
              <select value={factionName} onChange={event => {
                const next = event.target.value;
                setFactionName(next);
                setEnemyDoctrine('auto');
                setEnemyTemplateId('auto');
                setEnemyStratagem('auto');
                setEnemyFlankRoute('auto');
                if (next === '조정 토벌군') setPower(current => Math.max(140, current));
              }}>
                <option value={RANDOM}>랜덤</option>
                {BATTLE_SIMULATION_ENEMIES.map(enemy => (
                  <option key={enemy.name} value={enemy.name}>{enemy.name}</option>
                ))}
              </select>
              <small className={`sim-enemy-note${courtArmy ? ' danger' : ''}`}>
                {selectedEnemy?.description ?? '니마차·홀라온·변경 마적·조정 토벌군 가운데 하나가 출현합니다.'}
              </small>
            </label>
            <label className="sim-field">
              <span>적 교리 강제</span>
              <select
                value={enemyFactionKnown ? enemyDoctrine : 'auto'}
                disabled={!enemyFactionKnown}
                onChange={event => {
                  const next = event.target.value as EnemyDoctrineId | 'auto';
                  setEnemyDoctrine(next);
                  if (next !== 'auto' && enemyTemplateId !== 'auto') {
                    const current = tacticalCompositionTemplates().find(template => template.id === enemyTemplateId);
                    if (current && !current.doctrines.includes(next)) setEnemyTemplateId('auto');
                  }
                }}
              >
                <option value="auto">자동 (규칙대로 선택)</option>
                {doctrineOptions.map(id => {
                  const definition = enemyDoctrineDefinition(id);
                  return <option key={id} value={id}>{definition.label}</option>;
                })}
              </select>
              {!enemyFactionKnown && <small className="sim-enemy-note">습격 세력을 지정하면 교리·편제를 강제할 수 있습니다.</small>}
            </label>
            <label className="sim-field">
              <span>적 편제 강제</span>
              <select
                value={enemyFactionKnown ? enemyTemplateId : 'auto'}
                disabled={!enemyFactionKnown}
                onChange={event => setEnemyTemplateId(event.target.value)}
              >
                <option value="auto">자동 (교리 호환 편제 중 선택)</option>
                {templateOptions.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.label}{template.implementationPhase > 1 ? ` (${template.implementationPhase}단계)` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="sim-field">
              <span>적 계책 강제</span>
              <select
                value={enemyFactionKnown ? enemyStratagem : 'auto'}
                disabled={!enemyFactionKnown}
                onChange={event => {
                  const next = event.target.value as EnemyStratagemId | 'none' | 'auto';
                  setEnemyStratagem(next);
                  if (next === 'none') setEnemyFlankRoute('none');
                  else if (next === 'rearManeuver' && enemyFlankRoute === 'none') setEnemyFlankRoute('auto');
                }}
              >
                <option value="auto">자동 (계책점수 규칙대로)</option>
                <option value="none">없음 (모든 계책 봉쇄)</option>
                {enemyStratagemDefinitions().map(stratagem => (
                  <option key={stratagem.id} value={stratagem.id}>
                    {stratagem.label} (비용 {stratagem.cost})
                  </option>
                ))}
              </select>
              <small className="sim-enemy-note">선택한 계책은 자동 구매 결과보다 우선하며 반드시 포함됩니다.</small>
            </label>
            <label className="sim-field">
              <span>후방 우회 경로 강제</span>
              <div className="sim-choice-row">
                {([['auto', '자동'], ['left', '좌측'], ['right', '우측'], ['none', '없음']] as const).map(([option, label]) => (
                  <button
                    key={option}
                    className={`sim-choice${enemyFlankRoute === option ? ' active' : ''}`}
                    onClick={() => {
                      setEnemyFlankRoute(option);
                      if (option !== 'none' && enemyStratagem === 'none') setEnemyStratagem('auto');
                      if (option === 'none' && enemyStratagem === 'rearManeuver') setEnemyStratagem('auto');
                    }}
                  >{label}</button>
                ))}
              </div>
              <small className="sim-enemy-note">적이 후방 우회 계책을 쓸 때 사용할 경로를 고정합니다. '없음'은 우회 계책을 봉쇄합니다.</small>
            </label>
            </>)}
            {(scenario === 'defense' || scenario === 'banditLair') && (
            <label className="sim-field">
              <span>{scenario === 'banditLair' ? '산채 전력' : '적 전력'} {powerRandom
                ? (scenario === 'banditLair' ? '(랜덤 45~120)' : courtArmy ? '(랜덤 140~180)' : '(랜덤 55~100)')
                : `— ${power}`}</span>
              <div className="sim-inline">
                <button
                  className={`sim-choice${powerRandom ? ' active' : ''}`}
                  onClick={() => setPowerRandom(!powerRandom)}
                >랜덤</button>
                <input
                  type="range" min={scenario === 'banditLair' ? 20 : courtArmy ? 120 : 15}
                  max={scenario === 'banditLair' ? 160 : 180} value={power} disabled={powerRandom}
                  onChange={event => setPower(Number(event.target.value))}
                />
              </div>
            </label>
            )}
            {scenario === 'tigerHunt' && (
              <label className="sim-field">
                <span>호랑이 체급</span>
                <div className="sim-choice-row">
                  {([['random', '랜덤'], ['tiger', '호랑이'], ['greatTiger', '대호'], ['mountainLord', '산군']] as const)
                    .map(([option, label]) => (
                      <button
                        key={option}
                        className={`sim-choice${tigerTier === option ? ' active' : ''}`}
                        onClick={() => setTigerTier(option)}
                      >{label}</button>
                    ))}
                </div>
              </label>
            )}
            {scenario === 'wolfHunt' && (
              <label className="sim-field">
                <span>늑대 무리 {wolfCountRandom ? '(랜덤 3~12마리)' : `— ${wolfCount}마리`}</span>
                <div className="sim-inline">
                  <button
                    className={`sim-choice${wolfCountRandom ? ' active' : ''}`}
                    onClick={() => setWolfCountRandom(!wolfCountRandom)}
                  >랜덤</button>
                  <input
                    type="range" min={3} max={12} value={wolfCount} disabled={wolfCountRandom}
                    onChange={event => setWolfCount(Number(event.target.value))}
                  />
                </div>
              </label>
            )}
            <label className="sim-field">
              <span>{offensive ? '사전 정찰 정보' : '경보 여부'}</span>
              {triState(warned, setWarned, offensive ? '정확히 앎' : '경보됨', offensive ? '정보 없음' : '기습')}
            </label>
            {!offensive && (
            <label className="sim-field">
              <span>방책 공성</span>
              {triState(siege, setSiege, '공성', '없음')}
            </label>
            )}
          </section>

          <section className="sim-section">
            <h3>환경</h3>
            <label className="sim-field">
              <span>계절</span>
              <select value={season} onChange={event => setSeason(event.target.value as SimSetting<Season>)}>
                <option value={RANDOM}>랜덤</option>
                {(Object.keys(SEASON_LABELS) as Season[]).map(id => (
                  <option key={id} value={id}>{SEASON_LABELS[id]}</option>
                ))}
              </select>
            </label>
            <label className="sim-field">
              <span>날씨 {weather !== RANDOM && <WeatherIcon weather={weather} size={20} />}</span>
              <select value={weather} onChange={event => setWeather(event.target.value as SimSetting<WeatherId>)}>
                <option value={RANDOM}>랜덤</option>
                {WEATHERS.map(id => (
                  <option key={id} value={id}>{WEATHER_NAMES[id]}</option>
                ))}
              </select>
            </label>
            <label className="sim-field">
              <span>준비점수 {prepMode === 'fixed' ? `— ${prepPoints}` : prepMode === 'auto' ? '(규칙대로 계산)' : '(랜덤)'}</span>
              <div className="sim-choice-row">
                {([['auto', '자동'], ['random', '랜덤'], ['fixed', '지정']] as const).map(([option, label]) => (
                  <button
                    key={option}
                    className={`sim-choice${prepMode === option ? ' active' : ''}`}
                    onClick={() => setPrepMode(option)}
                  >{label}</button>
                ))}
              </div>
              {prepMode === 'fixed' && (
                <input
                  type="range" min={0} max={CONFIG.tacticalBattle.prep.max} value={prepPoints}
                  onChange={event => setPrepPoints(Number(event.target.value))}
                />
              )}
            </label>
          </section>

          <section className="sim-section">
            <h3>{offensive ? '원정대 구성' : '아군 구성'}</h3>
            <div className="sim-choice-row">
              <button
                className={`sim-choice${defendersRandom ? ' active' : ''}`}
                onClick={() => setDefendersRandom(true)}
              >랜덤</button>
              <button
                className={`sim-choice${!defendersRandom ? ' active' : ''}`}
                onClick={() => setDefendersRandom(false)}
              >지정</button>
            </div>
            {!defendersRandom && (
              <div className="sim-count-grid">
                {DEFENDER_FIELDS.filter(field => !offensive || field.key !== 'civilians').map(field => {
                  const mountableKey = isMountableDefenderKey(field.key) ? field.key : null;
                  return (
                    <div className="sim-count" key={field.key} role="group" aria-label={`${field.label} 구성`}>
                      <span>{offensive ? field.offensiveLabel ?? field.label : field.label}</span>
                      <div className="sim-count-inputs">
                        <label>
                          <small>인원</small>
                          <input
                            aria-label={`${offensive ? field.offensiveLabel ?? field.label : field.label} 인원`}
                            type="number" min={0} max={field.max} value={defenders[field.key]}
                            onChange={event => setCount(field.key, Number(event.target.value))}
                          />
                        </label>
                        {mountableKey && (
                          <label>
                            <small>기마</small>
                            <input
                              aria-label={`${offensive ? field.offensiveLabel ?? field.label : field.label} 기마 인원`}
                              type="number" min={0} max={defenders[mountableKey]} value={mountedDefenders[mountableKey]}
                              disabled={defenders[mountableKey] === 0}
                              onChange={event => setMountedCount(mountableKey, Number(event.target.value))}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="sim-field sim-special-field">
              <span>전투 특수주민 {defendersRandom ? '(개별 랜덤)' : ''}</span>
              {defendersRandom ? (
                <small className="sim-enemy-note">아라개·박돌개·단심·사야카의 참가와 전투 가능 인물의 기마 상태를 각각 추첨합니다.</small>
              ) : (
                <div className="sim-special-grid">
                  {COMBAT_SPECIAL_OPTIONS.map(definition => {
                    const selected = combatSpecialResidents.includes(definition.id);
                    const mountable = definition.job === 'militia' || definition.job === 'watchman' || definition.job === 'hunter';
                    const mounted = mountedSpecialResidents.includes(definition.id);
                    return (
                      <div className="sim-special-option" key={definition.id}>
                        <button
                          className={`sim-choice${selected ? ' active' : ''}`}
                          title={definition.name}
                          onClick={() => toggleSpecialResident(definition.id)}
                        ><UiIcon name={definition.badge} size={20} /> {definition.shortName}</button>
                        {mountable && (
                          <button
                            className={`sim-choice sim-mount-choice${mounted ? ' active' : ''}`}
                            disabled={!selected}
                            onClick={() => setMountedSpecialResidents(prev => mounted
                              ? prev.filter(candidate => candidate !== definition.id)
                              : [...prev, definition.id])}
                          ><UiIcon name="mounted" size={20} /> 기마</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {!defendersRandom && offensive && combatantTotal < 2 && (
              <p className="sim-note danger">토벌대는 최소 2명이어야 합니다.</p>
            )}
            {!offensive && (
            <label className="sim-field">
              <span>불랑기포대 {cannonMode === 'fixed' ? `— ${cannonCount}문` : ''}</span>
              <div className="sim-choice-row">
                {([['none', '없음'], ['fixed', '보유'], ['random', '랜덤']] as const).map(([option, label]) => (
                  <button
                    key={option}
                    className={`sim-choice${cannonMode === option ? ' active' : ''}`}
                    onClick={() => setCannonMode(option)}
                  >{label}</button>
                ))}
              </div>
              {cannonMode === 'fixed' && (
                <input
                  type="number" min={1} max={8} value={cannonCount}
                  onChange={event => setCannonCount(Math.max(1, Math.min(8, Math.round(Number(event.target.value)) || 1)))}
                />
              )}
            </label>
            )}
            <p className="sim-note">
              {offensive
                ? '직업과 무기별 인원을 직접 편성합니다. 의원은 후열에서 부상자를 치료합니다. 기마는 기동·돌격·추격에 유리합니다.'
                : defendersRandom
                  ? '인원뿐 아니라 의원·특수주민·군마 편성도 함께 무작위로 생성됩니다.'
                  : '의원은 후열에서 부상자를 치료합니다. 기마는 상시 전력 증가가 아니라 돌격·기동·후퇴·추격과 우회로 이동에 이점을 줍니다.'}
            </p>
          </section>
        </div>

        <div className="menu-actions">
          <button
            className="btn primary menu-btn"
            onClick={start}
            disabled={offensive && !defendersRandom && combatantTotal < 2}
          >전투 시작</button>
          <button className="btn menu-btn" onClick={onBack}>메인 메뉴로</button>
        </div>
      </div>
    </div>
  );
}
