const HUNT_CENTER = 64;
const HUNT_DOT_RADIUS = 37;
const HUNT_SECTOR_ANGLES = [-90, 30, 150] as const;

function rounded(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export function polarPoint(
  cx: number,
  cy: number,
  radius: number,
  degrees: number,
): [number, number] {
  const radians = degrees * Math.PI / 180;
  return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
}

export function annularSectorPath(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startDegrees: number,
  endDegrees: number,
): string {
  const outerStart = polarPoint(cx, cy, outerRadius, startDegrees);
  const outerEnd = polarPoint(cx, cy, outerRadius, endDegrees);
  const innerEnd = polarPoint(cx, cy, innerRadius, endDegrees);
  const innerStart = polarPoint(cx, cy, innerRadius, startDegrees);
  const sweep = ((endDegrees - startDegrees) % 360 + 360) % 360;
  const largeArc = sweep > 180 ? 1 : 0;
  return [
    `M ${rounded(outerStart[0])} ${rounded(outerStart[1])}`,
    `A ${rounded(outerRadius)} ${rounded(outerRadius)} 0 ${largeArc} 1 ${rounded(outerEnd[0])} ${rounded(outerEnd[1])}`,
    `L ${rounded(innerEnd[0])} ${rounded(innerEnd[1])}`,
    `A ${rounded(innerRadius)} ${rounded(innerRadius)} 0 ${largeArc} 0 ${rounded(innerStart[0])} ${rounded(innerStart[1])}`,
    'Z',
  ].join(' ');
}

export function huntDotPosition(
  sectorIndex: number,
  slotIndex: number,
  slotCount: number,
  radius = HUNT_DOT_RADIUS,
): [number, number] {
  const sectorAngle = HUNT_SECTOR_ANGLES[Math.max(0, Math.min(2, sectorIndex))];
  const centeredSlot = slotIndex - (Math.max(1, slotCount) - 1) / 2;
  return polarPoint(HUNT_CENTER, HUNT_CENTER, radius, sectorAngle + centeredSlot * 16);
}

export function encirclementDash(percent: number, radius = 58): string {
  const circumference = 2 * Math.PI * radius;
  const visible = circumference * Math.max(0, Math.min(100, percent)) / 100;
  return `${rounded(visible)} ${rounded(circumference - visible)}`;
}
