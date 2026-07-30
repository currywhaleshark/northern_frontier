import {
  isResourceDisplayGroupId,
  isStockResourceId,
  type ResourceDisplayGroupId,
  type StockResourceId,
} from './resourceDisplay';
import {
  DEFAULT_BUILD_CATEGORY,
  isBuildCategoryId,
  type BuildCategoryId,
} from './buildPresentation';
import {
  AUTO_ASSIGN_BUILDING_TYPES,
  isAutoAssignBuildingType,
  type AutoAssignBuildingType,
} from '../game/workerSlots';
import {
  isDockWindowId,
  type DockWindowId,
  type FloatingWindowId,
} from './dockPresentation';
import {
  normalizeDockWindowLayout,
  normalizeDockWindowLayouts,
  type DockWindowLayout,
  type DockWindowLayouts,
} from './dockLayout';

export const UI_PREFS_KEY = 'buksae-ui-prefs';
export const LEGACY_BUILD_MENU_OPEN_KEY = 'buksae-buildmenu-open';
export const UI_PREFS_VERSION = 9;
export const MAX_STARRED_RESOURCES = 8;
export const DEFAULT_MAP_ZOOM = 1;

export interface AudioPrefs {
  sfxEnabled: boolean;
  sfxVolume: number;
  musicEnabled: boolean;
  musicVolume: number;
}

export interface ResidentMarkerPrefs {
  showResidentJobMarkers: boolean;
  showResidentCargoMarkers: boolean;
}

export interface UiPrefs extends ResidentMarkerPrefs {
  version: typeof UI_PREFS_VERSION;
  starredResources: StockResourceId[];
  pinnedResourceGroups: ResourceDisplayGroupId[];
  buildDrawerLastCategory: BuildCategoryId;
  autoAssignBuildingTypes: AutoAssignBuildingType[];
  pinnedDockWindows: DockWindowId[];
  dockWindowLayouts: DockWindowLayouts;
  audio: AudioPrefs;
  mapZoom: number;
  showAquiferLayer: boolean;
  showOreLayer: boolean;
  autoFastForwardSleepingNight: boolean;
}

export interface UiPrefsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function defaultUiPrefs(buildDrawerLastCategory = DEFAULT_BUILD_CATEGORY): UiPrefs {
  return {
    version: UI_PREFS_VERSION,
    starredResources: [],
    pinnedResourceGroups: [],
    buildDrawerLastCategory,
    autoAssignBuildingTypes: [...AUTO_ASSIGN_BUILDING_TYPES],
    pinnedDockWindows: [],
    dockWindowLayouts: {},
    audio: {
      sfxEnabled: true,
      sfxVolume: 0.7,
      musicEnabled: true,
      musicVolume: 0.7,
    },
    mapZoom: DEFAULT_MAP_ZOOM,
    showAquiferLayer: false,
    showOreLayer: false,
    showResidentJobMarkers: true,
    showResidentCargoMarkers: true,
    autoFastForwardSleepingNight: true,
  };
}

function clampUnit(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
}

function normalizeAudioPrefs(value: unknown): AudioPrefs {
  const defaults = defaultUiPrefs().audio;
  if (!value || typeof value !== 'object') return defaults;
  const candidate = value as Partial<AudioPrefs>;
  return {
    sfxEnabled: typeof candidate.sfxEnabled === 'boolean' ? candidate.sfxEnabled : defaults.sfxEnabled,
    sfxVolume: clampUnit(candidate.sfxVolume, defaults.sfxVolume),
    musicEnabled: typeof candidate.musicEnabled === 'boolean' ? candidate.musicEnabled : defaults.musicEnabled,
    musicVolume: clampUnit(candidate.musicVolume, defaults.musicVolume),
  };
}

export function normalizeMapZoom(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_MAP_ZOOM;
  return Math.min(2, Math.max(0.5, Math.round(number * 100) / 100));
}

function uniqueValidValues<T>(
  value: unknown,
  isValid: (entry: unknown) => entry is T,
  limit = Number.POSITIVE_INFINITY,
): T[] {
  if (!Array.isArray(value)) return [];
  const result: T[] = [];
  for (const entry of value) {
    if (!isValid(entry) || result.includes(entry)) continue;
    result.push(entry);
    if (result.length >= limit) break;
  }
  return result;
}

export function normalizeUiPrefs(value: unknown, migratedBuildCategory = DEFAULT_BUILD_CATEGORY): UiPrefs {
  if (!value || typeof value !== 'object') {
    return defaultUiPrefs();
  }
  const candidate = value as {
    version?: unknown;
    starredResources?: unknown;
    pinnedResourceGroups?: unknown;
    buildDrawerLastCategory?: unknown;
    autoAssignBuildingTypes?: unknown;
    pinnedDockWindows?: unknown;
    dockWindowLayouts?: unknown;
    audio?: unknown;
    mapZoom?: unknown;
    showResidentJobMarkers?: unknown;
    showResidentCargoMarkers?: unknown;
    showAquiferLayer?: unknown;
    showOreLayer?: unknown;
    autoFastForwardSleepingNight?: unknown;
  };
  if (candidate.version !== 1 && candidate.version !== 2
    && candidate.version !== 3 && candidate.version !== 4
    && candidate.version !== 5 && candidate.version !== 6
    && candidate.version !== 7 && candidate.version !== 8
    && candidate.version !== UI_PREFS_VERSION) {
    return defaultUiPrefs();
  }
  return {
    version: UI_PREFS_VERSION,
    starredResources: uniqueValidValues(candidate.starredResources, isStockResourceId, MAX_STARRED_RESOURCES),
    pinnedResourceGroups: uniqueValidValues(candidate.pinnedResourceGroups, isResourceDisplayGroupId),
    buildDrawerLastCategory: candidate.version >= 2
      && isBuildCategoryId(candidate.buildDrawerLastCategory)
      ? candidate.buildDrawerLastCategory
      : migratedBuildCategory,
    autoAssignBuildingTypes: candidate.version >= 3
      ? uniqueValidValues(candidate.autoAssignBuildingTypes, isAutoAssignBuildingType)
      : [...AUTO_ASSIGN_BUILDING_TYPES],
    pinnedDockWindows: candidate.version >= 4
      ? uniqueValidValues(candidate.pinnedDockWindows, isDockWindowId)
      : [],
    dockWindowLayouts: candidate.version >= 5
      ? normalizeDockWindowLayouts(candidate.dockWindowLayouts)
      : {},
    audio: candidate.version >= 6
      ? normalizeAudioPrefs(candidate.audio)
      : defaultUiPrefs().audio,
    mapZoom: candidate.version >= 6
      ? normalizeMapZoom(candidate.mapZoom)
      : DEFAULT_MAP_ZOOM,
    showResidentJobMarkers: candidate.version >= 7
      ? candidate.showResidentJobMarkers !== false
      : true,
    showResidentCargoMarkers: candidate.version >= 7
      ? candidate.showResidentCargoMarkers !== false
      : true,
    showAquiferLayer: candidate.version >= 9
      ? candidate.showAquiferLayer === true
      : false,
    showOreLayer: candidate.version >= 9
      ? candidate.showOreLayer === true
      : false,
    autoFastForwardSleepingNight: candidate.version >= 8
      ? candidate.autoFastForwardSleepingNight !== false
      : true,
  };
}

function legacyBuildCategory(storage: UiPrefsStorage): BuildCategoryId {
  try {
    const raw = storage.getItem(LEGACY_BUILD_MENU_OPEN_KEY);
    if (!raw) return DEFAULT_BUILD_CATEGORY;
    const open = JSON.parse(raw) as Record<string, unknown>;
    if (open['주거·기반'] === true) return 'housing';
    if (open['생산'] === true) return 'production';
    if (open['방어·군사'] === true) return 'defense';
  } catch {
    // 손상된 구버전 UI 상태는 기본 카테고리로 대체한다.
  }
  return DEFAULT_BUILD_CATEGORY;
}

function browserStorage(): UiPrefsStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadUiPrefs(storage: UiPrefsStorage | null = browserStorage()): UiPrefs {
  if (!storage) return defaultUiPrefs();
  const migratedBuildCategory = legacyBuildCategory(storage);
  try {
    const raw = storage.getItem(UI_PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) as { version?: unknown } : null;
    const prefs = parsed
      ? normalizeUiPrefs(parsed, migratedBuildCategory)
      : defaultUiPrefs(migratedBuildCategory);
    if ((!parsed || Number(parsed.version) < 6) && storage.getItem('buksae-muted') === '1') {
      return setAudioPrefs(prefs, { sfxEnabled: false, musicEnabled: false });
    }
    return prefs;
  } catch {
    return defaultUiPrefs(migratedBuildCategory);
  } finally {
    try { storage.removeItem?.(LEGACY_BUILD_MENU_OPEN_KEY); } catch { /* ignore */ }
  }
}

export function saveUiPrefs(prefs: UiPrefs, storage: UiPrefsStorage | null = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(UI_PREFS_KEY, JSON.stringify(normalizeUiPrefs(prefs)));
  } catch {
    // 저장 공간 차단/초과는 게임 실행을 막지 않는다.
  }
}

export function toggleStarredResource(prefs: UiPrefs, resource: StockResourceId): UiPrefs {
  if (prefs.starredResources.includes(resource)) {
    return {
      ...prefs,
      starredResources: prefs.starredResources.filter(current => current !== resource),
    };
  }
  if (prefs.starredResources.length >= MAX_STARRED_RESOURCES) return prefs;
  return {
    ...prefs,
    starredResources: [...prefs.starredResources, resource],
  };
}

export function togglePinnedResourceGroup(prefs: UiPrefs, groupId: ResourceDisplayGroupId): UiPrefs {
  if (prefs.pinnedResourceGroups.includes(groupId)) {
    return {
      ...prefs,
      pinnedResourceGroups: prefs.pinnedResourceGroups.filter(current => current !== groupId),
    };
  }
  return {
    ...prefs,
    pinnedResourceGroups: [...prefs.pinnedResourceGroups, groupId],
  };
}

export function setAutoAssignBuildingTypes(
  prefs: UiPrefs,
  types: readonly AutoAssignBuildingType[],
): UiPrefs {
  return {
    ...prefs,
    autoAssignBuildingTypes: uniqueValidValues(types, isAutoAssignBuildingType),
  };
}

export function toggleAutoAssignBuildingType(
  prefs: UiPrefs,
  type: AutoAssignBuildingType,
): UiPrefs {
  return prefs.autoAssignBuildingTypes.includes(type)
    ? setAutoAssignBuildingTypes(prefs, prefs.autoAssignBuildingTypes.filter(current => current !== type))
    : setAutoAssignBuildingTypes(prefs, [...prefs.autoAssignBuildingTypes, type]);
}

export function togglePinnedDockWindow(prefs: UiPrefs, id: DockWindowId): UiPrefs {
  return {
    ...prefs,
    pinnedDockWindows: prefs.pinnedDockWindows.includes(id)
      ? prefs.pinnedDockWindows.filter(current => current !== id)
      : [...prefs.pinnedDockWindows, id],
  };
}

export function setDockWindowLayout(
  prefs: UiPrefs,
  id: FloatingWindowId,
  layout: DockWindowLayout,
): UiPrefs {
  const normalized = normalizeDockWindowLayout(layout);
  if (!normalized) return prefs;
  return {
    ...prefs,
    dockWindowLayouts: {
      ...prefs.dockWindowLayouts,
      [id]: normalized,
    },
  };
}

export function resetDockWindowLayout(prefs: UiPrefs, id: FloatingWindowId): UiPrefs {
  if (!prefs.dockWindowLayouts[id]) return prefs;
  const dockWindowLayouts = { ...prefs.dockWindowLayouts };
  delete dockWindowLayouts[id];
  return { ...prefs, dockWindowLayouts };
}

export function setAudioPrefs(prefs: UiPrefs, audio: Partial<AudioPrefs>): UiPrefs {
  return {
    ...prefs,
    audio: normalizeAudioPrefs({ ...prefs.audio, ...audio }),
  };
}

export function setResidentMarkerPrefs(
  prefs: UiPrefs,
  markers: Partial<ResidentMarkerPrefs>,
): UiPrefs {
  return {
    ...prefs,
    showResidentJobMarkers: typeof markers.showResidentJobMarkers === 'boolean'
      ? markers.showResidentJobMarkers
      : prefs.showResidentJobMarkers,
    showResidentCargoMarkers: typeof markers.showResidentCargoMarkers === 'boolean'
      ? markers.showResidentCargoMarkers
      : prefs.showResidentCargoMarkers,
  };
}

export function setAutoFastForwardSleepingNight(prefs: UiPrefs, enabled: boolean): UiPrefs {
  return enabled === prefs.autoFastForwardSleepingNight
    ? prefs
    : { ...prefs, autoFastForwardSleepingNight: enabled };
}

export function setMapZoom(prefs: UiPrefs, mapZoom: number): UiPrefs {
  const normalized = normalizeMapZoom(mapZoom);
  return normalized === prefs.mapZoom ? prefs : { ...prefs, mapZoom: normalized };
}

export function setMapLayerVisibility(
  prefs: UiPrefs,
  layer: 'aquifer' | 'ore',
  visible: boolean,
): UiPrefs {
  return layer === 'aquifer'
    ? { ...prefs, showAquiferLayer: visible }
    : { ...prefs, showOreLayer: visible };
}
