import { BUILDING_DEFS, buildingFootprintDims } from './buildings';
import { annualClimateForState } from './climate';
import { CONFIG } from './config';
import { isDroughtActive } from './disasters';
import { cisternStatus, dailyCisternTick } from './rainwaterCistern';
import { aquiferSampleAt, aquiferVeins } from './subsurfaceVeins';
import {
  buildingTouchesWaterCoverage,
  naturalWaterCoverageTileSets,
  type NaturalWaterCoverage,
} from './waterCoverage';
import type { Building, BuildingTypeId, GameState, Resident } from './types';

type WaterSupplySource = 'river' | 'lake' | 'canal' | 'well' | 'cistern' | 'none';

export interface BuildingWaterSupply {
  demand: number;
  supplied: number;
  ratio: number;
  source: WaterSupplySource;
}

export interface WaterSupplySnapshot {
  buildings: Map<number, BuildingWaterSupply>;
  aquiferConsumption: number[];
  cisternConsumption: Map<number, number>;
  naturalCoverage: NaturalWaterCoverage;
}

export interface WellWaterStatus {
  veinId: number;
  level: number;
  capacity: number;
  levelRatio: number;
  dailyOutput: number;
}

export interface PreviewWell {
  x: number;
  y: number;
}

export interface PreviewWaterBuilding extends PreviewWell {
  id: number;
  type: BuildingTypeId;
  w?: number;
  h?: number;
  demand: number;
}

export const PREVIEW_WATER_BUILDING_ID = Number.MAX_SAFE_INTEGER;

const EPSILON = 1e-6;
const FAIR_SHARE_ITERATIONS = 64;

interface FiniteSupplySource extends PreviewWell {
  available: number;
}

interface WellSupplySource extends FiniteSupplySource {
  veinId: number;
}

interface CisternSupplySource extends FiniteSupplySource {
  buildingId: number;
}

interface WaterDemandEntry {
  building: Building | PreviewWaterBuilding;
  demand: number;
}

function residentBedShare(resident: Pick<Resident, 'stage'>): number {
  return resident.stage ? CONFIG.lifecycle.childBedShare : 1;
}

function waterDemandForBuilding(
  state: GameState,
  building: Building,
): number {
  if (!building.built) return 0;
  if (BUILDING_DEFS[building.type].capacity > 0) {
    return state.residents
      .filter(resident => resident.alive && resident.homeBuildingId === building.id)
      .reduce((sum, resident) => sum + residentBedShare(resident), 0) *
      CONFIG.water.demand.housingPerBed;
  }
  if (building.type === 'tannery') return CONFIG.water.demand.tannery;
  if (building.type === 'onggiKiln') return CONFIG.water.demand.onggiKiln;
  if (building.type === 'clinic') return CONFIG.water.demand.clinic;
  if (building.type === 'stable') {
    return Math.max(0, building.livestock?.headcount ?? 0) * CONFIG.water.demand.stablePerHead;
  }
  return 0;
}

export function waterDemandForBuildingPlacement(type: BuildingTypeId): number {
  if (BUILDING_DEFS[type].capacity > 0) return CONFIG.water.demand.housingPerBed;
  if (type === 'tannery') return CONFIG.water.demand.tannery;
  if (type === 'onggiKiln') return CONFIG.water.demand.onggiKiln;
  if (type === 'clinic') return CONFIG.water.demand.clinic;
  if (type === 'stable') return CONFIG.water.demand.stablePerHead;
  return 0;
}

function footprintDistanceToTile(
  building: Pick<Building, 'type' | 'x' | 'y' | 'w' | 'h'>,
  x: number,
  y: number,
): number {
  const { w, h } = buildingFootprintDims(building);
  const nearestX = Math.max(building.x, Math.min(x, building.x + w - 1));
  const nearestY = Math.max(building.y, Math.min(y, building.y + h - 1));
  return Math.abs(x - nearestX) + Math.abs(y - nearestY);
}

function distributeWellSupply(
  entries: WaterDemandEntry[],
  sources: FiniteSupplySource[],
  suppliedByBuilding: Map<number, number>,
): void {
  for (let iteration = 0; iteration < FAIR_SHARE_ITERATIONS; iteration++) {
    const proposals: Array<{ source: FiniteSupplySource; entry: WaterDemandEntry; amount: number }> = [];
    const proposedByBuilding = new Map<number, number>();

    for (const source of sources) {
      if (source.available <= EPSILON) continue;
      const contenders = entries.filter(({ building, demand }) =>
        demand - (suppliedByBuilding.get(building.id) ?? 0) > EPSILON &&
        footprintDistanceToTile(building, source.x, source.y) <= CONFIG.water.wellRadius);
      const remainingDemand = contenders.reduce(
        (sum, { building, demand }) =>
          sum + Math.max(0, demand - (suppliedByBuilding.get(building.id) ?? 0)),
        0,
      );
      if (remainingDemand <= EPSILON) continue;

      for (const entry of contenders) {
        const remaining = Math.max(
          0,
          entry.demand - (suppliedByBuilding.get(entry.building.id) ?? 0),
        );
        const amount = source.available * remaining / remainingDemand;
        proposals.push({ source, entry, amount });
        proposedByBuilding.set(
          entry.building.id,
          (proposedByBuilding.get(entry.building.id) ?? 0) + amount,
        );
      }
    }

    let distributed = 0;
    for (const proposal of proposals) {
      const alreadySupplied = suppliedByBuilding.get(proposal.entry.building.id) ?? 0;
      const remaining = Math.max(0, proposal.entry.demand - alreadySupplied);
      const totalProposed = proposedByBuilding.get(proposal.entry.building.id) ?? 0;
      const accepted = proposal.amount * Math.min(1, remaining / Math.max(EPSILON, totalProposed));
      if (accepted <= EPSILON) continue;
      proposal.source.available = Math.max(0, proposal.source.available - accepted);
      suppliedByBuilding.set(proposal.entry.building.id, alreadySupplied + accepted);
      distributed += accepted;
    }
    if (distributed <= EPSILON) break;
  }
}

export function wellWaterStatus(state: GameState, well: Building): WellWaterStatus | null {
  if (!well.built || well.type !== 'well') return null;
  return wellWaterStatusAt(state, well.x, well.y);
}

export function wellWaterStatusAt(
  state: GameState,
  x: number,
  y: number,
): WellWaterStatus | null {
  const width = state.map[0]?.length ?? 0;
  const sample = aquiferSampleAt(
    state.seed, width, state.map.length, x, y, state.worldSetup?.region,
    state.worldSetup?.effective.resourceDensityMultiplier,
  );
  if (!sample) return null;
  const level = Math.max(0, state.aquiferLevels[sample.vein.id] ?? 0);
  const safeLevel = Math.max(1, sample.vein.capacity * CONFIG.water.safeLevelRatio);
  const levelRatio = Math.min(1, level / safeLevel);
  const richnessMultiplier = 0.4 + sample.normalizedRichness * 0.6;
  return {
    veinId: sample.vein.id,
    level,
    capacity: sample.vein.capacity,
    levelRatio: level / Math.max(1, sample.vein.capacity),
    dailyOutput: Math.min(level, CONFIG.water.wellDailyOutput * richnessMultiplier * levelRatio),
  };
}

export function waterSupplySnapshot(
  state: GameState,
  previewWell?: PreviewWell,
  previewBuilding?: PreviewWaterBuilding,
): WaterSupplySnapshot {
  const aquiferConsumption = state.aquiferLevels.map(() => 0);
  const sources: WellSupplySource[] = [];
  const cisternSources: CisternSupplySource[] = [];
  const levelByVein = new Map<number, number>();

  const registerWell = (well: PreviewWell, status: WellWaterStatus | null): void => {
    if (!status) return;
    sources.push({ ...well, veinId: status.veinId, available: status.dailyOutput });
    levelByVein.set(status.veinId, status.level);
  };

  for (const well of state.buildings) {
    registerWell(well, wellWaterStatus(state, well));
  }
  for (const building of state.buildings) {
    const status = cisternStatus(state, building);
    if (status && status.dailyOutput > EPSILON) {
      cisternSources.push({
        x: building.x,
        y: building.y,
        buildingId: building.id,
        available: status.dailyOutput,
      });
    }
  }
  if (previewWell) registerWell(previewWell, wellWaterStatusAt(state, previewWell.x, previewWell.y));

  const outputByVein = new Map<number, number>();
  for (const source of sources) {
    outputByVein.set(source.veinId, (outputByVein.get(source.veinId) ?? 0) + source.available);
  }
  for (const source of sources) {
    const totalOutput = outputByVein.get(source.veinId) ?? 0;
    const availableLevel = levelByVein.get(source.veinId) ?? 0;
    if (totalOutput > availableLevel && totalOutput > EPSILON) {
      source.available *= availableLevel / totalOutput;
    }
  }
  const initialAvailable = new Map(sources.map(source => [source, source.available]));
  const initialCisternAvailable = new Map(cisternSources.map(source => [source, source.available]));

  const demandBuildings: WaterDemandEntry[] =
    state.buildings
      .map(building => ({ building, demand: waterDemandForBuilding(state, building) }))
      .filter(entry => entry.demand > EPSILON);
  if (previewBuilding && previewBuilding.demand > EPSILON) {
    demandBuildings.push({ building: previewBuilding, demand: previewBuilding.demand });
  }
  const buildings = new Map<number, BuildingWaterSupply>();
  const suppliedByBuilding = new Map<number, number>();
  const wellDemandBuildings: WaterDemandEntry[] = [];
  const naturalCoverage = naturalWaterCoverageTileSets(state);

  for (const { building, demand } of demandBuildings) {
    if (buildingTouchesWaterCoverage(building, naturalCoverage.river)) {
      buildings.set(building.id, { demand, supplied: demand, ratio: 1, source: 'river' });
      continue;
    }
    if (buildingTouchesWaterCoverage(building, naturalCoverage.lake)) {
      buildings.set(building.id, { demand, supplied: demand, ratio: 1, source: 'lake' });
      continue;
    }
    if (buildingTouchesWaterCoverage(building, naturalCoverage.canal)) {
      buildings.set(building.id, { demand, supplied: demand, ratio: 1, source: 'canal' });
      continue;
    }
    wellDemandBuildings.push({ building, demand });
  }

  const housing = wellDemandBuildings.filter(
    ({ building }) => BUILDING_DEFS[building.type].capacity > 0,
  );
  const production = wellDemandBuildings.filter(
    ({ building }) => BUILDING_DEFS[building.type].capacity <= 0,
  );
  distributeWellSupply(housing, sources, suppliedByBuilding);
  distributeWellSupply(production, sources, suppliedByBuilding);
  const suppliedByWells = new Map(suppliedByBuilding);
  distributeWellSupply(housing, cisternSources, suppliedByBuilding);
  distributeWellSupply(production, cisternSources, suppliedByBuilding);

  for (const { building, demand } of wellDemandBuildings) {
    const rawSupplied = Math.min(demand, suppliedByBuilding.get(building.id) ?? 0);
    const supplied = demand - rawSupplied <= EPSILON ? demand : rawSupplied;
    const ratio = supplied >= demand ? 1 : Math.max(0, supplied / demand);
    buildings.set(building.id, {
      demand,
      supplied,
      ratio,
      source: supplied > EPSILON
        ? supplied - (suppliedByWells.get(building.id) ?? 0) > EPSILON ? 'cistern' : 'well'
        : 'none',
    });
  }

  for (const source of sources) {
    const consumed = Math.max(0, (initialAvailable.get(source) ?? 0) - source.available);
    aquiferConsumption[source.veinId] =
      (aquiferConsumption[source.veinId] ?? 0) + consumed;
  }
  const cisternConsumption = new Map<number, number>();
  for (const source of cisternSources) {
    cisternConsumption.set(
      source.buildingId,
      Math.max(0, (initialCisternAvailable.get(source) ?? 0) - source.available),
    );
  }
  return { buildings, aquiferConsumption, cisternConsumption, naturalCoverage };
}

export function buildingWaterSupply(state: GameState, building: Building): BuildingWaterSupply {
  const demand = waterDemandForBuilding(state, building);
  if (demand <= EPSILON) return { demand: 0, supplied: 0, ratio: 1, source: 'none' };
  return waterSupplySnapshot(state).buildings.get(building.id) ??
    { demand, supplied: 0, ratio: 0, source: 'none' };
}

export function waterDependentProductionMultiplier(state: GameState, building: Building): number {
  const ratio = buildingWaterSupply(state, building).ratio;
  return CONFIG.water.productionFloor + (1 - CONFIG.water.productionFloor) * ratio;
}

function weatherRecoveryBonus(state: GameState): number {
  if (state.weather === 'rain' || state.weather === 'thawFlood') {
    return CONFIG.water.aquiferRainRecoveryBonus;
  }
  if (state.weather === 'heavySnow' || state.weather === 'blizzard') {
    return CONFIG.water.aquiferSnowRecoveryBonus;
  }
  return 0;
}

export function dailyAquiferTick(state: GameState): void {
  const snapshot = waterSupplySnapshot(state);
  const climate = annualClimateForState(state);
  const climateMultiplier = Math.max(
    0.5,
    1 + climate.precipitationAnomaly * CONFIG.water.climateRecoveryFactor,
  );
  const drought = isDroughtActive(state);
  const width = state.map[0]?.length ?? 0;
  const veins = aquiferVeins(
    state.seed, width, state.map.length, state.worldSetup?.region,
    state.worldSetup?.effective.resourceDensityMultiplier,
  );

  for (let veinId = 0; veinId < state.aquiferLevels.length; veinId++) {
    const current = Math.max(0, state.aquiferLevels[veinId] ?? 0);
    const consumed = snapshot.aquiferConsumption[veinId] ?? 0;
    const recovery = drought
      ? 0
      : CONFIG.water.aquiferBaseRecoveryPerDay * climateMultiplier + weatherRecoveryBonus(state);
    const capacity = veins[veinId]?.capacity ?? current;
    state.aquiferLevels[veinId] = Math.min(capacity, Math.max(0, current - consumed + recovery));
  }
  dailyCisternTick(state, snapshot.cisternConsumption);
}
