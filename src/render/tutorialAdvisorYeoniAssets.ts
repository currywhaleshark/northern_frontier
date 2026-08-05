import tutorialAdvisorYeoniManifest from './tutorialAdvisorYeoniSpriteManifest.json';

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

export type TutorialAdvisorYeoniState = 'idle' | 'walk' | 'jige_walk' | 'work';

interface TutorialAdvisorYeoniSourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

const animationRows = tutorialAdvisorYeoniManifest.animation.rows as Record<
  TutorialAdvisorYeoniState,
  AnimationRow
>;
const standardRows = tutorialAdvisorYeoniManifest.frame_layout.rows as Record<
  TutorialAdvisorYeoniState,
  FrameRect[]
>;
const highDefinitionRows = tutorialAdvisorYeoniManifest.high_definition_frame_layout.rows as Record<
  TutorialAdvisorYeoniState,
  FrameRect[]
>;

export const TUTORIAL_ADVISOR_YEONI_SHEETS = {
  standard: { src: tutorialAdvisorYeoniManifest.game_input },
  highDefinition: { src: tutorialAdvisorYeoniManifest.high_definition_game_input },
  displayWidth: tutorialAdvisorYeoniManifest.frame_layout.cellWidth,
  displayHeight: tutorialAdvisorYeoniManifest.frame_layout.cellHeight,
} as const;

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

export function tutorialAdvisorYeoniSourceRect(
  state: TutorialAdvisorYeoniState,
  elapsedMs: number,
  highDefinition: boolean,
): TutorialAdvisorYeoniSourceRect {
  const layout = highDefinition ? highDefinitionRows[state] : standardRows[state];
  const frame = frameAtElapsed(animationRows[state], elapsedMs);
  const rect = layout[frame % layout.length] ?? layout[0];
  return { sx: rect.x, sy: rect.y, sw: rect.w, sh: rect.h };
}
