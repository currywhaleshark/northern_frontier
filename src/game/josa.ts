export type JosaPair = '이/가' | '을/를' | '과/와' | '은/는' | '으로/로';

function finalConsonantIndex(text: string): number {
  const syllable = [...text.trim()].reverse().find(character => {
    const code = character.charCodeAt(0);
    return code >= 0xac00 && code <= 0xd7a3;
  });
  if (!syllable) return 0;
  return (syllable.charCodeAt(0) - 0xac00) % 28;
}

export function selectJosa(text: string, pair: JosaPair): string {
  const finalIndex = finalConsonantIndex(text);
  if (pair === '으로/로') return finalIndex > 0 && finalIndex !== 8 ? '으로' : '로';
  const [withFinal, withoutFinal] = pair.split('/');
  return finalIndex > 0 ? withFinal : withoutFinal;
}

export function withJosa(text: string, pair: JosaPair): string {
  return `${text}${selectJosa(text, pair)}`;
}
