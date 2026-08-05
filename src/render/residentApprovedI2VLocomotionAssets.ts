import type {
  Gender,
  JobId,
  LifeStage,
  ReligiousVocation,
  SpecialResidentId,
} from '../game/types';
import type { MilitiaWeaponSpriteId } from './militiaWeaponAssets';
import approvedI2VManifest from './residentApprovedI2VLocomotionManifest.json';

interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AnimationRow {
  frames: number;
  fps: number;
  durations_ms: number[];
  loop: boolean;
}

interface ApprovedI2VSourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

const standardRows = approvedI2VManifest.frame_layout.rows as Record<string, FrameRect[]>;
const highDefinitionRows =
  approvedI2VManifest.high_definition_frame_layout.rows as Record<string, FrameRect[]>;
const animationRows = approvedI2VManifest.animation.rows as Record<string, AnimationRow>;

const JOB_IDENTITIES: Partial<Record<JobId, string>> = {
  woodSplitter: 'wood_splitter',
  farmer: 'farmer',
  miller: 'miller',
  builder: 'builder',
  fisher: 'fisher',
  hauler: 'hauler',
  herbalist: 'herbalist',
  physician: 'physician',
  curer: 'curer',
  potter: 'potter',
  smith: 'smith',
  miner: 'miner',
  charcoalBurner: 'charcoal_burner',
  herder: 'herder',
  hunter: 'hunter',
  tanner: 'tanner',
  weaver: 'weaver',
  powderMaker: 'powder_maker',
  clerk: 'clerk',
  watchman: 'watchman',
  undertaker: 'undertaker',
  teacher: 'teacher',
};

const MILITIA_IDENTITIES: Record<MilitiaWeaponSpriteId | 'unarmed', string> = {
  unarmed: 'militia_unarmed',
  spears: 'militia_spear',
  hornBows: 'militia_horn_bow',
  muskets: 'militia_musket',
};

const SPECIAL_IDENTITIES: Partial<Record<SpecialResidentId, string>> = {
  mudang: 'shaman_named_wolhyang',
  nosung: 'monk_named_haeun',
  exiledScholar: 'exiled_scholar_yun',
  jurchenWarrior: 'jurchen_warrior_aragae',
  tigerHunter: 'tiger_hunter_bakdolgae',
  geomancer: 'geomancer_heosaeng',
  uinyeo: 'uinyeo_dansim',
  runawaySmith: 'runaway_smith_maksoe',
  interpreter: 'interpreter_baesugyeom',
  hangwae: 'hangwae_sayaka',
};

const YOUTH_IDENTITIES: Partial<Record<JobId, string>> = {
  idle: 'idle',
  hauler: 'hauler',
  farmer: 'farmer',
  woodSplitter: 'wood_splitter',
  herder: 'herder',
};

export const RESIDENT_APPROVED_I2V_SHEETS = {
  standard: {
    src: approvedI2VManifest.game_input,
  },
  highDefinition: {
    src: approvedI2VManifest.high_definition_game_input,
  },
  bodyHeight: approvedI2VManifest.display.bodyHeight,
} as const;

function identityFor(
  job: JobId,
  militiaWeapon?: MilitiaWeaponSpriteId,
): string | null {
  if (job === 'militia') return MILITIA_IDENTITIES[militiaWeapon ?? 'unarmed'];
  return JOB_IDENTITIES[job] ?? null;
}

function rowName(
  job: JobId,
  gender: Gender,
  militiaWeapon: MilitiaWeaponSpriteId | undefined,
  moving: boolean,
  special?: SpecialResidentId,
  stage?: LifeStage | null,
  religiousVocation?: ReligiousVocation,
): string | null {
  if (special) {
    const identity = SPECIAL_IDENTITIES[special];
    return identity ? `${identity}_${moving ? 'walk' : 'idle'}` : null;
  }
  if (religiousVocation) {
    const vocation = religiousVocation === 'shaman'
      ? 'shaman'
      : stage != null
        ? 'novice'
        : 'monk';
    return `religious_${vocation}_${gender}_${moving ? 'walk' : 'idle'}`;
  }
  if (stage === 'youth') {
    const identity = YOUTH_IDENTITIES[job];
    return identity
      ? `youth_${identity}_${gender}_${moving ? 'walk' : 'idle'}`
      : null;
  }
  const identity = identityFor(job, militiaWeapon);
  return identity ? `${identity}_${gender}_${moving ? 'walk' : 'idle'}` : null;
}

function frameAtElapsed(row: AnimationRow, elapsedMs: number): number {
  const cycleDuration = row.durations_ms.reduce((sum, duration) => sum + duration, 0);
  if (cycleDuration <= 0) return 0;
  let remaining = Math.max(0, elapsedMs) % cycleDuration;
  for (let index = 0; index < row.durations_ms.length; index++) {
    if (remaining < row.durations_ms[index]) return index;
    remaining -= row.durations_ms[index];
  }
  return 0;
}

export function isApprovedI2VJob(job: JobId): boolean {
  return job === 'militia' || JOB_IDENTITIES[job] != null;
}

export function approvedI2VSourceRect(
  job: JobId,
  gender: Gender,
  militiaWeapon: MilitiaWeaponSpriteId | undefined,
  moving: boolean,
  elapsedMs: number,
  highDefinition: boolean,
  special?: SpecialResidentId,
  stage?: LifeStage | null,
  religiousVocation?: ReligiousVocation,
): ApprovedI2VSourceRect | null {
  const row = rowName(
    job,
    gender,
    militiaWeapon,
    moving,
    special,
    stage,
    religiousVocation,
  );
  if (!row) return null;
  const layout = highDefinition ? highDefinitionRows[row] : standardRows[row];
  const animation = animationRows[row];
  if (!layout || !animation || layout.length === 0) return null;
  const frame = frameAtElapsed(animation, elapsedMs);
  const rect = layout[frame % layout.length] ?? layout[0];
  return { sx: rect.x, sy: rect.y, sw: rect.w, sh: rect.h };
}
