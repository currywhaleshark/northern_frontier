// 탭 C — 건물 (효과 레이어 · 그림자 레이어).
//
// 건물·그림자·효과 모두 renderer.ts에서 export한 실제 함수로 그린다. 특히 그림자는
// 실루엣을 굽고 눕히는 투영이 통째로 게임 코드다 — 여기서 맞춘 노브가 곧 실게임 값이다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { drawFishingPortHouseAtlas, getActiveSprites, onAtlasAssetSettled } from '@game/render/atlas';
import {
  buildingShadowSilhouette, CENTER_VISUAL_SCALE, dayShadowFor, drawBuildingEffects,
  drawBuildingShadowSilhouette, drawFishingPortPier, drawNightTint, nightFactorFor, worldShadowShear,
} from '@game/render/renderer';
import {
  BUILDING_EFFECT_KINDS, BUILDING_EFFECT_WHENS, BUILDING_SHADOW_MODES,
  type BuildingEffectKind, type BuildingEffectWhen, type BuildingShadowMode,
} from '@game/render/spriteStudioRegistries';
import { BUILDING_DEFS, buildingFootprintDims, isAreaBuildingType } from '@game/game/buildings';
import { SEASON_ORDER } from '@game/game/constants';
import { CONFIG } from '@game/game/config';
import type { TerrainDrawParams } from '@game/render/sprites';
import type { BuildingTypeId, FishingPortPierDirection, Rank, Season } from '@game/game/types';
import { fishingPortPierPositions } from '@game/game/fishingBoats';
import {
  DEFAULT_SHADOW, SLOT_BUILDING_TYPES,
  type EffectEmitterEdit, type ShadowSettingsEdit, type WorkerSlotEdit,
} from './api';

const TILE = CONFIG.ui.tileSize;
const SPAN_X = 9;               // 그림자가 길게 누워도 잘리지 않을 만큼
const SPAN_Y = 7;
const SCENE_W = TILE * SPAN_X;
const SCENE_H = TILE * SPAN_Y;
const ORIGIN_X = 3;             // 건물 좌상단 타일
const ORIGIN_Y = 3;
const STUDIO_EFFECT_ID = 7;     // 입자 위상 오프셋용 고정 id

export type BuildingLayer = 'effects' | 'shadow' | 'slots';

/** 자리를 놓을 수 있는 범위 — 건물 발자국을 두 칸 넓힌 사각형. */
const SLOT_REACH = 2;

const KIND_LABEL: Record<BuildingEffectKind, string> = {
  chimneySmoke: '굴뚝 연기', fireSparks: '불꽃', craftGlint: '작업 반짝임',
  serviceGlow: '등불', windowGlow: '창불',
};
const WHEN_LABEL: Record<BuildingEffectWhen, string> = {
  working: '가동 중', night: '밤', winterHeating: '겨울 난방', always: '항상',
};
const MODE_LABEL: Record<BuildingShadowMode, string> = {
  standard: '기본', courtyard: '마당형', none: '없음',
};
const SEASON_LABEL: Record<Season, string> = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };
const RANKS: readonly Rank[] = ['settlement', 'bo', 'jin', 'bu'];
const RANK_LABEL: Record<Rank, string> = { settlement: '정착지', bo: '보', jin: '진', bu: '부' };

/** 계절 한가운데 날짜 — dayShadowFor의 연중 태양 기세가 계절마다 다르다. */
function midSeasonDay(season: Season): number {
  const index = Math.max(0, SEASON_ORDER.indexOf(season));
  return index * CONFIG.time.seasonDays + Math.round(CONFIG.time.seasonDays / 2);
}

/** 밤 색조와 창불 램프는 drawDayNight과 같은 문턱을 쓴다. */
function nightAlphaFor(night: number): number {
  return night > 0.28 ? Math.min(1, (night - 0.28) / 0.5) : 0;
}

function groundParams(tx: number, ty: number, season: Season): TerrainDrawParams {
  return {
    terrain: 'plain', season, winter: season === 'winter', frozenRiver: false,
    hasIron: false, highDefinition: true,
    tileX: tx, tileY: ty, x: tx * TILE, y: ty * TILE, size: TILE,
  };
}

interface SceneState {
  type: BuildingTypeId;
  rank: Rank;
  season: Season;
  workers: number;
  heating: boolean;
  /** 하루 중 시각 하나가 그림자 각도와 밤 깊이를 **함께** 정한다 — 게임에서 둘은 같은 해에서 나온다. */
  dayFrac: number;
  /** 보기용 진하게 — 게임의 그림자는 알파 0.1~0.25라 맨 잔디 위에서는 눈으로 재기 어렵다. */
  emphasizeShadow: boolean;
  portDirection: FishingPortPierDirection;
  zoom: number;
}

const SHADOW_EMPHASIS = 3;

interface Geometry {
  drawX: number;
  drawY: number;
  size: number;
  dims: { w: number; h: number };
}

function geometryFor(scene: SceneState): Geometry {
  const dims = buildingFootprintDims({ type: scene.type, w: 3, h: 2 });
  const footprintWidth = TILE * dims.w;
  const footprintHeight = TILE * dims.h;
  // 중심지만 등급에 따라 시각 크기가 바뀐다 — 렌더러의 건물 패스와 같은 계산이다.
  const size = scene.type === 'center'
    ? Math.round(footprintWidth * CENTER_VISUAL_SCALE[scene.rank])
    : footprintWidth;
  const drawX = scene.type === 'center'
    ? ORIGIN_X * TILE + Math.round((footprintWidth - size) / 2)
    : ORIGIN_X * TILE;
  const drawY = scene.type === 'center'
    ? ORIGIN_Y * TILE + footprintHeight - size
    : ORIGIN_Y * TILE;
  return { drawX, drawY, size, dims };
}

/** 이미터 화면 좌표 — 게임의 drawBuildingEffects와 같은 식. */
function emitterAt(emitter: EffectEmitterEdit, geometry: Geometry): [number, number] {
  return [
    geometry.drawX + geometry.size * emitter.fx + emitter.dx,
    geometry.drawY + geometry.size * emitter.fy + emitter.dy,
  ];
}

/** 자리 칸의 화면 사각형. 건물 발자국 안은 통행 불가라 놓을 수 없다. */
function slotTileRect(dims: { w: number; h: number }, tileDX: number, tileDY: number) {
  return {
    x: (ORIGIN_X + tileDX) * TILE,
    y: (ORIGIN_Y + tileDY) * TILE,
    blocked: tileDX >= 0 && tileDX < dims.w && tileDY >= 0 && tileDY < dims.h,
  };
}

function slotStandPoint(slot: WorkerSlotEdit): [number, number] {
  return [
    (ORIGIN_X + slot.tileDX + 0.5) * TILE + slot.offsetX,
    (ORIGIN_Y + slot.tileDY + 0.5) * TILE + slot.offsetY,
  ];
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: SceneState,
  layer: BuildingLayer,
  emitters: readonly EffectEmitterEdit[],
  shadow: ShadowSettingsEdit,
  slots: readonly WorkerSlotEdit[],
  selectedEmitter: number | null,
  selectedSlot: number | null,
  animationTimeMs: number,
): void {
  const sprites = getActiveSprites();
  const geometry = geometryFor(scene);
  const { dims, drawX, drawY, size } = geometry;

  for (let ty = 0; ty < SPAN_Y; ty++) {
    for (let tx = 0; tx < SPAN_X; tx++) sprites.drawTerrain(ctx, groundParams(tx, ty, scene.season));
  }

  if (scene.type === 'fishingPort') {
    const studioPier = { direction: scene.portDirection, length: 3 } as const;
    for (const position of fishingPortPierPositions(ORIGIN_X, ORIGIN_Y, studioPier, false)) {
      ctx.fillStyle = 'rgba(47, 114, 148, 0.78)';
      ctx.fillRect(position.x * TILE, position.y * TILE, TILE, TILE);
    }
    drawFishingPortPier(ctx, ORIGIN_X, ORIGIN_Y, studioPier);
  }

  // ── 그림자 ──
  const day = midSeasonDay(scene.season);
  const sun = dayShadowFor({ day, weather: 'clear' }, scene.dayFrac);
  let placement: { baseRowUsed: number; frontAnchor: number; backOffset: number } | null = null;
  const silhouette = buildingShadowSilhouette(
    sprites, { rank: scene.rank }, { type: scene.type, x: ORIGIN_X, y: ORIGIN_Y },
    dims, scene.season, true, new Set<string>(),
  );
  if (sun && silhouette && shadow.mode !== 'none' && !isAreaBuildingType(scene.type)) {
    // 게임과 같이 별도 레이어에 불투명하게 모아 마지막에 한 번만 옅게 얹는다.
    const buffer = document.createElement('canvas');
    buffer.width = SCENE_W;
    buffer.height = SCENE_H;
    const layerCtx = buffer.getContext('2d');
    if (layerCtx) {
      layerCtx.fillStyle = '#161b21';
      const { shearX, flattenY } = worldShadowShear(sun);
      placement = drawBuildingShadowSilhouette(
        layerCtx, silhouette, { ...shadow },
        ORIGIN_X * TILE, (ORIGIN_Y + dims.h) * TILE, dims.h * TILE,
        shearX * shadow.lengthScale, flattenY,
      );
      ctx.save();
      ctx.globalAlpha = scene.emphasizeShadow ? Math.min(1, sun.alpha * SHADOW_EMPHASIS) : sun.alpha;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(buffer, 0, 0);
      ctx.restore();
    }
  }

  // ── 자리 근무자 ──
  // 건물보다 먼저 그린 뒤 뒤쪽 자리를 가리게 둔다 — 게임의 행 정렬에서도 건물 윗줄에 선
  // 근무자는 건물에 가린다. 여기서 다 보이게 그리면 실제로는 안 보이는 자리를 고르게 된다.
  const drawSlotWorker = (slot: WorkerSlotEdit) => {
    const [x, y] = slotStandPoint(slot);
    sprites.drawResident(ctx, {
      job: 'woodSplitter', gender: 'male', x, y,
      sick: false, carrying: false, selected: false,
      showJobMarker: false, showCargoMarker: false,
      moving: false, working: true,
      facing: slot.facing === -1 ? -1 : 1,
      animationTimeMs,
    });
  };
  // 행 정렬 기준은 renderer와 같다: 건물은 발자국 밑변, 주민은 제 발끝 y.
  const buildingSortY = (ORIGIN_Y + dims.h) * TILE;
  const behind = slots.filter(slot => slotStandPoint(slot)[1] < buildingSortY);
  const front = slots.filter(slot => slotStandPoint(slot)[1] >= buildingSortY);
  if (layer === 'slots') behind.forEach(drawSlotWorker);

  // ── 건물 ──
  const portHouseDrawn = scene.type === 'fishingPort'
    ? drawFishingPortHouseAtlas(ctx, drawX, drawY, size)
    : false;
  if (!portHouseDrawn) {
    sprites.drawBuilding(ctx, {
      type: scene.type, built: true, progress01: 1, ghost: false,
      rank: scene.type === 'center' ? scene.rank : undefined,
      season: scene.season, highDefinition: true,
      x: drawX, y: drawY, size,
    });
  }

  if (layer === 'slots') front.forEach(drawSlotWorker);

  // ── 낮 효과 (건물 패스) ──
  const daytime = new Set<BuildingEffectWhen>(['always']);
  if (scene.workers > 0) daytime.add('working');
  if (scene.heating) daytime.add('winterHeating');
  drawEmitters(ctx, emitters, geometry, scene.type, daytime, scene.workers, 0);

  // ── 밤 색조와 창불 ──
  const night = nightFactorFor({ day }, scene.dayFrac);
  drawNightTint(ctx, night, () => ctx.fillRect(0, 0, SCENE_W, SCENE_H));
  const nightAlpha = nightAlphaFor(night);
  if (nightAlpha > 0) {
    // 이 패스는 중심지도 발자국 폭을 쓴다 — 렌더러의 밤 패스와 같다.
    drawEmitters(
      ctx, emitters,
      { drawX: ORIGIN_X * TILE, drawY: ORIGIN_Y * TILE, size: TILE * dims.w, dims },
      scene.type, new Set<BuildingEffectWhen>(['night']), 0, nightAlpha,
    );
  }

  // ── 편집 오버레이 ──
  if (layer === 'effects') {
    emitters.forEach((emitter, index) => {
      const [ax, ay] = emitterAt(emitter, geometry);
      const on = index === selectedEmitter;
      ctx.strokeStyle = on ? '#d9a441' : 'rgba(216,222,229,0.65)';
      ctx.lineWidth = on ? 0.9 : 0.6;
      ctx.beginPath();
      ctx.moveTo(ax - 4, ay); ctx.lineTo(ax + 4, ay);
      ctx.moveTo(ax, ay - 4); ctx.lineTo(ax, ay + 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ax, ay, on ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.stroke();
    });
  } else if (layer === 'slots') {
    for (let dy = -SLOT_REACH; dy < dims.h + SLOT_REACH; dy++) {
      for (let dx = -SLOT_REACH; dx < dims.w + SLOT_REACH; dx++) {
        const cell = slotTileRect(dims, dx, dy);
        if (cell.x < 0 || cell.y < 0 || cell.x >= SCENE_W || cell.y >= SCENE_H) continue;
        // 발자국 안은 통행 불가 — 회색으로 덮어 놓을 수 없음을 보인다.
        ctx.fillStyle = cell.blocked ? 'rgba(20,24,28,0.45)' : 'rgba(216,222,229,0.05)';
        ctx.fillRect(cell.x, cell.y, TILE, TILE);
        ctx.strokeStyle = cell.blocked ? 'rgba(139,152,165,0.35)' : 'rgba(216,222,229,0.28)';
        ctx.lineWidth = 0.4;
        ctx.strokeRect(cell.x + 0.2, cell.y + 0.2, TILE - 0.4, TILE - 0.4);
      }
    }
    slots.forEach((slot, index) => {
      const cell = slotTileRect(dims, slot.tileDX, slot.tileDY);
      const on = index === selectedSlot;
      ctx.strokeStyle = on ? '#d9a441' : 'rgba(96,200,150,0.9)';
      ctx.lineWidth = on ? 1 : 0.7;
      ctx.strokeRect(cell.x + 0.5, cell.y + 0.5, TILE - 1, TILE - 1);
      const [sx, sy] = slotStandPoint(slot);
      ctx.beginPath();
      ctx.moveTo(sx - 3, sy); ctx.lineTo(sx + 3, sy);
      ctx.moveTo(sx, sy - 3); ctx.lineTo(sx, sy + 3);
      ctx.stroke();
      // 바라보는 방향 (facing 0은 기본 오른쪽)
      const dir = slot.facing === -1 ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(sx + dir * 4, sy);
      ctx.lineTo(sx + dir * 8, sy);
      ctx.lineTo(sx + dir * 6, sy - 2);
      ctx.stroke();
      ctx.fillStyle = on ? '#d9a441' : 'rgba(96,200,150,0.9)';
      ctx.font = '6px sans-serif';
      ctx.fillText(String(index + 1), cell.x + 2, cell.y + 8);
    });
  } else if (silhouette && placement) {
    // 잘려 나간 마당 구간과 본채 접지선 — groundFrac·anchorDepthFrac이 무엇인지 눈으로 본다.
    // 실루엣은 발자국 폭(등급 배율 없음)으로 굽히므로, 그 좌표계를 장면으로 되돌려 겹친다.
    const silSize = dims.w * TILE;
    const silTop = scene.type === 'center'
      ? ORIGIN_Y * TILE + dims.h * TILE - silSize
      : ORIGIN_Y * TILE;
    const rowToSceneY = (row: number) => silTop + row - silSize;
    const cutRows = silhouette.baseRow - placement.baseRowUsed;
    if (cutRows > 0) {
      const cutTop = rowToSceneY(placement.baseRowUsed);
      ctx.fillStyle = 'rgba(224,108,92,0.38)';
      ctx.fillRect(ORIGIN_X * TILE, cutTop, silSize, cutRows);
      // 어두운 지붕 위에서는 면만으로 잘 안 보인다 — 잘리는 경계선을 또렷하게 긋는다.
      ctx.strokeStyle = 'rgba(240,140,120,0.95)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(ORIGIN_X * TILE, cutTop);
      ctx.lineTo(ORIGIN_X * TILE + silSize, cutTop);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(96,200,150,0.9)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(ORIGIN_X * TILE - 4, placement.frontAnchor);
    ctx.lineTo((ORIGIN_X + dims.w) * TILE + 4, placement.frontAnchor);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(96,200,150,0.4)';
    ctx.beginPath();
    ctx.moveTo(ORIGIN_X * TILE - 4, placement.frontAnchor - placement.backOffset);
    ctx.lineTo((ORIGIN_X + dims.w) * TILE + 4, placement.frontAnchor - placement.backOffset);
    ctx.stroke();
  }

  // 발자국 경계
  ctx.strokeStyle = 'rgba(217,164,65,0.4)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(ORIGIN_X * TILE + 0.25, ORIGIN_Y * TILE + 0.25, dims.w * TILE - 0.5, dims.h * TILE - 0.5);
}

/** 저장 전 배열을 그대로 넘긴다 — 레지스트리 조회 대신 편집 중인 값으로 그린다. */
function drawEmitters(
  ctx: CanvasRenderingContext2D,
  emitters: readonly EffectEmitterEdit[],
  geometry: Geometry,
  type: BuildingTypeId,
  active: ReadonlySet<BuildingEffectWhen>,
  workers: number,
  nightAlpha: number,
): void {
  drawBuildingEffects(
    ctx, type, STUDIO_EFFECT_ID,
    geometry.drawX, geometry.drawY, geometry.size,
    { active, workers, nightAlpha },
    emitters,
  );
}

interface Props {
  layer: BuildingLayer;
  onLayerChange(layer: BuildingLayer): void;
  effects: Record<string, EffectEmitterEdit[]>;
  shadows: Record<string, ShadowSettingsEdit>;
  slots: Record<string, WorkerSlotEdit[]>;
  onEffectsChange(type: string, emitters: EffectEmitterEdit[]): void;
  onShadowChange(type: string, settings: ShadowSettingsEdit): void;
  onSlotsChange(type: string, slots: WorkerSlotEdit[]): void;
  animate: boolean;
}

const EDITABLE_TYPES = (Object.keys(BUILDING_DEFS) as BuildingTypeId[])
  .filter(type => !isAreaBuildingType(type));

export function BuildingStage({
  layer, onLayerChange, effects, shadows, slots, onEffectsChange, onShadowChange, onSlotsChange, animate,
}: Props) {
  const [scene, setScene] = useState<SceneState>({
    type: 'ondol', rank: 'bu', season: 'winter', workers: 2,
    heating: true, dayFrac: 0.12, emphasizeShadow: true, portDirection: 's', zoom: 3,
  });
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [, setReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<
    { kind: 'emitter' | 'slot'; index: number; startX: number; startY: number; dx: number; dy: number } | null
  >(null);

  useEffect(() => onAtlasAssetSettled(() => setReady(value => !value)), []);

  const emitters = useMemo(() => effects[scene.type] ?? [], [effects, scene.type]);
  const shadow = shadows[scene.type] ?? DEFAULT_SHADOW;
  const typeSlots = useMemo(() => slots[scene.type] ?? [], [slots, scene.type]);
  const slotsAllowed = SLOT_BUILDING_TYPES.includes(scene.type);
  const geometry = useMemo(() => geometryFor(scene), [scene]);
  const night = nightFactorFor({ day: midSeasonDay(scene.season) }, scene.dayFrac);
  const nightAlpha = nightAlphaFor(night);

  useEffect(() => { setSelected(null); setSelectedSlot(null); }, [scene.type]);

  useEffect(() => {
    let raf = 0;
    let stopped = false;
    const start = performance.now();
    const paint = () => {
      if (stopped) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.setTransform(scene.zoom, 0, 0, scene.zoom, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, SCENE_W, SCENE_H);
        drawScene(
          ctx, scene, layer, emitters, shadow, typeSlots, selected, selectedSlot,
          animate ? performance.now() - start : 0,
        );
      }
      raf = requestAnimationFrame(paint);
    };
    paint();
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, [scene, layer, emitters, shadow, typeSlots, selected, selectedSlot, animate]);

  const patchEmitter = useCallback((index: number, patch: Partial<EffectEmitterEdit>) => {
    onEffectsChange(scene.type, emitters.map((emitter, i) => i === index ? { ...emitter, ...patch } : emitter));
  }, [emitters, onEffectsChange, scene.type]);

  const logicalAt = (canvas: HTMLCanvasElement, clientX: number, clientY: number): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    const border = (rect.width - canvas.width) / 2;
    return [(clientX - rect.left - border) / scene.zoom, (clientY - rect.top - border) / scene.zoom];
  };

  const patchSlot = useCallback((index: number, patch: Partial<WorkerSlotEdit>) => {
    onSlotsChange(scene.type, typeSlots.map((slot, i) => i === index ? { ...slot, ...patch } : slot));
  }, [onSlotsChange, scene.type, typeSlots]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const [px, py] = logicalAt(event.currentTarget, event.clientX, event.clientY);

    if (layer === 'slots') {
      if (!slotsAllowed) return;
      const existing = typeSlots.findIndex(slot => {
        const [sx, sy] = slotStandPoint(slot);
        return Math.hypot(px - sx, py - sy) <= 6;
      });
      if (existing >= 0) {
        setSelectedSlot(existing);
        dragRef.current = {
          kind: 'slot', index: existing, startX: px, startY: py,
          dx: typeSlots[existing].offsetX, dy: typeSlots[existing].offsetY,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      // 빈 칸을 누르면 그 칸에 자리를 놓는다. 발자국 안(통행 불가)은 거절.
      const tileDX = Math.floor(px / TILE) - ORIGIN_X;
      const tileDY = Math.floor(py / TILE) - ORIGIN_Y;
      const cell = slotTileRect(geometry.dims, tileDX, tileDY);
      if (cell.blocked) return;
      if (Math.abs(tileDX) > geometry.dims.w + SLOT_REACH || Math.abs(tileDY) > geometry.dims.h + SLOT_REACH) return;
      if (typeSlots.some(slot => slot.tileDX === tileDX && slot.tileDY === tileDY)) return;
      onSlotsChange(scene.type, [...typeSlots, { tileDX, tileDY, offsetX: 0, offsetY: 0, facing: 0 }]);
      setSelectedSlot(typeSlots.length);
      return;
    }

    if (layer !== 'effects') return;
    let best = -1;
    let bestDistance = 6;
    emitters.forEach((emitter, index) => {
      const [ax, ay] = emitterAt(emitter, geometry);
      const distance = Math.hypot(px - ax, py - ay);
      if (distance <= bestDistance) { bestDistance = distance; best = index; }
    });
    if (best < 0) return;
    setSelected(best);
    dragRef.current = {
      kind: 'emitter', index: best, startX: px, startY: py,
      dx: emitters[best].dx, dy: emitters[best].dy,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [emitters, geometry, layer, onSlotsChange, scene.type, scene.zoom, slotsAllowed, typeSlots]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const [px, py] = logicalAt(event.currentTarget, event.clientX, event.clientY);
    if (drag.kind === 'slot') {
      // 자리 안에서만 움직인다 — 칸을 벗어나면 근무자가 실제로 서는 칸과 어긋난다.
      const limit = TILE / 2;
      const clamp = (value: number) => Math.max(-limit, Math.min(limit, Math.round(value)));
      patchSlot(drag.index, {
        offsetX: clamp(drag.dx + px - drag.startX),
        offsetY: clamp(drag.dy + py - drag.startY),
      });
      return;
    }
    // 끌기는 픽셀 보정(dx·dy)만 움직인다. 크기 비율(fx·fy)은 의도해서 정하는 값이라 손대지 않는다.
    patchEmitter(drag.index, {
      dx: Math.round((drag.dx + px - drag.startX) * 10) / 10,
      dy: Math.round((drag.dy + py - drag.startY) * 10) / 10,
    });
  }, [patchEmitter, patchSlot, scene.zoom]);

  const endDrag = useCallback(() => { dragRef.current = null; }, []);

  const addEmitter = () => {
    onEffectsChange(scene.type, [
      ...emitters,
      { kind: 'chimneySmoke', fx: 0.5, fy: 0.2, dx: 0, dy: 0, scale: 1, when: 'always' },
    ]);
    setSelected(emitters.length);
  };

  const removeEmitter = (index: number) => {
    onEffectsChange(scene.type, emitters.filter((_unused, i) => i !== index));
    setSelected(null);
  };

  /** 지금 화면 위치를 순수 비율로 바꾼다 — 등급마다 크기가 변하는 중심지에 필요하다. */
  const freezeToFraction = (index: number) => {
    const emitter = emitters[index];
    patchEmitter(index, {
      fx: Math.round((emitter.fx + emitter.dx / geometry.size) * 1000) / 1000,
      fy: Math.round((emitter.fy + emitter.dy / geometry.size) * 1000) / 1000,
      dx: 0,
      dy: 0,
    });
  };

  const patchScene = (patch: Partial<SceneState>) => setScene(current => ({ ...current, ...patch }));

  return (
    <div className="stage">
      <div className="stage-view">
        <canvas
          ref={canvasRef}
          width={SCENE_W * scene.zoom}
          height={SCENE_H * scene.zoom}
          className="stage-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        <div className="stage-hint muted">
          {layer === 'effects'
            ? '이미터 표식을 끌면 픽셀 보정(dx·dy)이 움직입니다. 크기 비율은 아래 fx·fy로 정합니다.'
            : layer === 'shadow'
              ? '붉은 띠 = 투영에서 잘려 나간 마당, 초록 선 = 앞뒤 스탬프의 접지선.'
              : '빈 칸을 누르면 자리를 놓고, 자리를 끌면 칸 안에서 위치를 옮깁니다. 회색 칸(발자국)은 통행 불가라 놓을 수 없습니다. 실제 화면에서는 주민마다 고정된 ±3px 지터가 더해집니다.'}
        </div>
      </div>

      <div className="stage-panel">
        <div className="field">
          <span>레이어</span>
          <div className="seg">
            {([['effects', '효과'], ['shadow', '그림자'], ['slots', '작업 자리']] as const).map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={`seg-btn${layer === value ? ' on' : ''}`}
                onClick={() => onLayerChange(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>건물</span>
          <select value={scene.type} onChange={event => patchScene({ type: event.target.value as BuildingTypeId })}>
            {EDITABLE_TYPES.map(type => (
              <option key={type} value={type}>
                {BUILDING_DEFS[type].name}
                {effects[type]?.length ? ` · 효과${effects[type].length}` : ''}
                {shadows[type] ? ' · 그림자' : ''}
              </option>
            ))}
          </select>
        </div>

        {scene.type === 'fishingPort' && (
          <div className="field">
            <span>잔교·계류대 방향</span>
            <div className="seg">
              {([['n', '북'], ['e', '동'], ['s', '남'], ['w', '서']] as const).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={`seg-btn${scene.portDirection === value ? ' on' : ''}`}
                  onClick={() => patchScene({ portDirection: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <span>계절</span>
          <select value={scene.season} onChange={event => patchScene({ season: event.target.value as Season })}>
            {SEASON_ORDER.map(season => <option key={season} value={season}>{SEASON_LABEL[season]}</option>)}
          </select>
        </div>

        {scene.type === 'center' && (
          <div className="field">
            <span>등급</span>
            <select value={scene.rank} onChange={event => patchScene({ rank: event.target.value as Rank })}>
              {RANKS.map(rank => <option key={rank} value={rank}>{RANK_LABEL[rank]}</option>)}
            </select>
          </div>
        )}

        <div className="field">
          <span>
            {((scene.dayFrac * 24 + 6) % 24).toFixed(1)}시 · 밤 {night.toFixed(2)}
            {nightAlpha > 0 ? ` · 창불 ${nightAlpha.toFixed(2)}` : ''}
          </span>
          <input
            type="range" min={0} max={1} step={0.005} value={scene.dayFrac}
            onChange={event => patchScene({ dayFrac: Number(event.target.value) })}
          />
        </div>

        {layer === 'effects' ? (
          <>
            <div className="field">
              <span>가동 작업자 {scene.workers}인</span>
              <input
                type="range" min={0} max={4} step={1} value={scene.workers}
                onChange={event => patchScene({ workers: Number(event.target.value) })}
              />
            </div>
            <label className="toggle">
              <input
                type="checkbox" checked={scene.heating}
                onChange={event => patchScene({ heating: event.target.checked })}
              />
              겨울 난방
            </label>

            <div className="emitter-list">
              {emitters.map((emitter, index) => (
                <div
                  key={index}
                  className={`emitter${selected === index ? ' on' : ''}`}
                  onClick={() => setSelected(index)}
                >
                  <div className="emitter-head">
                    <select
                      value={emitter.kind}
                      onChange={event => patchEmitter(index, { kind: event.target.value as BuildingEffectKind })}
                    >
                      {BUILDING_EFFECT_KINDS.map(kind => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}
                    </select>
                    <button type="button" className="seg-btn" onClick={() => removeEmitter(index)}>−</button>
                  </div>
                  <select
                    value={emitter.when}
                    onChange={event => patchEmitter(index, { when: event.target.value as BuildingEffectWhen })}
                  >
                    {BUILDING_EFFECT_WHENS.map(when => <option key={when} value={when}>{WHEN_LABEL[when]}</option>)}
                  </select>
                  {selected === index && (
                    <>
                      <label className="field">
                        <span>가로 비율 {emitter.fx.toFixed(2)} · 보정 {emitter.dx}px</span>
                        <input
                          type="range" min={0} max={1} step={0.01} value={emitter.fx}
                          onChange={event => patchEmitter(index, { fx: Number(event.target.value) })}
                        />
                      </label>
                      <label className="field">
                        <span>세로 비율 {emitter.fy.toFixed(2)} · 보정 {emitter.dy}px</span>
                        <input
                          type="range" min={-0.5} max={1} step={0.01} value={emitter.fy}
                          onChange={event => patchEmitter(index, { fy: Number(event.target.value) })}
                        />
                      </label>
                      <label className="field">
                        <span>크기 ×{emitter.scale.toFixed(2)}</span>
                        <input
                          type="range" min={0.3} max={2.5} step={0.05} value={emitter.scale}
                          onChange={event => patchEmitter(index, { scale: Number(event.target.value) })}
                        />
                      </label>
                      <button type="button" className="btn" onClick={() => freezeToFraction(index)}>
                        비율로 굳히기
                      </button>
                    </>
                  )}
                </div>
              ))}
              <button type="button" className="btn" onClick={addEmitter}>+ 이미터 추가</button>
            </div>
          </>
        ) : layer === 'slots' ? (
          <>
            {!slotsAllowed && (
              <div className="stage-readout muted">
                {BUILDING_DEFS[scene.type].name}은 아직 자리를 따르지 않습니다.
                지금은 장작마당만 근무자가 정해진 칸으로 갑니다 — 다른 건물에 등록하면 코드젠이 거절합니다.
              </div>
            )}
            <div className="emitter-list">
              {typeSlots.map((slot, index) => (
                <div
                  key={index}
                  className={`emitter${selectedSlot === index ? ' on' : ''}`}
                  onClick={() => setSelectedSlot(index)}
                >
                  <div className="emitter-head">
                    <span className="muted">
                      {index + 1}번 · 칸 ({slot.tileDX}, {slot.tileDY}) · 보정 {slot.offsetX},{slot.offsetY}
                    </span>
                    <button
                      type="button"
                      className="seg-btn"
                      onClick={() => {
                        onSlotsChange(scene.type, typeSlots.filter((_unused, i) => i !== index));
                        setSelectedSlot(null);
                      }}
                    >
                      −
                    </button>
                  </div>
                  <div className="seg">
                    {([0, -1, 1] as const).map(value => (
                      <button
                        type="button"
                        key={value}
                        className={`seg-btn${slot.facing === value ? ' on' : ''}`}
                        onClick={() => patchSlot(index, { facing: value })}
                      >
                        {value === 0 ? '기존' : value === -1 ? '왼쪽' : '오른쪽'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="stage-readout muted">
              자리 {typeSlots.length}개 · 배정 순번(id 오름차순)이 그대로 자리 번호입니다.
              등록한 자리보다 근무자가 많으면 앞에서부터 다시 씁니다.
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <span>방식</span>
              <div className="seg">
                {BUILDING_SHADOW_MODES.map(mode => (
                  <button
                    type="button"
                    key={mode}
                    className={`seg-btn${shadow.mode === mode ? ' on' : ''}`}
                    onClick={() => onShadowChange(scene.type, { ...shadow, mode })}
                  >
                    {MODE_LABEL[mode]}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>마당 비율 {shadow.groundFrac.toFixed(2)}</span>
              <input
                type="range" min={0} max={0.6} step={0.01} value={shadow.groundFrac}
                disabled={shadow.mode !== 'courtyard'}
                onChange={event => onShadowChange(scene.type, { ...shadow, groundFrac: Number(event.target.value) })}
              />
            </div>
            <div className="field">
              <span>접지선 깊이 {shadow.anchorDepthFrac.toFixed(2)}</span>
              <input
                type="range" min={0} max={1} step={0.01} value={shadow.anchorDepthFrac}
                disabled={shadow.mode !== 'courtyard'}
                onChange={event => onShadowChange(scene.type, { ...shadow, anchorDepthFrac: Number(event.target.value) })}
              />
            </div>
            <div className="field">
              <span>길이 ×{shadow.lengthScale.toFixed(2)}</span>
              <input
                type="range" min={0.5} max={1.5} step={0.01} value={shadow.lengthScale}
                onChange={event => onShadowChange(scene.type, { ...shadow, lengthScale: Number(event.target.value) })}
              />
            </div>
            <label className="toggle">
              <input
                type="checkbox" checked={scene.emphasizeShadow}
                onChange={event => patchScene({ emphasizeShadow: event.target.checked })}
              />
              그림자 진하게 (보기용 ×{SHADOW_EMPHASIS})
            </label>
            <button type="button" className="btn" onClick={() => onShadowChange(scene.type, { ...DEFAULT_SHADOW })}>
              기본값으로
            </button>
          </>
        )}

        <div className="field">
          <span>확대</span>
          <div className="seg">
            {[2, 3, 4].map(value => (
              <button
                type="button"
                key={value}
                className={`seg-btn${scene.zoom === value ? ' on' : ''}`}
                onClick={() => patchScene({ zoom: value })}
              >
                {value}×
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
