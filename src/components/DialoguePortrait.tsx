import type { DialoguePresentation } from '../game/types';

interface Props {
  dialogue: DialoguePresentation;
  compact?: boolean;
}

function speakerMark(speaker: string): string {
  const letters = [...speaker.trim()];
  return letters[0] ?? '?';
}

export function DialoguePortrait({ dialogue, compact = false }: Props) {
  const className = `dialogue-portrait${compact ? ' compact' : ''}`;
  if (dialogue.portrait) {
    return (
      <img
        className={className}
        src={dialogue.portrait.src}
        alt={dialogue.portrait.alt}
        style={dialogue.portrait.position ? { objectPosition: dialogue.portrait.position } : undefined}
      />
    );
  }
  return (
    <div className={`${className} placeholder`} role="img" aria-label={`${dialogue.speaker} 임시 초상`}>
      {speakerMark(dialogue.speaker)}
    </div>
  );
}
