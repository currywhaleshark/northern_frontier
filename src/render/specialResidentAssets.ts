import type { SpecialResidentId } from '../game/types';

export const SPECIAL_RESIDENT_SHEET = {
  residentWidth: 28,
  spriteHeight: 40,
  columns: 4,
  rows: 1,
  src: '/assets/special-residents-v1.png',
} as const;

// 전용 스프라이트가 있는 인물만 등록한다. 없는 특수 주민은 직업 스프라이트로 폴백.
const COLUMNS: Partial<Record<SpecialResidentId, number>> = {
  mudang: 0,
  nosung: 1,
  exiledScholar: 2,
  jurchenWarrior: 3,
};

export function specialResidentSourceRect(id: SpecialResidentId) {
  const column = COLUMNS[id];
  if (column == null) return null;
  return {
    sx: column * SPECIAL_RESIDENT_SHEET.residentWidth,
    sy: 0,
    sw: SPECIAL_RESIDENT_SHEET.residentWidth,
    sh: SPECIAL_RESIDENT_SHEET.spriteHeight,
  };
}
