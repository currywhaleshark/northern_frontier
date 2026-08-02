// 메인 메뉴 — 새 개척 설정, 저장 이어하기, 보조 화면의 진입점만 맡는다.
import { MenuSnowLayer } from './MenuSnowLayer';

interface Props {
  canContinue: boolean;
  onStart: () => void;
  onStartTutorial: () => void;
  onContinue: () => void;
  onOpenBattleSim: () => void;
  onOpenSettings: () => void;
}

export function MainMenu({
  canContinue, onStart, onStartTutorial, onContinue, onOpenBattleSim, onOpenSettings,
}: Props) {
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

        <div className="menu-actions">
          <button className="btn primary menu-btn" onClick={onStart}>시작</button>
          <button className="btn menu-btn" onClick={onStartTutorial} title="고정된 마을에서 두 해 살림을 안내합니다 — 첫 겨울을 넘기고, 세공·교역·첫 습격까지">
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
