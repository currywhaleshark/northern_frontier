export const TACTICAL_CHARACTER_SHEET = {
  residentWidth: 84,
  mountedWidth: 168,
  spriteHeight: 120,
  residentColumns: 10,
  rows: 2,
  src: '/assets/tactical/folk-characters-tactical-v1.png',
} as const;

export const TACTICAL_MILITIA_SHEET = {
  residentWidth: 84,
  spriteHeight: 120,
  columns: 3,
  rows: 2,
  src: '/assets/tactical/militia-weapons-tactical-v1.png',
} as const;

export const TACTICAL_RAIDER_SHEET = {
  spriteWidth: 168,
  spriteHeight: 120,
  columns: 6,
  src: '/assets/tactical/faction-raiders-tactical-v1.png',
} as const;

const RAIDER_COLUMNS: Record<string, number> = {
  '오도리 씨족': 0,
  '올량합 부락': 1,
  '골간 우디캐': 2,
  '니마차 우디캐': 3,
  '홀라온 야인': 4,
  '변경 마적': 5,
};

export function tacticalRaiderColumn(faction: string): number | null {
  return RAIDER_COLUMNS[faction] ?? null;
}
