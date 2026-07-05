// 절차적 지도 생성 + 시드 난수
import { CONFIG } from './config';
import type { Tile, Terrain } from './types';

// mulberry32 시드 난수 — 지도 생성과 시뮬레이션 전반에서 사용
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickWeighted<T extends string>(rng: () => number, table: Record<T, number>): T {
  const entries = Object.entries(table) as [T, number][];
  let r = rng() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

function blob(tiles: Tile[][], rng: () => number, cx: number, cy: number, size: number, terrain: Terrain, over: Terrain[]) {
  const w = CONFIG.map.width, h = CONFIG.map.height;
  let x = cx, y = cy;
  for (let i = 0; i < size; i++) {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi >= 0 && yi >= 0 && xi < w && yi < h && over.includes(tiles[yi][xi].terrain)) {
      tiles[yi][xi].terrain = terrain;
    }
    x += (rng() - 0.5) * 3;
    y += (rng() - 0.5) * 3;
    x = Math.max(0, Math.min(w - 1, x));
    y = Math.max(0, Math.min(h - 1, y));
  }
}

// 두만강 이북 개척지 지형 생성
export function generateMap(seed: number): { tiles: Tile[][]; centerX: number; centerY: number } {
  const rng = makeRng(seed);
  const w = CONFIG.map.width, h = CONFIG.map.height;

  const tiles: Tile[][] = [];
  for (let y = 0; y < h; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < w; x++) {
      row.push({ x, y, terrain: 'plain', hasIron: false, buildingId: null });
    }
    tiles.push(row);
  }

  // 강: 북쪽에서 남쪽으로 굽이치며 흐른다.
  // 이전 행의 물줄기와 좌우로 겹치게 이어 붙여, 대각선으로만 닿아 끊겨 보이는 일을 막는다.
  let rx = Math.floor(w * (0.3 + rng() * 0.4));
  let prevRx = rx;
  for (let y = 0; y < h; y++) {
    const width = 1 + (rng() < 0.4 ? 1 : 0);
    const lo = Math.min(rx, prevRx);
    const hi = Math.max(rx + width - 1, prevRx);
    for (let x = lo; x <= hi; x++) {
      const xx = Math.max(0, Math.min(w - 1, x));
      tiles[y][xx].terrain = 'river';
    }
    prevRx = rx;
    rx += Math.round((rng() - 0.5) * 2.4);
    rx = Math.max(3, Math.min(w - 4, rx));
  }

  // 산지: 동쪽/북쪽 가장자리에 능선
  for (let i = 0; i < 10; i++) {
    blob(tiles, rng, w - 2 - rng() * 5, rng() * h, 26, 'mountain', ['plain']);
  }
  for (let i = 0; i < 6; i++) {
    blob(tiles, rng, rng() * w, rng() * 4, 20, 'mountain', ['plain']);
  }

  // 숲: 넓게 분포
  for (let i = 0; i < 26; i++) {
    blob(tiles, rng, rng() * w, rng() * h, 30, 'forest', ['plain']);
  }

  // 사냥터: 숲 근처 개활지
  for (let i = 0; i < 7; i++) {
    blob(tiles, rng, rng() * w, rng() * h, 8, 'hunting', ['forest', 'plain']);
  }

  // 바위/철광: 산지 가장자리(평지와 맞닿은 곳)에만 생성해 주민이 걸어서 닿을 수 있게 한다
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (tiles[y][x].terrain !== 'mountain') continue;
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const t = tiles[y + dy]?.[x + dx];
        return t && t.terrain !== 'mountain' && t.terrain !== 'rock' && t.terrain !== 'river';
      });
      if (edge && rng() < 0.25) {
        tiles[y][x].terrain = 'rock';
        tiles[y][x].hasIron = rng() < 0.5;
      }
    }
  }

  // 비옥한 땅: 강 인접 평지
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (tiles[y][x].terrain !== 'plain') continue;
      let nearRiver = false;
      for (let dy = -2; dy <= 2 && !nearRiver; dy++) {
        for (let dx = -2; dx <= 2 && !nearRiver; dx++) {
          const t = tiles[y + dy]?.[x + dx];
          if (t && t.terrain === 'river') nearRiver = true;
        }
      }
      if (nearRiver && rng() < 0.55) tiles[y][x].terrain = 'fertile';
    }
  }

  // 마을 중심지: 지도 중앙 부근에서 강에서 조금 떨어진 평지를 찾는다
  let centerX = Math.floor(w / 2), centerY = Math.floor(h / 2);
  outer:
  for (let r = 0; r < 15; r++) {
    for (let tryI = 0; tryI < 30; tryI++) {
      const x = Math.floor(w / 2 + (rng() - 0.5) * (6 + r * 2));
      const y = Math.floor(h / 2 + (rng() - 0.5) * (6 + r * 2));
      const t = tiles[y]?.[x];
      if (t && (t.terrain === 'plain' || t.terrain === 'fertile' || t.terrain === 'forest')) {
        centerX = x; centerY = y;
        break outer;
      }
    }
  }
  // 중심지 주변 3x3을 평지로 정리
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const t = tiles[centerY + dy]?.[centerX + dx];
      if (t && t.terrain !== 'river') t.terrain = 'plain';
    }
  }
  tiles[centerY][centerX].terrain = 'center';

  // 마을 근처에 사냥터를 최소 몇 타일 보장해 초반 식량 운을 줄인다
  let nearbyHunting = 0;
  for (let dy = -8; dy <= 8; dy++) {
    for (let dx = -8; dx <= 8; dx++) {
      const t = tiles[centerY + dy]?.[centerX + dx];
      if (t && t.terrain === 'hunting') nearbyHunting++;
    }
  }
  if (nearbyHunting < 4) {
    let added = 0;
    for (let tryI = 0; tryI < 200 && added < 5; tryI++) {
      const dx = Math.round((rng() - 0.5) * 12);
      const dy = Math.round((rng() - 0.5) * 12);
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) continue; // 마을 바로 옆은 비워둔다
      const t = tiles[centerY + dy]?.[centerX + dx];
      if (t && (t.terrain === 'forest' || t.terrain === 'plain')) {
        t.terrain = 'hunting';
        added++;
      }
    }
  }

  return { tiles, centerX, centerY };
}

// 지도에 철광 타일이 있는지 (대장장이 채광 가능 여부)
export function hasIronTiles(tiles: Tile[][]): boolean {
  return tiles.some(row => row.some(t => t.terrain === 'rock' && t.hasIron));
}

export function hasRockTiles(tiles: Tile[][]): boolean {
  return tiles.some(row => row.some(t => t.terrain === 'rock' || t.terrain === 'mountain'));
}
