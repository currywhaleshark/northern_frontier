// 지도 뷰 — 렌더링은 render/renderer.ts에 위임하고,
// 여기서는 마우스 입력(클릭/호버 툴팁)과 캔버스 수명만 다룬다.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type WheelEvent as ReactWheelEvent } from 'react';
import { CONFIG } from '../game/config';
import { JOB_NAMES, RESOURCE_NAMES } from '../game/constants';
import { buildingCostFor } from '../game/buildings';
import { getActiveSprites, onAtlasAssetSettled } from '../render/atlas';
import { findResidentAt, renderScene, terrainVisualSignature } from '../render/renderer';
import { sceneViewportFromScroll, type SceneViewport } from '../render/sceneViewport';
import { getPointerAction } from '../game/selectionActions';
import { foreignSiteAt } from '../game/foreignSites';
import type { BuildingTypeId, GameState, SelectedEntity } from '../game/types';
import { FactionName } from './FactionName';
import { recordRuntimePerf, recordRuntimePerfSince, runtimePerfStartTime } from '../perf/runtimePerf';
import { steppedMapZoom } from '../ui/mapZoom';

const TILE = CONFIG.ui.tileSize;
const CLICK_RADIUS = Math.round(TILE * 0.65); // 주민 클릭 판정 반경(픽셀)
const DRAG_THRESHOLD = 5; // 이보다 많이 끌면 클릭이 아니라 화면 이동으로 본다
const ANIMATION_FRAME_MS = 1000 / 30;

interface Props {
  state: GameState;
  version: number;
  animationActive: boolean;
  zoom: number;
  placingType: BuildingTypeId | null;
  selected: { x: number; y: number } | null;
  selectedEntity: SelectedEntity | null;
  selectedResidentId: number | null;
  // 마지막 서브틱 시각/간격 (이동 보간용). 스냅샷이 아니라 ref를 받는다 —
  // 게임 루프가 상태를 변이한 그 콜백에서 anim도 함께 갱신하므로, RAF가 그리는 순간
  // ref를 읽어야 "새 위치 + 옛 시각" 불일치 프레임(틱마다 순간이동으로 보임)이 없다.
  anim: { readonly current: { at: number; ms: number } };
  onTileClick: (x: number, y: number) => void;
  onPlacePlot: (x: number, y: number, w: number, h: number) => void;
  onResidentClick: (id: number) => void;
  onContextAction: (x: number, y: number) => void;
  onCancelPlace: () => void;
  onZoomChange: (zoom: number) => void;
}

export function GameCanvas({
  state, version, animationActive, zoom, placingType, selected, selectedEntity, selectedResidentId, anim,
  onTileClick, onPlacePlot, onResidentClick, onContextAction, onCancelPlace, onZoomChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<() => void>(() => undefined);
  const animationFrameRef = useRef<number | null>(null);
  const continuousRenderRef = useRef(false);
  const lastCanvasDrawRef = useRef(0);
  const lastMeasuredCanvasDrawRef = useRef(0);
  const viewportRef = useRef<SceneViewport | null>(null);
  const pointerPositionRef = useRef<{ mx: number; my: number } | null>(null);
  const hoverSemanticKeyRef = useRef('outside');
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [mouse, setMouse] = useState<{ mx: number; my: number } | null>(null);
  const [panning, setPanning] = useState(false);
  // 드래그 패닝 상태 (리렌더 없이 추적)
  const drag = useRef({ active: false, button: 0, sx: 0, sy: 0, scrollL: 0, scrollT: 0, moved: false });
  const zoomAnchorRef = useRef<{ worldX: number; worldY: number; boxX: number; boxY: number } | null>(null);
  // 경작지(밭/논) 배치 중 드래그 크기 지정 — 기준 칸(anchor)에서 현재 칸까지의 사각형
  const isPlotPlacing = placingType === 'field' || placingType === 'paddy';
  const [plotDrag, setPlotDrag] = useState<{ ax: number; ay: number; cx: number; cy: number } | null>(null);

  const scrollBox = () => canvasRef.current?.closest('.canvas-wrap') as HTMLElement | null;

  const requestZoom = (nextZoom: number, clientX?: number, clientY?: number) => {
    if (Math.abs(nextZoom - zoom) < 0.001) return;
    const canvas = canvasRef.current;
    const box = scrollBox();
    if (!canvas || !box) return;
    const boxRect = box.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const anchorClientX = clientX ?? boxRect.left + box.clientWidth / 2;
    const anchorClientY = clientY ?? boxRect.top + box.clientHeight / 2;
    zoomAnchorRef.current = {
      worldX: (anchorClientX - canvasRect.left) * (canvas.width / Math.max(1, canvasRect.width)),
      worldY: (anchorClientY - canvasRect.top) * (canvas.height / Math.max(1, canvasRect.height)),
      boxX: anchorClientX - boxRect.left,
      boxY: anchorClientY - boxRect.top,
    };
    onZoomChange(nextZoom);
  };

  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    const canvas = canvasRef.current;
    const box = scrollBox();
    if (!anchor || !canvas || !box) return;
    zoomAnchorRef.current = null;
    box.scrollLeft = canvas.offsetLeft + anchor.worldX * zoom - anchor.boxX;
    box.scrollTop = canvas.offsetTop + anchor.worldY * zoom - anchor.boxY;
  }, [zoom]);

  const requestCanvasRender = useCallback(() => {
    if (animationFrameRef.current !== null) return;
    const frame = (now: number) => {
      animationFrameRef.current = null;
      if (!continuousRenderRef.current || now - lastCanvasDrawRef.current >= ANIMATION_FRAME_MS) {
        const runtimeProbe = window.__runtimePerf;
        if (runtimeProbe?.active && lastMeasuredCanvasDrawRef.current >= runtimeProbe.startedAt) {
          recordRuntimePerf('frame-interval', lastMeasuredCanvasDrawRef.current, now - lastMeasuredCanvasDrawRef.current, {
            targetMs: ANIMATION_FRAME_MS,
          });
        }
        lastMeasuredCanvasDrawRef.current = runtimeProbe?.active ? now : 0;
        lastCanvasDrawRef.current = now;
        drawRef.current();
      }
      if (continuousRenderRef.current) {
        animationFrameRef.current = requestAnimationFrame(frame);
      }
    };
    animationFrameRef.current = requestAnimationFrame(frame);
  }, []);

  const positionTooltip = useCallback((point: { mx: number; my: number } | null) => {
    const tooltip = tooltipRef.current;
    if (!tooltip || !point) return;
      tooltip.style.transform = `translate3d(${point.mx * zoom + 14}px, ${point.my * zoom + 8}px, 0)`;
  }, [zoom]);

  const h = state.map.length, w = state.map[0]?.length ?? 0;
  const alpha = Math.max(0, Math.min(1, (performance.now() - anim.current.at) / anim.current.ms));
  const hoverTile = mouse
    ? { x: Math.floor(mouse.mx / TILE), y: Math.floor(mouse.my / TILE) }
    : null;
  const hoveredTile = hoverTile ? state.map[hoverTile.y]?.[hoverTile.x] : null;
  const pointerAction = placingType ? null : getPointerAction(state, selectedEntity, hoveredTile);
  const selectedBuildingId = selectedEntity?.kind === 'building' ? selectedEntity.id : null;
  const terrainSignature = useMemo(() => terrainVisualSignature(state), [state, version]);

  const hoverSemanticKey = (point: { mx: number; my: number }): string => {
    const x = Math.floor(point.mx / TILE), y = Math.floor(point.my / TILE);
    const tile = state.map[y]?.[x];
    if (!tile) return 'outside';
    if (placingType) return `placing:${x},${y}`;
    const frameAlpha = Math.max(0, Math.min(1, (performance.now() - anim.current.at) / anim.current.ms));
    const resident = findResidentAt(state, point.mx, point.my, frameAlpha, CLICK_RADIUS);
    if (resident) return `resident:${resident.id}`;
    const raid = state.raiders;
    if (raid?.spotted) {
      const rx = (raid.px + (raid.x - raid.px) * frameAlpha) * TILE + TILE / 2;
      const ry = (raid.py + (raid.y - raid.py) * frameAlpha) * TILE + TILE / 2;
      if (Math.hypot(rx - point.mx, ry - point.my) <= 14) return 'raider';
    }
    const site = foreignSiteAt(state, x, y);
    if (site) return `site:${site.id}`;
    const action = getPointerAction(state, selectedEntity, tile);
    return action.kind === 'none' ? `tile:${x},${y}` : `action:${x},${y}:${action.kind}:${action.label}`;
  };

  // 배치 모드가 끝나면 진행 중이던 크기 지정도 버린다
  useEffect(() => {
    if (!isPlotPlacing) setPlotDrag(null);
  }, [isPlotPlacing]);

  const maxSide = CONFIG.farming.maxPlotSide;
  const clampTo = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
  const plotRectFrom = (dragState: { ax: number; ay: number; cx: number; cy: number }) => {
    const x = Math.min(dragState.ax, dragState.cx);
    const y = Math.min(dragState.ay, dragState.cy);
    return {
      x, y,
      w: Math.abs(dragState.cx - dragState.ax) + 1,
      h: Math.abs(dragState.cy - dragState.ay) + 1,
    };
  };
  // 미리보기 사각형: 드래그 중이면 그 범위, 아니면 호버 칸 1×1
  const placingRect = isPlotPlacing
    ? (plotDrag
      ? plotRectFrom(plotDrag)
      : (hoverTile && hoverTile.x >= 0 && hoverTile.y >= 0 && hoverTile.x < w && hoverTile.y < h
        ? { x: hoverTile.x, y: hoverTile.y, w: 1, h: 1 }
        : null))
    : null;

  drawRef.current = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const frameAlpha = Math.max(0, Math.min(1, (performance.now() - anim.current.at) / anim.current.ms));
    const perf = window.__renderPerf;
    const start = perf ? performance.now() : 0;
    const runtimeDrawStart = runtimePerfStartTime();
    renderScene(canvas, state, {
      alpha: frameAlpha, hover: hoverTile, placingType, placingRect, selected, selectedResidentId,
      selectedBuildingId, viewport: viewportRef.current ?? undefined, terrainVisualSignature: terrainSignature,
      sprites: getActiveSprites(),
    });
    if (perf) {
      const bucket = perf['renderScene-total'] ?? (perf['renderScene-total'] = { total: 0, count: 0 });
      bucket.total += performance.now() - start;
      bucket.count++;
    }
    recordRuntimePerfSince('canvas-draw', runtimeDrawStart, {
      residents: state.residents.length,
      buildings: state.buildings.length,
    });
  };

  // 보간은 App 전체 React 렌더와 분리한다. 정지 중에는 상호작용/상태 변경마다 한 프레임만 그린다.
  useEffect(() => {
    const syncAnimationState = () => {
      continuousRenderRef.current = animationActive && !document.hidden;
      requestCanvasRender();
    };
    syncAnimationState();
    document.addEventListener('visibilitychange', syncAnimationState);
    return () => {
      document.removeEventListener('visibilitychange', syncAnimationState);
      continuousRenderRef.current = false;
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    };
  }, [animationActive, requestCanvasRender]);

  useEffect(() => {
    requestCanvasRender();
  });

  useEffect(() => onAtlasAssetSettled(requestCanvasRender), [requestCanvasRender]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const box = scrollBox();
    if (!canvas || !box) return;
    const updateViewport = () => {
      viewportRef.current = sceneViewportFromScroll({
        scrollLeft: box.scrollLeft / zoom,
        scrollTop: box.scrollTop / zoom,
        clientWidth: box.clientWidth / zoom,
        clientHeight: box.clientHeight / zoom,
        canvasLeft: canvas.offsetLeft / zoom,
        canvasTop: canvas.offsetTop / zoom,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        tileSize: TILE,
        overscanTiles: 1,
      });
      requestCanvasRender();
    };
    updateViewport();
    box.addEventListener('scroll', updateViewport, { passive: true });
    const resizeObserver = new ResizeObserver(updateViewport);
    resizeObserver.observe(box);
    return () => {
      box.removeEventListener('scroll', updateViewport);
      resizeObserver.disconnect();
    };
  }, [requestCanvasRender, zoom]);

  useEffect(() => {
    positionTooltip(pointerPositionRef.current);
  });

  const toMouse = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      mx: (e.clientX - rect.left) * (canvasRef.current!.width / Math.max(1, rect.width)),
      my: (e.clientY - rect.top) * (canvasRef.current!.height / Math.max(1, rect.height)),
    };
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    requestZoom(steppedMapZoom(zoom, event.deltaY), event.clientX, event.clientY);
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
  const hoveredSite = !hoveredResident && !raiderHovered && hoverTile
    ? foreignSiteAt(state, hoverTile.x, hoverTile.y)
    : null;
  const actionTooltip = mouse && !hoveredResident && !raiderHovered && !hoveredSite && pointerAction && pointerAction.kind !== 'none'
    ? pointerAction
    : null;
  const canvasCursor = placingType
    ? 'crosshair'
    : panning
      ? 'grabbing'
      : hoveredResident || hoveredSite
        ? 'pointer'
        : pointerAction && pointerAction.kind !== 'none'
          ? pointerAction.cursor
          : 'grab';

  return (
    <div style={{ position: 'relative', display: 'inline-block', width: w * TILE * zoom, height: h * TILE * zoom }}>
      <canvas
        ref={canvasRef}
        width={w * TILE}
        height={h * TILE}
        data-version={version}
        style={{ cursor: canvasCursor, width: '100%', height: '100%' }}
        onWheel={handleWheel}
        onPointerDown={e => {
          // 경작지 배치 중에는 좌클릭 드래그가 화면 이동이 아니라 크기 지정이다
          if (isPlotPlacing && e.button === 0) {
            const m = toMouse(e);
            const tx = Math.floor(m.mx / TILE), ty = Math.floor(m.my / TILE);
            if (tx < 0 || ty < 0 || tx >= w || ty >= h) return;
            setPlotDrag({ ax: tx, ay: ty, cx: tx, cy: ty });
            e.currentTarget.setPointerCapture(e.pointerId);
            return;
          }
          // 좌클릭(평시) 또는 중클릭(배치 중 포함)으로 패닝 시작
          if (e.button !== 0 && e.button !== 1) return;
          if (e.button === 0 && isPlotPlacing) return;
          const box = scrollBox();
          if (!box) return;
          drag.current = {
            active: true, moved: false, button: e.button,
            sx: e.clientX, sy: e.clientY,
            scrollL: box.scrollLeft, scrollT: box.scrollTop,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => {
          const point = toMouse(e);
          pointerPositionRef.current = point;
          positionTooltip(point);
          const nextHoverKey = hoverSemanticKey(point);
          if (nextHoverKey !== hoverSemanticKeyRef.current) {
            hoverSemanticKeyRef.current = nextHoverKey;
            setMouse(point);
          }
          if (plotDrag) {
            const m = point;
            // 기준 칸에서 최대 변 길이만큼만 늘어난다 (지도 밖 금지)
            const cx = clampTo(Math.floor(m.mx / TILE), Math.max(0, plotDrag.ax - (maxSide - 1)), Math.min(w - 1, plotDrag.ax + (maxSide - 1)));
            const cy = clampTo(Math.floor(m.my / TILE), Math.max(0, plotDrag.ay - (maxSide - 1)), Math.min(h - 1, plotDrag.ay + (maxSide - 1)));
            if (cx !== plotDrag.cx || cy !== plotDrag.cy) setPlotDrag({ ...plotDrag, cx, cy });
            return;
          }
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
          if (plotDrag) {
            const rect = plotRectFrom(plotDrag);
            setPlotDrag(null);
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
            onPlacePlot(rect.x, rect.y, rect.w, rect.h);
            return;
          }
          const resetZoom = drag.current.button === 1 && !drag.current.moved;
          drag.current.active = false;
          setPanning(false);
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
          if (resetZoom) requestZoom(1);
        }}
        onAuxClick={e => e.preventDefault()}
        onPointerLeave={() => {
          pointerPositionRef.current = null;
          hoverSemanticKeyRef.current = 'outside';
          setMouse(null);
        }}
        onClick={e => {
          // 경작지 배치는 pointerup에서 이미 처리되었다
          if (isPlotPlacing) return;
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
            setPlotDrag(null);
            onCancelPlace();
            return;
          }
          const m = toMouse(e);
          const tx = Math.floor(m.mx / TILE), ty = Math.floor(m.my / TILE);
          if (tx < 0 || ty < 0 || tx >= w || ty >= h) return;
          onContextAction(tx, ty);
        }}
      />
      {mouse && placingRect && placingType && (
        <div ref={tooltipRef} className="map-tooltip" style={{ left: 0, top: 0 }}>
          <b>{placingRect.w}×{placingRect.h} ({placingRect.w * placingRect.h}칸)</b>
          <div className="muted">
            {Object.entries(buildingCostFor(placingType, placingRect.w, placingRect.h))
              .map(([res, amt]) => `${RESOURCE_NAMES[res as keyof typeof RESOURCE_NAMES] ?? res} ${amt}`)
              .join(' · ')}
            {' · 농부 '}
            {Math.max(1, Math.ceil((placingRect.w * placingRect.h) / CONFIG.farming.tilesPerFarmer))}명
          </div>
          <div className="muted">끌어서 크기 지정 (최대 {CONFIG.farming.maxPlotSide}×{CONFIG.farming.maxPlotSide})</div>
        </div>
      )}
      {mouse && (hoveredResident || raiderHovered || hoveredSite || actionTooltip) && (
        <div ref={tooltipRef} className="map-tooltip" style={{ left: 0, top: 0 }}>
          {hoveredResident ? (
            <>
              <b>{hoveredResident.name}</b> · {JOB_NAMES[hoveredResident.job]}
              <div className="muted">{hoveredResident.task}{hoveredResident.sick ? ' · 앓는 중' : ''}</div>
            </>
          ) : raiderHovered ? (
            <>
              <b><FactionName name={state.raiders!.faction} /></b>
              <div className="muted">{state.battle
                ? state.battle.location === 'village' || state.battle.mode === 'levy' ? '마을 안 방어전' : '마을 외곽 요격전'
                : state.raiders!.siege ? '목책 앞 공성 중' : '무장 무리 접근 중'}</div>
            </>
          ) : hoveredSite ? (
            <>
              <b>{hoveredSite.name}</b>
              <div className="muted">{hoveredSite.factionName ? <FactionName name={hoveredSite.factionName} /> : '주인 없는 거점'} · 클릭해 살펴보기</div>
            </>
          ) : actionTooltip ? (
            <>
              <b>{actionTooltip.label}</b>
              {actionTooltip.kind === 'invalid' && <div className="muted">명령할 수 없음</div>}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
