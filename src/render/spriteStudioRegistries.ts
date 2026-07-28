// 이 파일은 tools/sprite-studio/generate_registries.mjs가 생성한다. 직접 수정하지 말 것.
// 편집 원본은 tools/sprite-studio/data/*.json이며, 스프라이트 스튜디오에서 눈으로 보며 고친다.
import type { BuildingTypeId } from '../game/types';

// ── 표시 비율 ──
// 현재 그리기 크기에 곱해지는 **상대 배율**이다. 값이 없으면 1배·오프셋 0 =
// 레지스트리 도입 이전과 완전히 같은 그림이 된다.
export interface SpriteDisplayMetric {
  readonly scale: number;
  readonly dy: number;
}

export const SPRITE_DISPLAY_METRIC_KEYS: readonly string[] = [
  "common",
  "i2v.woodSplitter",
  "i2v.farmer",
  "i2v.miller",
  "i2v.builder",
  "i2v.fisher",
  "i2v.hauler",
  "i2v.herbalist",
  "i2v.physician",
  "i2v.curer",
  "i2v.potter",
  "i2v.smith",
  "i2v.miner",
  "i2v.charcoalBurner",
  "i2v.herder",
  "i2v.hunter",
  "i2v.tanner",
  "i2v.weaver",
  "i2v.powderMaker",
  "i2v.clerk",
  "i2v.watchman",
  "i2v.undertaker",
  "i2v.teacher",
  "i2v.shaman",
  "i2v.monk",
  "i2v.militia",
  "video.idle.walk",
  "video.woodcutter.work",
  "video.woodcutter.walk.axe",
  "video.woodcutter.walk.jige",
  "jige.hauler",
  "jige.fisher",
  "jige.herbalist",
  "jige.miller",
  "jige.woodSplitter",
  "jige.smith",
  "jige.curer",
  "jige.potter",
  "jige.charcoalBurner",
  "jige.powderMaker",
  "jige.tanner",
  "jige.weaver",
  "walk.woodcutter",
  "walk.hunter",
  "walk.hauler",
  "walk.builder",
  "walk.herbalist",
  "walk.miner",
  "work.woodcutter",
  "work.hunter",
  "work.builder",
  "work.herbalist",
  "work.miner",
  "work.woodSplitter",
  "work.fisher",
  "work.herder",
  "work.charcoalBurner",
  "work.powderMaker",
  "work.undertaker",
  "work.curer",
  "work.potter",
  "work.farmer.oxPlow",
  "work.farmer.harvest",
  "work.farmer.till",
  "load.woodcutter",
  "load.hunter",
  "load.miner",
  "cart.hauler",
  "cart-load.hauler"
];

const DEFAULT_DISPLAY_METRIC: SpriteDisplayMetric = { scale: 1, dy: 0 };

export const SPRITE_DISPLAY_METRICS: Readonly<Record<string, SpriteDisplayMetric>> = {};

export function spriteDisplayMetric(key: string | undefined): SpriteDisplayMetric {
  if (!key) return DEFAULT_DISPLAY_METRIC;
  return SPRITE_DISPLAY_METRICS[key] ?? DEFAULT_DISPLAY_METRIC;
}

// ── 작업 자세 앵커 ──
// 키는 "<직업>@<서 있는 타일 지형>". facing 0 = 기존 로직 유지.
export interface WorkAnchor {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly facing: 1 | -1 | 0;
}

export const WORK_ANCHOR_KEYS: readonly string[] = [
  "miner@rock",
  "woodcutter@forest",
  "herbalist@forest"
];

export const WORK_ANCHORS: Readonly<Record<string, WorkAnchor>> = {};

export function workAnchor(key: string): WorkAnchor | null {
  return WORK_ANCHORS[key] ?? null;
}

// ── 건물 효과 이미터 ──
// 화면 좌표는 x = bx + size * fx + dx, y = by + size * fy + dy로 계산한다.
// size가 등급에 따라 변하는 중심지도 비율 기준이라 어긋나지 않는다.
export type BuildingEffectKind = 'chimneySmoke' | 'fireSparks' | 'craftGlint' | 'serviceGlow' | 'windowGlow';
export type BuildingEffectWhen = 'working' | 'night' | 'winterHeating' | 'always';

export interface BuildingEffectEmitter {
  readonly kind: BuildingEffectKind;
  readonly fx: number;
  readonly fy: number;
  readonly dx: number;
  readonly dy: number;
  readonly scale: number;
  readonly when: BuildingEffectWhen;
}

export const BUILDING_EFFECT_KINDS: readonly BuildingEffectKind[] = [
  "chimneySmoke",
  "fireSparks",
  "craftGlint",
  "serviceGlow",
  "windowGlow"
];
export const BUILDING_EFFECT_WHENS: readonly BuildingEffectWhen[] = [
  "working",
  "night",
  "winterHeating",
  "always"
];

export const BUILDING_EFFECT_TABLE: Partial<Record<BuildingTypeId, readonly BuildingEffectEmitter[]>> = {
  "charcoalKiln": [
    {
      "kind": "chimneySmoke",
      "fx": 1,
      "fy": 0,
      "dx": -4,
      "dy": -13,
      "scale": 1,
      "when": "working"
    },
    {
      "kind": "fireSparks",
      "fx": 0.7,
      "fy": 0.68,
      "dx": 0,
      "dy": 0,
      "scale": 1,
      "when": "working"
    }
  ],
  "center": [
    {
      "kind": "chimneySmoke",
      "fx": 1,
      "fy": 0,
      "dx": -4,
      "dy": -13,
      "scale": 1,
      "when": "winterHeating"
    },
    {
      "kind": "windowGlow",
      "fx": 0.5,
      "fy": 0.42,
      "dx": -1.5,
      "dy": 0,
      "scale": 1,
      "when": "night"
    }
  ],
  "clinic": [
    {
      "kind": "serviceGlow",
      "fx": 0.5,
      "fy": 0.55,
      "dx": 0,
      "dy": 0,
      "scale": 1,
      "when": "working"
    }
  ],
  "dryingRack": [
    {
      "kind": "craftGlint",
      "fx": 0.35,
      "fy": 0.72,
      "dx": 0,
      "dy": 0,
      "scale": 1,
      "when": "working"
    }
  ],
  "garrison": [
    {
      "kind": "windowGlow",
      "fx": 0.5,
      "fy": 0.42,
      "dx": -1.5,
      "dy": 0,
      "scale": 1,
      "when": "night"
    }
  ],
  "hermitage": [
    {
      "kind": "serviceGlow",
      "fx": 0.5,
      "fy": 0.55,
      "dx": 0,
      "dy": 0,
      "scale": 1,
      "when": "working"
    }
  ],
  "hut": [
    {
      "kind": "windowGlow",
      "fx": 0.5,
      "fy": 0.42,
      "dx": -1.5,
      "dy": 0,
      "scale": 1,
      "when": "night"
    }
  ],
  "nitreYard": [
    {
      "kind": "craftGlint",
      "fx": 0.35,
      "fy": 0.72,
      "dx": 0,
      "dy": 0,
      "scale": 1,
      "when": "working"
    }
  ],
  "office": [
    {
      "kind": "serviceGlow",
      "fx": 0.5,
      "fy": 0.55,
      "dx": 0,
      "dy": 0,
      "scale": 1,
      "when": "working"
    }
  ],
  "ondol": [
    {
      "kind": "chimneySmoke",
      "fx": 1,
      "fy": 0,
      "dx": -4,
      "dy": -13,
      "scale": 1,
      "when": "winterHeating"
    },
    {
      "kind": "windowGlow",
      "fx": 0.5,
      "fy": 0.42,
      "dx": -1.5,
      "dy": 0,
      "scale": 1,
      "when": "night"
    }
  ],
  "onggiKiln": [
    {
      "kind": "chimneySmoke",
      "fx": 1,
      "fy": 0,
      "dx": -4,
      "dy": -13,
      "scale": 1,
      "when": "working"
    },
    {
      "kind": "fireSparks",
      "fx": 0.7,
      "fy": 0.68,
      "dx": 0,
      "dy": 0,
      "scale": 1,
      "when": "working"
    }
  ],
  "school": [
    {
      "kind": "serviceGlow",
      "fx": 0.5,
      "fy": 0.55,
      "dx": 0,
      "dy": 0,
      "scale": 1,
      "when": "working"
    }
  ],
  "shrine": [
    {
      "kind": "serviceGlow",
      "fx": 0.5,
      "fy": 0.55,
      "dx": 0,
      "dy": 0,
      "scale": 1,
      "when": "working"
    }
  ],
  "smithy": [
    {
      "kind": "chimneySmoke",
      "fx": 1,
      "fy": 0,
      "dx": -4,
      "dy": -13,
      "scale": 1,
      "when": "working"
    },
    {
      "kind": "fireSparks",
      "fx": 0.7,
      "fy": 0.68,
      "dx": 0,
      "dy": 0,
      "scale": 1,
      "when": "working"
    }
  ],
  "smokehouse": [
    {
      "kind": "chimneySmoke",
      "fx": 1,
      "fy": 0,
      "dx": -4,
      "dy": -13,
      "scale": 1,
      "when": "working"
    },
    {
      "kind": "fireSparks",
      "fx": 0.7,
      "fy": 0.68,
      "dx": 0,
      "dy": 0,
      "scale": 1,
      "when": "working"
    }
  ],
  "stable": [
    {
      "kind": "serviceGlow",
      "fx": 0.5,
      "fy": 0.55,
      "dx": 0,
      "dy": 0,
      "scale": 1,
      "when": "working"
    }
  ],
  "tannery": [
    {
      "kind": "craftGlint",
      "fx": 0.35,
      "fy": 0.72,
      "dx": 0,
      "dy": 0,
      "scale": 1,
      "when": "working"
    }
  ],
  "watermill": [
    {
      "kind": "craftGlint",
      "fx": 0.35,
      "fy": 0.72,
      "dx": 0,
      "dy": 0,
      "scale": 1,
      "when": "working"
    }
  ],
  "weavingHouse": [
    {
      "kind": "craftGlint",
      "fx": 0.35,
      "fy": 0.72,
      "dx": 0,
      "dy": 0,
      "scale": 1,
      "when": "working"
    }
  ],
  "woodShed": [
    {
      "kind": "craftGlint",
      "fx": 0.35,
      "fy": 0.72,
      "dx": 0,
      "dy": 0,
      "scale": 1,
      "when": "working"
    }
  ]
};

const BUILDING_EFFECTS = BUILDING_EFFECT_TABLE;

const NO_EFFECTS: readonly BuildingEffectEmitter[] = [];

export function buildingEffectEmitters(type: BuildingTypeId): readonly BuildingEffectEmitter[] {
  return BUILDING_EFFECTS[type] ?? NO_EFFECTS;
}

// ── 야외 작업자 슬롯 ──
// 등록하지 않은 건물은 현행 유지(건물 주변 아무 인접 칸).
export interface BuildingWorkerSlot {
  readonly tileDX: number;
  readonly tileDY: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly facing: 1 | -1 | 0;
}

const BUILDING_WORKER_SLOTS: Partial<Record<BuildingTypeId, readonly BuildingWorkerSlot[]>> = {};

const NO_SLOTS: readonly BuildingWorkerSlot[] = [];

export function buildingWorkerSlots(type: BuildingTypeId): readonly BuildingWorkerSlot[] {
  return BUILDING_WORKER_SLOTS[type] ?? NO_SLOTS;
}

// ── 건물 그림자 ──
// 나무·주민 그림자와 태양 물리는 전역 시스템이라 여기서 다루지 않는다.
export type BuildingShadowMode = 'standard' | 'courtyard' | 'none';

export interface BuildingShadowSettings {
  readonly mode: BuildingShadowMode;
  readonly groundFrac: number;
  readonly anchorDepthFrac: number;
  readonly lengthScale: number;
}

export const BUILDING_SHADOW_MODES: readonly BuildingShadowMode[] = [
  "standard",
  "courtyard",
  "none"
];

const DEFAULT_BUILDING_SHADOW: BuildingShadowSettings = {
  mode: 'standard', groundFrac: 0, anchorDepthFrac: 0, lengthScale: 1,
};

const BUILDING_SHADOWS: Partial<Record<BuildingTypeId, BuildingShadowSettings>> = {
  "center": {
    "mode": "courtyard",
    "groundFrac": 0.33,
    "anchorDepthFrac": 0.5,
    "lengthScale": 1
  }
};

export function buildingShadowSettings(type: BuildingTypeId): BuildingShadowSettings {
  return BUILDING_SHADOWS[type] ?? DEFAULT_BUILDING_SHADOW;
}
