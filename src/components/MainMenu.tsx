// 메인 메뉴 — 난이도 선택 후 새 개척을 시작하거나 저장을 이어한다
import { useState } from 'react';
import { CONFIG } from '../game/config';
import {
  generateSettlementName, normalizeSettlementNameInput, SETTLEMENT_NAME_MAX_LENGTH,
} from '../game/settlementName';
import type { Difficulty } from '../game/types';
import { MenuSnowLayer } from './MenuSnowLayer';

interface Props {
  canContinue: boolean;
  onStart: (difficulty: Difficulty, settlementName: string) => void;
  onStartTutorial: () => void;
  onContinue: () => void;
  onOpenBattleSim: () => void;
  onOpenSettings: () => void;
}

const DIFF_ORDER: Difficulty[] = ['easy', 'normal', 'hard'];

// UI 전용 nonce — 게임 시드·시뮬레이션 RNG와 무관하게 후보 문자열만 만든다.
function rollCandidateName(): string {
  return generateSettlementName(Math.floor(Math.random() * 2 ** 31));
}

export function MainMenu({
  canContinue, onStart, onStartTutorial, onContinue, onOpenBattleSim, onOpenSettings,
}: Props) {
  const [diff, setDiff] = useState<Difficulty>('normal');
  // 화면이 열릴 때 랜덤 후보 하나가 이미 입력되어 있다 — 그대로 시작하거나 고친다.
  const [name, setName] = useState(() => rollCandidateName());
  const trimmedName = normalizeSettlementNameInput(name);

  return (
    <div className="main-menu">
      <MenuSnowLayer />
      <div className="menu-panel">
        <h1 className="menu-title">북새 <span className="hanja">北塞</span></h1>
        <div className="menu-subtitle">육진 너머 — 혹한의 개척지</div>
        <p className="menu-desc">
          조정의 명을 받아 두만강 이북의 변경에 개척지를 세우십시오.
          계절을 대비해 마을의 살림과 방비를 갖추고, 북방 세력과 교역하거나 맞서며
          작은 개척지를 보(堡)와 진(鎭)을 거쳐 부(府)로 성장시키십시오.
        </p>

        <div className="diff-row">
          {DIFF_ORDER.map(id => {
            const d = CONFIG.difficulty[id];
            return (
              <button
                key={id}
                className={`diff-card${diff === id ? ' selected' : ''}`}
                onClick={() => setDiff(id)}
              >
                <div className="diff-name">{d.name}</div>
                <div className="diff-tag">{d.tag}</div>
                <div className="diff-desc">{d.desc}</div>
              </button>
            );
          })}
        </div>

        <div className="settlement-name-row">
          <label className="settlement-name-label" htmlFor="settlement-name-input">정착지 이름</label>
          <input
            id="settlement-name-input"
            className="settlement-name-input"
            value={name}
            maxLength={SETTLEMENT_NAME_MAX_LENGTH}
            onChange={event => setName(event.target.value)}
            placeholder="이름을 지어 주십시오"
          />
          <button
            type="button"
            className="btn settlement-name-dice"
            aria-label="정착지 이름 무작위 생성"
            title="다른 이름을 굴려 봅니다"
            onClick={() => setName(rollCandidateName())}
          >
            🎲
          </button>
        </div>

        <div className="menu-actions">
          <button
            className="btn primary menu-btn"
            disabled={!trimmedName}
            title={trimmedName ? undefined : '정착지 이름을 지어야 합니다'}
            onClick={() => trimmedName && onStart(diff, trimmedName)}
          >
            개척 시작
          </button>
          <button className="btn menu-btn" onClick={onStartTutorial} title="고정된 마을에서 첫 겨울까지 기본 살림을 안내합니다">
            길잡이 (튜토리얼)
          </button>
          {canContinue && (
            <button className="btn menu-btn" onClick={onContinue}>이어하기</button>
          )}
          <button className="btn menu-btn" onClick={onOpenBattleSim}>전투 시뮬레이션</button>
          <button className="btn menu-btn" onClick={onOpenSettings}>설정</button>
        </div>

        <div className="menu-footer muted small">
          그래픽: Kenney (CC0) · 조선후기풍 대체역사 생존 경영 프로토타입
        </div>
      </div>
    </div>
  );
}
