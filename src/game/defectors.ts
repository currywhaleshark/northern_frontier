export const RESIDENT_ORIGINS = {
  nimacha: '니마차 우디캐',
  holaon: '홀라온 야인',
  courtDeserter: '조정 이탈병',
} as const;

// 단종실록의 두만강 유역 여진인 명부에 남은 조선식 음차를 바탕으로 한 게임용 이름풀이다.
// 여성 인명 기록이 희소해 성별별 이름을 임의로 만들지 않고 귀순 여진 주민 전체가 같은 풀을 쓴다.
export const NORTHERN_DEFECTOR_NAMES = [
  '이시내', '야음부', '주장개', '야당지', '도은도', '소응거',
  '어허리', '거구지', '도도', '소라', '다내', '도을온',
  '도리두', '수을두', '노요고', '보리', '두이응거', '도하',
  '대이내', '사지개', '두이', '두소', '어거두', '후시거',
  '호시로', '탁다', '보양개', '말응가거', '노청개', '나하주',
  '가하자', '지소거', '거을가', '소시우', '파을도', '파을대',
  '하칭개', '다롱개', '다을화', '아을도개', '두승거', '우을금',
  '귀이파', '아을파', '가수거', '가소', '대두', '다하내',
] as const;

export type ResidentOriginProfile = keyof typeof RESIDENT_ORIGINS | 'other' | 'local';

const NORTHERN_ORIGINS = new Set([
  '오도리 씨족',
  '올량합 부락',
  '골간 우디캐',
  RESIDENT_ORIGINS.nimacha,
  RESIDENT_ORIGINS.holaon,
]);

export const JURCHEN_FACTION_NAMES = [
  '오도리 씨족',
  '올량합 부락',
  '골간 우디캐',
  RESIDENT_ORIGINS.nimacha,
  RESIDENT_ORIGINS.holaon,
] as const;

export function isJurchenFactionName(name: string): boolean {
  return (JURCHEN_FACTION_NAMES as readonly string[]).includes(name);
}

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
