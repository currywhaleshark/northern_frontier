// 스프라이트 스튜디오 레지스트리 코드젠 — data/*.json을 읽어
// src/render/spriteStudioRegistries.ts 하나로 굽는다.
//
// 사용법:
//   node tools/sprite-studio/generate_registries.mjs
//
// 게임은 생성된 TS만 읽는다. 런타임에 JSON을 fetch하지 않는다.
// 알 수 없는 키가 JSON에 있으면 에러로 중단한다 — 오타가 조용히 무시되는 것을 막는다.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const DATA_DIR = join(HERE, 'data');
const OUT = join(ROOT, 'src', 'render', 'spriteStudioRegistries.ts');
// 작업자 자리는 렌더가 아니라 이동 목표를 바꾼다 — 시뮬레이션이 읽으므로 game 쪽에 굽는다.
// (game이 render를 import하면 게임 테스트 하니스가 모듈을 못 찾는다.)
const OUT_SLOTS = join(ROOT, 'src', 'game', 'buildingWorkerSlots.ts');

// ── 알려진 키 목록 (단일 원본) ──────────────────────────────────────────
// drawResident(=drawOptionalResidentPresentation) 안의 draw 호출 지점 하나당 키 하나.

const I2V_JOBS = [
  'woodSplitter', 'farmer', 'miller', 'builder', 'fisher', 'hauler', 'herbalist',
  'physician', 'curer', 'potter', 'saltMaker', 'smith', 'miner', 'charcoalBurner', 'herder',
  'hunter', 'tanner', 'weaver', 'powderMaker', 'clerk', 'watchman', 'undertaker',
  'teacher', 'shaman', 'monk', 'militia',
];

const JIGE_JOBS = [
  'hauler', 'fisher', 'herbalist', 'miller', 'woodSplitter', 'smith',
  'curer', 'potter', 'saltMaker', 'charcoalBurner', 'powderMaker', 'tanner', 'weaver',
];

const WALK_JOBS = ['woodcutter', 'hunter', 'hauler', 'builder', 'herbalist', 'miner'];

const WORK_JOBS = [
  'woodcutter', 'hunter', 'builder', 'herbalist', 'miner', 'woodSplitter',
  'fisher', 'herder', 'charcoalBurner', 'powderMaker', 'undertaker', 'curer', 'potter', 'saltMaker',
];

const LOAD_JOBS = ['woodcutter', 'hunter', 'miner'];

export const SPRITE_DISPLAY_METRIC_KEYS = [
  'common',
  ...I2V_JOBS.map(job => `i2v.${job}`),
  'video.idle.walk',
  'video.woodcutter.work',
  'video.woodcutter.walk.axe',
  'video.woodcutter.walk.jige',
  ...JIGE_JOBS.map(job => `jige.${job}`),
  ...WALK_JOBS.map(job => `walk.${job}`),
  ...WORK_JOBS.map(job => `work.${job}`),
  'work.farmer.oxPlow',
  'work.farmer.harvest',
  'work.farmer.till',
  ...LOAD_JOBS.map(job => `load.${job}`),
  'cart.hauler',
  'cart-load.hauler',
];

const WORK_ANCHOR_KEYS = ['miner@rock', 'woodcutter@forest', 'herbalist@forest'];

const EFFECT_KINDS = ['chimneySmoke', 'fireSparks', 'craftGlint', 'serviceGlow', 'windowGlow'];
const EFFECT_WHENS = ['working', 'night', 'winterHeating', 'always'];
const SHADOW_MODES = ['standard', 'courtyard', 'none'];

// ── 읽기·검증 ──────────────────────────────────────────────────────────

function readData(name) {
  const path = join(DATA_DIR, `${name}.json`);
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  // 데이터 파일 안의 주석 필드는 무시한다.
  const { _comment, ...rest } = parsed;
  return rest;
}

function fail(message) {
  console.error(`[sprite-studio] ${message}`);
  process.exit(1);
}

function finiteOr(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

const displayMetrics = readData('display-metrics');
for (const key of Object.keys(displayMetrics)) {
  if (!SPRITE_DISPLAY_METRIC_KEYS.includes(key)) {
    fail(`display-metrics.json: 알 수 없는 키 "${key}" (SPRITE_DISPLAY_METRIC_KEYS에 없음)`);
  }
}

const workAnchors = readData('work-anchors');
for (const key of Object.keys(workAnchors)) {
  if (!WORK_ANCHOR_KEYS.includes(key)) {
    fail(`work-anchors.json: 알 수 없는 키 "${key}" (허용: ${WORK_ANCHOR_KEYS.join(', ')})`);
  }
}

const buildingEffects = readData('building-effects');
for (const [type, emitters] of Object.entries(buildingEffects)) {
  if (!Array.isArray(emitters)) fail(`building-effects.json: "${type}"는 배열이어야 한다`);
  for (const emitter of emitters) {
    if (!EFFECT_KINDS.includes(emitter.kind)) {
      fail(`building-effects.json: "${type}"에 알 수 없는 kind "${emitter.kind}"`);
    }
    if (!EFFECT_WHENS.includes(emitter.when)) {
      fail(`building-effects.json: "${type}"에 알 수 없는 when "${emitter.when}"`);
    }
  }
}

// 자리를 실제로 따르는 건물만 허용한다 — agents.ts에서 workerSlotGoal을 쓰는 tick의 목록이다.
// 다른 건물에 등록하면 근무자는 그 칸으로 가지 않으므로 조용한 무효 데이터가 된다.
const SLOT_BUILDING_TYPES = ['woodShed', 'saltworks', 'watchtower'];

const workerSlots = readData('worker-slots');
for (const [type, slots] of Object.entries(workerSlots)) {
  if (!SLOT_BUILDING_TYPES.includes(type)) {
    fail(`worker-slots.json: "${type}"는 아직 자리를 따르지 않는다 (허용: ${SLOT_BUILDING_TYPES.join(', ')})`);
  }
  if (!Array.isArray(slots)) fail(`worker-slots.json: "${type}"는 배열이어야 한다`);
  for (const slot of slots) {
    if (!Number.isInteger(Number(slot.tileDX)) || !Number.isInteger(Number(slot.tileDY))) {
      fail(`worker-slots.json: "${type}"의 tileDX·tileDY는 정수여야 한다`);
    }
    if (Number(slot.tileDX) === 0 && Number(slot.tileDY) === 0) {
      fail(`worker-slots.json: "${type}"의 자리가 건물 칸(0,0)이다 — 통행 불가라 갈 수 없다`);
    }
  }
}

const buildingShadows = readData('building-shadows');
for (const [type, shadow] of Object.entries(buildingShadows)) {
  if (!SHADOW_MODES.includes(shadow.mode)) {
    fail(`building-shadows.json: "${type}"에 알 수 없는 mode "${shadow.mode}"`);
  }
}

// ── 출력 ───────────────────────────────────────────────────────────────

function literal(value) {
  return JSON.stringify(value, null, 2).replace(/\n/g, '\n');
}

const displayEntries = Object.fromEntries(
  Object.entries(displayMetrics).map(([key, metric]) => [key, {
    scale: finiteOr(metric.scale, 1),
    dy: finiteOr(metric.dy, 0),
  }]),
);

const anchorEntries = Object.fromEntries(
  Object.entries(workAnchors).map(([key, anchor]) => [key, {
    offsetX: finiteOr(anchor.offsetX, 0),
    offsetY: finiteOr(anchor.offsetY, 0),
    facing: anchor.facing === 1 || anchor.facing === -1 ? anchor.facing : 0,
  }]),
);

const effectEntries = Object.fromEntries(
  Object.entries(buildingEffects).map(([type, emitters]) => [type, emitters.map(emitter => ({
    kind: emitter.kind,
    fx: finiteOr(emitter.fx, 0),
    fy: finiteOr(emitter.fy, 0),
    dx: finiteOr(emitter.dx, 0),
    dy: finiteOr(emitter.dy, 0),
    scale: finiteOr(emitter.scale, 1),
    when: emitter.when,
  }))]),
);

const slotEntries = Object.fromEntries(
  Object.entries(workerSlots).map(([type, slots]) => [type, (slots ?? []).map(slot => ({
    tileDX: Math.round(finiteOr(slot.tileDX, 0)),
    tileDY: Math.round(finiteOr(slot.tileDY, 0)),
    offsetX: finiteOr(slot.offsetX, 0),
    offsetY: finiteOr(slot.offsetY, 0),
    facing: slot.facing === 1 || slot.facing === -1 ? slot.facing : 0,
  }))]),
);

const shadowEntries = Object.fromEntries(
  Object.entries(buildingShadows).map(([type, shadow]) => [type, {
    mode: shadow.mode,
    groundFrac: finiteOr(shadow.groundFrac, 0),
    anchorDepthFrac: finiteOr(shadow.anchorDepthFrac, 0),
    lengthScale: finiteOr(shadow.lengthScale, 1),
  }]),
);

const out = `// 이 파일은 tools/sprite-studio/generate_registries.mjs가 생성한다. 직접 수정하지 말 것.
// 편집 원본은 tools/sprite-studio/data/*.json이며, 스프라이트 스튜디오에서 눈으로 보며 고친다.
import type { BuildingTypeId } from '../game/types';

// ── 표시 비율 ──
// 현재 그리기 크기에 곱해지는 **상대 배율**이다. 값이 없으면 1배·오프셋 0 =
// 레지스트리 도입 이전과 완전히 같은 그림이 된다.
export interface SpriteDisplayMetric {
  readonly scale: number;
  readonly dy: number;
}

export const SPRITE_DISPLAY_METRIC_KEYS: readonly string[] = ${literal(SPRITE_DISPLAY_METRIC_KEYS)};

const DEFAULT_DISPLAY_METRIC: SpriteDisplayMetric = { scale: 1, dy: 0 };

export const SPRITE_DISPLAY_METRICS: Readonly<Record<string, SpriteDisplayMetric>> = ${literal(displayEntries)};

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

export const WORK_ANCHOR_KEYS: readonly string[] = ${literal(WORK_ANCHOR_KEYS)};

export const WORK_ANCHORS: Readonly<Record<string, WorkAnchor>> = ${literal(anchorEntries)};

export function workAnchor(key: string): WorkAnchor | null {
  return WORK_ANCHORS[key] ?? null;
}

// ── 건물 효과 이미터 ──
// 화면 좌표는 x = bx + size * fx + dx, y = by + size * fy + dy로 계산한다.
// size가 등급에 따라 변하는 중심지도 비율 기준이라 어긋나지 않는다.
export type BuildingEffectKind = ${EFFECT_KINDS.map(kind => `'${kind}'`).join(' | ')};
export type BuildingEffectWhen = ${EFFECT_WHENS.map(when => `'${when}'`).join(' | ')};

export interface BuildingEffectEmitter {
  readonly kind: BuildingEffectKind;
  readonly fx: number;
  readonly fy: number;
  readonly dx: number;
  readonly dy: number;
  readonly scale: number;
  readonly when: BuildingEffectWhen;
}

export const BUILDING_EFFECT_KINDS: readonly BuildingEffectKind[] = ${literal(EFFECT_KINDS)};
export const BUILDING_EFFECT_WHENS: readonly BuildingEffectWhen[] = ${literal(EFFECT_WHENS)};

export const BUILDING_EFFECT_TABLE: Partial<Record<BuildingTypeId, readonly BuildingEffectEmitter[]>> = ${literal(effectEntries)};

const BUILDING_EFFECTS = BUILDING_EFFECT_TABLE;

const NO_EFFECTS: readonly BuildingEffectEmitter[] = [];

export function buildingEffectEmitters(type: BuildingTypeId): readonly BuildingEffectEmitter[] {
  return BUILDING_EFFECTS[type] ?? NO_EFFECTS;
}

// ── 건물 그림자 ──
// 나무·주민 그림자와 태양 물리는 전역 시스템이라 여기서 다루지 않는다.
export type BuildingShadowMode = ${SHADOW_MODES.map(mode => `'${mode}'`).join(' | ')};

export interface BuildingShadowSettings {
  readonly mode: BuildingShadowMode;
  readonly groundFrac: number;
  readonly anchorDepthFrac: number;
  readonly lengthScale: number;
}

export const BUILDING_SHADOW_MODES: readonly BuildingShadowMode[] = ${literal(SHADOW_MODES)};

const DEFAULT_BUILDING_SHADOW: BuildingShadowSettings = {
  mode: 'standard', groundFrac: 0, anchorDepthFrac: 0, lengthScale: 1,
};

const BUILDING_SHADOWS: Partial<Record<BuildingTypeId, BuildingShadowSettings>> = ${literal(shadowEntries)};

export function buildingShadowSettings(type: BuildingTypeId): BuildingShadowSettings {
  return BUILDING_SHADOWS[type] ?? DEFAULT_BUILDING_SHADOW;
}
`;

const slotsOut = `// 이 파일은 tools/sprite-studio/generate_registries.mjs가 생성한다. 직접 수정하지 말 것.
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

const BUILDING_WORKER_SLOTS: Partial<Record<BuildingTypeId, readonly BuildingWorkerSlot[]>> = ${literal(slotEntries)};

const NO_SLOTS: readonly BuildingWorkerSlot[] = [];

export function buildingWorkerSlots(type: BuildingTypeId): readonly BuildingWorkerSlot[] {
  return BUILDING_WORKER_SLOTS[type] ?? NO_SLOTS;
}
`;

writeFileSync(OUT_SLOTS, slotsOut, 'utf8');
writeFileSync(OUT, out, 'utf8');
console.log(`[sprite-studio] ${OUT} 생성 완료`);
console.log(`[sprite-studio] ${OUT_SLOTS} 생성 완료`);
console.log(`  표시 비율 키 ${SPRITE_DISPLAY_METRIC_KEYS.length}개 · 편집된 항목 ${Object.keys(displayEntries).length}개`);
console.log(`  작업 앵커 ${Object.keys(anchorEntries).length}개 · 건물 효과 ${Object.keys(effectEntries).length}종`);
console.log(`  작업자 슬롯 ${Object.keys(slotEntries).length}종 · 건물 그림자 ${Object.keys(shadowEntries).length}종`);
