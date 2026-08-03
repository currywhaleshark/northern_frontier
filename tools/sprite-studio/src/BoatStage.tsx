import { useEffect, useRef, useState } from 'react';
import type { FishingBoatFacing } from '@game/game/types';
import { drawFishingBoatAtlas, onAtlasAssetSettled } from '@game/render/atlas';
import {
  FISHING_BOAT_VISUAL_STATES,
  fishingBoatAuthoredFacing,
  type FishingBoatVisualState,
} from '@game/render/fishingBoatAssets';

const SCENE_W = 300;
const SCENE_H = 220;
const ZOOM = 2;

const FACING_LABELS: Record<FishingBoatFacing, string> = {
  ne: '북동 · 원본',
  nw: '북서 · NE 반전',
  se: '남동 · SW 반전',
  sw: '남서 · 원본',
};

const STATE_LABELS: Record<FishingBoatVisualState, string> = {
  sailing: '항행 · 돛 펼침',
  moored: '계류 · 돛 묶음',
  fishing: '조업 · 큰 그물',
  lake_winter_moored: '호수 한겨울 · 적설 계류',
  sea_winter_sailing: '겨울 바다 · 항행',
  sea_winter_fishing: '겨울 바다 · 조업',
};

function drawWater(ctx: CanvasRenderingContext2D, state: FishingBoatVisualState): void {
  const frozen = state === 'lake_winter_moored';
  ctx.fillStyle = frozen ? '#c8dbe1' : '#397f98';
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  ctx.strokeStyle = frozen ? 'rgba(248,252,250,0.7)' : 'rgba(185,222,225,0.34)';
  ctx.lineWidth = 1;
  for (let y = 24; y < SCENE_H; y += 18) {
    ctx.beginPath();
    for (let x = 0; x <= SCENE_W; x += 18) {
      const wave = Math.sin((x + y) * 0.08) * 2;
      if (x === 0) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }
}

export function BoatStage() {
  const [facing, setFacing] = useState<FishingBoatFacing>('ne');
  const [state, setState] = useState<FishingBoatVisualState>('fishing');
  const [ready, setReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => onAtlasAssetSettled(() => setReady(value => !value)), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.setTransform(ZOOM, 0, 0, ZOOM, 0, 0);
    ctx.imageSmoothingEnabled = false;
    drawWater(ctx, state);
    drawFishingBoatAtlas(ctx, SCENE_W / 2, 170, facing, state);
  }, [facing, ready, state]);

  const authored = fishingBoatAuthoredFacing(facing);

  return (
    <div className="stage">
      <div className="stage-view">
        <canvas
          ref={canvasRef}
          width={SCENE_W * ZOOM}
          height={SCENE_H * ZOOM}
          className="stage-canvas"
        />
        <div className="stage-hint muted">
          게임과 같은 126×112 표시 크기·하단 물선 앵커·manifest 프레임을 사용합니다.
        </div>
      </div>
      <div className="stage-panel">
        <div className="field">
          <span>상태</span>
          <select value={state} onChange={event => setState(event.target.value as FishingBoatVisualState)}>
            {FISHING_BOAT_VISUAL_STATES.map(value => (
              <option key={value} value={value}>{STATE_LABELS[value]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <span>뱃머리</span>
          <select value={facing} onChange={event => setFacing(event.target.value as FishingBoatFacing)}>
            {(Object.keys(FACING_LABELS) as FishingBoatFacing[]).map(value => (
              <option key={value} value={value}>{FACING_LABELS[value]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <span>방향 계약</span>
          <strong>{authored.direction.toUpperCase()} 원본{authored.mirrorX ? ' · 좌우반전' : ''}</strong>
        </div>
        <p className="muted">
          호수 적설 정박과 겨울 바다 항행·조업도 같은 시트에서 선택합니다. 큰 그물 프레임은
          RGB 210 컷아웃과 연결요소 추출을 거친 최종본입니다.
        </p>
      </div>
    </div>
  );
}
