// 편집기 ↔ dev 서버 데이터 왕복. 저장하면 서버가 코드젠까지 돌린다.
export type OverrideValue = number | boolean;

export interface KeyComment {
  above?: string;
  side?: string;
}

export interface BalancePayload {
  overrides: Record<string, OverrideValue>;
  comments: Record<string, KeyComment>;
}

export async function loadBalance(): Promise<BalancePayload> {
  const response = await fetch('/api/balance');
  if (!response.ok) throw new Error(`데이터를 읽지 못했습니다 (${response.status})`);
  const raw = await response.json();
  return { overrides: raw.overrides ?? {}, comments: raw.comments ?? {} };
}

export async function saveOverrides(overrides: Record<string, OverrideValue>): Promise<void> {
  const response = await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ overrides }),
  });
  const result = await response.json().catch(() => ({ ok: false, error: '응답을 읽지 못했습니다' }));
  if (!response.ok || !result.ok) throw new Error(result.error ?? '저장에 실패했습니다');
}
