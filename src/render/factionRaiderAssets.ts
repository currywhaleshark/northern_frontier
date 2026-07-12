export const FACTION_RAIDER_SHEET = {
  spriteWidth: 56,
  spriteHeight: 40,
  columns: 6,
  rows: 1,
  src: '/assets/faction-raiders-v1.png',
} as const;

const COLUMNS: Record<string, number> = {
  '오도리 씨족': 0,
  '올량합 부락': 1,
  '골간 우디캐': 2,
  '니마차 우디캐': 3,
  '홀라온 야인': 4,
  '변경 마적': 5,
};

export function factionRaiderSourceRect(faction: string | undefined) {
  const column = faction == null ? undefined : COLUMNS[faction];
  if (column == null) return null;
  return {
    sx: column * FACTION_RAIDER_SHEET.spriteWidth,
    sy: 0,
    sw: FACTION_RAIDER_SHEET.spriteWidth,
    sh: FACTION_RAIDER_SHEET.spriteHeight,
  };
}
