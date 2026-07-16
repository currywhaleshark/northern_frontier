import { CONFIG } from './config';
import type { Building, DryingProductId, ResourceId } from './types';

export interface DryingProductDef {
  id: DryingProductId;
  name: string;
  output: ResourceId;
  inputPerUnit: Partial<Record<ResourceId, number>>;
  ratePerDay: number;
  task: string;
  stopsInRain: boolean;
}

export const DRYING_PRODUCT_ORDER: DryingProductId[] = ['saltedFish', 'driedFish'];

export const DRYING_PRODUCT_DEFS: Record<DryingProductId, DryingProductDef> = {
  saltedFish: {
    id: 'saltedFish',
    name: '자반',
    output: 'saltedFish',
    inputPerUnit: {
      fish: CONFIG.production.fishPerSaltedFish,
      salt: CONFIG.production.saltPerSaltedFish,
    },
    ratePerDay: CONFIG.production.saltedFishPerDay,
    task: '생선 절이는 중',
    stopsInRain: false,
  },
  driedFish: {
    id: 'driedFish',
    name: '건어물',
    output: 'driedFish',
    inputPerUnit: { fish: CONFIG.production.fishPerDriedFish },
    ratePerDay: CONFIG.production.driedFishPerDay,
    task: '생선 말리는 중',
    stopsInRain: true,
  },
};

export function dryingProductOf(building: Pick<Building, 'dryingProduct'> | undefined): DryingProductId {
  const product = building?.dryingProduct;
  return product && Object.prototype.hasOwnProperty.call(DRYING_PRODUCT_DEFS, product) ? product : 'saltedFish';
}
