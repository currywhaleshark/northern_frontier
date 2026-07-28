// 탭 A — 비율 정렬대.
// 전 키를 격자로 늘어놓고 게임과 같은 배율로 그린다. 기준 실루엣을 겹쳐 이상치를 눈에 띄게 한다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { getActiveSprites, onAtlasAssetSettled } from '@game/render/atlas';
import { SPRITE_DISPLAY_METRIC_KEYS } from '@game/render/spriteStudioRegistries';
import { CONFIG } from '@game/game/config';
import type { Gender } from '@game/game/types';
import { PREVIEW_GENDERS, previewForKey } from './mockParams';
import type { SpriteDisplayMetric } from './api';

const TILE = CONFIG.ui.tileSize;
const CELL = TILE * 3;      // 카드 한 칸의 논리 크기
const ZOOM = 3;             // 픽셀아트라 정수 배율로 확대

interface Props {
  metrics: Record<string, SpriteDisplayMetric>;
  savedMetrics: Record<string, SpriteDisplayMetric>;
  onChange(key: string, metric: SpriteDisplayMetric): void;
  selectedKey: string | null;
  onSelect(key: string): void;
  animate: boolean;
  showReference: boolean;
}

const DEFAULT_METRIC: SpriteDisplayMetric = { scale: 1, dy: 0 };

function metricOf(table: Record<string, SpriteDisplayMetric>, key: string): SpriteDisplayMetric {
  return table[key] ?? DEFAULT_METRIC;
}

/**
 * 한 칸을 그린다. 편집 중인 값은 아직 코드젠을 거치지 않았으므로, 저장된 값 대비
 * 차이만큼 sizeScale·translate로 보정해 미리 보여 준다 (게임과 같은 그리기 코드를 쓴다).
 */
function drawCell(
  ctx: CanvasRenderingContext2D,
  key: string,
  gender: Gender,
  pending: SpriteDisplayMetric,
  saved: SpriteDisplayMetric,
  animationTimeMs: number,
  reference: boolean,
): void {
  const sprites = getActiveSprites();
  const preview = previewForKey(key);
  const cx = CELL / 2;
  const groundY = CELL - TILE * 0.6;

  const drawWith = (params: Parameters<typeof sprites.drawResident>[1], alpha: number) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(0, pending.dy - saved.dy);
    sprites.drawResident(ctx, params);
    ctx.restore();
  };

  if (reference) {
    // 기준 실루엣 — 공용 보행 시트의 정지 프레임을 반투명 회색으로 겹친다.
    const referencePreview = previewForKey('common');
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.filter = 'grayscale(100%) brightness(0.6)';
    sprites.drawResident(ctx, {
      ...referencePreview.params, gender, x: cx, y: groundY, animationTimeMs: 0,
    } as Parameters<typeof sprites.drawResident>[1]);
    ctx.restore();
    ctx.filter = 'none';
  }

  drawWith({
    ...preview.params,
    gender,
    x: cx,
    y: groundY,
    animationTimeMs,
    // 저장값은 이미 레지스트리가 먹였으므로 차이분만 곱한다.
    sizeScale: (preview.params.sizeScale ?? 1) * (pending.scale / (saved.scale || 1)),
  } as Parameters<typeof sprites.drawResident>[1], 1);
}

function Cell({
  metricKey, gender, pending, saved, animate, showReference,
}: {
  metricKey: string; gender: Gender;
  pending: SpriteDisplayMetric; saved: SpriteDisplayMetric;
  animate: boolean; showReference: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    let stopped = false;
    const start = performance.now();
    const paint = () => {
      if (stopped) return;
      const canvas = ref.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.setTransform(ZOOM, 0, 0, ZOOM, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, CELL, CELL);
        // 발끝 기준선
        ctx.fillStyle = 'rgba(120,160,200,0.35)';
        ctx.fillRect(0, CELL - TILE * 0.6, CELL, 1 / ZOOM);
        drawCell(ctx, metricKey, gender, pending, saved, animate ? performance.now() - start : 0, showReference);
      }
      raf = requestAnimationFrame(paint);
    };
    paint();
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, [metricKey, gender, pending.scale, pending.dy, saved.scale, saved.dy, animate, showReference]);

  return <canvas ref={ref} width={CELL * ZOOM} height={CELL * ZOOM} className="cell-canvas" />;
}

export function ScaleBench({
  metrics, savedMetrics, onChange, selectedKey, onSelect, animate, showReference,
}: Props) {
  const [filter, setFilter] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => onAtlasAssetSettled(() => setReady(value => !value)), []);

  const keys = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return SPRITE_DISPLAY_METRIC_KEYS.filter(key => !needle || key.toLowerCase().includes(needle));
  }, [filter, ready]);

  const selected = selectedKey ? metricOf(metrics, selectedKey) : null;

  return (
    <div className="bench">
      <div className="bench-toolbar">
        <input
          className="filter"
          placeholder="키 검색 (work. / i2v. / jige. …)"
          value={filter}
          onChange={event => setFilter(event.target.value)}
        />
        <span className="muted">{keys.length} / {SPRITE_DISPLAY_METRIC_KEYS.length}</span>
      </div>

      <div className="bench-grid">
        {keys.map(key => {
          const preview = previewForKey(key);
          const pending = metricOf(metrics, key);
          const saved = metricOf(savedMetrics, key);
          const edited = pending.scale !== saved.scale || pending.dy !== saved.dy;
          const touched = pending.scale !== 1 || pending.dy !== 0;
          return (
            <button
              type="button"
              key={key}
              className={`card${selectedKey === key ? ' selected' : ''}${edited ? ' edited' : ''}`}
              onClick={() => onSelect(key)}
              title={preview.shadowedBy ? `${preview.label} — ${preview.shadowedBy}가 있으면 그쪽이 먼저 그려진다` : preview.label}
            >
              <div className="card-canvases">
                {PREVIEW_GENDERS.map(gender => (
                  <Cell
                    key={gender}
                    metricKey={key}
                    gender={gender}
                    pending={pending}
                    saved={saved}
                    animate={animate}
                    showReference={showReference}
                  />
                ))}
              </div>
              <div className="card-key">{key}</div>
              <div className="card-meta">
                {touched ? `×${pending.scale.toFixed(2)} ${pending.dy >= 0 ? '+' : ''}${pending.dy}` : '기본'}
                {preview.shadowedBy && <span className="badge" title={`${preview.shadowedBy}에 가려질 수 있다`}>겹침</span>}
              </div>
            </button>
          );
        })}
      </div>

      {selectedKey && selected && (
        <div className="inspector">
          <div className="inspector-title">{selectedKey}</div>
          <label className="field">
            <span>배율 {selected.scale.toFixed(2)}</span>
            <input
              type="range" min={0.5} max={2} step={0.01} value={selected.scale}
              onChange={event => onChange(selectedKey, { ...selected, scale: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span>세로 보정 {selected.dy}</span>
            <input
              type="range" min={-20} max={20} step={1} value={selected.dy}
              onChange={event => onChange(selectedKey, { ...selected, dy: Number(event.target.value) })}
            />
          </label>
          <button type="button" className="btn" onClick={() => onChange(selectedKey, { scale: 1, dy: 0 })}>
            기본값으로
          </button>
        </div>
      )}
    </div>
  );
}
