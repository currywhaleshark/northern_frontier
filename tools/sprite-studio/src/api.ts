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

export interface StudioData {
  'display-metrics': Record<string, SpriteDisplayMetric>;
  'work-anchors': Record<string, WorkAnchorEdit>;
  'building-effects': Record<string, unknown[]>;
  'worker-slots': Record<string, unknown[]>;
  'building-shadows': Record<string, unknown>;
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
