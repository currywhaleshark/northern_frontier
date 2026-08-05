import type { Gender, JobId } from '../game/types';
import type { MilitiaWeaponSpriteId } from './militiaWeaponAssets';
import commonLocomotionManifest from './residentCommonLocomotionManifest.json';

interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CommonLocomotionSourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

interface AnimationRow {
  frames: number;
  fps: number;
  loop: boolean;
  durations_ms: number[];
}

const frameRows = commonLocomotionManifest.frame_layout.rows as Record<string, FrameRect[]>;
const animationRows = commonLocomotionManifest.animation.rows as Record<string, AnimationRow>;
const jobIdentities = commonLocomotionManifest.job_identities as Partial<Record<JobId, string>>;
const militiaIdentities = commonLocomotionManifest.militia_identities as Record<
  MilitiaWeaponSpriteId | 'unarmed',
  string
>;

export const RESIDENT_COMMON_LOCOMOTION_SHEET = {
  frameSize: commonLocomotionManifest.cell.width,
  displaySize: 40,
  columns: 3,
  rows: Object.keys(frameRows).length,
  src: commonLocomotionManifest.game_input,
} as const;

function rowName(
  job: JobId,
  gender: Gender,
  militiaWeapon?: MilitiaWeaponSpriteId,
): string | null {
  const identity = job === 'militia'
    ? militiaIdentities[militiaWeapon ?? 'unarmed']
    : jobIdentities[job];
  return identity ? `${identity}-${gender}` : null;
}

function frameAtElapsed(row: AnimationRow, elapsedMs: number): number {
  const durations = row.durations_ms;
  const cycleDuration = durations.reduce((sum, duration) => sum + duration, 0);
  if (cycleDuration <= 0) return 0;
  let remaining = Math.max(0, elapsedMs) % cycleDuration;
  for (let index = 0; index < durations.length; index++) {
    if (remaining < durations[index]) return index;
    remaining -= durations[index];
  }
  return 0;
}

export function isCommonLocomotionJob(job: JobId): boolean {
  return job === 'militia' || jobIdentities[job] != null;
}

export function commonLocomotionSourceRect(
  job: JobId,
  gender: Gender,
  militiaWeapon: MilitiaWeaponSpriteId | undefined,
  moving: boolean,
  elapsedMs: number,
): CommonLocomotionSourceRect | null {
  const row = rowName(job, gender, militiaWeapon);
  if (!row) return null;
  const layout = frameRows[row];
  const animation = animationRows[row];
  if (!layout || !animation || layout.length === 0) return null;
  const frame = moving ? frameAtElapsed(animation, elapsedMs) : 0;
  const rect = layout[frame % layout.length] ?? layout[0];
  return { sx: rect.x, sy: rect.y, sw: rect.w, sh: rect.h };
}
