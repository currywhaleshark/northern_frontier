// 절차적 지도 생성 + 시드 난수
import { CONFIG } from './config';
import {
  rollMineralDepositAmount, setMineralDeposit,
} from './minerals';
import { ensureForestGrowth } from './forestGrowth';
import { isNaturalWaterTerrain, isOpenWaterTerrain } from './terrain';
import { coastalGroundAt } from './tidalFlats';
import type { MapRegion, Tile, Terrain } from './types';

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

function blob(
  tiles: Tile[][],
  rng: () => number,
  cx: number,
  cy: number,
  size: number,
  terrain: Terrain,
  over: Terrain[],
  allow?: (x: number, y: number) => boolean,
) {
  const w = tiles[0]?.length ?? 0, h = tiles.length;
  let x = cx, y = cy;
  for (let i = 0; i < size; i++) {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi >= 0 && yi >= 0 && xi < w && yi < h &&
        over.includes(tiles[yi][xi].terrain) && (!allow || allow(xi, yi))) {
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
      if (!next || isOpenWaterTerrain(next.terrain) ||
          next.terrain === 'mountain' || next.terrain === 'rock') continue;
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
export function generateMap(
  seed: number,
  dimensions: Readonly<{ width: number; height: number }> = CONFIG.map,
  region: MapRegion = 'plains',
): { tiles: Tile[][]; centerX: number; centerY: number } {
  const rng = makeRng(seed);
  const w = Math.max(16, Math.floor(dimensions.width));
  const h = Math.max(16, Math.floor(dimensions.height));
  const mountainRegion = region === 'mountain';
  const lakeRegion = region === 'lake';
  const coastRegion = region === 'coast';
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
    const breadth = mountainRegion
      ? 1.25 + Math.sin(y * widthFreq + widthPhase) * 0.55 + (rng() - 0.5) * 0.35
      : 2 + Math.sin(y * widthFreq + widthPhase) * 1.25 + (rng() - 0.5) * 0.6;
    const width = Math.max(1, Math.min(mountainRegion ? 2 : 3, Math.round(breadth)));
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

  // 호수 지역에서만 추가 RNG를 소비한다. 호수 안의 기존 강 칸은 고요한 수면으로 합쳐
  // 유입·유출 강만 남기고 큰 물그릇을 강 흐름 애니메이션에서 분리한다.
  if (lakeRegion) carveLakeBasin(tiles, rng);
  if (coastRegion) carveSeaCoast(tiles, rng);

  // 산지: 동쪽/북쪽 가장자리에 능선
  for (let i = 0; i < scaledCount(lakeRegion ? 7 : 10); i++) {
    blob(tiles, rng, w - 2 - rng() * 5, rng() * h, 26, 'mountain', ['plain']);
  }
  for (let i = 0; i < scaledCount(lakeRegion ? 4 : 6); i++) {
    blob(tiles, rng, rng() * w, rng() * 4, 20, 'mountain', ['plain']);
  }

  // 산지는 둘레뿐 아니라 내부까지 낮고 굽은 능선이 들어온다. 정착 후보 중심부는 열어 둔다.
  if (mountainRegion) {
    const safeRadius = Math.max(8, Math.round(Math.min(w, h) * 0.13));
    const allowInteriorRidge = (x: number, y: number): boolean =>
      Math.hypot(x - w / 2, y - h / 2) >= safeRadius;
    for (let i = 0; i < scaledCount(10); i++) {
      blob(
        tiles,
        rng,
        5 + rng() * Math.max(1, w - 10),
        5 + rng() * Math.max(1, h - 10),
        38,
        'mountain',
        ['plain'],
        allowInteriorRidge,
      );
    }
  }

  // 숲: 넓게 분포
  for (let i = 0; i < scaledCount(mountainRegion ? 40 : lakeRegion ? 18 : 26); i++) {
    blob(tiles, rng, rng() * w, rng() * h, mountainRegion ? 36 : 30, 'forest', ['plain']);
  }

  // 바위/철광: 산지 가장자리(평지와 맞닿은 곳)에만 생성해 주민이 걸어서 닿을 수 있게 한다
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (tiles[y][x].terrain !== 'mountain') continue;
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const t = tiles[y + dy]?.[x + dx];
        return t && t.terrain !== 'mountain' && t.terrain !== 'rock' &&
          !isOpenWaterTerrain(t.terrain);
      });
      if (edge && rng() < (mountainRegion ? 0.38 : lakeRegion ? 0.15 : 0.25)) {
        const hasIron = rng() < (mountainRegion ? 0.6 : 0.5);
        setMineralDeposit(tiles[y][x], hasIron, rollMineralDepositAmount(hasIron, rng));
      }
    }
  }

  // 비옥한 땅: 강·호수 인접 평지
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (tiles[y][x].terrain !== 'plain') continue;
      let nearRiver = false;
      for (let dy = -2; dy <= 2 && !nearRiver; dy++) {
        for (let dx = -2; dx <= 2 && !nearRiver; dx++) {
          const t = tiles[y + dy]?.[x + dx];
          if (t && isNaturalWaterTerrain(t.terrain)) nearRiver = true;
        }
      }
      if (nearRiver && rng() < (mountainRegion ? 0.27 : lakeRegion ? 0.65 : 0.55)) {
        tiles[y][x].terrain = 'fertile';
      }
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
      const clearWaterFootprint = (!lakeRegion && !coastRegion) || Array.from({ length: 4 }, (_row, dy) =>
        Array.from({ length: 5 }, (_cell, dx) => tiles[y - 1 + dy]?.[x - 1 + dx]))
        .flat()
        .every(candidate => candidate && !isOpenWaterTerrain(candidate.terrain) &&
          candidate.terrain !== 'mountain' && candidate.terrain !== 'rock');
      if (t && clearWaterFootprint &&
          (t.terrain === 'plain' || t.terrain === 'fertile' || t.terrain === 'forest')) {
        centerX = x; centerY = y;
        break outer;
      }
    }
  }
  // 3×2 중심지와 둘레 한 칸을 평지로 정리한다. centerX/centerY는 북서쪽 기준점이다.
  for (let dy = -1; dy <= 2; dy++) {
    for (let dx = -1; dx <= 3; dx++) {
      const t = tiles[centerY + dy]?.[centerX + dx];
      if (t && !isOpenWaterTerrain(t.terrain)) {
        t.terrain = 'plain';
        t.hasIron = false;
        delete t.mineralRemaining;
      }
    }
  }
  tiles[centerY][centerX].terrain = 'center';
  if (lakeRegion || coastRegion) ensureNearbyForest(tiles, centerX, centerY);
  placeNearbyMineralDeposits(tiles, centerX, centerY, rng);
  if (coastRegion) clearCoastalTransitionProps(tiles);
  ensureForestGrowth(tiles);

  return { tiles, centerX, centerY };
}

function clearCoastalTransitionProps(tiles: Tile[][]): void {
  for (const row of tiles) for (const tile of row) {
    if (tile.terrain === 'mudflat') {
      tile.hasIron = false;
      delete tile.mineralRemaining;
      continue;
    }
    if (coastalGroundAt(tiles, tile.x, tile.y) == null) continue;
    // 모래·자갈 전이대는 지물이 없는 완충지로 남긴다. 바위 노두도 해변 바닥 표현으로만
    // 흡수하고, 실제 산줄기는 암반 해안으로 유지한다.
    if (tile.terrain === 'forest' || tile.terrain === 'rock') tile.terrain = 'plain';
    if (tile.terrain === 'plain' || tile.terrain === 'fertile') {
      tile.hasIron = false;
      delete tile.mineralRemaining;
      delete tile.treeStage;
    }
  }
}

function carveLakeBasin(tiles: Tile[][], rng: () => number): void {
  const w = tiles[0]?.length ?? 0;
  const h = tiles.length;
  if (w === 0 || h === 0) return;
  const targetRatio = 0.18 + rng() * 0.02;
  const aspect = 1.12 + rng() * 0.28;
  const radius = Math.sqrt((w * h * targetRatio) / Math.PI);
  const rx = Math.min(w * 0.32, radius * Math.sqrt(aspect));
  const ry = Math.min(h * 0.32, radius / Math.sqrt(aspect));
  const marginX = rx + 3;
  const marginY = ry + 3;
  const cx = marginX + rng() * Math.max(1, w - marginX * 2);
  const cy = marginY + rng() * Math.max(1, h - marginY * 2);
  const phase3 = rng() * Math.PI * 2;
  const phase5 = rng() * Math.PI * 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      const angle = Math.atan2(ny, nx);
      const edge = 1 + Math.sin(angle * 3 + phase3) * 0.075 + Math.sin(angle * 5 + phase5) * 0.04;
      if (Math.hypot(nx, ny) <= edge &&
          (tiles[y][x].terrain === 'plain' || tiles[y][x].terrain === 'river')) {
        tiles[y][x].terrain = 'lake';
      }
    }
  }
}

function carveSeaCoast(tiles: Tile[][], rng: () => number): void {
  const w = tiles[0]?.length ?? 0;
  const h = tiles.length;
  if (w === 0 || h === 0) return;
  const targetDepth = h * (0.20 + rng() * 0.025);
  const phaseA = rng() * Math.PI * 2;
  const phaseB = rng() * Math.PI * 2;
  const shoreline: number[] = [];
  let noise = 0;
  for (let x = 0; x < w; x++) {
    noise = Math.max(-1.5, Math.min(1.5, noise + (rng() - 0.5) * 0.65));
    const normalizedX = x / Math.max(1, w - 1);
    const broad = Math.sin(normalizedX * Math.PI * 2 + phaseA) * h * 0.018;
    const coves = Math.sin(normalizedX * Math.PI * 5 + phaseB) * h * 0.009;
    shoreline[x] = Math.max(
      Math.floor(h * 0.68),
      Math.min(h - 3, Math.round(h - targetDepth + broad + coves + noise)),
    );
  }
  // 인접 열의 해안선이 한 칸씩 이어지게 하여 고립된 수면이나 대각선 틈을 만들지 않는다.
  for (let x = 1; x < w; x++) {
    shoreline[x] = Math.max(shoreline[x - 1] - 1, Math.min(shoreline[x - 1] + 1, shoreline[x]));
  }
  for (let x = w - 2; x >= 0; x--) {
    shoreline[x] = Math.max(shoreline[x + 1] - 1, Math.min(shoreline[x + 1] + 1, shoreline[x]));
  }
  const mouthColumns = shoreline
    .map((shoreY, x) => tiles[shoreY]?.[x]?.terrain === 'river' ? x : -1)
    .filter(x => x >= 0);
  const mouthCenter = mouthColumns.length > 0
    ? Math.round(mouthColumns.reduce((sum, x) => sum + x, 0) / mouthColumns.length)
    : Math.floor(w / 2);
  for (let x = 0; x < w; x++) {
    for (let y = shoreline[x]; y < h; y++) tiles[y][x].terrain = 'sea';
  }
  // 하구와 잔잔한 만의 육지 안쪽에는 실제 작업 가능한 갯벌을 남긴다. 후속 산·숲 blob은
  // plain만 덮으므로 이 띠를 침범하지 않고, 바다 면적 18~24%도 그대로 보존된다.
  for (let x = 0; x < w; x++) {
    const nearMouth = Math.abs(x - mouthCenter) <= Math.max(5, Math.round(w * 0.08));
    const neighborAverage = ((shoreline[Math.max(0, x - 2)] ?? shoreline[x]) +
      (shoreline[Math.min(w - 1, x + 2)] ?? shoreline[x])) / 2;
    const shelteredCove = shoreline[x] < neighborAverage - 0.25;
    if (!nearMouth && !shelteredCove) continue;
    const band = nearMouth ? 2 : 1;
    for (let y = Math.max(0, shoreline[x] - band); y < shoreline[x]; y++) {
      const tile = tiles[y][x];
      if (tile.terrain !== 'plain') continue;
      tile.terrain = 'mudflat';
      tile.tidalCapacity = CONFIG.tidalFlats.capacityPerTile;
      tile.tidalStock = tile.tidalCapacity;
    }
  }
}

function ensureNearbyForest(
  tiles: Tile[][],
  centerX: number,
  centerY: number,
  minimum = 12,
): void {
  const reachable = reachableFromCenter(tiles, centerX, centerY);
  const nearby = tiles.flat().filter(tile => {
    const distance = Math.abs(tile.x - centerX) + Math.abs(tile.y - centerY);
    return distance >= 7 && distance <= 18 && reachable.has(`${tile.x},${tile.y}`);
  });
  let forestCount = nearby.filter(tile => tile.terrain === 'forest').length;
  if (forestCount >= minimum) return;
  const candidates = nearby
    .filter(tile => tile.terrain === 'plain')
    .sort((left, right) => {
      const leftDistance = Math.abs(left.x - centerX) + Math.abs(left.y - centerY);
      const rightDistance = Math.abs(right.x - centerX) + Math.abs(right.y - centerY);
      return leftDistance - rightDistance || left.y - right.y || left.x - right.x;
    });
  for (const tile of candidates) {
    tile.terrain = 'forest';
    forestCount++;
    if (forestCount >= minimum) break;
  }
}
