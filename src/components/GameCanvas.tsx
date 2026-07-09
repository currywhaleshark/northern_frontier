// 지도 뷰 — 렌더링은 render/renderer.ts에 위임하고,
// 여기서는 마우스 입력(클릭/호버 툴팁)과 캔버스 수명만 다룬다.
import { useEffect, useRef, useState } from 'react';
import { CONFIG } from '../game/config';
import { JOB_NAMES } from '../game/constants';
import { getActiveSprites } from '../render/atlas';
import { findResidentAt, renderScene } from '../render/renderer';
import { getPointerAction } from '../game/selectionActions';
import type { BuildingTypeId, GameState, SelectedEntity, SmithyProductId } from '../game/types';
import { ActionPopup } from './ActionPopup';
import { FactionName } from './FactionName';

const TILE = CONFIG.ui.tileSize;
const CLICK_RADIUS = Math.round(TILE * 0.65); // 주민 클릭 판정 반경(픽셀)
const DRAG_THRESHOLD = 5; // 이보다 많이 끌면 클릭이 아니라 화면 이동으로 본다

interface Props {
  state: GameState;
  version: number;
  placingType: BuildingTypeId | null;
  selected: { x: number; y: number } | null;
  selectedEntity: SelectedEntity | null;
  selectedResidentId: number | null;
  anim: { at: number; ms: number }; // 마지막 서브틱 시각/간격 (이동 보간용)
  onTileClick: (x: number, y: number) => void;
  onResidentClick: (id: number) => void;
  onContextAction: (x: number, y: number) => void;
  onUpgradeHousing: (buildingId: number, targetType: Extract<BuildingTypeId, 'ondol' | 'tileHouse'>) => void;
  onSetSmithyProduct: (buildingId: number, product: SmithyProductId) => void;
  onRequestTrade: (factionName: string) => void;
  onToggleNitre: () => void;
  onAssignNearestWorker: (buildingId: number) => void;
  onUnassignWorker: (residentId: number) => void;
  onCloseBuildingActions: () => void;
  onCancelPlace: () => void;
}

export function GameCanvas({
  state, version, placingType, selected, selectedEntity, selectedResidentId, anim,
  onTileClick, onResidentClick, onContextAction, onUpgradeHousing, onSetSmithyProduct, onRequestTrade,
  onToggleNitre, onAssignNearestWorker, onUnassignWorker, onCloseBuildingActions, onCancelPlace,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mouse, setMouse] = useState<{ mx: number; my: number } | null>(null);
  const [panning, setPanning] = useState(false);
  // 드래그 패닝 상태 (리렌더 없이 추적)
  const drag = useRef({ active: false, sx: 0, sy: 0, scrollL: 0, scrollT: 0, moved: false });

  const scrollBox = () => canvasRef.current?.closest('.canvas-wrap') as HTMLElement | null;

  const h = state.map.length, w = state.map[0]?.length ?? 0;
  const alpha = Math.max(0, Math.min(1, (performance.now() - anim.at) / anim.ms));
  const hoverTile = mouse
    ? { x: Math.floor(mouse.mx / TILE), y: Math.floor(mouse.my / TILE) }
    : null;
  const hoveredTile = hoverTile ? state.map[hoverTile.y]?.[hoverTile.x] : null;
  const pointerAction = placingType ? null : getPointerAction(state, selectedEntity, hoveredTile);
  const selectedBuildingId = selectedEntity?.kind === 'building' ? selectedEntity.id : null;

  // 매 렌더(≈30fps)마다 장면을 다시 그린다 — 보간 이동 표현
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderScene(canvas, state, {
      alpha, hover: hoverTile, placingType, selected, selectedResidentId,
      selectedBuildingId,
      sprites: getActiveSprites(),
    });
  });

  const toMouse = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { mx: e.clientX - rect.left, my: e.clientY - rect.top };
  };

  // 툴팁 대상: 주민 우선, 그다음 (발견된) 습격 무리
  const hoveredResident = mouse && !placingType
    ? findResidentAt(state, mouse.mx, mouse.my, alpha, CLICK_RADIUS)
    : null;
  let raiderHovered = false;
  if (!hoveredResident && mouse && state.raiders && state.raiders.spotted) {
    const b = state.raiders;
    const bx = (b.px + (b.x - b.px) * alpha) * TILE + TILE / 2;
    const by = (b.py + (b.y - b.py) * alpha) * TILE + TILE / 2;
    raiderHovered = Math.hypot(bx - mouse.mx, by - mouse.my) <= 14;
  }
  const actionTooltip = mouse && !hoveredResident && !raiderHovered && pointerAction && pointerAction.kind !== 'none'
    ? pointerAction
    : null;
  const canvasCursor = placingType
    ? 'crosshair'
    : panning
      ? 'grabbing'
      : hoveredResident
        ? 'pointer'
        : pointerAction && pointerAction.kind !== 'none'
          ? pointerAction.cursor
          : 'grab';

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <canvas
        ref={canvasRef}
        width={w * TILE}
        height={h * TILE}
        data-version={version}
        style={{ cursor: canvasCursor }}
        onPointerDown={e => {
          if (e.button !== 0) return; // 좌클릭만 패닝 시작
          const box = scrollBox();
          if (!box) return;
          drag.current = {
            active: true, moved: false,
            sx: e.clientX, sy: e.clientY,
            scrollL: box.scrollLeft, scrollT: box.scrollTop,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => {
          setMouse(toMouse(e));
          const d = drag.current;
          if (!d.active) return;
          const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
          if (Math.hypot(dx, dy) > DRAG_THRESHOLD && !d.moved) {
            d.moved = true;
            setPanning(true);
          }
          if (d.moved) {
            const box = scrollBox();
            if (box) {
              box.scrollLeft = d.scrollL - dx;
              box.scrollTop = d.scrollT - dy;
            }
          }
        }}
        onPointerUp={e => {
          drag.current.active = false;
          setPanning(false);
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
        }}
        onPointerLeave={() => setMouse(null)}
        onClick={e => {
          // 드래그로 화면을 옮긴 직후의 클릭은 무시한다
          if (drag.current.moved) { drag.current.moved = false; return; }
          const m = toMouse(e);
          const tx = Math.floor(m.mx / TILE), ty = Math.floor(m.my / TILE);
          if (tx < 0 || ty < 0 || tx >= w || ty >= h) return;
          if (!placingType) {
            // 반경 내 가장 가까운 주민을 우선 선택
            const resident = findResidentAt(state, m.mx, m.my, alpha, CLICK_RADIUS);
            if (resident) {
              onResidentClick(resident.id);
              return;
            }
          }
          onTileClick(tx, ty);
        }}
        onContextMenu={e => {
          e.preventDefault();
          if (placingType) {
            onCancelPlace();
            return;
          }
          const m = toMouse(e);
          const tx = Math.floor(m.mx / TILE), ty = Math.floor(m.my / TILE);
          if (tx < 0 || ty < 0 || tx >= w || ty >= h) return;
          onContextAction(tx, ty);
        }}
      />
      {mouse && (hoveredResident || raiderHovered || actionTooltip) && (
        <div className="map-tooltip" style={{ left: mouse.mx + 14, top: mouse.my + 8 }}>
          {hoveredResident ? (
            <>
              <b>{hoveredResident.name}</b> · {JOB_NAMES[hoveredResident.job]}
              <div className="muted">{hoveredResident.task}{hoveredResident.sick ? ' · 앓는 중' : ''}</div>
            </>
          ) : raiderHovered ? (
            <>
              <b><FactionName name={state.raiders!.faction} /></b>
              <div className="muted">{state.raiders!.siege ? '목책 앞 공성 중' : '무장 무리 접근 중'}</div>
            </>
          ) : actionTooltip ? (
            <>
              <b>{actionTooltip.label}</b>
              {actionTooltip.kind === 'invalid' && <div className="muted">명령할 수 없음</div>}
            </>
          ) : null}
        </div>
      )}
      {selectedEntity?.kind === 'building' && (
        <ActionPopup
          state={state}
          buildingId={selectedEntity.id}
          onUpgradeHousing={onUpgradeHousing}
          onSetSmithyProduct={onSetSmithyProduct}
          onRequestTrade={onRequestTrade}
          onToggleNitre={onToggleNitre}
          onAssignNearestWorker={onAssignNearestWorker}
          onUnassignWorker={onUnassignWorker}
          onSelectResident={onResidentClick}
          onClose={onCloseBuildingActions}
        />
      )}
    </div>
  );
}
