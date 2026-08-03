// config.ts 원문에서 키별 주석을 긁어온다 — 주석 99줄이 편집기의 도움말이 된다.
//
// 줄 단위 스캐너다. 정확한 파서가 아니라 **도움말 수확기**라, 못 읽은 키는 주석 없이 두고 넘어간다
// (설계서 §7-3: 파싱 실패는 기능 저하로 처리, 차단 아님). 한 줄에 여러 키가 있는 인라인 객체는
// 첫 키만 잡는다 — 그런 줄에는 어차피 설계 의도 주석이 붙지 않는다.
import { readFileSync } from 'node:fs';

const KEY_LINE = /^\s*(?:(['"])([^'"]+)\1|([A-Za-z_$][\w$]*)|(\d+))\s*:\s*(.*)$/;

/** 따옴표 밖의 `//` 위치. 없으면 -1. */
function commentStart(line) {
  let quote = null;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quote) {
      if (char === '\\') { index++; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === '/' && line[index + 1] === '/') return index;
  }
  return -1;
}

/** 따옴표 밖의 여닫이 괄호 수지. */
function braceDelta(code) {
  let quote = null;
  let delta = 0;
  for (let index = 0; index < code.length; index++) {
    const char = code[index];
    if (quote) {
      if (char === '\\') { index++; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === '{' || char === '[') delta++;
    else if (char === '}' || char === ']') delta--;
  }
  return delta;
}

/**
 * @returns {Record<string, { above?: string, side?: string }>} 경로 키 → 주석
 */
export function parseConfigComments(sourcePath) {
  let source;
  try {
    source = readFileSync(sourcePath, 'utf8');
  } catch {
    return {};
  }
  const comments = {};
  const stack = [];
  let pending = [];

  for (const raw of source.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (trimmed === '') { pending = []; continue; }
    if (trimmed.startsWith('//')) { pending.push(trimmed.replace(/^\/\/\s?/, '')); continue; }
    if (trimmed.startsWith('}') || trimmed.startsWith(']')) {
      // 닫는 줄. 이 줄에서 더 닫힌 만큼 스택을 되감는다.
      const delta = braceDelta(trimmed);
      for (let count = 0; count < -delta && stack.length > 0; count++) stack.pop();
      pending = [];
      continue;
    }

    const cut = commentStart(raw);
    const code = cut < 0 ? raw : raw.slice(0, cut);
    const side = cut < 0 ? '' : raw.slice(cut + 2).trim();
    const match = KEY_LINE.exec(code);
    if (!match) { pending = []; continue; }

    const key = match[2] ?? match[3] ?? match[4];
    const rest = (match[5] ?? '').trim();
    const path = [...stack, key].join('.');
    const above = pending.join(' ').trim();
    if (above || side) comments[path] = { ...(above ? { above } : {}), ...(side ? { side } : {}) };
    pending = [];

    // `key: {` / `key: [`로 열고 같은 줄에서 닫지 않으면 한 단계 들어간다.
    if ((rest.startsWith('{') || rest.startsWith('[')) && braceDelta(code) > 0) stack.push(key);
  }
  return comments;
}
