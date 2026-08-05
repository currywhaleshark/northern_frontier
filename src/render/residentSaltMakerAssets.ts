import type { Gender } from '../game/types';

export type SaltMakerSpriteState = 'idle' | 'walk' | 'seaIntake' | 'kilnWork';

interface ResidentSaltMakerSheet {
  src: string;
  frameSize: number;
}

interface ResidentSaltMakerSheetPair {
  standard: ResidentSaltMakerSheet;
  highDefinition: ResidentSaltMakerSheet;
}

export const RESIDENT_SALT_MAKER_DISPLAY_FRAME_SIZE = 40;

export const RESIDENT_SALT_MAKER_SHEETS: Record<Gender, ResidentSaltMakerSheetPair> = {
  male: {
    standard: { src: '/assets/resident-salt-maker-male-v2.png', frameSize: 64 },
    highDefinition: { src: '/assets/resident-salt-maker-male-hd-v2.png', frameSize: 128 },
  },
  female: {
    standard: { src: '/assets/resident-salt-maker-female-v2.png', frameSize: 64 },
    highDefinition: { src: '/assets/resident-salt-maker-female-hd-v2.png', frameSize: 128 },
  },
};

const STATE_ROW: Record<SaltMakerSpriteState, number> = {
  idle: 0,
  walk: 1,
  seaIntake: 2,
  kilnWork: 3,
};

const FRAME_DURATION_MS: Record<SaltMakerSpriteState, number> = {
  idle: 200,
  walk: 200,
  seaIntake: 200,
  kilnWork: 200,
};

export function saltMakerSourceRect(
  gender: Gender,
  state: SaltMakerSpriteState,
  elapsedMs: number,
  highDefinition = false,
) {
  const pair = RESIDENT_SALT_MAKER_SHEETS[gender];
  const frameSize = (highDefinition ? pair.highDefinition : pair.standard).frameSize;
  const frame = Math.floor(Math.max(0, elapsedMs) / FRAME_DURATION_MS[state]) % 4;
  return {
    sx: frame * frameSize,
    sy: STATE_ROW[state] * frameSize,
    sw: frameSize,
    sh: frameSize,
  };
}
