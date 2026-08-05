import { withJosa } from './josa';
import { CONFIG } from './config';
import { addLog } from './events';
import {
  addBuildingStock, buildingStock, isRaidProtectedBuildingInventory, takeBuildingStock,
} from './inventory';
import { getDayOfSeason, getSeason, getYear } from './seasons';
import { plaqueProductionMultiplier } from './royalPlaque';
import type { Building, FermentBatch, GameState, ResourceId } from './types';

interface FermentationReport {
  startedJang: number;
  completedJang: number;
  completedKimchi: number;
  recoveredOnggi: number;
}

const JANG_INPUT_ORDER = ['beans', 'salt', 'onggi'] as const satisfies readonly ResourceId[];

function batchesOf(building: Building): FermentBatch[] {
  if (!Array.isArray(building.fermentBatches)) building.fermentBatches = [];
  return building.fermentBatches;
}

function batchOnggiUse(batch: FermentBatch): number {
  if (batch.kind === 'jang') return Math.max(0, batch.amount) / CONFIG.fermentation.jangOutputPerOnggi;
  return Math.max(0, batch.amount) / CONFIG.fermentation.kimchiOutputPerOnggi;
}

export function isJangBrewingWindow(day: number): boolean {
  const season = getSeason(day);
  const dayOfSeason = getDayOfSeason(day);
  return (season === 'autumn' && dayOfSeason >= CONFIG.fermentation.jangAutumnStartDay)
    || (season === 'winter' && dayOfSeason <= CONFIG.fermentation.jangWinterEndDay);
}

function occupiedFermentationOnggi(building: Building): number {
  return batchesOf(building).reduce((total, batch) => total + batchOnggiUse(batch), 0);
}

export function freeJangdokdaeOnggiCapacity(building: Building): number {
  if (!building.built || building.type !== 'jangdokdae') return 0;
  return Math.max(0, CONFIG.fermentation.jangdokdaeOnggiCapacity - occupiedFermentationOnggi(building));
}

function shouldReserveKimjangCapacity(state: GameState): boolean {
  if (state.lastKimjangYear >= getYear(state.day)) return false;
  const season = getSeason(state.day);
  return season === 'autumn'
    || (season === 'winter' && getDayOfSeason(state.day) <= CONFIG.fermentation.kimjangWinterEndDay);
}

export function freeJangBrewingOnggiCapacity(state: GameState, building: Building): number {
  const free = freeJangdokdaeOnggiCapacity(building);
  if (!shouldReserveKimjangCapacity(state)) return free;
  return Math.max(0, free - CONFIG.fermentation.kimjangReservedOnggiPerYard);
}

export function jangdokdaeInputNeeds(state: GameState, building: Building): Partial<Record<ResourceId, number>> {
  if (!isJangBrewingWindow(state.day)) return {};
  const freeOnggi = Math.floor(freeJangBrewingOnggiCapacity(state, building) + 1e-9);
  if (freeOnggi <= 0) return {};
  const desired: Partial<Record<ResourceId, number>> = {
    beans: freeOnggi * CONFIG.fermentation.jangBeansPerOnggi,
    salt: freeOnggi * CONFIG.fermentation.jangSaltPerOnggi,
    onggi: freeOnggi,
  };
  return Object.fromEntries(JANG_INPUT_ORDER.map(resource => [
    resource,
    Math.max(0, (desired[resource] ?? 0) - buildingStock(building, resource)),
  ])) as Partial<Record<ResourceId, number>>;
}

export function updateFermentation(state: GameState): FermentationReport {
  const report: FermentationReport = {
    startedJang: 0,
    completedJang: 0,
    completedKimchi: 0,
    recoveredOnggi: 0,
  };
  let recoveredJangOnggi = 0;
  let recoveredKimchiOnggi = 0;
  let completedKimchiBase = 0;

  for (const building of state.buildings) {
    if (!building.built || building.type !== 'jangdokdae') continue;
    const batches = batchesOf(building);
    const remaining: FermentBatch[] = [];

    for (const batch of batches) {
      if (batch.readyOnDay > state.day) {
        remaining.push(batch);
        continue;
      }
      const amount = Math.max(0, batch.amount);
      const outputPerOnggi = batch.kind === 'jang'
        ? CONFIG.fermentation.jangOutputPerOnggi
        : CONFIG.fermentation.kimchiOutputPerOnggi;
      const usedOnggi = amount / outputPerOnggi;
      const recovered = usedOnggi * CONFIG.fermentation.onggiRecoveryRate;
      const produced = amount * plaqueProductionMultiplier(state, building.id);
      addBuildingStock(building, batch.kind, produced);
      addBuildingStock(building, 'onggi', recovered);
      if (batch.kind === 'jang') {
        report.completedJang += produced;
        recoveredJangOnggi += recovered;
      } else {
        report.completedKimchi += produced;
        completedKimchiBase += amount;
        recoveredKimchiOnggi += recovered;
      }
      report.recoveredOnggi += recovered;
    }
    building.fermentBatches = remaining;

    if (!isJangBrewingWindow(state.day)) continue;
    const freeOnggi = Math.floor(freeJangBrewingOnggiCapacity(state, building) + 1e-9);
    const vesselCount = Math.floor(Math.min(
      freeOnggi,
      buildingStock(building, 'beans') / CONFIG.fermentation.jangBeansPerOnggi,
      buildingStock(building, 'salt') / CONFIG.fermentation.jangSaltPerOnggi,
      buildingStock(building, 'onggi'),
    ) + 1e-9);
    if (vesselCount <= 0) continue;

    takeBuildingStock(building, 'beans', vesselCount * CONFIG.fermentation.jangBeansPerOnggi);
    takeBuildingStock(building, 'salt', vesselCount * CONFIG.fermentation.jangSaltPerOnggi);
    takeBuildingStock(building, 'onggi', vesselCount);
    const amount = vesselCount * CONFIG.fermentation.jangOutputPerOnggi;
    building.fermentBatches.push({
      kind: 'jang',
      amount,
      readyOnDay: state.day + CONFIG.fermentation.jangMaturationDays,
    });
    report.startedJang += amount;
  }

  if (report.startedJang > 0) {
    addLog(state, `콩과 소금을 옹기에 담가 장 ${report.startedJang.toFixed(0)}분을 숙성하기 시작했습니다.`, 'good');
  }
  if (report.completedJang > 0) {
    addLog(
      state,
      `장 ${withJosa(report.completedJang.toFixed(0), '이/가')} 익었습니다. 옹기 ${recoveredJangOnggi.toFixed(1)}개를 다시 쓸 수 있습니다.`,
      'good',
      true,
    );
  }
  if (report.completedKimchi > 0) {
    // 현판은 완성품만 늘린다. 공동 작업 사기와 옹기 회수는 원래 담근 양을 따른다.
    const completedOnggi = completedKimchiBase / CONFIG.fermentation.kimchiOutputPerOnggi;
    const morale = completedOnggi * CONFIG.fermentation.kimjangMoralePerOnggi;
    for (const resident of state.residents) {
      if (resident.alive) resident.morale = Math.min(100, resident.morale + morale);
    }
    addLog(
      state,
      `김치 ${withJosa(report.completedKimchi.toFixed(0), '이/가')} 익었습니다. 옹기 ${recoveredKimchiOnggi.toFixed(1)}개를 되찾고 주민 사기 +${morale.toFixed(1)}.`,
      'good',
      true,
    );
  }
  return report;
}

export function isRaidProtectedFermentationBuilding(building: Building): boolean {
  return isRaidProtectedBuildingInventory(building);
}
