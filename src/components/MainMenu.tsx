// 메인 메뉴 — 난이도 선택 후 새 개척을 시작하거나 저장을 이어한다
import { useState } from 'react';
import { CONFIG } from '../game/config';
import type { Difficulty } from '../game/types';

interface Props {
  canContinue: boolean;
  onStart: (difficulty: Difficulty) => void;
  onStartTutorial: () => void;
  onContinue: () => void;
  onOpenBattleSim: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
}

const DIFF_ORDER: Difficulty[] = ['easy', 'normal', 'hard'];

export function MainMenu({
  canContinue, onStart, onStartTutorial, onContinue, onOpenBattleSim, soundOn, onToggleSound,
}: Props) {
  const [diff, setDiff] = useState<Difficulty>('normal');

  return (
    <div className="main-menu">
      <div className="menu-panel">
        <h1 className="menu-title">북새 <span className="hanja">北塞</span></h1>
        <div className="menu-subtitle">육진 너머 — 혹한의 개척지</div>
        <p className="menu-desc">
          조정의 명을 받아 두만강 이북의 변경에 개척지를 세우십시오.
          짧은 봄과 여름 동안 식량과 장작을 모으고, 목책을 두르고,
          북방 세력과 거래하거나 맞서며 다섯 해의 겨울을 버텨야 합니다.
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

        <div className="menu-actions">
          <button className="btn primary menu-btn" onClick={() => onStart(diff)}>개척 시작</button>
          <button className="btn menu-btn" onClick={onStartTutorial} title="고정된 마을에서 첫 겨울까지 기본 살림을 안내합니다">
            길잡이 (튜토리얼)
          </button>
          {canContinue && (
            <button className="btn menu-btn" onClick={onContinue}>이어하기</button>
          )}
          <button className="btn menu-btn" onClick={onOpenBattleSim}>전투 시뮬레이션</button>
          <button className="btn menu-btn" onClick={onToggleSound} title={soundOn ? '배경음과 효과음 끄기' : '배경음과 효과음 켜기'}>
            {soundOn ? '🔊 소리 끄기' : '🔇 소리 켜기'}
          </button>
        </div>

        <div className="menu-footer muted small">
          그래픽: Kenney (CC0) · 조선후기풍 대체역사 생존 경영 프로토타입
        </div>
      </div>
    </div>
  );
}
