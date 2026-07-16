import {
  isResourceDisplayGroupId,
  isStockResourceId,
  type ResourceDisplayGroupId,
  type StockResourceId,
} from './resourceDisplay';

export const UI_PREFS_KEY = 'buksae-ui-prefs';
export const UI_PREFS_VERSION = 1;
export const MAX_STARRED_RESOURCES = 8;

export interface UiPrefs {
  version: typeof UI_PREFS_VERSION;
  starredResources: StockResourceId[];
  pinnedResourceGroups: ResourceDisplayGroupId[];
}

export interface UiPrefsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultUiPrefs(): UiPrefs {
  return {
    version: UI_PREFS_VERSION,
    starredResources: [],
    pinnedResourceGroups: [],
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

export function normalizeUiPrefs(value: unknown): UiPrefs {
  if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== UI_PREFS_VERSION) {
    return defaultUiPrefs();
  }
  const candidate = value as Partial<UiPrefs>;
  return {
    version: UI_PREFS_VERSION,
    starredResources: uniqueValidValues(candidate.starredResources, isStockResourceId, MAX_STARRED_RESOURCES),
    pinnedResourceGroups: uniqueValidValues(candidate.pinnedResourceGroups, isResourceDisplayGroupId),
  };
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
  try {
    const raw = storage.getItem(UI_PREFS_KEY);
    return raw ? normalizeUiPrefs(JSON.parse(raw)) : defaultUiPrefs();
  } catch {
    return defaultUiPrefs();
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
