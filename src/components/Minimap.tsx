import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { CONFIG } from '../game/config';
import { buildingFootprintDims } from '../game/buildings';
import { FACTIONS } from '../game/constants';
import { visibleMinimapForeignSiteParties, visibleMinimapRaid, visibleMinimapSites } from '../game/minimap';
import { foreignSitePartyKindLabel } from '../game/foreignSiteSimulation';
import { activeExpeditionTargetMarkers } from '../game/expeditionTargets';
import type { ForeignSite, GameState, Terrain } from '../game/types';
import { terrainVisualSignature } from '../render/renderer';
import { recordRuntimePerfSince, runtimePerfStartTime } from '../perf/runtimePerf';
import {
  minimapBaseInvalidationKey,
  minimapOverlayInvalidationKey,
} from './minimapRenderModel';
import { BuildingFinder } from './BuildingFinder';

const TILE = CONFIG.ui.tileSize;
const MAP_SIZE = 188;
const MAP_PADDING = 8;

export function mapViewportScale(box: HTMLDivElement): number {
  const canvas = box.querySelector('canvas[data-version]');
  if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0) return 1;
  // 백킹 캔버스는 고배율 줌에서 2배로 커진다(data-render-scale). 여기서 필요한 값은
  // "논리 픽셀당 화면 픽셀"이므로 백킹 배율을 나눠서 되돌려야 미니맵 뷰포트가 어긋나지 않는다.
  const renderScale = Number(canvas.dataset.renderScale);
  const backingScale = Number.isFinite(renderScale) && renderScale > 0 ? renderScale : 1;
  const scale = canvas.getBoundingClientRect().width / (canvas.width / backingScale);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

export function centerViewportOnTile(box: HTMLDivElement, x: number, y: number): void {
  const scale = mapViewportScale(box);
  box.scrollTo({
    left: MAP_PADDING + (x + 0.5) * TILE * scale - box.clientWidth / 2,
    top: MAP_PADDING + (y + 0.5) * TILE * scale - box.clientHeight / 2,
  });
}

export function centerViewportOnSettlement(state: GameState, box: HTMLDivElement): void {
  const center = state.buildings.find(building => building.type === 'center');
  if (!center) return;
  const dims = buildingFootprintDims(center);
  centerViewportOnTile(box, center.x + (dims.w - 1) / 2, center.y + (dims.h - 1) / 2);
}

const TERRAIN_COLORS: Record<Terrain, string> = {
  forest: '#274938',
  plain: '#536447',
  mudflat: '#73664f',
  river: '#3f7188',
  lake: '#356b82',
  sea: '#245873',
  mountain: '#4a4b4b',
  fertile: '#788257',
  rock: '#6b6863',
  center: '#7b6a45',
};

const SITE_TYPE_NAMES: Record<ForeignSite['type'], string> = {
  village: '정착촌',
  fishingVillage: '어촌',
  seasonalCamp: '계절 야영지',
  outpost: '초소',
  banditLair: '산채',
  ruin: '폐허',
};

interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Props {
  state: GameState;
  version: number;
  animationActive: boolean;
  viewportRef: RefObject<HTMLDivElement>;
  selected: { x: number; y: number } | null;
  selectedBuildingId: number | null;
  onFocusBuilding: (buildingId: number) => void;
  // 미니맵으로 시점을 옮긴 순간 (튜토리얼 0단계의 minimapClicked 플래그)
  onNavigate?: () => void;
}

function factionColor(site: ForeignSite): string {
  if (site.type === 'banditLair') return '#d45e52';
  if (site.type === 'ruin' || site.status === 'abandoned' || site.status === 'burned') return '#858585';
  return FACTIONS.find(faction => faction.name === site.factionName)?.color ?? '#d2a958';
}

function drawSite(ctx: CanvasRenderingContext2D, site: ForeignSite, sx: number, sy: number): void {
  const color = factionColor(site);
  ctx.fillStyle = color;
  ctx.strokeStyle = '#15181b';
  ctx.lineWidth = 1;
  if (site.type === 'banditLair' || site.type === 'outpost') {
    ctx.beginPath();
    ctx.moveTo(sx, sy - 4);
    ctx.lineTo(sx + 4, sy + 4);
    ctx.lineTo(sx - 4, sy + 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (site.type === 'seasonalCamp') {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-3, -3, 6, 6);
    ctx.strokeRect(-3.5, -3.5, 7, 7);
    ctx.restore();
  } else if (site.type === 'ruin') {
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx - 3, sy - 3);
    ctx.lineTo(sx + 3, sy + 3);
    ctx.moveTo(sx + 3, sy - 3);
    ctx.lineTo(sx - 3, sy + 3);
    ctx.stroke();
  } else {
    ctx.fillRect(sx - 3, sy - 3, 7, 7);
    ctx.strokeRect(sx - 3.5, sy - 3.5, 7, 7);
  }
}

function recordMinimapRedraw(name: 'minimap-base-redraw' | 'minimap-overlay-redraw', startedAt: number): void {
  const perf = window.__renderPerf;
  if (!perf) return;
  const bucket = perf[name] ?? (perf[name] = { total: 0, count: 0 });
  bucket.total += performance.now() - startedAt;
  bucket.count++;
}

export function Minimap({
  state, version, animationActive, viewportRef, selected, selectedBuildingId, onFocusBuilding, onNavigate,
}: Props) {
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);
  const [viewport, setViewport] = useState<ViewportRect>({ left: 0, top: 0, width: 1, height: 1 });
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const mapHeight = state.map.length;
  const mapWidth = state.map[0]?.length ?? 1;
  const minimapHeight = Math.round(MAP_SIZE * mapHeight / mapWidth);
  const visibleRaid = visibleMinimapRaid(state);
  const visibleSites = visibleMinimapSites(state);
  const visibleParties = visibleMinimapForeignSiteParties(state);
  const targetMarkers = activeExpeditionTargetMarkers(state);
  const baseInvalidationKey = useMemo(() => minimapBaseInvalidationKey({
    terrainSignature: terrainVisualSignature(state),
    explored: state.exploration.explored,
    buildings: state.buildings,
    claimZones: state.claimZones,
    sites: visibleMinimapSites(state),
  }), [state, version]);
  const overlayInvalidationKey = minimapOverlayInvalidationKey({
    mapWidth,
    mapHeight,
    viewport,
    selected,
    raid: visibleRaid,
    parties: visibleParties,
    targets: targetMarkers,
  });

  const readViewport = useCallback(() => {
    const box = viewportRef.current;
    if (!box) return;
    const scale = mapViewportScale(box);
    const worldWidth = mapWidth * TILE * scale;
    const worldHeight = mapHeight * TILE * scale;
    setViewport({
      left: Math.max(0, box.scrollLeft - MAP_PADDING) / worldWidth,
      top: Math.max(0, box.scrollTop - MAP_PADDING) / worldHeight,
      width: Math.min(1, box.clientWidth / worldWidth),
      height: Math.min(1, box.clientHeight / worldHeight),
    });
  }, [mapHeight, mapWidth, viewportRef]);

  useEffect(() => {
    const box = viewportRef.current;
    if (!box) return;
    readViewport();
    box.addEventListener('scroll', readViewport, { passive: true });
    const resizeObserver = new ResizeObserver(readViewport);
    resizeObserver.observe(box);
    // 줌은 스크롤 박스가 아니라 안쪽 지도 캔버스의 표시 크기를 바꾼다. 스크롤 위치가
    // 그대로인 줌(가장자리에 붙어 있을 때)은 scroll 이벤트가 없으므로 캔버스도 관찰한다.
    const mapCanvas = box.querySelector('canvas[data-version]');
    if (mapCanvas instanceof HTMLCanvasElement) resizeObserver.observe(mapCanvas);
    return () => {
      box.removeEventListener('scroll', readViewport);
      resizeObserver.disconnect();
    };
  }, [readViewport, viewportRef]);

  // Base layer redraw: only durable map visuals belong in this effect.
  useEffect(() => {
    const canvas = baseCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const startedAt = window.__renderPerf ? performance.now() : 0;
    const runtimeStartedAt = runtimePerfStartTime();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#090b0d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const scaleX = canvas.width / mapWidth;
    const scaleY = canvas.height / mapHeight;
    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        if (!state.exploration.explored[y]?.[x]) continue;
        ctx.fillStyle = TERRAIN_COLORS[state.map[y][x].terrain];
        ctx.fillRect(Math.floor(x * scaleX), Math.floor(y * scaleY), Math.ceil(scaleX), Math.ceil(scaleY));
      }
    }

    for (const zone of state.claimZones.filter(candidate => candidate.discovered)) {
      const site = state.foreignSites.find(candidate => candidate.id === zone.siteId);
      if (!site?.discovered) continue;
      ctx.beginPath();
      ctx.arc((zone.x + 0.5) * scaleX, (zone.y + 0.5) * scaleY, zone.radius * (scaleX + scaleY) * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = `${factionColor(site)}22`;
      ctx.strokeStyle = `${factionColor(site)}88`;
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
    }

    for (const building of state.buildings) {
      if (!state.exploration.explored[building.y]?.[building.x]) continue;
      const x = (building.x + 0.5) * scaleX;
      const y = (building.y + 0.5) * scaleY;
      ctx.fillStyle = building.type === 'center' ? '#f0c767' : building.built ? '#d9d2bd' : '#998e77';
      const size = building.type === 'center' ? 4 : 2;
      ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
    }

    for (const site of visibleSites) {
      drawSite(ctx, site, (site.x + site.width / 2) * scaleX, (site.y + site.height / 2) * scaleY);
    }
    recordMinimapRedraw('minimap-base-redraw', startedAt);
    recordRuntimePerfSince('minimap-base-draw', runtimeStartedAt, {
      buildings: state.buildings.length,
      exploredRows: state.exploration.explored.length,
    });
  }, [baseInvalidationKey, mapHeight, mapWidth, minimapHeight]);

  // Overlay layer redraw: transient camera, selection, threat, and target state only.
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const scaleX = canvas.width / mapWidth;
    const scaleY = canvas.height / mapHeight;
    const pulseActive = visibleRaid != null || targetMarkers.length > 0;
    let animationFrame: number | null = null;

    const drawOverlay = () => {
      const startedAt = window.__renderPerf ? performance.now() : 0;
      const runtimeStartedAt = runtimePerfStartTime();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);

      for (const marker of targetMarkers) {
        const x = (marker.x + 0.5) * scaleX;
        const y = (marker.y + 0.5) * scaleY;
        const color = marker.kind === 'tiger' ? '#e05f52' : marker.kind === 'wolf' ? '#e29937' : '#c84f45';
        ctx.beginPath();
        ctx.arc(x, y, Math.max(5, marker.radius * (scaleX + scaleY) * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = marker.kind === 'wolf' ? 'rgba(226,153,55,0.16)' : 'rgba(224,95,82,0.16)';
        ctx.strokeStyle = color;
        ctx.lineWidth = 1 + pulse;
        ctx.fill();
        ctx.stroke();
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = color;
        ctx.strokeStyle = '#111518';
        ctx.lineWidth = 1;
        ctx.fillRect(-3, -3, 6, 6);
        ctx.strokeRect(-3.5, -3.5, 7, 7);
        ctx.restore();
      }

      if (visibleRaid) {
        const x = (visibleRaid.x + 0.5) * scaleX;
        const y = (visibleRaid.y + 0.5) * scaleY;
        ctx.beginPath();
        ctx.arc(x, y, 4 + pulse * 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(206,44,32,0.75)';
        ctx.strokeStyle = '#ff6e59';
        ctx.lineWidth = 1 + pulse;
        ctx.fill();
        ctx.stroke();
      }

      for (const party of visibleParties) {
        const site = state.foreignSites.find(candidate => candidate.id === party.siteId);
        const x = party.px * scaleX;
        const y = party.py * scaleY;
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = site ? factionColor(site) : '#d2a958';
        ctx.strokeStyle = '#111518';
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();
      }

      if (selected) {
        ctx.strokeStyle = '#eff7fb';
        ctx.lineWidth = 1;
        ctx.strokeRect(selected.x * scaleX - 1, selected.y * scaleY - 1, Math.max(4, scaleX + 2), Math.max(4, scaleY + 2));
      }

      ctx.fillStyle = 'rgba(229, 239, 243, 0.08)';
      ctx.strokeStyle = 'rgba(239, 247, 250, 0.9)';
      ctx.lineWidth = 1;
      ctx.fillRect(viewport.left * canvas.width, viewport.top * canvas.height, viewport.width * canvas.width, viewport.height * canvas.height);
      ctx.strokeRect(
        Math.round(viewport.left * canvas.width) + 0.5,
        Math.round(viewport.top * canvas.height) + 0.5,
        Math.max(2, Math.round(viewport.width * canvas.width) - 1),
        Math.max(2, Math.round(viewport.height * canvas.height) - 1),
      );
      recordMinimapRedraw('minimap-overlay-redraw', startedAt);
      recordRuntimePerfSince('minimap-overlay-draw', runtimeStartedAt, {
        targets: targetMarkers.length,
        raidVisible: visibleRaid !== null,
      });
      const animatePulse = animationActive && !document.hidden && pulseActive;
      if (animatePulse) animationFrame = requestAnimationFrame(drawOverlay);
    };

    const handleVisibilityChange = () => {
      if (animationFrame != null) cancelAnimationFrame(animationFrame);
      animationFrame = null;
      if (!document.hidden) drawOverlay();
    };
    drawOverlay();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (animationFrame != null) cancelAnimationFrame(animationFrame);
    };
  }, [animationActive, mapHeight, mapWidth, minimapHeight, overlayInvalidationKey]);

  const navigate = (clientX: number, clientY: number) => {
    const canvas = overlayCanvasRef.current;
    const box = viewportRef.current;
    if (!canvas || !box) return;
    const rect = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const scale = mapViewportScale(box);
    box.scrollTo({
      left: MAP_PADDING + nx * mapWidth * TILE * scale - box.clientWidth / 2,
      top: MAP_PADDING + ny * mapHeight * TILE * scale - box.clientHeight / 2,
    });
  };

  const navigateToCenter = () => {
    const box = viewportRef.current;
    if (box) centerViewportOnSettlement(state, box);
    onNavigate?.();
  };

  const markerLabelAt = (clientX: number, clientY: number): string | null => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * canvas.width / rect.width;
    const py = (clientY - rect.top) * canvas.height / rect.height;
    const scaleX = canvas.width / mapWidth;
    const scaleY = canvas.height / mapHeight;
    if (visibleRaid) {
      const distance = Math.hypot(px - (visibleRaid.x + 0.5) * scaleX, py - (visibleRaid.y + 0.5) * scaleY);
      if (distance <= 9) return `습격 경보 · ${visibleRaid.faction}`;
    }
    const party = visibleParties.find(candidate => Math.hypot(
      px - candidate.px * scaleX,
      py - candidate.py * scaleY,
    ) <= 6);
    if (party) {
      const site = state.foreignSites.find(candidate => candidate.id === party.siteId);
      return `${site?.name ?? '외부 활동대'} · ${foreignSitePartyKindLabel(party.kind)}`;
    }
    const target = targetMarkers.find(candidate => Math.hypot(
      px - (candidate.x + 0.5) * scaleX,
      py - (candidate.y + 0.5) * scaleY,
    ) <= Math.max(8, candidate.radius * (scaleX + scaleY) * 0.5));
    if (target) return target.label;
    const site = visibleSites.find(candidate => Math.hypot(
      px - (candidate.x + candidate.width / 2) * scaleX,
      py - (candidate.y + candidate.height / 2) * scaleY,
    ) <= 7);
    return site ? `${site.name} · ${SITE_TYPE_NAMES[site.type]}` : null;
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    setHoverLabel(markerLabelAt(event.clientX, event.clientY));
    if (dragging.current) navigate(event.clientX, event.clientY);
  };

  return (
    <div className={`minimap-panel${visibleRaid ? ' raid-alert' : targetMarkers.length > 0 ? ' hunt-alert' : ''}`}>
      <div className="minimap-heading">
        {visibleRaid && <span className="minimap-alert-label">습격 경보</span>}
        {!visibleRaid && targetMarkers.length > 0 && <span className="minimap-target-label">토벌 목표</span>}
        <BuildingFinder
          state={state}
          selectedBuildingId={selectedBuildingId}
          onFocusBuilding={onFocusBuilding}
        />
        <button type="button" className="minimap-center-btn" title="마을 중심으로 이동" aria-label="마을 중심으로 이동" onClick={navigateToCenter}>◎</button>
      </div>
      <div className="minimap-canvas-wrap" data-tut="minimap">
        <canvas
          ref={baseCanvasRef}
          className="minimap-base-canvas"
          width={MAP_SIZE}
          height={minimapHeight}
          aria-hidden="true"
        />
        <canvas
          ref={overlayCanvasRef}
          className="minimap-overlay-canvas"
          width={MAP_SIZE}
          height={minimapHeight}
          aria-label="개척지 미니맵"
          onPointerDown={event => {
            dragging.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            navigate(event.clientX, event.clientY);
            onNavigate?.();
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={event => {
            dragging.current = false;
            try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* noop */ }
          }}
          onPointerLeave={() => {
            dragging.current = false;
            setHoverLabel(null);
          }}
        />
        {hoverLabel && <div className="minimap-tooltip">{hoverLabel}</div>}
      </div>
      <div className="minimap-legend" aria-label="미니맵 범례">
        <span><i className="village" />마을</span>
        <span><i className="foreign" />외부 거점</span>
        <span><i className="hostile" />적대 세력</span>
        {targetMarkers.length > 0 && <span><i className="target" />토벌 목표</span>}
      </div>
    </div>
  );
}
