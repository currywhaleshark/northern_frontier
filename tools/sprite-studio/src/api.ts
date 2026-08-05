// 스튜디오 ↔ dev 서버 데이터 왕복. 저장하면 서버가 코드젠까지 돌린다.
export type RegistryName =
  | 'display-metrics'
  | 'work-anchors'
  | 'building-effects'
  | 'worker-slots'
  | 'building-shadows';

export interface SpriteDisplayMetric {
  scale: number;
  dy: number;
}

/** toolTip*은 게임이 읽지 않는다 — 코드젠이 버리고 JSON에만 남는 정합 표시용 값이다. */
export interface WorkAnchorEdit {
  offsetX: number;
  offsetY: number;
  facing: 1 | -1 | 0;
  toolTipX?: number;
  toolTipY?: number;
}

export interface EffectEmitterEdit {
  kind: 'chimneySmoke' | 'fireSparks' | 'craftGlint' | 'serviceGlow' | 'windowGlow';
  /** 화면 좌표는 x = bx + size * fx + dx (세로도 같은 꼴) */
  fx: number;
  fy: number;
  dx: number;
  dy: number;
  scale: number;
  when: 'working' | 'night' | 'winterHeating' | 'always';
}

export interface ShadowSettingsEdit {
  mode: 'standard' | 'courtyard' | 'none';
  groundFrac: number;
  anchorDepthFrac: number;
  lengthScale: number;
}

/** 등록하지 않은 건물이 도는 값. 컴포넌트 모듈에 두면 react-refresh가 전체 새로고침을 건다. */
export const DEFAULT_SHADOW: ShadowSettingsEdit = {
  mode: 'standard', groundFrac: 0, anchorDepthFrac: 0, lengthScale: 1,
};

export interface WorkerSlotEdit {
  /** 건물 좌상단 기준 타일 오프셋 — 근무자가 실제로 걸어가는 칸이다. */
  tileDX: number;
  tileDY: number;
  offsetX: number;
  offsetY: number;
  facing: 1 | -1 | 0;
}

/** 자리를 실제로 따르는 건물 — generate_registries.mjs의 SLOT_BUILDING_TYPES와 같아야 한다. */
export const SLOT_BUILDING_TYPES: readonly string[] = ['woodShed'];

export interface StudioData {
  'display-metrics': Record<string, SpriteDisplayMetric>;
  'work-anchors': Record<string, WorkAnchorEdit>;
  'building-effects': Record<string, EffectEmitterEdit[]>;
  'worker-slots': Record<string, WorkerSlotEdit[]>;
  'building-shadows': Record<string, ShadowSettingsEdit>;
}

export interface AssetAuditEntry {
  name: string;
  src: string;
  bytes: number;
  dimensions: { width: number; height: number } | null;
  status: 'used' | 'dynamic' | 'unused';
  reason: string;
  references: string[];
  replacement: string | null;
}

export interface AssetAudit {
  generatedAt: string;
  scope: string;
  assets: AssetAuditEntry[];
  summary: { total: number; used: number; dynamic: number; unused: number; unusedBytes: number };
}

function stripComment<T extends Record<string, unknown>>(value: T): T {
  const { _comment: _ignored, ...rest } = value;
  return rest as T;
}

export async function loadStudioData(): Promise<StudioData> {
  const response = await fetch('/api/data');
  if (!response.ok) throw new Error(`데이터를 읽지 못했습니다 (${response.status})`);
  const raw = await response.json();
  return {
    'display-metrics': stripComment(raw['display-metrics'] ?? {}),
    'work-anchors': stripComment(raw['work-anchors'] ?? {}),
    'building-effects': stripComment(raw['building-effects'] ?? {}),
    'worker-slots': stripComment(raw['worker-slots'] ?? {}),
    'building-shadows': stripComment(raw['building-shadows'] ?? {}),
  };
}

export async function saveRegistry(registry: RegistryName, data: unknown): Promise<void> {
  const response = await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ registry, data }),
  });
  const result = await response.json().catch(() => ({ ok: false, error: '응답을 읽지 못했습니다' }));
  if (!response.ok || !result.ok) throw new Error(result.error ?? '저장에 실패했습니다');
}

export async function loadAssetAudit(): Promise<AssetAudit> {
  const response = await fetch('/api/assets/audit');
  if (!response.ok) throw new Error(`자산 감사를 읽지 못했습니다 (${response.status})`);
  return response.json();
}

export async function archiveUnusedAssets(names: string[]): Promise<{ moved: string[]; archiveDir: string }> {
  const response = await fetch('/api/assets/archive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names }),
  });
  const result = await response.json().catch(() => ({ ok: false, error: '응답을 읽지 못했습니다' }));
  if (!response.ok || !result.ok) throw new Error(result.error ?? '자산 정리에 실패했습니다');
  return result;
}
