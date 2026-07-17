export const RESIDENT_ORIGINS = {
  nimacha: '니마차 우디캐',
  holaon: '홀라온 야인',
  courtDeserter: '조정 이탈병',
} as const;

export type ResidentOriginProfile = keyof typeof RESIDENT_ORIGINS | 'other' | 'local';

const NORTHERN_ORIGINS = new Set([
  '오도리 씨족',
  '올량합 부락',
  '골간 우디캐',
  RESIDENT_ORIGINS.nimacha,
  RESIDENT_ORIGINS.holaon,
]);

export function residentOriginProfile(origin?: string): ResidentOriginProfile {
  if (!origin) return 'local';
  if (origin === RESIDENT_ORIGINS.nimacha) return 'nimacha';
  if (origin === RESIDENT_ORIGINS.holaon) return 'holaon';
  if (origin === RESIDENT_ORIGINS.courtDeserter) return 'courtDeserter';
  return 'other';
}

export function isNorthernDefectorOrigin(origin?: string): boolean {
  return origin != null && NORTHERN_ORIGINS.has(origin);
}

export function residentOriginLabel(origin?: string): string {
  const profile = residentOriginProfile(origin);
  if (profile === 'courtDeserter') return '조정 이탈병';
  return origin ? `${origin} 출신` : '개척지 주민';
}
