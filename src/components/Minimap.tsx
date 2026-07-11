import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { CONFIG } from '../game/config';
import { FACTIONS } from '../game/constants';
import { visibleMinimapRaid, visibleMinimapSites } from '../game/minimap';
import type { ForeignSite, GameState, Terrain } from '../game/types';

const TILE = CONFIG.ui.tileSize;
const MAP_SIZE = 188;
const MAP_PADDING = 8;

const TERRAIN_COLORS: Record<Terrain, string> = {
  forest: '#274938',
  plain: '#536447',
  river: '#3f7188',
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
  viewportRef: RefObject<HTMLDivElement>;
  selected: { x: number; y: number } | null;
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

export function Minimap({ state, version, viewportRef, selected }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);
  const centeredOnce = useRef(false);
  const [viewport, setViewport] = useState<ViewportRect>({ left: 0, top: 0, width: 1, height: 1 });
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const mapHeight = state.map.length;
  const mapWidth = state.map[0]?.length ?? 1;
  const minimapHeight = Math.round(MAP_SIZE * mapHeight / mapWidth);
  const visibleRaid = visibleMinimapRaid(state);
  const visibleSites = visibleMinimapSites(state);

  const readViewport = useCallback(() => {
    const box = viewportRef.current;
    if (!box) return;
    const worldWidth = mapWidth * TILE;
    const worldHeight = mapHeight * TILE;
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
    return () => {
      box.removeEventListener('scroll', readViewport);
      resizeObserver.disconnect();
    };
  }, [readViewport, viewportRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
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
  }, [mapHeight, mapWidth, selected, state, version, viewport, visibleSites]);

  const navigate = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const box = viewportRef.current;
    if (!canvas || !box) return;
    const rect = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    box.scrollTo({
      left: MAP_PADDING + nx * mapWidth * TILE - box.clientWidth / 2,
      top: MAP_PADDING + ny * mapHeight * TILE - box.clientHeight / 2,
    });
  };

  const navigateToCenter = () => {
    const center = state.buildings.find(building => building.type === 'center');
    const canvas = canvasRef.current;
    if (!center || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    navigate(rect.left + ((center.x + 0.5) / mapWidth) * rect.width, rect.top + ((center.y + 0.5) / mapHeight) * rect.height);
  };

  useEffect(() => {
    if (centeredOnce.current) return;
    centeredOnce.current = true;
    const frame = requestAnimationFrame(navigateToCenter);
    return () => cancelAnimationFrame(frame);
  }, [mapHeight, mapWidth, viewportRef]);

  const markerLabelAt = (clientX: number, clientY: number): string | null => {
    const canvas = canvasRef.current;
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
    <div className={`minimap-panel${visibleRaid ? ' raid-alert' : ''}`}>
      <div className="minimap-heading">
        <strong>지도</strong>
        {visibleRaid && <span className="minimap-alert-label">습격 경보</span>}
        <button type="button" className="minimap-center-btn" title="마을 중심으로 이동" aria-label="마을 중심으로 이동" onClick={navigateToCenter}>◎</button>
      </div>
      <div className="minimap-canvas-wrap">
        <canvas
          ref={canvasRef}
          width={MAP_SIZE}
          height={minimapHeight}
          aria-label="개척지 미니맵"
          onPointerDown={event => {
            dragging.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            navigate(event.clientX, event.clientY);
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
        {visibleRaid && (
          <span
            className="minimap-raid-ping"
            style={{
              left: `${((visibleRaid.x + 0.5) / mapWidth) * 100}%`,
              top: `${((visibleRaid.y + 0.5) / mapHeight) * 100}%`,
            }}
          />
        )}
        {hoverLabel && <div className="minimap-tooltip">{hoverLabel}</div>}
      </div>
      <div className="minimap-legend" aria-label="미니맵 범례">
        <span><i className="village" />마을</span>
        <span><i className="foreign" />외부 거점</span>
        <span><i className="hostile" />적대 세력</span>
      </div>
    </div>
  );
}
