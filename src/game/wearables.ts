import { CONFIG } from './config';
import { settlementLivestockWinterHayNeed } from './livestock';
import { getSeason } from './seasons';
import type {
  Building, GameState, Resident, ResourceId, TanneryProductId, WearableSlot, WornItem,
} from './types';

type WearableResource = WornItem['resource'];

interface WearableDef {
  slot: WearableSlot;
  warmth: number;
  durability: number;
  moveMultiplier: number;
}

export const WEARABLE_DEFS: Record<WearableResource, WearableDef> = {
  hideClothes: { slot: 'clothing', warmth: 1, durability: 1.35, moveMultiplier: 1 },
  cottonClothes: { slot: 'clothing', warmth: 0.85, durability: 1, moveMultiplier: 1 },
  strawShoes: {
    slot: 'footwear',
    warmth: 0.08,
    durability: 1,
    moveMultiplier: CONFIG.wearables.strawShoeMoveMultiplier,
  },
  leatherShoes: {
    slot: 'footwear',
    warmth: 0.2,
    durability: 3,
    moveMultiplier: CONFIG.wearables.leatherShoeMoveMultiplier,
  },
};

export const TANNERY_PRODUCT_ORDER: readonly TanneryProductId[] = [
  'auto', 'hideClothes', 'leatherShoes',
];

export const TANNERY_PRODUCT_DEFS: Record<TanneryProductId, {
  id: TanneryProductId;
  name: string;
  output: Extract<ResourceId, 'hideClothes' | 'leatherShoes'> | null;
  hidePerUnit: number;
  task: string;
}> = {
  auto: { id: 'auto', name: '자동', output: null, hidePerUnit: 0, task: '필요품 살피는 중' },
  hideClothes: {
    id: 'hideClothes', name: '가죽옷', output: 'hideClothes', hidePerUnit: 2, task: '가죽옷 만드는 중',
  },
  leatherShoes: {
    id: 'leatherShoes', name: '가죽신', output: 'leatherShoes', hidePerUnit: 1.5, task: '가죽신 만드는 중',
  },
};

const OUTDOOR_JOBS = new Set<Resident['job']>([
  'woodcutter', 'hunter', 'farmer', 'builder', 'hauler', 'herbalist', 'miner',
  'fisher', 'herder', 'watchman', 'militia', 'undertaker',
]);

const CLOTHING_PICKUP_ORDER = ['hideClothes', 'cottonClothes'] as const;
const FOOTWEAR_PICKUP_ORDER = ['leatherShoes', 'strawShoes'] as const;
const WEARABLE_RESOURCE_STOCKS = [
  'hideClothes', 'cottonClothes', 'strawShoes', 'leatherShoes', 'hay',
] as const satisfies readonly ResourceId[];

function finiteStock(state: GameState, resource: ResourceId): number {
  const amount = state.resources[resource];
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

export function normalizeWearableResourceStocks(state: GameState): void {
  for (const resource of WEARABLE_RESOURCE_STOCKS) {
    state.resources[resource] = finiteStock(state, resource);
  }
}

function finiteWear(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(0.999999, value))
    : 0;
}

export function normalizeWornItem(value: unknown, slot: WearableSlot): WornItem | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<WornItem>;
  if (typeof raw.resource !== 'string' || !(raw.resource in WEARABLE_DEFS)) return undefined;
  const resource = raw.resource as WearableResource;
  if (WEARABLE_DEFS[resource].slot !== slot) return undefined;
  return { resource, wear: finiteWear(raw.wear) };
}

export function normalizeResidentWearables(resident: Resident): void {
  const clothing = normalizeWornItem(resident.worn?.clothing, 'clothing');
  const footwear = normalizeWornItem(resident.worn?.footwear, 'footwear');
  if (!clothing && !footwear) {
    delete resident.worn;
    return;
  }
  resident.worn = { clothing, footwear };
}

function takeOne(state: GameState, resources: readonly WearableResource[]): WornItem | undefined {
  for (const resource of resources) {
    const stock = finiteStock(state, resource);
    if (stock + 1e-9 < 1) continue;
    state.resources[resource] = stock - 1;
    return { resource, wear: 0 };
  }
  return undefined;
}

export function equipMissingWearables(state: GameState, resident: Resident): boolean {
  if (!resident.alive || resident.sick || state.day < (resident.quarantinedUntil ?? 0)) return false;
  if (resident.lastWearableCheckDay === state.day) return false;
  resident.lastWearableCheckDay = state.day;
  normalizeResidentWearables(resident);
  const worn = resident.worn ?? {};
  let changed = false;
  if (!worn.clothing) {
    worn.clothing = takeOne(state, CLOTHING_PICKUP_ORDER);
    changed ||= worn.clothing != null;
  }
  if (!worn.footwear) {
    worn.footwear = takeOne(state, FOOTWEAR_PICKUP_ORDER);
    changed ||= worn.footwear != null;
  }
  if (worn.clothing || worn.footwear) resident.worn = worn;
  return changed;
}

export function residentClothingCoverage(resident: Resident): number {
  const item = resident.worn?.clothing;
  return item ? WEARABLE_DEFS[item.resource].warmth : 0;
}

export function residentColdProtection(resident: Resident): number {
  const clothing = residentClothingCoverage(resident);
  const footwear = resident.worn?.footwear;
  return Math.min(1, clothing + (footwear ? WEARABLE_DEFS[footwear.resource].warmth : 0));
}

export function residentFootwearMoveMultiplier(resident: Resident): number {
  const item = resident.worn?.footwear;
  return item
    ? WEARABLE_DEFS[item.resource].moveMultiplier
    : CONFIG.wearables.barefootMoveMultiplier;
}

export function clothingCoverageTotal(state: GameState): number {
  return state.residents
    .filter(resident => resident.alive)
    .reduce((total, resident) => total + residentClothingCoverage(resident), 0);
}

export function footwearCoverageTotal(state: GameState): number {
  return state.residents
    .filter(resident => resident.alive && resident.worn?.footwear)
    .length;
}

export function wearablesDailyTick(state: GameState): void {
  const season = getSeason(state.day);
  const badWeather = state.weather === 'rain' || state.weather === 'heavySnow' ||
    state.weather === 'blizzard' || state.weather === 'coldSnap' || state.weather === 'thawFlood';
  for (const resident of state.residents) {
    if (!resident.alive || resident.sick || state.day < (resident.quarantinedUntil ?? 0)) continue;
    const ageMultiplier = resident.stage != null ? CONFIG.wearables.childWearMultiplier : 1;
    const seasonMultiplier = season === 'winter' ? CONFIG.wearables.winterWearMultiplier : 1;
    const weatherMultiplier = badWeather ? CONFIG.wearables.badWeatherWearMultiplier : 1;
    const worn = resident.worn;
    if (!worn) continue;

    const clothing = worn.clothing;
    if (clothing) {
      clothing.wear += CONFIG.wearables.clothingWearPerDay * ageMultiplier *
        seasonMultiplier * weatherMultiplier / WEARABLE_DEFS[clothing.resource].durability;
      if (clothing.wear >= 1) delete worn.clothing;
    }

    const footwear = worn.footwear;
    if (footwear) {
      const outdoorMultiplier = OUTDOOR_JOBS.has(resident.job)
        ? CONFIG.wearables.outdoorFootwearWearMultiplier
        : 1;
      footwear.wear += CONFIG.wearables.footwearWearPerDay * ageMultiplier *
        seasonMultiplier * weatherMultiplier * outdoorMultiplier /
        WEARABLE_DEFS[footwear.resource].durability;
      if (footwear.wear >= 1) delete worn.footwear;
    }
    if (!worn.clothing && !worn.footwear) delete resident.worn;
  }
}

export function tanneryProductOf(building: Pick<Building, 'tanneryProduct'> | undefined): TanneryProductId {
  const product = building?.tanneryProduct;
  return product && product in TANNERY_PRODUCT_DEFS ? product : 'auto';
}

export function resolvedTanneryProduct(
  state: GameState,
  building: Pick<Building, 'tanneryProduct'> | undefined,
): Exclude<TanneryProductId, 'auto'> {
  const selected = tanneryProductOf(building);
  if (selected !== 'auto') return selected;
  const living = state.residents.filter(resident => resident.alive);
  const missingClothes = living.filter(resident => !resident.worn?.clothing).length;
  const missingShoes = living.filter(resident => !resident.worn?.footwear).length;
  const clothesSupply = finiteStock(state, 'hideClothes') + finiteStock(state, 'cottonClothes');
  const shoeSupply = finiteStock(state, 'leatherShoes') + finiteStock(state, 'strawShoes');
  const clothingDeficit = Math.max(0, missingClothes - clothesSupply);
  const footwearDeficit = Math.max(0, missingShoes - shoeSupply);
  return clothingDeficit >= footwearDeficit ? 'hideClothes' : 'leatherShoes';
}

export function strawShoeCraftNeed(state: GameState): number {
  const living = state.residents.filter(resident => resident.alive && resident.stage !== 'infant');
  const missing = living.filter(resident => !resident.worn?.footwear).length;
  const nearExpiry = living.filter(resident => (resident.worn?.footwear?.wear ?? 0) >= 0.75).length;
  const targetStock = missing + nearExpiry + CONFIG.wearables.strawShoeStockBuffer;
  return Math.max(
    0,
    targetStock - finiteStock(state, 'strawShoes') - finiteStock(state, 'leatherShoes'),
  );
}

export function craftStrawShoesAtHome(state: GameState, resident: Resident): number {
  normalizeWearableResourceStocks(state);
  if (!resident.alive || resident.stage === 'infant' || resident.sick ||
      state.day < (resident.quarantinedUntil ?? 0) ||
      resident.lastStrawShoeCraftDay === state.day) return 0;
  resident.lastStrawShoeCraftDay = state.day;
  const need = strawShoeCraftNeed(state);
  if (need <= 0) return 0;
  const reserve = settlementLivestockWinterHayNeed(state, CONFIG.wearables.livestockHayReserveDays);
  const availableHay = Math.max(0, finiteStock(state, 'hay') - reserve);
  const laborMultiplier = resident.stage != null ? CONFIG.wearables.childWearMultiplier : 1;
  const output = Math.min(
    need,
    CONFIG.wearables.strawShoePerEvening * laborMultiplier,
    availableHay / CONFIG.wearables.strawShoeHayPerUnit,
  );
  if (output <= 0) return 0;
  state.resources.hay = finiteStock(state, 'hay') - output * CONFIG.wearables.strawShoeHayPerUnit;
  state.resources.strawShoes = finiteStock(state, 'strawShoes') + output;
  return output;
}
