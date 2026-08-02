// 새 게임 설정의 단일 계약. UI 입력을 정규화하고 저장할 실효값 스냅샷을 만든다.
// 지도·저장·React 모듈을 부르지 않는 잎 모듈로 유지한다.
import { CONFIG } from './config';
import { normalizeSettlementNameInput } from './settlementName';
import type {
  Difficulty, MapRegion, MapSize, NewGameOptions, NewGameTuning, SetupLevel, WorldSetupSnapshot,
} from './types';

export type {
  MapRegion, MapSize, NewGameOptions, NewGameTuning, SetupLevel, WorldSetupSnapshot,
} from './types';

export const MAP_REGION_NAMES: Record<MapRegion, string> = {
  plains: '평원',
  mountain: '산지',
  lake: '호수',
  coast: '해안',
};

export const MAP_SIZE_NAMES: Record<MapSize, string> = {
  small: '소형',
  medium: '중형',
  large: '대형',
};

export const SETUP_LEVEL_NAMES: Record<SetupLevel, string> = {
  low: '낮음',
  normal: '기준',
  high: '높음',
};

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
const ACTIVE_MAP_REGIONS: readonly MapRegion[] = ['plains', 'mountain', 'lake'];
const MAP_SIZES: readonly MapSize[] = ['small', 'medium', 'large'];
const SETUP_LEVELS: readonly SetupLevel[] = ['low', 'normal', 'high'];
export const MAX_NEW_GAME_SEED = 0x7fffffff;

export interface MapDimensions {
  width: number;
  height: number;
}

export const MAP_SIZE_DIMENSIONS: Record<MapSize, Readonly<MapDimensions>> = {
  small: { width: 56, height: 56 },
  // 현행 CONFIG 지도는 중형 호환 기준선이다.
  medium: { width: CONFIG.map.width, height: CONFIG.map.height },
  large: { width: 96, height: 96 },
};

const PRESET_TUNING: Record<Difficulty, NewGameTuning> = {
  easy: {
    startingResources: 'high', resourceDensity: 'high', climateSeverity: 'low', threat: 'low',
  },
  normal: {
    startingResources: 'normal', resourceDensity: 'normal', climateSeverity: 'normal', threat: 'normal',
  },
  hard: {
    startingResources: 'low', resourceDensity: 'low', climateSeverity: 'high', threat: 'high',
  },
};

const START_RESOURCE_MULTIPLIER: Record<SetupLevel, number> = { low: 0.7, normal: 1, high: 1.5 };
const RESOURCE_DENSITY_MULTIPLIER: Record<SetupLevel, number> = { low: 0.75, normal: 1, high: 1.25 };
const CLIMATE_SEVERITY_MULTIPLIER: Record<SetupLevel, number> = { low: 0.85, normal: 1, high: 1.2 };
const THREAT_GAIN_MULTIPLIER: Record<SetupLevel, number> = { low: 0.7, normal: 1, high: 1.35 };
const RAID_POWER_MULTIPLIER: Record<SetupLevel, number> = { low: 0.8, normal: 1, high: 1.25 };
const HABITAT_CHANCE: Record<SetupLevel, number> = { low: 0.45, normal: 0.65, high: 0.85 };

function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && DIFFICULTIES.includes(value as Difficulty);
}

function isActiveMapRegion(value: unknown): value is MapRegion {
  return typeof value === 'string' && ACTIVE_MAP_REGIONS.includes(value as MapRegion);
}

function isMapSize(value: unknown): value is MapSize {
  return typeof value === 'string' && MAP_SIZES.includes(value as MapSize);
}

export function mapDimensionsForSize(mapSize: MapSize): MapDimensions {
  return { ...MAP_SIZE_DIMENSIONS[mapSize] };
}

export function mapSizeForDimensions(width: number, height: number): MapSize | null {
  return MAP_SIZES.find(mapSize => {
    const dimensions = MAP_SIZE_DIMENSIONS[mapSize];
    return dimensions.width === width && dimensions.height === height;
  }) ?? null;
}

function setupLevel(value: unknown, fallback: SetupLevel): SetupLevel {
  return typeof value === 'string' && SETUP_LEVELS.includes(value as SetupLevel)
    ? value as SetupLevel
    : fallback;
}

export function normalizeNewGameSeed(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(MAX_NEW_GAME_SEED, Math.floor(value)));
}

export function tuningForDifficulty(difficulty: Difficulty): NewGameTuning {
  return { ...PRESET_TUNING[difficulty] };
}

export function defaultNewGameOptions(): NewGameOptions {
  return {
    settlementName: '',
    difficultyPreset: 'normal',
    baseDifficulty: 'normal',
    region: 'plains',
    mapSize: 'medium',
    tuning: tuningForDifficulty('normal'),
  };
}

export function optionsForDifficulty(
  difficulty: Difficulty,
  settlementName = '',
  seed?: number,
): NewGameOptions {
  return {
    settlementName: normalizeSettlementNameInput(settlementName),
    difficultyPreset: difficulty,
    baseDifficulty: difficulty,
    region: 'plains',
    mapSize: 'medium',
    tuning: tuningForDifficulty(difficulty),
    seed: normalizeNewGameSeed(seed),
  };
}

/**
 * S4에서는 평원·산지·호수와 세 지도 크기를 보존한다.
 * 해안은 S5에서 구현할 때 잠금을 푼다.
 */
export function normalizeNewGameOptions(raw: Partial<NewGameOptions> | null | undefined): NewGameOptions {
  const defaults = defaultNewGameOptions();
  const baseDifficulty = isDifficulty(raw?.baseDifficulty)
    ? raw.baseDifficulty
    : isDifficulty(raw?.difficultyPreset) ? raw.difficultyPreset : defaults.baseDifficulty;
  const difficultyPreset = raw?.difficultyPreset === 'custom'
    ? 'custom'
    : isDifficulty(raw?.difficultyPreset) ? raw.difficultyPreset : baseDifficulty;
  const presetTuning = tuningForDifficulty(baseDifficulty);
  const tuning = difficultyPreset === 'custom' ? {
    startingResources: setupLevel(raw?.tuning?.startingResources, presetTuning.startingResources),
    resourceDensity: setupLevel(raw?.tuning?.resourceDensity, presetTuning.resourceDensity),
    climateSeverity: setupLevel(raw?.tuning?.climateSeverity, presetTuning.climateSeverity),
    threat: setupLevel(raw?.tuning?.threat, presetTuning.threat),
  } : tuningForDifficulty(difficultyPreset);
  return {
    settlementName: normalizeSettlementNameInput(raw?.settlementName ?? ''),
    difficultyPreset,
    baseDifficulty,
    region: isActiveMapRegion(raw?.region) ? raw.region : defaults.region,
    mapSize: isMapSize(raw?.mapSize) ? raw.mapSize : defaults.mapSize,
    tuning,
    seed: normalizeNewGameSeed(raw?.seed),
  };
}

function effectiveValues(options: NewGameOptions): WorldSetupSnapshot['effective'] {
  const habitatMultiplier = options.region === 'mountain' ? 1.2 : 1;
  if (options.difficultyPreset !== 'custom') {
    const preset = CONFIG.difficulty[options.difficultyPreset];
    return {
      startResourceMultiplier: preset.startRes,
      threatGainMultiplier: preset.threatGain,
      raidPowerMultiplier: preset.raidPower,
      habitatChance: Math.min(0.98, preset.habitatChance * habitatMultiplier),
      // 아직 지도 밀도·기후 소비처는 연결하지 않는다. S2 이후 활성화한다.
      resourceDensityMultiplier: 1,
      climateSeverityMultiplier: 1,
    };
  }
  return {
    startResourceMultiplier: START_RESOURCE_MULTIPLIER[options.tuning.startingResources],
    threatGainMultiplier: THREAT_GAIN_MULTIPLIER[options.tuning.threat],
    raidPowerMultiplier: RAID_POWER_MULTIPLIER[options.tuning.threat],
    habitatChance: Math.min(
      0.98,
      HABITAT_CHANCE[options.tuning.resourceDensity] * habitatMultiplier,
    ),
    resourceDensityMultiplier: RESOURCE_DENSITY_MULTIPLIER[options.tuning.resourceDensity],
    climateSeverityMultiplier: CLIMATE_SEVERITY_MULTIPLIER[options.tuning.climateSeverity],
  };
}

export function worldSetupSnapshot(
  raw: Partial<NewGameOptions>,
  seedSource: WorldSetupSnapshot['seedSource'],
): WorldSetupSnapshot {
  const options = normalizeNewGameOptions(raw);
  return {
    difficultyPreset: options.difficultyPreset,
    baseDifficulty: options.baseDifficulty,
    region: options.region,
    mapSize: options.mapSize,
    tuning: { ...options.tuning },
    seedSource,
    effective: effectiveValues(options),
  };
}

export function defaultWorldSetupForDifficulty(
  difficulty: Difficulty,
  seedSource: WorldSetupSnapshot['seedSource'] = 'legacy',
): WorldSetupSnapshot {
  return worldSetupSnapshot(optionsForDifficulty(difficulty), seedSource);
}

export function normalizeWorldSetupSnapshot(
  raw: Partial<WorldSetupSnapshot> | null | undefined,
  fallbackDifficulty: Difficulty = 'normal',
): WorldSetupSnapshot {
  const baseDifficulty = isDifficulty(raw?.baseDifficulty) ? raw.baseDifficulty : fallbackDifficulty;
  const options = normalizeNewGameOptions({
    difficultyPreset: raw?.difficultyPreset,
    baseDifficulty,
    region: raw?.region,
    mapSize: raw?.mapSize,
    tuning: raw?.tuning,
  });
  const seedSource = raw?.seedSource === 'random' || raw?.seedSource === 'manual' ||
    raw?.seedSource === 'tutorial' || raw?.seedSource === 'legacy'
    ? raw.seedSource
    : 'legacy';
  const fallback = worldSetupSnapshot(options, seedSource);
  const savedEffective = raw?.effective;
  const positive = (value: unknown, defaultValue: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : defaultValue;
  const chance = (value: unknown, defaultValue: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : defaultValue;
  return {
    ...fallback,
    // 이미 시작한 판은 CONFIG가 바뀌어도 당시의 실효값을 보존한다.
    effective: {
      startResourceMultiplier: positive(
        savedEffective?.startResourceMultiplier, fallback.effective.startResourceMultiplier),
      threatGainMultiplier: positive(
        savedEffective?.threatGainMultiplier, fallback.effective.threatGainMultiplier),
      raidPowerMultiplier: positive(
        savedEffective?.raidPowerMultiplier, fallback.effective.raidPowerMultiplier),
      habitatChance: chance(savedEffective?.habitatChance, fallback.effective.habitatChance),
      resourceDensityMultiplier: positive(
        savedEffective?.resourceDensityMultiplier, fallback.effective.resourceDensityMultiplier),
      climateSeverityMultiplier: positive(
        savedEffective?.climateSeverityMultiplier, fallback.effective.climateSeverityMultiplier),
    },
  };
}

export function worldSetupLabel(setup: Pick<WorldSetupSnapshot, 'region' | 'mapSize'>): string {
  return `${MAP_REGION_NAMES[setup.region]}의 ${MAP_SIZE_NAMES[setup.mapSize]} 개척지`;
}
