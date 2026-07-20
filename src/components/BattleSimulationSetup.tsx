// 전투 시뮬레이션 설정 화면 — 메인 메뉴에서 진입해 조건을 지정/랜덤으로 고르고 전투만 테스트한다
import { useState } from 'react';
import { CONFIG } from '../game/config';
import { WEATHER_ICONS, WEATHER_NAMES } from '../game/constants';
import {
  BATTLE_SIMULATION_ENEMIES,
  type BattleSimDefenderCounts, type BattleSimulationOptions, type BattleSimulationScenario, type SimSetting,
} from '../game/battleSimulation';
import { enemyDoctrineDefinition, eligibleEnemyDoctrines } from '../game/enemyPlan';
import { tacticalCompositionTemplates, tacticalEnemyFactionId } from '../game/tacticalCompositions';
import type { BattleMode, EnemyDoctrineId, Season, TacticalRouteSide, TigerTier, WeatherId } from '../game/types';

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
  { key: 'unarmedMilitia', label: '맨손 수비병', offensiveLabel: '경무장 토벌대', max: 8 },
  { key: 'watchmen', label: '파수꾼', max: 6 },
  { key: 'hunters', label: '사냥꾼', max: 8 },
  { key: 'civilians', label: '피난 주민', max: 16 },
];

const DEFAULT_DEFENDERS: BattleSimDefenderCounts = {
  muskets: 1, bows: 2, spears: 2, unarmedMilitia: 1, watchmen: 2, hunters: 2, civilians: 6,
};

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
  const [cannonMode, setCannonMode] = useState<'none' | 'fixed' | 'random'>('none');
  const [cannonCount, setCannonCount] = useState(1);
  const [tigerTier, setTigerTier] = useState<SimSetting<TigerTier>>(RANDOM);
  const [wolfCountRandom, setWolfCountRandom] = useState(true);
  const [wolfCount, setWolfCount] = useState(6);
  const [enemyDoctrine, setEnemyDoctrine] = useState<EnemyDoctrineId | 'auto'>('auto');
  const [enemyTemplateId, setEnemyTemplateId] = useState<string>('auto');
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

  const setCount = (key: keyof BattleSimDefenderCounts, value: number) =>
    setDefenders(prev => ({ ...prev, [key]: Math.max(0, Math.min(20, Math.round(value) || 0)) }));

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
    enemyFlankRoute: offensive ? 'auto' : enemyFlankRoute,
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
              <span>후방 우회 경로 강제</span>
              <div className="sim-choice-row">
                {([['auto', '자동'], ['left', '좌측'], ['right', '우측'], ['none', '없음']] as const).map(([option, label]) => (
                  <button
                    key={option}
                    className={`sim-choice${enemyFlankRoute === option ? ' active' : ''}`}
                    onClick={() => setEnemyFlankRoute(option)}
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
              <span>날씨</span>
              <select value={weather} onChange={event => setWeather(event.target.value as SimSetting<WeatherId>)}>
                <option value={RANDOM}>랜덤</option>
                {WEATHERS.map(id => (
                  <option key={id} value={id}>{WEATHER_ICONS[id]} {WEATHER_NAMES[id]}</option>
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
                {DEFENDER_FIELDS.filter(field => !offensive || field.key !== 'civilians').map(field => (
                  <label className="sim-count" key={field.key}>
                    <span>{offensive ? field.offensiveLabel ?? field.label : field.label}</span>
                    <input
                      type="number" min={0} max={field.max} value={defenders[field.key]}
                      onChange={event => setCount(field.key, Number(event.target.value))}
                    />
                  </label>
                ))}
              </div>
            )}
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
                ? '직업과 무기별 인원을 직접 편성합니다. 사냥꾼 수와 숙련은 맹수 추적·함정·준비점수에 반영됩니다.'
                : '조총 수비대나 불랑기포대를 넣으면 화약이 자동으로 지급됩니다. 민병 방어를 고르면 피난 주민 일부가 소집 민병으로 합류합니다.'}
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
