import { CONFIG } from './config';
import type { Rank } from './types';

export function rankProductionEfficiency(rank: Rank | undefined): number {
  return CONFIG.production.rankLaborEfficiency[rank ?? 'settlement'];
}
