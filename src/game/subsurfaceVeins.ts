import { generateMap, makeRng } from './map';
import { CONFIG } from './config';
import { MAP_SIZE_DIMENSIONS } from './newGameOptions';
import type { GameState, MapRegion } from './types';

export interface SubsurfaceVein {
  id: number;
  cx: number;
  cy: number;
  radius: number;
  capacity: number;
}

export interface OreVein extends SubsurfaceVein {
  mineral: 'iron' | 'stone';
}

export interface VeinSample<T extends SubsurfaceVein> {
  vein: T;
  richness: number;
  normalizedRichness: number;
}

const aquiferCache = new Map<string, readonly SubsurfaceVein[]>();
const oreCache = new Map<string, readonly OreVein[]>();

function normalizedRegion(region: MapRegion): 'plains' | 'mountain' | 'lake' | 'coast' {
  return region === 'mountain' || region === 'lake' || region === 'coast' ? region : 'plains';
}

function cacheKey(seed: number, width: number, height: number, region: MapRegion): string {
  return `${seed}:${width}:${height}:${normalizedRegion(region)}`;
}

function mapMargin(width: number, height: number): number {
  return Math.max(2, Math.min(8, Math.floor(Math.min(width, height) * 0.1)));
}

function randomCenter(rng: () => number, width: number, height: number): { x: number; y: number } {
  const margin = mapMargin(width, height);
  const usableW = Math.max(1, width - margin * 2);
  const usableH = Math.max(1, height - margin * 2);
  return {
    x: Math.min(width - 1, margin + Math.floor(rng() * usableW)),
    y: Math.min(height - 1, margin + Math.floor(rng() * usableH)),
  };
}

function riverCenterline(seed: number, width: number, height: number): number[] {
  const rng = makeRng(seed);
  let riverX = width * (0.3 + rng() * 0.4);
  let drift = 0;
  const widthPhase = rng() * Math.PI * 2;
  const widthFreq = 0.10 + rng() * 0.08;
  const centers: number[] = [];
  for (let y = 0; y < height; y++) {
    rng(); // generateMap의 행별 강폭 흔들림
    centers.push(riverX);
    drift += (rng() - 0.5) * 0.7;
    drift = Math.max(-1, Math.min(1, drift));
    riverX += drift;
    riverX = Math.max(3, Math.min(width - 4, riverX));
  }
  void widthPhase;
  void widthFreq;
  return centers;
}

function distributedAquiferCenter(
  rng: () => number,
  width: number,
  height: number,
  riverCenters: readonly number[],
  existing: readonly SubsurfaceVein[],
  inland: boolean,
): { x: number; y: number } {
  const candidates = Array.from({ length: 28 }, () => randomCenter(rng, width, height));
  const inlandDistance = Math.min(
    Math.max(3, Math.floor(width * 0.28)),
    Math.max(CONFIG.water.aquiferInlandMinRiverDistance, Math.floor(width * 0.12)),
  );
  const spacing = Math.min(CONFIG.water.aquiferMinSpacing, Math.max(3, Math.floor(Math.min(width, height) * 0.18)));
  const scored = candidates.map(candidate => {
    const riverDistance = Math.abs(candidate.x - (riverCenters[candidate.y] ?? width / 2));
    const nearestVein = existing.length === 0
      ? spacing * 2
      : Math.min(...existing.map(vein => Math.hypot(candidate.x - vein.cx, candidate.y - vein.cy)));
    const inlandBonus = inland
      ? riverDistance >= inlandDistance ? 1000 : riverDistance * 10
      : Math.min(riverDistance, inlandDistance) * 0.5;
    return {
      candidate,
      score: inlandBonus + Math.min(nearestVein, spacing * 2) * 4 +
        (nearestVein >= spacing ? 100 : 0),
    };
  });
  scored.sort((left, right) => right.score - left.score);
  return scored[0]?.candidate ?? randomCenter(rng, width, height);
}

function startingSettlementAquiferCenter(
  seed: number,
  width: number,
  height: number,
  region: MapRegion,
): { x: number; y: number } {
  const generated = generateMap(seed, { width, height }, region);
  return {
    x: Math.min(width - 1, generated.centerX + 1),
    y: Math.min(height - 1, generated.centerY + 1),
  };
}

function richnessAt(vein: SubsurfaceVein, x: number, y: number): number {
  const distance = Math.hypot(x - vein.cx, y - vein.cy);
  const normalized = Math.max(0, 1 - distance / Math.max(1, vein.radius));
  return vein.capacity * normalized * normalized;
}

function strongestSample<T extends SubsurfaceVein>(
  veins: readonly T[],
  x: number,
  y: number,
): VeinSample<T> | null {
  let strongest: VeinSample<T> | null = null;
  for (const vein of veins) {
    const richness = richnessAt(vein, x, y);
    if (richness <= 0) continue;
    const sample = {
      vein,
      richness,
      normalizedRichness: richness / Math.max(1, vein.capacity),
    };
    if (!strongest || sample.richness > strongest.richness) strongest = sample;
  }
  return strongest;
}

export function aquiferVeins(
  seed: number,
  width: number,
  height: number,
  region: MapRegion = 'plains',
): readonly SubsurfaceVein[] {
  const resolvedRegion = normalizedRegion(region);
  const key = cacheKey(seed, width, height, resolvedRegion);
  const cached = aquiferCache.get(key);
  if (cached) return cached;
  const rng = makeRng((seed ^ 0x4a71f39d) >>> 0);
  const mediumArea = MAP_SIZE_DIMENSIONS.medium.width * MAP_SIZE_DIMENSIONS.medium.height;
  const areaScale = Math.max(0.55, Math.sqrt(Math.max(1, width * height) / mediumArea));
  const countMultiplier = resolvedRegion === 'mountain' || resolvedRegion === 'coast'
    ? 0.65 : resolvedRegion === 'lake' ? 1.2 : 1;
  const radiusMultiplier = resolvedRegion === 'mountain' ? 0.75
    : resolvedRegion === 'coast' ? 0.85 : resolvedRegion === 'lake' ? 1.1 : 1;
  const capacityMultiplier = resolvedRegion === 'mountain' ? 0.75
    : resolvedRegion === 'coast' ? 0.8 : resolvedRegion === 'lake' ? 1.15 : 1;
  const baseCount = Math.max(
    resolvedRegion === 'mountain' || resolvedRegion === 'coast' ? 1 : 2,
    Math.round((4 + Math.floor(rng() * 3)) * areaScale * countMultiplier),
  );
  const veins: SubsurfaceVein[] = [];
  // v45까지 사용한 기본 수맥의 난수 소비와 위치를 그대로 보존한다.
  // 구 세이브의 기존 우물이 갑자기 수맥 밖으로 밀려나지 않게 한 뒤, 내륙 수맥만 뒤에 덧붙인다.
  for (let id = 0; id < baseCount; id++) {
    const center = randomCenter(rng, width, height);
    veins.push({
      id,
      cx: center.x,
      cy: center.y,
      radius: Math.max(3, Math.round(
        (4 + rng() * 3) * Math.min(1.25, areaScale) *
        radiusMultiplier,
      )),
      capacity: Math.round((90 + rng() * 70) * capacityMultiplier),
    });
  }
  const riverCenters = riverCenterline(seed, width, height);
  const inlandCount = Math.max(
    resolvedRegion === 'mountain' || resolvedRegion === 'coast' ? 1 : 2,
    Math.ceil(
      baseCount * CONFIG.water.aquiferInlandAdditionRatio *
      countMultiplier,
    ),
  );
  for (let offset = 0; offset < inlandCount; offset++) {
    const id = baseCount + offset;
    const center = distributedAquiferCenter(rng, width, height, riverCenters, veins, true);
    veins.push({
      id,
      cx: center.x,
      cy: center.y,
      radius: Math.max(3, Math.round(
        (4 + rng() * 3) * Math.min(1.25, areaScale) *
        radiusMultiplier,
      )),
      capacity: Math.round((90 + rng() * 70) * capacityMultiplier),
    });
  }
  const startingCenter = startingSettlementAquiferCenter(seed, width, height, resolvedRegion);
  veins.push({
    id: veins.length,
    cx: startingCenter.x,
    cy: startingCenter.y,
    radius: CONFIG.water.startingAquiferRadius,
    capacity: CONFIG.water.startingAquiferCapacity,
  });
  aquiferCache.set(key, veins);
  return veins;
}

export function oreVeins(
  seed: number,
  width: number,
  height: number,
  region: MapRegion = 'plains',
): readonly OreVein[] {
  const resolvedRegion = normalizedRegion(region);
  const key = cacheKey(seed, width, height, resolvedRegion);
  const cached = oreCache.get(key);
  if (cached) return cached;
  const rng = makeRng((seed ^ 0x6d2b79f5) >>> 0);
  const mediumArea = MAP_SIZE_DIMENSIONS.medium.width * MAP_SIZE_DIMENSIONS.medium.height;
  const areaScale = Math.max(0.55, Math.sqrt(Math.max(1, width * height) / mediumArea));
  const perMineral = Math.max(1, Math.round(
    (2 + Math.floor(rng() * 2)) * areaScale *
      (resolvedRegion === 'mountain' ? 1.1 : resolvedRegion === 'lake' ? 0.8 : 1),
  ));
  const minerals = [
    ...Array.from({ length: perMineral }, () => 'iron' as const),
    ...Array.from({ length: perMineral }, () => 'stone' as const),
  ];
  const veins = minerals.map((mineral, id): OreVein => {
    const center = randomCenter(rng, width, height);
    return {
      id,
      mineral,
      cx: center.x,
      cy: center.y,
      radius: Math.max(3, Math.round(
        (4 + rng() * 3) * Math.min(1.25, areaScale) *
        (resolvedRegion === 'mountain' ? 0.9 : resolvedRegion === 'lake' ? 0.85 : 1),
      )),
      capacity: Math.round(
        (mineral === 'iron' ? 420 + rng() * 260 : 560 + rng() * 340) *
        (resolvedRegion === 'mountain' ? 1.4 : resolvedRegion === 'lake' ? 0.8 : 1),
      ),
    };
  });
  oreCache.set(key, veins);
  return veins;
}

export function aquiferSampleAt(
  seed: number,
  width: number,
  height: number,
  x: number,
  y: number,
  region: MapRegion = 'plains',
): VeinSample<SubsurfaceVein> | null {
  return strongestSample(aquiferVeins(seed, width, height, region), x, y);
}

export function oreSampleAt(
  seed: number,
  width: number,
  height: number,
  x: number,
  y: number,
  region: MapRegion = 'plains',
): VeinSample<OreVein> | null {
  const samples = oreVeins(seed, width, height, region)
    .map(vein => strongestSample([vein], x, y))
    .filter((sample): sample is VeinSample<OreVein> => sample != null)
    .sort((left, right) =>
      Number(right.vein.mineral === 'iron') - Number(left.vein.mineral === 'iron') ||
      right.richness - left.richness);
  return samples[0] ?? null;
}

export function initialAquiferLevels(
  seed: number,
  width: number,
  height: number,
  region: MapRegion = 'plains',
): number[] {
  return aquiferVeins(seed, width, height, region).map(vein => vein.capacity);
}

export function initialOreVeinRemaining(
  seed: number,
  width: number,
  height: number,
  region: MapRegion = 'plains',
): number[] {
  return oreVeins(seed, width, height, region).map(vein => vein.capacity);
}

export function normalizeSubsurfaceState(state: GameState): void {
  const width = state.map[0]?.length ?? 0;
  const height = state.map.length;
  const region = state.worldSetup?.region ?? 'plains';
  const aquifers = aquiferVeins(state.seed, width, height, region);
  const ores = oreVeins(state.seed, width, height, region);
  state.aquiferLevels = aquifers.map(vein => {
    const value = Number(state.aquiferLevels?.[vein.id]);
    return Number.isFinite(value) ? Math.min(vein.capacity, Math.max(0, value)) : vein.capacity;
  });
  state.oreVeinRemaining = ores.map(vein => {
    const value = Number(state.oreVeinRemaining?.[vein.id]);
    return Number.isFinite(value) ? Math.min(vein.capacity, Math.max(0, value)) : vein.capacity;
  });
}

export function hasSubsurfaceInsight(state: Pick<GameState, 'residents'>): boolean {
  return state.residents.some(resident => resident.alive && resident.special === 'geomancer');
}
