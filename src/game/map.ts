// 절차적 지도 생성 + 시드 난수
import { CONFIG } from './config';
import {
  rollMineralDepositAmount, setMineralDeposit,
} from './minerals';
import { ensureForestGrowth } from './forestGrowth';
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

function reachableFromCenter(tiles: Tile[][], centerX: number, centerY: number): Set<string> {
  const reachable = new Set<string>([centerX + ',' + centerY]);
  const queue = [{ x: centerX, y: centerY }];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = tiles[current.y + dy]?.[current.x + dx];
      if (!next || next.terrain === 'river' || next.terrain === 'mountain') continue;
      const key = next.x + ',' + next.y;
      if (reachable.has(key)) continue;
      reachable.add(key);
      queue.push({ x: next.x, y: next.y });
    }
  }
  return reachable;
}

function placeNearbyMineralDeposits(
  tiles: Tile[][],
  centerX: number,
  centerY: number,
  rng: () => number,
): void {
  const reachable = reachableFromCenter(tiles, centerX, centerY);
  const collect = (maxDistance: number): Tile[] => tiles.flat().filter(tile => {
    const distance = Math.abs(tile.x - centerX) + Math.abs(tile.y - centerY);
    return distance >= CONFIG.minerals.nearbyMinDistance &&
      distance <= maxDistance &&
      reachable.has(tile.x + ',' + tile.y) &&
      (tile.terrain === 'plain' || tile.terrain === 'forest' || tile.terrain === 'fertile');
  });
  let candidates = collect(CONFIG.minerals.nearbyMaxDistance);
  if (candidates.length < 2) candidates = collect(CONFIG.minerals.nearbyMaxDistance + 5);
  const nonFertile = candidates.filter(tile => tile.terrain !== 'fertile');
  if (nonFertile.length >= 2) candidates = nonFertile;
  if (candidates.length < 2) return;

  const stoneIndex = Math.floor(rng() * candidates.length);
  const stone = candidates.splice(stoneIndex, 1)[0];
  const separated = candidates.filter(tile =>
    Math.abs(tile.x - stone.x) + Math.abs(tile.y - stone.y) >= 2);
  const ironPool = separated.length > 0 ? separated : candidates;
  const iron = ironPool[Math.floor(rng() * ironPool.length)];
  setMineralDeposit(stone, false, CONFIG.minerals.nearbyStone);
  setMineralDeposit(iron, true, CONFIG.minerals.nearbyIron);
}

// 두만강 이북 개척지 지형 생성
export function generateMap(seed: number): { tiles: Tile[][]; centerX: number; centerY: number } {
  const rng = makeRng(seed);
  const w = CONFIG.map.width, h = CONFIG.map.height;
  const areaScale = (w * h) / (44 * 44);
  const scaledCount = (base: number): number => Math.max(1, Math.round(base * areaScale));

  const tiles: Tile[][] = [];
  for (let y = 0; y < h; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < w; x++) {
      row.push({ x, y, terrain: 'plain', hasIron: false, buildingId: null });
    }
    tiles.push(row);
  }

  // 강: 북쪽에서 남쪽으로 굽이치며 흐른다.
  // 중심선을 기준으로 좌우 대칭으로 파내고, 폭은 사인 곡선을 따라 1~3타일로
  // 완만하게 넓어졌다 좁아진다 — 여울(좁은 목)과 소(넓은 물)가 드러난다.
  let riverX = w * (0.3 + rng() * 0.4);
  let drift = 0; // 굽이 관성 — 급하게 꺾이지 않게
  const widthPhase = rng() * Math.PI * 2;
  const widthFreq = 0.10 + rng() * 0.08; // 몇 굽이마다 폭이 바뀌는지
  let prevLo = -1, prevHi = -1;
  for (let y = 0; y < h; y++) {
    const breadth = 2 + Math.sin(y * widthFreq + widthPhase) * 1.25 + (rng() - 0.5) * 0.6;
    const width = Math.max(1, Math.min(3, Math.round(breadth)));
    let lo = Math.round(riverX - (width - 1) / 2);
    let hi = lo + width - 1;
    // 이전 행의 물줄기와 좌우로 겹치게 이어 붙여, 대각선으로만 닿아 끊겨 보이는 일을 막는다
    if (prevLo >= 0) {
      if (lo > prevHi) lo = prevHi;
      if (hi < prevLo) hi = prevLo;
    }
    for (let x = lo; x <= hi; x++) {
      const xx = Math.max(0, Math.min(w - 1, x));
      tiles[y][xx].terrain = 'river';
    }
    prevLo = Math.max(0, Math.min(w - 1, lo));
    prevHi = Math.max(0, Math.min(w - 1, hi));
    drift += (rng() - 0.5) * 0.7;
    drift = Math.max(-1, Math.min(1, drift));
    riverX += drift;
    riverX = Math.max(3, Math.min(w - 4, riverX));
  }

  // 산지: 동쪽/북쪽 가장자리에 능선
  for (let i = 0; i < scaledCount(10); i++) {
    blob(tiles, rng, w - 2 - rng() * 5, rng() * h, 26, 'mountain', ['plain']);
  }
  for (let i = 0; i < scaledCount(6); i++) {
    blob(tiles, rng, rng() * w, rng() * 4, 20, 'mountain', ['plain']);
  }

  // 숲: 넓게 분포
  for (let i = 0; i < scaledCount(26); i++) {
    blob(tiles, rng, rng() * w, rng() * h, 30, 'forest', ['plain']);
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
        const hasIron = rng() < 0.5;
        setMineralDeposit(tiles[y][x], hasIron, rollMineralDepositAmount(hasIron, rng));
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
  // 3×2 중심지와 둘레 한 칸을 평지로 정리한다. centerX/centerY는 북서쪽 기준점이다.
  for (let dy = -1; dy <= 2; dy++) {
    for (let dx = -1; dx <= 3; dx++) {
      const t = tiles[centerY + dy]?.[centerX + dx];
      if (t && t.terrain !== 'river') {
        t.terrain = 'plain';
        t.hasIron = false;
        delete t.mineralRemaining;
      }
    }
  }
  tiles[centerY][centerX].terrain = 'center';
  placeNearbyMineralDeposits(tiles, centerX, centerY, rng);
  ensureForestGrowth(tiles);

  return { tiles, centerX, centerY };
}
