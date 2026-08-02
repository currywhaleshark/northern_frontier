// 이 파일은 tools/sprite-studio/generate_registries.mjs가 생성한다. 직접 수정하지 말 것.
// 편집 원본은 tools/sprite-studio/data/worker-slots.json이며, 스프라이트 스튜디오에서 눈으로 보며 고친다.
import type { BuildingTypeId } from './types';

// ── 야외 작업자 자리 ──
// 등록한 건물의 근무자는 건물 옆 아무 칸이 아니라 이 칸으로 간다.
// 등록하지 않은 건물은 현행 유지. tileD*는 건물 좌상단 기준 타일 오프셋,
// offset*는 그 칸 안에서의 렌더 보정(px), facing 0은 기존 방향 계산 유지.
export interface BuildingWorkerSlot {
  readonly tileDX: number;
  readonly tileDY: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly facing: 1 | -1 | 0;
}

const BUILDING_WORKER_SLOTS: Partial<Record<BuildingTypeId, readonly BuildingWorkerSlot[]>> = {
  "woodShed": [
    {
      "tileDX": -1,
      "tileDY": 1,
      "offsetX": 0,
      "offsetY": 0,
      "facing": 1
    },
    {
      "tileDX": 2,
      "tileDY": 1,
      "offsetX": 0,
      "offsetY": 0,
      "facing": -1
    }
  ],
  "watchtower": [
    {
      "tileDX": 1,
      "tileDY": 0,
      "offsetX": -5,
      "offsetY": -8,
      "facing": -1
    }
  ],
  "saltworks": [
    {
      "tileDX": -1,
      "tileDY": 1,
      "offsetX": 0,
      "offsetY": 0,
      "facing": 1
    },
    {
      "tileDX": 2,
      "tileDY": 1,
      "offsetX": 0,
      "offsetY": 0,
      "facing": -1
    }
  ]
};

const NO_SLOTS: readonly BuildingWorkerSlot[] = [];

export function buildingWorkerSlots(type: BuildingTypeId): readonly BuildingWorkerSlot[] {
  return BUILDING_WORKER_SLOTS[type] ?? NO_SLOTS;
}
