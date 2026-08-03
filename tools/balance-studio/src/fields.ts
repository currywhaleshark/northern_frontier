// 기본값 트리 → 폼 항목 목록. 항목별 수제 UI는 두지 않는다 —
// config.ts에 값이 하나 늘면 편집기에도 저절로 하나 늘어야 한다.
import { CONFIG_DEFAULTS } from '@game/game/config';
import { BUILDING_DEF_DEFAULTS } from '@game/game/buildings';
import { balanceBlockReason, balanceTiming, type BalanceTiming } from '../balance-meta.mjs';
import type { OverrideValue, KeyComment } from './api';

export type { BalanceTiming };

export interface BalanceField {
  /** 오버레이 경로 키. `buildings.`로 시작하면 BUILDING_DEFS 몫이다. */
  path: string;
  /** 마지막 조각 — 화면에 크게 나오는 이름 */
  leaf: string;
  /** 부모 경로. 같은 값끼리 한 묶음으로 보여준다. */
  group: string;
  /** 최상위 키 = 카테고리 */
  category: string;
  kind: 'number' | 'boolean';
  defaultValue: OverrideValue;
  timing: BalanceTiming;
}

export interface BalanceGroup {
  path: string;
  fields: BalanceField[];
}

export interface BalanceCategory {
  id: string;
  label: string;
  fieldCount: number;
}

function walk(node: unknown, prefix: string, out: BalanceField[]): void {
  if (node === null || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (balanceBlockReason(path)) continue;
    if (typeof value === 'number' || typeof value === 'boolean') {
      const dot = path.lastIndexOf('.');
      out.push({
        path,
        leaf: key,
        group: dot < 0 ? '' : path.slice(0, dot),
        category: path.slice(0, path.indexOf('.') < 0 ? path.length : path.indexOf('.')),
        kind: typeof value === 'number' ? 'number' : 'boolean',
        defaultValue: value,
        timing: balanceTiming(path),
      });
    } else if (typeof value === 'object') {
      walk(value, path, out);
    }
  }
}

/** CONFIG + BUILDING_DEFS 전부. 차단 목록 항목은 애초에 들어오지 않는다. */
export function buildFields(): BalanceField[] {
  const out: BalanceField[] = [];
  walk(CONFIG_DEFAULTS, '', out);
  walk(BUILDING_DEF_DEFAULTS, 'buildings', out);
  return out;
}

/** 건물 정의 묶음의 이름은 config.ts 주석이 아니라 건물 이름·설명에서 온다. */
export function groupLabel(groupPath: string, comments: Record<string, KeyComment>): { title: string; note?: string } {
  const segments = groupPath.split('.');
  if (segments[0] === 'buildings' && segments.length >= 2) {
    const def = (BUILDING_DEF_DEFAULTS as Record<string, { name: string; desc: string } | undefined>)[segments[1]];
    if (def) {
      const suffix = segments.length > 2 ? ` › ${segments.slice(2).join(' › ')}` : '';
      return { title: `${def.name}${suffix}`, note: segments.length > 2 ? undefined : def.desc };
    }
  }
  const comment = comments[groupPath];
  return { title: groupPath || '(최상위)', note: comment?.above ?? comment?.side };
}

export function categoryLabel(id: string, comments: Record<string, KeyComment>): string {
  if (id === 'buildings') return '건물 정의';
  const note = comments[id]?.above ?? comments[id]?.side;
  if (!note) return id;
  // 섹션 주석의 첫 조각만 — 사이드바는 좁다. 전문은 묶음 머리(group-note)에 그대로 나온다.
  const head = note.split('—')[0].trim().slice(0, 18).trim();
  return head ? `${id} · ${head}` : id;
}

export function fieldComment(field: BalanceField, comments: Record<string, KeyComment>): string | undefined {
  const own = comments[field.path];
  if (!own) return undefined;
  return [own.side, own.above].filter(Boolean).join(' — ');
}

/** 검색 대상 문자열 — 경로와 한글 주석을 함께 훑는다. */
export function searchText(field: BalanceField, comments: Record<string, KeyComment>): string {
  const parts = [field.path, fieldComment(field, comments) ?? ''];
  const groupComment = comments[field.group];
  if (groupComment) parts.push(groupComment.above ?? '', groupComment.side ?? '');
  if (field.category === 'buildings') {
    const type = field.path.split('.')[1];
    const def = (BUILDING_DEF_DEFAULTS as Record<string, { name: string; desc: string } | undefined>)[type];
    if (def) parts.push(def.name, def.desc);
  }
  return parts.join(' ').toLowerCase();
}
