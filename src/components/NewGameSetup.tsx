import { useState } from 'react';
import { CONFIG } from '../game/config';
import {
  defaultNewGameOptions, MAX_NEW_GAME_SEED, SETUP_LEVEL_NAMES, tuningForDifficulty,
} from '../game/newGameOptions';
import {
  generateSettlementName, normalizeSettlementNameInput, SETTLEMENT_NAME_MAX_LENGTH,
} from '../game/settlementName';
import type { Difficulty, MapRegion, MapSize, NewGameOptions } from '../game/types';
import { MenuSnowLayer } from './MenuSnowLayer';

interface Props {
  onStart: (options: NewGameOptions) => void;
  onBack: () => void;
}

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
const REGIONS: Array<{ id: MapRegion; name: string; detail: string; enabled?: boolean }> = [
  { id: 'plains', name: '평원', detail: '넓은 들판과 강가에서 균형 있게 개척을 시작합니다.', enabled: true },
  { id: 'mountain', name: '산지', detail: '내부 능선과 깊은 숲. 물과 평지는 부족하지만 광물과 사냥감이 풍부합니다.', enabled: true },
  { id: 'lake', name: '호수', detail: '큰 호수와 풍부한 물. 목재와 광물, 가용 평지는 부족합니다.', enabled: true },
  { id: 'coast', name: '해안', detail: '얼지 않는 바다와 자염. 소금은 풍부하지만 담수와 농지는 부족합니다.', enabled: true },
];
const SIZES: Array<{ id: MapSize; name: string; detail: string }> = [
  { id: 'small', name: '소형', detail: '56×56 · 짧고 밀도 높은 개척지입니다.' },
  { id: 'medium', name: '중형', detail: '72×72 · 현재 표준 지도 크기입니다.' },
  { id: 'large', name: '대형', detail: '96×96 · 넓은 변경을 장기적으로 개척합니다.' },
];

function rollCandidateName(): string {
  return generateSettlementName(Math.floor(Math.random() * 2 ** 31));
}

export function NewGameSetup({ onStart, onBack }: Props) {
  const [options, setOptions] = useState<NewGameOptions>(() => ({
    ...defaultNewGameOptions(), settlementName: rollCandidateName(),
  }));
  const [seedInput, setSeedInput] = useState('');
  const settlementName = normalizeSettlementNameInput(options.settlementName);
  const trimmedSeed = seedInput.trim();
  const parsedSeed = trimmedSeed === '' ? undefined : Number(trimmedSeed);
  const seedIsInteger = trimmedSeed === '' || (
    /^\d+$/.test(trimmedSeed) && parsedSeed != null &&
    Number.isSafeInteger(parsedSeed) && parsedSeed <= MAX_NEW_GAME_SEED
  );

  const chooseDifficulty = (difficulty: Difficulty) => {
    setOptions(current => ({
      ...current,
      difficultyPreset: difficulty,
      baseDifficulty: difficulty,
      tuning: tuningForDifficulty(difficulty),
    }));
  };

  const start = () => {
    if (!settlementName || !seedIsInteger) return;
    onStart({
      ...options,
      settlementName,
      seed: trimmedSeed === '' ? undefined : Number(trimmedSeed),
    });
  };

  return (
    <div className="main-menu new-game-setup">
      <MenuSnowLayer />
      <main className="menu-panel new-game-setup-panel">
        <header className="new-game-setup-heading">
          <button className="btn" onClick={onBack}>← 메인 메뉴</button>
          <div>
            <h1 className="menu-title">새 개척 설정</h1>
            <p className="menu-subtitle">혹한의 변경에 세울 첫 정착지를 정합니다.</p>
          </div>
        </header>

        <section className="new-game-setup-section">
          <label className="settlement-name-label" htmlFor="new-settlement-name">정착지 이름</label>
          <div className="settlement-name-row">
            <input id="new-settlement-name" className="settlement-name-input" value={options.settlementName}
              maxLength={SETTLEMENT_NAME_MAX_LENGTH} onChange={event => setOptions(current => ({ ...current, settlementName: event.target.value }))}
              placeholder="이름을 지어 주십시오" />
            <span className="settlement-name-unit">촌</span>
            <button type="button" className="btn settlement-name-dice" aria-label="정착지 이름 무작위 생성"
              title="다른 이름을 굴려 봅니다" onClick={() => setOptions(current => ({ ...current, settlementName: rollCandidateName() }))}>🎲</button>
          </div>
        </section>

        <section className="new-game-setup-section">
          <h2>난이도</h2>
          <div className="diff-row">
            {DIFFICULTIES.map(id => {
              const difficulty = CONFIG.difficulty[id];
              return <button key={id} className={`diff-card${options.difficultyPreset === id ? ' selected' : ''}`} onClick={() => chooseDifficulty(id)}>
                <div className="diff-name">{difficulty.name}</div><div className="diff-tag">{difficulty.tag}</div><div className="diff-desc">{difficulty.desc}</div>
              </button>;
            })}
          </div>
        </section>

        <section className="new-game-setup-section setup-seed-row">
          <label htmlFor="new-game-seed">세계 시드 <span className="muted small">비워 두면 무작위</span></label>
          <input id="new-game-seed" inputMode="numeric" value={seedInput} onChange={event => setSeedInput(event.target.value)} placeholder="무작위" aria-invalid={!seedIsInteger} />
          {!seedIsInteger && <p className="setup-input-error">0~{MAX_NEW_GAME_SEED} 사이의 정수를 입력해 주십시오.</p>}
        </section>

        <section className="new-game-setup-section"><h2>지역</h2><div className="setup-card-row">
          {REGIONS.map(region => <button key={region.id} className={`setup-card${options.region === region.id ? ' selected' : ''}`}
            disabled={!region.enabled} title={region.enabled ? undefined : `${region.detail} 준비 중`}
            onClick={() => setOptions(current => ({ ...current, region: region.id }))}>
            <strong>{region.name}</strong><span>{region.enabled ? region.detail : `준비 중 · ${region.detail}`}</span>
          </button>)}
        </div></section>
        <section className="new-game-setup-section"><h2>지도 크기</h2><div className="setup-card-row">
          {SIZES.map(size => <button key={size.id} className={`setup-card${options.mapSize === size.id ? ' selected' : ''}`}
            onClick={() => setOptions(current => ({ ...current, mapSize: size.id }))}>
            <strong>{size.name}</strong><span>{size.detail}</span>
          </button>)}
        </div></section>

        <details className="new-game-tuning"><summary>세부 설정 <span>준비 중</span></summary><div>
          {([
            ['시작 자원', options.tuning.startingResources],
            ['자원 밀도', options.tuning.resourceDensity],
            ['기후 강도', options.tuning.climateSeverity],
            ['위협 수준', options.tuning.threat],
          ] as const).map(([label, level]) => <label key={label}>{label}
            <select disabled value={level}><option value={level}>{SETUP_LEVEL_NAMES[level]}</option></select>
          </label>)}
          <p className="muted small">난이도 프리셋의 파생값을 보여 줍니다. 개별 변경은 후속 단계에서 열립니다.</p>
        </div></details>

        <div className="new-game-setup-actions">
          <button className="btn" onClick={onBack}>뒤로 가기</button>
          <button className="btn primary menu-btn" disabled={!settlementName || !seedIsInteger} onClick={start}>개척 시작</button>
        </div>
      </main>
    </div>
  );
}
