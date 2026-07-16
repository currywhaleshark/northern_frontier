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

export const UI_PREFS_KEY = 'buksae-ui-prefs';
export const LEGACY_BUILD_MENU_OPEN_KEY = 'buksae-buildmenu-open';
export const UI_PREFS_VERSION = 2;
export const MAX_STARRED_RESOURCES = 8;

export interface UiPrefs {
  version: typeof UI_PREFS_VERSION;
  starredResources: StockResourceId[];
  pinnedResourceGroups: ResourceDisplayGroupId[];
  buildDrawerLastCategory: BuildCategoryId;
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
  };
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
  };
  if (candidate.version !== 1 && candidate.version !== UI_PREFS_VERSION) return defaultUiPrefs();
  return {
    version: UI_PREFS_VERSION,
    starredResources: uniqueValidValues(candidate.starredResources, isStockResourceId, MAX_STARRED_RESOURCES),
    pinnedResourceGroups: uniqueValidValues(candidate.pinnedResourceGroups, isResourceDisplayGroupId),
    buildDrawerLastCategory: candidate.version === UI_PREFS_VERSION
      && isBuildCategoryId(candidate.buildDrawerLastCategory)
      ? candidate.buildDrawerLastCategory
      : migratedBuildCategory,
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
    return raw
      ? normalizeUiPrefs(JSON.parse(raw), migratedBuildCategory)
      : defaultUiPrefs(migratedBuildCategory);
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
