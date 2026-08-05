type JosaPair = '이/가' | '을/를' | '과/와' | '은/는' | '으로/로';

// 숫자로 끝나면 읽는 소리의 받침을 따른다: 0영 1일 2이 3삼 4사 5오 6육 7칠 8팔 9구
// (0 = 받침 없음, 8 = ㄹ, 그 외 양수 = 기타 받침)
const DIGIT_FINAL_INDEX = [1, 8, 0, 1, 0, 0, 1, 8, 8, 0];

function finalConsonantIndex(text: string): number {
  const trimmed = text.trim();
  const lastCode = trimmed.charCodeAt(trimmed.length - 1);
  if (lastCode >= 0x30 && lastCode <= 0x39) return DIGIT_FINAL_INDEX[lastCode - 0x30];
  const syllable = [...trimmed].reverse().find(character => {
    const code = character.charCodeAt(0);
    return code >= 0xac00 && code <= 0xd7a3;
  });
  if (!syllable) return 0;
  return (syllable.charCodeAt(0) - 0xac00) % 28;
}

function selectJosa(text: string | number, pair: JosaPair): string {
  const finalIndex = finalConsonantIndex(String(text));
  if (pair === '으로/로') return finalIndex > 0 && finalIndex !== 8 ? '으로' : '로';
  const [withFinal, withoutFinal] = pair.split('/');
  return finalIndex > 0 ? withFinal : withoutFinal;
}

export function withJosa(text: string | number, pair: JosaPair): string {
  return `${text}${selectJosa(text, pair)}`;
}
