// 저장 존재 여부처럼 메뉴에서도 필요한 최소 저장소 계약만 둔다.
// 실제 직렬화·마이그레이션은 큰 saveLoad 모듈을 게임 시작 시 지연 로딩한다.
const SAVE_STORAGE_KEY = 'buksae-save-v3';
export const SAVE_SLOT_COUNT = 4;

export function saveSlotStorageKey(slot: number): string {
  return slot <= 1 ? SAVE_STORAGE_KEY : `${SAVE_STORAGE_KEY}-slot${slot}`;
}

export function hasAnyStoredSave(storage: Pick<Storage, 'getItem'> | null = browserStorage()): boolean {
  if (!storage) return false;
  for (let slot = 1; slot <= SAVE_SLOT_COUNT; slot++) {
    if (storage.getItem(saveSlotStorageKey(slot)) != null) return true;
  }
  return false;
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
