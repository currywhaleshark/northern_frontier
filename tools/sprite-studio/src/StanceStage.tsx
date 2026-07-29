// 탭 B — 작업 자세.
//
// 3×3 장면을 게임과 같은 그리기 코드로 세우고, 그 위에서 주민을 끌어 앵커를 정한다.
// 배치 계산은 residentWorkStances를 **그대로** 호출한다 — 벌리기 로직과 앵커 합성 순서가
// 게임과 어긋나면 여기서 맞춘 값이 실게임에서 틀어지기 때문이다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getActiveSprites, onAtlasAssetSettled } from '@game/render/atlas';
import { WORK_ANCHOR_KEYS } from '@game/render/spriteStudioRegistries';
import { residentWorkStances } from '@game/render/residentWorkLayout';
import { drawUnderCanopyGhost, treeCanopiesIntersectingRect } from '@game/render/renderer';
import { jitterOf, type ResidentDrawParams, type TerrainDrawParams } from '@game/render/sprites';
import { CONFIG } from '@game/game/config';
import type { Gender, JobId, Season, Terrain } from '@game/game/types';
import type { TreeStage } from '@game/game/forestGrowth';
import type { MineralResource, MineralVisualTier } from '@game/game/minerals';
import type { TreeSpecies } from '@game/render/terrainGrowthVisuals';
import type { WorkAnchorEdit } from './api';

const TILE = CONFIG.ui.tileSize;
const SPAN = 3;                 // 3×3 장면
const SCENE = TILE * SPAN;
const CENTER_TILE = 1;          // 주민이 서는 칸
const CENTER_PX = CENTER_TILE * TILE + TILE / 2;

export const DEFAULT_ANCHOR: WorkAnchorEdit = { offsetX: 0, offsetY: 0, facing: 0 };

const ANCHOR_LIMIT = TILE / 2;

function clampToTile(value: number): number {
  return Math.max(-ANCHOR_LIMIT, Math.min(ANCHOR_LIMIT, value));
}

const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];
const SEASON_LABEL: Record<Season, string> = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };
const ZOOMS = [3, 4, 6] as const;
const MINERALS: readonly MineralResource[] = ['stone', 'iron', 'silver'];
const MINERAL_LABEL: Record<MineralResource, string> = { stone: '석재', iron: '철', silver: '은' };
const TIERS: readonly MineralVisualTier[] = ['trace', 'small', 'medium', 'large', 'huge'];
const TIER_LABEL: Record<MineralVisualTier, string> = {
  trace: '흔적', small: '소', medium: '중', large: '대', huge: '거대',
};
const TREE_STAGES: readonly Exclude<TreeStage, 'stump'>[] = ['young', 'mature'];
const TREE_STAGE_LABEL: Record<string, string> = { young: '어린나무', mature: '성목' };
const SPECIES: readonly TreeSpecies[] = ['broadleaf', 'conifer'];
const SPECIES_LABEL: Record<TreeSpecies, string> = { broadleaf: '활엽수', conifer: '침엽수' };

interface SceneOptions {
  season: Season;
  mineral: MineralResource;
  tier: MineralVisualTier;
  species: TreeSpecies;
  stage: Exclude<TreeStage, 'stump'>;
}

interface Actor {
  id: number;
  gender: Gender;
  x: number;
  y: number;
  facing: 1 | -1;
}

function parseContext(key: string): { job: JobId; terrain: Terrain } {
  const [job, terrain] = key.split('@');
  return { job: job as JobId, terrain: terrain as Terrain };
}

function tileParams(
  tx: number,
  ty: number,
  terrain: Terrain,
  options: SceneOptions,
  target: boolean,
): TerrainDrawParams {
  const winter = options.season === 'winter';
  return {
    terrain,
    season: options.season,
    winter,
    frozenRiver: winter,
    hasIron: terrain === 'rock' && target && options.mineral === 'iron',
    hasSilver: terrain === 'rock' && target && options.mineral === 'silver',
    // 대상 칸에만 소품을 얹는다 — 이웃 칸의 나무가 주민을 가리면 정합을 볼 수 없다.
    treeStage: target && terrain === 'forest' ? options.stage : undefined,
    treeSpecies: terrain === 'forest' ? options.species : undefined,
    mineralResource: target && terrain === 'rock' ? options.mineral : undefined,
    mineralTier: target && terrain === 'rock' ? options.tier : undefined,
    highDefinition: true,
    tileX: tx,
    tileY: ty,
    x: tx * TILE,
    y: ty * TILE,
    size: TILE,
  };
}

/** 수관 판정용 3×3 지도 — 대상 칸에만 나무가 선다 (장면과 같다). */
function canopyScene(stage: Exclude<TreeStage, 'stump'>) {
  return Array.from({ length: SPAN }, (_row, ty) =>
    Array.from({ length: SPAN }, (_cell, tx) => ({
      terrain: 'forest' as Terrain,
      // 이웃 칸은 그루터기로 둔다 — treeStageFor는 treeStage가 비면 'mature'로 보므로
      // 비워 두면 그리지도 않은 이웃 나무의 수관이 판정에 끼어든다.
      treeStage: tx === CENTER_TILE && ty === CENTER_TILE ? stage : ('stump' as TreeStage),
    })));
}

/** 게임과 같은 순서로 배치를 계산한다: 벌리기 → 앵커 → 지터 → 타일 중심. */
function buildActors(
  contextKey: string,
  count: number,
  anchors: Record<string, WorkAnchorEdit>,
  jitter: boolean,
): Actor[] {
  const { job, terrain } = parseContext(contextKey);
  const residents = Array.from({ length: count }, (_unused, index) => ({
    id: index + 1,
    alive: true,
    phase: 'working' as const,
    job,
    x: CENTER_TILE,
    y: CENTER_TILE,
    px: CENTER_TILE,
    py: CENTER_TILE,
  }));
  const stances = residentWorkStances(
    residents,
    TILE,
    undefined,
    () => terrain,
    key => anchors[key] ?? null,
  );
  return residents.map(resident => {
    const stance = stances.get(resident.id);
    const [jx, jy] = jitter ? jitterOf(resident.id) : [0, 0];
    return {
      id: resident.id,
      gender: resident.id % 2 === 1 ? 'male' : 'female',
      x: CENTER_PX + jx + (stance?.offsetX ?? 0),
      y: CENTER_PX + jy + (stance?.offsetY ?? 0),
      facing: stance?.facing ?? 1,
    } satisfies Actor;
  });
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  contextKey: string,
  actors: readonly Actor[],
  anchor: WorkAnchorEdit,
  options: SceneOptions,
  animationTimeMs: number,
): void {
  const sprites = getActiveSprites();
  const { job, terrain } = parseContext(contextKey);

  for (let ty = 0; ty < SPAN; ty++) {
    for (let tx = 0; tx < SPAN; tx++) {
      const target = tx === CENTER_TILE && ty === CENTER_TILE;
      sprites.drawTerrain(ctx, tileParams(tx, ty, terrain, options, target));
    }
  }

  // 행 정렬 — renderer.ts의 rowRenderQueue와 **같은 규칙**이다. 노두·나무는 칸 밑변
  // ((y+1)*TILE), 주민은 자기 발끝 y로 정렬되므로 대상물이 주민을 가리는 일이 실제로 있다.
  // 여기서 순서를 뒤집으면 "보이는 위치"를 맞춰도 게임에서는 가려진다.
  const queue: { sortY: number; sortX: number; serial: number; draw: () => void }[] = [];
  const residentDraws: ResidentDrawParams[] = [];
  for (const actor of actors) {
    const params: ResidentDrawParams = {
      job,
      gender: actor.gender,
      x: actor.x,
      y: actor.y,
      sick: false,
      carrying: false,
      selected: false,
      showJobMarker: false,
      showCargoMarker: false,
      moving: false,
      working: true,
      facing: actor.facing,
      animationTimeMs,
    };
    residentDraws.push(params);
    queue.push({ sortY: actor.y, sortX: actor.x, serial: queue.length, draw: () => sprites.drawResident(ctx, params) });
  }
  const targetParams = tileParams(CENTER_TILE, CENTER_TILE, terrain, options, true);
  queue.push({
    sortY: (CENTER_TILE + 1) * TILE,
    sortX: (CENTER_TILE + 0.5) * TILE,
    serial: queue.length,
    draw: () => {
      if (terrain === 'rock') sprites.drawTerrainProp?.(ctx, targetParams);
      else sprites.drawTerrainOverlay?.(ctx, targetParams);
    },
  });
  queue.sort((left, right) =>
    left.sortY - right.sortY || left.sortX - right.sortX || left.serial - right.serial);
  for (const entry of queue) entry.draw();

  // 수관 그림자 밑 유령 — 게임은 나무에 가린 주민을 잎 안쪽에만 48%로 겹쳐 그린다.
  // 이걸 빼면 숲에서 "완전히 가려진다"고 잘못 판단하게 된다.
  if (terrain === 'forest') {
    const canopyMap = { map: canopyScene(options.stage) };
    for (const resident of residentDraws) {
      const size = TILE * (resident.sizeScale ?? 1);
      const canopies = treeCanopiesIntersectingRect(
        canopyMap, resident.x - size / 2, resident.y - size / 2, size, size,
      ).filter(canopy => canopy.sortY > resident.y);
      drawUnderCanopyGhost(ctx, canopies, 'opacity(48%)', () => sprites.drawResident(ctx, resident));
    }
  }

  // 안내선은 맨 위에 — 대상물에 가려지면 기준으로 쓸 수 없다.
  ctx.strokeStyle = 'rgba(217,164,65,0.55)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(CENTER_TILE * TILE + 0.25, CENTER_TILE * TILE + 0.25, TILE - 0.5, TILE - 0.5);

  // 칸 중심 (앵커 0 기준점)
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.moveTo(CENTER_PX - 3, CENTER_PX);
  ctx.lineTo(CENTER_PX + 3, CENTER_PX);
  ctx.moveTo(CENTER_PX, CENTER_PX - 3);
  ctx.lineTo(CENTER_PX, CENTER_PX + 3);
  ctx.stroke();

  // 도구 접점 — 게임은 읽지 않는다. 도끼날·곡괭이 끝이 대상물에 닿는지 눈으로 맞추는 표시.
  const tipX = CENTER_PX + (anchor.toolTipX ?? 0);
  const tipY = CENTER_PX + (anchor.toolTipY ?? 0);
  ctx.strokeStyle = 'rgba(224,108,92,0.95)';
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.moveTo(tipX - 4, tipY);
  ctx.lineTo(tipX + 4, tipY);
  ctx.moveTo(tipX, tipY - 4);
  ctx.lineTo(tipX, tipY + 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(tipX, tipY, 2, 0, Math.PI * 2);
  ctx.stroke();
}

interface Props {
  anchors: Record<string, WorkAnchorEdit>;
  savedAnchors: Record<string, WorkAnchorEdit>;
  onChange(key: string, anchor: WorkAnchorEdit): void;
  animate: boolean;
}

type DragKind = 'resident' | 'toolTip';

export function StanceStage({ anchors, savedAnchors, onChange, animate }: Props) {
  const [contextKey, setContextKey] = useState(WORK_ANCHOR_KEYS[0] ?? 'miner@rock');
  const [workers, setWorkers] = useState(1);
  const [zoom, setZoom] = useState<number>(4);
  const [jitter, setJitter] = useState(true);
  const [options, setOptions] = useState<SceneOptions>({
    season: 'summer', mineral: 'iron', tier: 'large', species: 'broadleaf', stage: 'mature',
  });
  const [, setReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ kind: DragKind; startX: number; startY: number; base: WorkAnchorEdit } | null>(null);

  useEffect(() => onAtlasAssetSettled(() => setReady(value => !value)), []);

  const anchor = anchors[contextKey] ?? DEFAULT_ANCHOR;
  const saved = savedAnchors[contextKey] ?? DEFAULT_ANCHOR;
  const dirty = JSON.stringify(anchor) !== JSON.stringify(saved);
  const { terrain } = useMemo(() => parseContext(contextKey), [contextKey]);

  const actors = useMemo(
    () => buildActors(contextKey, workers, anchors, jitter),
    [contextKey, workers, anchors, jitter],
  );

  useEffect(() => {
    let raf = 0;
    let stopped = false;
    const start = performance.now();
    const paint = () => {
      if (stopped) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.setTransform(zoom, 0, 0, zoom, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, SCENE, SCENE);
        drawScene(ctx, contextKey, actors, anchor, options, animate ? performance.now() - start : 0);
      }
      raf = requestAnimationFrame(paint);
    };
    paint();
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, [contextKey, actors, anchor, options, animate, zoom]);

  const update = useCallback(
    (patch: Partial<WorkAnchorEdit>) => onChange(contextKey, { ...anchor, ...patch }),
    [contextKey, anchor, onChange],
  );

  // 테두리 1px이 rect에 포함되므로 그림 원점은 그만큼 안쪽이다.
  const logicalAt = (canvas: HTMLCanvasElement, clientX: number, clientY: number): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    const border = (rect.width - canvas.width) / 2;
    return [(clientX - rect.left - border) / zoom, (clientY - rect.top - border) / zoom];
  };

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const [px, py] = logicalAt(event.currentTarget, event.clientX, event.clientY);
    const tipX = CENTER_PX + (anchor.toolTipX ?? 0);
    const tipY = CENTER_PX + (anchor.toolTipY ?? 0);
    // 십자가 먼저 — 주민 몸통에 겹쳐 있어도 집을 수 있어야 한다.
    const kind: DragKind = Math.hypot(px - tipX, py - tipY) <= 5 ? 'toolTip' : 'resident';
    dragRef.current = { kind, startX: px, startY: py, base: anchor };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [anchor, zoom]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const [px, py] = logicalAt(event.currentTarget, event.clientX, event.clientY);
    // 상대 이동으로 다룬다 — 지터·벌리기가 얹힌 절대 좌표를 역산하지 않아도 된다.
    const dx = Math.round(px - drag.startX);
    const dy = Math.round(py - drag.startY);
    if (drag.kind === 'toolTip') {
      update({ toolTipX: (drag.base.toolTipX ?? 0) + dx, toolTipY: (drag.base.toolTipY ?? 0) + dy });
    } else {
      // 자기 칸 밖으로는 못 나간다 — 이웃 칸으로 넘어가면 행 정렬이 어긋나 가림 순서가 뒤집힌다.
      update({
        offsetX: clampToTile(drag.base.offsetX + dx),
        offsetY: clampToTile(drag.base.offsetY + dy),
      });
    }
  }, [update, zoom]);

  const endDrag = useCallback(() => { dragRef.current = null; }, []);

  return (
    <div className="stage">
      <div className="stage-view">
        <canvas
          ref={canvasRef}
          width={SCENE * zoom}
          height={SCENE * zoom}
          className="stage-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        <div className="stage-hint muted">
          주민을 끌면 offset, 붉은 십자를 끌면 도구 접점. 도구 접점은 게임이 읽지 않는 표시 전용 값입니다.
        </div>
      </div>

      <div className="stage-panel">
        <div className="field">
          <span>문맥</span>
          <select value={contextKey} onChange={event => setContextKey(event.target.value)}>
            {WORK_ANCHOR_KEYS.map(key => (
              <option key={key} value={key}>{key}{savedAnchors[key] ? ' ●' : ''}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <span>가로 {anchor.offsetX}px</span>
          <input
            type="range" min={-14} max={14} step={1} value={anchor.offsetX}
            onChange={event => update({ offsetX: Number(event.target.value) })}
          />
        </div>
        <div className="field">
          <span>세로 {anchor.offsetY}px</span>
          <input
            type="range" min={-14} max={14} step={1} value={anchor.offsetY}
            onChange={event => update({ offsetY: Number(event.target.value) })}
          />
        </div>

        <div className="field">
          <span>방향</span>
          <div className="seg">
            {([0, -1, 1] as const).map(value => (
              <button
                type="button"
                key={value}
                className={`seg-btn${anchor.facing === value ? ' on' : ''}`}
                onClick={() => update({ facing: value })}
              >
                {value === 0 ? '기존' : value === -1 ? '왼쪽' : '오른쪽'}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>동시 작업자 {workers}인</span>
          <div className="seg">
            {[1, 2, 3, 4].map(count => (
              <button
                type="button"
                key={count}
                className={`seg-btn${workers === count ? ' on' : ''}`}
                onClick={() => setWorkers(count)}
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>대상물</span>
          {terrain === 'rock' ? (
            <div className="seg-stack">
              <select
                value={options.mineral}
                onChange={event => setOptions(o => ({ ...o, mineral: event.target.value as MineralResource }))}
              >
                {MINERALS.map(mineral => <option key={mineral} value={mineral}>{MINERAL_LABEL[mineral]}</option>)}
              </select>
              <select
                value={options.tier}
                onChange={event => setOptions(o => ({ ...o, tier: event.target.value as MineralVisualTier }))}
              >
                {TIERS.map(tier => <option key={tier} value={tier}>{TIER_LABEL[tier]}</option>)}
              </select>
            </div>
          ) : (
            <div className="seg-stack">
              <select
                value={options.species}
                onChange={event => setOptions(o => ({ ...o, species: event.target.value as TreeSpecies }))}
              >
                {SPECIES.map(species => <option key={species} value={species}>{SPECIES_LABEL[species]}</option>)}
              </select>
              <select
                value={options.stage}
                onChange={event => setOptions(o => ({ ...o, stage: event.target.value as Exclude<TreeStage, 'stump'> }))}
              >
                {TREE_STAGES.map(stage => <option key={stage} value={stage}>{TREE_STAGE_LABEL[stage]}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="field">
          <span>계절</span>
          <select
            value={options.season}
            onChange={event => setOptions(o => ({ ...o, season: event.target.value as Season }))}
          >
            {SEASONS.map(season => <option key={season} value={season}>{SEASON_LABEL[season]}</option>)}
          </select>
        </div>

        <div className="field">
          <span>확대</span>
          <div className="seg">
            {ZOOMS.map(value => (
              <button
                type="button"
                key={value}
                className={`seg-btn${zoom === value ? ' on' : ''}`}
                onClick={() => setZoom(value)}
              >
                {value}×
              </button>
            ))}
          </div>
        </div>

        <label className="toggle">
          <input type="checkbox" checked={jitter} onChange={event => setJitter(event.target.checked)} />
          지터 적용 (게임 기본값)
        </label>

        <div className="stage-readout muted">
          {dirty ? '저장 전 (미리보기)' : '저장된 값'} · 도구 접점 {anchor.toolTipX ?? 0}, {anchor.toolTipY ?? 0}
        </div>
        <button type="button" className="btn" onClick={() => onChange(contextKey, { ...DEFAULT_ANCHOR })}>
          기본값으로
        </button>
      </div>
    </div>
  );
}
