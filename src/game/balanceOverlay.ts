// 밸런스 오버레이 병합 — 편집기가 남긴 "바꾼 값만"을 기본값 트리에 얹는다.
//
// 오버레이 원본은 tools/balance-studio/data/balance-overrides.json이고,
// 코드젠(tools/balance-studio/generate_balance_overrides.mjs)이 ./balanceOverrides.ts로 굽는다.
// 게임은 생성된 TS만 읽는다 — 런타임에 JSON을 fetch하지 않는다.
//
// **병합 시점**: 소비자 모듈이 import 시점에 값을 읽어가는 경우가 있으므로
// (예: `const TILE = CONFIG.ui.tileSize`), 병합은 값을 정의한 모듈 자신의 본문에서 끝낸다.
// config.ts 말미에서 CONFIG를, buildings.ts 말미에서 BUILDING_DEFS를 병합한다.
// ESM은 import된 모듈의 본문을 소비자 본문보다 먼저 끝까지 실행하므로, 이것으로 순서가 보장된다.
import { BALANCE_OVERRIDES } from './balanceOverrides';

/** 오버레이가 다룰 수 있는 잎 값. 문자열·배열 컨테이너는 편집 대상이 아니다. */
export type BalanceOverrideValue = number | boolean;

/** 경로가 기본값 트리에 없거나 형이 어긋나 무시된 항목. 개발 중 확인용. */
export const BALANCE_OVERRIDE_MISSES: string[] = [];

/** 기본값 트리 깊은 복사 — 오버레이가 원본 리터럴을 건드리지 못하게 한다. */
export function cloneBalanceTree<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => cloneBalanceTree(item)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = cloneBalanceTree(item);
    }
    return out as T;
  }
  return value;
}

function assign(target: unknown, path: readonly string[], value: BalanceOverrideValue, fullKey: string): void {
  let node: unknown = target;
  for (let index = 0; index < path.length - 1; index++) {
    if (node === null || typeof node !== 'object') { BALANCE_OVERRIDE_MISSES.push(fullKey); return; }
    node = (node as Record<string, unknown>)[path[index]];
  }
  if (node === null || typeof node !== 'object') { BALANCE_OVERRIDE_MISSES.push(fullKey); return; }
  const leaf = path[path.length - 1];
  const container = node as Record<string, unknown>;
  const current = container[leaf];
  // 없는 경로·형이 다른 경로는 조용히 무시한다 (코드젠이 이미 걸러내지만, 생성 파일이 낡았을 수도 있다).
  if (current === undefined || typeof current !== typeof value) { BALANCE_OVERRIDE_MISSES.push(fullKey); return; }
  container[leaf] = value;
}

/**
 * `prefix`로 시작하는 오버레이 항목을 `target`에 제자리 병합하고 target을 그대로 돌려준다.
 * CONFIG는 prefix `''`, BUILDING_DEFS는 prefix `'buildings.'`을 쓴다.
 */
export function applyBalanceOverrides<T>(target: T, prefix: string): T {
  for (const [key, value] of Object.entries(BALANCE_OVERRIDES)) {
    if (!key.startsWith(prefix)) continue;
    // prefix ''일 때 buildings.* 는 BUILDING_DEFS 몫이라 CONFIG에 얹지 않는다.
    if (prefix === '' && key.startsWith('buildings.')) continue;
    const path = key.slice(prefix.length).split('.');
    if (path.length === 0 || path.some(segment => segment.length === 0)) {
      BALANCE_OVERRIDE_MISSES.push(key);
      continue;
    }
    assign(target, path, value, key);
  }
  return target;
}

/** 오버레이 항목 수 — 디버그 표시용. */
export function balanceOverrideCount(): number {
  return Object.keys(BALANCE_OVERRIDES).length;
}
